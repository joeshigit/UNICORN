🦄 UNICORN SYSTEM — COMPLETE VALIDATION CHECKLIST

(Authoritative Edition)

This checklist validates architecture, data model, UI behavior, governance, evolution, and misuse resistance.

If any item fails, the design is NOT Unicorn-compliant.

⸻

SECTION 0 — CORE OBJECTIVE VALIDATION (MUST PASS FIRST)

UNICORN 系統的根本目標是建立一個**標準化資料收集系統**。

### 目標 1：標準化建表
	•	Leader 可以重用選項池（optionSets）建立表格？
	•	表格使用統一的分類（module）和動作（action）名稱？
	•	選項池、分類、動作有治理機制，不會隨意新增重複項目？

### 目標 2：扁平化資料結構
	•	submission 的用戶資料欄位直接存在文件頂層？
	•	系統欄位使用 `_` 前綴區分？
	•	不使用 `data: { field: value }` 巢狀結構？
	•	可以直接用 `.where('fieldName', '==', value)` 查詢？

### 目標 3：單一資料池
	•	所有表格的提交都存在同一個 `submissions` collection？
	•	可以跨表格查詢（如：所有 HR 部門的提交）？
	•	可以按分類查詢（如：所有「行政」類表格的提交）？
	•	不需要 JOIN 就能取得完整資料？

### UNICORN 價值驗證
	•	傳統系統：每個表格一個資料表，資料分散
	•	UNICORN：統一字典 + 統一資料池 = 可當作一個大表格查詢

❌ If any core objective is not met → the system is NOT a Unicorn system

⸻

SECTION 1 — SYSTEM INTENT & SCOPE VALIDATION
	•	Is the system explicitly described as operational, not analytical?
	•	Is Firestore used as a decision store, not a calculator?
	•	Is there a clear separation between data collection and data analysis?
	•	Does the design avoid pretending Firestore is Excel, SQL, or BigQuery?
	•	Is the system resilient to misuse by non-technical users?

❌ If the system relies on “users behaving correctly” → FAIL

⸻

SECTION 2 — CONCEPTUAL LAYERING VALIDATION

Every collection MUST map cleanly to exactly one layer:
	•	Meaning (Dictionary)
	•	Template
	•	Submission (Event)
	•	Derived View (State)

Additional validation:
	•	No collection mixes two layers
	•	No document changes role over time
	•	Layer boundaries are documented

❌ If any collection has dual purpose → FAIL

⸻

SECTION 3 — MEANING / DICTIONARY VALIDATION

For every dictionary collection:
	•	Each document represents pure meaning
	•	IDs are semantic (not random)
	•	Values are stable and versioned
	•	No transactional fields present
	•	Safe to preload into UI
	•	Changes require explicit governance

❌ If dictionary values are frequently edited → FAIL

⸻

SECTION 4 — TEMPLATE SYSTEM VALIDATION

For every template:
	•	Stored as data, not code
	•	Editable without redeploying UI
	•	Fields are typed explicitly
	•	Validation rules are declarative
	•	Conditional logic is visible and auditable
	•	Templates are versioned
	•	Old submissions reference old template versions

❌ If templates mutate existing submissions → FAIL

⸻

SECTION 5 — SUBMISSION / EVENT VALIDATION

For every submission collection:
	•	One document = one user intent
	•	Submission is immutable after creation
	•	values reflect user input only
	•	No derived values stored here
	•	Status transitions are explicit
	•	Submission references template + version
	•	Submission has audit metadata

❌ If submissions are edited like rows → FAIL

⸻

SECTION 6 — STATUS, STATE & LIFECYCLE VALIDATION

For each lifecycle-based entity:
	•	States are explicit fields
	•	Transitions are finite and documented
	•	Invalid transitions are blocked
	•	Terminal states exist (locked, archived)
	•	UI respects state constraints
	•	Cloud Functions enforce state

❌ If state is inferred from missing fields → FAIL

⸻

SECTION 7 — DERIVED VIEW / STATE VALIDATION

