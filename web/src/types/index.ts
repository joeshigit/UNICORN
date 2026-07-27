// ============================================
// 🦄 UNICORN Capture（單人版）— 型別定義
//
// 四層架構（Unicorn Architecture）
//   Meaning      → optionSets   （選項池 / 字典）
//   Template     → templates    （表格定義）
//   Submission   → submissions  （單一資料池，不可變事件）
//   Derived View → 寫入當下就算好並存進 submission 的欄位（_ 前綴）
// ============================================

// ---------- 欄位型別 ----------
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'dropdown'
  | 'file'

// ---------- 欄位定義 ----------
// key 必須是 Universal KEY（FIXED_KEYS 或 optionSet.code）
export interface FieldDefinition {
  key: string
  type: FieldType
  label: string
  required: boolean
  order: number
  helpText?: string
  optionSetId?: string
  multiple?: boolean
}

// ---------- Template（表格定義）----------
export interface Template {
  id?: string
  name: string
  moduleId: string
  actionId: string
  description?: string
  enabled: boolean
  version: number
  fields: FieldDefinition[]
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
  _createdMonth: string
}

// ---------- OptionSet（選項池 / Meaning Layer）----------
export type OptionStatus = 'active' | 'deprecated'

export interface OptionItem {
  value: string
  label: string
  status: OptionStatus
  sort: number
}

export interface OptionSet {
  id?: string
  code: string
  name: string
  description?: string
  isMaster: boolean
  masterSetId?: string
  items: OptionItem[]
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
}

// ---------- 檔案 ----------
export interface FileInfo {
  fieldKey: string
  path: string
  name: string
  mimeType: string
  size: number
  url: string
  uploadedAt: string
  uploadedBy: string
}

// ---------- Submission（單一資料池）----------
export type SubmissionStatus = 'ACTIVE' | 'VOID'

export interface Submission {
  id?: string

  // 系統 metadata（寫入當下凍結）
  _templateId: string
  _templateName: string
  _templateModule: string
  _templateAction: string
  _templateVersion: number
  _submitterEmail: string
  _submittedAt: unknown
  _submittedMonth: string
  _status: SubmissionStatus

  // 更正鏈：_isLatest 為 true 代表這是該筆紀錄的最新狀態
  _isLatest: boolean
  _supersedes?: string
  _supersededBy?: string

  // 顯示快照
  _fieldLabels: Record<string, string>
  _optionLabels: Record<string, string>
  _fieldKeys: string[]

  // 檔案
  files: FileInfo[]

  // 用戶資料以 Universal KEY 平鋪在頂層
  [key: string]: unknown
}
