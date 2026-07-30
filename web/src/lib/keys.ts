// ============================================
// 🦄 UNICORN: Universal KEY 目錄
//
// KEY   = 系統統一的欄位名稱，跨所有表格相同（school、quantity1…）
// LABEL = UI 顯示名稱，建表時自由設計（「入營學校」「駐守學校」…）
// VALUE = 標準化的值，dropdown 一律來自 optionSet
//
// KEY 有兩個來源：
//   1. FIXED_KEYS       — 這裡寫死的通用欄位
//   2. optionSet.code   — 每建一個選項池就多一個 dropdown KEY
// ============================================

import type {
  FieldDefinition,
  FieldType,
  ScalePoints,
  ScaleValueLabel,
  StandardKey,
  StandardValueModel,
} from '@/types'

export interface FixedKeyMeta {
  type: FieldType
  label: string
  group: string
}

/**
 * 語意化日期／時間 KEY（澳門本地牆鐘時間）。
 * Date = YYYY-MM-DD；Time = HH:mm（不帶時區偏移字串）。
 * 點事件用 eventDate + eventTime；區間用 start* / end*；未知結束就省略 end*。
 */
export const FIXED_KEYS: Record<string, FixedKeyMeta> = {
  title: { type: 'text', label: '標題', group: '文字' },
  text1: { type: 'text', label: '單行文字 1', group: '文字' },
  text2: { type: 'text', label: '單行文字 2', group: '文字' },
  text3: { type: 'text', label: '單行文字 3', group: '文字' },
  text4: { type: 'text', label: '單行文字 4', group: '文字' },
  note: { type: 'textarea', label: '多行文字 1', group: '文字' },
  note2: { type: 'textarea', label: '多行文字 2', group: '文字' },
  note3: { type: 'textarea', label: '多行文字 3', group: '文字' },

  quantity1: { type: 'number', label: '數量 1', group: '數字' },
  quantity2: { type: 'number', label: '數量 2', group: '數字' },
  quantity3: { type: 'number', label: '數量 3', group: '數字' },
  quantity4: { type: 'number', label: '數量 4', group: '數字' },
  quantity5: { type: 'number', label: '數量 5', group: '數字' },
  amount1: { type: 'number', label: '金額 1', group: '數字' },
  amount2: { type: 'number', label: '金額 2', group: '數字' },
  amount3: { type: 'number', label: '金額 3', group: '數字' },

  eventDate: { type: 'date', label: '事件日期', group: '日期時間' },
  startDate: { type: 'date', label: '開始日期', group: '日期時間' },
  endDate: { type: 'date', label: '結束日期', group: '日期時間' },
  dueDate: { type: 'date', label: '截止日期', group: '日期時間' },
  documentDate: { type: 'date', label: '文件日期', group: '日期時間' },
  effectiveDate: { type: 'date', label: '生效日期', group: '日期時間' },
  expiryDate: { type: 'date', label: '失效日期', group: '日期時間' },

  eventTime: { type: 'time', label: '事件時間', group: '日期時間' },
  startTime: { type: 'time', label: '開始時間', group: '日期時間' },
  endTime: { type: 'time', label: '結束時間', group: '日期時間' },

  upload: { type: 'file', label: '檔案上傳 1', group: '檔案' },
  upload2: { type: 'file', label: '檔案上傳 2', group: '檔案' },
  upload3: { type: 'file', label: '檔案上傳 3', group: '檔案' },
  upload4: { type: 'file', label: '檔案上傳 4', group: '檔案' },

  rating1: { type: 'scale', label: '量表 1', group: '量表' },
  rating2: { type: 'scale', label: '量表 2', group: '量表' },
  rating3: { type: 'scale', label: '量表 3', group: '量表' },
  rating4: { type: 'scale', label: '量表 4', group: '量表' },
  rating5: { type: 'scale', label: '量表 5', group: '量表' },
  rating6: { type: 'scale', label: '量表 6', group: '量表' },
  rating7: { type: 'scale', label: '量表 7', group: '量表' },
  rating8: { type: 'scale', label: '量表 8', group: '量表' },
  rating9: { type: 'scale', label: '量表 9', group: '量表' },
  rating10: { type: 'scale', label: '量表 10', group: '量表' },
  rating11: { type: 'scale', label: '量表 11', group: '量表' },
  rating12: { type: 'scale', label: '量表 12', group: '量表' },
  rating13: { type: 'scale', label: '量表 13', group: '量表' },
  rating14: { type: 'scale', label: '量表 14', group: '量表' },
  rating15: { type: 'scale', label: '量表 15', group: '量表' },
  rating16: { type: 'scale', label: '量表 16', group: '量表' },
  rating17: { type: 'scale', label: '量表 17', group: '量表' },
  rating18: { type: 'scale', label: '量表 18', group: '量表' },
  rating19: { type: 'scale', label: '量表 19', group: '量表' },
  rating20: { type: 'scale', label: '量表 20', group: '量表' },
}

