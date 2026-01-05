# 獨角獸 - Unicorn - DataCaptureSystem 架構與開發計畫

---

## 0. 系統命名

### 0.1 系統名稱
- **中文**：獨角獸
- **英文**：Unicorn - DataCaptureSystem
- **Firebase Project ID**：`unicorn-dcs-dev` / `unicorn-dcs-prod`
- **Web App 名稱**：`unicorn-web`

### 0.2 平台名稱
- **Leader 平台**：**表格設定平台**
- **Staff 平台**：**資料填報中心**

### 0.3 Leader 選單（中文版）
- **總覽**（Dashboard）
- **表格**（Templates）
  - 新增表格
  - 編輯表格
  - 啟用/停用
- **下拉選項池**（OptionSets）
  - 新增選項池
  - 編輯選項池
  - 排序/停用選項池
- **匯出**（Exports）
  - 匯出資料到 Google Sheet
  - 查看匯出狀態
- **設定**（Settings）
  - 分類與動作命名（佔位）

---

## 1. 🦄 UNICORN 核心設計：Universal KEY

### 1.1 KEY vs LABEL vs VALUE

| 概念 | 說明 | 範例 |
|------|------|------|
| **KEY** | 系統統一的欄位名稱，跨所有表格相同 | `school`, `startDateTime`, `quantity1` |
| **LABEL** | UI 顯示名稱，Leader 自由設計 | 「入營學校」「駐守學校」「發信學校」 |
| **VALUE** | 標準化的值，來自 optionSet | `粵華中學`（不是「粵華」「粵華學校」） |

### 1.2 Universal Keys（系統固定的欄位 KEY）

| KEY | 類型 | 說明 |
|-----|------|------|
| `school` | optionSet | 學校 |
| `service` | optionSet | 服務類型 |
| `project` | optionSet | 項目 |
| `format` | optionSet | 格式 |
| `action` | optionSet | 動作類型 |
| `department` | optionSet | 部門 |
| `status` | optionSet | 狀態 |
| `category` | optionSet | 分類 |
| `startDateTime` | datetime | 開始時間（yyyymmdd hh:mm） |
| `endDateTime` | datetime | 結束時間（yyyymmdd hh:mm） |
| `quantity1` | number | 數量1 |
| `quantity2` | number | 數量2 |
| `quantity3` | number | 數量3 |
| `amount1` | number | 金額1 |
| `amount2` | number | 金額2 |
| `notes1` | text | 備註1（單行） |
| `notes2` | textarea | 備註2（多行） |
| `title` | text | 標題 |
| `name` | text | 名稱 |
| `description` | textarea | 描述 |
| `content` | textarea | 內容 |
| `attachment` | file | 附件 |
| `documents` | file | 文件 |
| `reference` | reference | 引用 |

### 1.3 設計原則

1. **KEY 統一**：所有表格使用相同的 KEY，確保跨表查詢一致
2. **LABEL 自由**：Leader 可以為同一個 KEY 設定不同的 LABEL
3. **VALUE 標準化**：透過 optionSet 強制統一，避免「粵華」「粵華中學」不一致
4. **扁平結構**：用戶資料直接存在頂層，不使用 `values: {}` 巢狀

---

## 2. 建立 Firebase 專案（步驟）

### 2.1 進入 Firebase Console
- 網址：`https://console.firebase.google.com/`
- 用你的 Google Workspace 帳號登入

### 2.2 建立專案
- 點 **Add project**
- **Project name**：`Unicorn DataCaptureSystem (Dev)` 或 `(Prod)`
- **Project ID**：`unicorn-dcs-dev` / `unicorn-dcs-prod`（建立後不可改）
- Google Analytics：可先不開

### 2.3 啟用產品
- **Authentication**：啟用 Google Sign-In，限制網域（hd claim 驗證）
- **Firestore**：建立資料庫（Native mode，asia-east1 或你偏好的區域）
- **Hosting**：部署 Next.js
- **Cloud Functions（2nd gen）**：後端 API

### 2.4 建立服務帳號（Drive 上傳用）
- 在 GCP Console 建立服務帳號
- 授予 Shared Drive 寫入權限
- 下載金鑰 JSON，存入 Secret Manager

---

## 3. 資料結構（Firestore Collections）

