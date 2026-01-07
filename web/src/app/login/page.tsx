'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, LoginButton } from '@/components/auth'
import { Sparkles } from 'lucide-react'

export default function LoginPage() {
  const { user, loading, isLeader } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // 已登入 → 跳轉
    if (!loading && user) {
      if (isLeader) {
        router.push('/leader')
      } else {
        router.push('/staff')
      }
    }
  }, [user, loading, isLeader, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-unicorn-50 via-white to-unicorn-50">
      <div className="text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-unicorn-100 rounded-xl mb-4">
            <Sparkles className="w-8 h-8 text-unicorn-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            登入獨角獸
          </h1>
        </div>

        {/* 登入按鈕 */}
        <LoginButton />

        {/* 返回 */}
        <p className="mt-8 text-sm text-gray-400">
          請使用 @{process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || 'dbyv.org'} 帳號登入
        </p>
      </div>
    </div>
  )
}






