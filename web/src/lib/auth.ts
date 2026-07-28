'use client'

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import { auth } from './firebase'
import { isSuperuserEmail } from './config'

const googleProvider = new GoogleAuthProvider()
// googleProvider.setCustomParameters({ hd: 'dbyv.org' }) // Optional: Restrict to domain

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}

export { isSuperuserEmail }
