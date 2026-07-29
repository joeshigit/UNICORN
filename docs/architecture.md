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

## 6. 查詢完整性

- `in` / `array-contains-any` 以 `FIRESTORE_IN_LIMIT`（30）分批，**不截斷群組／模板清單**
- 畫面查詢回 `{ rows, truncated }`（請求 `max+1` 偵測）
- CSV 完整匯出走 `exportAllSubmissions`（分頁／加倍 max），避免靜默 500 筆上限
- module／action 映射 `_templateModule`／`_templateAction`，不當作一般 KEY 篩選

---

## 7. 語意日期／時間

- Date：`YYYY-MM-DD` 字串 KEY（見上）
- Time：`HH:mm` 澳門牆鐘；**不**自動令 `endTime = startTime`
- 點事件：`eventDate` + 可選 `eventTime`
- 區間：`startDate`/`startTime` + 可選 `endDate`/`endTime`
- `_submittedAt` 維持 Timestamp

---

## 8. 刻意不做的事

| 不做 | 理由 |
|------|------|
| 公開 download URL 永久 token | 檔案 ACL 會被繞過 |
| Manager 代為更正他人 | 所有權與稽核分離 |
| 讀取時彙總 | 寫入當下已凍結 |
| 自訂欄位 KEY | 破壞跨表查詢 |
| 刪除 submission | 事件不刪，只作廢 |
