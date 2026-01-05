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

## 1. 建立 Firebase 專案（步驟）

### 1.1 進入 Firebase Console
- 網址：`https://console.firebase.google.com/`
- 用你的 Google Workspace 帳號登入

### 1.2 建立專案
- 點 **Add project**
- **Project name**：`Unicorn DataCaptureSystem (Dev)` 或 `(Prod)`
- **Project ID**：`unicorn-dcs-dev` / `unicorn-dcs-prod`（建立後不可改）
- Google Analytics：可先不開

### 1.3 啟用產品
- **Authentication**：啟用 Google Sign-In，限制網域（hd claim 驗證）
- **Firestore**：建立資料庫（Native mode，asia-east1 或你偏好的區域）
- **Hosting**：部署 Next.js
- **Cloud Functions（2nd gen）**：後端 API

### 1.4 建立服務帳號（Drive 上傳用）
- 在 GCP Console 建立服務帳號
- 授予 Shared Drive 寫入權限
- 下載金鑰 JSON，存入 Secret Manager

---

## 2. 資料結構（Firestore Collections）

### 2.1 `templates`（表格定義）

```
templates/{templateId}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | string | 表格名稱（如「營隊登記」） |
| `moduleId` | string | 分類（如 CAMP） |
| `actionId` | string | 動作（如 REGISTER） |
| `enabled` | boolean | 是否啟用 |
| `createdBy` | string | Leader email |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 更新時間 |
| `fields` | array | 欄位定義（見下方） |
| `defaults` | map | 預設值設定 |

#### `fields[]` 欄位定義

```json
{
  "key": "fieldKey",
  "type": "date",
  "label": "欄位顯示名稱",
  "required": true,
  "order": 0,
  "helpText": "說明文字",
  
  // 日期配對（支援 dateStart/dateEnd）
  "dateRole": "start",
  "datePartner": "anotherFieldKey",
  
  // Dropdown 專用
  "optionSetId": "optionSetId",
  
  // Reference 專用
  "refConfig": {
    "templateId": "target_template_id",
    "labelFields": ["field1", "field2"],
    "labelFormat": "{field1} ({field2})",
    "filterByDateRange": {
      "startField": "dateStartFieldKey",
      "endField": "dateEndFieldKey",
      "filterType": "activeOnDate",
      "relativeTo": "today"
    }
  },
  
  // Computed 專用（Stage 1 佔位）
  "computeConfig": {
    "operandA": "fieldA",
    "operandB": "fieldB",
    "operator": "*"
  }
}
```

#### 欄位型別
| type | 說明 | Stage 1 |
|------|------|---------|
| `text` | 單行文字 | ✓ |
| `number` | 數字 | ✓ |
| `date` | 日期（可配對成範圍） | ✓ |
| `dropdown` | 下拉選單（從 optionSets） | ✓ |
| `textarea` | 多行文字 | ✓ |
| `file` | 檔案上傳（多檔） | ✓ |
| `reference` | 引用其他 submission | ✓ |
| `computed` | 計算欄位 | 佔位 |

---

### 2.2 `submissions`（唯一 universal table）

```
submissions/{submissionId}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `templateId` | string | 對應的表格 ID |
| `moduleId` | string | 分類（從 template 複製） |
| `actionId` | string | 動作（從 template 複製） |
| `createdBy` | string | 填報人 email |
| `status` | string | `ACTIVE` / `CANCELLED` |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 更新時間 |
| `values` | map | 動態欄位值 |
| `files` | array | 檔案 metadata |
| **`_dateStart`** | string/null | Denormalized：日期範圍起點（供查詢） |
| **`_dateEnd`** | string/null | Denormalized：日期範圍終點（供查詢） |
| **`_refIds`** | array | Denormalized：被引用的 submissionId 清單（供反查） |

#### `values` 結構範例

