'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange, signOut as authSignOut, isSuperuserEmail, isOrgEmail } from '@/lib/auth'
import { ORG_DOMAIN } from '@/lib/config'

interface AuthContextValue {
  user: User | null
  email: string
  uid: string
  loading: boolean
  isSuperuser: boolean
  isOrgUser: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  email: '',
  uid: '',
  loading: true,
  isSuperuser: false,
  isOrgUser: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthChange(nextUser => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  const email = user?.email || ''
  const value: AuthContextValue = {
    user,
    email,
    uid: user?.uid || '',
    loading,
    isSuperuser: isSuperuserEmail(email),
    isOrgUser: isOrgEmail(email) && !!user?.emailVerified,
    signOut: authSignOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

/** Superuser 專頁守衛；非 Superuser 顯示拒絕訊息 */
export function SuperuserGuard({ children }: { children: ReactNode }) {
  const { loading, isSuperuser, email } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        載入中…
      </div>
    )
  }

  if (!isSuperuser) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">沒有權限</h1>
        <p className="mt-2 text-sm text-slate-500">
          此頁面僅限 Superuser。目前登入：{email || '（未登入）'}
          <br />
          組織網域：@{ORG_DOMAIN}
        </p>
      </div>
    )
  }

  return <>{children}</>
}
