// ============================================
// 獨角獸 - Unicorn DataCaptureSystem
// TypeScript 型別定義
// ============================================

// ============================================
// 🦄 UNICORN: Superuser Emails
// ============================================
export const SUPERUSER_EMAILS = ['tong@dbyv.org', 'jason@dbyv.org', 'joeshi@dbyv.org']

// ============================================
// 🦄 UNICORN: Fixed Keys（固定欄位 KEY）
// 這些是系統固定的欄位 KEY，不可由使用者新增
// KEY 跨所有表格統一，但 LABEL 可以不同
// ============================================

export const FIXED_KEYS = {
  // Number 類型
  quantity1: { type: 'number', label: '數量A' },
  quantity2: { type: 'number', label: '數量B' },
  quantity3: { type: 'number', label: '數量C' },
  
  // Text 類型（單行）
  title: { type: 'text', label: '單行文字' },
  
  // Textarea 類型（多行）
  note: { type: 'textarea', label: '多行文字' },
  
  // DateTime 類型（格式：yyyymmdd hh:mm）
  dateTimeStart: { type: 'datetime', label: '開始日期時間' },
  dateTimeEnd: { type: 'datetime', label: '結束日期時間' },
  
  // Date 類型（只有日期）
  dateOnlyStart: { type: 'date', label: '開始日期' },
  dateOnlyEnd: { type: 'date', label: '結束日期' },
  
  // File 類型
  upload: { type: 'file', label: '檔案上傳' },
} as const

export type FixedKey = keyof typeof FIXED_KEYS

// ============================================
// 🦄 UNICORN: OptionSet Keys（動態欄位 KEY）
// 這些 KEY 來自 Firestore optionSets 的 code 欄位
// Superuser 可以透過新增 OptionSet 來增加新的 KEY
// ============================================
// 不在此定義，由 Firestore 動態提供

// 向後相容：UniversalKey 包含 FixedKey 和動態的 OptionSet codes
export type UniversalKey = FixedKey | string

// ---------- 欄位型別 ----------
export type FieldType = 
  | 'text' 
  | 'number' 
  | 'date' 
  | 'datetime'
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
// 🦄 UNICORN: key 必須是 Universal Key
export interface FieldDefinition {
  key: UniversalKey              // 🦄 必須是 Universal Key
  type: FieldType
  label: string                  // 🦄 Leader 自由設計的顯示名稱
  required: boolean
  order: number
  helpText?: string
  
  // 日期配對
  dateRole?: 'start' | 'end'
  datePartner?: UniversalKey
  
  // Dropdown 專用（對應 optionSet）
  optionSetId?: string
  multiple?: boolean
  
  // Reference 專用
  refConfig?: RefConfig
  
  // Computed 專用（Stage 1 佔位）
  computeConfig?: ComputeConfig
}

// ---------- Template DevMeta（Developer 備忘）----------
export interface DevMeta {
  purpose: string
  intendedUsers: string
  outputAction: string
  connectedSource: string
  retrievalHint: string
  precautions: string
}

// ---------- Template（表格定義）----------
export interface Template {
  id?: string
  name: string
  moduleId: string
  actionId: string
  enabled: boolean
  version: number
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  fields: FieldDefinition[]
  defaults?: Record<UniversalKey, unknown>
  
  // 🦄 UNICORN: Phase 1 - Form Management
  _isDraft?: boolean             // true = draft (not published), false/undefined = published
  description?: string           // Form description (shown to staff)
  devMeta?: DevMeta              // Developer notes (shown in Developer Console)
  accessType?: 'all' | 'whitelist'  // Who can fill this form
  accessWhitelist?: string[]     // Allowed emails (if accessType is whitelist)
  managerEmails?: string[]       // Up to 5 managers who can edit this form
  _createdMonth?: string         // YYYY-MM format for efficient queries (e.g., "2026-01")
}

// ---------- Reference 欄位值 ----------
export interface RefValue {
  refSubmissionId: string
  refTemplateId: string
  refLabelSnapshot: string
}

// ---------- 檔案資訊 ----------
export interface FileInfo {
  fieldKey: UniversalKey
  driveFileId: string
  name: string
  mimeType: string
  size: number
  webViewLink: string
  uploadedAt: string
  uploadedBy: string
}

// ---------- Submission（提交資料）----------
// 🦄 UNICORN: Universal KEY 設計
export type SubmissionStatus = 'ACTIVE' | 'CANCELLED' | 'LOCKED'

export interface Submission {
  id?: string
  
  // ===== 系統 Metadata（_ 前綴）=====
  _templateId: string
  _templateModule: string
  _templateAction: string
  _templateVersion: number
  _submitterId: string
  _submitterEmail: string
  _submittedAt: Date | string
  _submittedMonth: string              // 🦄 UNICORN: Period key (YYYY-MM)
  _status: SubmissionStatus
  
  // 🦄 UNICORN: Submission workflow fields
  _isLocked?: boolean
  _lockedAt?: Date | string
  _lockedBy?: string
  _reverseOf?: string
  _correctFor?: string
  
  // ===== 用戶資料（Universal KEY: VALUE）=====
  // Fixed Keys（固定欄位）
  quantity1?: number
  quantity2?: number
  quantity3?: number
  title?: string
  note?: string
  dateTimeStart?: string               // 格式：yyyymmdd hh:mm
  dateTimeEnd?: string
  dateOnlyStart?: string               // 格式：yyyymmdd
  dateOnlyEnd?: string
  upload?: FileInfo[]
  