/** 已移除的舊 KEY；若既有模板仍使用，需手動重建表格後再部署 */
export const LEGACY_DATE_KEYS = [
  'dateOnlyStart',
  'dateOnlyEnd',
  'dateTimeStart',
  'dateTimeEnd',
] as const

export const FIXED_KEY_GROUPS = ['文字', '數字', '日期時間', '檔案', '量表'] as const

export const SCALE_POINTS_OPTIONS: ScalePoints[] = [3, 4, 5, 10, 100]

/** 建表／填表提示：刻度方向全組織一致 */
export const SCALE_DIRECTION_HINT = '數字愈大愈正面（1＝最負面）'

export const RATING_KEYS = Array.from({ length: 20 }, (_, i) => `rating${i + 1}`)

export function isValidScalePoints(n: unknown): n is ScalePoints {
  return SCALE_POINTS_OPTIONS.includes(n as ScalePoints)
}

/** 系統中性刻度選項（value 固定 "1"…"N"；本表 rating* 用） */
export function scaleOptions(points: ScalePoints): ScaleValueLabel[] {
  if (points === 3) {
    return [
      { value: '1', label: '不喜歡' },
      { value: '2', label: '普通' },
      { value: '3', label: '很喜歡' },
    ]
  }
  if (points === 4) {
    return [
      { value: '1', label: '非常不同意' },
      { value: '2', label: '不同意' },
      { value: '3', label: '同意' },
      { value: '4', label: '非常同意' },
    ]
  }
  if (points === 5) {
    return [
      { value: '1', label: '非常不同意' },
      { value: '2', label: '不同意' },
      { value: '3', label: '普通' },
      { value: '4', label: '同意' },
      { value: '5', label: '非常同意' },
    ]
  }
  return Array.from({ length: points }, (_, i) => {
    const value = String(i + 1)
    return { value, label: value }
  })
}

/** 嚴格驗證標準／欄位上的 scaleValueLabels */
export function validateScaleValueLabels(
  points: unknown,
  labels: unknown
): string | null {
  if (!isValidScalePoints(points)) return '請選擇有效的量表點數'
  if (!Array.isArray(labels)) return '量表標籤必須是清單'
  if (labels.length !== points) return `量表標籤必須正好 ${points} 個`
  for (let i = 0; i < points; i++) {
    const expected = String(i + 1)
    const row = labels[i] as { value?: unknown; label?: unknown }
    if (!row || typeof row !== 'object') return `第 ${expected} 點標籤格式不正確`
    if (row.value !== expected) {
      return `量表 VALUE 必須依序為 "1"…"${points}"（不可缺號或使用 "01"）`
    }
    if (typeof row.label !== 'string' || !row.label.trim()) {
      return `第 ${expected} 點需要標籤文字`
    }
  }
  return null
}

export function copyScaleValueLabels(labels: ScaleValueLabel[]): ScaleValueLabel[] {
  return labels.map(l => ({ value: l.value, label: l.label }))
}