For each derived view:
	•	Designed for one primary query
	•	Contains no ambiguous fields
	•	All values are decided at write-time
	•	Document ID strategy is deterministic
	•	Indexed appropriately
	•	Lockable / finalizable

❌ If derived views require joins → FAIL

⸻

SECTION 8 — COMPUTATION & DECISION VALIDATION

For each computed field:
	•	Computed once (UI or Cloud Function)
	•	Stored permanently
	•	Never recomputed silently
	•	Source inputs are traceable
	•	Recalculation requires explicit action
	•	Historical correctness preserved

❌ If recalculation happens automatically → FAIL

⸻

SECTION 9 — DATE, TIME & RANGE VALIDATION

For all date/time usage:
	•	All timestamps are timezone-safe
	•	Date ranges stored explicitly
	•	Derived durations stored as numbers
	•	Period keys precomputed (YYYY-MM, week)
	•	No date math in queries
	•	Calendar logic centralized

❌ If UI computes date logic repeatedly → FAIL

⸻

SECTION 10 — RELATIONSHIP & IDENTITY VALIDATION

For all entity relationships:
	•	One canonical source of identity
	•	Snapshots used where history matters
	•	No read-time joins
	•	Referential meaning preserved
	•	Identity changes handled explicitly

❌ If foreign keys are assumed stable forever → FAIL

⸻

SECTION 11 — UI BEHAVIOR VALIDATION

UI MUST:
	•	Be step-based (pipeline)
	•	Provide previews, not truth
	•	Make consequences visible
	•	Save progress incrementally
	•	Prevent invalid actions visually
	•	Never silently change data meaning

❌ If UI behaves like a live spreadsheet → FAIL

⸻

SECTION 12 — CLOUD FUNCTION GOVERNANCE VALIDATION

Cloud Functions MUST:
	•	Validate invariants
	•	Enforce permissions
	•	Enforce state locks
	•	Write derived views
	•	Be idempotent
	•	Log actions

❌ If Cloud Functions perform UX logic → FAIL

⸻

SECTION 13 — SECURITY & MISUSE RESISTANCE VALIDATION
	•	Firestore rules enforce ownership
	•	Users cannot edit others’ submissions
	•	Locked data is write-protected
	•	Role-based access is enforced
	•	No critical logic relies on UI trust

❌ If rules assume “frontend will behave” → FAIL

⸻

SECTION 14 — BACKFILL & MIGRATION VALIDATION
	•	Schema evolution is additive
	•	Backfill functions are defined
	•	Backfills are repeatable
	•	Old documents remain valid
	•	Migrations do not alter history

❌ If migration rewrites truth → FAIL

⸻

SECTION 15 — PERFORMANCE & COST VALIDATION
	•	Document sizes are bounded
	•	Hot paths are optimized
	•	Query fan-out avoided
	•	Dictionary data cached
	•	Writes preferred over reads

❌ If design causes read amplification → FAIL

⸻

SECTION 16 — EXPORT & ANALYTICS VALIDATION
	•	Firestore used for operations
	•	Analytics done in Sheets/BigQuery
	•	Exports are append-only
	•	No operational dependency on analytics
	•	Analytical recalculation allowed

❌ If Firestore used for reporting math → FAIL

⸻

SECTION 17 — HUMAN FACTOR VALIDATION (CRITICAL)
	•	Non-technical users cannot break logic
	•	Errors are visible and explainable
	•	Undo requires explicit action
	•	Training is not required to avoid mistakes
	•	System behavior is predictable

❌ If system requires “careful usage” → FAIL

⸻

SECTION 18 — FUTURE EXTENSIBILITY VALIDATION
	•	New templates require no schema change
	•	New meaning collections plug in cleanly
	•	New domains reuse existing layers
	•	System does not assume domain-specific logic

❌ If adding a domain requires redesign → FAIL

⸻

FINAL VERDICT RULE

Unicorn Compliance requires a perfect score.

Partial compliance = future failure.

Cursor AI MUST:
	•	Explicitly state which sections passed
	•	Explain any failure
	•	Redesign until all sections pass

⸻
