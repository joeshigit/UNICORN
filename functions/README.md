# Cloud Functions（舊版，單人版用不到）

這裡是多人版留下來的 Cloud Functions：Google Drive 上傳、選項變更審核、
草稿審核、submission 狀態轉換等等。

單人版的核心流程完全不需要它們：

| 舊版用 Cloud Function 做 | 單人版怎麼做 |
|---|---|
| 上傳檔案到 Shared Drive | Firebase Storage 前端直傳 |
| 審核選項變更後寫入 optionSets | 擁有者直接編輯 |
| 審核表格草稿後建立 template | 表格用 `enabled` 開關 |
| 執行 submission 狀態轉換 | 交易內寫新紀錄 + 移動鏈頭指標，規則擋住其他改動 |

`firebase.json` 已經把 functions 拿掉了，`firebase deploy` 不會碰到這個目錄。
留著是為了以後想接 Drive 或 email 通知時有東西可以參考。

---

## ⚠️ 但「不再部署」不等於「已經移除」

以前部署上去的函式還活在專案裡，要另外刪。這件事有兩個實際影響：

**1. `onSubmissionCreated` 還在跑**

它是 Firestore 觸發器，每新增一筆 submission 就會被觸發，往 `userFormStats`
寫一筆統計。它讀的 `_submitterEmail` / `_templateId` 正好是單人版有寫的欄位，
所以它現在仍然正常運作，持續產生單人版用不到的資料。

**2. 這些函式繞過 Firestore 安全規則**

它們用 Admin SDK，而 Admin SDK 不受 `firestore.rules` 約束。所以
「submissions 寫進去就不能改」那道鎖對它們無效，例如 `cancelSubmission`
會直接 update 既有的 submission。

## 刪除方式

先看實際部署了哪些：

```bash
firebase functions:list
```

確認之後一次刪掉（全部都在 `asia-east1`）：

```bash
firebase functions:delete uploadFile cancelSubmission processOptionRequest createOptionSet exportSubmissions migrateOptionSetCode deleteOptionSet updateOptionSet batchUploadOptions reviewOptionSetDraft reviewTemplateDraft migrateOptionSetsToMaster reactivateSubmission lockSubmission unlockSubmission createReverseSubmission createCorrectionSubmission reportSubmissionIssue onSubmissionCreated processFormAccessRequest reviewTemplateSuggestion seedModuleActionOptionSets --region asia-east1 --force
```

程式碼還在這個目錄裡，要用隨時可以重新部署。

刪完可以順手把觸發器留下的 `userFormStats` collection 也在 Console 刪掉。
