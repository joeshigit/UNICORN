'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getTemplates, toggleTemplateEnabled, updateTemplate, deleteTemplate } from '@/lib/firestore'
import type { Template } from '@/types'
import { useRouter } from 'next/navigation'

function truncate(str: string, len: number) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

export default function LeaderAllFormsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const data = await getTemplates()
      setTemplates(data)
    } catch (error) {
      console.error('載入表格失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.email) loadTemplates()
  }, [user])

  const published = useMemo(() => {
    const list = templates.filter(t => t._isDraft !== true)
    return list.sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1))
  }, [templates])

  const drafts = useMemo(() => templates.filter(t => t._isDraft === true), [templates])

  const handleToggle = async (t: Template) => {
    if (!t.id) return
    try {
      await toggleTemplateEnabled(t.id, !t.enabled)
      await loadTemplates()
    } catch (e) {
      console.error('切換失敗:', e)
    }
  }

  const handlePublishDraft = async (t: Template) => {
    if (!t.id || !confirm(`確定要發佈「${t.name}」？發佈後使用者即可在填報中心看到。`)) return
    try {
      await updateTemplate(t.id, { enabled: true, _isDraft: false } as any)
      await loadTemplates()
    } catch (e) {
      console.error('發佈失敗:', e)
      alert('發佈失敗：' + (e instanceof Error ? e.message : '未知錯誤'))
    }
  }

  const handleDeleteDraft = async (t: Template) => {
    if (!t.id || !confirm(`確定要刪除草稿「${t.name}」？此操作不可復原。`)) return
    try {
      await deleteTemplate(t.id)
      await loadTemplates()
    } catch (e) {
      console.error('刪除失敗:', e)
      alert('刪除失敗：' + (e instanceof Error ? e.message : '未知錯誤'))
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">所有表格</h1>
          <p className="text-gray-500 mt-1">管理所有已建立的資料收集表格</p>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-40 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 min-h-screen bg-purple-50/50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 rounded-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">所有表格</h1>
        <p className="text-gray-500 mt-1">管理所有已建立的資料收集表格</p>
      </div>

      {/* Published templates */}
      {published.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">正式表格 ({published.length})</h2>
          {published.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{t.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${t.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.enabled ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="bg-purple-100 text-purple-700 font-mono text-xs px-2 py-0.5 rounded">{t.moduleId}_{t.actionId}</span>
                    <span className="text-xs text-gray-400">{t.fields?.length ?? 0} 欄位 · v{t.version ?? 1}</span>
                  </div>
                  {t.devMeta && Object.values(t.devMeta).some(v => v?.trim()) && (
                    <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                      {t.devMeta.purpose && <p><span className="text-gray-400">用途：</span>{truncate(t.devMeta.purpose, 80)}</p>}
                      {t.devMeta.intendedUsers && <p><span className="text-gray-400">對象：</span>{truncate(t.devMeta.intendedUsers, 60)}</p>}
                      {t.devMeta.outputAction && <p><span className="text-gray-400">後續：</span>{truncate(t.devMeta.outputAction, 60)}</p>}
                    </div>
                  )}
                  {t.description && <p className="mt-1 text-xs text-gray-400">{truncate(t.description, 100)}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <button onClick={() => router.push(`/leader/create?edit=${t.id}`)} className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors">編輯</button>
                  <button onClick={() => router.push(`/leader/create?from=${t.id}`)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">複製</button>
                  <button onClick={() => handleToggle(t)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${t.enabled ? 'text-amber-700 bg-amber-100 hover:bg-amber-200' : 'text-green-700 bg-green-100 hover:bg-green-200'}`}>
                    {t.enabled ? '停用' : '啟用'}
                  </button>
                  <button onClick={() => alert('匯出新資料功能開發中 — 將匯出未鎖定的 ACTIVE submissions 並自動鎖定')} className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors">匯出新</button>
                  <button onClick={() => alert('匯出全部功能開發中 — 將匯出所有 ACTIVE + LOCKED submissions')} className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">匯出全部</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-400">草稿 ({drafts.length})</h2>
          {drafts.map(t => (
            <div key={t.id} className="bg-gray-50 rounded-xl border border-gray-200 p-5 opacity-75 hover:opacity-100 transition-opacity">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium text-gray-700">{t.name || '未命名草稿'}</h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">草稿</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {t.moduleId && t.actionId && (
                      <span className="bg-gray-200 text-gray-600 font-mono text-xs px-2 py-0.5 rounded">{t.moduleId}_{t.actionId}</span>
                    )}
                    <span className="text-xs text-gray-400">{t.fields?.length ?? 0} 欄位</span>
                  </div>
                  {t.description && <p className="mt-1 text-xs text-gray-400">{truncate(t.description, 80)}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => router.push(`/leader/create?edit=${t.id}`)} className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors">編輯</button>
                  <button onClick={() => handlePublishDraft(t)} className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors">發佈</button>
                  <button onClick={() => handleDeleteDraft(t)} className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">刪除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {published.length === 0 && drafts.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">尚無表格</p>
          <button onClick={() => router.push('/leader/create')} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">建立第一個表格</button>
        </div>
      )}
    </div>
  )
}
