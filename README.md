# 🦄 獨角獸 Unicorn Capture（單人版）

一個人用的資料收集系統。自己建表、自己填、所有資料落在同一個池子裡。

不管建了幾張表，提交都寫進同一個 `submissions`，而且每張表的欄位都用同一套 **Universal KEY**，
所以「粵華中學的資料」永遠是同一句查詢，不需要 join、不需要對照表。

---

## 四個頁面就是全部

| 頁面 | 做什麼 |
|------|--------|
| **選項池** | 建 KEY（例如 `school`）＋維護那個 KEY 的標準值清單 |
| **表格** | 挑 KEY 組成表格，設定顯示名稱、必填、順序 |
| **填報** | 選一張表填寫、上傳檔案 |
| **資料池** | 依表格 / 月份 / 狀態 / 跨表 KEY 查詢，匯出 CSV |

---

## KEY、LABEL、VALUE

這三個東西分開，是整套系統的地基。

| | 是什麼 | 誰決定 | 例子 |
|---|--------|--------|------|
| **KEY** | 存進資料庫的欄位名稱，跨所有表格統一 | 系統 | `school` |
| **LABEL** | 畫面上看到的名稱，每張表可以不一樣 | 你，建表時 | 「入營學校」「駐守學校」 |
| **VALUE** | 存進去的值，一律從選項池挑 | 選項池 | `粵華中學` |

三張不同的表，欄位分別叫「入營學校」「駐守學校」「發信學校」，
存進資料池全都是 `school: "粵華中學"`，所以這句話一次撈得到全部：

```js
where('school', '==', '粵華中學')
```

### KEY 從哪來

- **固定 KEY**：`title`、`text1`、`note`、`quantity1~3`、`amount1~2`、`dateOnlyStart/End`、`dateTimeStart/End`、`upload`…（見 `web/src/lib/keys.ts`）
- **選項池 KEY**：每建一個選項池就多一個下拉 KEY，`code` 就是 KEY

### 下拉欄位會存成三個形狀

建表的人只決定一件事：這個下拉「能不能複選」。送出時系統自動把它寫成三個欄位：

| 欄位 | 內容 | 回答什麼問題 |
|------|------|-------------|
| `department` | `["教學部","行政部"]` | 教學部**有份**的案子 → `array-contains` |
| `departmentCombined` | `"教學部, 行政部"` | **剛好**是這個組合的案子 → `==` |
| `departmentCount` | `2` | 跨了幾個部門 |

**單選也一樣寫三個**（`["行政部"]` / `"行政部"` / `1`）。這樣同一個 KEY 不會有時候是字串、有時候是陣列——那種混型別的欄位查詢只會撈到一半，而且不會報錯。

組合字串一律照選項池的排序產生，跟使用者點選的先後無關，否則 `"A, B"` 和 `"B, A"` 會被當成兩種組合。

這三個欄位是系統自動產生的，建表時看不到也選不到；`Combined` / `Count` 結尾的 KEY 會被擋下來避免撞名。

### Master 與子集

同一個 KEY 可以有多份清單。Master 是完整清單，子集只能從 Master 裡挑。
所以不管表格用的是「所有學校」還是「教會小學」，存進去的 VALUE 都是同一套標準碼。

---

## 資料寫進去就不改

`submissions` 是不可變的事件紀錄。要修正只能再寫一筆：

```
原始紀錄(25 人)  →  更正紀錄(35 人)  →  作廢墓碑
_isLatest: false    _isLatest: false     _isLatest: true
```

- **更正**：新增一筆帶 `_supersedes`，原紀錄的資料一個字都不動，只把 `_isLatest` 交棒出去
- **作廢**：一樣是新增一筆，狀態 `VOID`，原紀錄照樣保留
- **目前有效的資料** = `_isLatest == true && _status == 'ACTIVE'`，純索引查詢，讀的時候不用算

Firestore 規則用 `affectedKeys().hasOnly(['_isLatest','_supersededBy'])` 把這件事鎖死：
就算你自己是擁有者，也改不動已經寫進去的資料。

---

## 寫入當下就決定好

送出的那一刻，這些東西全部凍結進 submission，之後怎麼改設定都不影響歷史資料：

| 欄位 | 凍結什麼 |
|------|---------|
| `_templateName` / `_templateVersion` | 當時用的是哪張表、哪一版 |
| `_fieldLabels` | 當時每個 KEY 叫什麼名字 |
| `_optionLabels` | 當時選的那個值顯示成什麼 |
| `_submittedMonth` | `YYYY-MM`，月份查詢直接用，不做日期運算 |
| Universal KEY | 平鋪在文件頂層，查詢不需要展開巢狀結構 |

