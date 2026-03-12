# Developer 建表手冊

本手冊供 Developer（白名單帳號）使用，說明如何在 UNICORN 系統中建立一個新的資料收集表格。

---

## 建表前 — 與 Leader 確認需求

在動手建表之前，先跟 Leader 釐清以下問題：

1. **這張表收什麼資料？** 誰填、什麼時候填、填完要做什麼
2. **有哪些欄位？** 每個欄位的用途、是否必填
3. **會用到哪些下拉選項？** 是否已有合適的 OptionSet，還是需要建新的子集
4. **未來會怎麼查詢這些資料？** 按學校？按月份？按服務類型？

---

## 建表流程（6 步）

### Step 1: 檢查 Option Pool

進入 Developer Console → **選項池與建表** → **Part A: 探索選項池**。

- 查看現有的 Master OptionSet（如 `school`, `service`, `project`）
- 如果 Leader 只需要部分選項，從 Master 建立 **Subset**
- Subset 內的選項必須全部來自 Master，不可自行新增

> 不要跳過這步。先確認選項池再建表，可避免欄位 KEY 錯誤。

### Step 2: 確認欄位 KEY

UNICORN 的核心原則：每個欄位必須使用 **Universal KEY**，不可自行命名。

**Fixed Keys（系統固定）**

| KEY | 類型 | 預設 Label |
|-----|------|-----------|
| `quantity1` | number | 數量A |
| `quantity2` | number | 數量B |
| `quantity3` | number | 數量C |
| `title` | text | 單行文字 |
| `note` | textarea | 多行文字 |
| `dateTimeStart` | datetime | 開始日期時間 |
| `dateTimeEnd` | datetime | 結束日期時間 |
| `dateOnlyStart` | date | 開始日期 |
| `dateOnlyEnd` | date | 結束日期 |
| `upload` | file | 檔案上傳 |

**OptionSet Keys（動態，來自 optionSets.code）**

Dropdown 類型欄位的 KEY 必須對應到 OptionSet 的 `code`。例如 OptionSet code 為 `school`，欄位 KEY 就是 `school`。

> KEY 統一，LABEL 可自由。例如 KEY 是 `school`，但 Label 可以是「入營學校」、「服務學校」、「發信學校」。

### Step 3: 建立表格草稿

進入 **選項池與建表** → **Part B: 建立表格** → 點擊「建立新草稿」。

填入：

| 欄位 | 說明 |
|------|------|
| 表格名稱 | 清楚描述用途，如「營會登記表」 |
| Module | 分類，如 CAMP、ADMIN、HR |
| Action | 操作類型，如 REGISTER、REPORT |
| 說明 | 給填報者看的簡短說明 |

### Step 4: 定義欄位

為每個欄位設定：

| 屬性 | 說明 |
|------|------|
| `key` | 選擇 Universal KEY（Fixed 或 OptionSet code） |
| `type` | 自動由 KEY 決定（Fixed KEY 有預設 type） |
| `label` | Leader 希望使用者看到的名稱 |
| `required` | 是否必填 |
| `order` | 欄位排列順序 |
| `optionSetId` | Dropdown 類型需指定（可選 Master 或 Subset） |

> 同一張表不應出現重複的 KEY。

### Step 5: 發佈表格

草稿確認無誤後：

1. 發佈為正式表格
2. 在 **表格管理** 頁面啟用表格
3. 設定「誰可填寫」（全部 or 白名單）

### Step 6: 驗證

- 切換到 User View（填報中心）
- 找到剛發佈的表格，實際填一筆 submission
- 確認欄位順序、Label、下拉選項都正確
- 到 Firestore 確認 submission document 的 KEY 和 VALUE 正確

---

## 常見錯誤

| 錯誤 | 說明 |
|------|------|
| 自行命名 KEY | KEY 必須用 Universal KEY，不可用中文或自創名稱 |
| 跳過 Option Pool 檢查 | 直接打字輸入選項，導致同義不同值（「粵華」vs「粵華中學」） |
| Label 當 KEY 用 | Label 是顯示用，KEY 才是查詢用，兩者不可混淆 |
| 一張表重複使用同一個 KEY | 每個 KEY 在一張表中只能出現一次 |

---

## 架構速查

```
submissions (single pool)
├── _templateId         → 來自哪張表
├── _templateModule     → 表格分類
├── _templateAction     → 操作類型
├── _submittedAt        → 提交時間
├── _submittedMonth     → "YYYY-MM"
├── _submitterEmail     → 提交者
├── school              → Universal KEY: VALUE
├── quantity1           → Universal KEY: VALUE
├── _fieldLabels        → { school: "入營學校", quantity1: "學生人數" }
└── _optionLabels       → { school: "粵華中學" }
```

所有表格的提交都在同一個 `submissions` collection，靠 Universal KEY 實現跨表查詢。
