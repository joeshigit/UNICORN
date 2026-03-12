'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getEnabledTemplates } from '@/lib/firestore'
import type { Template } from '@/types'
import Link from 'next/link'

export default function StaffDashboard() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModule, setSelectedModule] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (user?.email) {
      loadTemplates()
    }
  }, [user])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const data = await getEnabledTemplates()
      setTemplates(data)
    } catch (error) {
      console.error('載入表格失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const modules = Array.from(new Set(templates.map(t => t.moduleId)))

  const filteredTemplates = useMemo(() => {
    let filtered = templates

    if (selectedModule) {
      filtered = filtered.filter(t => t.moduleId === selectedModule)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.moduleId.toLowerCase().includes(query) ||
        t.actionId.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [templates, selectedModule, searchQuery])

  return (
    <div className="space-y-6 min-h-screen">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">
          歡迎，{user?.displayName || user?.email?.split('@')[0]}！
        </h1>
        <p className="text-blue-200 mt-1">
          選擇一個表格開始填報資料
        </p>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋表格名稱、分類、動作..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {modules.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setSelectedModule(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedModule === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              全部
            </button>
            {modules.map(module => (
              <button
                key={module}
                onClick={() => setSelectedModule(module)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedModule === module
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {module}
              </button>
            ))}
          </div>
        )}

        {/* Templates Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-2">載入中...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mt-4">找不到表格</h3>
            <p className="text-gray-500 mt-1">
              {searchQuery ? '試試其他搜尋關鍵字' : '目前沒有可用的表格'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map(template => (
              <Link
                key={template.id}
                href={`/staff/submit/${template.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {template.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {template.moduleId}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {template.actionId}
                      </span>
                    </div>
                    {template.description && (
                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                    <p className="text-sm text-gray-400 mt-2">
                      {template.fields?.length || 0} 個欄位
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap gap-4">
          <Link
            href="/staff/my-submissions"
            className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">我的提交</p>
              <p className="text-xs text-gray-500">查看歷史提交紀錄</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
