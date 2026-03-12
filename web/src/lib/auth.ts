'use client'

import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth'
import { auth } from './firebase'

// Google Auth Provider
const googleProvider = new GoogleAuthProvider()

// 限制只能用公司網域登入
const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || 'dbyv.org'
googleProvider.setCustomParameters({
  hd: allowedDomain // 限制 Google Workspace 網域
})

/**
 * Google 登入
 */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    
    // 驗證網域
    if (user.email && !user.email.endsWith(`@${allowedDomain}`)) {
      await firebaseSignOut(auth)
      throw new Error(`只允許 @${allowedDomain} 網域的帳號登入`)
    }
    
    return user
  } catch (error: unknown) {
    console.error('登入失敗:', error)
    throw error
  }
}

/**
 * 登出
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth)
  } catch (error) {
    console.error('登出失敗:', error)
    throw error
  }
}

/**
 * 監聽登入狀態變化
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}

/**
 * 取得目前登入使用者
 */
export function getCurrentUser(): User | null {
  return auth.currentUser
}

/**
 * Developer 白名單（建表權限）
 * 只有此名單內的帳號可以看到與進入 Developer View
 */
const developerEmails = [
  'joeshi@dbyv.org',
]

/**
 * 檢查是否為 Developer（白名單機制）
 * Developer 可以建立與管理表格、選項池
 * 一般使用者完全看不到 Developer 入口
 */
export function isDeveloper(user: User | null): boolean {
  if (!user?.email) return false
  return developerEmails.includes(user.email)
}

/**
 * 檢查是否為 Leader（沿用既有判斷，內部映射到 developer 白名單）
 */
export function isLeader(user: User | null): boolean {
  return isDeveloper(user)
}

/**
 * 🦄 UNICORN: 檢查是否為 Admin（選項治理審核權限）
 * Admin 可以審核選項變更申請
 */
export function isAdmin(user: User | null): boolean {
  if (!user?.email) return false
  
  // TODO: 之後改用 Firebase custom claims 或 Firestore admins collection
  // 暫時用 email 白名單
  const adminEmails = [
    'joeshi@dbyv.org',
    // 在這裡加入其他 admin 的 email
  ]
  
  return adminEmails.includes(user.email)
}

/**
 * 檢查 email 是否為 Admin（不需要 User 物件，用於 Cloud Function）
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  
  const adminEmails = [
    'joeshi@dbyv.org',
  ]
  
  return adminEmails.includes(email)
}