/** 填表／建表預覽：有通過驗證的 snapshot 就用它，否則系統預設刻度 */
export function resolveScaleValueLabels(field: Pick<FieldDefinition, 'scalePoints' | 'scaleValueLabels'>): ScaleValueLabel[] {
  const points = isValidScalePoints(field.scalePoints) ? field.scalePoints : 5
  if (field.scaleValueLabels && !validateScaleValueLabels(points, field.scaleValueLabels)) {
    return copyScaleValueLabels(field.scaleValueLabels)
  }
  return scaleOptions(points)
}

export const FREE_STANDARD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'time']

export function expectedValueModel(type: FieldType): StandardValueModel | null {
  if (type === 'scale') return 'scale'
  if (type === 'dropdown' || type === 'choice') return 'optionSet'
  if (FREE_STANDARD_TYPES.includes(type)) return 'free'
  return null
}

export function validateTypeValueModel(type: FieldType, valueModel: StandardValueModel): string | null {
  const expected = expectedValueModel(type)
  if (!expected) return `標準資料不支援題型「${type}」`
  if (valueModel !== expected) return `題型「${type}」的答案模型必須是 ${expected}`
  return null
}

/** 與 optionSet code 相同規則，另禁 reserved codes */
export function validateStandardKeyCode(code: string): string | null {
  const base = validateOptionSetCode(code)
  if (base) return base
  if ((RESERVED_CODES as readonly string[]).includes(code)) {
    return `「${code}」是系統保留 KEY，不能當作標準資料`
  }
  return null
}

export function findStandardByKey<T extends Pick<StandardKey, 'key'>>(
  standards: T[],
  key: string
): T | undefined {
  return standards.find(s => s.key === key)
}

/** 建表選單：僅 active */
export function activeStandardsForPicker<T extends Pick<StandardKey, 'status'>>(standards: T[]): T[] {
  return standards.filter(s => s.status === 'active')
}

/** 選項池組：排除已有 standardKey（active 或 deprecated）的 code，避免雙入口 */
export function optionSetCodesWithoutStandard(
  masterCodes: string[],
  standards: Array<Pick<StandardKey, 'key'>>
): string[] {
  const taken = new Set(standards.map(s => s.key))
  return masterCodes.filter(c => !taken.has(c))
}

