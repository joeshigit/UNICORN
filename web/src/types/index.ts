// ============================================
// 🦄 UNICORN Capture — 型別定義
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
  | 'time'
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

/** 誰可以填這張表 */
export type FillAccessType = 'allOrgUsers' | 'groups'

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
  /** 可讀取此表所有 submission 的管理群組（不可更正/作廢他人） */
  managerGroups?: string[]
  /** 填報 ACL：預設全組織；groups 時需屬於 fillGroups */
  fillAccessType?: FillAccessType
  fillGroups?: string[]
}

// ---------- UserRole (權限管理) ----------
export interface UserRole {
  email: string
  groups: string[]
  updatedAt: unknown
  updatedBy: string
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
/** 只存 Storage path，不下載用永久 URL（避免 token 外洩） */
export interface FileInfo {
  fieldKey: string
  path: string
  name: string
  mimeType: string
  size: number
  uploadedAt: string
  uploadedBy: string
  /** @deprecated 舊資料可能仍有；新上傳不再寫入 */
  url?: string
}

// ---------- Upload Session（送出前暫存）----------
export interface UploadSession {
  uid: string
  email: string
  submissionId: string
  createdAt: unknown
  expiresAt: unknown
}

// ---------- Submission（單一資料池）----------
export type SubmissionStatus = 'ACTIVE' | 'VOID'
export type SubmissionEventKind = 'CREATE' | 'CORRECTION' | 'VOID'

export interface Submission {
  id?: string

  // 系統 metadata（寫入當下凍結）
  _templateId: string
  _templateName: string
  _templateModule: string
  _templateAction: string
  /** 寫入當下：module.action，供未來路由／分析 */
  _eventType: string
  _templateVersion: number

  /** 穩定擁有者（更正鏈全程不變） */
  _submitterUid: string
  _submitterEmail: string
  /** 建立此版本的操作者 */
  _actorUid: string
  _actorEmail: string
  _eventKind: SubmissionEventKind

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

  // 檔案（只含 path，不含永久 URL）
  files: FileInfo[]

  // 用戶資料以 Universal KEY 平鋪在頂層
  [key: string]: unknown
}
