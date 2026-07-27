# 架構說明（單人版）

這份文件說明 Unicorn Capture 單人版的資料設計，以及每個設計決定背後的理由。
操作步驟看 [README](../README.md)，建表流程看 [建表手冊](form-manual.md)。

---

## 1. 四層架構

Unicorn 的規矩是每個 collection 都要能明確歸到某一層，歸不進去就是設計錯了。

| 層 | Collection | 性質 |
|----|-----------|------|
| **Meaning** | `optionSets` | 字典。定義有哪些 KEY，以及每個 KEY 的合法值 |
| **Template** | `templates` | 表格定義。是資料，不是程式碼 |
| **Submission** | `submissions` | 不可變事件。唯一的資料池 |
| **Derived View** | submission 內 `_` 開頭的欄位 | 寫入當下算好、直接存進事件本身 |

沒有第四個 collection，也沒有任何子集合被拿來當關聯表用。

---

## 2. Collection 結構

### optionSets

```js
{
  code: 'school',            // 這個清單定義的 Universal KEY
  name: '所有學校',
  isMaster: true,            // false = 子集
  masterSetId: undefined,    // 子集才有，指向 Master
  items: [
    { value: '粵華中學', label: '粵華中學', status: 'active', sort: 0 },
    { value: '培正中學', label: '培正',     status: 'active', sort: 1 },
  ],
}
```

- `value` 是存進資料池的標準碼，建立後不改
- `label` 只是顯示用，隨時可以改，改了也不影響歷史資料（送出時已經快照過）
- 子集的每個 `value` 都必須存在於 Master，由 `createSubset()` 在寫入前驗證

`module` 和 `action` 是兩個保留 code，用來當表格本身的分類與動作。

### templates

```js
{
  name: '營會登記表',
  moduleId: 'CAMP',
  actionId: 'REGISTER',
  description: '記錄每次入營的學校與人數',
  enabled: true,
  version: 3,
  fields: [
    { key: 'school', type: 'dropdown', label: '入營學校', required: true, order: 0, optionSetId: '...' },
    { key: 'quantity1', type: 'number', label: '學生人數', required: true, order: 1 },
  ],
}
```

改欄位會讓 `version` +1。已提交的資料帶著送出當下的 version 與 label 快照，不受影響。

### submissions

```js
{
  // 系統 metadata（寫入當下凍結）
  _templateId, _templateName, _templateModule, _templateAction, _templateVersion,
  _submitterEmail, _submittedAt, _submittedMonth,
  _status: 'ACTIVE' | 'VOID',

  // 更正鏈
  _isLatest: true,
  _supersedes: '被這筆更正的紀錄 ID',
  _supersededBy: '取代這筆的紀錄 ID',

  // 顯示快照
  _fieldLabels: { school: '入營學校', quantity1: '學生人數' },
  _optionLabels: { school: '粵華中學' },
  _fieldKeys: ['school', 'quantity1'],

  // 使用者資料：Universal KEY 平鋪在頂層
  school: '粵華中學',
  quantity1: 30,

  files: [{ fieldKey, path, name, mimeType, size, url, uploadedAt, uploadedBy }],
}
```

沒有 `values: {}` 這種巢狀結構。KEY 直接是文件欄位，查詢才不用展開。

---

## 3. 寫入當下的決定

每個衍生值都要交代：什麼時候算、誰算、存在哪、什麼時候鎖住。

| 值 | 什麼時候算 | 誰算 | 存在哪 | 什麼時候鎖住 |
|----|-----------|------|--------|-------------|
| `_templateName` / `_templateVersion` | 按下送出 | 前端 `buildSubmissionDoc()` | submission | 寫入即鎖 |
| `_fieldLabels` | 按下送出 | 同上，從 template 抄 | submission | 寫入即鎖 |
| `_optionLabels` | 按下送出 | 同上，從當時載入的選項池抄 | submission | 寫入即鎖 |
| `_submittedMonth` | 按下送出 | `currentMonth()` | submission | 寫入即鎖 |
| `_fieldKeys` | 按下送出 | 從 template 欄位清單抄 | submission | 寫入即鎖 |
| `_isLatest` | 送出 / 更正 / 作廢 | 交易內同時寫兩份文件 | submission | 交棒後不可逆 |

由前端算而不是 Cloud Function，是因為這套系統只有一位使用者，而且 Firestore 規則
已經把「能寫什麼」限制死了。少一層後端，就少一個要部署與維護的東西。

---

## 4. 更正與作廢

資料不改，只往後接。

```
D 原始(25 人)         B 更正(35 人)          C 作廢墓碑
_isLatest: false  →   _isLatest: false   →   _isLatest: true
_supersededBy: B      _supersedes: D         _supersedes: B
                      _supersededBy: C       _status: 'VOID'
```

兩個操作都在 `runTransaction` 裡完成：寫新文件 + 把舊文件的 `_isLatest` 設成 false。
舊文件的**資料欄位一個都沒動**。

Firestore 規則只放行這一種 update：

```
allow update: if isOwner()
              && request.resource.data.diff(resource.data)
                   .affectedKeys().hasOnly(['_isLatest', '_supersededBy'])
              && resource.data._isLatest == true
              && request.resource.data._isLatest == false;
```

單向、只能一次、只能動指標。`allow delete: if false`。

---

## 5. 查詢

**目前有效的資料**，純索引查詢，讀的時候不做任何計算：

```js
where('_isLatest', '==', true)      // 是鏈頭
where('_status', '==', 'ACTIVE')    // 不是作廢墓碑
```

**跨表查詢**，Universal KEY 的重點就在這裡：

```js
where('school', '==', '粵華中學')                    // 所有表格
where('_templateModule', '==', 'CAMP')               // 某一類表格
where('_submittedMonth', '==', '2026-01')            // 某個月（不做日期運算）
```

實作上分兩條路（`web/src/lib/db.ts` 的 `querySubmissions`）：

- 一般篩選（表格 / 月份 / 鏈頭）走 `firestore.indexes.json` 裡定義好的複合索引
- 跨表 KEY 查詢用單一等式條件（Firestore 自動索引），排序在前端做，
  這樣新增任何 KEY 都不必再建索引

讀取一律用 `getDocsFromServer` / `getDocFromServer`：離線時要明確報錯，
不要拿本地快取回一份看起來「沒有資料」的空清單。

---

## 6. 權限

只有一位擁有者，email 寫在三個地方且必須一致：

| 位置 | 用途 |
|------|------|
| `web/.env.local` 的 `NEXT_PUBLIC_OWNER_EMAIL` | 前端判斷能不能進 Console |
| `firestore.rules` 的 `owner()` | 資料庫層強制 |
| `storage.rules` | 檔案層強制 |

前端那個只是體驗，真正擋住的是後面兩個。

---

## 7. 刻意不做的事

| 不做 | 理由 |
|------|------|
| 角色與審核流程 | 只有一個人，多一道關卡只是多一道麻煩 |
| 草稿送審 | 表格有 `enabled` 開關就夠了 |
| Cloud Functions | 規則擋得住的事情不需要後端；少一個要部署的東西 |
| 讀取時計算彙總 | 該算的在寫入當下就算完存好 |
| 自訂欄位名稱 | 一旦允許，跨表查詢就完了 |
| 刪除 submission | 事件紀錄不刪，要撤銷就寫一筆作廢 |
