# 🦄 獨角獸 Unicorn Capture

組織內（`@dbyv.org`）多使用者資料收集系統。  
建表、填報、查詢共用同一個 `submissions` 資料池，欄位一律使用 **Universal KEY**。

---

## 角色

| 角色 | 誰 | 能做什麼 |
|------|----|---------|
| **Superuser** | `joeshi@dbyv.org`（rules 與 `NEXT_PUBLIC_OWNER_EMAIL`） | 管理選項池／表格／使用者群組；看全部資料；可代為更正／作廢（不改擁有者） |
| **Manager** | `userRoles` 群組 ∩ 表格 `managerGroups` | 讀取所管表格的全部 submission／檔案；**不能**更正或作廢他人 |
| **Submitter** | 已驗證 `@dbyv.org` | 填有權限的表、讀／更正／作廢自己的紀錄 |

身分邊界由 Firebase Auth + Security Rules 強制：必須 `email_verified` 且 email 符合 `@dbyv.org`。

---

## 頁面

| 頁面 | 誰看得到 | 做什麼 |
|------|---------|--------|
| **填報** | 組織使用者 | 依 `fillAccessType` / `fillGroups` 顯示可填表格 |
| **資料池** | 組織使用者 | 先選月份範圍再選表格；超過 500 筆會擋下並告知實際筆數 |
| **表格** | Superuser | 建表、設定填報 ACL 與管理群組 |
| **選項池** | Superuser | 管理 KEY 與標準值（組織使用者可讀，供下拉） |
| **權限** | Superuser | 把 email 指派到 manager 群組 |

---

## KEY、LABEL、VALUE

| | 是什麼 | 誰決定 | 例子 |
|---|--------|--------|------|
| **KEY** | 存進資料庫的欄位名稱，跨所有表格統一 | 系統 | `school`、`eventDate` |
| **LABEL** | 畫面上看到的名稱 | 建表時 | 「入營學校」 |
| **VALUE** | 標準化的值 | 選項池 | `粵華中學` |

### 固定 KEY（節錄）

- 文字／數字／檔案：`title`、`text1~4`、`note~note3`、`quantity1~5`、`amount1~3`、`upload~upload4`
- **語意日期**（`YYYY-MM-DD`）：`eventDate`、`startDate`、`endDate`、`dueDate`、`documentDate`、`effectiveDate`、`expiryDate`
- **語意時間**（`HH:mm`，澳門本地牆鐘）：`eventTime`、`startTime`、`endTime`
- 已退役：`dateOnlyStart` / `dateOnlyEnd` / `dateTimeStart` / `dateTimeEnd`（若舊模板仍使用，請手動重建）

業務時區：`Asia/Macau`（`_submittedMonth` 依此時區計算）。

### 下拉三形狀

| 欄位 | 用途 |
|------|------|
| `department` | 陣列 → `array-contains` |
| `departmentCombined` | 標準順序組合字串 → `==` |
| `departmentCount` | 選了幾個 |

`module` / `action` / `managerGroup` **不是**一般跨表 KEY；查詢維度對應 `_templateModule` / `_templateAction`，寫入時另存 `_eventType = module.action`。

### 欄位的三種輸入方式

建表時每個欄位可以選：

| 模式 | 使用者看到 | 能改嗎 |
|------|-----------|--------|
| `open` | 空白，自己填 | 能 |
| `default` | 已填好預設值 | 能 |
| `locked` | 已填好，灰掉 | 不能 |

這跟「必答／可選答」是**兩件事**。必答決定空白算不算答案；輸入方式決定能不能改。唯一無效的組合是「必答＋鎖定＋沒有預填值」，那會永遠送不出去，建表時就會被擋下。

三種模式送進資料池的文件**完全一樣**，所以改模式不需要搬資料。

判準：**這個值改變之後還是同一張表嗎？** 是就用 `open` 或 `default`，不是就 `locked`。不確定先用 `open`——之後改成鎖定幾乎免費，反過來很貴。

---

## 查詢：先選月份範圍

資料池的順序是固定的：**月份範圍（必填）→ 表格（選填）→ 其餘精修**。

送出查詢前系統會先算筆數。超過 500 筆就不撈資料，直接告訴你這個範圍有幾筆、請你縮小範圍。要全部資料就按「完整匯出 CSV」，那條路不套用上限。

這樣看到的清單永遠是完整的，不會有「以為看到全部、其實只是一部分」的情況。

---

## 擁有者 vs 操作者

更正鏈全程保留穩定擁有者：

- `_submitterUid` / `_submitterEmail`：原擁有者（不變）
- `_actorUid` / `_actorEmail`：建立此版本的人
- `_eventKind`：`CREATE` | `CORRECTION` | `VOID`

Superuser 代為更正／作廢時，擁有者不變，操作者記 Superuser。

---

## 檔案

路徑：`uploads/{uid}/{submissionId}/{fieldKey}/{fileId}`  
送出前需 `uploadSessions`；定稿後不可刪。  
Submission 只存 Storage `path`，前端用已驗證 SDK 產生短效 blob URL。

---

## 開始使用

### 1. 設定

```bash
cd web
cp env.example .env.local
npm install
```

`NEXT_PUBLIC_OWNER_EMAIL` 是前端 Superuser 便利來源；**真正授權**以 `firestore.rules` / `storage.rules` 為準，兩邊必須一致。

### 2. 本機開發

```bash
npm run dev
```

模擬器：

```bash
npx firebase emulators:start --only auth,firestore,storage --project demo-unicorn
```

### 3. 部署

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
cd web && npm run build && cd ..
firebase deploy --only hosting
```

---

## 測試

```bash
# 終端機 A
npx firebase emulators:start --only firestore,storage --project demo-unicorn

# 終端機 B
cd tests && npm install && npm test
```

包含：組織網域、optionSet 讀取、填報 ACL、Manager、owner/actor 更正、VOID 偽造、Storage MIME/大小/隔離、分批與截斷純邏輯。

---

## 目錄

```
├── web/                   Next.js 前端
├── tests/                 rules + 純邏輯測試
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── docs/
```
