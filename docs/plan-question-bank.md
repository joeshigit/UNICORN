# 計畫：題庫（Question Bank）

> 狀態：設計草案（尚未實作）  
> 前提：已有 optionSets、Universal KEY、choice／scale／矩陣、單一 submissions 池

---

## 0. 先對齊：optionSet ≠ 題型

口語上常說「選項池題」——但在 Unicorn 裡要分兩層：

| 概念 | 層 | 回答什麼問題 | 現況 |
|------|----|--------------|------|
| **optionSet** | Meaning（字典） | 「這個 KEY 允許哪些 **VALUE**？」 | ✅ 已有 |
| **FieldDefinition** | Template（表格） | 「這張表要問什麼、怎麼顯示？」 | ✅ 嵌在 templates |
| **題庫** | Meaning 旁支／建表素材 | 「常用的**題幹＋題型設定**如何重用？」 | ❌ 未做 |

- `dropdown`／`choice`：**引用** optionSet（VALUE 標準化）
- `scale`／`text`／`date`…：**不**靠 optionSet；刻度／格式是系統輸入方式
- **題庫不是第四種答案來源**，也不是新的 submission 巢狀結構

```
optionSet  → 標準化「答案可以是什麼」
題庫       → 標準化「題目怎麼問」（建表時插入）
template   → 凍結「這張表問了哪些題」
submission → 凍結「這次答了什麼」（扁平 Universal KEY）
```

這正好對上 Unicorn 目標 1（標準化建表）＋目標 2（Universal KEY）＋目標 3（單一資料池）。

---

## 1. 為什麼現在需要題庫

已完成的能力：

- Leader 可重用 **選項池、module、action**
- 建表可選 FIXED_KEYS（含 `rating1…20`）或 optionSet.code
- choice／scale／矩陣批次已能快速加「一題或一批量表」
- 整表可 `copy=` 複製

仍缺的痛點：

- 同一句題幹（「整體滿意度」「特殊飲食需求」）要在多張表重複手打 label／help／scalePoints／optionSet
- 矩陣批次只解決「一次貼多行量表」，**不能跨表命名保存、分類、搜尋**
- optionSet 只複用 **選項清單**，不複用 **題幹與題型設定**

題庫補的是：**建表素材庫**，不是填表時動態組卷。

---

## 2. 建議定位（核心決策）

### 建議採用：**靜態題庫＝可命名的欄位片段（Field Snippet）**

每一筆題庫項目描述「插入建表器後會變成什麼 `FieldDefinition`」，在 **建表當下** 展開並寫進 `templates.fields`。

展開後與手建欄位**完全等價**：

- submission **不知道**這題來自題庫
- 查詢仍用 Universal KEY（`school`、`rating3`…）
- 改題庫 **不改** 既有模板／既有 submission（模板已快照欄位定義）

### 明確不做（本階段）

| 不做 | 原因 |
|------|------|
| 填表時 live 從題庫抽題、動態少題 | 破壞「同表同形狀」、空白＝值 |
| 題庫內嵌私有選項清單（繞過 optionSet） | 破壞 VALUE 標準化 |
| 自訂 KEY（`q_satisfaction`、中文 key） | 違反 Universal KEY |
| submission 巢狀 `questions[]`／matrix 物件 | 違反扁平單一池 |
| Workspace／Sheets 同步題庫 | 另一產品線 |
| 「動態題庫＝用舊 submission 當選項」 | Theme paper 的 reference 構想，另開計畫 |

---

## 3. 資料模型建議

### Collection：`questionBank`（Meaning 旁支／建表字典）

層級標籤：**Meaning（建表素材）** —— 不是 Submission，不是 Derived View。

