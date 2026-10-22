# HTTP 契約（P0 + P1.1）

開發 API：`http://127.0.0.1:3001/api`。前端使用同源 `/api`（Vite 代理），JSON request body 需 `Content-Type: application/json`，上限 64 KiB。無登入、cookie 或 API key，單人 loopback 使用；不開放 CORS。

| Method | 路徑 | 輸入 | 回應 |
| --- | --- | --- | --- |
| GET | `/health` | 無 | `{ status: 'ok', contentProvider: 'demo' \| 'free-dictionary' }` |
| GET | `/decks` | 無 | `{ decks: Deck[] }` |
| POST | `/decks` | `{ name, language?: 'en-US' }` | `201 Deck` |
| POST | `/drafts` | `{ word, language: 'en-US', mode?: 'configured' \| 'demo' \| 'manual' }` | `Draft`，不保存 |
| GET | `/decks/:deckId/notes` | 無 | `{ notes: Note[] }` |
| POST | `/decks/:deckId/notes` | `{ content: Content }` | `201 Note`，同交易建卡、詞義與逐欄來源 |
| GET | `/decks/:deckId/review` | 無 | `{ cards: ReviewCard[], nextDueAt: string \| null }` |
| POST | `/cards/:cardId/reviews` | `{ requestId, rating, version }` | `ReviewResult` |

完整 runtime 輸入驗證與型別以 `packages/shared/src/contracts.ts` 為準。未提供已存內容更新／刪除／匯出／工作狀態 API。

## 建庫、預覽與保存

名稱 trim 後 1–80 字；word 1–100，ipa 最多 200，meaning／example／exampleTranslation 各 2000，story 最多 4000，phrases 最多 10 個、每個最多 300 字。草稿允許空釋義，保存時釋義必填。

`mode` 預設 configured，依伺服器 `CONTENT_PROVIDER` 使用 demo 或 free-dictionary；demo、manual 明確不連外。正式字典回英文義項，不翻譯繁中。使用者先選一個義項（UI 不預選），填寫確認過的繁中釋義後才保存；也可明確選擇手動義項。預覽不寫入 SQLite。

```ts
type Content = {
  word: string; ipa: string; meaning: string;
  example: string; exampleTranslation: string; phrases: string[]; story: string;
  image: Asset | null; audio: Asset | null; // 本階段仍為 null，媒體下載／播放屬 P1.2
  source: { kind: 'demo' | 'manual' | 'retrieved' | 'generated';
    provider: string; url: string | null; license: string | null }; // P0 相容摘要
  sense: Sense | null;
  fieldSources: Partial<Record<ContentField, FieldSource>>;
};
type ContentField = 'word' | 'ipa' | 'meaning' | 'example' | 'exampleTranslation'
  | 'phrases' | 'story' | 'image' | 'audio' | 'sense';
type FieldSource = {
  kind: 'demo' | 'manual' | 'retrieved' | 'generated' | 'legacy';
  provider: string; url: string | null; author: string | null;
  license: string | null; licenseUrl: string | null; retrievedAt: string | null;
  model: string | null; promptVersion: string | null;
  userEdited: boolean; status: 'pending' | 'ready' | 'missing' | 'error';
};
type Sense = {
  key: string; lemma: string; partOfSpeech: string; gloss: string; // gloss 是英文
  accent: 'en-US' | 'en-GB' | 'unspecified'; source: FieldSource;
  pronunciations: {
    ipa: string; accent: 'en-US' | 'en-GB' | 'unspecified'; source: FieldSource;
    recording: { url: string; source: FieldSource; speaker: 'unverified' } | null;
  }[];
};
type DictionarySense = Sense & { example: string };
type Draft = {
  content: Content; status: 'demo' | 'needs-input' | 'dictionary'; notice: string;
  senses?: DictionarySense[];
  issue?: { code: 'NOT_FOUND' | 'RATE_LIMITED' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'UNAVAILABLE';
    retryAfterSeconds?: number };
};
```

