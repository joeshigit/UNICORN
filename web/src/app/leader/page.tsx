'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getTemplates, getOptionSets, getAllSubmissions } from '@/lib/firestore'
import Link from 'next/link'

export default function LeaderDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    templates: 0,
    enabledTemplates: 0,
    optionSets: 0,
    submissions: 0,
    todaySubmissions: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      const [templates, optionSets, submissions] = await Promise.all([
        getTemplates(),
        getOptionSets(),
        getAllSubmissions()
      ])
      
      // 計算今日提交
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todaySubmissions = submissions.filter(s => {
        const createdAt = s.createdAt instanceof Date 
          ? s.createdAt 
          : new Date(s.createdAt as string)
        return createdAt >= today
      })

      setStats({
        templates: templates.length,
        enabledTemplates: templates.filter(t => t.enabled).length,
        optionSets: optionSets.length,
        submissions: submissions.length,
        todaySubmissions: todaySubmissions.length
      })
    } catch (error) {
      console.error('載入統計失敗:', error)
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
      href: '/leader/templates'
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
      href: '/leader/option-sets'
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
    green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500' }
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

      {/* 快速操作 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">快速操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/leader/templates"
            className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">新增表格</p>
              <p className="text-xs text-gray-500">建立資料收集表格</p>
            </div>
          </Link>
          
          <Link
            href="/leader/option-sets"
            className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">管理選項池</p>
              <p className="text-xs text-gray-500">新增下拉選單選項</p>
            </div>
          </Link>
          
          <Link
            href="/leader/exports"
            className="flex items-center gap-3 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
          >
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white">
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
            href="/staff"
            className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors"
          >
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">員工視角</p>
              <p className="text-xs text-gray-500">查看 Staff 介面</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
