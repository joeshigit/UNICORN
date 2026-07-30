import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require(path.join(__dirname, '../shared/universalKeyValidation.mjs'))

export const CATEGORY_PREFIXES = shared.CATEGORY_PREFIXES
export const UNPREFIXED_KEY_WHITELIST = shared.UNPREFIXED_KEY_WHITELIST
export const isCanonicalUniversalKey = shared.isCanonicalUniversalKey
export const canonicalKeyViolation = shared.canonicalKeyViolation

export const SYSTEM_RESERVED_CODES = ['module', 'action', 'managerGroup'] as const

const DERIVED_SUFFIXES = ['Combined', 'Count'] as const

const LEGACY_DATE_KEYS = [
  'dateOnlyStart',
  'dateOnlyEnd',
  'dateTimeStart',
  'dateTimeEnd',
] as const

/** Minimal FIXED_KEYS guard for Cloud Functions (keep in sync with web/src/lib/keys.ts) */
const FIXED_KEY_CODES = new Set([
  'title', 'text1', 'text2', 'text3', 'text4', 'note', 'note2', 'note3',
  'quantity1', 'quantity2', 'quantity3', 'quantity4', 'quantity5',
  'amount1', 'amount2', 'amount3',
  'eventDate', 'startDate', 'endDate', 'dueDate', 'documentDate', 'effectiveDate', 'expiryDate',
  'eventTime', 'startTime', 'endTime',
  'upload', 'upload2', 'upload3', 'upload4',
  ...Array.from({ length: 20 }, (_, i) => `rating${i + 1}`),
])

function isDerivedKey(code: string): boolean {
  return DERIVED_SUFFIXES.some(suffix => code.endsWith(suffix))
}

function formatEnglishViolation(code: string, violation: string | null): string | null {
  if (!violation) return null
  switch (violation) {
    case 'empty':
      return 'Missing code (machine name)'
    case 'whitelist_format':
      return `Invalid whitelist KEY format for "${code}"`
    case 'prefixed_invalid_tail':
      return 'After category prefix use camelCase (e.g. demo_chineseName); no extra underscores'
    case 'snake_case':
      return 'Use demo_chineseName format, not demo_chinese_name'
    case 'camel_without_prefix':
      return 'Add a category prefix (e.g. demo_chineseName) or use an approved unprefixed whitelist KEY'
    case 'bare_semantic':
      return `"${code}" is too ambiguous; use a category-prefixed KEY (e.g. demo_chineseName)`
    case 'unprefixed_not_whitelisted':
      return 'New KEY must use category_prefix + camelCase (e.g. demo_chineseName) or PO whitelist (school only)'
    default:
      return 'Invalid Universal KEY format'
  }
}

/** L1 + L2 policy for new Master optionSet / standard KEY codes (English). */
export function validateCreatableUniversalKeyCode(code: string): string | null {
  const trimmed = typeof code === 'string' ? code.trim() : ''
  const formatErr = formatEnglishViolation(trimmed, shared.canonicalKeyViolation(trimmed))
  if (formatErr) return formatErr
  if (FIXED_KEY_CODES.has(trimmed)) {
    return `"${trimmed}" is a system FIXED KEY`
  }
  if (isDerivedKey(trimmed)) {
    return `KEY cannot end with ${DERIVED_SUFFIXES.join(' / ')}`
  }
  if ((LEGACY_DATE_KEYS as readonly string[]).includes(trimmed)) {
    return `"${trimmed}" is retired; use semantic date/time KEYs`
  }
  if ((SYSTEM_RESERVED_CODES as readonly string[]).includes(trimmed)) {
    return `"${trimmed}" is system-reserved`
  }
  return null
}
