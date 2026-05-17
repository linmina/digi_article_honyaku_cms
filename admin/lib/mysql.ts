import mysql from 'mysql2/promise';
import { getDb } from './db';

interface ProjectDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  tableName: string;
  tagPublishFlag: number;
  valPublishOpen: string;
  tagTitle: number;
  tagDescription: number;
  tagContent: number;
  tagMemo: number;
  cmsBaseUrl: string;
  previewUrlPattern: string;
  publicUrlPattern: string;
}

export function getProjectDbConfig(projectId: number): ProjectDbConfig {
  const db = getDb();
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!p) throw new Error('Project not found');
  return {
    host: p.db_host,
    port: p.db_port || 3306,
    database: p.db_name,
    user: p.db_user,
    password: p.db_password,
    tableName: p.db_table_name || 'gtnArticles',
    tagPublishFlag: p.db_tag_publish_flag || 23,
    valPublishOpen: p.db_val_publish_open || '24',
    tagTitle: p.db_tag_title || 26,
    tagDescription: p.db_tag_description || 27,
    tagContent: p.db_tag_content || 29,
    tagMemo: p.db_tag_memo || 51,
    cmsBaseUrl: p.cms_base_url || '',
    previewUrlPattern: p.preview_url_pattern || '',
    publicUrlPattern: p.public_url_pattern || '',
  };
}

export async function getMysqlConnection(config: ProjectDbConfig) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    charset: 'utf8mb4',
  });
}

async function fetchTreeNames(conn: mysql.Connection, tableName: string, ids: string[]): Promise<Record<string, string>> {
  const numericIds = ids.filter((v) => v && /^\d+$/.test(v));
  if (numericIds.length === 0) return {};
  try {
    const treeTable = `tree_${tableName}`;
    const placeholders = numericIds.map(() => '?').join(',');
    const [rows] = await conn.query(
      `SELECT id, name FROM ${treeTable} WHERE id IN (${placeholders})`,
      numericIds
    );
    const map: Record<string, string> = {};
    for (const r of rows as any[]) {
      map[String(r.id)] = r.name || '';
    }
    return map;
  } catch {
    return {};
  }
}

export interface PublishedArticle {
  id: number;
  name: string;
  title: string;
  description: string;
  content: string;
  memo: string;
  image: string;
  publishFlag: string;
  articleType: string;
  articleStatus: string;
  cmsUrl: string;
  previewUrl: string;
  publicUrl: string;
  contentSnippets: string[];
  hitCount: number;
}

function countOccurrences(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(kw, pos)) !== -1) {
    count++;
    pos += kw.length;
  }
  return count;
}

function extractSnippets(html: string, keyword: string, maxSnippets = 3, contextChars = 60): string[] {
  if (!html || !keyword) return [];
  const text = html.replace(/<[^>]+>/g, '');
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  const snippets: string[] = [];
  let startFrom = 0;
  while (snippets.length < maxSnippets) {
    const idx = lower.indexOf(kw, startFrom);
    if (idx === -1) break;
    const start = Math.max(0, idx - contextChars);
    const end = Math.min(text.length, idx + kw.length + contextChars);
    let snippet = '';
    if (start > 0) snippet += '...';
    snippet += text.slice(start, end);
    if (end < text.length) snippet += '...';
    snippets.push(snippet);
    startFrom = idx + kw.length;
  }
  return snippets;
}

export interface AllArticle extends PublishedArticle {
  publishStatus: string;
}

