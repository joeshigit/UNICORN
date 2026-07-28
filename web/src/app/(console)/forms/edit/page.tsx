'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import { createTemplate, getTemplate, listOptionSets, updateTemplate } from '@/lib/db'
import { ACTION_CODE, FIXED_KEYS, FIXED_KEY_GROUPS, MANAGER_GROUP_CODE, MODULE_CODE } from '@/lib/keys'
import type { FieldDefinition, OptionSet, Template } from '@/types'

interface KeyChoice {
  key: string
  type: FieldDefinition['type']
  label: string
}

function FormBuilder() {
  const router = useRouter()
  const params = useSearchParams()
  const { email } = useAuth()

  const editId = params.get('id') || ''
  const copyId = params.get('copy') || ''
  const sourceId = editId || copyId

  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [source, setSource] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [actionId, setActionId] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [managerGroups, setManagerGroups] = useState<string[]>([])
  const [fields, setFields] = useState<FieldDefinition[]>([])

  useEffect(() => {
    const boot = async () => {
      try {
        const sets = await listOptionSets()
        setOptionSets(sets)

        if (sourceId) {
          const template = await getTemplate(sourceId)
          if (!template) throw new Error('找不到表格')
          setSource(editId ? template : null)
          setName(copyId ? `${template.name}（複製）` : template.name)
          setModuleId(template.moduleId)
          setActionId(template.actionId)
          setDescription(template.description || '')
          setEnabled(template.enabled)
          setManagerGroups(template.managerGroups || [])
          setFields(template.fields.map((f, i) => ({ ...f, order: i })))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗')
      } finally {
        setLoading(false)
      }
    }
    boot()
  }, [sourceId, editId, copyId])

  const masterSets = useMemo(() => optionSets.filter(os => os.isMaster), [optionSets])
  const moduleItems = useMemo(
    () => masterSets.find(os => os.code === MODULE_CODE)?.items || [],
    [masterSets]
  )
  const actionItems = useMemo(
    () => masterSets.find(os => os.code === ACTION_CODE)?.items || [],
    [masterSets]
  )
  const managerGroupItems = useMemo(
    () => masterSets.find(os => os.code === MANAGER_GROUP_CODE)?.items || [],
    [masterSets]
  )

  // dropdown 的 KEY 就是選項池的 code，module/action 等系統保留字不給當一般欄位
  const optionSetKeys: KeyChoice[] = useMemo(() => {
    const seen = new Set<string>()
    return masterSets
      .filter(os => os.code !== MODULE_CODE && os.code !== ACTION_CODE && os.code !== MANAGER_GROUP_CODE)
      .filter(os => (seen.has(os.code) ? false : (seen.add(os.code), true)))
      .map(os => ({ key: os.code, type: 'dropdown' as const, label: os.name }))
  }, [masterSets])

  const usedKeys = new Set(fields.map(f => f.key))

  const addField = () =>
    setFields(prev => [
      ...prev,
      { key: '', type: 'text', label: '', required: false, order: prev.length },
    ])

  const updateField = (index: number, patch: Partial<FieldDefinition>) =>
    setFields(prev =>
      prev.map((field, i) => {
        if (i !== index) return field
        const next = { ...field, ...patch }
        if (patch.key !== undefined) {
          const fixed = FIXED_KEYS[patch.key]
          if (fixed) {
            next.type = fixed.type
            next.optionSetId = undefined
            next.multiple = undefined
          } else {
            next.type = 'dropdown'
            next.optionSetId = optionSets.find(os => os.code === patch.key && os.isMaster)?.id
          }
          if (!next.label.trim()) {
            next.label = fixed?.label || optionSets.find(os => os.code === patch.key)?.name || ''
          }
        }
        return next
      })
    )

  const removeField = (index: number) =>
    setFields(prev => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })))

  const moveField = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    setFields(prev => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((f, i) => ({ ...f, order: i }))
    })
  }

  const problems = useMemo(() => {
    const list: string[] = []
    if (!name.trim()) list.push('請填表格名稱')
    if (!moduleId) list.push('請選分類（module）')
    if (!actionId) list.push('請選動作（action）')
    if (fields.length === 0) list.push('至少要有一個欄位')
    if (fields.some(f => !f.key)) list.push('每個欄位都要選 KEY')
    if (fields.some(f => !f.label.trim())) list.push('每個欄位都要有顯示名稱')
    if (fields.some(f => f.type === 'dropdown' && !f.optionSetId)) list.push('下拉欄位要選一個選項池')
    if (new Set(fields.map(f => f.key)).size !== fields.length) list.push('同一個 KEY 只能用一次')
    return list
  }, [name, moduleId, actionId, fields])

  const handleSave = async () => {
    if (problems.length > 0) return
    setSaving(true)
    setError('')
    try {
      const input = { name, moduleId, actionId, description, enabled, managerGroups, fields }
      if (editId && source) {
        const fieldsChanged = JSON.stringify(source.fields) !== JSON.stringify(fields)
        await updateTemplate(editId, input, source.version, fieldsChanged)
      } else {
        await createTemplate(input, email)
      }
      router.push('/forms')
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="載入中" />

  const needsSeed = moduleItems.length === 0 || actionItems.length === 0

  return (
    <>
      <Link href="/forms" className="btn-ghost btn-sm mb-4 -ml-3">
        <ArrowLeft className="h-4 w-4" />
        回表格清單
      </Link>

      <PageHeader
        title={editId ? '編輯表格' : copyId ? '複製表格' : '建立表格'}
        description={
          editId
            ? '改欄位會讓版本 +1，已提交的資料帶著舊版本快照，不受影響。'
            : '挑 Universal KEY 決定收什麼，取顯示名稱決定怎麼稱呼它。'
        }
      />

      {error && <ErrorBanner message={error} />}

      {needsSeed && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          分類（module）或動作（action）選項池還是空的，先去
          <Link href="/options" className="mx-1 font-medium underline">
            選項池
          </Link>
          補上選項。
        </div>
      )}

      <div className="space-y-5">
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">基本資訊</h2>

          <div>
            <label className="label mb-1">表格名稱</label>
            <input
              className="field"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：營會登記表"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-1">分類 module</label>
              <select className="field" value={moduleId} onChange={e => setModuleId(e.target.value)}>
                <option value="">請選擇…</option>
                {moduleItems.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label mb-1">動作 action</label>
              <select className="field" value={actionId} onChange={e => setActionId(e.target.value)}>
                <option value="">請選擇…</option>
                {actionItems.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-1">說明</label>
            <input
              className="field"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="填這張表要做什麼"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded text-unicorn-600 focus:ring-unicorn-500"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
            啟用（出現在填報中心）
          </label>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">權限設定</h2>
          <div>
            <label className="label mb-2">
              哪些管理群組可以看這張表的資料？
              <span className="block text-xs font-normal text-slate-500 mt-1">
                沒有勾選時，只有 Superuser 和填表人自己看得到。
              </span>
            </label>
            {managerGroupItems.length === 0 ? (
              <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
                尚未建立 <code className="font-mono">{MANAGER_GROUP_CODE}</code> 選項池，無法設定群組管理員。
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {managerGroupItems.map(item => (
                  <label key={item.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      className="rounded text-unicorn-600 focus:ring-unicorn-500"
                      checked={managerGroups.includes(item.value)}
                      onChange={e =>
                        setManagerGroups(prev =>
                          e.target.checked
                            ? [...prev, item.value]
                            : prev.filter(v => v !== item.value)
                        )
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">欄位</h2>
            <span className="hint">{fields.length} 個</span>
          </div>

          {fields.map((field, index) => {
            const relevantSets = optionSets.filter(os => os.code === field.key)
            return (
              <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-unicorn-600">欄位 {index + 1}</span>
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => moveField(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => moveField(index, 1)}
                      disabled={index === fields.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => removeField(index)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label mb-1 text-xs">KEY（系統統一）</label>
                    <select
                      className="field font-mono"
                      value={field.key}
                      onChange={e => updateField(index, { key: e.target.value })}
                    >
                      <option value="">選一個 KEY…</option>
                      {FIXED_KEY_GROUPS.map(group => (
                        <optgroup key={group} label={group}>
                          {Object.entries(FIXED_KEYS)
                            .filter(([, meta]) => meta.group === group)
                            .map(([key, meta]) => (
                              <option
                                key={key}
                                value={key}
                                disabled={usedKeys.has(key) && key !== field.key}
                              >
                                {key} — {meta.label}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                      <optgroup label="選項池（下拉）">
                        {optionSetKeys.map(choice => (
                          <option
                            key={choice.key}
                            value={choice.key}
                            disabled={usedKeys.has(choice.key) && choice.key !== field.key}
                          >
                            {choice.key} — {choice.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="label mb-1 text-xs">顯示名稱（這張表怎麼叫它）</label>
                    <input
                      className="field"
                      value={field.label}
                      onChange={e => updateField(index, { label: e.target.value })}
                      placeholder="例：入營學校"
                    />
                  </div>
                </div>

                {field.type === 'dropdown' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label mb-1 text-xs">用哪個選項清單</label>
                      <select
                        className="field"
                        value={field.optionSetId || ''}
                        onChange={e => updateField(index, { optionSetId: e.target.value })}
                      >
                        <option value="">請選擇…</option>
                        {relevantSets.map(set => (
                          <option key={set.id} value={set.id}>
                            {set.name}（{set.items.length} 項）{set.isMaster ? ' · 完整' : ' · 子集'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded text-unicorn-600 focus:ring-unicorn-500"
                        checked={!!field.multiple}
                        onChange={e => updateField(index, { multiple: e.target.checked })}
                      />
                      可複選
                    </label>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label mb-1 text-xs">提示文字</label>
                    <input
                      className="field"
                      value={field.helpText || ''}
                      onChange={e => updateField(index, { helpText: e.target.value })}
                      placeholder="選填"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded text-unicorn-600 focus:ring-unicorn-500"
                      checked={field.required}
                      onChange={e => updateField(index, { required: e.target.checked })}
                    />
                    必填
                  </label>
                </div>

                <p className="hint">
                  型別：{field.type}
                  {field.key && `　·　存進資料池的欄位名稱：${field.key}`}
                </p>
              </div>
            )
          })}

          <button
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm
              text-slate-500 transition-colors hover:border-unicorn-400 hover:bg-unicorn-50"
            onClick={addField}
          >
            <Plus className="mr-1 inline h-4 w-4" />
            新增欄位
          </button>
        </section>

        {problems.length > 0 && (
          <ul className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            {problems.map(problem => (
              <li key={problem}>· {problem}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pb-6">
          <Link href="/forms" className="btn-secondary">
            取消
          </Link>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || problems.length > 0}
          >
            {saving ? '儲存中…' : editId ? '儲存變更' : '建立表格'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function FormEditPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FormBuilder />
    </Suspense>
  )
}
