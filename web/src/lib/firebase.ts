import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'

const env = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(env.apiKey && env.projectId && env.appId)

// 靜態輸出時會在 Node 端載入這個檔案，沒有環境變數也不能讓初始化直接爆掉
const firebaseConfig = {
  ...env,
  apiKey: env.apiKey || 'missing-api-key',
  projectId: env.projectId || 'missing-project',
  appId: env.appId || 'missing-app-id',
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === '1' && typeof window !== 'undefined'

export const auth = getAuth(app)
// 模擬器的 WebChannel 串流容易斷線，本機一律走長輪詢
export const db = useEmulator
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : getFirestore(app)
export const storage = getStorage(app)

if (useEmulator) {
  const host = window.location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectStorageEmulator(storage, host, 9199)
}

export default app
