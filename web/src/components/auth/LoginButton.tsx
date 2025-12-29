'use client'

import { useState } from 'react'
import { signInWithGoogle, signOut } from '@/lib/auth'
import { useAuth } from './AuthProvider'
import { LogIn, LogOut, Loader2 } from 'lucide-react'

export function LoginButton() {
  const { user, loading } = useAuth()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setIsLoggingIn(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '登入失敗'
      setError(message)
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('登出失敗:', err)
    }
  }

  if (loading) {
    return (
      <button 
        disabled 
        className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-500 rounded-lg"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        載入中...
      </button>
    )
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">
          {user.displayName || user.email}
        </span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          登出
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleLogin}
        disabled={isLoggingIn}
        className="flex items-center gap-2 px-6 py-3 bg-unicorn-600 hover:bg-unicorn-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {isLoggingIn ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <LogIn className="w-5 h-5" />
        )}
        {isLoggingIn ? '登入中...' : '使用 Google 登入'}
      </button>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}