---

## 開始使用

### 1. 設定

```bash
cd web
cp env.example .env.local   # 填入 Firebase 設定與 NEXT_PUBLIC_OWNER_EMAIL
npm install
```

`NEXT_PUBLIC_OWNER_EMAIL` 是唯一能登入的帳號。換人要同時改三個地方：

- `web/.env.local`
- `firestore.rules` 裡的 `owner()`
- `storage.rules` 裡的 email

### 2. 本機開發

```bash
npm run dev            # http://localhost:3000
```

想連模擬器跑，在 `.env.local` 加 `NEXT_PUBLIC_USE_EMULATOR=1`，另開一個終端機：

```bash
npx firebase emulators:start --project demo-unicorn
```

### 3. 部署

專案已經在 `.firebaserc` 指定成 `unicorn-dcs`，不用每次加 `--project`。

```bash
firebase login

# 先只推規則與索引，確認沒問題
firebase deploy --only firestore:rules,firestore:indexes,storage

# 再推前端
cd web && npm run build && cd ..
firebase deploy --only hosting
```

第一次部署索引要等幾分鐘才建好，這期間資料池查詢可能會報缺索引的錯。

> ⚠️ 新的 rules 會把 `submissions` 的更新鎖死、把 `optionSets` 的直接寫入打開，
> 跟舊版多角色系統的行為不同。正式環境有既有資料的話，建議先開一個 dev 專案驗證。

### 3.5 從舊版（多角色）搬過來

如果 Firestore 裡已經有舊系統寫進去的資料，**部署完要跑一次搬遷**，不然：

- 舊 submission 沒有 `_isLatest`，新版資料池用它篩選鏈頭，所以舊資料整批看不到
- 舊 optionSet 沒有 `isMaster`，新版建表頁不會把它當成可用的完整清單
- 更舊的 submission 把值放在巢狀的 `values: {}`，跨表查詢吃不到

搬遷要用 Admin SDK（新規則禁止客戶端改 submission），所以需要服務帳戶金鑰：

Firebase Console → 專案設定 → 服務帳戶 → 產生新的私密金鑰，下載 JSON。

```bash
cd scripts && npm install

# 先試跑，只印出會改什麼，不寫入
node migrate-to-solo.mjs --key "C:\path\to\serviceAccountKey.json"

# 確認沒問題再真的寫
node migrate-to-solo.mjs --key "C:\path\to\serviceAccountKey.json" --apply
```

腳本會補上 `_isLatest`、`_templateName`、`_fieldKeys`、`_optionLabels`，把舊欄位名
（`templateId`、`createdBy`…）對應到 `_` 前綴版本，把巢狀 `values` 攤平到頂層，
`CANCELLED` 轉成 `VOID`，並幫 optionSet 補上 `isMaster` 與 items 的 `status` / `sort`。

沒有 `code` 的 optionSet 沒辦法自動猜，腳本會列出來讓你去 Console 手動補。

> 金鑰用完就到 Console 刪掉，少一把在外面流傳的鑰匙。

### 4. 第一次進系統

1. 登入後打開**選項池**，`module`（表格分類）和 `action`（表格動作）會自動建好，先各加幾個值
2. 需要下拉欄位就再「新增 KEY」，例如 `school`，用批次貼上一次把選項倒進去
3. 到**表格**建第一張表：挑 KEY、取顯示名稱、勾必填
4. 到**填報**填一筆，再到**資料池**看結果

---

## 測試

Firestore 規則有一組測試，確認不可變性真的鎖得住：

```bash
npx firebase emulators:start --only firestore --project demo-unicorn   # 另一個終端機
cd tests && npm install && npm test
```

---

## 目錄

```
├── web/                  Next.js 前端（靜態輸出）
│   └── src/
│       ├── app/          頁面：登入 + (console) 四頁
│       ├── components/   AppShell、表單元件、UI 元件
│       ├── lib/          db / storage / auth / keys / csv
│       └── types/
├── tests/                firestore.rules 測試
├── functions/            舊版 Cloud Functions（單人版用不到，留著參考）
├── firestore.rules       只有擁有者能進，submissions 不可變
├── firestore.indexes.json
├── storage.rules
└── docs/
```

---

## 技術

Next.js 14（靜態輸出）· Firebase Auth / Firestore / Storage / Hosting · Tailwind CSS

單人版核心流程不需要 Cloud Functions，`firebase.json` 已經把 functions 拿掉了。
