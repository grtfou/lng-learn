# 接手開發清單

## 每次開始或中斷後恢復

1. 讀根目錄 `AGENTS.md`、`PROGRESS.md`。
2. 查看 `git status`、`git log -7 --oneline`，從最後未完成項目續做。
3. 閱讀 README、PLAN、ARCHITECTURE、API、VALIDATION。
4. 每個明確小階段更新 PROGRESS 並 commit；不重做已完成工作。

## 已交付的切片

P0：建庫 → 語音／文字 → demo／手動預覽 → 校閱保存 → 回想／揭示／四評分 → SQLite 保存完整 FSRS 與歷史。

P1.1：輸入後即時取得正式免費字典 → 明確選一個義項 → 繁中釋義人工確認 → 詞義、逐欄來源與錄音 metadata 原子保存。apple 真實字典資料、bank 金融／河岸義項已在瀏覽器操作保存；API／UI／遷移 fixture 測試通過。詳見 VALIDATION 與 DICTIONARY。

- 預設 `CONTENT_PROVIDER=free-dictionary`，輸入後才查詢，啟動不預抓字典／音檔；demo 為可選離線示範。免 key，僅英文詞義。
- UI／API 可選 demo 或 manual，不需等待來源服務。查詢失敗、重試與切換詞義保留人工文字；切義後仍需人工核對。
- `DictionaryProvider`／FreeDictionaryProvider 可注入 fetch，測試不連正式服務。字典 10 秒逾時、256 KiB 上限、拒絕重新導向，429 在程序內遵守 Retry-After，無自動重試。
- v2 migration 自動先建 SQLite 一致性備份，保留舊卡、版本、排程與 logs；舊內容保留 demo 摘要，逐欄標 legacy。
- 同庫 `normalized lemma + senseKey` 唯一；無正式義項共用 manual 桶。字典 key 由詞形／詞性／英文 gloss 雜湊，上游改寫會換鍵，沒有跨版本同義辨識。
- API 的 source 為 P0 相容摘要；真正出處看 fieldSources 與 sense.pronunciations，不可只看 source.kind。
- 字典未提供繁中翻譯、個別作者或可靠口音／錄音者資訊。未知值保持 null／unspecified／unverified；音檔只有 metadata，未下載／播放。

## 下一個獨立任務：P1.2

P1.1 已完成，AGENTS.md 的下一步已更新為 P1.2。下一次先依 PROGRESS 確認工作，再閱讀 PLAN 的 P1.2「媒體、例句與原創內容」。

建議任務：

> 保留 P0/P1.1 資料與行為，依 PLAN 完成一個 P1.2 可驗收小切片。先建立 SQLite 工作生命週期與逐欄狀態／取消／重試／重啟恢復，使用固定 fixture，再串接一個來源。媒體需獨立授權 metadata、HTTPS 網域允許清單、每跳重導向／私網檢查、大小／MIME／逾時限制、本機快取與 hash。不要只用遠端 URL 冒充離線保存，也不要把未驗證錄音者標為母語人士。付費 LLM 或新服務啟用前先確認必要設定，不自行註冊。每個小階段 commit、更新 PROGRESS、文件與計畫。

預期接點：

- shared/contracts 與 provenance：延伸欄位工作狀態、媒體契約，不丟掉現有出處與人工修改旗標。
- providers：新增例句／圖片／可選生成來源；字典回應中有例句只代表字典附帶內容，不代表獨立 ExampleProvider 已完成。
- db/migrations：追加 v3 以後，不改 v1／v2；worker lease 與重啟恢復須可測試。
- Library／新服務：媒體與 note 關聯交易；內容變動不得重設 FSRS。
- Vocabulary／FieldSources／Study：逐欄工作進度、取消／重試、圖片候選、可信標示與快取播放。

## 維持的規則與限制

- 本機單人使用，無帳號、同步或公開部署。
- 只在使用者確認時保存；任何來源失敗仍可手動建卡。
- 不覆寫人工修改；舊回應不能覆蓋新狀態。
- 複習先回想、揭示、評分；原 requestId 重試與 version 樂觀鎖繼續保留。
- 未到期卡不提前出現，內容編輯不清除卡片／歷史。
- 目前刷新仍會遺失未保存草稿，P1.3 才做自動暫存；本次只有同畫面重查保留。
- 麥克風、系統發音、錄音播放與多瀏覽器完整相容性尚未實機驗證。
- 無已存單字編輯／刪除、搜尋、匯出／匯入、背景工作、每日限額與撤銷評分。

## 執行與驗證

- Node 24.14+ 的 24.x、pnpm 11.25.0，根目錄 `pnpm install --frozen-lockfile` → `pnpm check`。
- 目前 Codex shell 需 prepend `/Users/quokka/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` 至 PATH；已驗證 Node 24.19.0，不需改系統設定。
- `tsup.config.ts` 的 removeNodeProtocol=false 必須保留，否則正式 node:sqlite import 可能被錯誤改寫。
- UI／測試用暫存 DATABASE_PATH，不碰使用者 data/；正式建置仍需實際啟動與瀏覽器操作。
- Vite proxy 預設 3001，更改 PORT 時同步代理。伺服器僅綁 127.0.0.1。
- 全部 provider 測試固定 fixture；DICTIONARY 與 fixtures/README 區分真實快照、手寫資料與外部不穩定性。