```js
{
  id: "qb_...",
  // —— 瀏覽／治理 ——
  name: "整體滿意度（5點）",          // 庫內顯示名
  tags: ["滿意度", "活動後"],         // 可選，方便篩選（非 query KEY）
  moduleHints: ["CAMP"],              // 可選，建議用在哪些 module（不強制）
  status: "active" | "deprecated",
  kind: "single" | "bundle",          // 單題 or 一批（如矩陣）

  // —— 展開成 FieldDefinition 的原料 ——
  // single：
  type: "scale" | "choice" | "dropdown" | "text" | "textarea" | "number" | "date" | "time" | "file",
  defaultLabel: "整體滿意度",
  helpText: "數字愈大愈正面",
  requiredDefault: false,
  // KEY 策略（見 §4）
  keyPolicy: "fixed" | "allocate" | "optionSetCode",
  fixedKey?: "eventDate",             // keyPolicy=fixed
  optionSetCode?: "school",           // keyPolicy=optionSetCode
  preferredOptionSetId?: "...",       // Master 或子集；插入時可改
  multipleDefault?: false,            // choice/dropdown
  scalePoints?: 5,                    // scale
  inputModeDefault?: "open",

  // bundle（可選，第二階段）：
  // items: [ { defaultLabel, type: "scale", scalePoints: 5 }, ... ]
  // 插入時一次 allocate 多個 rating*

  createdBy, createdAt, updatedAt,
}
```

### 寫入時決策

| 衍生／決定 | 何時 | 誰 | 鎖定 |
|------------|------|----|------|
| 題庫 → 模板 `fields[]` | Leader 按「加入題庫題」 | UI | 寫進 template 即與手建欄位無異 |
| 模板 version | 存模板 | 既有流程 | 既有 |
| submission 答案 | 填表送出 | 既有 `buildSubmissionDoc` | 既有 |

**題庫文件本身不進 submission。**

---

## 4. KEY 策略（最重要）

題庫**禁止**發明新 KEY。插入時只能落到既有槽位：

| 題型 | keyPolicy | 插入行為 |
|------|-----------|----------|
| dropdown／choice | `optionSetCode` | KEY＝`optionSet.code`；同表已占用則**拒絕插入**（正確：一表一學校） |
| scale | `allocate` | 用現有 `allocateRatingKeys` 取下一個空的 `ratingN`；不夠則報錯 |
| text／textarea／number／date／… | `allocate` 或 `fixed` | 分配下一個空的 `textN`／`note*` 等，或指定固定 KEY（如 `eventDate`） |
| bundle（多題量表） | `allocate` × N | 等同今日矩陣批次，但可命名保存 |

### 為什麼 scale／文字預設用 allocate，不在題庫鎖死 `rating1`

- 跨表「整體滿意度」若都鎖 `rating1`，語意可對齊查詢（好）
- 但同一張表若從題庫加兩題滿意度相關，第二題會撞 KEY（壞）
- **折衷建議：**
  - 題庫可選填 `preferredKey`（例如希望用 `rating1`）
  - 插入時：若空則用 preferred；若占用則自動 allocate 下一個，並在 UI 提示「已改用 rating4」
  - Leader 仍可在建表器改 KEY／LABEL

跨表要統計同一語意 → Leader 應**有意識地**讓多張表共用同一 KEY（這是 Unicorn 的設計意圖，不是題庫自動保證）。

---

## 5. 與 optionSet 的關係（對照表）

| | optionSet | 題庫 |
|--|-----------|------|
| 複用什麼 | VALUE 清單 | 題幹＋題型設定 |
| 誰引用 | Template field.optionSetId | 建表器「插入」一次 |
| 改它影響舊 submission？ | 不改舊文件（VALUE 已寫死）；新填表 live 讀選項 | 不改舊模板（已展開） |
| Master／Subset | ✅ | 題庫只記 preferredOptionSetId；插入後仍可改子集 |
| 跨表查詢 | `where('school', …)` | 不直接查題庫；查的是展開後的 KEY |

**一個完整的「學校題」= 題庫條目（label／choice）＋ optionSet（school 的 VALUE）。**  
缺一邊都不完整：只有 optionSet 沒有題幹標準；只有題庫內嵌選項會破壞字典。

---

## 6. UI／流程建議（對齊現有 Console）

### 新頁（或 Options 旁）