export async function fetchAllArticles(
  projectId: number,
  search?: string,
  page: number = 1,
  limit: number = 50
): Promise<{ articles: AllArticle[]; total: number }> {
  const config = getProjectDbConfig(projectId);
  if (!config.host || !config.database) {
    throw new Error('DB設定が未設定です');
  }

  const conn = await getMysqlConnection(config);
  try {
    const table = config.tableName;
    const tagTable = `${table}Tag`;
    const offset = (page - 1) * limit;

    let countSql = `
      SELECT COUNT(DISTINCT a.id) as cnt
      FROM ${table} a
    `;
    let dataSql = `
      SELECT
        a.id,
        a.name,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS title,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS description,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS content,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS memo,
        MAX(CASE WHEN t.tagId = 28 THEN t.value END) AS image,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS publish_flag,
        MAX(CASE WHEN t.tagId = 5 THEN t.value END) AS article_type,
        MAX(CASE WHEN t.tagId = 46 THEN t.value END) AS article_status
      FROM ${table} a
      LEFT JOIN ${tagTable} t ON a.id = t.itemId
    `;

    const countParams: any[] = [];
    const dataParams: any[] = [
      config.tagTitle, config.tagDescription, config.tagContent, config.tagMemo,
      config.tagPublishFlag,
    ];

    if (search) {
      const searchCondition = `
        WHERE EXISTS (
          SELECT 1 FROM ${tagTable} ts
          WHERE ts.itemId = a.id
          AND ts.tagId IN (?, ?, ?)
          AND ts.value LIKE ?
        )
      `;
      countSql += searchCondition;
      dataSql += searchCondition;
      const searchParam = `%${search}%`;
      countParams.push(config.tagTitle, config.tagDescription, config.tagContent, searchParam);
      dataParams.push(config.tagTitle, config.tagDescription, config.tagContent, searchParam);
    }

    if (search) {
      dataSql += ` GROUP BY a.id, a.name ORDER BY (
        SELECT COALESCE(
          (LENGTH(ts2.value) - LENGTH(REPLACE(LOWER(ts2.value), LOWER(?), ''))) / GREATEST(LENGTH(?), 1),
          0
        )
        FROM ${tagTable} ts2
        WHERE ts2.itemId = a.id AND ts2.tagId = ?
      ) DESC, a.id DESC LIMIT ? OFFSET ?`;
      dataParams.push(search, search, config.tagContent, limit, offset);
    } else {
      dataSql += ` GROUP BY a.id, a.name ORDER BY a.id DESC LIMIT ? OFFSET ?`;
      dataParams.push(limit, offset);
    }

    const [countRows] = await conn.query(countSql, countParams);
    const total = (countRows as any[])[0]?.cnt || 0;

    const [rows] = await conn.query(dataSql, dataParams);
    const rawRows = rows as any[];

    // Collect all tag value IDs that need name resolution
    const tagValueIds = new Set<string>();
    for (const r of rawRows) {
      if (r.publish_flag) tagValueIds.add(r.publish_flag);
      if (r.article_type) tagValueIds.add(r.article_type);
      if (r.article_status) tagValueIds.add(r.article_status);
    }
    const tagNames = await fetchTreeNames(conn, config.tableName, Array.from(tagValueIds));

    const articles = rawRows.map((r) => {
      const contentText = (r.content || '').replace(/<[^>]+>/g, '');
      const hitCount = search ? countOccurrences(contentText, search) : 0;
      return {
        id: r.id,
        name: r.name || '',
        title: r.title || '',
        description: r.description || '',
        content: r.content || '',
        memo: r.memo || '',
        image: r.image || '',
        publishFlag: tagNames[r.publish_flag] || r.publish_flag || '',
        articleType: tagNames[r.article_type] || r.article_type || '',
        articleStatus: tagNames[r.article_status] || r.article_status || '',
        cmsUrl: config.cmsBaseUrl ? `${config.cmsBaseUrl.replace(/\/$/, '')}/${r.id}` : '',
        previewUrl: config.previewUrlPattern ? config.previewUrlPattern.replace('{id}', String(r.id)) : '',
        publicUrl: config.publicUrlPattern ? config.publicUrlPattern.replace('{id}', String(r.id)) : '',
        contentSnippets: search ? extractSnippets(r.content || '', search) : [],
        hitCount,
        publishStatus: r.publish_flag === config.valPublishOpen ? '公開' : r.publish_flag ? '非公開' : '未設定',
      };
    });

    return { articles, total };
  } finally {
    await conn.end();
  }
}

