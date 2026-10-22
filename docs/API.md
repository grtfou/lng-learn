# P0 HTTP 契約

開發 API：`http://127.0.0.1:3001/api`。前端使用同源 `/api`（Vite 代理），JSON request body 需 `Content-Type: application/json`，上限 64 KiB。無登入、cookie 或 API key。單人 loopback 使用；不提供開放 CORS。

| Method | 路徑 | 輸入 | 回應 |
| --- | --- | --- | --- |
| GET | `/health` | 無 | `{ status: 'ok', contentProvider: 'demo' }` |
| GET | `/decks` | 無 | `{ decks: Deck[] }` |
| POST | `/decks` | `{ name, language?: 'en-US' }` | `201 Deck` |
| POST | `/drafts` | `{ word, language: 'en-US' }` | `Draft`，不保存 |
| GET | `/decks/:deckId/notes` | 無 | `{ notes: Note[] }` |
| POST | `/decks/:deckId/notes` | `{ content: Content }` | `201 Note`，同時建一張新卡 |
| GET | `/decks/:deckId/review` | 無 | `{ cards: ReviewCard[], nextDueAt: string \| null }` |
| POST | `/cards/:cardId/reviews` | `{ requestId, rating, version }` | `ReviewResult` |

完整欄位型別與驗證以 `packages/shared/src/contracts.ts` 為準。P0 不提供更新／刪除／匯出／工作狀態 API，後續需新增契約與測試。

## 物件

```ts
type Deck = {
  id: string; name: string; language: 'en-US'; createdAt: string;
  total: number; due: number;
};
type Content = {
  word: string; ipa: string; meaning: string;
  example: string; exampleTranslation: string;
  phrases: string[]; story: string;
  image: Asset | null; audio: Asset | null;
  source: { kind: 'demo' | 'manual' | 'retrieved' | 'generated';
    provider: string; url: string | null; license: string | null };
};
type Asset = {
  url: string; // HTTPS；P0 預留，尚未下載或渲染
  attribution: string; license: string;
  kind: 'image' | 'human-audio' | 'synthetic-audio';
};
type Draft = { content: Content; status: 'demo' | 'needs-input'; notice: string };
type Note = { id: string; deckId: string; content: Content; createdAt: string };
type ReviewCard = {
  id: string; noteId: string; version: number; dueAt: string; content: Content;
};
type ReviewResult = {
  requestId: string; cardId: string; dueAt: string; version: number;
};
```

內容來源目前為整卡 metadata，正式多 provider 會遷移為各欄來源。若使用者修改 demo，仍保留 demo 來源標籤表示出處，不代表所有文字仍和 fixture 完全一致。

## 建庫與保存

```json
{ "name": "日常英語", "language": "en-US" }
```

名稱 trim 後 1–80 字元；word 1–100、ipa 最多 200、meaning／example／translation 各最多 2000、story 最多 4000、phrases 最多 10 個且各最多 300 字元。草稿允許 meaning 為空，保存時釋義必填。

`POST /drafts` 可以用 `apple`、`journey`、`curious` 得到 demo。未知單字仍回 200，但 `status=needs-input` 與空釋義，不捏造字典結果。保存時將整份校閱後 `content` 包在物件內：

```ts
const draft = await fetch('/api/drafts', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ word: 'apple', language: 'en-US' }),
}).then(response => response.json());
// 使用者在 UI 校閱 draft.content 之後才送出：
await fetch(`/api/decks/${deckId}/notes`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: draft.content }),
});
```

目前同一單字庫的正規化詞（NFKC、小寫、摺疊空白）唯一；跨庫允許重複。P1 才改為詞義層級。

## 複習與重試

佇列只回 due <= serverNow，最多 100 張；沒有到期卡時 `cards=[]`，nextDueAt 是未來最早時間，無未來卡則 null。新卡立即到期。P0 回傳整份 content，UI 自行遮蔽答案，不是保密／考試系統。

揭示答案後傳送：

```json
{
  "requestId": "263ed764-765d-4d26-8076-9fc30e7b914e",
  "rating": 3,
  "version": 0
}
```

`requestId` 為客戶端產生的 UUID；rating 只接受整數 1/2/3/4。version 必須與佇列的卡片版本相同。評分時間由伺服器生成；不接受客戶端任意回填歷史時間。

成功回傳未來 dueAt 與遞增 version。重送完全相同的 requestId、card、rating、原 version，回原結果；requestId 不可重新產生再盲目重試。不同內容重用識別碼回 409。另一分頁造成版本變更則應重新取佇列。

## 錯誤

應用程式錯誤格式：

```json
{ "error": { "code": "DUPLICATE_WORD", "message": "這個單字已存在此單字庫" } }
```

| 狀態 | code | 處理 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 顯示 message 與可選 details，讓使用者修正 |
| 403 | HOST_FORBIDDEN / ORIGIN_FORBIDDEN | 拒絕非允許本機主機／來源 |
| 404 | DECK_NOT_FOUND / CARD_NOT_FOUND | 回到列表或重新取佇列 |
| 409 | DUPLICATE_WORD | 保留草稿，提示單字已存在 |
| 409 | STALE_CARD | 重新載入卡片，不盲目重送 |
| 409 | CARD_NOT_DUE | 更新佇列，顯示下次時間 |
| 409 | IDEMPOTENCY_CONFLICT | 保留原請求資料並提示衝突 |
| 413 / 415 等 | BAD_REQUEST | 內容過大／格式不支援 |
| 500 | INTERNAL_ERROR | 一般錯誤訊息；細節只在伺服器日誌 |

未知 API 路徑回傳 404 與 `NOT_FOUND`。網路中斷與非 JSON 回應由前端顯示錯誤；P1 再細分離線、供應商與伺服器錯誤。

## P1 預定契約

`PATCH /notes/:id`、`DELETE /notes/:id`、單字庫編輯、`POST /generation-jobs`、`GET /generation-jobs/:id`、取消／重試單一欄位、`GET /media/:id`、備份與匯入、撤銷評分。這些名稱為施工起點，實作時先定 request／response schema 與相容策略再新增 endpoint。
