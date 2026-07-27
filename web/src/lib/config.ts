// ============================================
// 🦄 UNICORN Capture（單人版）— 系統設定
//
// 這個版本假設只有一位擁有者（OWNER）在使用：
// 建表、管理選項池、填報、看資料都是同一個人。
// ============================================

export const OWNER_EMAIL = (
  process.env.NEXT_PUBLIC_OWNER_EMAIL || 'joeshi@dbyv.org'
).toLowerCase()

export const APP_NAME = '獨角獸'
export const APP_SUBTITLE = 'Unicorn Capture'

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.toLowerCase() === OWNER_EMAIL
}
