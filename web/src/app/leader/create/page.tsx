'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getTemplate, getTemplates, getOptionSets, createTemplate, updateTemplate } from '@/lib/firestore'
import { FIXED_KEYS } from '@/types'
import type { Template, FieldDefinition, FieldType, OptionSet, DevMeta } from '@/types'
import { useRouter, useSearchParams } from 'next/navigation'

type Step = 'meta' | 'fields' | 'confirm'
type Mode = 'new' | 'copy' | 'edit'

const EMPTY_DEV_META: DevMeta = {
  purpose: '',
  intendedUsers: '',
  outputAction: '',
  connectedSource: '',
  retrievalHint: '',
  precautions: '',
}

export default function CreateFormPage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromId = searchParams.get('from')
  const editId = searchParams.get('edit')

  const mode: Mode = editId ? 'edit' : fromId ? 'copy' : 'new'
  const sourceId = editId || fromId

  const [step, setStep] = useState<Step>('meta')
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [allTemplates, setAllTemplates] = useState<Template[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingSource, setLoadingSource] = useState(!!sourceId)
  const [sourceTemplate, setSourceTemplate] = useState<Template | null>(null)

  const [name, setName] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [actionId, setActionId] = useState('')
  const [description, setDescription] = useState('')
  const [devMeta, setDevMeta] = useState<DevMeta>({ ...EMPTY_DEV_META })
  const [fields, setFields] = useState<FieldDefinition[]>([])

  const isEditingPublished = mode === 'edit' && sourceTemplate && sourceTemplate._isDraft !== true
  const isEditingDraft = mode === 'edit' && sourceTemplate && sourceTemplate._isDraft === true

  useEffect(() => {
    loadOptionSets()
    loadAllTemplates()
    if (sourceId) loadSourceTemplate(sourceId)
    else setLoadingSource(false)
  }, [])

  const loadOptionSets = async () => {
    try {
      const data = await getOptionSets()
      setOptionSets(data)
    } catch (e) { console.error('載入選項池失敗:', e) }
  }

  const loadAllTemplates = async () => {
    try {
      const data = await getTemplates()
      setAllTemplates(data)
    } catch (e) { console.error('載入表格失敗:', e) }
  }

  const loadSourceTemplate = async (id: string) => {
    try {
      const t = await getTemplate(id)
      if (t) {
        setSourceTemplate(t)
        setName(mode === 'copy' ? t.name + '（複製）' : t.name)
        setModuleId(t.moduleId)
        setActionId(t.actionId)
        setDescription(t.description || '')
        setDevMeta(t.devMeta ? { ...t.devMeta } : { ...EMPTY_DEV_META })
        setFields(t.fields.map((f, i) => ({ ...f, order: i })))
      }
    } catch (e) { console.error('載入來源表格失敗:', e) }
    finally { setLoadingSource(false) }
  }

  const fixedKeyOptions = useMemo(() => {
    return Object.entries(FIXED_KEYS).map(([key, meta]) => ({
      key,
      type: meta.type as FieldType,
      group: 'fixed' as const,
      label: `${key}  (${meta.type})`,
    }))
  }, [])

  const optionSetKeyOptions = useMemo(() => {
    const masterSets = optionSets.filter(os => os.isMaster === true || os.isMaster === undefined)
    const seen = new Set<string>()
    return masterSets
      .filter(os => { if (seen.has(os.code)) return false; seen.add(os.code); return true })
      .map(os => ({ key: os.code, type: 'dropdown' as FieldType, group: 'optionSet' as const, label: `${os.code}  (dropdown)` }))
  }, [optionSets])

  const moduleOptions = useMemo(() => {
    const s = optionSets.find(os => os.code === 'module' && (os.isMaster === true || os.isMaster === undefined))
    return s?.items || []
  }, [optionSets])

  const actionOptions = useMemo(() => {
    const s = optionSets.find(os => os.code === 'action' && (os.isMaster === true || os.isMaster === undefined))
    return s?.items || []
  }, [optionSets])

  const allKeyOptions = useMemo(() => [...fixedKeyOptions, ...optionSetKeyOptions], [fixedKeyOptions, optionSetKeyOptions])
  const usedKeys = new Set(fields.map(f => f.key))
  const codeId = `${moduleId}_${actionId}`

  const isDuplicateCode = mode === 'edit'
    ? allTemplates.some(t => t.id !== editId && t.moduleId === moduleId && t.actionId === actionId)
    : allTemplates.some(t => t.moduleId === moduleId && t.actionId === actionId)

  const handleAddField = () => {
    setFields(prev => [...prev, { key: '' as any, type: 'text', label: '', required: false, order: prev.length }])
  }

  const handleUpdateField = (index: number, updates: Partial<FieldDefinition>) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== index) return f
      const updated = { ...f, ...updates }
      if (updates.key) {
        const match = allKeyOptions.find(o => o.key === updates.key)
        if (match) { updated.type = match.type; if (match.group === 'fixed') updated.optionSetId = undefined }
      }
      return updated
    }))
  }

  const handleRemoveField = (index: number) => {
    if (isEditingPublished && !confirm('此欄位在舊 submission 中可能有資料。刪除後新提交不再收集此項。確定？')) return
    setFields(prev => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })))
  }

  const handleMoveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= fields.length) return
    setFields(prev => {
      const copy = [...prev]; const tmp = copy[index]; copy[index] = copy[newIndex]; copy[newIndex] = tmp
      return copy.map((f, i) => ({ ...f, order: i }))
    })
  }

  const canProceedToFields = name.trim() && moduleId.trim() && actionId.trim()
  const canProceedToConfirm = fields.length > 0 && fields.every(f => f.key && f.label.trim())

  const stripUndefined = (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) result[k] = v
    }
    return result
  }

  const buildTemplateData = () => {
    const cleanMeta: DevMeta = { ...devMeta }
    const hasAnyMeta = Object.values(cleanMeta).some(v => v.trim())
    const cleanFields = fields.map(f => stripUndefined({
      key: f.key,
      type: f.type,
      label: f.label,
      required: f.required,
      order: f.order,
      ...(f.optionSetId ? { optionSetId: f.optionSetId } : {}),
      ...(f.helpText ? { helpText: f.helpText } : {}),
      ...(f.multiple ? { multiple: f.multiple } : {}),
      ...(f.refConfig ? { refConfig: f.refConfig } : {}),
      ...(f.computeConfig ? { computeConfig: f.computeConfig } : {}),
      ...(f.dateRole ? { dateRole: f.dateRole } : {}),
      ...(f.datePartner ? { datePartner: f.datePartner } : {}),
    }))
    const data: Record<string, any> = {
      name: name.trim(),
      moduleId: moduleId.trim(),
      actionId: actionId.trim(),
      fields: cleanFields,
    }
    if (description.trim()) data.description = description.trim()
    if (hasAnyMeta) data.devMeta = cleanMeta
    return data
  }

  const handleSaveDraft = async () => {
    if (!user?.email) return
    try {
      setSaving(true)
      const data = buildTemplateData()
      if (mode === 'edit' && editId) {
        await updateTemplate(editId, { ...data, _isDraft: true, enabled: false } as any)
        alert('草稿已儲存！')
      } else {
        await createTemplate({ ...data, enabled: false, _isDraft: true, version: 1, createdBy: user.email } as any, user.email)
        alert('草稿已儲存！')
      }
      router.push('/leader')
    } catch (e) {
      alert('儲存失敗：' + (e instanceof Error ? e.message : '未知錯誤'))
    } finally { setSaving(false) }
  }

  const handlePublish = async () => {
    if (!user?.email) return
    try {
      setSaving(true)
      const data = buildTemplateData()
      if (mode === 'edit' && editId) {
        await updateTemplate(editId, { ...data, _isDraft: false, enabled: true } as any)
        alert(isEditingPublished ? '表格已更新！' : '表格已發佈！')
      } else {
        await createTemplate({ ...data, enabled: true, _isDraft: false, version: 1, createdBy: user.email } as any, user.email)
        alert('表格已發佈！')
      }
      router.push('/leader')
    } catch (e) {
      alert('發佈失敗：' + (e instanceof Error ? e.message : '未知錯誤'))
    } finally { setSaving(false) }
  }

  const handleUpdate = async () => {
    if (!user?.email || !editId) return
    try {
      setSaving(true)
      const data = buildTemplateData()
      await updateTemplate(editId, data as any)
      alert('表格已更新！（version +1）')
      router.push('/leader')
    } catch (e) {
      alert('更新失敗：' + (e instanceof Error ? e.message : '未知錯誤'))
    } finally { setSaving(false) }
  }

  const pageTitle = mode === 'edit'
    ? (isEditingPublished ? '編輯表格' : '編輯草稿')
    : mode === 'copy' ? '複製表格' : '建立表格'

  if (loadingSource) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl min-h-screen bg-indigo-50/50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 rounded-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
        <p className="text-gray-500 mt-1">
          {mode === 'edit' && isEditingPublished && '修改已發佈的表格（儲存後 version +1）'}
          {mode === 'edit' && isEditingDraft && '繼續編輯草稿，完成後可發佈'}
          {mode === 'copy' && '基於現有表格複製為新表格'}
          {mode === 'new' && '定義表格資訊、欄位、然後發佈或儲存草稿'}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['meta', 'fields', 'confirm'] as Step[]).map((s, i) => {
          const labels = ['基本資訊', '欄位定義', isEditingPublished ? '確認更新' : '確認']
          const isCurrent = step === s
          const isPast = (step === 'fields' && i === 0) || (step === 'confirm' && i < 2)
          return (
            <button
              key={s}
              onClick={() => { if (isPast) setStep(s) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isCurrent ? 'bg-purple-600 text-white' : isPast ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}. {labels[i]}
            </button>
          )
        })}
      </div>

      {/* Step 1: Meta */}
      {step === 'meta' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">表格基本資訊</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">表格名稱 <span className="text-red-500">*</span></label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例：營會登記表" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              {isEditingPublished && (
                <div className="md:col-span-2 text-xs text-amber-700 bg-amber-100 rounded p-2">
                  修改 Module/Action 會影響識別碼和查詢分類。如非必要，建議保持不變。
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-amber-800 mb-1">Module（分類）<span className="text-red-500">*</span><span className="ml-1 text-xs font-normal text-amber-600">來自選項池</span></label>
                {moduleOptions.length > 0 ? (
                  <select value={moduleId} onChange={e => setModuleId(e.target.value)} className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white font-mono">
                    <option value="">選擇 Module...</option>
                    {moduleOptions.map(item => <option key={item.value} value={item.value}>{item.label || item.value}</option>)}
                  </select>
                ) : (
                  <div className="text-sm text-amber-700 bg-amber-100 rounded-lg p-2">尚未建立 <code className="font-mono">module</code> OptionSet</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-amber-800 mb-1">Action（動作）<span className="text-red-500">*</span><span className="ml-1 text-xs font-normal text-amber-600">來自選項池</span></label>
                {actionOptions.length > 0 ? (
                  <select value={actionId} onChange={e => setActionId(e.target.value)} className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white font-mono">
                    <option value="">選擇 Action...</option>
                    {actionOptions.map(item => <option key={item.value} value={item.value}>{item.label || item.value}</option>)}
                  </select>
                ) : (
                  <div className="text-sm text-amber-700 bg-amber-100 rounded-lg p-2">尚未建立 <code className="font-mono">action</code> OptionSet</div>
                )}
              </div>
            </div>
            {moduleId && actionId && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">識別碼：</span>
                <span className={`font-mono text-sm px-2 py-0.5 rounded ${isDuplicateCode ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>{codeId}</span>
                {isDuplicateCode && <span className="text-xs text-red-600">此組合已存在</span>}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">說明（給填報者看）</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="簡短描述此表格用途" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Developer 備忘</h2>
            <p className="text-sm text-gray-500">以下資訊僅 Developer 可見</p>
            {[
              { key: 'purpose' as const, label: '用途', placeholder: '這張表收什麼資料？' },
              { key: 'intendedUsers' as const, label: '預定填報對象', placeholder: '誰會填這張表？' },
              { key: 'outputAction' as const, label: '填完後的後續動作', placeholder: '寄 email？歸檔？' },
              { key: 'connectedSource' as const, label: '連結來源', placeholder: '相關的 Google Form 或其他系統' },
              { key: 'retrievalHint' as const, label: '資料查詢提示', placeholder: '未來怎麼找回這批資料？' },
              { key: 'precautions' as const, label: '注意事項', placeholder: '需要特別留意的地方' },
            ].map(item => (
              <div key={item.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                <input type="text" value={devMeta[item.key]} onChange={e => setDevMeta(prev => ({ ...prev, [item.key]: e.target.value }))} placeholder={item.placeholder} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep('fields')} disabled={!canProceedToFields || isDuplicateCode} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
              下一步：欄位定義
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Fields */}
      {step === 'fields' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">欄位定義</h2>

            {fields.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <p className="text-gray-500">尚未新增任何欄位</p>
                <button onClick={handleAddField} className="mt-2 text-purple-600 hover:text-purple-700 text-sm">點擊新增第一個欄位</button>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const isDropdown = field.type === 'dropdown'
                  const relevantOptionSets = isDropdown ? optionSets.filter(os => os.code === field.key) : []
                  return (
                    <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-purple-600">欄位 #{index + 1}</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleMoveField(index, -1)} disabled={index === 0} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-purple-100 hover:text-purple-700 disabled:opacity-30 disabled:hover:bg-gray-100 disabled:hover:text-gray-600 transition-colors">
                            ▲ 上移
                          </button>
                          <button onClick={() => handleMoveField(index, 1)} disabled={index === fields.length - 1} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-purple-100 hover:text-purple-700 disabled:opacity-30 disabled:hover:bg-gray-100 disabled:hover:text-gray-600 transition-colors">
                            ▼ 下移
                          </button>
                          <button onClick={() => handleRemoveField(index)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100 hover:text-red-700 transition-colors">
                            ✕ 刪除
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">KEY（Universal Key）</label>
                          <select value={field.key} onChange={e => handleUpdateField(index, { key: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white">
                            <option value="">選擇 KEY...</option>
                            <optgroup label="Fixed Keys">
                              {fixedKeyOptions.map(o => <option key={o.key} value={o.key} disabled={usedKeys.has(o.key) && o.key !== field.key}>{o.label}</option>)}
                            </optgroup>
                            <optgroup label="OptionSet Keys">
                              {optionSetKeyOptions.map(o => <option key={o.key} value={o.key} disabled={usedKeys.has(o.key) && o.key !== field.key}>{o.label}</option>)}
                            </optgroup>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Label（顯示名稱）</label>
                          <input type="text" value={field.label} onChange={e => handleUpdateField(index, { label: e.target.value })} placeholder="例：入營學校" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                        </div>
                        <div className="flex items-end gap-4">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Type</label>
                            <span className="inline-block px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">{field.type || '—'}</span>
                          </div>
                          <label className="flex items-center gap-2 pb-2 cursor-pointer">
                            <input type="checkbox" checked={field.required} onChange={e => handleUpdateField(index, { required: e.target.checked })} className="text-purple-600 rounded" />
                            <span className="text-sm text-gray-700">必填</span>
                          </label>
                        </div>
                      </div>
                      {isDropdown && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">OptionSet</label>
                          <select value={field.optionSetId || ''} onChange={e => handleUpdateField(index, { optionSetId: e.target.value || undefined })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white">
                            <option value="">選擇 OptionSet...</option>
                            {relevantOptionSets.map(os => <option key={os.id} value={os.id}>{os.name} ({os.items.length} 個選項) {os.isMaster !== false ? '[MASTER]' : '[SUBSET]'}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={handleAddField} className="w-full mt-4 py-3 border-2 border-dashed border-purple-300 rounded-xl text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-colors text-sm font-medium">
              + 新增欄位
            </button>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('meta')} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">上一步</button>
            <button onClick={() => setStep('confirm')} disabled={!canProceedToConfirm} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">下一步：確認</button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border-2 border-purple-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditingPublished ? '確認更新' : isEditingDraft ? '確認草稿 / 發佈' : '確認'}
            </h2>

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="text-gray-500">表格名稱</div>
              <div className="text-gray-900 font-medium">{name}</div>
              <div className="text-gray-500">識別碼</div>
              <div><span className="bg-purple-100 text-purple-700 font-mono text-sm px-2 py-0.5 rounded">{codeId}</span></div>
              <div className="text-gray-500">欄位數</div>
              <div className="text-gray-900">{fields.length}</div>
              {isEditingPublished && sourceTemplate && (
                <>
                  <div className="text-gray-500">目前版本</div>
                  <div className="text-gray-900">v{sourceTemplate.version} → v{(sourceTemplate.version || 1) + 1}</div>
                </>
              )}
              {description && (
                <>
                  <div className="text-gray-500">說明</div>
                  <div className="text-gray-900">{description}</div>
                </>
              )}
            </div>

            {devMeta && Object.values(devMeta).some(v => v.trim()) && (
              <div className="border-t border-gray-100 pt-4 space-y-1">
                {[
                  { key: 'purpose' as const, label: '用途' },
                  { key: 'intendedUsers' as const, label: '對象' },
                  { key: 'outputAction' as const, label: '後續動作' },
                  { key: 'connectedSource' as const, label: '連結來源' },
                  { key: 'retrievalHint' as const, label: '查詢提示' },
                  { key: 'precautions' as const, label: '注意事項' },
                ].map(item => devMeta[item.key].trim() ? (
                  <div key={item.key} className="text-sm"><span className="text-gray-400">{item.label}：</span><span className="text-gray-700">{devMeta[item.key]}</span></div>
                ) : null)}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">欄位清單</h3>
              <div className="space-y-1">
                {fields.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400 w-6 text-right">{i + 1}.</span>
                    <span className="font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded text-xs">{f.key}</span>
                    <span className="text-gray-900">{f.label}</span>
                    <span className="text-gray-400">({f.type})</span>
                    {f.required && <span className="text-red-500 text-xs">必填</span>}
                  </div>
                ))}
              </div>
            </div>

            {isEditingPublished && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">更新後 version +1，舊 submission 不受影響（有版本快照保護）。</p>
              </div>
            )}
            {!isEditingPublished && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">發佈後，使用者即可在填報中心看到此表格。或先儲存草稿稍後再發佈。</p>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('fields')} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">返回修改</button>
            <div className="flex gap-2">
              {isEditingPublished ? (
                <button onClick={handleUpdate} disabled={saving} className="px-8 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors font-medium">
                  {saving ? '更新中...' : '更新表格'}
                </button>
              ) : (
                <>
                  <button onClick={handleSaveDraft} disabled={saving} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors">
                    {saving ? '儲存中...' : '儲存草稿'}
                  </button>
                  <button onClick={handlePublish} disabled={saving} className="px-8 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors font-medium">
                    {saving ? '發佈中...' : '發佈'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
