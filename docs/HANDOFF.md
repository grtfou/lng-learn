# 接手開發清單

## 先讀哪些檔案

1. 根目錄 `AGENTS.md`、`README.md`。
2. `docs/PLAN.md` 的流程、P1 工作順序與驗收。
3. `docs/ARCHITECTURE.md` 的資料表與交易不變條件。
4. `docs/API.md` 與 `packages/shared/src/contracts.ts`。
5. `docs/VALIDATION.md` 瞭解本次已驗證與未驗證邊界。

## 已存在的可操作切片

全新資料庫 → 建立英語單字庫 → 文字或受支援的瀏覽器語音輸入 → demo／手動內容預覽 → 修改並確認儲存 → 翻卡 → 評分 → SQLite 保存 FSRS 狀態 → 重開程式繼續使用。

只內建 `apple`、`journey`、`curious` 的音標、釋義、例句、片語與故事。沒有外部 API key、沒有任何正式字典／圖片／錄音／LLM 呼叫。其他字能手動建卡。無刪除、已存卡片編輯、匯入匯出或雲端功能。

## 下一個建議任務：P1.1

可以將下列內容交給 Codex：

> 閱讀 AGENTS.md、docs/PLAN.md、ARCHITECTURE.md、API.md 與 VALIDATION.md，完成 P1.1「正式字典、義項與欄位來源」。先檢查目前實作與測試，保留 demo 模式及使用者現有資料。評估並選擇一個有明確授權與文件的字典來源，先建立固定測試 fixture，再實作 DictionaryProvider、詞義選擇與欄位來源 migration。不要接付費 LLM，也不要一次實作整個 P1。apple 應取得可追溯字典資料，bank 能選擇不同義項；查無結果、逾時、429、格式錯誤時仍可手動填寫且不清稿。完成後執行 pnpm check、測操作流程並更新文件。

預期修改接點：

- `packages/shared/src/contracts.ts`：加入 sense、partOfSpeech、field source schemas，保留舊資料讀取或明確遷移。
- `apps/server/src/providers/`：新增字典 contract、fixture provider 與正式來源轉接；server 驗證外部回應。
- `apps/server/src/db/migrations.ts`：追加 v2，不修改 v1；去重鍵改為 deck+lemma+senseKey。
- `apps/server/src/services/library.ts`：儲存詞義與來源、既有 demo 回填、交易不變條件。
- `apps/web/src/features/Vocabulary.tsx`：辨識文字確認、詞義選擇與逐欄出處。
- `tests/`：相容 migration、多義字、來源 metadata、外部服務失敗與手動備援。

## 維持的行為

- 不需帳號、外部資料庫或付費憑證即可啟動 demo。
- 來源失敗時使用者仍能存已確認的詞與釋義。
- 內容預覽不自動保存；正式內容需讓使用者校閱。
- 不把合成語音標成人類錄音；缺 IPA／音檔時誠實表示缺漏。
- 卡片與 review log 不能被內容更新清除或重設。
- 同一評分重試使用原 requestId；不同分頁的 version 衝突不能盲目覆蓋。
- 複習遵守先回想、揭示、評分，未到期不提前出現。

## 技術注意事項

- Node 24.x 的內建 `node:sqlite` 不需要另外安裝 `sqlite` 或 `sqlite3`。tsup 設定的 `removeNodeProtocol: false` 必須保留，否則建置產物可能變成錯誤的 `import 'sqlite'`。
- 所有服務從專案根目錄執行，預設資料在 `data/`。測試與 UI 驗證請用獨立暫存 DATABASE_PATH。
- `pnpm check` 會跑型別、測試、建置；正式產物仍需 `pnpm start` 實際啟動確認。
- `tests/ui.test.tsx` 使用 happy-dom 與 React Testing Library，覆蓋慢速列表回應、建立成功狀態與評分重試。保留舊回應失效／合併規則，避免新增功能時重新引入競態。
- `SpeechInput` 與 `ContentProvider` 是目前已存在介面；PLAN 其他介面是下一階段設計，不是已完成檔案。
- 開發 Vite proxy 預設 3001；更動 API 的 PORT 必須同步代理埠。
- P0 前端 view 使用 React local state，刷新會回單字庫。尚無路由、草稿恢復、背景工作或完整會話恢復。
- 套件採精確版本與 lockfile；變更排程套件前先確認歷史資料與參數相容性。

## 暫不擴大範圍

多帳號、公開部署、同步、訂閱付費、Anki 完整格式相容、所有語言、個人化參數最佳化都沒有必要先做。先讓單一語言、單一字典來源、可追溯資料與正確複習流程可靠運作。
