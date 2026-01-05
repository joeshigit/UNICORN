# Universal Data Capture Platform - 主題文件
## Stage 1 MVP + 未來 OPEN 結構

---

## 1. 一句話定義

這是一個**公司內部（同一個 Google Workspace 網域）**可重複使用的「資料收集平台」。  
Team Leader 能用「設定」快速做出不同資料收集表單（Template），Staff 只要選表單就能提交（Submission）。所有提交進同一張 universal table（`submissions`），檔案上傳到 Shared Drive。

---

## 2. 🦄 UNICORN 核心設計：Universal KEY

### 2.1 KEY vs LABEL vs VALUE

| 概念 | 說明 | 範例 |
|------|------|------|
| **KEY** | 系統統一的欄位名稱，跨所有表格相同 | `school`, `startDateTime`, `quantity1` |
| **LABEL** | UI 顯示名稱，Leader 自由設計 | 「入營學校」「駐守學校」「發信學校」 |
| **VALUE** | 標準化的值，來自 optionSet | `粵華中學`（不是「粵華」「粵華學校」） |

### 2.2 設計原則

1. **KEY 統一**：所有表格使用相同的 KEY（如 `school`），不允許自定義名稱（如 `入營學校`、`campSchool`）
2. **LABEL 自由**：同一個 KEY，不同表格可以有不同 LABEL（「入營學校」「發生學校」）
3. **VALUE 標準化**：透過 optionSet 強制統一，避免「粵華」「粵華中學」不一致
4. **扁平結構**：用戶資料直接存在頂層，不使用 `values: {}` 巢狀

### 2.3 Universal Keys

| KEY | 類型 | 說明 |
|-----|------|------|
| `school` | optionSet | 學校 |
| `service` | optionSet | 服務類型 |
| `project` | optionSet | 項目 |
| `format` | optionSet | 格式 |
| `action` | optionSet | 動作類型 |
| `startDateTime` | datetime | 開始時間（yyyymmdd hh:mm） |
| `endDateTime` | datetime | 結束時間（yyyymmdd hh:mm） |
| `quantity1`~`quantity3` | number | 數量 |
| `notes1` | text | 備註（單行） |
| `notes2` | textarea | 備註（多行） |

---

## 3. 這是舊計畫的升級點（舊：文件入口；新：資料平台）

- **舊系統核心**：處理文件進入（Email/掃描）→ 存 Drive → Sheet metafile → Tagging  
- **新系統核心**：先把「資料收集/表單/欄位/選項」平台化（Email 掃描先不做）  
- **共同原則延續**：正式檔案仍在**同一個 Shared Drive**集中管轄；資料與檔案連結分離

---

## 4. Stage 1 MVP：最簡單、可落地、可擴充

### 4.1 角色分工（先做最少）

- **Staff（資料提供者）**
  - 選「表單（Template）」→ 填欄位 → 多檔上傳 → 送出
  - 看「我提交的」→ 可修改 / 可標記 `CANCELLED`
- **Leader（資料收集者/表單設計者）**
  - 建表單：從 Universal Keys 選擇欄位、設定 LABEL、設定預設值
  - （暫時不強求）直接在系統內看所有人的提交
- **資料檢視（Workaround）**
  - 定期把 `submissions` 匯出到 Google Sheet，Leader 用 Sheet 篩選/看報表（先求好用）

### 4.2 核心資料結構（Firestore 四大塊的簡化落地）

#### A. `templates`（表單定義）
- 一張表單 = 一筆文件（例如「營隊登記」）
- 內含 `fields[]` 決定 UI 要長什麼樣
- `key` 必須是 Universal Key

#### B. `submissions`（唯一 universal table）
- 每次送出 = 一筆文件
- 系統 Metadata（`_templateId`, `_submittedMonth` 等）
- 用戶資料直接在頂層（`school`, `startDateTime` 等）
- `_fieldLabels` 存 LABEL 快照
- `files[]` 存檔案 metadata

#### C. `optionSets`（下拉選單庫，可重用）
- `code` 對應 Universal Key
- `items[]` 存標準化的 value/label

#### D. （佔位）`exports` / `jobs`
- 匯出到 Sheet 的狀態、最後匯出時間、失敗原因（讓維運可追）

---

