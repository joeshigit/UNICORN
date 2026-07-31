/**
 * Phase 2 — client helpers for Google Form connect + inspection display.
 * Connect reuses existing Cloud Function; reads are Firestore client (Admin/Superuser rules).
 * No mapping, ingest, prefill productization, or Google Form writes.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import type { GoogleFormConfig } from '@/types'

const CONNECT_GOOGLE_FORM_URL =
  'https://asia-east1-unicorn-dcs.cloudfunctions.net/connectGoogleForm'

async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('未登入')
  return user.getIdToken()
}

export async function connectGoogleForm(
  formIdOrUrl: string
): Promise<{ googleFormId: string; config: GoogleFormConfig; questionCount: number }> {
  const idToken = await getIdToken()
  const response = await fetch(CONNECT_GOOGLE_FORM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ formIdOrUrl }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || data.error || 'connectGoogleForm failed')
  }
  return {
    googleFormId: data.googleFormId as string,
    config: data.config as GoogleFormConfig,
    questionCount: data.questionCount as number,
  }
}

export async function listGoogleFormConfigs(): Promise<GoogleFormConfig[]> {
  const q = query(collection(db, 'googleFormConfigs'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => d.data() as GoogleFormConfig)
}

export async function getGoogleFormConfig(
  googleFormId: string
): Promise<GoogleFormConfig | null> {
  const snap = await getDoc(doc(db, 'googleFormConfigs', googleFormId))
  if (!snap.exists()) return null
  return snap.data() as GoogleFormConfig
}
