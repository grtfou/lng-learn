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
2. 追加 migration，保留舊內容、卡片與 logs，實作詞義層級去重與逐欄來源持久化。
3. 詞義選擇、逐欄來源、人工修訂旗標與手動備援介面。
4. pnpm install --frozen-lockfile、pnpm check、瀏覽器操作、正式 API 驗證及文件完成註記。

## 目前步驟與下一步

目前：P1.1 第一小階段已建立字典契約、逐欄來源 schema、正式轉接、固定 fixture 與失敗備援測試。下一步：追加 migration、詞義去重與來源持久化，然後接入正式模式與 UI。

## 問題與重要決策

- 已定位 Node 24.19.0：`/Users/quokka/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`，每次 shell 指令 prepend PATH；pnpm 11.25.0。安裝與原始 26 項測試／建置成功。
- 正式字典僅在明確設定後啟用；demo 預設保留，不需 key。
- 字典若只提供英文義項，繁中釋義必須由使用者確認填寫，不捏造翻譯、口音或錄音者身分。
- 每個小階段完成後更新本檔並 commit；中斷後先讀 AGENTS.md、本檔、git status 與最近 7 筆 commits。

- 字典決策：Free Dictionary API v2，免 key；詳細授權與限制見 docs/DICTIONARY.md。apple 真實 JSON 已確認。bank 回 HTML 404／530，正式外部驗收保留；多義流程以明確標示的手寫 fixture 測試。
