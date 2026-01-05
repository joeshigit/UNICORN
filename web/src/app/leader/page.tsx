'use client'

// Phase 2.2: Dashboard Upgrade with usage stats and recent forms

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getTemplates, 
  getOptionSets, 
  getAllSubmissions,
  getUserFormStats,
  getTemplatesCreatedThisMonth,
  getMyManagedTemplates,
  getRecentSubmissionsForMyTemplates
} from '@/lib/firestore'
import Link from 'next/link'
import type { Template, UserFormStats, Submission } from '@/types'

export default function LeaderDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    templates: 0,
    enabledTemplates: 0,
    optionSets: 0,
    submissions: 0,
    todaySubmissions: 0
  })
  const [myFormStats, setMyFormStats] = useState<UserFormStats[]>([])
  const [thisMonthTemplates, setThisMonthTemplates] = useState<Template[]>([])
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      loadDashboardData()
    }
  }, [user])

  const loadDashboardData = async () => {
    if (!user?.email) return
    
    try {
      setLoading(true)
      
      // Load basic stats
      const [templates, optionSets, submissions, userStats] = await Promise.all([
        getTemplates(),
        getOptionSets(),
        getAllSubmissions(),
        getUserFormStats(user.email)
      ])
      
      // Calculate today submissions
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todaySubmissions = submissions.filter(s => {
        const submittedAt = s._submittedAt instanceof Date 
          ? s._submittedAt 
          : new Date(s._submittedAt as string)
        return submittedAt >= today
      })

      setStats({
        templates: templates.length,
        enabledTemplates: templates.filter(t => t.enabled).length,
        optionSets: optionSets.length,
        submissions: submissions.length,
        todaySubmissions: todaySubmissions.length
      })
      
      // Phase 2.2: Load user-specific data
      setMyFormStats(userStats)
      
      // Load templates created this month (UNICORN: using _createdMonth)
      const monthTemplates = await getTemplatesCreatedThisMonth()
      setThisMonthTemplates(monthTemplates)
      
      // Load recent submissions for my managed templates
      const managedTemplates = await getMyManagedTemplates(user.email)
      const templateIds = managedTemplates.map(t => t.id!).filter(Boolean)
      if (templateIds.length > 0) {
        const recent = await getRecentSubmissionsForMyTemplates(templateIds, 5)
        setRecentSubmissions(recent)
      }
      
    } catch (error) {
      console.error('載入總覽資料失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: '表格總數',
      value: stats.templates,
      subValue: `${stats.enabledTemplates} 個啟用中`,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'purple',
      href: '/leader/my-templates'
    },
    {
      title: '選項池',
      value: stats.optionSets,
      subValue: '下拉選單選項',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      color: 'blue',
      href: '/leader/design-forms'
    },
    {
      title: '總提交數',
      value: stats.submissions,
      subValue: `今日 ${stats.todaySubmissions} 筆`,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      color: 'green',
      href: '/leader/exports'
    }
  ]

  const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500' },
    green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500' }
  }

  // Format relative time
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
    <div className="space-y-8">
      {/* 歡迎區 */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">
          歡迎回來，{user?.displayName || user?.email?.split('@')[0]}！
        </h1>
        <p className="text-purple-200 mt-1">
          這是表格設定平台的總覽頁面
        </p>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((card, index) => {
          const colors = colorClasses[card.color]
          return (
            <Link
              key={index}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-purple-200 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {loading ? (
                      <span className="inline-block w-12 h-8 bg-gray-200 rounded animate-pulse"></span>
                    ) : (
                      card.value
                    )}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">{card.subValue}</p>
                </div>
                <div className={`${colors.bg} p-3 rounded-xl ${colors.icon} group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Phase 2.2: New Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Used Forms */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span>
            <span>常用表格</span>
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : myFormStats.length === 0 ? (
            <p className="text-gray-400 text-sm">尚無使用記錄</p>
          ) : (
            <div className="space-y-2">
              {myFormStats.slice(0, 5).map(stat => (
                <Link
                  key={stat.id}
                  href={`/staff/submit/${stat.templateId}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-purple-200"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{stat.templateName}</p>
                    <p className="text-xs text-gray-500">
                      使用 {stat.useCount} 次 · {formatRelativeTime(stat.lastUsedAt)}
                    </p>
                  </div>
                  {stat.isFavorite && (
                    <span className="text-amber-500">⭐</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Forms Created This Month */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>🆕</span>
            <span>本月新表格</span>
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : thisMonthTemplates.length === 0 ? (
            <p className="text-gray-400 text-sm">本月尚未建立新表格</p>
          ) : (
            <div className="space-y-2">
              {thisMonthTemplates.slice(0, 5).map(template => (
                <Link
                  key={template.id}
                  href={template.createdBy === user?.email 
                    ? `/leader/my-templates` 
                    : `/staff/submit/${template.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-purple-200"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{template.name}</p>
                    <p className="text-xs text-gray-500">
                      {template.moduleId} · {template.actionId}
                    </p>
                  </div>
                  {template.createdBy === user?.email && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      我建立的
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recently Submitted (My Forms) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span>📝</span>
          <span>最近提交（我的表格）</span>
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : recentSubmissions.length === 0 ? (
          <p className="text-gray-400 text-sm">尚無提交記錄</p>
        ) : (
          <div className="space-y-2">
            {recentSubmissions.map(submission => (
              <div
                key={submission.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {submission._templateModule} · {submission._templateAction}
                  </p>
                  <p className="text-xs text-gray-500">
                    {submission._submitterEmail} · {formatRelativeTime(submission._submittedAt)}
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                  {submission._status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 快速操作 - Phase 2.2: Updated */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">快速操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/leader/my-templates"
            className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">管理表格</p>
              <p className="text-xs text-gray-500">管理我的表格</p>
            </div>
          </Link>
          
          <Link
            href="/leader/exports"
            className="flex items-center gap-3 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
          >
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">查看資料</p>
              <p className="text-xs text-gray-500">查看表格數據</p>
            </div>
          </Link>
          
          <Link
            href="/leader/exports"
            className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">匯出資料</p>
              <p className="text-xs text-gray-500">匯出到 Google Sheet</p>
            </div>
          </Link>
          
          <Link
            href="/leader/design-forms"
            className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors"
          >
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">建立新表格</p>
              <p className="text-xs text-gray-500">設計新的資料收集表格</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
