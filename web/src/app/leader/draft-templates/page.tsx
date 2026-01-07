'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getMyTemplateDrafts,
  createTemplateDraft,
  updateTemplateDraft,
  submitTemplateDraftForReview,
  deleteTemplateDraft,
  getOptionSets,
  getMyOptionSetDrafts
} from '@/lib/firestore'
import type { TemplateDraft, DraftStatus, FieldDefinition, OptionSet, OptionSetDraft, UniversalKey } from '@/types'
import { UNIVERSAL_KEYS } from '@/types'

const statusConfig: Record<DraftStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-slate-500/20 text-slate-400' },
  pending_review: { label: '待審核', color: 'bg-yellow-500/20 text-yellow-400' },
  approved: { label: '已通過', color: 'bg-green-500/20 text-green-400' },
  rejected: { label: '已退回', color: 'bg-red-500/20 text-red-400' }
}

const fieldTypes = [
  { value: 'text', label: '文字' },
  { value: 'number', label: '數字' },
  { value: 'date', label: '日期' },
  { value: 'datetime', label: '日期時間' },
  { value: 'dropdown', label: '下拉選單' },
  { value: 'textarea', label: '多行文字' },
  { value: 'file', label: '檔案上傳' }
]

export default function LeaderDraftTemplatesPage() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<TemplateDraft[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [optionSetDrafts, setOptionSetDrafts] = useState<OptionSetDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [name, setName] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [actionId, setActionId] = useState('')
  const [fields, setFields] = useState<FieldDefinition[]>([])
  
  // Phase 2.5: New form fields
  const [description, setDescription] = useState('')
  const [accessType, setAccessType] = useState<'all' | 'whitelist'>('all')
  const [accessWhitelist, setAccessWhitelist] = useState('')
  const [managerEmails, setManagerEmails] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)

  useEffect(() => {
    if (user?.email) {
      loadAll()
    }
  }, [user])

  async function loadAll() {
    if (!user?.email) return
    try {
      const [draftsData, optionSetsData, optionSetDraftsData] = await Promise.all([
        getMyTemplateDrafts(user.email),
        getOptionSets(),
        getMyOptionSetDrafts(user.email)
      ])
      setDrafts(draftsData)
      setOptionSets(optionSetsData)
      setOptionSetDrafts(optionSetDraftsData)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setName('')
    setModuleId('')
    setActionId('')
    setFields([])
    setDescription('')
    setAccessType('all')
    setAccessWhitelist('')
    setManagerEmails('')
    setShowCreate(false)
    setEditingId(null)
    setShowSaveModal(false)
  }

  function startEdit(draft: TemplateDraft) {
    setEditingId(draft.id!)
    setName(draft.name)
    setModuleId(draft.moduleId)
    setActionId(draft.actionId)
    setFields(draft.fields || [])
    setDescription(draft.description || '')
    setAccessType(draft.accessType || 'all')
    setAccessWhitelist((draft.accessWhitelist || []).join(', '))
    setManagerEmails((draft.managerEmails || []).join(', '))
    setShowCreate(true)
  }

  // Phase 2.5: Validate and prepare save
  function handleSaveClick() {
    if (!name.trim() || !moduleId.trim() || !actionId.trim()) {
      alert('請填寫表格名稱、分類和動作')
      return
    }
    
    // Phase 2.5: Validate manager emails
    const managers = managerEmails.split(',').map(e => e.trim()).filter(Boolean)
    if (managers.length > 5) {
      alert('最多只能設定 5 位管理者')
      return
    }
    
    // Show save modal
    setShowSaveModal(true)
  }

  async function handleSave(startUsing: boolean) {
    if (!user?.email) return

    setSaving(true)
    try {
      // Parse emails
      const whitelist = accessType === 'whitelist'
        ? accessWhitelist.split(',').map(e => e.trim()).filter(Boolean)
        : []
      const managers = managerEmails.split(',').map(e => e.trim()).filter(Boolean)
      
      const data = {
        name: name.trim(),
        moduleId: moduleId.trim(),
        actionId: actionId.trim(),
        fields: fields.filter(f => f.key && f.label),
        description: description.trim() || undefined,
        accessType,
        accessWhitelist: whitelist.length > 0 ? whitelist : undefined,
        managerEmails: managers.length > 0 ? managers : undefined
      }

      if (editingId) {
        await updateTemplateDraft(editingId, data)
      } else {
        await createTemplateDraft(data, user.email)
      }

      await loadAll()
      resetForm()
      
      if (startUsing) {
        alert('草稿已儲存！可以前往「我的表格」啟用此表格。')
      } else {
        alert('草稿已儲存，可稍後繼續修改')
      }
      
    } catch (error: any) {
      console.error('儲存失敗:', error)
      alert('儲存失敗: ' + error.message)
    } finally {
      setSaving(false)
      setShowSaveModal(false)
    }
  }

  async function handleSubmitForReview(id: string) {
    if (!confirm('確定要提交審核嗎？提交後將無法修改，直到 Admin 審核完成。')) {
      return
    }

    try {
      await submitTemplateDraftForReview(id)
      await loadAll()
      alert('已提交審核！')
    } catch (error: any) {
      console.error('提交失敗:', error)
      alert('提交失敗: ' + error.message)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此草稿？')) {
      return
    }

    try {
      await deleteTemplateDraft(id)
      await loadAll()
    } catch (error: any) {
      console.error('刪除失敗:', error)
      alert('刪除失敗: ' + error.message)
    }
  }

  function addField() {
    setFields([...fields, {
      key: '' as UniversalKey,  // Must select from Universal Keys
      type: 'text',
      label: '',
      required: false,
      order: fields.length
    }])
  }

  function updateField(index: number, updates: Partial<FieldDefinition>) {
    const updated = [...fields]
    updated[index] = { ...updated[index], ...updates }
    setFields(updated)
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index))
  }

  // Combine formal and draft option sets for dropdown selection
  const availableOptionSets = [
    ...optionSets.map(os => ({ id: os.id!, name: os.name, code: os.code, isDraft: false })),
    ...optionSetDrafts
      .filter(d => d.status !== 'rejected')
      .map(d => ({ id: d.id!, name: `[草稿] ${d.name}`, code: d.code, isDraft: true }))
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">表格草稿</h1>
          <p className="text-slate-400 mt-1">建立表格草稿，提交給 Admin 審核後生效</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors font-medium"
        >
          + 新建草稿
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          💡 草稿表格可以使用您的「選項池草稿」。審核時，Admin 會一併審核相關的選項池草稿。
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400">還沒有任何草稿</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 text-amber-400 hover:text-amber-300"
          >
            建立第一個草稿
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map(draft => {
            const status = statusConfig[draft.status]
            const canEdit = draft.status === 'draft' || draft.status === 'rejected'
            const canSubmit = draft.status === 'draft'
            const canDelete = draft.status !== 'pending_review'
            
            return (
              <div
                key={draft.id}
                className="bg-slate-800 rounded-xl border border-slate-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{draft.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-sm ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1">
                      {draft.moduleId} / {draft.actionId}
                    </p>
                    {draft.reviewNote && (
                      <div className="mt-2 p-2 bg-slate-700/50 rounded text-sm">
                        <span className="text-slate-400">Admin 反饋：</span>
                        <span className="text-white ml-2">{draft.reviewNote}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button
                        onClick={() => startEdit(draft)}
                        className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                      >
                        編輯
                      </button>
                    )}
                    {canSubmit && (
                      <button
                        onClick={() => handleSubmitForReview(draft.id!)}
                        className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 transition-colors"
                      >
                        提交審核
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(draft.id!)}
                        className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30 transition-colors"
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Fields Preview */}
                <div className="space-y-1">
                  {(draft.fields || []).slice(0, 5).map((field, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500">{index + 1}.</span>
                      <span className="text-slate-300">{field.label}</span>
                      <span className="text-slate-600">({field.type})</span>
                      {field.required && <span className="text-red-400">*</span>}
                    </div>
                  ))}
                  {(draft.fields || []).length > 5 && (
                    <p className="text-slate-500 text-sm">... 還有 {draft.fields!.length - 5} 個欄位</p>
                  )}
                  {(!draft.fields || draft.fields.length === 0) && (
                    <span className="text-slate-500 text-sm">尚未新增欄位</span>
                  )}
                </div>
                
                <div className="mt-4 text-xs text-slate-500">
                  共 {draft.fields?.length || 0} 個欄位
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {editingId ? '編輯草稿' : '新建草稿'}
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">名稱 *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      placeholder="表格名稱"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">模組 *</label>
                    <input
                      type="text"
                      value={moduleId}
                      onChange={(e) => setModuleId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      placeholder="例如：hr、finance"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">動作 *</label>
                    <input
                      type="text"
                      value={actionId}
                      onChange={(e) => setActionId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      placeholder="例如：leave_request"
                    />
                  </div>
                </div>
                
                {/* Phase 2.5: New Fields */}
                <div>
                  <label className="block text-sm text-slate-400 mb-2">描述</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    placeholder="說明此表格的用途..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">誰可填寫此表</label>
                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={accessType === 'all'}
                          onChange={() => setAccessType('all')}
                          className="text-purple-600"
                        />
                        <span className="text-sm text-slate-300">所有人</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={accessType === 'whitelist'}
                          onChange={() => setAccessType('whitelist')}
                          className="text-purple-600"
                        />
                        <span className="text-sm text-slate-300">白名單</span>
                      </label>
                    </div>
                    {accessType === 'whitelist' && (
                      <input
                        type="text"
                        value={accessWhitelist}
                        onChange={(e) => setAccessWhitelist(e.target.value)}
                        placeholder="email1@org.com, email2@org.com"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">表格管理者（最多 5 位）</label>
                  <input
                    type="text"
                    value={managerEmails}
                    onChange={(e) => setManagerEmails(e.target.value)}
                    placeholder="manager1@org.com, manager2@org.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    管理者可以像擁有者一樣編輯此表格
                  </p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-slate-400">欄位</label>
                    <button
                      onClick={addField}
                      className="text-sm text-amber-400 hover:text-amber-300"
                    >
                      + 新增欄位
                    </button>
                  </div>
                  
                  {fields.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">
                      點擊「新增欄位」來新增欄位
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-auto">
                      {fields.map((field, index) => (
                        <div key={index} className="flex items-center gap-2 p-3 bg-slate-900 rounded-lg">
                          <span className="text-slate-500 text-sm w-6">{index + 1}</span>
                          {/* 🦄 UNICORN: KEY 選擇 - dropdown 類型自動從 optionSet.code 取得 */}
                          {field.type === 'dropdown' ? (
                            <div className="w-32 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-300 text-sm font-mono">
                              {field.key || '(自動)'}
                            </div>
                          ) : (
                            <select
                              value={field.key}
                              onChange={(e) => updateField(index, { key: e.target.value as UniversalKey })}
                              className="w-32 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono"
                            >
                              <option value="">選擇 KEY</option>
                              {Object.entries(UNIVERSAL_KEYS).map(([key, config]) => (
                                <option key={key} value={key}>
                                  {key}
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateField(index, { label: e.target.value })}
                            className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                            placeholder="標籤（顯示名稱）"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const newType = e.target.value as any
                              // 🦄 UNICORN: 切換離開 dropdown 時清除 optionSetId
                              if (newType !== 'dropdown') {
                                updateField(index, { type: newType, optionSetId: undefined })
                              } else {
                                // 切換到 dropdown 時清除 key（等待選擇 optionSet）
                                updateField(index, { type: newType, key: '' as UniversalKey })
                              }
                            }}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                          >
                            {fieldTypes.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          {field.type === 'dropdown' && (
                            <select
                              value={field.optionSetId || ''}
                              onChange={(e) => {
                                const selectedSetId = e.target.value
                                const selectedSet = availableOptionSets.find(os => os.id === selectedSetId)
                                // 🦄 UNICORN: 自動使用 optionSet.code 作為 field key
                                updateField(index, { 
                                  optionSetId: selectedSetId,
                                  key: (selectedSet?.code || '') as UniversalKey
                                })
                              }}
                              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                            >
                              <option value="">選擇選項池</option>
                              {availableOptionSets.map(os => (
                                <option key={os.id} value={os.id}>
                                  {os.name} {os.code && `[${os.code}]`}
                                </option>
                              ))}
                            </select>
                          )}
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateField(index, { required: e.target.checked })}
                            />
                            <span className="text-slate-400">必填</span>
                          </label>
                          <button
                            onClick={() => removeField(index)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveClick}
                  disabled={saving || !name.trim() || !moduleId.trim() || !actionId.trim()}
                  className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors font-medium disabled:opacity-50"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2.5: Save Flow Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">
              儲存草稿
            </h3>
            <p className="text-slate-300 mb-6">
              草稿已準備好儲存。你希望：
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-medium"
              >
                {saving ? '儲存中...' : '立即使用'}
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="w-full px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors"
              >
                {saving ? '儲存中...' : '儲存供稍後修改'}
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                disabled={saving}
                className="w-full px-6 py-3 bg-slate-900 text-slate-300 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
            </div>
            
            {saving && (
              <div className="mt-4 text-center text-sm text-slate-400">
                正在儲存草稿...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

