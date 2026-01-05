// ============================================
// 獨角獸 - Unicorn DataCaptureSystem
// TypeScript 型別定義
// ============================================

// ============================================
// 🦄 UNICORN: Universal Keys
// 這些是系統固定的欄位 KEY，Leader 只能從中選擇
// KEY 跨所有表格統一，但 LABEL 可以不同
// ============================================

export const UNIVERSAL_KEYS = {
  // OptionSet 類型（值來自選項池）
  school: { type: 'optionSet', description: '學校' },
  service: { type: 'optionSet', description: '服務類型' },
  project: { type: 'optionSet', description: '項目' },
  format: { type: 'optionSet', description: '格式' },
  action: { type: 'optionSet', description: '動作類型' },
  department: { type: 'optionSet', description: '部門' },
  status: { type: 'optionSet', description: '狀態' },
  category: { type: 'optionSet', description: '分類' },
  
  // DateTime 類型（格式：yyyymmdd hh:mm）
  startDateTime: { type: 'datetime', description: '開始時間' },
  endDateTime: { type: 'datetime', description: '結束時間' },
  
  // Number 類型
  quantity1: { type: 'number', description: '數量1' },
  quantity2: { type: 'number', description: '數量2' },
  quantity3: { type: 'number', description: '數量3' },
  amount1: { type: 'number', description: '金額1' },
  amount2: { type: 'number', description: '金額2' },
  
  // Text 類型（單行）
  notes1: { type: 'text', description: '備註1（單行）' },
  title: { type: 'text', description: '標題' },
  name: { type: 'text', description: '名稱' },
  
  // Textarea 類型（多行）
  notes2: { type: 'textarea', description: '備註2（多行）' },
  description: { type: 'textarea', description: '描述' },
  content: { type: 'textarea', description: '內容' },
  
  // File 類型
  attachment: { type: 'file', description: '附件' },
  documents: { type: 'file', description: '文件' },
  
  // Reference 類型
  reference: { type: 'reference', description: '引用' },
} as const

export type UniversalKey = keyof typeof UNIVERSAL_KEYS

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
export type SubmissionStatus = 'ACTIVE' | 'CANCELLED'

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
  
  // ===== 用戶資料（Universal KEY: VALUE）=====
  // 動態欄位，key 是 UniversalKey，value 是標準化的值
  school?: string
  service?: string
  project?: string
  format?: string
  action?: string
  department?: string
  status?: string
  category?: string
  startDateTime?: string               // 格式：yyyymmdd hh:mm
  endDateTime?: string
  quantity1?: number
  quantity2?: number
  quantity3?: number
  amount1?: number
  amount2?: number
  notes1?: string
  notes2?: string
  title?: string
  name?: string
  description?: string
  content?: string
  reference?: RefValue
  
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
}
