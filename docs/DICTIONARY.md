# P1.1 字典來源決策

日期：2026-10-22。使用 Free Dictionary API v2，免帳號與 API key；由伺服器在使用者輸入後才即時查詢，預設 free-dictionary；啟動不預抓字典或音檔，測試 fixture 不進正式產物。demo 與手動離線路徑仍可明確選擇。

## 選擇依據

[官方文件](https://dictionaryapi.dev/) 提供 `GET https://api.dictionaryapi.dev/api/v2/entries/en/<word>`；[官方原始碼](https://github.com/meetDeveloper/freeDictionaryAPI) 的 GPL-3.0 是服務程式授權，不當作內容授權。正式文字僅接納附有 `license.name`、HTTPS `license.url` 與 `sourceUrls` 的回應，逐欄保留實際授權、來源與 UTC 取得時間。

已取得 apple 真實回應，文字來源 `https://en.wiktionary.org/wiki/apple`，內容標示 CC BY-SA 3.0。需依實際 [授權](https://creativecommons.org/licenses/by-sa/3.0/) 保留署名、授權連結與改動標示；來源檢視提供這些資訊。回應未提供個別作者，儲存 author=null，不捏造作者。上游未提供資料集版本／修訂編號，provider 標示 `free-dictionary:v2`，另保存取得時間；不能重建上游當時的完整資料集。

Kaikki/Wiktionary 結構化資料仍是未來可評估選項；本切片選擇較小的 HTTP 接點，避免先下載完整字典與另建匯入系統。

## 品質與限制

- API 僅提供英文釋義，沒有可信的繁中翻譯。本切片讓使用者明確選義、手動填寫繁中釋義，不自動翻譯。
- API 未提供穩定 sense ID；以 provider、正規化詞形、詞性、原始英文釋義建立 SHA-256 key，排序改動不換鍵；上游釋義文字改動會產生新鍵，需人工確認，不能宣稱跨版本穩定。
- 音標直接保存字典資料；未辨識到 IPA 時保持空白。口音不靠檔名推測，標示 unspecified。
- 錄音各有自己的來源與授權，僅保存完整 metadata；不下載／播放，不聲稱錄音者是母語人士，speaker=unverified。作者未知時為 null。實際媒體處理屬 P1.2。
- 10 秒逾時含本文讀取、回應上限 256 KiB、不跟隨重新導向、runtime schema 驗證。無自動重試；429 儲存 Retry-After（秒或日期），期限前的同程序請求不呼叫上游。UI 可手動重試。
- 查無詞、限流、逾時、離線、格式錯誤回可編輯草稿；錯誤不使用 demo 假裝成功。

## 外部驗證

apple、bank 皆已透過正式建置與真實字典完成瀏覽器查詢、選義與保存；bank 金融／河岸分別保存為兩張卡。另取得 bank 四個詞條的真實 JSON 固定快照。早期 curl 回 HTML 404／530，瀏覽器重查也曾遇格式錯誤；UI 保留人工釋義／例句，重試恢復後成功選義保存。這不代表上游有可用性保證。測試不呼叫正式服務，固定快照與手寫 fixture 的區別見 `tests/fixtures/README.md`。
