// ============================================
// 🦄 UNICORN Capture — 系統設定
// ============================================

/** 組織網域：只有已驗證的 @dbyv.org 帳號可以進入系統 */
export const ORG_DOMAIN = 'dbyv.org'

/**
 * Superuser 唯一來源（前端便利檢查）。
 * Firestore / Storage rules 內也必須維護同一份清單。
 */
export const SUPERUSERS = [
  process.env.NEXT_PUBLIC_OWNER_EMAIL || 'joeshi@dbyv.org',
].map(e => e.toLowerCase())

export const APP_NAME = '獨角獸'
export const APP_SUBTITLE = 'Unicorn Capture'

/** 業務時區：澳門（用於 _submittedMonth 等寫入當下衍生值） */
export const BUSINESS_TIMEZONE = 'Asia/Macau'

export function isOrgEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.toLowerCase().endsWith(`@${ORG_DOMAIN}`)
}

export function isSuperuserEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return SUPERUSERS.includes(email.toLowerCase())
}
