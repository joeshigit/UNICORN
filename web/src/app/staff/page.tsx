'use client'

// Phase 3.1: Upgrade User Fill Center with favorites, usage stats, and search

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getEnabledTemplates,
  getFavoriteForms,
  getUserFormStats,
  getMostUsedForms,
  toggleFavorite
} from '@/lib/firestore'
import type { Template, UserFormStats } from '@/types'
import Link from 'next/link'

export default function StaffDashboard() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [favorites, setFavorites] = useState<UserFormStats[]>([])
  const [recentlyUsed, setRecentlyUsed] = useState<UserFormStats[]>([])
  const [mostUsed, setMostUsed] = useState<UserFormStats[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModule, setSelectedModule] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (user?.email) {
      loadAllData()
    }
  }, [user])

  const loadAllData = async () => {
    if (!user?.email) return
    
    try {
      setLoading(true)
      const [templatesData, favoritesData, statsData, mostUsedData] = await Promise.all([
        getEnabledTemplates(),
        getFavoriteForms(user.email),
        getUserFormStats(user.email),
        getMostUsedForms(user.email, 5)
      ])
      
      setTemplates(templatesData)
      setFavorites(favoritesData)
      setRecentlyUsed(statsData.slice(0, 5))
      setMostUsed(mostUsedData)
    } catch (error) {
      console.error('載入資料失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFavorite = async (templateId: string) => {
    if (!user?.email) return
    
    try {
      await toggleFavorite(user.email, templateId)
      await loadAllData()
    } catch (error) {
      console.error('切換最愛失敗:', error)
    }
  }

  // Get all modules
  const modules = [...new Set(templates.map(t => t.moduleId))]
  
  // Filter templates by search query and selected module
  const filteredTemplates = useMemo(() => {
    let filtered = templates
    
    // Filter by module
    if (selectedModule) {
      filtered = filtered.filter(t => t.moduleId === selectedModule)
    }
    
    // Filter by search query
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

  // Helper to check if template is favorite
  const isFavorite = (templateId: string) => {
    return favorites.some(f => f.templateId === templateId)
  }

  const formatRelativeTime = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date as string)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return '剛剛'
    if (diffMins < 60) return `${diffMins} 分鐘前`
    if (diffHours < 24) return `${diffHours} 小時前`
    if (diffDays < 7) return `${diffDays} 天前`
    return d.toLocaleDateString('zh-TW')
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">
          歡迎，{user?.displayName || user?.email?.split('@')[0]}！
        </h1>
        <p className="text-blue-200 mt-1">
          選擇一個表格開始填報資料
        </p>
      </div>

      {/* Phase 3.1: My Favorites, Recently Used, Most Used */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Favorites */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>⭐</span>
            <span>我的最愛</span>
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <p className="text-gray-400 text-sm">尚無最愛表格</p>
          ) : (
            <div className="space-y-2">
              {favorites.map(fav => (
                <Link
                  key={fav.id}
                  href={`/staff/submit/${fav.templateId}`}
                  className="block p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-blue-200 transition-all"
                >
                  <p className="font-medium text-gray-900 text-sm">{fav.templateName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatRelativeTime(fav.lastUsedAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recently Used */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>🕐</span>
            <span>最近使用</span>
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentlyUsed.length === 0 ? (
            <p className="text-gray-400 text-sm">尚無使用記錄</p>
          ) : (
            <div className="space-y-2">
              {recentlyUsed.map(recent => (
                <Link
                  key={recent.id}
                  href={`/staff/submit/${recent.templateId}`}
                  className="block p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-blue-200 transition-all"
                >
                  <p className="font-medium text-gray-900 text-sm">{recent.templateName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatRelativeTime(recent.lastUsedAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Most Used */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span>
            <span>最常使用</span>
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : mostUsed.length === 0 ? (
            <p className="text-gray-400 text-sm">尚無使用記錄</p>
          ) : (
            <div className="space-y-2">
              {mostUsed.map(stat => (
                <Link
                  key={stat.id}
                  href={`/staff/submit/${stat.templateId}`}
                  className="block p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-blue-200 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900 text-sm">{stat.templateName}</p>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {stat.useCount}次
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Phase 3.1: Search Forms */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">搜尋表格</h2>
        
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜尋表格名稱、分類、動作..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Module Filter */}
        {modules.length > 0 && (
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

        {/* Templates List */}
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
            {filteredTemplates.map(template => {
              const isTemplFavorite = isFavorite(template.id!)
              return (
                <div
                  key={template.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all group relative"
                >
                  {/* Favorite Button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      handleToggleFavorite(template.id!)
                    }}
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    title={isTemplFavorite ? '取消最愛' : '加入最愛'}
                  >
                    {isTemplFavorite ? (
                      <span className="text-amber-500">⭐</span>
                    ) : (
                      <span className="text-gray-300">☆</span>
                    )}
                  </button>

                  <Link href={`/staff/submit/${template.id}`} className="block">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 pr-8">
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
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">快速操作</h2>
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
              <p className="text-xs text-gray-500">查看歷史提交</p>
            </div>
          </Link>
          
          <Link
            href="/leader"
            className="flex items-center gap-3 px-4 py-3 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center text-purple-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Leader 模式</p>
              <p className="text-xs text-gray-500">切換至設定平台</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
