'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getOptionSets } from '@/lib/firestore'
import type { Template, FieldDefinition, FieldType, OptionSet } from '@/types'

// 欄位類型選項
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: '單行文字' },
  { value: 'number', label: '數字' },
  { value: 'date', label: '日期' },
  { value: 'datetime', label: '日期時間' },
  { value: 'dropdown', label: '下拉選單' },
  { value: 'textarea', label: '多行文字' },
  { value: 'file', label: '檔案上傳' },
]

// 🦄 UNICORN: 從 label 自動產生語義化 key
const generateFieldKey = (label: string): string => {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_') // 替換特殊字符為底線
    .replace(/^_+|_+$/g, '')                   // 移除首尾底線
    .substring(0, 30)                          // 限制長度
    || `field_${Date.now()}`                   // fallback
}

// 🦄 UNICORN: 驗證 key 格式
const isValidFieldKey = (key: string): boolean => {
  return /^[a-z0-9_\u4e00-\u9fff]+$/.test(key) && key.length > 0 && key.length <= 30
}

export default function TemplatesPage() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)

  // 表單狀態
  const [formData, setFormData] = useState({
    name: '',
    moduleId: '',
    actionId: '',
    enabled: true,
    version: 1,  // 🦄 UNICORN: Template versioning
    fields: [] as FieldDefinition[]
  })

  // 載入表格列表和選項池
  useEffect(() => {
    loadTemplates()
    loadOptionSets()
  }, [])

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

  const loadOptionSets = async () => {
    try {
      const data = await getOptionSets()
      setOptionSets(data)
    } catch (error) {
      console.error('載入選項池失敗:', error)
    }
  }

  // 開啟新增表格
  const handleNew = () => {
    setEditingTemplate(null)
    setFormData({
      name: '',
      moduleId: '',
      actionId: '',
      enabled: true,
      version: 1,  // 🦄 UNICORN: New template starts at version 1
      fields: []
    })
    setShowEditor(true)
  }

  // 開啟編輯表格
  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      moduleId: template.moduleId,
      actionId: template.actionId,
      enabled: template.enabled,
      version: template.version || 1,  // 🦄 UNICORN: Load existing version
      fields: template.fields || []
    })
    setShowEditor(true)
  }

  // 切換啟用狀態
  const handleToggleEnabled = async (template: Template) => {
    try {
      await updateTemplate(template.id!, { enabled: !template.enabled })
      await loadTemplates()
    } catch (error) {
      console.error('更新失敗:', error)
    }
  }

  // 刪除表格
  const handleDelete = async (template: Template) => {
    if (!confirm(`確定要刪除「${template.name}」嗎？`)) return
    try {
      await deleteTemplate(template.id!)
      await loadTemplates()
    } catch (error) {
      console.error('刪除失敗:', error)
    }
  }

  // 新增欄位
  const handleAddField = () => {
    const newField: FieldDefinition = {
      key: '',  // 🦄 UNICORN: Empty key, will be set when label is entered
      type: 'text',
      label: '',
      required: false,
      order: formData.fields.length
    }
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }))
  }

  // 更新欄位
  const handleUpdateField = (index: number, updates: Partial<FieldDefinition>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => {
        if (i !== index) return f
        
        const updated = { ...f, ...updates }
        
        // 🦄 UNICORN: Auto-generate key from label if key is empty
        if (updates.label && !f.key) {
          updated.key = generateFieldKey(updates.label)
        }
        
        return updated
      })
    }))
  }

  // 刪除欄位
  const handleDeleteField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }))
  }

  // 儲存表格
  const handleSave = async () => {
    if (!formData.name || !formData.moduleId || !formData.actionId) {
      alert('請填寫表格名稱、分類和動作')
      return
    }
    
    // 🦄 UNICORN: Validate all field keys
    for (const field of formData.fields) {
      if (!field.key) {
        alert(`欄位「${field.label || '未命名'}」缺少 Key，請輸入標籤後自動產生或手動輸入`)
        return
      }
      if (!isValidFieldKey(field.key)) {
        alert(`欄位 Key「${field.key}」格式不正確，只能使用小寫字母、數字、底線和中文`)
        return
      }
    }
    
    // 🦄 UNICORN: Check for duplicate keys
    const keys = formData.fields.map(f => f.key)
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i)
    if (duplicates.length > 0) {
      alert(`欄位 Key「${duplicates[0]}」重複，每個欄位必須有唯一的 Key`)
      return
    }

    try {
      setSaving(true)
      
      if (editingTemplate) {
        // 🦄 UNICORN: Increment version on edit
        const newVersion = (editingTemplate.version || 1) + 1
        await updateTemplate(editingTemplate.id!, { ...formData, version: newVersion })
      } else {
        // 新增（version = 1）
        await createTemplate({ ...formData, version: 1 }, user!.email!)
      }
      
      setShowEditor(false)
      await loadTemplates()
    } catch (error) {
      console.error('儲存失敗:', error)
      alert('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 標題區 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">表格管理</h1>
          <p className="text-gray-500 mt-1">建立和管理資料收集表格</p>
        </div>
        <button
          onClick={handleNew}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增表格
        </button>
      </div>

      {/* 表格列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-500 mt-2">載入中...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mt-4">還沒有任何表格</h3>
          <p className="text-gray-500 mt-1">點擊「新增表格」開始建立</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      template.enabled 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {template.enabled ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                      {template.moduleId}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      {template.actionId}
                    </span>
                    <span>{template.fields?.length || 0} 個欄位</span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      v{template.version || 1}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(template)}
                    className={`p-2 rounded-lg transition-colors ${
                      template.enabled
                        ? 'text-amber-600 hover:bg-amber-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={template.enabled ? '停用' : '啟用'}
                  >
                    {template.enabled ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    title="編輯"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="刪除"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 編輯器 Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTemplate ? '編輯表格' : '新增表格'}
              </h2>
              <button
                onClick={() => setShowEditor(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 基本資訊 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    表格名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例：零用金報銷"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分類 (Module) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.moduleId}
                    onChange={e => setFormData(prev => ({ ...prev, moduleId: e.target.value.toUpperCase() }))}
                    placeholder="例：PETTYCASH"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    動作 (Action) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.actionId}
                    onChange={e => setFormData(prev => ({ ...prev, actionId: e.target.value.toUpperCase() }))}
                    placeholder="例：REIMBURSEMENT"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 欄位定義 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    欄位定義
                  </label>
                  <button
                    onClick={handleAddField}
                    className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    新增欄位
                  </button>
                </div>

                {formData.fields.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <p className="text-gray-500">尚未新增任何欄位</p>
                    <button
                      onClick={handleAddField}
                      className="mt-2 text-purple-600 hover:text-purple-700"
                    >
                      點擊新增第一個欄位
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.fields.map((field, index) => (
                      <div
                        key={field.key}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-4">
                            <label className="block text-xs text-gray-500 mb-1">欄位標籤 (顯示用)</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => handleUpdateField(index, { label: e.target.value })}
                              placeholder="例：學校名稱"
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs text-gray-500 mb-1">
                              欄位 Key <span className="text-purple-600">(查詢用)</span>
                            </label>
                            <input
                              type="text"
                              value={field.key}
                              onChange={e => handleUpdateField(index, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_\u4e00-\u9fff]/g, '_') })}
                              placeholder="自動產生"
                              className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono ${
                                field.key && !isValidFieldKey(field.key) ? 'border-red-300 bg-red-50' : 'border-gray-300'
                              }`}
                            />
                            {field.key && !isValidFieldKey(field.key) && (
                              <p className="text-xs text-red-500 mt-0.5">Key 格式不正確</p>
                            )}
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs text-gray-500 mb-1">類型</label>
                            <select
                              value={field.type}
                              onChange={e => handleUpdateField(index, { type: e.target.value as FieldType })}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              {FIELD_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2 flex items-end gap-2">
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => handleUpdateField(index, { required: e.target.checked })}
                                className="rounded text-purple-600 focus:ring-purple-500"
                              />
                              必填
                            </label>
                            <button
                              onClick={() => handleDeleteField(index)}
                              className="p-1 text-gray-400 hover:text-red-600"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        
                        {/* Dropdown 專用：選項池選擇 */}
                        {field.type === 'dropdown' && (
                          <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">選擇選項池</label>
                              <select
                                value={field.optionSetId || ''}
                                onChange={e => {
                                  const selectedSetId = e.target.value
                                  const selectedSet = optionSets.find(os => os.id === selectedSetId)
                                  // 🦄 UNICORN: 自動使用 optionSet.code 作為 field key
                                  const updates: Partial<typeof field> = { optionSetId: selectedSetId }
                                  if (selectedSet?.code) {
                                    updates.key = selectedSet.code
                                  }
                                  handleUpdateField(index, updates)
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              >
                                <option value="">請選擇選項池...</option>
                                {optionSets.map(os => (
                                  <option key={os.id} value={os.id}>
                                    {os.name} {os.code && `[${os.code}]`} ({os.items?.length || 0} 個選項)
                                  </option>
                                ))}
                              </select>
                              {field.optionSetId && (
                                <p className="text-xs text-purple-600 mt-1">
                                  🦄 欄位 Key 自動設為：<span className="font-mono font-medium">{field.key}</span>
                                </p>
                              )}
                              {optionSets.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">
                                  尚未建立選項池，請先到「選項池」頁面建立
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`multiple-${field.key}`}
                                  checked={!field.multiple}
                                  onChange={() => handleUpdateField(index, { multiple: false })}
                                  className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-700">單選</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`multiple-${field.key}`}
                                  checked={field.multiple === true}
                                  onChange={() => handleUpdateField(index, { multiple: true })}
                                  className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-700">多選</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowEditor(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