  // OptionSet Keys（動態欄位，由 optionSets.code 決定）
  // 例如：school, department, service, project 等
  // 使用 [key: string] 允許任意 OptionSet code
  [key: string]: unknown
  
  // ===== 欄位 LABEL 快照（顯示用）=====
  _fieldLabels: Record<string, string>
  
  // ===== 選項 LABEL 快照（如果 value ≠ label）=====
  _optionLabels?: Record<string, string>
  
  // ===== 檔案 =====
  files: FileInfo[]
  
  // ===== Denormalized 欄位（供查詢）=====
  _dateStart?: string | null
  _dateEnd?: string | null
  _refIds?: string[]
  
  // ===== 更正鏈 =====
  supersedesSubmissionId?: string
}

// ---------- OptionSet（下拉選項池）----------
// 🦄 UNICORN: Governed Dictionary - Meaning Layer
export type OptionStatus = 'staging' | 'active' | 'deprecated'

export interface OptionItem {
  value: string                    // 🦄 UNICORN: Immutable code (query key)
  label: string                    // 🦄 UNICORN: Display name (can change via request)
  status: OptionStatus
  sort: number
  
  createdAt?: Date | string
  createdBy?: string
  approvedAt?: Date | string
  approvedBy?: string
  deprecatedAt?: Date | string
  deprecatedBy?: string
  mergedInto?: string
  
  labelHistory?: Array<{
    label: string
    changedAt: Date | string
    changedBy: string
    reason?: string
  }>
}

export interface OptionSet {
  id?: string
  code: UniversalKey               // 🦄 UNICORN: 必須對應 Universal Key
  name: string
  description?: string
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  items: OptionItem[]
  
  // 🦄 UNICORN: Master/Subset OptionSet 設計
  // 多個 OptionSet 可以共用同一個 Universal KEY（code）
  // Master 包含完整選項，Subset 只包含部分選項
  isMaster?: boolean               // true = 完整清單，false/undefined = 子集
  masterSetId?: string             // 子集指向 Master 的 ID
}

// ---------- Option Request（選項變更申請）----------
export type OptionRequestType = 'add' | 'rename' | 'merge' | 'deprecate' | 'activate'
export type OptionRequestStatus = 'pending' | 'approved' | 'rejected'

export interface OptionRequestPayload {
  code?: string
  label?: string
  oldLabel?: string
  newLabel?: string
  sourceCode?: string
  targetCode?: string
  reason?: string
}

export interface OptionRequest {
  id?: string
  setId: string
  setName?: string
  type: OptionRequestType
  payload: OptionRequestPayload
  status: OptionRequestStatus
  requestedAt: Date | string
  requestedBy: string
  reviewedAt?: Date | string
  reviewedBy?: string
  reviewNote?: string
}

// ---------- Option Alias（合併映射）----------
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
// 🦄 UNICORN: Phase 1 - User Interaction Collections
// ============================================

// ---------- User form usage statistics (for "most used", "recently used") ----------
export interface UserFormStats {
  id?: string
  userEmail: string
  templateId: string
  templateName: string
  useCount: number
  lastUsedAt: Date | string
  isFavorite: boolean
}

// ---------- Form access requests ----------
export interface FormAccessRequest {
  id?: string
  templateId: string
  templateName: string
  requesterEmail: string
  ownerEmail: string
  managerEmails: string[]
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: Date | string
  reviewedAt?: Date | string
  reviewedBy?: string
  _notifiedAt?: Date | string  // 🦄 UNICORN: Idempotency for email notifications
}

// ---------- Template suggestions from users ----------
export interface TemplateSuggestion {
  id?: string
  templateId: string
  templateName: string
  suggesterEmail: string
  suggestions: Record<string, string>  // fieldKey -> suggestion text
  generalNotes?: string
  status: 'pending' | 'reviewed' | 'implemented'
  createdAt: Date | string
  reviewedAt?: Date | string
  reviewedBy?: string
  _notifiedAt?: Date | string  // 🦄 UNICORN: Idempotency for email notifications
}

// ---------- Form name registry (for duplicate prevention) ----------
export interface FormNameRegistry {
  id?: string  // normalized name as ID
  originalName: string
  templateId: string
  templateType: 'draft' | 'official'
  createdAt: Date | string
}

// ============================================
// 🦄 UNICORN: Draft System (Sandbox Layer)
// ============================================

export type DraftStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

export interface OptionSetDraft {
  id?: string
  code: UniversalKey               // 🦄 必須對應 Universal Key
  name: string
  description?: string
  items: Array<{
    value: string
    label: string
  }>
  status: DraftStatus
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  submittedAt?: Date | string
  reviewedAt?: Date | string
  reviewedBy?: string
  reviewNote?: string
  createdOptionSetId?: string
  
  // 🦄 UNICORN: Master/Subset 設計
  isMaster?: boolean               // true = 完整清單，false = 子集
  masterSetId?: string             // 子集指向 Master 的 ID
}

export interface TemplateDraft {
  id?: string
  name: string
  moduleId: string
  actionId: string
  fields: FieldDefinition[]
  defaults?: Record<UniversalKey, unknown>
  usedDraftOptionSetIds?: string[]
  status: DraftStatus
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  submittedAt?: Date | string
  reviewedAt?: Date | string
  reviewedBy?: string
  reviewNote?: string
  createdTemplateId?: string
  
  // 🦄 UNICORN: Phase 1 - Form Management (same as Template)
  description?: string
  accessType?: 'all' | 'whitelist'
  accessWhitelist?: string[]
  managerEmails?: string[]
}