## 5. Stage 1 的「欄位型別」怎麼支撐不同 Template

你同意第一版只做：`text`、`number`、`datetime`、`dropdown`、`textarea`、`file`

### 5.1 設計原則：UI 由 `templates.fields[]` 生成（而不是寫死）

- Template1：7 fields + 1 upload  
  - `fields[]` 長度 = 8，每個 field 的 `key` 是 Universal Key
- Template2：4 fields + 1 upload + 1 textarea  
  - `fields[]` 長度 = 6，每個 field 的 `key` 是 Universal Key

Submission 永遠是同一種結構：
- 用戶資料：直接用 Universal Key 存在頂層
- 檔案：統一塞進 `files[]`

### 5.2 為什麼不會慢（在 MVP 形態）

每次填表通常只需要：
- 讀 1 份 `template`
- 讀 0~數個 `optionSets`
- 寫 1 筆 `submission`
真正慢的多半是「上傳檔案到 Drive」，不是 Firestore。

---

## 6. 檔案進 Shared Drive：建議做法

### 6.1 建議：**一定進 Shared Drive，並依 module/action 自動分資料夾**

原因：最符合「組織集中管轄」，也最容易做權限與稽核。

### 6.2 建議路徑規則（簡單一致）

- `SharedDriveRoot/DataCapture/{moduleId}/{yyyy}/{mm}/`
- 檔名可由後端統一命名，避免亂（例如含 submissionId）

### 6.3 關鍵安全原則

前端不要直接拿 Drive 高權限 token 操作 Shared Drive；改由後端服務（Cloud Functions/Cloud Run + 服務帳號）上傳與設權限，前端只拿到「可預覽/可下載」所需的最小資訊。

---

## 7. 未來 OPEN 結構：最重要的「Submission as Options」（提交資料變成下拉選項）

### 7.1 目標：讓資料可重用，形成組織知識網

你描述的情境非常典型：
- ACTION「CAMP REGISTER」收集學校、入住/退房日期、學生數…
- ACTION「ACCIDENT REPORT」要能**直接選取**目前正在入住的學校（從 CAMP REGISTER 推出選項），再補事故資訊

這代表平台要支援一種欄位：**reference（引用）**
- 下拉選項不再來自 `optionSets`
- 而是來自「某個 template 的 submissions 查詢結果」

---

### 7.2 安全性：Submission 當選項時，最大的風險是「資料外洩」

當下拉選項是從 submissions 查出來時，**最怕**：
- 使用者不該看到別人的提交，卻在下拉清單看到（包含名稱/日期/學校等敏感資訊）
- 前端直接 query 全域 submissions，造成越權與資料曝露

因此這個功能要用「安全優先」的設計：

#### A. 原則 1：選項清單查詢必須是「授權後的結果」

- 下拉清單的查詢最好由後端 API 產生（Cloud Function），在後端做：
  - 使用者身分驗證（Google Workspace domain）
  - 權限判斷（他能看哪些 submissions）
  - 只回傳必要的欄位（label/value），不要回傳整筆 submission

#### B. 原則 2：Reference 存的是 ID，不是整段文字

引用欄位儲存：
- `refSubmissionId`
- （可加）`refTemplateId`
顯示用 label 可以做「安全的 denormalize」：
- 儲存 `refLabelSnapshot`（避免未來原資料改名/刪除導致歷史紀錄失真）

#### C. 原則 3：可見性要有一個明確策略（先簡單，後擴充）

你目前 MVP 的權限是「只看自己」。那 reference 清單就先做：
- **只允許引用自己建立的 CAMP REGISTER**（最安全、最容易）
未來再擴充到：
- 同 module 可見
- 同部門可見
- 特定角色（superuser）可見
（但每一步都要同步調整 rules / API）

#### D. 原則 4：避免把敏感資料放進下拉選項 label

下拉 label 建議只放「工作需要的最小資訊」，例如：
- `SchoolName + DateRange`（不要放個資、不要放內部備註）

---

### 7.3 「CAMP REGISTER → ACCIDENT REPORT」的資料關聯（概念流程）

- Staff 建立 CAMP REGISTER submission（含 `startDateTime`/`endDateTime`）
- Staff 建立 ACCIDENT REPORT submission 時：
  - reference 欄位呼叫後端：用「今天日期」篩選目前有效的 camp
  - 回傳可選清單（授權後）
  - 使用者選一筆 → 存 `refSubmissionId` + `refLabelSnapshot`

