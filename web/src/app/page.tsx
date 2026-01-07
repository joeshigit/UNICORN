'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth'
import { LoginButton } from '@/components/auth'
import { Loader2, Sparkles } from 'lucide-react'

export default function HomePage() {
  const { user, loading, isLeader } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // 已登入 → 自動跳轉到對應頁面
    if (!loading && user) {
      if (isLeader) {
        router.push('/leader')
      } else {
        router.push('/staff')
      }
    }
  }, [user, loading, isLeader, router])

  // 載入中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-unicorn-50 to-white">
        <Loader2 className="w-8 h-8 animate-spin text-unicorn-600" />
      </div>
    )
  }

  // 已登入（等待跳轉）
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-unicorn-50 to-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-unicorn-600" />
          <p className="text-gray-500">正在跳轉...</p>
        </div>
      </div>
    )
  }

  // 未登入 → 顯示登入頁
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-unicorn-50 via-white to-unicorn-50">
      <div className="text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-unicorn-100 rounded-2xl mb-4">
            <Sparkles className="w-10 h-10 text-unicorn-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            獨角獸
          </h1>
          <p className="text-lg text-unicorn-600 font-medium">
            Unicorn DataCaptureSystem
          </p>
        </div>

        {/* 說明 */}
        <p className="text-gray-500 mb-8 max-w-md">
          公司內部資料收集平台<br />
          請使用公司 Google 帳號登入
        </p>

        {/* 登入按鈕 */}
        <LoginButton />

        {/* 版權 */}
        <p className="mt-12 text-xs text-gray-400">
          © 2025 獨角獸資料系統
        </p>
      </div>
    </div>
  )
}






