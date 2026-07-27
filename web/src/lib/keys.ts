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

export const FIXED_KEYS: Record<string, FixedKeyMeta> = {
  title: { type: 'text', label: '標題', group: '文字' },
  text1: { type: 'text', label: '單行文字 1', group: '文字' },
  text2: { type: 'text', label: '單行文字 2', group: '文字' },
  note: { type: 'textarea', label: '多行文字 1', group: '文字' },
  note2: { type: 'textarea', label: '多行文字 2', group: '文字' },

  quantity1: { type: 'number', label: '數量 1', group: '數字' },
  quantity2: { type: 'number', label: '數量 2', group: '數字' },
  quantity3: { type: 'number', label: '數量 3', group: '數字' },
  amount1: { type: 'number', label: '金額 1', group: '數字' },
  amount2: { type: 'number', label: '金額 2', group: '數字' },

  dateOnlyStart: { type: 'date', label: '開始日期', group: '日期時間' },
  dateOnlyEnd: { type: 'date', label: '結束日期', group: '日期時間' },
  dateTimeStart: { type: 'datetime', label: '開始日期時間', group: '日期時間' },
  dateTimeEnd: { type: 'datetime', label: '結束日期時間', group: '日期時間' },

  upload: { type: 'file', label: '檔案上傳 1', group: '檔案' },
  upload2: { type: 'file', label: '檔案上傳 2', group: '檔案' },
}

export const FIXED_KEY_GROUPS = ['文字', '數字', '日期時間', '檔案'] as const

// ============================================
// 🦄 下拉欄位的衍生欄位
//
// 每個 dropdown 在送出當下會寫成三個欄位（不管單選還是複選）：
//   school          ["粵華中學","培正中學"]   陣列 → array-contains 查「有沒有包含」
//   schoolCombined  "粵華中學, 培正中學"      標準順序的組合字串 → == 查「剛好是這個組合」
//   schoolCount     2                        數量 → 查「跨了幾個」
//
// 單選也一樣寫三個，這樣同一個 KEY 不會有時候是字串有時候是陣列。
// 建表的人只勾「可複選」，看不到也不用管這三個欄位。
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

// 表格分類 / 動作也是選項池，用這兩個保留 code 管理
export const MODULE_CODE = 'module'
export const ACTION_CODE = 'action'
export const RESERVED_CODES = [MODULE_CODE, ACTION_CODE]

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
  return null
}