---

## 8. 擴充藍圖（保持簡單，但不堵死未來）

### 8.1 狀態流（你說先佔位）

Stage 1：`ACTIVE / CANCELLED`  
Stage 2+：`DRAFT / SUBMITTED / REVIEWED / APPROVED / LOCKED`（再加審核與稽核）

### 8.2 讓 Leader 更好用（但不要拖慢 MVP）

- template/optionSets 介面更像「表單建構器」
- 匯出到 Sheet 自動化（排程、增量匯出、失敗重試）
- 之後再考慮把「報表與篩選」搬回平台內做

---

## 9. 你這套平台成功的判斷標準（很人話）

- Leader 能在 10–20 分鐘內做出一張新表單並投入使用
- Staff 打開後不用學太多，只要「選表單→填→上傳→送出」
- 資料結構不會因為表單變多就崩壞（submissions 永遠同一張）
- 未來要做「Submission as Options」時，不需要翻掉整個架構，只要加 reference 欄位型別 + 安全查詢機制
- 跨表格查詢一致（因為 Universal KEY）

---

## 附錄：Firestore 資料結構細節（給開發者參考）

### A. `templates/{templateId}` 結構範例

```json
{
  "name": "營隊登記",
  "moduleId": "CAMP",
  "actionId": "REGISTER",
  "enabled": true,
  "version": 1,
  "createdBy": "leader@company.com",
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-01-15T10:00:00Z",
  "fields": [
    {
      "key": "school",
      "type": "dropdown",
      "label": "入營學校",
      "required": true,
      "order": 0,
      "optionSetId": "school"
    },
    {
      "key": "startDateTime",
      "type": "datetime",
      "label": "入營時間",
      "required": true,
      "order": 1
    },
    {
      "key": "endDateTime",
      "type": "datetime",
      "label": "退營時間",
      "required": true,
      "order": 2
    },
    {
      "key": "quantity1",
      "type": "number",
      "label": "學生人數",
      "required": true,
      "order": 3
    },
    {
      "key": "notes1",
      "type": "text",
      "label": "特殊需求",
      "required": false,
      "order": 4
    },
    {
      "key": "documents",
      "type": "file",
      "label": "上傳名單",
      "required": true,
      "order": 5
    }
  ],
  "defaults": {}
}
```

### B. `submissions/{submissionId}` 結構範例

```json
{
  "_templateId": "template_camp_register",
  "_templateModule": "CAMP",
  "_templateAction": "REGISTER",
  "_templateVersion": 1,
  "_submitterId": "user_001",
  "_submitterEmail": "staff@company.com",
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
    "notes1": "特殊需求",
    "documents": "上傳名單"
  },
  
  "_optionLabels": {
    "school": "粵華中學"
  },
  
  "files": [
    {
      "fieldKey": "documents",
      "driveFileId": "1a2b3c4d5e6f7g8h",
      "name": "學生名單_20260120.pdf",
      "mimeType": "application/pdf",
      "size": 245678,
      "webViewLink": "https://drive.google.com/...",
      "uploadedAt": "2026-01-20T14:30:00Z",
      "uploadedBy": "staff@company.com"
    }
  ]
}
```

### C. `optionSets/{optionSetId}` 結構範例

```json
{
  "code": "school",
  "name": "學校",
  "description": "所有合作學校",
  "createdBy": "leader@company.com",
  "createdAt": "2026-01-10T09:00:00Z",
  "updatedAt": "2026-01-15T10:00:00Z",
  "items": [
    {
      "value": "粵華中學",
      "label": "粵華中學",
      "status": "active",
      "sort": 0
    },
    {
      "value": "培正中學",
      "label": "培正中學",
      "status": "active",
      "sort": 1
    },
    {
      "value": "聖若瑟中學",
      "label": "聖若瑟中學",
      "status": "active",
      "sort": 2
    }
  ]
}
```

---

## 版本歷史

- **2025-01-XX**：初版建立（Stage 1 MVP + 未來 Submission as Options 架構）
- **2026-01-05**：更新為 Universal KEY 設計，移除 `values: {}` 巢狀結構

