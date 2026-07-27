'use client'

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import { auth } from './firebase'
import { OWNER_EMAIL, isOwnerEmail } from './config'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ login_hint: OWNER_EMAIL })

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  if (!isOwnerEmail(result.user.email)) {
    await firebaseSignOut(auth)
    throw new Error(`此系統只開放 ${OWNER_EMAIL} 使用`)
  }
  return result.user
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}

export { isOwnerEmail }
