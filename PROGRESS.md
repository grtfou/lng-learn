# 實作進度

更新：2026-10-22（Asia/Taipei）

## 本次範圍

依 AGENTS.md 與 docs/HANDOFF.md，完成 P1.1「正式字典、義項與欄位來源」。不擴大至 P1.2 媒體下載、背景生成或其他 MVP 工作。

## 已完成

- 閱讀 AGENTS.md、README、PLAN、ARCHITECTURE、API、HANDOFF、VALIDATION 與現有程式。
- 檢查 Git：起始 working tree 乾淨，最近提交為 b1039f1（P0 骨架）。
- 確認既有 demo、交易、FSRS、重試去重與 version 鎖需保留。

## 尚未完成

1. 選定授權可追溯、無付費憑證的正式字典來源；固定 fixture、共用詞義／逐欄來源契約與 provider 失敗處理。
2. [完成] 追加 migration v2，保留舊內容、卡片與 logs，詞義層級去重與逐欄來源持久化。
3. 詞義選擇、逐欄來源、人工修訂旗標與手動備援介面。
4. pnpm install --frozen-lockfile、pnpm check、瀏覽器操作、正式 API 驗證及文件完成註記。

## 目前步驟與下一步

目前：P1.1 資料保存小階段完成。下一步：正式模式設定、詞義選擇與來源顯示 UI、錯誤重試保留草稿。

## 問題與重要決策

- 已定位 Node 24.19.0：`/Users/quokka/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`，每次 shell 指令 prepend PATH；pnpm 11.25.0。安裝與原始 26 項測試／建置成功。
- 正式字典僅在明確設定後啟用；demo 預設保留，不需 key。
- 字典若只提供英文義項，繁中釋義必須由使用者確認填寫，不捏造翻譯、口音或錄音者身分。
- 每個小階段完成後更新本檔並 commit；中斷後先讀 AGENTS.md、本檔、git status 與最近 7 筆 commits。

- 字典決策：Free Dictionary API v2，免 key；詳細授權與限制見 docs/DICTIONARY.md。apple 真實 JSON 已確認。bank 回 HTML 404／530，正式外部驗收保留；多義流程以明確標示的手寫 fixture 測試。

- migration v2：舊磁碟資料先建立一致性備份；遷移及來源寫入失敗均回滾。測試涵蓋備份、重開不重跑、FK、舊 FSRS／logs 原值保留、多義去重與來源寫入交易。
