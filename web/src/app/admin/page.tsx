'use client'

import { useState, useEffect } from 'react'
import { getPendingOptionRequests, getAllOptionRequests } from '@/lib/firestore'
import type { OptionRequest } from '@/types'
import Link from 'next/link'

export default function AdminDashboard() {
  const [pendingCount, setPendingCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const [pending, all] = await Promise.all([
        getPendingOptionRequests(),
        getAllOptionRequests()
      ])
      setPendingCount(pending.length)
      setTotalCount(all.length)
    } catch (error) {
      console.error('載入統計失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">系統管理總覽</h1>
        <p className="text-slate-400 mt-1">管理選項池、審核申請、查看稽核記錄</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/admin/option-reviews"
          className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-amber-500/50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-slate-400 text-sm">待審核申請</p>
              <p className="text-3xl font-bold text-white">
                {loading ? '...' : pendingCount}
              </p>
            </div>
          </div>
          {pendingCount > 0 && (
            <div className="mt-4 text-amber-400 text-sm flex items-center gap-1">
              <span>有申請需要處理</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </Link>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-slate-400 text-sm">總申請數</p>
              <p className="text-3xl font-bold text-white">
                {loading ? '...' : totalCount}
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/admin/option-sets"
          className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-amber-500/50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-slate-400 text-sm">選項池管理</p>
              <p className="text-lg font-medium text-white">建立與管理</p>
            </div>
          </div>
          <div className="mt-4 text-green-400 text-sm flex items-center gap-1">
            <span>前往管理</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link
          href="/admin/google-forms"
          className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-amber-500/50 transition-colors md:col-span-3"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Google Forms</p>
              <p className="text-lg font-medium text-white">連線與結構檢視（Phase 2）</p>
            </div>
          </div>
          <div className="mt-4 text-violet-300 text-sm flex items-center gap-1">
            <span>開啟</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Info */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">🦄 Governed Dictionary 說明</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="text-amber-400 font-medium mb-2">選項生命週期</h3>
            <ul className="text-slate-400 space-y-1">
              <li>• <span className="text-yellow-400">Staging</span> - 測試中，可在表單使用</li>
              <li>• <span className="text-green-400">Active</span> - 正式啟用</li>
              <li>• <span className="text-slate-500">Deprecated</span> - 已停用，歷史資料保留</li>
            </ul>
          </div>
          <div>
            <h3 className="text-amber-400 font-medium mb-2">申請類型</h3>
            <ul className="text-slate-400 space-y-1">
              <li>• <span className="text-blue-400">Add</span> - 新增選項</li>
              <li>• <span className="text-purple-400">Rename</span> - 變更顯示名稱</li>
              <li>• <span className="text-orange-400">Merge</span> - 合併重複選項</li>
              <li>• <span className="text-red-400">Deprecate</span> - 停用選項</li>
              <li>• <span className="text-green-400">Activate</span> - 正式啟用</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}





