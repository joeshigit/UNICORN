'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireLeader?: boolean
}

export function ProtectedRoute({ children, requireLeader = false }: ProtectedRouteProps) {
  const { user, loading, isLeader } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      // 未登入 → 跳轉到登入頁
      if (!user) {
        router.push('/login')
        return
      }
      
      // 需要 Leader 權限但不是 Leader → 跳轉到 Staff 頁面
      if (requireLeader && !isLeader) {
        router.push('/staff')
        return
      }
    }
  }, [user, loading, isLeader, requireLeader, router])

  // 載入中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-unicorn-600" />
          <p className="text-gray-500">載入中...</p>
        </div>
      </div>
    )
  }

  // 未登入
  if (!user) {
    return null
  }

  // 需要 Leader 但不是 Leader
  if (requireLeader && !isLeader) {
    return null
  }

  return <>{children}</>
}