export function scaleValueLabelsEqual(a: ScaleValueLabel[] | undefined, b: ScaleValueLabel[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  return a.every((row, i) => row.value === b[i].value && row.label === b[i].label)
}

/**
 * 建表契約：欄位必須符合標準（含 deprecated）。
 * optionSetCode = 選中 optionSet 的 code（由呼叫端傳入）。
 */
export function assertFieldMatchesStandard(
  field: FieldDefinition,
  standard: Pick<
    StandardKey,
    'key' | 'type' | 'valueModel' | 'optionSetId' | 'scalePoints' | 'scaleValueLabels'
  >,
  optionSetCode?: string | null
): string | null {
  if (field.key !== standard.key) return `欄位 KEY 與標準「${standard.key}」不一致`
  if (field.type !== standard.type) {
    return `「${standard.key}」的題型由標準資料鎖定為 ${standard.type}`
  }
  const vmErr = validateTypeValueModel(standard.type, standard.valueModel)
  if (vmErr) return vmErr

  if (standard.valueModel === 'optionSet') {
    if (!field.optionSetId) return `「${standard.key}」要選一個選項清單`
    if (optionSetCode != null && optionSetCode !== field.key) {
      return `「${standard.key}」只能使用 code 相同的選項池（含子集）`
    }
    return null
  }

  if (standard.valueModel === 'scale') {
    if (!isValidScalePoints(standard.scalePoints) || field.scalePoints !== standard.scalePoints) {
      return `「${standard.key}」的刻度點數由標準資料鎖定`
    }
    const labelErr = validateScaleValueLabels(field.scalePoints, field.scaleValueLabels)
    if (labelErr) return `「${standard.key}」：${labelErr}`
    if (!scaleValueLabelsEqual(field.scaleValueLabels, standard.scaleValueLabels)) {
      return `「${standard.key}」的量表標籤由標準資料鎖定，不能改成系統預設或其他文案`
    }
    return null
  }

  // free
  if (field.optionSetId) return `「${standard.key}」是自由填寫，不應綁選項池`
  if (field.scaleValueLabels?.length) return `「${standard.key}」不是量表，不應有量表標籤`
  return null
}

/** 選標準 KEY 時套用契約（深拷貝 labels） */
export function applyStandardToField(
  field: FieldDefinition,
  standard: StandardKey
): FieldDefinition {
  const next: FieldDefinition = {
    ...field,
    key: standard.key,
    type: standard.type,
    optionSetId: undefined,
    multiple: undefined,
    scalePoints: undefined,
    scaleValueLabels: undefined,
    presetValue: undefined,
  }
  if (!next.label.trim()) next.label = standard.defaultLabel

  if (standard.valueModel === 'optionSet') {
    next.optionSetId = standard.optionSetId
  } else if (standard.valueModel === 'scale') {
    next.scalePoints = standard.scalePoints
    next.scaleValueLabels = standard.scaleValueLabels
      ? copyScaleValueLabels(standard.scaleValueLabels)
      : undefined
  }

  if (!canPresetFieldType(next.type)) next.inputMode = undefined
  return next
}

/** dropdown／choice 都用 optionSet；scale 用系統刻度 */
export function usesOptionSet(type: FieldType): boolean {
  return type === 'dropdown' || type === 'choice'
}

/** 送出時寫三形狀（陣列／Combined／Count） */
export function usesThreeShape(type: FieldType): boolean {
  return type === 'dropdown' || type === 'choice' || type === 'scale'
}

/**
 * 矩陣批次：為多行題目分配尚未使用的 rating KEY。
 * 空位不足回傳 null（呼叫端應報錯，不靜默截斷）。
 */
export function allocateRatingKeys(usedKeys: Iterable<string>, count: number): string[] | null {
  const used = new Set(usedKeys)
  const free = RATING_KEYS.filter(k => !used.has(k))
  if (free.length < count) return null
  return free.slice(0, count)
}

export function expandScaleMatrixFields(
  labels: string[],
  scalePoints: ScalePoints,
  usedKeys: Iterable<string>,
  startOrder: number
): FieldDefinition[] | { error: string } {
  const trimmed = labels.map(l => l.trim()).filter(Boolean)
  if (trimmed.length === 0) return { error: '請至少輸入一列題目' }
  if (!isValidScalePoints(scalePoints)) return { error: '請選擇有效的量表點數' }
  const keys = allocateRatingKeys(usedKeys, trimmed.length)
  if (!keys) {
    return { error: `量表 KEY 只剩 ${RATING_KEYS.filter(k => !new Set(usedKeys).has(k)).length} 個空位，無法加入 ${trimmed.length} 題` }
  }
  return trimmed.map((label, i) => ({
    key: keys[i],
    type: 'scale' as const,
    label,
    required: false,
    order: startOrder + i,
    scalePoints,
  }))
}

// ============================================
// 🦄 選擇題／量表的衍生欄位
//
// dropdown／choice／scale 在送出當下會寫成三個欄位：
//   school          ["粵華中學","培正中學"]   陣列 → array-contains
//   schoolCombined  "粵華中學, 培正中學"      標準順序組合字串
//   schoolCount     2                        數量
// scale 的 VALUE 固定為 "1"…"N"。
// ============================================

export const COMBINED_SUFFIX = 'Combined'
export const COUNT_SUFFIX = 'Count'
export const DERIVED_SUFFIXES = [COMBINED_SUFFIX, COUNT_SUFFIX]

export function combinedKey(key: string): string {
  return `${key}${COMBINED_SUFFIX}`
}

export function countKey(key: string): string {
  return `${key}${COUNT_SUFFIX}`
}

export function isDerivedKey(key: string): boolean {
  return DERIVED_SUFFIXES.some(suffix => key.endsWith(suffix))
}

export function isFixedKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIXED_KEYS, key)
}