- **題庫列表**：搜尋 name／tags；篩 type／status
- **編輯單題／bundle**：表單類似建表器單一欄位卡，但不選 order（插入時才有）
- 權限：建議與 optionSets 相同（組織可讀；Superuser 可寫）——第一版可先 Superuser only，降低治理風險

### 建表器（`forms/edit`）

在「矩陣批次」旁加一區：

1. 搜尋題庫 → 預覽將插入的欄位（KEY／label／type）
2. 「加入」→ 跑 keyPolicy → 失敗顯示原因（KEY 衝突／rating 空位不足）
3. 成功後欄位出現在既有欄位列表，可再改 label／required／optionSet 子集

### 不做

- 填報頁不讀題庫
- 資料池不顯示「來自題庫」

---

## 7. Unicorn 自檢（必須全 YES）

1. 重要決策存成欄位？→ 題庫存素材；模板存展開後 fields；submission 存答案  
2. 零讀時計算？→ 填表不組卷  
3. Submissions 不可變？→ 不變  
4. Templates 是資料？→ 不變；題庫也是資料  
5. UI 查詢無 join？→ 查 submission KEY，不 join 題庫  
6. 故意接受複製？→ 題幹複製進每張模板 ✅  
7. 分析與操作分離？→ 題庫不進分析查詢路徑  

禁止：自訂 KEY、巢狀 questions、讀時聚合「題庫版本答案」。

---

## 8. 分階段實作建議

### Phase A — 單題靜態題庫（建議先做）

**範圍：**

- collection `questionBank`，`kind: "single"`
- types + CRUD + rules
- Console：題庫列表／編輯
- 建表器：搜尋＋插入（含 keyPolicy：optionSetCode／allocate rating／fixed）
- 支援 type：至少 `scale`、`choice`、`dropdown`、`text`、`textarea`（其餘可跟）
- 文件：architecture 取消「題庫不在範圍」，改寫本節摘要
- 測試：allocate／衝突／cleanFields 不受影響

**白名單取向（實作時再鎖）：**  
types、db、rules、options 旁新頁或 `question-bank/*`、forms/edit 插入 UI、architecture、pure tests。  
**不動：** browse 查詢語意、submission 形狀、indexes（除非新 collection 無關）。

### Phase B — Bundle（命名矩陣）

- `kind: "bundle"`：多行 scale（或混合）一次插入
- 內部重用 `expandScaleMatrixFields`
- 取代「每次重貼矩陣文字」的痛點

### Phase C — 治理加強（可選）

- tags／moduleHints 篩選
- deprecated 題庫不可插入
- 從現有模板欄位「存進題庫」
- preferredKey 語意對齊建議（跨表同 KEY 提示，不強制）

### 刻意留給更後

- 動態組卷、答題分支、題目版本對 submission 追溯  
- Submission-as-options（reference）  
- 自動擴充 FIXED_KEYS 容量策略（若問卷需求爆槽，另開 KEY capacity 計畫）

---

## 9. 風險與取捨

| 風險 | 說明 | 緩解 |
|------|------|------|
| KEY 槽用盡 | `rating1–20`、`text1–4` 有限 | 插入報錯；必要時另開「擴充 FIXED_KEYS」 |
| 誤以為跨表自動可比 | 兩張表都從題庫加「滿意度」但 KEY 不同 | UI 顯示將使用的 KEY；文件強調「可比靠 KEY 不是靠題庫名」 |
| 題庫變第二套選項池 | 有人想在題庫填選項 | 禁止；choice 必須綁 optionSetCode |
| 權限過寬 | 人人改題庫造成組織語意混亂 | 第一版寫入限 Superuser |

---

## 10. 一句話產品定義

> **optionSet 標準化「能選什麼」；題庫標準化「常問什麼」；兩者都在建表時組裝進 template；submission 只看見扁平 Universal KEY。**

這與已上線的 choice／scale／矩陣一致：矩陣是「一次性 bundle」；題庫是「可命名、可治理、可跨表重用的 bundle／單題素材」。
