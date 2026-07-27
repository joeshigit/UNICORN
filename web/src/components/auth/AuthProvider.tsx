'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange, signOut as authSignOut, isOwnerEmail } from '@/lib/auth'

interface AuthContextValue {
  user: User | null
  email: string
  loading: boolean
  isOwner: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  email: '',
  loading: true,
  isOwner: false,
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
    isOwner: isOwnerEmail(user?.email),
    signOut: authSignOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
