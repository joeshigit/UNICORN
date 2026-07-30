// ============================================
// L1: Universal KEY canonical format only
// No FIXED / reserved / standardKeys / optionSets policy here.
// ============================================

/** Category prefixes for new business Universal KEYs */
export const CATEGORY_PREFIXES = ['demo', 'admin', 'coun', 'prog', 'hr', 'fin']

/**
 * PO-approved unprefixed whitelist (product policy).
 * Do NOT extend without explicit PO approval.
 */
export const UNPREFIXED_KEY_WHITELIST = ['school']

const CATEGORY_PREFIX_PATTERN = CATEGORY_PREFIXES.join('|')
const PREFIXED_REGEX = new RegExp(`^(${CATEGORY_PREFIX_PATTERN})_[a-z][a-zA-Z0-9]*$`)
const UNPREFIXED_REGEX = /^[a-z][a-z0-9]*$/

/** Semantic bare keys rejected until PO defines category-prefixed equivalents */
const BARE_SEMANTIC_KEYS = new Set(['name', 'phone', 'email'])

/**
 * @param {unknown} code
 * @returns {boolean}
 */
export function isCanonicalUniversalKey(code) {
  return canonicalKeyViolation(code) === null
}

/**
 * Machine-readable violation reason (no UI copy).
 * @param {unknown} code
 * @returns {null | 'empty' | 'whitelist_format' | 'prefixed_invalid_tail' | 'snake_case' | 'camel_without_prefix' | 'bare_semantic' | 'unprefixed_not_whitelisted'}
 */
export function canonicalKeyViolation(code) {
  if (typeof code !== 'string') return 'empty'
  const trimmed = code.trim()
  if (!trimmed) return 'empty'

  if (UNPREFIXED_KEY_WHITELIST.includes(trimmed)) {
    return UNPREFIXED_REGEX.test(trimmed) ? null : 'whitelist_format'
  }

  if (PREFIXED_REGEX.test(trimmed)) return null

  if (new RegExp(`^(${CATEGORY_PREFIX_PATTERN})_`).test(trimmed)) {
    return 'prefixed_invalid_tail'
  }
  if (trimmed.includes('_')) return 'snake_case'
  if (/[A-Z]/.test(trimmed.slice(1))) return 'camel_without_prefix'
  if (BARE_SEMANTIC_KEYS.has(trimmed)) return 'bare_semantic'
  return 'unprefixed_not_whitelisted'
}
