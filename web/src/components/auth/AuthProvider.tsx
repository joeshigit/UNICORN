'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User } from 'firebase/auth'
import { onAuthChange, isLeader, signOut as authSignOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'

// Auth Context 型別
interface AuthContextType {
  user: User | null
  loading: boolean
  isLeader: boolean
  signOut: () => Promise<void>
}

// 建立 Context
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLeader: false,
  signOut: async () => {},
})

// AuthProvider 元件
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // 監聯登入狀態變化
    const unsubscribe = onAuthChange((user) => {
      setUser(user)
      setLoading(false)
    })

    // 清理訂閱
    return () => unsubscribe()
  }, [])

  const handleSignOut = async () => {
    try {
      await authSignOut()
      router.push('/login')
    } catch (error) {
      console.error('登出失敗:', error)
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    isLeader: isLeader(user),
    signOut: handleSignOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// useAuth Hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