來源連結使用 HTTPS（P0 相容 `source.url` 除外）。缺少音標、口音、作者或音檔就標示缺漏／未知；錄音 metadata 的授權與文字分開，不聲稱錄音者是母語人士。正式資料來源與版本限制見 [DICTIONARY.md](DICTIONARY.md)。

`source` 僅供舊版相容，逐欄 `fieldSources` 才是實際出處。人工編輯保留原出處並設 userEdited=true；未擷取的繁中釋義等欄位標為 manual。省略 sense／fieldSources 的舊請求會補 null／預設來源，儲存與讀取回應包含全部十個欄位的 metadata。舊 note 遷移為 legacy 欄位來源，原 demo 摘要保留。

保存時將校閱的整份 `content` 包在 `{ content }` 中，不傳候選清單。sense.lemma 必須與 word 正規化後相同；改詞形應清除 sense 或重新選義。正規化為 NFKC、小寫、摺疊空白；唯一鍵為 `deck + normalized lemma + sense.key`。無 sense 時使用 `manual` 桶，故舊資料、demo 與手動同詞仍去重；正式不同義項可同庫並存。上游改寫英文 gloss 會產生新鍵，需使用者校閱。相同 key 衝突回 409 DUPLICATE_WORD，不清草稿。

查無資料、429、逾時、格式錯誤與離線皆回 HTTP 200 的 needs-input 草稿與 issue；不冒充 demo 成功。10 秒逾時、256 KiB 上限、拒絕重新導向；無自動重試。429 的 Retry-After 儲存在 provider 程序內，期限前再次查詢直接回 RATE_LIMITED；重啟不持久保存限流狀態。前端保留編輯內容與已選義項，來源恢復後可手動重試。

## 其他物件

```ts
type Deck = { id: string; name: string; language: 'en-US'; createdAt: string; total: number; due: number };
type Note = { id: string; deckId: string; content: Content; createdAt: string };
type Asset = { url: string; attribution: string; license: string;
  kind: 'image' | 'human-audio' | 'synthetic-audio' }; // HTTPS，預留契約，未下載或渲染
type ReviewCard = { id: string; noteId: string; version: number; dueAt: string; content: Content };
type ReviewResult = { requestId: string; cardId: string; dueAt: string; version: number };
```

## 複習與重試

佇列只回 due <= serverNow、最多 100 張，nextDueAt 為未來最早到期時間或 null，新卡立即到期。UI 先回想、揭示後才展示詞義／來源與評分；API 回整份 content，並非考試保密系統。

送 `{ requestId: UUID, rating: 1|2|3|4, version: number }`。伺服器決定 UTC 時間與 FSRS 排程，在同一交易更新卡片及寫 log。重送相同 requestId、card、rating、原 version 回相同結果，不能重建 requestId 盲目重試。不同內容重用識別碼或另一分頁使用舊 version 回 409；後者應重新載入佇列。

## 錯誤

應用程式錯誤：`{ error: { code, message, details? } }`。

| 狀態 | code | 處理 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 修正輸入；含改詞後義項不符 |
| 403 | HOST_FORBIDDEN / ORIGIN_FORBIDDEN | 拒絕非允許本機主機／來源 |
| 404 | DECK_NOT_FOUND / CARD_NOT_FOUND / NOT_FOUND | 回列表或重新載入 |
| 409 | DUPLICATE_WORD | 同庫同義項已存在，保留草稿 |
| 409 | STALE_CARD / CARD_NOT_DUE | 更新佇列，不盲目重送 |
| 409 | IDEMPOTENCY_CONFLICT | 保留原請求並提示衝突 |
| 413 / 415 等 | BAD_REQUEST | 過大或格式不支援 |
| 500 | INTERNAL_ERROR | 一般訊息；細節只在 server log |

## 後續契約（尚未實作）

已存內容 PATCH／DELETE、generation-jobs、media、備份與匯入、撤銷評分等依後續計畫另定 request／response 與相容策略。
