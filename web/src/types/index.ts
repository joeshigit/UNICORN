// ============================================
// 獨角獸 - Unicorn DataCaptureSystem
// TypeScript 型別定義
// ============================================

// ---------- 欄位型別 ----------
export type FieldType = 
  | 'text' 
  | 'number' 
  | 'date' 
  | 'datetime'  // 日期+時間
  | 'dropdown' 
  | 'textarea' 
  | 'file' 
  | 'reference' 
  | 'computed'

// ---------- Reference 設定 ----------
export interface RefConfig {
  templateId: string
  labelFields: string[]
  labelFormat: string
  filterByDateRange?: {
    startField: string
    endField: string
    filterType: 'activeOnDate' | 'all'
    relativeTo: 'today' | string
  }
}

// ---------- Computed 設定（Stage 1 佔位）----------
export interface ComputeConfig {
  operandA: string
  operandB: string
  operator: '+' | '-' | '*' | '/'
}

// ---------- 欄位定義 ----------
export interface FieldDefinition {
  key: string
  type: FieldType
  label: string
  required: boolean
  order: number
  helpText?: string
  
  // 日期配對
  dateRole?: 'start' | 'end'
  datePartner?: string
  
  // Dropdown 專用
  optionSetId?: string
  multiple?: boolean  // 是否允許多選
  
  // Reference 專用
  refConfig?: RefConfig
  
  // Computed 專用（Stage 1 佔位）
  computeConfig?: ComputeConfig
}

// ---------- Template（表格定義）----------
export interface Template {
  id?: string
  name: string
  moduleId: string
  actionId: string
  enabled: boolean
  version: number           // 🦄 UNICORN: Template versioning
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  fields: FieldDefinition[]
  defaults?: Record<string, unknown>
}

// ---------- Reference 欄位值 ----------
export interface RefValue {
  refSubmissionId: string
  refTemplateId: string
  refLabelSnapshot: string
}

// ---------- 檔案資訊 ----------
export interface FileInfo {
  fieldKey: string          // 🦄 UNICORN: Links file to which field
  driveFileId: string
  name: string
  mimeType: string
  size: number
  webViewLink: string
  uploadedAt: string
  uploadedBy: string
}

// ---------- Submission（提交資料）----------
export type SubmissionStatus = 'ACTIVE' | 'CANCELLED'

export interface Submission {
  id?: string
  templateId: string
  templateVersion: number                    // 🦄 UNICORN: Freeze template version at submit
  moduleId: string
  actionId: string
  createdBy: string
  status: SubmissionStatus
  createdAt: Date | string
  updatedAt: Date | string
  values: Record<string, unknown>            // 🦄 UNICORN: Uses semantic field keys
  labelsSnapshot: Record<string, string>     // 🦄 UNICORN: Preserve labels for display
  files: FileInfo[]
  
  // Denormalized 欄位（供查詢）
  _dateStart?: string | null
  _dateEnd?: string | null
  _month?: string                            // 🦄 UNICORN: Period key (YYYY-MM) for queries (§9)
  _refIds?: string[]
  
  // 🦄 UNICORN: 更正鏈（如果這是一個更正，指向被更正的 submission）
  supersedesSubmissionId?: string
}

// ---------- OptionSet（下拉選項池）----------
// 🦄 UNICORN: Governed Dictionary - Meaning Layer
export type OptionStatus = 'staging' | 'active' | 'deprecated'

export interface OptionItem {
  value: string                    // 🦄 UNICORN: Immutable code (query key)
  label: string                    // 🦄 UNICORN: Display name (can change via request)
  status: OptionStatus             // 🦄 UNICORN: Lifecycle status
  sort: number
  
  // Lifecycle tracking
  createdAt?: Date | string
  createdBy?: string
  approvedAt?: Date | string       // staging → active
  approvedBy?: string
  deprecatedAt?: Date | string
  deprecatedBy?: string
  
  // Merge tracking
  mergedInto?: string              // If merged, points to new code
  
  // Label history for audit
  labelHistory?: Array<{
    label: string
    changedAt: Date | string
    changedBy: string
    reason?: string
  }>
}

export interface OptionSet {
  id?: string
  code: string                     // 🦄 UNICORN: Machine name (e.g., "school") - used as field key
  name: string                     // 🦄 UNICORN: Display name (e.g., "全澳中學")
  description?: string
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  items: OptionItem[]
}

// ---------- Option Request（選項變更申請）----------
// 🦄 UNICORN: Workflow Layer for governed dictionary
export type OptionRequestType = 'add' | 'rename' | 'merge' | 'deprecate' | 'activate'
export type OptionRequestStatus = 'pending' | 'approved' | 'rejected'

export interface OptionRequestPayload {
  // For 'add'
  code?: string
  label?: string
  
  // For 'rename'
  oldLabel?: string
  newLabel?: string
  
  // For 'merge'
  sourceCode?: string
  targetCode?: string
  
  // For 'deprecate' or 'activate'
  // Uses code above
  
  // Common
  reason?: string
}

export interface OptionRequest {
  id?: string
  setId: string                    // Which optionSet
  setName?: string                 // Denormalized for display
  type: OptionRequestType
  payload: OptionRequestPayload
  
  // Status
  status: OptionRequestStatus
  
  // Audit
  requestedAt: Date | string
  requestedBy: string
  reviewedAt?: Date | string
  reviewedBy?: string
  reviewNote?: string
}

// ---------- Option Alias（合併映射）----------
// 🦄 UNICORN: Derived View for merged options
export interface OptionAlias {
  oldCode: string
  newCode: string
  setId: string
  mergedAt: Date | string
  mergedBy: string
  reason?: string
}

// ---------- Reference 選項（API 回傳）----------
export interface ReferenceOption {
  value: string
  label: string
}

// ---------- 使用者角色 ----------
export type UserRole = 'staff' | 'leader' | 'admin'

// ============================================
// 🦄 UNICORN: Draft System (Sandbox Layer)
// ============================================

// ---------- Draft Status ----------
export type DraftStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

// ---------- OptionSet Draft（選項池草稿）----------
export interface OptionSetDraft {
  id?: string
  
  // Content (can be modified while in draft status)
  code: string                     // Suggested machine name
  name: string                     // Suggested display name
  description?: string
  items: Array<{
    value: string
    label: string
  }>
  
  // Status
  status: DraftStatus
  
  // Audit
  createdBy: string               // Only this Leader can see
  createdAt: Date | string
  updatedAt: Date | string
  submittedAt?: Date | string     // When submitted for review
  reviewedAt?: Date | string
  reviewedBy?: string
  reviewNote?: string             // Admin feedback
  
  // After approval
  createdOptionSetId?: string     // ID of the created formal OptionSet
}

// ---------- Template Draft（表格草稿）----------
export interface TemplateDraft {
  id?: string
  
  // Content (can be modified while in draft status)
  name: string
  moduleId: string
  actionId: string
  fields: FieldDefinition[]
  defaults?: Record<string, unknown>
  
  // References to draft option sets (for testing)
  usedDraftOptionSetIds?: string[]
  
  // Status
  status: DraftStatus
  
  // Audit
  createdBy: string               // Only this Leader can see
  createdAt: Date | string
  updatedAt: Date | string
  submittedAt?: Date | string     // When submitted for review
  reviewedAt?: Date | string
  reviewedBy?: string
  reviewNote?: string             // Admin feedback
  
  // After approval
  createdTemplateId?: string      // ID of the created formal Template
}

