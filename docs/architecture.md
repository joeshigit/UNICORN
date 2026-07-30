# 架構說明（多使用者 Stabilization）

操作步驟看 [README](../README.md)，建表流程看 [建表手冊](form-manual.md)。

---

## 0. Universal KEY 命名原则（必读）

> **Naming convention determines how a new Universal KEY is named. `standardKeys` determines whether that KEY is an organizational standard.**

三件事分开，不要混为一谈：

| 问题 | 由谁决定 | 例子 |
|------|----------|------|
| KEY **长什么样** | 命名规范（L1+L2 validator） | `demo_chineseName`、`school`（白名单） |
| KEY **是不是组织标准** | `standardKeys` 登记 | 同一 KEY 可只是 optionSet，也可升格 standard |
| KEY **对应什么 VALUE 字典** | `optionSets`（Master code） | `school` → 学校清单 |

**前缀 ≠ Standard Key。** `demo_chineseName` 可以只是标准选项（VALUE dictionary），也可以在标准问题另作组织标准登记——两者不冲突。

新建 business KEY 格式：

- 分类前缀 + camelCase：`demo_chineseName`、`coun_riskSelfHarm`
- PO 白名单无前缀例外（v1 仅 `school`）
- 禁止裸 KEY：`name`、`phone`、`email`（语义过广）

---

## 1. 四層架構

| 層 | Collection | 性質 |
|----|-----------|------|
| **Meaning** | `optionSets` | 字典。離散 VALUE 清單（code＝Universal KEY） |
| **Meaning** | `standardKeys` | 組織標準 KEY＋答案方式 valueModel（free／optionSet／scale／yesNo） |
| **Template** | `templates` | 表格定義（含填報／管理 ACL） |
| **Submission** | `submissions` | 不可變事件，單一資料池 |
| **Staging** | `uploadSessions` | 送出前檔案暫存擁有權（非業務真相） |
| **Derived View** | submission 內 `_` 欄位 | 寫入當下算好並凍結 |

---

## 2. 身分與授權

### 組織邊界

Rules 要求：

```
request.auth != null
&& request.auth.token.email_verified == true
&& request.auth.token.email.matches('.*@dbyv\\.org$')
```

前端另以 Google `hd: dbyv.org` 與登入後檢查作為便利層，**不能替代 rules**。

### 角色

- **Superuser**：rules 硬編碼 email 清單（與 `NEXT_PUBLIC_OWNER_EMAIL` 對齊）
- **Manager**：`userRoles/{email}.groups` ∩ `templates/{id}.managerGroups`
- **Submitter**：可填 `fillAccessType` 允許的表；擁有自己的 submission

Manager **可讀不可改他人鏈**。更正／作廢僅擁有者或 Superuser。

### 模板填報 ACL

```js
fillAccessType: 'allOrgUsers' | 'groups'
fillGroups: string[]          // 當 type=groups
managerGroups: string[]       // 只控制讀取管理，不控制填報
```

Rules 在 `templates` 讀取與 `submissions` CREATE 時雙重檢查。缺少 `userRoles` 或空 `managerGroups` 時以 `exists()` / list 檢查安全失敗（deny）。

---

## 3. Submission 文件

```js
{
  _templateId, _templateName, _templateModule, _templateAction,
  _eventType: 'CAMP.REGISTER',   // 寫入當下：module.action
  _templateVersion,

  _submitterUid, _submitterEmail,   // 穩定擁有者
  _actorUid, _actorEmail,           // 此版本操作者
  _eventKind: 'CREATE' | 'CORRECTION' | 'VOID',

  _submittedAt,                     // Firestore Timestamp
  _submittedMonth: '2026-07',       // Asia/Macau
  _status: 'ACTIVE' | 'VOID',
  _isLatest: true,
  _supersedes, _supersededBy,

  _fieldLabels, _optionLabels, _fieldKeys,
  files: [{ fieldKey, path, name, mimeType, size, uploadedAt, uploadedBy }],

  // Universal KEY 平鋪
  school: ['粵華中學'],
  schoolCombined: '粵華中學',
  schoolCount: 1,
  eventDate: '2026-07-29',
  eventTime: '09:30',
}
```

---

## 4. 空白是一個答案

**同一張表的每一筆資料形狀完全相同。** 每個被問到的問題，每一筆都有對應的欄位；空白是一個值，不是欄位消失。

