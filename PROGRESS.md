# 實作進度

更新：2026-10-22（Asia/Taipei）

## 本次範圍與目前步驟

P1.1 已交付；目前依使用者要求進行審核、bug fixing 與 PR。本次不擴大到 P1.2。使用者補充：一般輸入應即時從網路取得內容，不預載完整字典或音檔。

## 已完成

- 依序閱讀專案文件、檢查 Git。起始 working tree 乾淨，P0 為 b1039f1；沒有既存 PROGRESS.md。
- 正式 DictionaryProvider／Free Dictionary API v2 轉接，免 key、runtime schema、10 秒逾時、256 KiB 回應限制、拒絕重新導向。
- 固定 fixture（apple 節錄、bank 完整真實快照、明確標示的手寫多義資料）；所有自動測試不呼叫正式服務。
- 詞義／詞性／IPA／未知口音／錄音 metadata 與逐欄來源、授權、作者、時間、人工修改旗標。
- migration v2：一致性備份、舊內容與 demo 摘要保留、逐欄 legacy、詞義去重；不更動舊卡、version、FSRS 或 review logs。失敗回滾與重跑均有測試。
- 明確選義、人工繁中釋義、來源檢視、同字重查保留草稿；改詞形清除舊義項。手動／demo 路徑不連網。
- 字典查無詞、限流、逾時、離線與格式錯誤仍可手動保存；Retry-After 從收到回應起計算並有期限後恢復測試。
- `pnpm install --frozen-lockfile` 成功；首輪 check 為 53 項，審核後最新 `pnpm check` 成功（57 項測試、型別、前後端建置）。
- 正式建置使用 /tmp 暫存 SQLite，瀏覽器真實查詢 apple、bank，保存金融／河岸兩義、手動未知詞、翻卡與評分。
- 瀏覽器實遇一次格式錯誤，重試成功且人工釋義／例句保留。重啟並改回 demo 後四張卡、逐欄來源與複習排程仍在。
- 桌面 1280 與窄版 390 驗證（內容寬度扣除捲軸後 1265／375），無水平溢位。

## 小階段提交

- d0d8c3c：建立 P1.1 範圍與進度檢查點。
- 812d9d4：字典轉接、義項與逐欄來源契約，40 項測試。
- adc487b：遷移、備份、詞義去重與來源持久化，43 項測試。
- dfebe25：詞義選擇、來源介面、人工修改與離線備援，51 項測試。
- e111a45：真實 bank fixture、限流恢復、錯誤狀態／文案修正與瀏覽器驗證，53 項測試。
- 文件完成提交：README、PLAN 勾選 P1.1、API／架構／驗證與交接，AGENTS 下一步更新為 P1.2；提交識別碼見 git log。

## 尚未完成／下一步

下一次從 PLAN P1.2 開始，先閱讀 AGENTS.md、本檔、git status 與最近 7 筆 commits，不重做 P1.1。建議下一個小切片為 SQLite 工作生命週期與逐欄取消／重試／重啟恢復，再依序處理媒體與其他內容來源。

後續仍未實作：媒體下載／快取／真人錄音播放、獨立例句／圖片／生成 providers、草稿自動保存、已存內容編輯／刪除、備份 UI／匯入匯出、每日限額與撤銷評分。詳見 PLAN／HANDOFF。

## 問題與重要決策

- Node 24.19.0 位於 `/Users/quokka/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`，此 shell 執行 pnpm 前 prepend 該路徑至 PATH；pnpm 11.25.0。未更動系統設定。
- 依使用者新要求，預設 free-dictionary，只有輸入後才即時查詢；demo／手動可選，不預載完整字典或音檔。繁中釋義由使用者填寫，沒有付費服務或 key。
- 未提供可靠口音／個別作者／錄音者資訊時保持未知；不靠檔名推測美式，也不把音檔說成已驗證的母語人士錄音。音檔仍僅 metadata。
- 無正式 sense ID，key 雜湊詞形／詞性／英文 gloss；上游改寫文字會換鍵，需人工確認。
- 早期 curl 的 bank 404／530 後，正式建置與 Node fetch 已成功取得四詞條真實資料；上游仍偶有格式錯誤，不能宣稱可用性保證。
- 語音辨識、系統發音、錄音播放未做實機聲音驗證；沒有以單元測試宣稱硬體通過。
- 所有測試／UI DB 位於記憶體或 /tmp，沒有寫入使用者 data/。


## 審核與 PR 進度

- 已讀 AGENTS／本檔、git status 與最近 7 筆 commits；起始 working tree 乾淨。
- P0 PR #1 已 squash 合併。確認 origin/main 與原 b1039f1 內容完全相同後，在 `codex/dictionary-provenance` 由 origin/main 重放六筆 P1.1 提交；原分支保留，避免 PR 重複整份 P0。
- 新分支提交：a35f4f0（進度）、d76ab2a（字典契約）、ad540c4（遷移）、dd2e96b（介面）、f37c4a7（驗證修正）、33f1dc8（文件）。上節 hash 為重放前的歷史紀錄。
- 審核以三個回歸測試重現：改詞後沿用舊 IPA／例句、重查缺少已選義項時選單顯示錯義、切換來源後未套用新來源的未修改欄位。
- 已修正：改詞清除未修改教材；人工欄位保留；重查保留的義項有明確選項；切換來源只帶入人工欄位。相關 UI／字典 29 項測試通過。
- fd358bf：修正三個草稿一致性問題並新增三個回歸測試。
- 預設即時查詢已完成；新增「啟動不查網路、輸入才查詢」測試，手動／demo 不連外。pnpm check 通過 57 項測試，dist 沒有測試字典 JSON／音檔或 bank fixture 文字。
- cf566cc：預設輸入後即時查詢，啟動不預抓；測試與文件同步按需取得原則。
- 瀏覽器複驗已完成：未設 provider 的正式建置即時查 apple、改詞清除自動教材、來源切換保留人工釋義、切回字典並選義保存成功。沒有其他阻擋提交的審核發現。
- 92bd4e8：記錄審核與按需取得驗證。
- 已推送 `codex/dictionary-provenance`，建立正式 PR #2：https://github.com/grtfou/lng-learn/pull/2 （base=main）。
- 目前：本次審核、修正、提交與 PR 已完成，沒有待處理的審核阻擋項。後續依 PR 回饋處理；下一個產品切片仍為 P1.2。
