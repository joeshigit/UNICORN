'use client'

// Phase 3.3: Form Suggestions Page
// Users can suggest modifications to templates

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getEnabledTemplates,
  getTemplate,
  createTemplateSuggestion,
  getMyTemplateSuggestions
} from '@/lib/firestore'
import type { Template, TemplateSuggestion } from '@/types'

export default function FormSuggestionsPage() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, string>>({})
  const [generalNotes, setGeneralNotes] = useState('')
  const [mySuggestions, setMySuggestions] = useState<TemplateSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'create' | 'history'>('create')

  useEffect(() => {
    if (user?.email) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    if (!user?.email) return
    
    try {
      setLoading(true)
      const [templatesData, suggestionsData] = await Promise.all([
        getEnabledTemplates(),
        getMyTemplateSuggestions(user.email)
      ])
      setTemplates(templatesData)
      setMySuggestions(suggestionsData)
    } catch (error) {
      console.error('載入資料失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectTemplate = async (templateId: string) => {
    try {
      const template = await getTemplate(templateId)
      if (template) {
        setSelectedTemplate(template)
        setSuggestions({})
        setGeneralNotes('')
      }
    } catch (error) {
      console.error('載入表格失敗:', error)
    }
  }

  const handleSuggestionChange = (fieldKey: string, value: string) => {
    setSuggestions(prev => ({
      ...prev,
      [fieldKey]: value
    }))
  }

  const handleSubmit = async () => {
    if (!selectedTemplate || !user?.email) return
    
    const hasSuggestions = Object.values(suggestions).some(s => s.trim()) || generalNotes.trim()
    if (!hasSuggestions) {
      alert('請至少填寫一項建議')
      return
    }
    
    if (!confirm('確定要提交建議嗎？建議將發送給表格擁有者和管理者。')) {
      return
    }
    
    try {
      setSaving(true)
      await createTemplateSuggestion(
        selectedTemplate.id!,
        selectedTemplate.name,
        suggestions,
        generalNotes.trim() || undefined,
        user.email
      )
      
      alert('建議已提交！擁有者和管理者將收到通知。')
      setSelectedTemplate(null)
      setSuggestions({})
      setGeneralNotes('')
      await loadData()
      setView('history')
    } catch (error) {
      console.error('提交建議失敗:', error)
      alert('提交失敗')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (date: any) => {
    const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date))
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">表格建議</h1>
        <p className="text-gray-500 mt-1">
          建議表格修改，幫助改善表格設計
        </p>
      </div>

      {/* View Mode Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-1 flex gap-1">
        <button
          onClick={() => setView('create')}
          className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
            view === 'create'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          提交新建議
        </button>
        <button
          onClick={() => setView('history')}
          className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
            view === 'history'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          我的建議記錄 ({mySuggestions.length})
        </button>
      </div>

      {/* Create View */}
      {view === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Template Selection */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">選擇表格</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id!)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedTemplate?.id === template.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-200'
                    }`}
                  >
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {template.moduleId} · {template.actionId}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Suggestion Form */}
          <div>
            {selectedTemplate ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {selectedTemplate.name}
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                  在每個欄位下方輸入你的建議
                </p>

                <div className="space-y-6">
                  {/* Field Suggestions */}
                  {selectedTemplate.fields.map((field, index) => (
                    <div key={field.key} className="pb-6 border-b border-gray-100 last:border-0">
                      {/* Mock Draft Field Display */}
                      <div className="bg-gray-50 rounded-lg p-4 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <span className="text-xs text-gray-400">{field.type}</span>
                        </div>
                        {field.helpText && (
                          <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                        )}
                        <div className="mt-2 px-3 py-2 bg-white border border-gray-200 rounded text-sm text-gray-400">
                          （模擬輸入框）
                        </div>
                      </div>
                      
                      {/* Suggestion Input */}
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          💡 你的建議：
                        </label>
                        <textarea
                          value={suggestions[field.key] || ''}
                          onChange={(e) => handleSuggestionChange(field.key, e.target.value)}
                          placeholder="例如：建議改為下拉選單、建議新增說明文字等..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  ))}

                  {/* General Notes */}
                  <div className="pt-4 border-t-2 border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      整體建議
                    </label>
                    <textarea
                      value={generalNotes}
                      onChange={(e) => setGeneralNotes(e.target.value)}
                      placeholder="對整個表格的其他建議..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleSubmit}
                      disabled={saving}
                      className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors font-medium"
                    >
                      {saving ? '提交中...' : '提交建議'}
                    </button>
                    <button
                      onClick={() => setSelectedTemplate(null)}
                      disabled={saving}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
                <div className="text-gray-400 mb-3">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <p className="text-gray-600">
                  從左側選擇一個表格<br/>
                  開始提交建議
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History View */}
      {view === 'history' && (
        <div>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 mt-2">載入中...</p>
            </div>
          ) : mySuggestions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mt-4">還沒有建議記錄</h3>
              <p className="text-gray-500 mt-1">前往「提交新建議」開始</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mySuggestions.map(suggestion => (
                <div key={suggestion.id} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{suggestion.templateName}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        提交於 {formatDate(suggestion.createdAt)}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      suggestion.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      suggestion.status === 'reviewed' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {suggestion.status === 'pending' ? '待處理' :
                       suggestion.status === 'reviewed' ? '已審閱' :
                       '已實作'}
                    </span>
                  </div>

                  {/* Field Suggestions */}
                  {Object.entries(suggestion.suggestions).filter(([_, text]) => text.trim()).length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">欄位建議：</h4>
                      <div className="space-y-2">
                        {Object.entries(suggestion.suggestions)
                          .filter(([_, text]) => text.trim())
                          .map(([key, text]) => (
                            <div key={key} className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500 mb-1">{key}</p>
                              <p className="text-sm text-gray-900">{text}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* General Notes */}
                  {suggestion.generalNotes && suggestion.generalNotes.trim() && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">整體建議：</h4>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-sm text-gray-900">{suggestion.generalNotes}</p>
                      </div>
                    </div>
                  )}

                  {/* Resend Button */}
                  {suggestion.status === 'pending' && (
                    <button
                      onClick={async () => {
                        if (confirm('要重新發送此建議的提醒通知給擁有者嗎？')) {
                          alert('重新發送功能將在 Cloud Functions 實作')
                        }
                      }}
                      className="mt-4 text-sm text-blue-600 hover:text-blue-700"
                    >
                      重新發送提醒
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}



