'use client'

import { useState, useEffect } from 'react'
import { 
  getPendingOptionSetDrafts,
  getPendingTemplateDrafts,
  reviewOptionSetDraft,
  reviewTemplateDraft
} from '@/lib/firestore'
import type { OptionSetDraft, TemplateDraft } from '@/types'

export default function AdminDraftReviewsPage() {
  const [optionSetDrafts, setOptionSetDrafts] = useState<OptionSetDraft[]>([])
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewingType, setReviewingType] = useState<'optionSet' | 'template' | null>(null)

  useEffect(() => {
    loadDrafts()
  }, [])

  async function loadDrafts() {
    try {
      const [osDrafts, tDrafts] = await Promise.all([
        getPendingOptionSetDrafts(),
        getPendingTemplateDrafts()
      ])
      setOptionSetDrafts(osDrafts)
      setTemplateDrafts(tDrafts)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  function startReview(id: string, type: 'optionSet' | 'template') {
    setReviewingId(id)
    setReviewingType(type)
    setReviewNote('')
  }

  async function handleReview(action: 'approve' | 'reject') {
    if (!reviewingId || !reviewingType) return
    
    setProcessing(reviewingId)
    try {
      if (reviewingType === 'optionSet') {
        await reviewOptionSetDraft(reviewingId, action, reviewNote || undefined)
      } else {
        await reviewTemplateDraft(reviewingId, action, reviewNote || undefined)
      }
      
      await loadDrafts()
      setReviewingId(null)
      setReviewingType(null)
      setReviewNote('')
      alert(`${action === 'approve' ? '核准' : '退回'}成功！`)
    } catch (error: any) {
      console.error('審核失敗:', error)
      alert('審核失敗: ' + error.message)
    } finally {
      setProcessing(null)
    }
  }

  const totalPending = optionSetDrafts.length + templateDrafts.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">草稿審核</h1>
        <p className="text-slate-400 mt-1">審核 Leader 提交的選項池和表格草稿</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <p className="text-slate-400 text-sm">待審核總數</p>
          <p className="text-3xl font-bold text-white mt-1">{totalPending}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <p className="text-slate-400 text-sm">選項池草稿</p>
          <p className="text-3xl font-bold text-amber-400 mt-1">{optionSetDrafts.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <p className="text-slate-400 text-sm">表格草稿</p>
          <p className="text-3xl font-bold text-purple-400 mt-1">{templateDrafts.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : totalPending === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
          <svg className="w-16 h-16 mx-auto text-green-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-slate-400">目前沒有待審核的草稿</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* OptionSet Drafts */}
          {optionSetDrafts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-amber-400 mb-4">選項池草稿</h2>
              <div className="space-y-4">
                {optionSetDrafts.map(draft => (
                  <div
                    key={draft.id}
                    className="bg-slate-800 rounded-xl border border-amber-500/30 p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-white">{draft.name}</h3>
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-sm font-mono">
                            {draft.code}
                          </span>
                        </div>
                        {draft.description && (
                          <p className="text-slate-400 text-sm mt-1">{draft.description}</p>
                        )}
                        <p className="text-slate-500 text-xs mt-2">
                          提交者: {draft.createdBy} | 
                          提交時間: {draft.submittedAt ? new Date(draft.submittedAt as string).toLocaleString() : ''}
                        </p>
                      </div>
                      
                      <button
                        onClick={() => startReview(draft.id!, 'optionSet')}
                        className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors font-medium"
                      >
                        審核
                      </button>
                    </div>
                    
                    {/* Items Preview */}
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
                    </div>
                    
                    <p className="text-xs text-slate-500 mt-4">
                      共 {draft.items.length} 個選項
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template Drafts */}
          {templateDrafts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-purple-400 mb-4">表格草稿</h2>
              <div className="space-y-4">
                {templateDrafts.map(draft => (
                  <div
                    key={draft.id}
                    className="bg-slate-800 rounded-xl border border-purple-500/30 p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{draft.name}</h3>
                        <p className="text-slate-400 text-sm mt-1">
                          {draft.moduleId} / {draft.actionId}
                        </p>
                        <p className="text-slate-500 text-xs mt-2">
                          提交者: {draft.createdBy} | 
                          提交時間: {draft.submittedAt ? new Date(draft.submittedAt as string).toLocaleString() : ''}
                        </p>
                      </div>
                      
                      <button
                        onClick={() => startReview(draft.id!, 'template')}
                        className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-400 transition-colors font-medium"
                      >
                        審核
                      </button>
                    </div>
                    
                    {/* Fields Preview */}
                    <div className="space-y-1">
                      {(draft.fields || []).map((field, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <span className="text-slate-500">{index + 1}.</span>
                          <span className="text-slate-300">{field.label}</span>
                          <span className="text-slate-600">({field.type})</span>
                          {field.required && <span className="text-red-400">*</span>}
                        </div>
                      ))}
                    </div>
                    
                    <p className="text-xs text-slate-500 mt-4">
                      共 {draft.fields?.length || 0} 個欄位
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {reviewingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">審核草稿</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">審核備註（選填）</label>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    placeholder="給 Leader 的反饋..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setReviewingId(null)
                    setReviewingType(null)
                    setReviewNote('')
                  }}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  disabled={!!processing}
                >
                  取消
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={!!processing}
                  className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors font-medium disabled:opacity-50"
                >
                  {processing === reviewingId ? '處理中...' : '退回'}
                </button>
                <button
                  onClick={() => handleReview('approve')}
                  disabled={!!processing}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-400 transition-colors font-medium disabled:opacity-50"
                >
                  {processing === reviewingId ? '處理中...' : '核准'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




