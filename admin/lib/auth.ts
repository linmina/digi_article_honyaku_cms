import bcrypt from 'bcryptjs';
import { getDb } from './db';

export async function verifyUser(username: string, password: string) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, username: user.username, display_name: user.display_name, role: user.role };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function canAccessProject(userId: number, role: string, projectId: number): boolean {
  if (role === 'admin') return true;
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?'
  ).get(userId, projectId);
  return !!row;
}

export function getAccessibleProjects(userId: number, role: string) {
  const db = getDb();
  if (role === 'admin') {
    return db.prepare('SELECT * FROM projects ORDER BY name').all();
  }
  return db.prepare(`
    SELECT p.* FROM projects p
    JOIN user_projects up ON p.id = up.project_id
    WHERE up.user_id = ?
    ORDER BY p.name
  `).all(userId);
}
