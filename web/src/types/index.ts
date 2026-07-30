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
  | 'choice'
  | 'scale'
  | 'file'

/** 量表刻度點數（輸入方式，不是 optionSet） */
export type ScalePoints = 3 | 4 | 5 | 10 | 100

/**
 * 輸入方式。與 required（必答／可選答）是兩個正交的維度：
 *   required 決定「空白算不算答案」
 *   inputMode 決定「使用者能不能改」
 * 八種組合只有「必答 + locked + 沒有預填值」無效，那會永遠送不出去。
 */
export type FieldInputMode = 'open' | 'default' | 'locked'

/** 量表刻度 VALUE→LABEL（標準資料 snapshot；本表 rating* 可無） */
export interface ScaleValueLabel {
  value: string
  label: string
}

// ---------- 欄位定義 ----------
// key = 表單內實例身分（form-local）。optionSet 契約靠 optionSetId，不必等於 optionSet.code。
export interface FieldDefinition {
  key: string
  type: FieldType
  label: string
  required: boolean
  order: number
  helpText?: string
  optionSetId?: string
  multiple?: boolean
  /** 僅 scale；3／4／5／10／100 */
  scalePoints?: ScalePoints
  /** 標準 scale 建表時深拷貝；本表 rating* 不寫 */
  scaleValueLabels?: ScaleValueLabel[]
  /** 未設定＝open，舊模板天然相容 */
  inputMode?: FieldInputMode
  /** default 必須有；locked 可有可無（可選答時等於鎖定為空白） */
  presetValue?: string | string[]
  /** yesNo 標準題：建表時從 standardKeys.allowNa snapshot；填表/送出不 live join 名冊 */
  yesNoAllowNa?: boolean
}

/** 標準問題的答案方式（valueModel）；與 optionSet 選項池無父子關係 */
export type StandardValueModel = 'free' | 'optionSet' | 'scale' | 'yesNo'

export type StandardKeyStatus = 'active' | 'deprecated'

/**
 * Meaning：組織標準 KEY＋答案方式（valueModel，獨立於 optionSets）。
 * - optionSet 型：名冊建立時 standardKey.key === optionSet.code；建表實例可透過 optionSetId 綁定，field.key 可不同
 * - yesNo 型：答案固定 是/否/(不適用)，不需、也不應建立 optionSet Master
 */
export interface StandardKey {
  id?: string
  key: string
  meaning: string
  defaultLabel: string
  type: FieldType
  valueModel: StandardValueModel
  optionSetId?: string
  scalePoints?: ScalePoints
  scaleValueLabels?: ScaleValueLabel[]
  /** yesNo only: false = 是/否; true = 是/否/不適用（答案契約，immutable） */
  allowNa?: boolean
  status: StandardKeyStatus
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
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
  /** 每筆提交必須有名稱（自動插入 locked KEY=title 第一題） */
  requiresSubmissionTitle?: boolean
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
