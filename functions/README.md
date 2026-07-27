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
