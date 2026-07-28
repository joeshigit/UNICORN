'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange, signOut as authSignOut, isSuperuserEmail } from '@/lib/auth'

interface AuthContextValue {
  user: User | null
  email: string
  loading: boolean
  isSuperuser: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  email: '',
  loading: true,
  isSuperuser: false,
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

  const value: AuthContextValue = {
    user,
    email: user?.email || '',
    loading,
    isSuperuser: isSuperuserEmail(user?.email),
    signOut: authSignOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
