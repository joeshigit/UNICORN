'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { signInWithGoogle } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'
import { APP_NAME, APP_SUBTITLE } from '@/lib/config'
import { ErrorBanner, Spinner } from '@/components/ui'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && user) router.replace('/fill')
  }, [loading, user, router])

  const handleSignIn = async () => {
    setSigningIn(true)
    setError('')
    try {
      await signInWithGoogle()
      router.replace('/fill')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗')
    } finally {
      setSigningIn(false)
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-unicorn-100">
          <Sparkles className="h-8 w-8 text-unicorn-600" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="mt-1 text-sm font-medium text-unicorn-600">{APP_SUBTITLE}</p>
        <p className="mt-4 text-sm text-slate-500">
          自己建表、自己填、資料全部落在同一個池子裡。
        </p>

        <div className="mt-8">
          {isFirebaseConfigured ? (
            <button className="btn-primary w-full" onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? '登入中…' : '使用 Google 帳號登入'}
            </button>
          ) : (
            <ErrorBanner message="找不到 Firebase 設定，請先照 web/env.example 建立 .env.local 再重新 build。" />
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