| 型別 | 有值 | 空白 | 怎麼查空白 |
|------|------|------|-----------|
| 文字／多行／數字／日期／時間 | 值 | `null` | `where(key, '==', null)` |
| 下拉 | `['粵華中學']` / `'粵華中學'` / `1` | `[]` / `''` / `0` | `where(keyCount, '==', 0)` |
| 檔案 | 檔案數量 | `0` | `where(key, '==', 0)` |

### 為什麼不能讓 KEY 消失

在 Firestore 裡「欄位不存在」不是一個值，是**索引上的一個洞**：

- 對那個欄位的任何條件都撈不到它，連 `!=` 也不行
- `orderBy` 那個欄位時，**整筆紀錄會被排除**——不是排到最後，是消失
- 沒辦法查「誰沒填」

`null` 是真正的值，所以三個問題都消失：`== null` 查得到、`orderBy` 會納入（排最前）、數字的範圍查詢仍然正確排除它。這就是標準的可空欄位語意，跟 SQL 的 NULL 一樣。

數字欄位不能用 `''` 或 `0` 當空白：`''` 會讓同一個 KEY 出現字串與數字兩種型別，範圍查詢就壞了；`0` 會跟使用者真的填 0 混在一起。`null` 兩個問題都沒有。

### 連帶的好處

不需要另外存一份「哪些欄位是空白」的清單。填答率直接查得到：

```js
// 這個月有幾份個案報告漏填了備註
where('_submittedMonth', '==', '2026-07')
where('note', '==', null)
```

`_fieldLabels` / `_fieldKeys` / `_optionLabels` 也一律涵蓋所有欄位，鍵集合在同一張表內不會因為有沒有填而不同。

---

## 5. 寫入當下的決定

| 值 | 何時 | 誰 | 鎖定 |
|----|------|----|------|
| `_fieldLabels` / `_optionLabels` | 送出 | 前端 | 寫入即鎖 |
| `_submittedMonth` | 送出 | `currentMonth()` @ Asia/Macau | 寫入即鎖 |
| `_eventType` | 送出 | `module.action` | 寫入即鎖 |
| `<key>` / Combined / Count | 送出 | `buildSubmissionDoc` | 寫入即鎖 |
| `_isLatest` 交棒 | 更正／作廢交易 | 前端 transaction + rules | 單向不可逆 |
| 擁有者欄位 | 鏈上第一筆 CREATE | 之後更正不可偽造 | rules 驗證 parent |

---

## 6. 檔案生命週期

1. 開啟填報 → `ensureUploadSession(submissionId)`
2. 上傳 → `uploads/{uid}/{submissionId}/{fieldKey}/{fileId}`（需有效 session、≤20MB、核准 MIME）
3. 送出 → 寫入 submission（只存 path）→ 刪 session
4. 定稿後 → Storage **禁止 delete**；讀取限擁有者／Manager／Superuser
5. 孤兒清理 → 排程後端依過期 session 刪未定稿檔（**不放寬 rules**）

前端下載：`getBlob` → 短效 `URL.createObjectURL`。

---

## 7. 資料池：Browse 與進階搜尋

資料池有兩種讀取模式。**只有進階搜尋**保證「此範圍完整」；Browse 只保證「已載入的這一帶」。

### 7.1 Browse（預設）

進入資料池先 Browse，依角色用時間窗 × 每頁上限：

| 角色／範圍 | 預設時間窗 | 每頁上限 |
|------------|------------|----------|
| Submitter | 近 30 天 | 50 |
| Manager 可見範圍（自己 ∪ 所管表格） | 近 14 天（可切 30 天） | 100 |
| Manager 只看我填的 | 近 30 天 | 50 |
| Superuser | 近 14 天（可切 30 天） | 100 |

```js
where('_isLatest', '==', true)
where('_submittedAt', '>=', cutoff)   // now - days
orderBy('_submittedAt', 'desc')
limit(pageSize)
// 角色隔離：_submitterUid 與／或 _templateId in …
```

- 無 count 閘門；可 cursor「載入更多」
- 多腿合併後取前 pageSize 為**近似**最新；不宣稱跨腿精確全域排序
- 帳單約 `min(窗內可見筆數, pageSize)`／批（Manager 多腿合併前可能略高）

### 7.2 進階搜尋（月份完整）

需要完整月份範圍時才用。順序強制：

1. **提交月份範圍（必填）**
2. **哪一張表格**（須明示選擇；「全部表格」是選項之一）
3. 按「查詢」才打 Firestore（條件變更不自動重查）

