🦄 UNICORN FIRESTORE SYSTEM GUIDE (v3)

Universal Data Collection & Template System — Universal KEY Design
(Cursor AI – Mandatory Compliance)

⸻

SECTION 0 — SYSTEM IDENTITY (DO NOT ARGUE)

This system is:

✔ A universal data collection platform
✔ Leader-defined templates
✔ User-submitted facts
✔ Firestore-native
✔ Universal KEY design (KEY/LABEL/VALUE separation)

This system is NOT:

✖ A spreadsheet
✖ A SQL database
✖ A reporting tool
✖ A system that allows custom field names

⸻

SECTION 1 — UNIVERSAL KEY 設計原則

### KEY vs LABEL vs VALUE

| 概念 | 說明 | 誰控制 | 範例 |
|------|------|--------|------|
| **KEY** | 系統統一的欄位名稱 | 系統固定 | `school`, `startDateTime` |
| **LABEL** | UI 顯示名稱 | Leader 自由 | 「入營學校」「駐守學校」 |
| **VALUE** | 標準化的值 | optionSet 限制 | `粵華中學` |

### Universal Keys（系統固定列表）

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

### 關鍵原則

1. **KEY 統一**：Leader 只能從系統固定的 Universal Key 列表選擇
2. **LABEL 自由**：同一個 KEY 可以有不同 LABEL（「入營學校」「發生學校」）
3. **VALUE 標準化**：透過 optionSet 強制統一，不允許「粵華」「粵華中學」混用
4. **扁平結構**：用戶資料直接存在文件頂層，不使用巢狀結構

⸻

SECTION 2 — 資料結構

### Template（表格定義）

```javascript
// templates/{templateId}
{
  name: "營隊登記",
  moduleId: "CAMP",
  actionId: "REGISTER",
  enabled: true,
  version: 1,
  createdBy: "leader@org.com",
  fields: [
    { key: "school", type: "dropdown", label: "入營學校", required: true, order: 0, optionSetId: "school" },
    { key: "startDateTime", type: "datetime", label: "入營時間", required: true, order: 1 },
    { key: "endDateTime", type: "datetime", label: "退營時間", required: true, order: 2 },
    { key: "quantity1", type: "number", label: "學生人數", required: true, order: 3 },
    { key: "notes1", type: "text", label: "特殊需求", required: false, order: 4 }
  ]
}
```

### Submission（提交資料）

```javascript
// submissions/{submissionId}
{
  // ===== 系統 Metadata（_ 前綴）=====
  _templateId: "template_camp_register",
  _templateModule: "CAMP",
  _templateAction: "REGISTER",
  _templateVersion: 1,
  _submitterId: "user_001",
  _submitterEmail: "staff@org.com",
  _submittedAt: Timestamp,
  _submittedMonth: "2026-01",
  _status: "ACTIVE",
  
  // ===== 用戶資料（Universal KEY: VALUE）=====
  school: "粵華中學",
  startDateTime: "20260115 09:00",
  endDateTime: "20260117 16:00",
  quantity1: 30,
  notes1: "需要素食餐",
  
  // ===== LABEL 快照（顯示用）=====
  _fieldLabels: {
    school: "入營學校",
    startDateTime: "入營時間",
    endDateTime: "退營時間",
    quantity1: "學生人數",
    notes1: "特殊需求"
  },
  
  _optionLabels: {
    school: "粵華中學"
  },
  
  // ===== 檔案 =====
  files: []
}
```

### OptionSet（選項池）

```javascript
// optionSets/{optionSetId}
{
  code: "school",                    // 對應 Universal Key
  name: "學校",
  items: [
    { value: "粵華中學", label: "粵華中學", status: "active", sort: 0 },
    { value: "培正中學", label: "培正中學", status: "active", sort: 1 }
  ]
}
```

⸻

SECTION 3 — 查詢設計

### 跨表格查詢（Universal KEY 的威力）

```javascript
// 查詢所有「粵華中學」的提交（不管是哪個表格）
db.collection('submissions')
  .where('school', '==', '粵華中學')

// 查詢 CAMP 類的所有提交
db.collection('submissions')
  .where('_templateModule', '==', 'CAMP')

// 組合查詢
db.collection('submissions')
  .where('_templateModule', '==', 'CAMP')
  .where('school', '==', '粵華中學')
  .where('_submittedMonth', '==', '2026-01')
```

### 為什麼這樣設計？

| 傳統做法 | UNICORN 做法 |
|---------|-------------|
| 每個表格不同欄位名（dept, department, unit） | 統一用 Universal Key（school） |
| 需要 `_querySchool` 來標準化 | KEY 本身就是標準化的 |
| 查詢前要先映射欄位 | 直接查詢，無需映射 |

⸻

SECTION 4 — UI 流程

### Leader 建立表格

1. 選擇 KEY（從 Universal Key 列表：school, startDateTime, quantity1...）
2. 輸入 LABEL（自由文字：「入營學校」）
3. 設定是否必填、順序
4. 如果是 dropdown，選擇對應的 optionSet

### Staff 填寫表格

1. 看到 LABEL（「入營學校」）
2. 選擇 VALUE（「粵華中學」）
3. 提交後，系統存 `school: "粵華中學"`

### 系統查詢

```javascript
.where('school', '==', '粵華中學')  // 直接用 KEY 查詢
```

⸻

SECTION 5 — 禁止事項

❌ 允許 Leader 自定義 KEY（如 `入營學校`, `campSchool`）
❌ 使用巢狀結構（如 `values: { school: "粵華中學" }`）
❌ 在 submission 存 LABEL 而非 VALUE
❌ 允許 VALUE 變體（如 `粵華`, `粵華學校`, `粵華中學` 混用）
❌ 在查詢時做欄位映射

⸻

SECTION 6 — 版本歷史

- v1：初版（Hybrid Flat Design with `_query*` prefix）
- v2：加入 validation checklist
- v3：**Universal KEY Design**（移除 `_query*`，KEY 本身就是標準化欄位）

⸻

For complete validation checklist, see:
`UNICORN SYSTEM — COMPLETE VALIDATION CHECKLIST.md`
