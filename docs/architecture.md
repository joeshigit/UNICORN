# 架構說明（多使用者 Stabilization）

操作步驟看 [README](../README.md)，建表流程看 [建表手冊](form-manual.md)。

---

## 1. 四層架構

| 層 | Collection | 性質 |
|----|-----------|------|
| **Meaning** | `optionSets` | 字典。KEY 與合法 VALUE |
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

## 4. 寫入當下的決定

| 值 | 何時 | 誰 | 鎖定 |
|----|------|----|------|
| `_fieldLabels` / `_optionLabels` | 送出 | 前端 | 寫入即鎖 |
| `_submittedMonth` | 送出 | `currentMonth()` @ Asia/Macau | 寫入即鎖 |
| `_eventType` | 送出 | `module.action` | 寫入即鎖 |
| `<key>` / Combined / Count | 送出 | `buildSubmissionDoc` | 寫入即鎖 |
| `_isLatest` 交棒 | 更正／作廢交易 | 前端 transaction + rules | 單向不可逆 |
| 擁有者欄位 | 鏈上第一筆 CREATE | 之後更正不可偽造 | rules 驗證 parent |

---

## 5. 檔案生命週期

1. 開啟填報 → `ensureUploadSession(submissionId)`
2. 上傳 → `uploads/{uid}/{submissionId}/{fieldKey}/{fileId}`（需有效 session、≤20MB、核准 MIME）
3. 送出 → 寫入 submission（只存 path）→ 刪 session
4. 定稿後 → Storage **禁止 delete**；讀取限擁有者／Manager／Superuser
5. 孤兒清理 → 排程後端依過期 session 刪未定稿檔（**不放寬 rules**）

前端下載：`getBlob` → 短效 `URL.createObjectURL`。

---

## 6. 查詢完整性：先計數，再決定要不要查

資料池的查詢順序是強制的，跟銀行 App 一樣：

1. **提交月份範圍（必填）** — 預設當月
2. **哪一張表格（選填）**
3. 其餘條件都是**前端精修**

只有前兩項送進 Firestore：

```js
where('_isLatest', '==', true)              // 除非要看被更正的舊版本
where('_submittedMonth', '>=', fromMonth)   // YYYY-MM 字典序，避開時區
where('_submittedMonth', '<=', toMonth)
// 選填：where('_templateId', '==', templateId)
orderBy('_submittedMonth', 'asc')           // 不等式欄位必須是第一個 orderBy
orderBy('_submittedAt', 'desc')
```

送出查詢前先用 `getCountFromServer` 計數：

- 超過 `QUERY_DISPLAY_LIMIT`（500）→ **完全不撈資料**，回 `{ blocked: true, count, limit }`，請使用者縮小月份範圍
- 在上限內 → 把該範圍全部取回，前端精修作用在**完整集合**上

所以完整性是保證，不是警告。一次被擋下的搜尋只花約 1–2 次讀取，而不是 501 次。

**為什麼月份範圍必須必填**：前端過濾永遠不會降低 Firestore 層的筆數。若讓使用者只給一個 `school == X` 去計數，他再怎麼加條件筆數都不變，會卡在永遠被擋。範圍必填之後，計數永遠落在時間軸上，縮小一定有效。

**清單查詢的規則陷阱**：`list` 與聚合查詢的規則是對「查詢條件推導出的 resource」求值，沒有被條件約束的欄位是 `undefined`。`isOwnerOfRecord()` 檢查 `_submitterUid`，所以擁有者那組查詢**必須用 `_submitterUid` 過濾**，用 `_submitterEmail` 會讓規則判不出身分而整個查詢被拒。

- `in` 以 `FIRESTORE_IN_LIMIT`（30）分批，**不截斷模板清單**
- 非 Superuser 的計數是多組查詢相加，屬於**上界**（同一筆可能既是自己填的、又屬於自己管的表格）。上界安全，代價是偶爾多擋一次
- 完整匯出走 `exportAllSubmissions`，cursor 分頁、不套用顯示上限，上限是 `EXPORT_HARD_CAP`（20,000）
- module／action 映射 `_templateModule`／`_templateAction`，不當作一般 KEY 篩選

### 跨表格搜尋

不指定表格時本來就是跨表格查詢——`submissions` 是統一的池子。以某個 Universal KEY 找特定值仍然可用，但它是**月份範圍內的前端精修**。以 KEY 為主軸、不先給時間範圍的專用搜尋模式是另一個需求，留待實際使用習慣明朗後再設計。

---

## 7. 欄位輸入模式

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

## 8. 語意日期／時間

- Date：`YYYY-MM-DD` 字串 KEY（見上）
- Time：`HH:mm` 澳門牆鐘；**不**自動令 `endTime = startTime`
- 點事件：`eventDate` + 可選 `eventTime`
- 區間：`startDate`/`startTime` + 可選 `endDate`/`endTime`
- `_submittedAt` 維持 Timestamp

---

## 9. 刻意不做的事

| 不做 | 理由 |
|------|------|
| 公開 download URL 永久 token | 檔案 ACL 會被繞過 |
| Manager 代為更正他人 | 所有權與稽核分離 |
| 讀取時彙總 | 寫入當下已凍結 |
| 自訂欄位 KEY | 破壞跨表查詢 |
| 刪除 submission | 事件不刪，只作廢 |