```js
where('_isLatest', '==', true)              // 除非要看被更正的舊版本
where('_submittedMonth', '>=', fromMonth)
where('_submittedMonth', '<=', toMonth)
// 選填：where('_templateId', '==', templateId)
orderBy('_submittedMonth', 'asc')
orderBy('_submittedAt', 'desc')
```

送出前 `getCountFromServer`：

- 超過 `QUERY_DISPLAY_LIMIT`（500）→ **完全不撈資料**，回 `{ blocked: true, count, limit }`
- 在上限內 → 取回該範圍全部（**含 VOID**），才可說「此範圍完整」

**為什麼月份範圍必須必填**：前端過濾不會降低 Firestore 筆數；範圍必填後縮小一定有效。

完整匯出走 `exportAllSubmissions`（須先進階搜尋成功），cursor 分頁，上限 `EXPORT_HARD_CAP`（20,000）。

### 7.3 畫面層（不重查）

取回的集合一律含 VOID：

- **顯示作廢**：預設關閉（遮罩）；切換**不**打 Firestore
- **精修 KEY**（eq／neq／hasValue／blank，可多條件）：按「套用」後只濾已載入資料
- module／action 不作使用者篩選

### 7.4 清單查詢規則與隔離

`list`／聚合規則對「查詢條件推導出的 resource」求值。`isOwnerOfRecord()` 檢查 `_submitterUid`，擁有者那組查詢**必須用 `_submitterUid`**。

- `in` 以 `FIRESTORE_IN_LIMIT`（30）分批
- 非 Superuser 進階搜尋計數是多組相加的**上界**（可重複計）

### 7.5 索引

兩種查詢形狀：

1. **進階搜尋**：等值 ＋ `_submittedMonth` 範圍 ＋ `orderBy(_submittedMonth, _submittedAt)` — 8 種等值組合（`_submitterUid`／`_isLatest`／`_templateId`）
2. **Browse**：等值 ＋ `_submittedAt` 下界 ＋ `orderBy(_submittedAt desc)` — `_isLatest`／`_submitterUid+_isLatest`／`_templateId+_isLatest`，以及看舊版時去掉 `_isLatest` 的對應組合

加上 `uploadSessions` 孤兒清理索引。

跨表 KEY 精修不需要索引。多餘索引有寫入成本，不要「留著以防萬一」。

### 跨表格搜尋

不指定表格時本來就是跨表格——`submissions` 是統一的池子。以 Universal KEY 找值是**已載入集合上的前端精修**（Browse）或**月份範圍完整集合上的精修**（進階搜尋成功後）。

---

## 8. 題型：選擇題與量表

| 題型 | 本質 | 答案從哪來 | KEY |
|------|------|------------|-----|
| `dropdown` | 下拉 | optionSet（選項池 items） | ＝ optionSet.code |
| `choice` | 圓鈕／方框（資料同下拉） | optionSet **或** 標準問題 yesNo 答案方式 | ＝ optionSet.code；yesNo 標準題見 §8b |
| `scale` | 線性刻度（輸入方式，像 date） | 系統固定 `"1"`…`"N"` | `rating1`…`rating20` |

- **`choice` 有兩種答案來源，不要混為一談：**
  - **optionSet**：離散選項清單（學校、部門…）→ 在「標準選項」建 Master
  - **yesNo（標準問題）**：組織固定 `是`／`否`／（可選）`不適用` → 在「標準問題」登記，**不需** optionSet
- `scalePoints`：`3 | 4 | 5 | 10 | 100`；**數字愈大愈正面**
- 量表**不是** optionSet，也不用 likert code 當欄位 KEY
- 矩陣建題＝建表批次產生多個扁平 `scale` 欄位，共用同一 `scalePoints`；submission **沒有**巢狀 matrix
- `dropdown`／`choice`／`scale` 送出時都寫三形狀（陣列／Combined／Count）
查詢量表答案用題目 KEY（存成陣列三形狀），例如 `where('rating1', 'array-contains', '3')`，或查 `rating1Combined`／`rating1Count`；不是查 `likert3` 這類自定義 KEY。

---

## 8b. 標準資料（standardKeys）

組織認定可跨表重用的資料概念：規定 **KEY** 與 **答案方式（valueModel）**；不是題幹貼上庫，也不自動建立 Firestore 索引。

**KEY 命名与 `optionSet.code` 共用同一套 canonical format；登记到 `standardKeys` 才代表组织标准**（见 §0）。

