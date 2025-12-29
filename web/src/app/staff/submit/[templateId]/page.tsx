'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { getTemplate, getOptionSet, createSubmissionWithId, generateSubmissionId } from '@/lib/firestore'
import { DateTimePicker } from '@/components/form/DateTimePicker'
import { FileUploader } from '@/components/form/FileUploader'
import type { Template, FieldDefinition, OptionItem } from '@/types'
import Link from 'next/link'

export default function SubmitPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const templateId = params.templateId as string

  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [optionSets, setOptionSets] = useState<Record<string, OptionItem[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // 🦄 UNICORN: 預先產生 submissionId，避免檔案上傳產生 orphan files
  const [submissionId] = useState(() => generateSubmissionId())

  useEffect(() => {
    loadTemplate()
  }, [templateId])

  const loadTemplate = async () => {
    try {
      setLoading(true)
      const data = await getTemplate(templateId)
      
      if (!data || !data.enabled) {
        router.push('/staff')
        return
      }
      
      setTemplate(data)
      
      // 初始化預設值
      const initialValues: Record<string, unknown> = {}
      for (const field of data.fields || []) {
        if (field.type === 'date' && data.defaults?.[field.key] === 'today') {
          initialValues[field.key] = new Date().toISOString().split('T')[0]
        } else if (data.defaults?.[field.key] !== undefined) {
          initialValues[field.key] = data.defaults[field.key]
        } else if (field.type === 'dropdown' && field.multiple) {
          // 多選欄位初始化為空陣列
          initialValues[field.key] = []
        } else if (field.type === 'file') {
          // 檔案欄位初始化為空陣列
          initialValues[field.key] = []
        } else {
          initialValues[field.key] = ''
        }
      }
      setValues(initialValues)
      
      // 載入下拉選項
      const dropdownFields = data.fields?.filter(f => f.type === 'dropdown' && f.optionSetId) || []
      const optionSetData: Record<string, OptionItem[]> = {}
      
      for (const field of dropdownFields) {
        try {
          const optionSet = await getOptionSet(field.optionSetId!)
          if (optionSet) {
            optionSetData[field.optionSetId!] = optionSet.items.filter(i => i.enabled)
          }
        } catch (e) {
          console.error('載入選項池失敗:', field.optionSetId)
        }
      }
      
      setOptionSets(optionSetData)
    } catch (error) {
      console.error('載入表格失敗:', error)
      router.push('/staff')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    for (const field of template?.fields || []) {
      if (field.required) {
        const value = values[field.key]
        // 多選欄位檢查陣列是否為空
        if (Array.isArray(value)) {
          if (value.length === 0) {
            newErrors[field.key] = '請至少選擇一項'
          }
        } else if (value === '' || value === null || value === undefined) {
          newErrors[field.key] = '此欄位為必填'
        }
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) return
    
    try {
      setSubmitting(true)
      
      // 🦄 UNICORN: 建立 labelsSnapshot（凍結標籤供顯示用）
      const labelsSnapshot: Record<string, string> = {}
      for (const field of template!.fields || []) {
        labelsSnapshot[field.key] = field.label
      }
      
      // 分離檔案欄位和一般欄位（Firebase 最佳實踐）
      const fileFields = template!.fields?.filter(f => f.type === 'file') || []
      const allFiles: Array<{
        fieldKey: string      // 🦄 UNICORN: Link file to field
        driveFileId: string
        name: string
        mimeType: string
        size: number
        webViewLink?: string
      }> = []
      
      // 建立乾淨的 values（不含檔案物件，只存連結參考）
      const cleanValues: Record<string, unknown> = {}
      
      for (const [key, value] of Object.entries(values)) {
        const isFileField = fileFields.some(f => f.key === key)
        
        if (isFileField && Array.isArray(value)) {
          // 🦄 UNICORN: 收集檔案並關聯到欄位 key
          for (const file of value as any[]) {
            allFiles.push({
              fieldKey: key,    // 🦄 UNICORN: Which field this file belongs to
              driveFileId: file.driveFileId,
              name: file.name,
              mimeType: file.mimeType,
              size: file.size,
              webViewLink: file.webViewLink
            })
          }
          // 在 values 中只存檔案數量或簡單參考
          cleanValues[key] = (value as any[]).length > 0 
            ? `${(value as any[]).length} 個檔案` 
            : ''
        } else {
          cleanValues[key] = value
        }
      }
      
      // 🦄 UNICORN: 使用預先產生的 submissionId 建立 submission
      await createSubmissionWithId(submissionId, {
        templateId: template!.id!,
        templateVersion: template!.version || 1,  // 🦄 UNICORN: Freeze template version
        moduleId: template!.moduleId,
        actionId: template!.actionId,
        values: cleanValues,
        labelsSnapshot,                           // 🦄 UNICORN: Freeze labels for display
        files: allFiles.length > 0 ? allFiles : undefined
      }, user!.email!)
      
      // 成功
      router.push('/staff/my-submissions?success=1')
    } catch (error) {
      console.error('提交失敗:', error)
      alert('提交失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  const renderField = (field: FieldDefinition) => {
    const value = values[field.key]
    const error = errors[field.key]
    
    const baseClasses = `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
      error ? 'border-red-300 bg-red-50' : 'border-gray-300'
    }`

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value as string || ''}
            onChange={e => handleChange(field.key, e.target.value)}
            placeholder={field.helpText || `輸入${field.label}`}
            className={baseClasses}
          />
        )
      
      case 'number':
        return (
          <input
            type="number"
            value={value as number || ''}
            onChange={e => handleChange(field.key, e.target.value ? Number(e.target.value) : '')}
            placeholder={field.helpText || `輸入${field.label}`}
            className={baseClasses}
          />
        )
      
      case 'date':
        return (
          <input
            type="date"
            value={value as string || ''}
            onChange={e => handleChange(field.key, e.target.value)}
            className={baseClasses}
          />
        )
      
      case 'datetime':
        return (
          <DateTimePicker
            value={value as string || ''}
            onChange={val => handleChange(field.key, val)}
            error={!!error}
          />
        )
      
      case 'dropdown':
        const options = field.optionSetId ? optionSets[field.optionSetId] || [] : []
        
        // 多選模式：checkbox 清單
        if (field.multiple) {
          const selectedValues = Array.isArray(value) ? value as string[] : []
          return (
            <div className={`border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
              {options.length === 0 ? (
                <p className="text-gray-400 text-sm">沒有可選項目</p>
              ) : (
                options.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(opt.value)}
                      onChange={e => {
                        if (e.target.checked) {
                          handleChange(field.key, [...selectedValues, opt.value])
                        } else {
                          handleChange(field.key, selectedValues.filter(v => v !== opt.value))
                        }
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))
              )}
            </div>
          )
        }
        
        // 單選模式：下拉選單
        return (
          <select
            value={value as string || ''}
            onChange={e => handleChange(field.key, e.target.value)}
            className={baseClasses}
          >
            <option value="">請選擇...</option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )
      
      case 'textarea':
        return (
          <textarea
            value={value as string || ''}
            onChange={e => handleChange(field.key, e.target.value)}
            placeholder={field.helpText || `輸入${field.label}`}
            rows={4}
            className={baseClasses}
          />
        )
      
      case 'file':
        const fileValue = Array.isArray(value) ? value : []
        return (
          <FileUploader
            value={fileValue}
            onChange={(files) => handleChange(field.key, files)}
            moduleId={template?.moduleId}
            submissionId={submissionId}  // 🦄 UNICORN: 使用預先產生的 ID
            error={!!error}
          />
        )
      
      default:
        return (
          <input
            type="text"
            value={value as string || ''}
            onChange={e => handleChange(field.key, e.target.value)}
            className={baseClasses}
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-500 mt-2">載入表格中...</p>
      </div>
    )
  }

  if (!template) {
    return null
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* 返回按鈕 */}
      <Link
        href="/staff"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </Link>

      {/* 表格資訊 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
          <h1 className="text-xl font-bold">{template.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-blue-200 text-sm">
            <span className="bg-white/20 px-2 py-0.5 rounded">{template.moduleId}</span>
            <span className="bg-white/20 px-2 py-0.5 rounded">{template.actionId}</span>
          </div>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {template.fields?.sort((a, b) => a.order - b.order).map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {renderField(field)}
              {errors[field.key] && (
                <p className="text-red-500 text-sm mt-1">{errors[field.key]}</p>
              )}
              {field.helpText && !errors[field.key] && (
                <p className="text-gray-400 text-sm mt-1">{field.helpText}</p>
              )}
            </div>
          ))}

          {/* 提交按鈕 */}
          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  提交中...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  提交
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
