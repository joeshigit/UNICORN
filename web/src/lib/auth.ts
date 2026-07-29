'use client'

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import { auth } from './firebase'
import { isOrgEmail, isSuperuserEmail, ORG_DOMAIN } from './config'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ hd: ORG_DOMAIN })

export class AuthDomainError extends Error {
  constructor(message = `請使用已驗證的 @${ORG_DOMAIN} Google 帳號登入`) {
    super(message)
    this.name = 'AuthDomainError'
  }
}

function assertOrgUser(user: User): void {
  const email = user.email || ''
  if (!isOrgEmail(email) || !user.emailVerified) {
    throw new AuthDomainError()
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  try {
    assertOrgUser(result.user)
  } catch (err) {
    await firebaseSignOut(auth)
    throw err
  }
  return result.user
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, async nextUser => {
    if (!nextUser) {
      callback(null)
      return
    }
    try {
      assertOrgUser(nextUser)
      callback(nextUser)
    } catch {
      await firebaseSignOut(auth)
      callback(null)
    }
  })
}

export { isSuperuserEmail, isOrgEmail }