**yesNo 不是 optionSet 的子功能。** 它是標準問題專用的答案方式：VALUE 組織級固定，無 items 清單，無 Master/子集，也**不要**為每題在「標準選項」複製一個「是/否」Master。

| valueModel（答案方式） | 例子 | 契約 |
|------------|------|------|
| `free` | `demo_chineseName` | text／number／date… 自由值 |
| `optionSet` | 既有 `school` | KEY＝optionSet.code（MVP）；可選同 code 子集 |
| `scale` | `prog_satisfactionRating` | `scalePoints`＋`scaleValueLabels`（VALUE 必須 `"1"…"N"`） |
| `yesNo` | `coun_riskSelfHarm` | `type: choice`；固定 VALUE `是`／`否`（或含 `不適用`）；`allowNa` 決定二元或三元 |

- Active 答案契約 **immutable**；語義變更 → deprecate＋新 KEY  
- 建表時 scale 標籤 **snapshot** 進 `FieldDefinition.scaleValueLabels`；yesNo 的 `allowNa` **snapshot** 進 `FieldDefinition.yesNoAllowNa`；填表不 live join 名冊  
- 本表專用仍用 `FIXED_KEYS`（含 `rating*`）與未升格的 optionSet  
- Rules：組織可讀、Superuser 可寫、**禁止 delete**  
- 舊題庫／Registry 構想見歷史討論；產品入口為 Console「標準資料」

**yesNo 查詢示例：**

```js
// 所有自伤风险 = 是
where('coun_riskSelfHarm', 'array-contains', '是')

// 未填（空白）
where('coun_riskSelfHarmCount', '==', 0)
```

---

## 9. 欄位輸入模式

`required` 與 `inputMode` 是**兩個正交的維度**：

| 維度 | 決定什麼 | 值 |
|------|---------|-----|
| `required` | 空白算不算答案 | 必答／可選答 |
| `inputMode` | 使用者能不能改 | `open` / `default` / `locked` |

八種組合只有一格無效：

- **必答 + `locked` + 沒有預填值** → 不接受空白但使用者又不能填，永遠送不出去 → **建表時擋下**
- 可選答 + `locked` + 沒有值 → 有效，等於「鎖定為空白」

`inputMode` 未設定即 `open`，舊模板天然相容、不需要遷移。

### submission 層零差別

三種模式產生的文件**完全相同**。沒有任何欄位記錄「這是預設的」，查詢分不出來也不需要分。下拉的三個形狀照原邏輯產生：

```js
department: ['SCD'], departmentCombined: 'SCD', departmentCount: 1
```

因此改模式不需要搬資料，只會讓 `_templateVersion` +1。

### 該寫死什麼

判準是「這個值改變之後，這還是同一張表嗎」：

- 個案報告的部門改成維修部門 → 已經是另一張表 → `locked`
- 個案報告在不同學校填 → 還是同一張表 → `open` 或 `default`

**不確定時選 `open`**，因為猜錯的代價不對稱：設成提問而其實從不變動，改成鎖定幾乎零成本；設成鎖定而其實會變動，就得複製一堆近乎相同的表格，`managerGroups` 要設 N 次、加欄位要改 N 次。

型別限制：`file` 無法預填；`date` / `time` 寫死通常是 bug，建表時會提醒。

### UI

`locked` 欄位**留在原本的順序位置**、灰掉並加鎖圖示，不搬到別處——欄位順序對應使用者熟悉的資料結構（Sheet 欄位順序、紙本表單排列），搬走會破壞對照習慣。

用 `disabled` 而不是 `readOnly`，因為 `readOnly` 對 `<select>` 與 checkbox 無效。payload 從 React state 組出來、不依賴原生表單送出，所以 `disabled` 不影響資料寫入。

---

## 10. 語意日期／時間

- Date：`YYYY-MM-DD` 字串 KEY（見上）
- Time：`HH:mm` 澳門牆鐘；**不**自動令 `endTime = startTime`
- 點事件：`eventDate` + 可選 `eventTime`
- 區間：`startDate`/`startTime` + 可選 `endDate`/`endTime`
- `_submittedAt` 維持 Timestamp

---

## 11. 刻意不做的事

| 不做 | 理由 |
|------|------|
| 公開 download URL 永久 token | 檔案 ACL 會被繞過 |
| Manager 代為更正他人 | 所有權與稽核分離 |
| 讀取時彙總 | 寫入當下已凍結 |
| 自訂欄位 KEY | 破壞跨表查詢 |
| 刪除 submission | 事件不刪，只作廢 |
