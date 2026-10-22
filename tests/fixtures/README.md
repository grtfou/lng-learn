# 字典 fixture

- `dictionary-apple.json`：2026-10-22 讀取 Free Dictionary API v2 `https://api.dictionaryapi.dev/api/v2/entries/en/apple`，僅保留第一個 noun 義項與原始 phonetics／license／sourceUrls；節錄修改。文字來源為 Wiktionary contributors（回應未列個別作者），CC BY-SA 3.0，見回應內授權連結。音檔僅 metadata，各筆授權分開保存，沒有下載或播放。
- `dictionary-bank.json`：依上述回應格式手寫的金融／河岸測試資料，定義與例句為本專案測試文字，非正式 API 實際查詢結果。網址與授權欄位用來測契約，不作為實際內容授權證據。另以完整真實快照 dictionary-bank-live.json 覆蓋多詞條解析。
- 單元／整合測試一律注入 fetch，不連正式內容服務。

- `dictionary-bank-live.json`：2026-10-22 透過 Node fetch 取得官方 bank v2 完整 JSON（四個詞條），未改寫內容。文字依每個詞條的 Wiktionary sourceUrls 與 CC BY-SA 3.0 授權；個別作者未提供，錄音各自授權另列。先前 curl 的 HTML 404／530 與瀏覽器一次格式錯誤為當次不穩定結果，之後正式查詢、詞義選擇與保存皆成功。
