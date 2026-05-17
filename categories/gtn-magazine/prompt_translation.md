# 翻訳ルール override — GTN Magazine

GTN マガジン（在日外国人・来日予定者向けの日本生活情報メディア）専用の
翻訳ルール上書き。`prompts/translation-system.md` の汎用ルールに **追加** で
適用する（汎用ルールを否定はしない、補強）。

## 読者像

- **読み手**: 日本在住 or 来日予定の外国人
- **言語レベル**: ビジネスレベル英語、CEFR B2〜C1
- **背景知識**: 日本の生活制度（住民票、印鑑、敷金など）に不慣れ

## トーン

ビジネス・実用ガイド調。フレンドリーすぎず、堅すぎず。
銀行・行政手続きの解説と旅行ガイドが共存するメディアなので、
情報の正確さと読みやすさを両立する。

## 固有名詞・専門用語の英訳テーブル

**公式英語表記がある場合は必ずこれを使う**:

| 日本語                  | 英語表記                          |
| ----------------------- | --------------------------------- |
| マイナンバーカード      | My Number Card                    |
| マイナポータル          | Myna Portal                       |
| ハローワーク            | Hello Work (public job placement) |
| 出入国在留管理庁        | Immigration Services Agency       |
| 国民健康保険            | National Health Insurance         |
| 厚生労働省              | Ministry of Health, Labour and Welfare |
| 在留カード              | Residence Card                    |
| 特定技能                | Specified Skilled Worker          |
| 技能実習                | Technical Intern Training         |
| 出入国管理及び難民認定法 | Immigration Control and Refugee Recognition Act |
| 入管法（略称）           | Immigration Control Act           |
| 在留資格                | Status of Residence               |
| 永住者                  | Permanent Resident                |
| 短期滞在                | Temporary Visitor                 |
| 住民票                  | Certificate of Residence (juminhyo) |
| 印鑑 / はんこ           | personal seal (hanko)             |
| 敷金                    | security deposit (shikikin)       |
| 礼金                    | key money (reikin) — a non-refundable thank-you payment to the landlord |
| 保証人                  | guarantor                         |
| 保証会社                | rent guarantor company            |
| 重要事項説明書          | important matters explanation document |
| 賃貸借契約              | residential lease agreement       |
| マイナンバー            | My Number (Individual Number)     |

## 文化的補足が必要な概念

以下は **初出時に短い英注を必ず付ける**:

- 敷金 / 礼金 / 保証人 / 保証会社（賃貸特有の概念）
- 印鑑 / はんこ（書類への押印文化）
- 住民票 / 戸籍（行政登録の二層構造）
- 確定申告 / 年末調整（税務手続きの違い）
- 国保 / 社保（健康保険の二系統）

例:
- 敷金 → `security deposit (shikikin) — refundable upon move-out minus repair costs`
- 印鑑 → `personal seal (hanko) — some banks accept signatures, but official documents typically require a hanko`

## 婉曲表現の置き換え方針

汎用ルールに準じる。GTN 特有の追加:

| 日本語                        | 自然な英語                            |
| ----------------------------- | ------------------------------------- |
| 当社では〜                    | `We offer ...` / 主語省略             |
| ぜひご相談ください            | `Contact us for details` / `Reach out for help` |
| お気軽にお問い合わせください  | `Feel free to ask` / `Get in touch`   |

## SEO 観点での英語キーワード

直訳ではなく、英語圏で **実際に検索される** クエリに合わせる:

| 日本語キーワード      | 直訳 (NG)            | 英語実検索 (推奨)                   |
| --------------------- | -------------------- | ----------------------------------- |
| 日本で賃貸を借りる    | `rent in Japan`      | `renting an apartment in Japan`     |
| 在留資格の申請        | `apply for visa`     | `applying for a Japan work visa`    |
| 銀行口座開設          | `open bank account`  | `opening a bank account in Japan`   |
| マイナンバー取得      | `get my number`      | `how to get a My Number Card`       |

## CTA / 読者導線

問い合わせ窓口を英訳する際は、その窓口が **多言語対応しているか** 確認:
- 日本語のみ対応 → 「This service is currently available in Japanese only」と明記
- 英語対応あり → 自然な英語 CTA で誘導

## 注意

このカテゴリの prompt は **汎用ルール (prompts/translation-system.md) と
併用する**。Phase 1 翻訳実行時、claude は両方を読み、汎用ルール + GTN
override の合成版を適用すること。汎用ルールと矛盾する場合は **カテゴリ
override が優先**。
