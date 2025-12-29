'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getMyOptionSetDrafts,
  createOptionSetDraft,
  updateOptionSetDraft,
  submitOptionSetDraftForReview,
  deleteOptionSetDraft
} from '@/lib/firestore'
import type { OptionSetDraft, DraftStatus } from '@/types'

const statusConfig: Record<DraftStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-slate-500/20 text-slate-400' },
  pending_review: { label: '待審核', color: 'bg-yellow-500/20 text-yellow-400' },
  approved: { label: '已通過', color: 'bg-green-500/20 text-green-400' },
  rejected: { label: '已退回', color: 'bg-red-500/20 text-red-400' }
}

export default function LeaderDraftOptionSetsPage() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<OptionSetDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<Array<{ value: string; label: string }>>([])

  useEffect(() => {
    if (user?.email) {
      loadDrafts()
    }
  }, [user])

  async function loadDrafts() {
    if (!user?.email) return
    try {
      const data = await getMyOptionSetDrafts(user.email)
      setDrafts(data)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setCode('')
    setName('')
    setDescription('')
    setItems([])
    setShowCreate(false)
    setEditingId(null)
  }

  function startEdit(draft: OptionSetDraft) {
    setEditingId(draft.id!)
    setCode(draft.code)
    setName(draft.name)
    setDescription(draft.description || '')
    setItems(draft.items.map(i => ({ value: i.value, label: i.label })))
    setShowCreate(true)
  }

  async function handleSave() {
    if (!user?.email) return
    if (!code.trim() || !name.trim()) {
      alert('請填寫代碼和名稱')
      return
    }
    
    const codeRegex = /^[a-z][a-z0-9_]*$/
    if (!codeRegex.test(code.trim())) {
      alert('代碼格式錯誤：必須以小寫字母開頭，只能包含小寫字母、數字、底線')
      return
    }

    setSaving(true)
    try {
      const data = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        items: items.filter(i => i.value && i.label)
      }

      if (editingId) {
        await updateOptionSetDraft(editingId, data)
      } else {
        await createOptionSetDraft(data, user.email)
      }

      await loadDrafts()
      resetForm()
    } catch (error: any) {
      console.error('儲存失敗:', error)
      alert('儲存失敗: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitForReview(id: string) {
    if (!confirm('確定要提交審核嗎？提交後將無法修改，直到 Admin 審核完成。')) {
      return
    }

    try {
      await submitOptionSetDraftForReview(id)
      await loadDrafts()
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
      await deleteOptionSetDraft(id)
      await loadDrafts()
    } catch (error: any) {
      console.error('刪除失敗:', error)
      alert('刪除失敗: ' + error.message)
    }
  }

  function addItem() {
    setItems([...items, { value: '', label: '' }])
  }

  function updateItem(index: number, field: 'value' | 'label', value: string) {
    const updated = [...items]
    updated[index][field] = value
    
    if (field === 'label' && !updated[index].value) {
      updated[index].value = value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30)
    }
    
    setItems(updated)
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">選項池草稿</h1>
          <p className="text-slate-400 mt-1">建立選項池建議，提交給 Admin 審核後生效</p>
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
          💡 草稿是您的沙盒空間。您可以自由建立和測試，提交審核後 Admin 會決定是否正式建立選項池。
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
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-sm font-mono">
                        {draft.code}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-sm ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    {draft.description && (
                      <p className="text-slate-400 text-sm mt-1">{draft.description}</p>
                    )}
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
                
                {/* Items */}
                <div className="flex flex-wrap gap-2">
                  {draft.items.map((item, index) => (
                    <div
                      key={index}
                      className="px-3 py-1.5 bg-slate-700 rounded-lg text-sm flex items-center gap-2"
                    >
                      <span className="font-mono text-xs text-slate-500">{item.value}</span>
                      <span className="text-slate-300">{item.label}</span>
                    </div>
                  ))}
                  {draft.items.length === 0 && (
                    <span className="text-slate-500 text-sm">尚未新增選項</span>
                  )}
                </div>
                
                <div className="mt-4 text-xs text-slate-500">
                  共 {draft.items.length} 個選項
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {editingId ? '編輯草稿' : '新建草稿'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">代碼 *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
                    placeholder="例如：school、program"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">顯示名稱 *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    placeholder="例如：全澳中學"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">描述</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    placeholder="選填"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-slate-400">選項</label>
                    <button
                      onClick={addItem}
                      className="text-sm text-amber-400 hover:text-amber-300"
                    >
                      + 新增選項
                    </button>
                  </div>
                  
                  {items.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">
                      點擊「新增選項」來新增選項
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-auto">
                      {items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateItem(index, 'label', e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                            placeholder="顯示名稱"
                          />
                          <input
                            type="text"
                            value={item.value}
                            onChange={(e) => updateItem(index, 'value', e.target.value)}
                            className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono text-sm"
                            placeholder="Code"
                          />
                          <button
                            onClick={() => removeItem(index)}
                            className="p-2 text-red-400 hover:text-red-300"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  onClick={handleSave}
                  disabled={saving || !code.trim() || !name.trim()}
                  className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