export function isLegacyDateKey(key: string): boolean {
  return (LEGACY_DATE_KEYS as readonly string[]).includes(key)
}

// 表格分類 / 動作也是選項池，用這兩個保留 code 管理
export const MODULE_CODE = 'module'
export const ACTION_CODE = 'action'
export const MANAGER_GROUP_CODE = 'managerGroup'
export const RESERVED_CODES = [MODULE_CODE, ACTION_CODE, MANAGER_GROUP_CODE]

/** 這些 code 不可當一般跨表 KEY 篩選（是模板維度或 ACL） */
export const NON_SUBMISSION_QUERY_CODES = [MODULE_CODE, ACTION_CODE, MANAGER_GROUP_CODE]

// 選項池的 code 就是 dropdown 欄位的 KEY，必須是安全的識別字
export function validateOptionSetCode(code: string): string | null {
  if (!code.trim()) return '請輸入 KEY'
  if (!/^[a-z][a-zA-Z0-9]*$/.test(code)) {
    return 'KEY 只能用英文字母與數字，且必須小寫開頭（例：school、costCenter）'
  }
  if (isFixedKey(code)) return `「${code}」已經是系統固定 KEY，請換一個`
  if (isDerivedKey(code)) {
    return `KEY 不能用 ${DERIVED_SUFFIXES.join(' / ')} 結尾，這些是系統自動產生的欄位`
  }
  if (isLegacyDateKey(code)) {
    return `「${code}」已退役，請改用語意化日期／時間 KEY`
  }
  return null
}

/** YYYY-MM-DD */
export function isValidDateValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** HH:mm（澳門本地牆鐘，不存時區） */
export function isValidTimeValue(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

// ============================================
// 🦄 欄位輸入模式
//
// required（必答／可選答）與 inputMode（open／default／locked）是兩個正交維度。
// 八種組合只有一格無效：必答 + locked + 沒有預填值 —— 不接受空白但使用者又不能填，
// 永遠送不出去。可選答 + locked + 沒有值是有效的，等於「鎖定為空白」。
// ============================================

/** 檔案欄位無法預先塞一個檔案 */
export function canPresetFieldType(type: FieldType): boolean {
  return type !== 'file'
}

/** 寫死一個日期／時間除了固定年度之類的極少數情況，基本上是 bug */
export function shouldWarnOnPreset(type: FieldType): boolean {
  return type === 'date' || type === 'time' || type === 'datetime'
}

export function isPresetEmpty(value: FieldDefinition['presetValue']): boolean {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  return String(value).trim() === ''
}

export interface FieldModeProblem {
  key: string
  message: string
}

/** 建表時的驗證。locked 救不了設定錯誤，所以這一關非過不可。 */
export function validateFieldMode(field: FieldDefinition): FieldModeProblem | null {
  const mode = field.inputMode ?? 'open'
  if (mode === 'open') return null

  if (!canPresetFieldType(field.type)) {
    return { key: field.key, message: `「${field.label || field.key}」是檔案欄位，不能預填或鎖定` }
  }

  const empty = isPresetEmpty(field.presetValue)

  if (mode === 'default' && empty) {
    return { key: field.key, message: `「${field.label || field.key}」設為預設值時必須挑一個值` }
  }

  if (mode === 'locked' && field.required && empty) {
    return {
      key: field.key,
      message: `「${field.label || field.key}」是必答又鎖定，一定要有值，否則永遠無法送出`,
    }
  }

  return null
}

/**
 * 取欄位的初始值。舊值一律優先於預填值：更正舊紀錄時要沿用原值（快照語意），
 * 只有原本沒有這個欄位時才套預填值——例如模板新版加了一個 locked 欄位，
 * 而使用者正在更正舊版的紀錄。
 */
export function resolveInitialValue(
  field: FieldDefinition,
  previous: unknown,
  emptyValue: unknown
): unknown {
  if (previous !== undefined) return previous
  if ((field.inputMode ?? 'open') === 'open') return emptyValue
  if (isPresetEmpty(field.presetValue)) return emptyValue
  return field.presetValue
}
