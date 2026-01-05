'use client'

// Phase 3.2: My Submissions with Two View Modes (By Time / By Form)

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { getMySubmissions, getTemplate, cancelSubmission } from '@/lib/firestore'
import { formatDateTime } from '@/components/form/DateTimePicker'
import type { Submission, Template } from '@/types'

type ViewMode = 'byTime' | 'byForm'

export default function MySubmissionsPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [templates, setTemplates] = useState<Record<string, Template>>({})
  const [loading, setLoading] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('byTime')

  useEffect(() => {
    if (searchParams.get('success') === '1') {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    }
    loadSubmissions()
  }, [user])

  const loadSubmissions = async () => {
    if (!user?.email) return
    
    try {
      setLoading(true)
      const data = await getMySubmissions(user.email)
      setSubmissions(data)
      
      // Load related templates
      const templateIds = [...new Set(data.map(s => s._templateId))]
      const templateData: Record<string, Template> = {}
      
      for (const id of templateIds) {
        try {
          const template = await getTemplate(id)
          if (template) {
            templateData[id] = template
          }
        } catch (e) {
          console.error('載入表格失敗:', id)
        }
      }
      
      setTemplates(templateData)
    } catch (error) {
      console.error('載入提交記錄失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (submission: Submission) => {
    if (!confirm('確定要取消這筆提交嗎？取消後無法恢復。')) return
    
    try {
      await cancelSubmission(submission.id!)
      await loadSubmissions()
    } catch (error) {
      console.error('取消失敗:', error)
      alert('取消失敗')
    }
  }

  const formatDate = (date: any) => {
    // Handle Firestore Timestamp
    if (date?.toDate) {
      return date.toDate().toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    // Handle Date or string
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Phase 3.2: Group submissions by template
  const groupedByForm = useMemo(() => {
    const groups: Record<string, Submission[]> = {}
    submissions.forEach(sub => {
      if (!groups[sub._templateId]) {
        groups[sub._templateId] = []
      }
      groups[sub._templateId].push(sub)
    })
    
    // Sort each group by time
    Object.keys(groups).forEach(templateId => {
      groups[templateId].sort((a, b) => {
        const aTime = a._submittedAt instanceof Date ? a._submittedAt.getTime() : new Date(a._submittedAt as string).getTime()
        const bTime = b._submittedAt instanceof Date ? b._submittedAt.getTime() : new Date(b._submittedAt as string).getTime()
        return bTime - aTime
      })
    })
    
    return groups
  }, [submissions])

  // Render submission card
  const renderSubmission = (submission: Submission) => {
    const template = templates[submission._templateId]
    const isExpanded = expandedId === submission.id
    
    return (
      <div
        key={submission.id}
        className={`bg-white rounded-xl border transition-all ${
          submission._status === 'CANCELLED'
            ? 'border-gray-200 opacity-60'
            : 'border-gray-200 hover:border-blue-200 hover:shadow-md'
        }`}
      >
        {/* Header */}
        <div
          className="p-5 cursor-pointer"
          onClick={() => setExpandedId(isExpanded ? null : submission.id!)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">
                  {template?.name || submission._templateId}
                </h3>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  submission._status === 'ACTIVE'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {submission._status === 'ACTIVE' ? '有效' : '已取消'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="bg-gray-100 px-2 py-0.5 rounded">
                  {submission._templateModule}
                </span>
                <span className="bg-gray-100 px-2 py-0.5 rounded">
                  {submission._templateAction}
                </span>
                <span>{formatDate(submission._submittedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {submission._status === 'ACTIVE' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCancel(submission)
                  }}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="取消此提交"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <svg 
                className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-5 pb-5 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700">填報內容</h4>
              {submission._templateVersion && (
                <span className="text-xs text-gray-400">
                  表格版本 v{submission._templateVersion}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* UNICORN: Display user data from top level using _fieldLabels */}
              {submission._fieldLabels && Object.entries(submission._fieldLabels).map(([key, label]) => {
                // Get value from top level (Universal KEY design)
                const value = (submission as any)[key]
                
                const renderValue = () => {
                  if (value === '' || value === null || value === undefined) {
                    return <span className="text-gray-400">-</span>
                  }
                  
                  if (Array.isArray(value)) {
                    return value.length > 0 ? value.join(', ') : <span className="text-gray-400">-</span>
                  }
                  
                  // Check if it's a datetime field (format: yyyymmdd hh:mm)
                  if (typeof value === 'string' && /^\d{8}\s\d{2}:\d{2}$/.test(value)) {
                    return formatDateTime(value)
                  }
                  
                  return String(value)
                }
                
                return (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {renderValue()}
                    </p>
                  </div>
                )
              })}
            </div>
            
            {/* Files */}
            {submission.files && submission.files.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">附件檔案</h4>
                <div className="space-y-2">
                  {submission.files.map((file, i) => {
                    const fieldLabel = submission._fieldLabels?.[file.fieldKey] || file.fieldKey
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <a 
                          href={file.webViewLink || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <span>{file.name}</span>
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                        <span className="text-xs text-gray-400">({fieldLabel})</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-3 animate-fade-in">
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          提交成功！
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">我的提交</h1>
          <p className="text-gray-500 mt-1">查看你的歷史提交</p>
        </div>
        
        {/* Phase 3.2: View Mode Toggle */}
        <div className="bg-white rounded-lg border border-gray-200 p-1 flex gap-1">
          <button
            onClick={() => setViewMode('byTime')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'byTime'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            按時間
          </button>
          <button
            onClick={() => setViewMode('byForm')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'byForm'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            按表格
          </button>
        </div>
      </div>

      {/* Submissions Display */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-500 mt-2">載入中...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mt-4">還沒有任何提交記錄</h3>
          <p className="text-gray-500 mt-1">前往填報中心開始提交資料</p>
        </div>
      ) : viewMode === 'byTime' ? (
        // View Mode: By Time
        <div className="space-y-4">
          {submissions.map(renderSubmission)}
        </div>
      ) : (
        // View Mode: By Form (Grouped)
        <div className="space-y-6">
          {Object.entries(groupedByForm).map(([templateId, subs]) => {
            const template = templates[templateId]
            return (
              <div key={templateId} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {template?.name || templateId}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {subs.length} 筆提交
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {subs.map(renderSubmission)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
