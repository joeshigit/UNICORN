// ============================================
// 🦄 UNICORN Capture — 系統設定
// ============================================

export const SUPERUSERS = [
  process.env.NEXT_PUBLIC_OWNER_EMAIL || 'joeshi@dbyv.org',
].map(e => e.toLowerCase())

export const APP_NAME = '獨角獸'
export const APP_SUBTITLE = 'Unicorn Capture'

export function isSuperuserEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return SUPERUSERS.includes(email.toLowerCase())
}