### 3.1 `templates`（表格定義）

```
templates/{templateId}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | string | 表格名稱（如「營隊登記」） |
| `moduleId` | string | 分類（如 CAMP） |
| `actionId` | string | 動作（如 REGISTER） |
| `enabled` | boolean | 是否啟用 |
| `version` | number | 版本號 |
| `createdBy` | string | Leader email |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 更新時間 |
| `fields` | array | 欄位定義（見下方） |
| `defaults` | map | 預設值設定 |

#### `fields[]` 欄位定義

```json
{
  "key": "school",           // 🦄 必須是 Universal Key
  "type": "dropdown",
  "label": "入營學校",        // Leader 自由設計
  "required": true,
  "order": 0,
  "helpText": "選擇入營的學校",
  "optionSetId": "school"    // 對應 optionSet
}
```

---

### 3.2 `submissions`（唯一 universal table）

```
submissions/{submissionId}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `_templateId` | string | 對應的表格 ID |
| `_templateModule` | string | 分類（從 template 複製） |
| `_templateAction` | string | 動作（從 template 複製） |
| `_templateVersion` | number | 版本號（從 template 複製） |
| `_submitterId` | string | 填報人 ID |
| `_submitterEmail` | string | 填報人 email |
| `_submittedAt` | timestamp | 提交時間 |
| `_submittedMonth` | string | 提交月份（YYYY-MM） |
| `_status` | string | `ACTIVE` / `CANCELLED` |
| `school` | string | 🦄 Universal Key: VALUE |
| `startDateTime` | string | 🦄 Universal Key: VALUE |
| `quantity1` | number | 🦄 Universal Key: VALUE |
| ... | ... | 其他 Universal Keys |
| `_fieldLabels` | map | 欄位 LABEL 快照 |
| `_optionLabels` | map | 選項 LABEL 快照 |
| `files` | array | 檔案 metadata |

#### Submission 結構範例

```json
{
  "_templateId": "template_camp_register",
  "_templateModule": "CAMP",
  "_templateAction": "REGISTER",
  "_templateVersion": 1,
  "_submitterId": "user_001",
  "_submitterEmail": "staff@org.com",
  "_submittedAt": "2026-01-20T14:30:00Z",
  "_submittedMonth": "2026-01",
  "_status": "ACTIVE",
  
  "school": "粵華中學",
  "startDateTime": "20260115 09:00",
  "endDateTime": "20260117 16:00",
  "quantity1": 30,
  "notes1": "需要素食餐",
  
  "_fieldLabels": {
    "school": "入營學校",
    "startDateTime": "入營時間",
    "endDateTime": "退營時間",
    "quantity1": "學生人數",
    "notes1": "特殊需求"
  },
  
  "_optionLabels": {
    "school": "粵華中學"
  },
  
  "files": [
    {
      "fieldKey": "documents",
      "driveFileId": "1a2b3c...",
      "name": "名單.pdf",
      "mimeType": "application/pdf",
      "size": 245678,
      "webViewLink": "https://drive.google.com/...",
      "uploadedAt": "2026-01-20T14:30:00Z",
      "uploadedBy": "staff@org.com"
    }
  ]
}
```

---

### 3.3 `optionSets`（下拉選項池）

```
optionSets/{optionSetId}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `code` | string | 🦄 對應 Universal Key（如 `school`） |
| `name` | string | 選項池顯示名稱（如「學校」） |
| `description` | string | 說明 |
| `isMaster` | boolean | 🦄 是否為完整清單（Master） |
| `masterSetId` | string | 🦄 子集指向 Master 的 ID |
| `createdBy` | string | Leader email |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 更新時間 |
| `items` | array | 選項清單 |

#### `items[]` 結構

```json
[
  { "value": "粵華中學", "label": "粵華中學", "status": "active", "sort": 0 },
  { "value": "培正中學", "label": "培正中學", "status": "active", "sort": 1 }
]
```

#### 🦄 Master/Subset 設計

同一個 Universal KEY 可以有多個 OptionSet：

```javascript
// Master（完整清單）
{
  code: "school",
  name: "所有學校",
  isMaster: true,
  items: [/* 100 個學校 */]
}