export async function fetchPublishedArticles(
  projectId: number,
  search?: string,
  page: number = 1,
  limit: number = 50
): Promise<{ articles: PublishedArticle[]; total: number }> {
  const config = getProjectDbConfig(projectId);
  if (!config.host || !config.database) {
    throw new Error('DB設定が未設定です');
  }

  const conn = await getMysqlConnection(config);
  try {
    const table = config.tableName;
    const tagTable = `${table}Tag`;
    const offset = (page - 1) * limit;

    // Get published article IDs
    let countSql = `
      SELECT COUNT(DISTINCT a.id) as cnt
      FROM ${table} a
      INNER JOIN ${tagTable} t_pub ON a.id = t_pub.itemId AND t_pub.tagId = ? AND t_pub.value = ?
    `;
    let dataSql = `
      SELECT
        a.id,
        a.name,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS title,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS description,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS content,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS memo,
        MAX(CASE WHEN t.tagId = 28 THEN t.value END) AS image,
        MAX(CASE WHEN t.tagId = ? THEN t.value END) AS publish_flag,
        MAX(CASE WHEN t.tagId = 5 THEN t.value END) AS article_type,
        MAX(CASE WHEN t.tagId = 46 THEN t.value END) AS article_status
      FROM ${table} a
      INNER JOIN ${tagTable} t_pub ON a.id = t_pub.itemId AND t_pub.tagId = ? AND t_pub.value = ?
      LEFT JOIN ${tagTable} t ON a.id = t.itemId
    `;

    const countParams: any[] = [config.tagPublishFlag, config.valPublishOpen];
    const dataParams: any[] = [
      config.tagTitle, config.tagDescription, config.tagContent, config.tagMemo,
      config.tagPublishFlag,
      config.tagPublishFlag, config.valPublishOpen,
    ];

    if (search) {
      const searchCondition = `
        AND EXISTS (
          SELECT 1 FROM ${tagTable} ts
          WHERE ts.itemId = a.id
          AND ts.tagId IN (?, ?, ?)
          AND ts.value LIKE ?
        )
      `;
      countSql += searchCondition;
      dataSql += searchCondition;
      const searchParam = `%${search}%`;
      countParams.push(config.tagTitle, config.tagDescription, config.tagContent, searchParam);
      dataParams.push(config.tagTitle, config.tagDescription, config.tagContent, searchParam);
    }

    if (search) {
      dataSql += ` GROUP BY a.id, a.name ORDER BY (
        SELECT COALESCE(
          (LENGTH(ts2.value) - LENGTH(REPLACE(LOWER(ts2.value), LOWER(?), ''))) / GREATEST(LENGTH(?), 1),
          0
        )
        FROM ${tagTable} ts2
        WHERE ts2.itemId = a.id AND ts2.tagId = ?
      ) DESC, a.id DESC LIMIT ? OFFSET ?`;
      dataParams.push(search, search, config.tagContent, limit, offset);
    } else {
      dataSql += ` GROUP BY a.id, a.name ORDER BY a.id DESC LIMIT ? OFFSET ?`;
      dataParams.push(limit, offset);
    }

    const [countRows] = await conn.query(countSql, countParams);
    const total = (countRows as any[])[0]?.cnt || 0;

    const [rows] = await conn.query(dataSql, dataParams);
    const rawRows = rows as any[];

    const tagValueIds = new Set<string>();
    for (const r of rawRows) {
      if (r.publish_flag) tagValueIds.add(r.publish_flag);
      if (r.article_type) tagValueIds.add(r.article_type);
      if (r.article_status) tagValueIds.add(r.article_status);
    }
    const tagNames = await fetchTreeNames(conn, config.tableName, Array.from(tagValueIds));

    const articles = rawRows.map((r) => {
      const contentText = (r.content || '').replace(/<[^>]+>/g, '');
      const hitCount = search ? countOccurrences(contentText, search) : 0;
      return {
        id: r.id,
        name: r.name || '',
        title: r.title || '',
        description: r.description || '',
        content: r.content || '',
        memo: r.memo || '',
        image: r.image || '',
        publishFlag: tagNames[r.publish_flag] || r.publish_flag || '',
        articleType: tagNames[r.article_type] || r.article_type || '',
        articleStatus: tagNames[r.article_status] || r.article_status || '',
        cmsUrl: config.cmsBaseUrl ? `${config.cmsBaseUrl.replace(/\/$/, '')}/${r.id}` : '',
        previewUrl: config.previewUrlPattern ? config.previewUrlPattern.replace('{id}', String(r.id)) : '',
        publicUrl: config.publicUrlPattern ? config.publicUrlPattern.replace('{id}', String(r.id)) : '',
        contentSnippets: search ? extractSnippets(r.content || '', search) : [],
        hitCount,
      };
    });

    return { articles, total };
  } finally {
    await conn.end();
  }
}
