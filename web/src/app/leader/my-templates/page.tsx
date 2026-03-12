'use client'

// Phase 2.3: My Templates Page - Full Implementation
// Shows templates user owns or manages

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getMyManagedTemplates,
  toggleTemplateEnabled,
  updateTemplateAccess,
  updateTemplateManagers
} from '@/lib/firestore'
import type { Template } from '@/types'
import Link from 'next/link'

export default function MyTemplatesPage() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAccess, setEditingAccess] = useState<string | null>(null)
  const [editAccessType, setEditAccessType] = useState<'all' | 'whitelist'>('all')
  const [editWhitelist, setEditWhitelist] = useState('')
  const [editingManagers, setEditingManagers] = useState<string | null>(null)
  const [editManagers, setEditManagers] = useState('')

  useEffect(() => {
    if (user?.email) {
      loadTemplates()
    }
  }, [user])

  const loadTemplates = async () => {
    if (!user?.email) return
    
    try {
      setLoading(true)
      const data = await getMyManagedTemplates(user.email)
      setTemplates(data)
    } catch (error) {
      console.error('載入表格失敗:', error)
      alert('載入表格失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleEnabled = async (templateId: string, currentEnabled: boolean) => {
    if (!confirm(`確定要${currentEnabled ? '停用' : '啟用'}此表格？`)) return
    
    try {
      await toggleTemplateEnabled(templateId, !currentEnabled)
      await loadTemplates()
    } catch (error) {
      console.error('切換狀態失敗:', error)
      alert('操作失敗')
    }
  }

  const startEditAccess = (template: Template) => {
    setEditingAccess(template.id!)
    setEditAccessType(template.accessType || 'all')
    setEditWhitelist((template.accessWhitelist || []).join(', '))
  }

  const saveAccessSettings = async () => {
    if (!editingAccess) return
    
    try {
      const whitelist = editAccessType === 'whitelist'
        ? editWhitelist.split(',').map(e => e.trim()).filter(Boolean)
        : []
      
      await updateTemplateAccess(editingAccess, editAccessType, whitelist)
      setEditingAccess(null)
      await loadTemplates()
    } catch (error) {
      console.error('更新權限失敗:', error)
      alert('更新權限失敗')
    }
  }

  const startEditManagers = (template: Template) => {
    setEditingManagers(template.id!)
    setEditManagers((template.managerEmails || []).join(', '))
  }

  const saveManagers = async () => {
    if (!editingManagers) return
    
    try {
      const managers = editManagers.split(',').map(e => e.trim()).filter(Boolean)
      
      if (managers.length > 5) {
        alert('最多只能設定 5 位管理者')
        return
      }
      
      await updateTemplateManagers(editingManagers, managers)
      setEditingManagers(null)
      await loadTemplates()
    } catch (error) {
      console.error('更新管理者失敗:', error)
      alert('更新管理者失敗')
    }
  }

  // Group templates by status
  const officialTemplates = templates.filter(t => !t.id?.startsWith('draft_'))
  const draftTemplates = templates.filter(t => t.id?.startsWith('draft_'))

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">表格管理</h1>
          <p className="text-gray-500 mt-1">載入中...</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">表格管理</h1>
        <p className="text-gray-500 mt-1">
          啟停、權限設定、管理已發佈的表格（共 {templates.length} 個）
        </p>
      </div>

      {/* Official Templates */}
      {officialTemplates.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span>✅</span>
            <span>正式表格</span>
            <span className="text-sm font-normal text-gray-500">({officialTemplates.length})</span>
          </h2>
          <div className="grid gap-4">
            {officialTemplates.map(template => (
              <div
                key={template.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {template.moduleId} · {template.actionId} · v{template.version}
                    </p>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-2">{template.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {template.enabled ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        啟用中
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        已停用
                      </span>
                    )}
                    {template.createdBy === user?.email && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                        擁有者
                      </span>
                    )}
                  </div>
                </div>

                {/* Access Settings */}
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700">誰可填寫</h4>
                    <button
                      onClick={() => startEditAccess(template)}
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      編輯
                    </button>
                  </div>
                  {editingAccess === template.id ? (
                    <div className="space-y-3">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={editAccessType === 'all'}
                            onChange={() => setEditAccessType('all')}
                            className="text-purple-600"
                          />
                          <span className="text-sm">所有人</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={editAccessType === 'whitelist'}
                            onChange={() => setEditAccessType('whitelist')}
                            className="text-purple-600"
                          />
                          <span className="text-sm">白名單</span>
                        </label>
                      </div>
                      {editAccessType === 'whitelist' && (
                        <input
                          type="text"
                          value={editWhitelist}
                          onChange={(e) => setEditWhitelist(e.target.value)}
                          placeholder="email1@org.com, email2@org.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveAccessSettings}
                          className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                        >
                          儲存
                        </button>
                        <button
                          onClick={() => setEditingAccess(null)}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">
                      {template.accessType === 'whitelist' ? (
                        <span>白名單 ({template.accessWhitelist?.length || 0} 人)</span>
                      ) : (
                        <span>所有人</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Managers */}
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700">管理者</h4>
                    <button
                      onClick={() => startEditManagers(template)}
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      編輯
                    </button>
                  </div>
                  {editingManagers === template.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editManagers}
                        onChange={(e) => setEditManagers(e.target.value)}
                        placeholder="manager1@org.com, manager2@org.com (最多5位)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveManagers}
                          className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                        >
                          儲存
                        </button>
                        <button
                          onClick={() => setEditingManagers(null)}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">
                      {template.managerEmails && template.managerEmails.length > 0 ? (
                        <span>{template.managerEmails.join(', ')}</span>
                      ) : (
                        <span className="text-gray-400">無</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Link
                    href={`/staff/submit/${template.id}`}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    填寫表格
                  </Link>
                  <button
                    onClick={() => handleToggleEnabled(template.id!, template.enabled)}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      template.enabled
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {template.enabled ? '停用' : '啟用'}
                  </button>
                  <Link
                    href={`/leader/exports?templateId=${template.id}`}
                    className="px-4 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    查看資料
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft Templates */}
      {draftTemplates.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span>📝</span>
            <span>草稿表格</span>
            <span className="text-sm font-normal text-gray-500">({draftTemplates.length})</span>
          </h2>
          <div className="grid gap-4">
            {draftTemplates.map(template => (
              <div
                key={template.id}
                className="bg-white rounded-xl border border-amber-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {template.moduleId} · {template.actionId}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">
                    草稿
                  </span>
                </div>

                {/* Actions for Draft */}
                <div className="flex gap-2">
                  <Link
                    href={`/leader/draft-templates`}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    編輯草稿
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {templates.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">尚無表格</h3>
          <p className="text-gray-500 mb-6">建立你的第一個表格開始收集資料</p>
          <Link
            href="/leader/design-forms"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>建立新表格</span>
          </Link>
        </div>
      )}
    </div>
  )
}