```json
{
  "schoolName": "ABC 學校",
  "dateStart": "2025-01-15",
  "dateEnd": "2025-01-20",
  "count": 30,
  "note": "備註文字",
  
  "refField": {
    "refSubmissionId": "abc123",
    "refTemplateId": "target_template",
    "refLabelSnapshot": "ABC 學校 (2025-01-15 ~ 2025-01-20)"
  }
}
```

#### `files` 結構範例

```json
[
  {
    "driveFileId": "1a2b3c...",
    "name": "document.pdf",
    "mimeType": "application/pdf",
    "size": 245678,
    "webViewLink": "https://drive.google.com/...",
    "uploadedAt": "2025-01-20T14:30:00Z",
    "uploadedBy": "staff@company.com"
  }
]
```

---

### 2.3 `optionSets`（下拉選項池）

```
optionSets/{optionSetId}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | string | 選項池名稱 |
| `createdBy` | string | Leader email |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 更新時間 |
| `items` | array | 選項清單 |

#### `items[]` 結構

```json
[
  { "value": "VALUE1", "label": "顯示名稱1", "enabled": true, "sort": 0 },
  { "value": "VALUE2", "label": "顯示名稱2", "enabled": true, "sort": 1 }
]
```

---

## 3. Reference 欄位（Submission as Options）

### 3.1 流程

1. **Leader 建立 Template A**（如：營隊登記）
   - 欄位包含日期範圍（dateRole=start/end）

2. **Staff 填報 Template A**
   - 系統自動把日期存入 `_dateStart`/`_dateEnd`

3. **Leader 建立 Template B**（如：事故報告）
   - 有 reference 欄位，`refConfig.templateId` 指向 Template A
   - 可設定日期範圍篩選

4. **Staff 填報 Template B**
   - 前端呼叫 `listReferenceOptions` API
   - 後端查詢並回傳可選清單
   - Staff 選一筆 → 存 `refSubmissionId` + `refLabelSnapshot`

### 3.2 安全原則
- 查詢必須在後端（前端不可直接 query 其他人的 submissions）
- 只回傳 label/value（不回傳整筆 submission）
- labelSnapshot 只放必要資訊

---

## 4. Cloud Functions 2nd gen

| Function | 用途 | Stage 1 |
|----------|------|---------|
| `createSubmission` | 建立 submission（驗證 + denormalize） | ✓ |
| `updateSubmission` | 更新 submission | ✓ |
| `uploadFilesToDrive` | 上傳檔案到 Shared Drive | ✓ |
| `listReferenceOptions` | Reference 下拉清單查詢 | ✓ |
| `exportSubmissionsToSheet` | 匯出到 Google Sheet | ✓ |
| `listMySubmissions` | 我的提交清單 | ✓ |

---

## 5. Firestore Security Rules

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
                     resource.data.createdBy == request.auth.token.email;
      allow create: if isCompanyUser() && 
                       request.resource.data.createdBy == request.auth.token.email;
      allow update: if isCompanyUser() && 
                       resource.data.createdBy == request.auth.token.email;
      allow delete: if false;
    }
  }
}
```

---

## 6. Drive 上傳

### 6.1 路徑規則
- `SharedDriveRoot/DataCapture/{moduleId}/{yyyy}/{mm}/`
- 檔名：`{submissionId}_{originalName}`

### 6.2 流程
1. 前端選檔 → 呼叫 `uploadFilesToDrive`
2. Functions 用服務帳號上傳
3. 回傳 `driveFileId`, `webViewLink`
4. 更新 submission 的 `files[]`

---

## 7. Fatal Errors（開發時嚴禁）

- 前端直接 query 其他人的 submissions
- 前端用 Drive OAuth 直接寫 Shared Drive
- 讓使用者任意設定 `createdBy`
- Reference label 包含敏感資訊
- 忘記更新 `_dateStart`/`_dateEnd`/`_refIds`
- 用可預測的 submissionId

---

## 8. 開發階段

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




