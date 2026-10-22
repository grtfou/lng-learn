# P1.1 字典來源決策

日期：2026-10-22。使用 Free Dictionary API v2，免帳號與 API key；由伺服器查詢，預設仍為 demo。

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

apple 已取得真實 JSON；bank 同一官方端點回 HTML 404，重試回 530。銀行／河岸流程先以明確標示為手寫的固定 fixture 驗證，不能宣稱 bank 正式外部驗收已通過。測試不呼叫正式服務，fixture 的取得與內容來源見 `tests/fixtures/README.md`。
