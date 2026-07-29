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

import type { FieldType } from '@/types'

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
}

/** 已移除的舊 KEY；若既有模板仍使用，需手動重建表格後再部署 */
export const LEGACY_DATE_KEYS = [
  'dateOnlyStart',
  'dateOnlyEnd',
  'dateTimeStart',
  'dateTimeEnd',
] as const

export const FIXED_KEY_GROUPS = ['文字', '數字', '日期時間', '檔案'] as const

// ============================================
// 🦄 下拉欄位的衍生欄位
//
// 每個 dropdown 在送出當下會寫成三個欄位（不管單選還是複選）：
//   school          ["粵華中學","培正中學"]   陣列 → array-contains 查「有沒有包含」
//   schoolCombined  "粵華中學, 培正中學"      標準順序的組合字串 → == 查「剛好是這個組合」
//   schoolCount     2                        數量 → 查「跨了幾個」
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
