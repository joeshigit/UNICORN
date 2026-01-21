'use client'

import { useState, useEffect } from 'react'
import { getAllOptionRequests, processOptionRequest } from '@/lib/firestore'
import type { OptionRequest, OptionRequestType } from '@/types'

const typeLabels: Record<OptionRequestType, { label: string; color: string }> = {
  add: { label: '新增', color: 'bg-blue-500/20 text-blue-400' },
  rename: { label: '改名', color: 'bg-purple-500/20 text-purple-400' },
  merge: { label: '合併', color: 'bg-orange-500/20 text-orange-400' },
  deprecate: { label: '停用', color: 'bg-red-500/20 text-red-400' },
  activate: { label: '啟用', color: 'bg-green-500/20 text-green-400' },
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待審核', color: 'bg-yellow-500/20 text-yellow-400' },
  approved: { label: '已核准', color: 'bg-green-500/20 text-green-400' },
  rejected: { label: '已拒絕', color: 'bg-red-500/20 text-red-400' },
}

export default function OptionReviewsPage() {
  const [requests, setRequests] = useState<OptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending'>('pending')
  const [reviewNote, setReviewNote] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<OptionRequest | null>(null)

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    setLoading(true)
    try {
      const data = await getAllOptionRequests()
      setRequests(data)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleProcess(request: OptionRequest, action: 'approve' | 'reject') {
    if (!request.id) return
    
    setProcessing(request.id)
    try {
      await processOptionRequest(request.id, action, reviewNote)
      await loadRequests()
      setSelectedRequest(null)
      setReviewNote('')
    } catch (error: any) {
      console.error('處理失敗:', error)
      alert('處理失敗: ' + error.message)
    } finally {
      setProcessing(null)
    }
  }

  const filteredRequests = filter === 'pending'
    ? requests.filter(r => r.status === 'pending')
    : requests

  const pendingCount = requests.filter(r => r.status === 'pending').length

  function formatDate(dateValue: Date | string | undefined) {
    if (!dateValue) return '-'
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleString('zh-TW')
    }
    // Handle Firestore Timestamp
    if (typeof dateValue === 'object' && 'seconds' in dateValue) {
      return new Date((dateValue as any).seconds * 1000).toLocaleString('zh-TW')
    }
    return '-'
  }

  function renderPayload(request: OptionRequest) {
    const { type, payload } = request
    switch (type) {
      case 'add':
        return (
          <div className="space-y-1">
            <p><span className="text-slate-500">Code:</span> <span className="text-white font-mono">{payload.code}</span></p>
            <p><span className="text-slate-500">Label:</span> <span className="text-white">{payload.label}</span></p>
          </div>
        )
      case 'rename':
        return (
          <div className="space-y-1">
            <p><span className="text-slate-500">Code:</span> <span className="text-white font-mono">{payload.code}</span></p>
            <p><span className="text-slate-500">舊名稱:</span> <span className="text-slate-400 line-through">{payload.oldLabel}</span></p>
            <p><span className="text-slate-500">新名稱:</span> <span className="text-white">{payload.newLabel}</span></p>
          </div>
        )
      case 'merge':
        return (
          <div className="space-y-1">
            <p><span className="text-slate-500">來源:</span> <span className="text-slate-400 font-mono">{payload.sourceCode}</span></p>
            <p><span className="text-slate-500">合併到:</span> <span className="text-white font-mono">{payload.targetCode}</span></p>
          </div>
        )
      case 'deprecate':
      case 'activate':
        return (
          <p><span className="text-slate-500">Code:</span> <span className="text-white font-mono">{payload.code}</span></p>
        )
      default:
        return <p className="text-slate-500">-</p>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">選項申請審核</h1>
          <p className="text-slate-400 mt-1">
            審核 Leader 提交的選項變更申請
          </p>
        </div>
        
        {/* Filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            待審核 ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            全部 ({requests.length})
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-400">
            {filter === 'pending' ? '沒有待審核的申請' : '還沒有任何申請'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map(request => (
            <div
              key={request.id}
              className={`bg-slate-800 rounded-xl border transition-colors ${
                request.status === 'pending'
                  ? 'border-amber-500/30'
                  : 'border-slate-700'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* Left side */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${typeLabels[request.type].color}`}>
                        {typeLabels[request.type].label}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusLabels[request.status].color}`}>
                        {statusLabels[request.status].label}
                      </span>
                      <span className="text-slate-500 text-sm">
                        {request.setName || request.setId}
                      </span>
                    </div>
                    
                    <div className="text-sm">
                      {renderPayload(request)}
                    </div>
                    
                    {request.payload.reason && (
                      <p className="mt-2 text-sm text-slate-400">
                        <span className="text-slate-500">原因:</span> {request.payload.reason}
                      </p>
                    )}
                    
                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                      <span>申請人: {request.requestedBy}</span>
                      <span>申請時間: {formatDate(request.requestedAt)}</span>
                    </div>
                    
                    {request.status !== 'pending' && (
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                        <span>審核人: {request.reviewedBy}</span>
                        <span>審核時間: {formatDate(request.reviewedAt)}</span>
                        {request.reviewNote && (
                          <span>備註: {request.reviewNote}</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Right side - Actions */}
                  {request.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedRequest(request)}
                        className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors text-sm"
                      >
                        審核
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">審核申請</h2>
              
              <div className="bg-slate-900 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${typeLabels[selectedRequest.type].color}`}>
                    {typeLabels[selectedRequest.type].label}
                  </span>
                  <span className="text-slate-400 text-sm">
                    {selectedRequest.setName || selectedRequest.setId}
                  </span>
                </div>
                {renderPayload(selectedRequest)}
                {selectedRequest.payload.reason && (
                  <p className="mt-2 text-sm text-slate-400">
                    原因: {selectedRequest.payload.reason}
                  </p>
                )}
              </div>
              
              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-2">
                  審核備註（選填）
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  rows={3}
                  placeholder="輸入審核備註..."
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setSelectedRequest(null)
                    setReviewNote('')
                  }}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  disabled={processing !== null}
                >
                  取消
                </button>
                <button
                  onClick={() => handleProcess(selectedRequest, 'reject')}
                  disabled={processing !== null}
                  className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {processing === selectedRequest.id ? '處理中...' : '拒絕'}
                </button>
                <button
                  onClick={() => handleProcess(selectedRequest, 'approve')}
                  disabled={processing !== null}
                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50"
                >
                  {processing === selectedRequest.id ? '處理中...' : '核准'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}





