'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { getMySubmissions, getTemplate, cancelSubmission } from '@/lib/firestore'
import { formatDateTime } from '@/components/form/DateTimePicker'
import type { Submission, Template } from '@/types'
import { auth } from '@/lib/firebase'

const CORRECTION_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/createCorrectionSubmission'

export default function MySubmissionsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [templates, setTemplates] = useState<Record<string, Template>>({})
  const [loading, setLoading] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('success') === '1') {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    }
    loadSubmissions()
  }, [user])

  const f = (sub: any) => ({
    ...sub,
    _templateId: sub._templateId || sub.templateId,
    _templateModule: sub._templateModule || sub.moduleId || '',
    _templateAction: sub._templateAction || sub.actionId || '',
    _templateVersion: sub._templateVersion || sub.templateVersion || 1,
    _submittedAt: sub._submittedAt || sub.createdAt,
    _submitterEmail: sub._submitterEmail || sub.createdBy,
    _status: sub._status || sub.status || 'ACTIVE',
    _fieldLabels: sub._fieldLabels || sub.labelsSnapshot || {},
    _isLocked: sub._isLocked || false,
  } as Submission)

  const loadSubmissions = async () => {
    if (!user?.email) return
    try {
      setLoading(true)
      const rawData = await getMySubmissions(user.email)
      const data = rawData.map(f).filter(s => s._status !== 'CANCELLED')
      setSubmissions(data)
      const templateIds = Array.from(new Set(data.map(s => s._templateId)))
      const td: Record<string, Template> = {}
      for (const id of templateIds) {
        try {
          const t = await getTemplate(id)
          if (t) td[id] = t
        } catch {}
      }
      setTemplates(td)
    } catch (e) {
      console.error('載入失敗:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (sub: Submission) => {
    if (!confirm('確定要取消這筆提交？取消後無法恢復。')) return
    try {
      await cancelSubmission(sub.id!)
      await loadSubmissions()
    } catch (e) {
      alert('取消失敗')
    }
  }

  const handleEdit = (sub: Submission) => {
    router.push(`/staff/submit/${sub._templateId}?edit=${sub.id}`)
  }

  const handleResubmit = (sub: Submission) => {
    router.push(`/staff/submit/${sub._templateId}?correctFor=${sub.id}`)
  }

  const formatDate = (date: any) => {
    if (date?.toDate) {
      return date.toDate().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const statusBadge = (sub: Submission) => {
    if (sub._isLocked) return { text: '已鎖定', cls: 'bg-amber-100 text-amber-700' }
    if (sub._status === 'CANCELLED') return { text: '已取消', cls: 'bg-gray-100 text-gray-500' }
    if (sub._status === 'ACTIVE') return { text: '有效', cls: 'bg-green-100 text-green-700' }
    return { text: sub._status, cls: 'bg-gray-100 text-gray-500' }
  }

  const getKeyValues = (sub: Submission): Array<{ label: string; value: string }> => {
    if (!sub._fieldLabels) return []
    const vals = (sub as any).values || {}
    return Object.entries(sub._fieldLabels).slice(0, 3).map(([key, label]) => {
      const val = (sub as any)[key] !== undefined ? (sub as any)[key] : vals[key]
      if (val === undefined || val === null || val === '') return { label, value: '-' }
      if (typeof val === 'string' && /^\d{8}\s\d{2}:\d{2}$/.test(val)) return { label, value: formatDateTime(val) }
      return { label, value: String(val) }
    })
  }

  return (
    <div className="space-y-4 min-h-screen bg-blue-50/50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 rounded-xl">
      {showSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          提交成功！
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">我的提交</h1>
        <p className="text-gray-500 mt-1 text-sm">{submissions.length} 筆提交紀錄</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-500 mt-2">載入中...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">還沒有任何提交紀錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
            <div className="col-span-3">表格</div>
            <div className="col-span-3">主要內容</div>
            <div className="col-span-2">提交時間</div>
            <div className="col-span-1">狀態</div>
            <div className="col-span-3 text-right">操作</div>
          </div>

          {/* Rows */}
          {submissions.map(sub => {
            const template = templates[sub._templateId]
            const badge = statusBadge(sub)
            const keyVals = getKeyValues(sub)
            const isExpanded = expandedId === sub.id
            const isLocked = sub._isLocked === true
            const isCancelled = sub._status === 'CANCELLED'
            const isActive = sub._status === 'ACTIVE' && !isLocked
            const hasCorrection = sub._correctFor
            
            return (
              <div key={sub.id} className={`border-b border-gray-100 last:border-b-0 ${isCancelled ? 'opacity-50' : ''}`}>
                {/* Compact row */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50/50 transition-colors">
                  <div className="col-span-3">
                    <p className="text-sm font-medium text-gray-900 truncate">{template?.name || sub._templateModule}</p>
                    <p className="text-xs text-gray-400 font-mono">{sub._templateModule}_{sub._templateAction}</p>
                    {hasCorrection && (
                      <p className="text-xs text-amber-600 mt-0.5">更正 → {(sub._correctFor as string)?.slice(0, 8)}...</p>
                    )}
                  </div>
                  <div className="col-span-3">
                    {keyVals.map((kv, i) => (
                      <p key={i} className="text-xs text-gray-600 truncate">
                        <span className="text-gray-400">{kv.label}：</span>{kv.value}
                      </p>
                    ))}
                    {(sub as any).files && (sub as any).files.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {((sub as any).files as any[]).map((file: any, i: number) => (
                          <a key={i} href={file.webViewLink || '#'} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-[150px]" onClick={e => e.stopPropagation()}>
                            📎 {file.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-xs text-gray-500">{formatDate(sub._submittedAt)}</div>
                  <div className="col-span-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    {isActive && (
                      <>
                        <button onClick={() => handleEdit(sub)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors">修改</button>
                        <button onClick={() => handleCancel(sub)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors">取消</button>
                      </>
                    )}
                    {isLocked && (
                      <button onClick={() => handleResubmit(sub)} className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition-colors">重新提交</button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sub.id!)}
                      className="px-2 py-1 text-xs bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors"
                    >
                      {isExpanded ? '收起' : '詳情'}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-gray-50/50">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                      {sub._fieldLabels && Object.entries(sub._fieldLabels).map(([key, label]) => {
                        const subVals = (sub as any).values || {}
                        const value = (sub as any)[key] !== undefined ? (sub as any)[key] : subVals[key]
                        const renderVal = () => {
                          if (value === '' || value === null || value === undefined) return '-'
                          if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-'
                          if (typeof value === 'string' && /^\d{8}\s\d{2}:\d{2}$/.test(value)) return formatDateTime(value)
                          return String(value)
                        }
                        return (
                          <div key={key} className="bg-white rounded-lg p-2 border border-gray-100">
                            <p className="text-xs text-gray-400">{label}</p>
                            <p className="text-sm text-gray-900 mt-0.5">{renderVal()}</p>
                          </div>
                        )
                      })}
                    </div>
                    {sub.files && sub.files.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {sub.files.map((file, i) => (
                          <a key={i} href={file.webViewLink || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            {file.name}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>ID: {sub.id?.slice(0, 12)}...</span>
                      <span>v{sub._templateVersion}</span>
                      {sub._correctFor && <span className="text-amber-600">更正自: {(sub._correctFor as string)?.slice(0, 12)}...</span>}
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
