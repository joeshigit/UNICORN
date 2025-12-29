'use client'

import { useState, useEffect } from 'react'
import { getOptionSets } from '@/lib/firestore'
import type { OptionSet, OptionItem, OptionStatus } from '@/types'
import Link from 'next/link'

const statusColors: Record<OptionStatus, { bg: string; text: string; label: string }> = {
  staging: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: '測試中' },
  active: { bg: 'bg-green-50', text: 'text-green-700', label: '啟用' },
  deprecated: { bg: 'bg-gray-100', text: 'text-gray-500', label: '已停用' },
}

export default function OptionSetsPage() {
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSet, setExpandedSet] = useState<string | null>(null)

  useEffect(() => {
    loadOptionSets()
  }, [])

  const loadOptionSets = async () => {
    try {
      setLoading(true)
      const data = await getOptionSets()
      setOptionSets(data)
    } catch (error) {
      console.error('載入選項池失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  function getItemStatus(item: OptionItem): OptionStatus {
    return item.status || 'active'
  }

  function getStatusCounts(items: OptionItem[]) {
    const counts = { staging: 0, active: 0, deprecated: 0 }
    items.forEach(item => {
      const status = getItemStatus(item)
      counts[status]++
    })
    return counts
  }

  return (
    <div className="space-y-6">
      {/* 標題區 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">下拉選項池</h1>
          <p className="text-gray-500 mt-1">查看可重複使用的下拉選單選項</p>
        </div>
        <Link
          href="/leader/option-requests"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          申請變更
        </Link>
      </div>

      {/* 🦄 UNICORN: Governed Dictionary 說明 */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-purple-600">🦄</span>
          </div>
          <div>
            <h3 className="font-medium text-purple-900">Governed Dictionary（受治理詞典）</h3>
            <p className="text-sm text-purple-700 mt-1">
              選項池由系統管理，確保資料一致性。如需新增、修改或停用選項，請透過
              <Link href="/leader/option-requests" className="underline font-medium mx-1">
                選項申請
              </Link>
              提交，經審核後生效。
            </p>
          </div>
        </div>
      </div>

      {/* 選項池列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-500 mt-2">載入中...</p>
        </div>
      ) : optionSets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mt-4">還沒有任何選項池</h3>
          <p className="text-gray-500 mt-1">請聯繫管理員建立選項池</p>
        </div>
      ) : (
        <div className="space-y-4">
          {optionSets.map(optionSet => {
            const isExpanded = expandedSet === optionSet.id
            const counts = getStatusCounts(optionSet.items || [])
            
            return (
              <div
                key={optionSet.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => setExpandedSet(isExpanded ? null : optionSet.id!)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 text-left">{optionSet.name}</h3>
                        {optionSet.code && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-mono">
                            {optionSet.code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 text-left">ID: {optionSet.id}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Status counts */}
                    <div className="flex items-center gap-2 text-sm">
                      {counts.active > 0 && (
                        <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">
                          {counts.active} 啟用
                        </span>
                      )}
                      {counts.staging > 0 && (
                        <span className="px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">
                          {counts.staging} 測試
                        </span>
                      )}
                      {counts.deprecated > 0 && (
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                          {counts.deprecated} 停用
                        </span>
                      )}
                    </div>
                    
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                
                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-500">
                        共 {optionSet.items?.length || 0} 個選項
                      </p>
                      <Link
                        href="/leader/option-requests"
                        className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        申請新增/變更
                      </Link>
                    </div>
                    
                    {/* Items table */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium text-gray-600">顯示名稱</th>
                            <th className="text-left px-4 py-2 font-medium text-gray-600">查詢 Key</th>
                            <th className="text-left px-4 py-2 font-medium text-gray-600">狀態</th>
                            <th className="text-left px-4 py-2 font-medium text-gray-600">備註</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {optionSet.items?.map((item, index) => {
                            const status = getItemStatus(item)
                            const statusInfo = statusColors[status]
                            
                            return (
                              <tr key={index} className={status === 'deprecated' ? 'bg-gray-50/50' : ''}>
                                <td className={`px-4 py-2 ${status === 'deprecated' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                  {item.label}
                                </td>
                                <td className="px-4 py-2 font-mono text-purple-600 text-xs">
                                  {item.value}
                                </td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 rounded text-xs ${statusInfo.bg} ${statusInfo.text}`}>
                                    {statusInfo.label}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-gray-500 text-xs">
                                  {item.mergedInto && (
                                    <span className="text-orange-600">
                                      已合併至 {item.mergedInto}
                                    </span>
                                  )}
                                  {item.labelHistory && item.labelHistory.length > 0 && (
                                    <span className="text-blue-600">
                                      曾用名: {item.labelHistory.map(h => h.label).join(', ')}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
