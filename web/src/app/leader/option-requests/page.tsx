'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getMyOptionRequests, 
  createOptionRequest, 
  getOptionSets 
} from '@/lib/firestore'
import type { OptionRequest, OptionSet, OptionRequestType } from '@/types'

const typeLabels: Record<OptionRequestType, { label: string; color: string; description: string }> = {
  add: { label: '新增', color: 'bg-blue-500/20 text-blue-400', description: '新增一個選項' },
  rename: { label: '改名', color: 'bg-purple-500/20 text-purple-400', description: '變更選項的顯示名稱' },
  merge: { label: '合併', color: 'bg-orange-500/20 text-orange-400', description: '將兩個選項合併為一個' },
  deprecate: { label: '停用', color: 'bg-red-500/20 text-red-400', description: '停用一個選項（歷史資料保留）' },
  activate: { label: '啟用', color: 'bg-green-500/20 text-green-400', description: '將測試中的選項正式啟用' },
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待審核', color: 'bg-yellow-500/20 text-yellow-400' },
  approved: { label: '已核准', color: 'bg-green-500/20 text-green-400' },
  rejected: { label: '已拒絕', color: 'bg-red-500/20 text-red-400' },
}

export default function OptionRequestsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<OptionRequest[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<OptionRequestType>('add')
  const [selectedSetId, setSelectedSetId] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formOldLabel, setFormOldLabel] = useState('')
  const [formNewLabel, setFormNewLabel] = useState('')
  const [formSourceCode, setFormSourceCode] = useState('')
  const [formTargetCode, setFormTargetCode] = useState('')
  const [formReason, setFormReason] = useState('')

  useEffect(() => {
    if (user?.email) {
      loadData()
    }
  }, [user])

  async function loadData() {
    setLoading(true)
    try {
      // 分開載入，避免一個失敗影響另一個
      const optionSetsData = await getOptionSets()
      setOptionSets(optionSetsData)
      console.log('載入選項池:', optionSetsData.length, '個')
      
      try {
        const requestsData = await getMyOptionRequests(user!.email!)
        setRequests(requestsData)
      } catch (error) {
        console.error('載入申請失敗（可能需要建立索引）:', error)
        // 如果是索引問題，可以顯示空列表
        setRequests([])
      }
    } catch (error) {
      console.error('載入選項池失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormCode('')
    setFormLabel('')
    setFormOldLabel('')
    setFormNewLabel('')
    setFormSourceCode('')
    setFormTargetCode('')
    setFormReason('')
  }

  async function handleSubmit() {
    if (!selectedSetId) {
      alert('請選擇選項池')
      return
    }
    
    const selectedSet = optionSets.find(s => s.id === selectedSetId)
    if (!selectedSet) return
    
    // Validate based on type
    let payload: any = {}
    switch (formType) {
      case 'add':
        if (!formCode || !formLabel) {
          alert('請填寫 Code 和顯示名稱')
          return
        }
        payload = { code: formCode, label: formLabel }
        break
      case 'rename':
        if (!formCode || !formNewLabel) {
          alert('請選擇選項並填寫新名稱')
          return
        }
        payload = { code: formCode, oldLabel: formOldLabel, newLabel: formNewLabel, reason: formReason }
        break
      case 'merge':
        if (!formSourceCode || !formTargetCode) {
          alert('請選擇來源和目標選項')
          return
        }
        payload = { sourceCode: formSourceCode, targetCode: formTargetCode, reason: formReason }
        break
      case 'deprecate':
      case 'activate':
        if (!formCode) {
          alert('請選擇選項')
          return
        }
        payload = { code: formCode, reason: formReason }
        break
    }
    
    setSubmitting(true)
    try {
      await createOptionRequest(
        {
          setId: selectedSetId,
          setName: selectedSet.name,
          type: formType,
          payload
        },
        user!.email!
      )
      
      await loadData()
      setShowForm(false)
      resetForm()
    } catch (error: any) {
      console.error('提交失敗:', error)
      alert('提交失敗: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  function formatDate(dateValue: Date | string | undefined) {
    if (!dateValue) return '-'
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleString('zh-TW')
    }
    if (typeof dateValue === 'object' && 'seconds' in dateValue) {
      return new Date((dateValue as any).seconds * 1000).toLocaleString('zh-TW')
    }
    return '-'
  }

  function getSelectedSetItems() {
    const set = optionSets.find(s => s.id === selectedSetId)
    return set?.items || []
  }

  function renderPayload(request: OptionRequest) {
    const { type, payload } = request
    switch (type) {
      case 'add':
        return (
          <span>
            <span className="font-mono text-purple-400">{payload.code}</span>
            <span className="text-gray-500 mx-1">→</span>
            <span>{payload.label}</span>
          </span>
        )
      case 'rename':
        return (
          <span>
            <span className="font-mono text-purple-400">{payload.code}</span>
            <span className="text-gray-500 mx-1">:</span>
            <span className="line-through text-gray-400">{payload.oldLabel}</span>
            <span className="text-gray-500 mx-1">→</span>
            <span>{payload.newLabel}</span>
          </span>
        )
      case 'merge':
        return (
          <span>
            <span className="font-mono text-purple-400">{payload.sourceCode}</span>
            <span className="text-gray-500 mx-1">→</span>
            <span className="font-mono text-purple-400">{payload.targetCode}</span>
          </span>
        )
      case 'deprecate':
      case 'activate':
        return <span className="font-mono text-purple-400">{payload.code}</span>
      default:
        return '-'
    }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">選項變更申請</h1>
          <p className="text-gray-600 mt-1">
            申請新增、修改或停用選項池中的選項
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          + 新增申請
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-gray-500 text-sm">待審核</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-gray-500 text-sm">已核准</p>
          <p className="text-2xl font-bold text-green-600">
            {requests.filter(r => r.status === 'approved').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-gray-500 text-sm">已拒絕</p>
          <p className="text-2xl font-bold text-red-600">
            {requests.filter(r => r.status === 'rejected').length}
          </p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">載入中...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500">還沒有任何申請</p>
          <p className="text-gray-400 text-sm mt-1">點擊「新增申請」來提交第一個申請</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(request => (
            <div
              key={request.id}
              className={`bg-white rounded-xl border p-4 ${
                request.status === 'pending' ? 'border-yellow-300' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${typeLabels[request.type].color}`}>
                    {typeLabels[request.type].label}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusLabels[request.status].color}`}>
                    {statusLabels[request.status].label}
                  </span>
                  <span className="text-gray-500 text-sm">{request.setName}</span>
                </div>
                <span className="text-gray-400 text-sm">{formatDate(request.requestedAt)}</span>
              </div>
              
              <div className="mt-2 text-sm">
                {renderPayload(request)}
              </div>
              
              {request.payload.reason && (
                <p className="mt-2 text-sm text-gray-500">
                  原因: {request.payload.reason}
                </p>
              )}
              
              {request.status !== 'pending' && request.reviewNote && (
                <p className="mt-2 text-sm text-gray-500">
                  審核備註: {request.reviewNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">新增申請</h2>
              
              <div className="space-y-4">
                {/* Select Option Set */}
                <div>
                  <label className="block text-sm text-gray-600 mb-2">選擇選項池 *</label>
                  <select
                    value={selectedSetId}
                    onChange={(e) => {
                      setSelectedSetId(e.target.value)
                      resetForm()
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">請選擇...</option>
                    {optionSets.map(set => (
                      <option key={set.id} value={set.id}>{set.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Select Type */}
                <div>
                  <label className="block text-sm text-gray-600 mb-2">申請類型 *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(typeLabels) as OptionRequestType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => {
                          setFormType(type)
                          resetForm()
                        }}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          formType === type
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeLabels[type].color}`}>
                          {typeLabels[type].label}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">{typeLabels[type].description}</p>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Type-specific fields */}
                {selectedSetId && formType === 'add' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">顯示名稱 *</label>
                      <input
                        type="text"
                        value={formLabel}
                        onChange={(e) => {
                          setFormLabel(e.target.value)
                          // Auto-generate code
                          if (!formCode || formCode === generateCode(formLabel)) {
                            setFormCode(generateCode(e.target.value))
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                        placeholder="例如：台北市立大學"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Code（組織代碼）*</label>
                      <input
                        type="text"
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none font-mono"
                        placeholder="例如：UTAIPEI"
                      />
                      <p className="text-xs text-gray-400 mt-1">此 Code 建立後不可變更</p>
                    </div>
                  </>
                )}
                
                {selectedSetId && formType === 'rename' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">選擇要改名的選項 *</label>
                      <select
                        value={formCode}
                        onChange={(e) => {
                          const item = getSelectedSetItems().find(i => i.value === e.target.value)
                          setFormCode(e.target.value)
                          setFormOldLabel(item?.label || '')
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">請選擇...</option>
                        {getSelectedSetItems()
                          .filter(i => i.status !== 'deprecated')
                          .map(item => (
                            <option key={item.value} value={item.value}>
                              {item.label} ({item.value})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">新名稱 *</label>
                      <input
                        type="text"
                        value={formNewLabel}
                        onChange={(e) => setFormNewLabel(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                        placeholder="輸入新的顯示名稱"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">變更原因</label>
                      <input
                        type="text"
                        value={formReason}
                        onChange={(e) => setFormReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                        placeholder="例如：學校更名"
                      />
                    </div>
                  </>
                )}
                
                {selectedSetId && formType === 'merge' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">來源選項（將被合併）*</label>
                      <select
                        value={formSourceCode}
                        onChange={(e) => setFormSourceCode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">請選擇...</option>
                        {getSelectedSetItems()
                          .filter(i => i.status !== 'deprecated' && i.value !== formTargetCode)
                          .map(item => (
                            <option key={item.value} value={item.value}>
                              {item.label} ({item.value})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">目標選項（保留）*</label>
                      <select
                        value={formTargetCode}
                        onChange={(e) => setFormTargetCode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">請選擇...</option>
                        {getSelectedSetItems()
                          .filter(i => i.status !== 'deprecated' && i.value !== formSourceCode)
                          .map(item => (
                            <option key={item.value} value={item.value}>
                              {item.label} ({item.value})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">合併原因 *</label>
                      <input
                        type="text"
                        value={formReason}
                        onChange={(e) => setFormReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                        placeholder="例如：重複建立"
                      />
                    </div>
                  </>
                )}
                
                {selectedSetId && (formType === 'deprecate' || formType === 'activate') && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">選擇選項 *</label>
                      <select
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">請選擇...</option>
                        {getSelectedSetItems()
                          .filter(i => formType === 'activate' 
                            ? i.status === 'staging' 
                            : i.status === 'active')
                          .map(item => (
                            <option key={item.value} value={item.value}>
                              {item.label} ({item.value}) [{item.status}]
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">原因</label>
                      <input
                        type="text"
                        value={formReason}
                        onChange={(e) => setFormReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                        placeholder={formType === 'deprecate' ? '例如：不再使用' : '例如：測試完成'}
                      />
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowForm(false)
                    resetForm()
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !selectedSetId}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? '提交中...' : '提交申請'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function generateCode(label: string): string {
  // Simple code generation from label
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 30)
}

