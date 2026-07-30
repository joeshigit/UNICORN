'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { SuperuserGuard, useAuth } from '@/components/auth'
import { ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import {
  createTemplate,
  findLegacyDateKeyUsage,
  getTemplate,
  listOptionSets,
  listStandardKeys,
  updateTemplate,
} from '@/lib/db'
import {
  ACTION_CODE,
  FIXED_KEYS,
  FIXED_KEY_GROUPS,
  MANAGER_GROUP_CODE,
  MODULE_CODE,
  SCALE_DIRECTION_HINT,
  SCALE_POINTS_OPTIONS,
  activeStandardsForPicker,
  applyStandardToField,
  assertFieldMatchesStandard,
  canPresetFieldType,
  expandScaleMatrixFields,
  findStandardByKey,
  isPresetEmpty,
  isValidScalePoints,
  optionSetCodesWithoutStandard,
  resolveScaleValueLabels,
  shouldWarnOnPreset,
  usesOptionSet,
  validateFieldMode,
  validateScaleValueLabels,
  yesNoOptions,
  isYesNoField,
} from '@/lib/keys'
import type {
  FieldDefinition,
  FieldInputMode,
  FillAccessType,
  OptionItem,
  OptionSet,
  ScalePoints,
  StandardKey,
  Template,
} from '@/types'

interface KeyChoice {
  key: string
  type: FieldDefinition['type']
  label: string
}

/** 預填值的輸入元件，依欄位型別決定長什麼樣 */
function PresetValueInput({
  field,
  options,
  onChange,
}: {
  field: FieldDefinition
  options: OptionItem[]
  onChange: (value: string | string[] | undefined) => void
}) {
  const single = Array.isArray(field.presetValue)
    ? (field.presetValue[0] ?? '')
    : (field.presetValue ?? '')

  if (field.type === 'dropdown' || field.type === 'choice') {
    if (field.yesNoAllowNa !== undefined) {
      const items = yesNoOptions(field.yesNoAllowNa)
      return (
        <select
          className="field"
          value={single}
          onChange={e => onChange(e.target.value || undefined)}
        >
          <option value="">未設定</option>
          {items.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    const active = options.filter(o => o.status !== 'deprecated')

    if (field.multiple) {
      const selected = Array.isArray(field.presetValue) ? field.presetValue : []
      return (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
          {active.length === 0 && <p className="hint px-1 py-1">這個標準選項還沒有選項</p>}
          {active.map(option => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded text-unicorn-600 focus:ring-unicorn-500"
                checked={selected.includes(option.value)}
                onChange={e =>
                  onChange(
                    e.target.checked
                      ? [...selected, option.value]
                      : selected.filter(v => v !== option.value)
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      )
    }

    return (
      <select
        className="field"
        value={single}
        onChange={e => onChange(e.target.value || undefined)}
      >
        <option value="">未設定</option>
        {active.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'scale') {
    const items = resolveScaleValueLabels(field)
    return (
      <select
        className="field"
        value={single}
        onChange={e => onChange(e.target.value || undefined)}
      >
        <option value="">未設定</option>
        {items.map(option => (
          <option key={option.value} value={option.value}>
            {option.value} — {option.label}
          </option>
        ))}
      </select>
    )
  }

  const inputType =
    field.type === 'number'
      ? 'number'
      : field.type === 'date'
        ? 'date'
        : field.type === 'time'
          ? 'time'
          : field.type === 'datetime'
            ? 'datetime-local'
            : 'text'

  if (field.type === 'textarea') {
    return (
      <textarea
        className="field"
        rows={2}
        value={single}
        onChange={e => onChange(e.target.value || undefined)}
      />
    )
  }

  return (
    <input
      type={inputType}
      className="field"
      value={single}
      onChange={e => onChange(e.target.value || undefined)}
    />
  )
}

function FormBuilder() {
  const router = useRouter()
  const params = useSearchParams()
  const { email } = useAuth()

  const editId = params.get('id') || ''
  const copyId = params.get('copy') || ''
  const sourceId = editId || copyId

  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [standardKeys, setStandardKeys] = useState<StandardKey[]>([])
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
  const [fillAccessType, setFillAccessType] = useState<FillAccessType>('allOrgUsers')
  const [fillGroups, setFillGroups] = useState<string[]>([])
  const [fields, setFields] = useState<FieldDefinition[]>([])
  const [legacyWarning, setLegacyWarning] = useState('')
  const [matrixPoints, setMatrixPoints] = useState<ScalePoints>(5)
  const [matrixLabels, setMatrixLabels] = useState('')
  const [matrixError, setMatrixError] = useState('')

  useEffect(() => {
    const boot = async () => {
      try {
        const [sets, standards] = await Promise.all([listOptionSets(), listStandardKeys()])
        setOptionSets(sets)
        setStandardKeys(standards)

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
          setFillAccessType(template.fillAccessType || 'allOrgUsers')
          setFillGroups(template.fillGroups || [])
          setFields(template.fields.map((f, i) => ({ ...f, order: i })))
          const legacy = findLegacyDateKeyUsage([template])
          if (legacy.length > 0) {
            setLegacyWarning(
              `此表格仍使用已退役日期 KEY（${legacy[0].keys.join(', ')}）。請改用語意化日期／時間 KEY 後再儲存。`
            )
          }
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

  const pickerStandards = useMemo(() => activeStandardsForPicker(standardKeys), [standardKeys])

  // 未升格為標準的 optionSet code（避免與標準資料雙入口）
  const optionSetKeys: KeyChoice[] = useMemo(() => {
    const seen = new Set<string>()
    const masters = masterSets
      .filter(os => os.code !== MODULE_CODE && os.code !== ACTION_CODE && os.code !== MANAGER_GROUP_CODE)
      .filter(os => (seen.has(os.code) ? false : (seen.add(os.code), true)))
    const allowed = new Set(
      optionSetCodesWithoutStandard(
        masters.map(m => m.code),
        standardKeys
      )
    )
    return masters
      .filter(os => allowed.has(os.code))
      .map(os => ({ key: os.code, type: 'dropdown' as const, label: os.name }))
  }, [masterSets, standardKeys])

  const usedKeys = new Set(fields.map(f => f.key))

  const standardByKey = useMemo(() => {
    const map = new Map<string, StandardKey>()
    for (const s of standardKeys) map.set(s.key, s)
    return map
  }, [standardKeys])

  const addField = () =>
    setFields(prev => [
      ...prev,
      { key: '', type: 'text', label: '', required: false, order: prev.length },
    ])

  const addMatrixFields = () => {
    setMatrixError('')
    const result = expandScaleMatrixFields(
      matrixLabels.split('\n'),
      matrixPoints,
      fields.map(f => f.key),
      fields.length
    )
    if ('error' in result) {
      setMatrixError(result.error)
      return
    }
    setFields(prev => [...prev, ...result])
    setMatrixLabels('')
  }

  const updateField = (index: number, patch: Partial<FieldDefinition>) =>
    setFields(prev =>
      prev.map((field, i) => {
        if (i !== index) return field

        const bound = findStandardByKey(standardKeys, field.key)

        // 已綁標準（含 deprecated）：忽略契約相關 patch；optionSet 僅允許同 code 子集
        if (bound && patch.key === undefined) {
          const locked: Partial<FieldDefinition> = { ...patch }
          delete locked.type
          delete locked.scalePoints
          delete locked.scaleValueLabels
          delete locked.yesNoAllowNa
          if (locked.optionSetId !== undefined) {
            const set = optionSets.find(os => os.id === locked.optionSetId)
            if (!set || set.code !== field.key) delete locked.optionSetId
          }
          const next = { ...field, ...locked }
          if (locked.optionSetId !== undefined || locked.multiple !== undefined) {
            next.presetValue = undefined
          }
          return next
        }

        let next = { ...field, ...patch }
        if (patch.key !== undefined) {
          const standard = findStandardByKey(standardKeys, patch.key)
          if (standard) {
            next = applyStandardToField(field, standard)
          } else {
            const fixed = FIXED_KEYS[patch.key]
            if (fixed) {
              next.type = fixed.type
              next.optionSetId = undefined
              next.multiple = undefined
              next.scaleValueLabels = undefined
              next.yesNoAllowNa = undefined
              if (fixed.type === 'scale') {
                next.scalePoints = isValidScalePoints(next.scalePoints) ? next.scalePoints : 5
              } else {
                next.scalePoints = undefined
              }
            } else {
              next.type = field.type === 'choice' ? 'choice' : 'dropdown'
              next.optionSetId = optionSets.find(os => os.code === patch.key && os.isMaster)?.id
              next.scalePoints = undefined
              next.scaleValueLabels = undefined
              next.yesNoAllowNa = undefined
            }
            if (!next.label.trim()) {
              next.label = fixed?.label || optionSets.find(os => os.code === patch.key)?.name || ''
            }
            next.presetValue = undefined
            if (!canPresetFieldType(next.type)) next.inputMode = undefined
          }
        }

        // 非標準欄位才允許改 type／刻度
        if (!findStandardByKey(standardKeys, next.key)) {
          if (patch.type === 'scale') {
            next.optionSetId = undefined
            next.multiple = undefined
            next.scaleValueLabels = undefined
            next.yesNoAllowNa = undefined
            next.scalePoints = isValidScalePoints(next.scalePoints) ? next.scalePoints : 5
          }
          if (patch.type === 'choice' || patch.type === 'dropdown') {
            next.scalePoints = undefined
            next.scaleValueLabels = undefined
            next.yesNoAllowNa = undefined
            if (!next.optionSetId && next.key) {
              next.optionSetId = optionSets.find(os => os.code === next.key && os.isMaster)?.id
            }
          }
          if (
            patch.optionSetId !== undefined ||
            patch.multiple !== undefined ||
            patch.scalePoints !== undefined
          ) {
            next.presetValue = undefined
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
    if (fields.some(f => usesOptionSet(f.type) && !isYesNoField(f) && !f.optionSetId)) {
      list.push('下拉／選擇題欄位要選一個標準選項')
    }
    if (fields.some(f => isYesNoField(f) && typeof f.yesNoAllowNa !== 'boolean')) {
      list.push('是/否欄位缺少答案契約 snapshot')
    }
    if (fields.some(f => f.type === 'scale' && !isValidScalePoints(f.scalePoints))) {
      list.push('量表欄位要選刻度點數（3／4／5／10／100）')
    }
    if (new Set(fields.map(f => f.key)).size !== fields.length) list.push('同一個 KEY 只能用一次')
    if (fillAccessType === 'groups' && fillGroups.length === 0) {
      list.push('填報權限設為指定群組時，至少要選一個群組')
    }
    if (findLegacyDateKeyUsage([{ id: 'draft', name, fields } as Template]).length > 0) {
      list.push('請移除已退役的日期 KEY，改用語意化日期／時間 KEY')
    }
    for (const field of fields) {
      const problem = validateFieldMode(field)
      if (problem) list.push(problem.message)

      if (usesOptionSet(field.type) && !isYesNoField(field) && field.optionSetId) {
        const set = optionSets.find(os => os.id === field.optionSetId)
        if (set && set.code !== field.key) {
          list.push(`「${field.label || field.key}」的標準選項 code 必須等於 KEY`)
        }
      }

      const standard = standardByKey.get(field.key)
      if (standard) {
        const set = field.optionSetId ? optionSets.find(os => os.id === field.optionSetId) : null
        const mismatch = assertFieldMatchesStandard(field, standard, set?.code)
        if (mismatch) list.push(mismatch)
        if (standard.valueModel === 'scale') {
          const labelErr = validateScaleValueLabels(field.scalePoints, field.scaleValueLabels)
          if (labelErr) list.push(`「${field.label || field.key}」：${labelErr}`)
        }
      }
    }
    return list
  }, [name, moduleId, actionId, fields, fillAccessType, fillGroups, optionSets, standardByKey])

  // 非阻擋的提醒
  const warnings = useMemo(() => {
    const list: string[] = []
    for (const field of fields) {
      const mode = field.inputMode ?? 'open'
      if (mode === 'open') continue

      if (shouldWarnOnPreset(field.type)) {
        list.push(`「${field.label || field.key}」寫死一個日期／時間，除了固定年度之類的情況通常是錯的`)
      }

      if (usesOptionSet(field.type) && !isYesNoField(field) && !isPresetEmpty(field.presetValue)) {
        const items = optionSets.find(os => os.id === field.optionSetId)?.items || []
        const picked = Array.isArray(field.presetValue) ? field.presetValue : [field.presetValue!]
        for (const value of picked) {
          const item = items.find(i => i.value === value)
          if (!item) {
            list.push(`「${field.label || field.key}」的預填值「${value}」不在所選的選項清單裡`)
          } else if (item.status === 'deprecated') {
            list.push(`「${field.label || field.key}」的預填值「${item.label}」已停用`)
          }
        }
      }

      if (mode === 'locked' && !field.required && isPresetEmpty(field.presetValue)) {
        list.push(
          `「${field.label || field.key}」鎖定為空白，每一筆都會是空的；若不需要收集，建議直接移除這個欄位`
        )
      }
    }
    return list
  }, [fields, optionSets])

  const handleSave = async () => {
    if (problems.length > 0) return
    setSaving(true)
    setError('')
    try {
      const input = {
        name,
        moduleId,
        actionId,
        description,
        enabled,
        managerGroups,
        fillAccessType,
        fillGroups,
        fields,
      }
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
      {legacyWarning && <ErrorBanner message={legacyWarning} />}

      {needsSeed && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          分類（module）或動作（action）標準選項還是空的，先去
          <Link href="/options" className="mx-1 font-medium underline">
            標準選項
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
            <label className="label mb-2">誰可以填這張表？</label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fillAccessType"
                  className="text-unicorn-600 focus:ring-unicorn-500"
                  checked={fillAccessType === 'allOrgUsers'}
                  onChange={() => setFillAccessType('allOrgUsers')}
                />
                所有 @dbyv.org 使用者
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fillAccessType"
                  className="text-unicorn-600 focus:ring-unicorn-500"
                  checked={fillAccessType === 'groups'}
                  onChange={() => setFillAccessType('groups')}
                />
                僅指定群組
              </label>
            </div>
            {fillAccessType === 'groups' && (
              <div className="mt-3 flex flex-wrap gap-4">
                {managerGroupItems.length === 0 ? (
                  <div className="text-sm text-amber-700">請先到「權限管理」建立管理群組。</div>
                ) : (
                  managerGroupItems.map(item => (
                    <label
                      key={`fill-${item.value}`}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="rounded text-unicorn-600 focus:ring-unicorn-500"
                        checked={fillGroups.includes(item.value)}
                        onChange={e =>
                          setFillGroups(prev =>
                            e.target.checked
                              ? [...prev, item.value]
                              : prev.filter(v => v !== item.value)
                          )
                        }
                      />
                      {item.label}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label mb-2">
              哪些管理群組可以看這張表的資料？
              <span className="block text-xs font-normal text-slate-500 mt-1">
                管理群組可讀取他人提交，但不能更正或作廢他人紀錄。未勾選時僅 Superuser 與填表人可見。
              </span>
            </label>
            {managerGroupItems.length === 0 ? (
              <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
                尚未建立管理群組。請先到「權限管理」建立群組後，再設定此表的管理員。
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
          <h2 className="font-semibold">矩陣批次（量表）</h2>
          <p className="hint">
            一次加入多題扁平量表欄位，共用同一刻度。每列一個題目名稱；系統自動分配 rating KEY。
            {SCALE_DIRECTION_HINT}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label mb-1 text-xs">刻度點數</label>
              <select
                className="field"
                value={matrixPoints}
                onChange={e => setMatrixPoints(Number(e.target.value) as ScalePoints)}
              >
                {SCALE_POINTS_OPTIONS.map(n => (
                  <option key={n} value={n}>
                    {n} 點
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label mb-1 text-xs">題目（一行一題）</label>
              <textarea
                className="field"
                rows={3}
                value={matrixLabels}
                onChange={e => setMatrixLabels(e.target.value)}
                placeholder={'喜歡午餐嗎？\n喜歡晚餐嗎？'}
              />
            </div>
          </div>
          {matrixError && <p className="text-sm text-red-600">{matrixError}</p>}
          <button type="button" className="btn-secondary btn-sm" onClick={addMatrixFields}>
            <Plus className="h-4 w-4" />
            加入矩陣題
          </button>
        </section>

        <section className="card space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">欄位</h2>
            <span className="hint">{fields.length} 個</span>
          </div>

          {fields.map((field, index) => {
            const relevantSets = optionSets.filter(os => os.code === field.key)
            const boundStandard = standardByKey.get(field.key)
            const contractLocked = !!boundStandard
            return (
              <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-unicorn-600">
                    欄位 {index + 1}
                    {boundStandard && (
                      <span className="ml-2 font-normal text-slate-500">
                        · 標準問題
                        {boundStandard.status === 'deprecated' ? '（已停用，仍可編輯此表）' : ''}
                      </span>
                    )}
                  </span>
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
                      <optgroup label="標準問題">
                        {pickerStandards.map(s => (
                          <option
                            key={s.id || s.key}
                            value={s.key}
                            disabled={usedKeys.has(s.key) && s.key !== field.key}
                          >
                            {s.key} — {s.defaultLabel}
                          </option>
                        ))}
                        {boundStandard &&
                          boundStandard.status === 'deprecated' &&
                          !pickerStandards.some(s => s.key === boundStandard.key) && (
                            <option value={boundStandard.key}>
                              {boundStandard.key} — {boundStandard.defaultLabel}（已停用）
                            </option>
                          )}
                      </optgroup>
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
                      <optgroup label="標準選項（本表／未升格）">
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

                {isYesNoField(field) && (
                  <p className="hint rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    答案方式：是/否（{field.yesNoAllowNa ? '含不適用' : '二元'}）— 由標準問題鎖定，不使用標準選項
                  </p>
                )}

                {usesOptionSet(field.type) && !isYesNoField(field) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label mb-1 text-xs">顯示方式</label>
                      <select
                        className="field"
                        value={field.type}
                        disabled={contractLocked}
                        onChange={e =>
                          updateField(index, {
                            type: e.target.value as 'dropdown' | 'choice',
                            multiple: field.multiple,
                          })
                        }
                      >
                        <option value="dropdown">下拉選單</option>
                        <option value="choice">選擇題（圓鈕／方框）</option>
                      </select>
                      {contractLocked && <p className="hint mt-1">由標準問題鎖定</p>}
                    </div>
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
                      {contractLocked && <p className="hint mt-1">僅能選同一 KEY 的完整清單或子集</p>}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
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

                {field.type === 'scale' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label mb-1 text-xs">刻度點數</label>
                      <select
                        className="field"
                        value={field.scalePoints || 5}
                        disabled={contractLocked}
                        onChange={e =>
                          updateField(index, { scalePoints: Number(e.target.value) as ScalePoints })
                        }
                      >
                        {SCALE_POINTS_OPTIONS.map(n => (
                          <option key={n} value={n}>
                            {n} 點
                          </option>
                        ))}
                      </select>
                      <p className="hint mt-1">
                        {contractLocked
                          ? `由標準問題鎖定：${resolveScaleValueLabels(field)
                              .map(l => `${l.value}=${l.label}`)
                              .join('／')}`
                          : SCALE_DIRECTION_HINT}
                      </p>
                    </div>
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
                    必答（不接受空白）
                  </label>
                </div>

                {canPresetFieldType(field.type) && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <label className="label mb-2 text-xs">輸入方式</label>
                    <div className="flex flex-wrap gap-4">
                      {(
                        [
                          ['open', '照常提問'],
                          ['default', '預填值，可改'],
                          ['locked', '預填值，鎖定'],
                        ] as Array<[FieldInputMode, string]>
                      ).map(([mode, label]) => (
                        <label
                          key={mode}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="radio"
                            name={`inputMode-${index}`}
                            className="text-unicorn-600 focus:ring-unicorn-500"
                            checked={(field.inputMode ?? 'open') === mode}
                            onChange={() => updateField(index, { inputMode: mode })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>

                    {(field.inputMode ?? 'open') !== 'open' && (
                      <div className="mt-3">
                        <label className="label mb-1 text-xs">
                          預填值
                          {field.inputMode === 'locked' && !field.required && (
                            <span className="ml-1 font-normal text-slate-400">
                              （可留空，代表鎖定為空白）
                            </span>
                          )}
                        </label>
                        <PresetValueInput
                          field={field}
                          options={
                            optionSets.find(os => os.id === field.optionSetId)?.items || []
                          }
                          onChange={value => updateField(index, { presetValue: value })}
                        />
                      </div>
                    )}
                  </div>
                )}

                <p className="hint">
                  型別：{field.type}
                  {field.key && `　·　存進已填的表格的欄位名稱：${field.key}`}
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

        {problems.length === 0 && warnings.length > 0 && (
          <ul className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
            <li className="mb-1 font-medium">提醒（不影響儲存）</li>
            {warnings.map(warning => (
              <li key={warning}>· {warning}</li>
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
    <SuperuserGuard>
      <Suspense fallback={<Spinner />}>
        <FormBuilder />
      </Suspense>
    </SuperuserGuard>
  )
}