// Subset A（中學子集）
{
  code: "school",              // 同一個 KEY
  name: "中學",
  isMaster: false,
  masterSetId: "school_master",
  items: [/* 50 個中學 */]
}

// Subset B（教會小學子集）
{
  code: "school",              // 同一個 KEY
  name: "教會小學",
  isMaster: false,
  masterSetId: "school_master",
  items: [/* 20 個教會小學 */]
}
```

**規則**：
- 子集的 `value` 必須存在於 Master 中
- 新增選項只能在 Master 中進行
- 不管用哪個子集提交，`school: "粵華中學"` 的 VALUE 都是標準化的

---

## 4. Reference 欄位（Submission as Options）

### 4.1 流程

1. **Leader 建立 Template A**（如：營隊登記）
   - 欄位包含日期範圍（dateRole=start/end）

2. **Staff 填報 Template A**
   - 系統自動把日期存入 `startDateTime`/`endDateTime`

3. **Leader 建立 Template B**（如：事故報告）
   - 有 reference 欄位，`refConfig.templateId` 指向 Template A
   - 可設定日期範圍篩選

4. **Staff 填報 Template B**
   - 前端呼叫 `listReferenceOptions` API
   - 後端查詢並回傳可選清單
   - Staff 選一筆 → 存 `refSubmissionId` + `refLabelSnapshot`

### 4.2 安全原則
- 查詢必須在後端（前端不可直接 query 其他人的 submissions）
- 只回傳 label/value（不回傳整筆 submission）
- labelSnapshot 只放必要資訊

---

## 5. Cloud Functions 2nd gen

| Function | 用途 | Stage 1 |
|----------|------|---------|
| `createSubmission` | 建立 submission（驗證 + denormalize） | ✓ |
| `updateSubmission` | 更新 submission | ✓ |
| `uploadFilesToDrive` | 上傳檔案到 Shared Drive | ✓ |
| `listReferenceOptions` | Reference 下拉清單查詢 | ✓ |
| `exportSubmissionsToSheet` | 匯出到 Google Sheet | ✓ |
| `listMySubmissions` | 我的提交清單 | ✓ |

---

## 6. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    function isCompanyUser() {
      return isAuthenticated() && 
             request.auth.token.email.matches('.*@yourcompany\\.com$');
    }
    function isLeader() {
      return isCompanyUser() && 
             request.auth.token.leader == true;
    }
    
    match /templates/{templateId} {
      allow read: if isCompanyUser();
      allow write: if isLeader();
    }
    
    match /optionSets/{optionSetId} {
      allow read: if isCompanyUser();
      allow write: if isLeader();
    }
    
    match /submissions/{submissionId} {
      allow read: if isCompanyUser() && 
                     resource.data._submitterEmail == request.auth.token.email;
      allow create: if isCompanyUser() && 
                       request.resource.data._submitterEmail == request.auth.token.email;
      allow update: if isCompanyUser() && 
                       resource.data._submitterEmail == request.auth.token.email;
      allow delete: if false;
    }
  }
}
```

---

## 7. Drive 上傳

### 7.1 路徑規則
- `SharedDriveRoot/DataCapture/{moduleId}/{yyyy}/{mm}/`
- 檔名：`{submissionId}_{originalName}`

### 7.2 流程
1. 前端選檔 → 呼叫 `uploadFilesToDrive`
2. Functions 用服務帳號上傳
3. 回傳 `driveFileId`, `webViewLink`
4. 更新 submission 的 `files[]`

---

## 8. Fatal Errors（開發時嚴禁）

- 前端直接 query 其他人的 submissions
- 前端用 Drive OAuth 直接寫 Shared Drive
- 讓使用者任意設定 `_submitterEmail`
- Reference label 包含敏感資訊
- 使用非 Universal Key 的欄位名稱
- 用可預測的 submissionId

---

## 9. 開發階段

### Stage 1（MVP + Reference）
1. Firebase 專案建立 + 服務帳號
2. Next.js 骨架 + Firebase Auth
3. Firestore collections + Security Rules
4. Cloud Functions（createSubmission, updateSubmission, listReferenceOptions, uploadFilesToDrive）
5. Staff UI
6. Leader UI
7. 匯出功能

### Stage 2+（未來）
- Computed 欄位 UI
- 更細的 Reference 權限
- 審核流程
- 報表與篩選

