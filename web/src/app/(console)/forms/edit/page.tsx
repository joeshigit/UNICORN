'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react'
import { SuperuserGuard, useAuth } from '@/components/auth'
import { FormSettingsDrawer } from '@/components/forms/FormSettingsDrawer'
import { QuestionPoolPanel } from '@/components/forms/QuestionPoolPanel'
import { ErrorBanner, Spinner } from '@/components/ui'
import {
  blankFieldFromManner,
  buildQuestionPool,
  fieldFromPoolItem,
  isContractLockedField,
  optionSetsForField,
  stripDraft,
  toDraftFields,
  type DraftField,
  type QuestionPoolItem,
} from '@/lib/formBuilder'
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
  MANAGER_GROUP_CODE,
  MODULE_CODE,
  SCALE_DIRECTION_HINT,
  SCALE_POINTS_OPTIONS,
  answerFormatLabel,
  assertFieldMatchesStandard,
  canPresetFieldType,
  expandScaleMatrixFields,
  fieldUsesOptionSet,
  findStandardByKey,
  isKeyUsedInForm,
  isPresetEmpty,
  isValidScalePoints,
  isYesNoField,
  resolveScaleValueLabels,
  shouldWarnOnPreset,
  validateFieldMode,
  validateScaleValueLabels,
  validateTemplateFieldKey,
  yesNoOptions,
  yesNoValueOrder,
} from '@/lib/keys'
import type {
  FieldDefinition,
  FieldInputMode,
  FieldType,
  FillAccessType,
  OptionItem,
  OptionSet,
  ScalePoints,
  StandardKey,
  Template,
} from '@/types'

type MannerChoice = FieldType | 'yesNo' | 'yesNoNa'

const MANNER_OPTIONS: Array<{ id: MannerChoice; label: string }> = [
  { id: 'text', label: '短文字' },
  { id: 'textarea', label: '長文字' },
  { id: 'number', label: '數字' },
  { id: 'date', label: '日期' },
  { id: 'time', label: '時間' },
  { id: 'datetime', label: '日期與時間' },
  { id: 'yesNo', label: '是／否' },
  { id: 'yesNoNa', label: '是／否／不適用' },
  { id: 'scale', label: '量表' },
  { id: 'dropdown', label: '下拉選單' },
  { id: 'choice', label: '選擇題' },
  { id: 'file', label: '檔案上傳' },
]

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
        <select className="field" value={single} onChange={e => onChange(e.target.value || undefined)}>
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
      <select className="field" value={single} onChange={e => onChange(e.target.value || undefined)}>
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
      <select className="field" value={single} onChange={e => onChange(e.target.value || undefined)}>
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
  const [fields, setFields] = useState<DraftField[]>([])
  const [legacyWarning, setLegacyWarning] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [poolMobileOpen, setPoolMobileOpen] = useState(false)
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [mannerMenuOpen, setMannerMenuOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [matrixPoints, setMatrixPoints] = useState<ScalePoints>(5)
  const [matrixLabels, setMatrixLabels] = useState('')
  const [matrixError, setMatrixError] = useState('')
  const keyInputRef = useRef<HTMLInputElement | null>(null)

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
          setFields(toDraftFields(template.fields))
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

  useEffect(() => {
    if (!expandedId) return
    const field = fields.find(f => f.clientId === expandedId)
    if (field?.needsKey) {
      requestAnimationFrame(() => keyInputRef.current?.focus())
    }
  }, [expandedId, fields])

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

  const poolItems = useMemo(
    () => buildQuestionPool(standardKeys, optionSets),
    [standardKeys, optionSets]
  )

  const usedKeys = useMemo(
    () => new Set(fields.map(f => f.key).filter(Boolean)),
    [fields]
  )

  const standardByKey = useMemo(() => {
    const map = new Map<string, StandardKey>()
    for (const s of standardKeys) map.set(s.key, s)
    return map
  }, [standardKeys])

  const updateField = (index: number, patch: Partial<DraftField>) =>
    setFields(prev =>
      prev.map((field, i) => {
        if (i !== index) return field
        const locked = isContractLockedField(field, standardKeys)

        if (locked && patch.key === undefined) {
          const nextPatch: Partial<DraftField> = { ...patch }
          delete nextPatch.type
          delete nextPatch.scalePoints
          delete nextPatch.scaleValueLabels
          delete nextPatch.yesNoAllowNa
          if (nextPatch.optionSetId !== undefined) {
            const set = optionSets.find(os => os.id === nextPatch.optionSetId)
            const bound = field.optionSetId
              ? optionSets.find(os => os.id === field.optionSetId)
              : null
            if (!set || (bound && set.code !== bound.code)) {
              delete nextPatch.optionSetId
            }
          }
          const next = { ...field, ...nextPatch }
          if (nextPatch.optionSetId !== undefined || nextPatch.multiple !== undefined) {
            next.presetValue = undefined
          }
          if (next.key.trim()) next.needsKey = false
          return next
        }

        let next = { ...field, ...patch }
        if (patch.key !== undefined) {
          const standard = findStandardByKey(standardKeys, patch.key)
          if (standard) {
            next = {
              ...applyStandardLike(field, standard),
              clientId: field.clientId,
              contractLocked: true,
              templateDefaultKey: standard.key,
              needsKey: false,
            }
          } else if (FIXED_KEYS[patch.key]) {
            const fixed = FIXED_KEYS[patch.key]
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
            if (!next.label.trim()) next.label = fixed.label
            next.presetValue = undefined
            if (!canPresetFieldType(next.type)) next.inputMode = undefined
            next.needsKey = false
          } else {
            next.needsKey = !patch.key.trim()
          }
        }

        if (!isContractLockedField(next, standardKeys)) {
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
            if (patch.type === 'dropdown') next.yesNoAllowNa = undefined
          }
        }
        return next
      })
    )

  function applyStandardLike(field: DraftField, standard: StandardKey): DraftField {
    const next: DraftField = {
      ...field,
      key: standard.key,
      type: standard.type,
      optionSetId: undefined,
      multiple: undefined,
      scalePoints: undefined,
      scaleValueLabels: undefined,
      yesNoAllowNa: undefined,
      presetValue: undefined,
    }
    if (!next.label.trim()) next.label = standard.defaultLabel
    if (standard.valueModel === 'optionSet') next.optionSetId = standard.optionSetId
    if (standard.valueModel === 'scale') {
      next.scalePoints = standard.scalePoints
      next.scaleValueLabels = standard.scaleValueLabels
        ? standard.scaleValueLabels.map(l => ({ ...l }))
        : undefined
    }
    if (standard.valueModel === 'yesNo') {
      next.yesNoAllowNa = standard.allowNa
      next.multiple = undefined
    }
    if (!canPresetFieldType(next.type)) next.inputMode = undefined
    return next
  }

  const removeField = (index: number) => {
    setFields(prev => {
      const removed = prev[index]
      if (removed && expandedId === removed.clientId) setExpandedId(null)
      return prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i }))
    })
  }

  const moveField = (index: number, target: number) => {
    if (target < 0 || target >= fields.length) return
    setFields(prev => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next.map((f, i) => ({ ...f, order: i }))
    })
  }

  const addFromPool = (item: QuestionPoolItem) => {
    const draft = fieldFromPoolItem(item, usedKeys, fields.length)
    setFields(prev => [...prev, draft])
    setExpandedId(draft.clientId)
    setSelectedPoolId(null)
  }

  const addFromManner = (manner: MannerChoice) => {
    const draft = blankFieldFromManner(manner, fields.length)
    setFields(prev => [...prev, draft])
    setExpandedId(draft.clientId)
    setMannerMenuOpen(false)
  }

  const addMatrixFields = () => {
    setMatrixError('')
    const result = expandScaleMatrixFields(
      matrixLabels.split('\n'),
      matrixPoints,
      fields.map(f => f.key).filter(Boolean),
      fields.length
    )
    if ('error' in result) {
      setMatrixError(result.error)
      return
    }
    const drafts = toDraftFields(result).map(f => ({ ...f, contractLocked: false }))
    setFields(prev => [...prev, ...drafts])
    setMatrixLabels('')
  }

  const problems = useMemo(() => {
    const list: string[] = []
    if (!name.trim()) list.push('請填表格名稱')
    if (!moduleId) list.push('請選分類（module）')
    if (!actionId) list.push('請選動作（action）')
    if (fields.length === 0) list.push('至少要有一個問題')
    if (fields.some(f => !f.key.trim() || f.needsKey)) {
      list.push('每個問題都要有有效的系統 KEY（碰撞後請設定新 KEY）')
    }
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index]
      if (!field.key.trim()) continue
      const keyErr = validateTemplateFieldKey(field.key)
      if (keyErr) list.push(`問題「${field.label || field.key}」：${keyErr}`)
      if (isKeyUsedInForm(field.key, fields, index)) {
        list.push(`系統 KEY「${field.key}」不可重複`)
      }
    }
    if (fields.some(f => !f.label.trim())) list.push('每個問題都要有顯示名稱')
    if (fields.some(f => fieldUsesOptionSet(f) && !f.optionSetId)) {
      list.push('下拉／選擇題要選一個標準選項')
    }
    if (fields.some(f => isYesNoField(f) && typeof f.yesNoAllowNa !== 'boolean')) {
      list.push('是/否問題缺少答案契約')
    }
    if (fields.some(f => f.type === 'scale' && !isValidScalePoints(f.scalePoints))) {
      list.push('量表要選刻度點數（3／4／5／10／100）')
    }
    if (fillAccessType === 'groups' && fillGroups.length === 0) {
      list.push('填報權限設為指定群組時，至少要選一個群組')
    }
    if (
      findLegacyDateKeyUsage([{ id: 'draft', name, fields: stripDraft(fields) } as Template])
        .length > 0
    ) {
      list.push('請移除已退役的日期 KEY，改用語意化日期／時間 KEY')
    }
    for (const field of fields) {
      const problem = validateFieldMode(field)
      if (problem) list.push(problem.message)

      if (fieldUsesOptionSet(field) && field.optionSetId) {
        const set = optionSets.find(os => os.id === field.optionSetId)
        if (!set) list.push(`「${field.label || field.key}」的標準選項不存在`)
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

      if (isYesNoField(field) && !isPresetEmpty(field.presetValue)) {
        const allowed = new Set(yesNoValueOrder(field.yesNoAllowNa === true))
        const picked = Array.isArray(field.presetValue) ? field.presetValue : [field.presetValue!]
        for (const value of picked) {
          if (!allowed.has(String(value))) {
            list.push(`「${field.label || field.key}」的預填值「${value}」不是有效的 是/否 答案`)
          }
        }
      }
    }
    return list
  }, [name, moduleId, actionId, fields, fillAccessType, fillGroups, optionSets, standardByKey])

  const warnings = useMemo(() => {
    const list: string[] = []
    for (const field of fields) {
      const mode = field.inputMode ?? 'open'
      if (mode === 'open') continue
      if (shouldWarnOnPreset(field.type)) {
        list.push(`「${field.label || field.key}」寫死一個日期／時間，除了固定年度之類的情況通常是錯的`)
      }
    }
    return list
  }, [fields])

  const handleSave = async () => {
    if (problems.length > 0 || !email) return
    // Never persist empty/invalid keys
    if (fields.some(f => !f.key.trim() || validateTemplateFieldKey(f.key))) return

    setSaving(true)
    setError('')
    try {
      const payload = {
        name,
        moduleId,
        actionId,
        description,
        enabled,
        managerGroups,
        fillAccessType,
        fillGroups,
        fields: stripDraft(fields),
      }
      if (editId && source) {
        const fieldsChanged = JSON.stringify(source.fields) !== JSON.stringify(payload.fields)
        await updateTemplate(editId, payload, source.version, fieldsChanged)
      } else {
        await createTemplate(payload, email)
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/forms" className="btn-ghost btn-sm">
            ← 回表格清單
          </Link>
          <h1 className="text-lg font-semibold">
            {editId ? '編輯表格' : copyId ? '複製表格' : '建立表格'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm lg:hidden"
            onClick={() => setPoolMobileOpen(true)}
          >
            題庫
          </button>
          {editId && (
            <Link href={`/submit?templateId=${editId}`} className="btn-secondary btn-sm" target="_blank">
              預覽
            </Link>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
            表單設定
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || problems.length > 0}
          >
            {saving ? '儲存中…' : editId ? '儲存' : '建立表格'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 shrink-0">
          <ErrorBanner message={error} />
        </div>
      )}
      {legacyWarning && (
        <div className="mb-3 shrink-0">
          <ErrorBanner message={legacyWarning} />
        </div>
      )}
      {needsSeed && (
        <div className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          分類或動作標準選項還是空的，請先到
          <Link href="/options" className="mx-1 font-medium underline">
            標準選項
          </Link>
          補上。
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <QuestionPoolPanel
          items={poolItems}
          usedKeys={usedKeys}
          selectedId={selectedPoolId}
          onSelect={setSelectedPoolId}
          onAdd={addFromPool}
          mobileOpen={poolMobileOpen}
          onMobileClose={() => setPoolMobileOpen(false)}
        />

        <div className="min-w-0 flex-1 overflow-y-auto bg-slate-100 px-4 py-5 sm:px-6">
          {/* Centered canvas — Google Forms–like column width */}
          <div className="mx-auto w-full max-w-2xl">
          {/* Form title block — Google Forms primary */}
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="label mb-1">表單名稱</label>
            <input
              className="field text-lg font-medium"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：營會登記表"
            />
            <label className="label mb-1 mt-4">表單說明</label>
            <textarea
              className="field"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="填這張表要做什麼（選填）"
            />
          </section>

          {/* Bird's-eye question list */}
          <div className="space-y-1">
            {fields.map((field, index) => {
              const expanded = expandedId === field.clientId
              const zebra = index % 2 === 0 ? 'bg-slate-50' : 'bg-white'
              const locked = isContractLockedField(field, standardKeys)
              const relevantSets = optionSetsForField(field, optionSets)
              const boundStandard = standardByKey.get(field.key)

              return (
                <div
                  key={field.clientId}
                  className={`rounded-lg border border-slate-200 ${zebra}`}
                  draggable={!expanded}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === index) return
                    moveField(dragIndex, index)
                    setDragIndex(null)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <div className="flex items-center gap-1 px-2 py-2.5">
                    <button
                      type="button"
                      className="btn-ghost btn-sm shrink-0 px-1"
                      aria-label={expanded ? '收合' : '展開'}
                      onClick={() => setExpandedId(expanded ? null : field.clientId)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <span
                      className="cursor-grab text-slate-300"
                      title="拖曳排序"
                      aria-hidden
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setExpandedId(expanded ? null : field.clientId)}
                    >
                      <span className="block truncate text-sm text-slate-800">
                        {field.label.trim() || '（未命名問題）'}
                        <span className="ml-2 font-mono text-xs text-slate-500">
                          · {field.key.trim() || '（未設定 KEY）'}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          · {answerFormatLabel(field)}
                        </span>
                        {locked && (
                          <span className="ml-2 text-xs text-unicorn-600">標準契約</span>
                        )}
                        {field.needsKey && (
                          <span className="ml-2 text-xs text-amber-700">需新 KEY</span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      aria-label="上移"
                      disabled={index === 0}
                      onClick={() => moveField(index, index - 1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      aria-label="下移"
                      disabled={index === fields.length - 1}
                      onClick={() => moveField(index, index + 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-red-500"
                      aria-label="刪除"
                      onClick={() => removeField(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {expanded && (
                    <div className="space-y-3 border-t border-slate-200 px-4 py-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => moveField(index, 0)}
                          disabled={index === 0}
                        >
                          移至最上
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => moveField(index, fields.length - 1)}
                          disabled={index === fields.length - 1}
                        >
                          移至最下
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label mb-1 text-xs">問題</label>
                          <input
                            className="field"
                            value={field.label}
                            onChange={e => updateField(index, { label: e.target.value })}
                            placeholder="問題顯示名稱"
                          />
                        </div>
                        <div>
                          <label className="label mb-1 text-xs">系統 KEY</label>
                          <input
                            ref={field.needsKey ? keyInputRef : undefined}
                            className="field font-mono"
                            value={field.key}
                            onChange={e =>
                              updateField(index, {
                                key: e.target.value.trim(),
                                needsKey: !e.target.value.trim(),
                              })
                            }
                            placeholder={
                              field.templateDefaultKey
                                ? `預設 ${field.templateDefaultKey} 已使用，請設定新 KEY`
                                : '例：prog_visitNote'
                            }
                          />
                          {field.needsKey && (
                            <p className="mt-1 text-xs text-amber-700">
                              ⚠ 請為這個題目設定新的 KEY（勿自動沿用已占用的預設 KEY）
                            </p>
                          )}
                          {boundStandard && (
                            <p className="mt-1 text-xs text-unicorn-700">
                              已綁定標準問題「{boundStandard.key}」— 回答契約鎖定
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="label mb-1 text-xs">回答方式</label>
                        {locked ? (
                          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            {answerFormatLabel(field)} 🔒
                            {(field.type === 'date' ||
                              field.type === 'time' ||
                              field.type === 'datetime') && (
                              <span className="mt-1 block text-xs text-slate-500">
                                這是回答方式，不是 KEY（例如 startDate 才是系統 KEY）。
                              </span>
                            )}
                          </p>
                        ) : (
                          <select
                            className="field"
                            value={
                              isYesNoField(field)
                                ? field.yesNoAllowNa
                                  ? 'yesNoNa'
                                  : 'yesNo'
                                : field.type
                            }
                            onChange={e => {
                              const v = e.target.value as MannerChoice
                              if (v === 'yesNo') {
                                updateField(index, {
                                  type: 'choice',
                                  yesNoAllowNa: false,
                                  optionSetId: undefined,
                                  scalePoints: undefined,
                                })
                              } else if (v === 'yesNoNa') {
                                updateField(index, {
                                  type: 'choice',
                                  yesNoAllowNa: true,
                                  optionSetId: undefined,
                                  scalePoints: undefined,
                                })
                              } else {
                                updateField(index, {
                                  type: v,
                                  yesNoAllowNa: undefined,
                                  scalePoints: v === 'scale' ? 5 : undefined,
                                })
                              }
                            }}
                          >
                            {MANNER_OPTIONS.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="label mb-1 text-xs">說明文字</label>
                        <input
                          className="field"
                          value={field.helpText || ''}
                          onChange={e => updateField(index, { helpText: e.target.value })}
                          placeholder="選填；空白則填表者不顯示"
                        />
                      </div>

                      {isYesNoField(field) && (
                        <p className="hint rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          答案 VALUE 固定為 是／否
                          {field.yesNoAllowNa ? '／不適用' : ''}（契約鎖定）
                        </p>
                      )}

                      {fieldUsesOptionSet(field) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {!locked && (
                            <div>
                              <label className="label mb-1 text-xs">顯示方式</label>
                              <select
                                className="field"
                                value={field.type}
                                onChange={e =>
                                  updateField(index, {
                                    type: e.target.value as 'dropdown' | 'choice',
                                  })
                                }
                              >
                                <option value="dropdown">下拉選單</option>
                                <option value="choice">選擇題</option>
                              </select>
                            </div>
                          )}
                          <div className={locked ? 'sm:col-span-2' : ''}>
                            <label className="label mb-1 text-xs">標準選項</label>
                            <select
                              className="field"
                              value={field.optionSetId || ''}
                              disabled={locked}
                              onChange={e => updateField(index, { optionSetId: e.target.value })}
                            >
                              <option value="">請選擇…</option>
                              {relevantSets.map(set => (
                                <option key={set.id} value={set.id}>
                                  {set.name}（{set.items.length} 項）
                                  {set.isMaster ? ' · 完整' : ' · 子集'} · {set.code}
                                </option>
                              ))}
                            </select>
                            {locked && (
                              <p className="hint mt-1">選項契約鎖定（optionSetId）；KEY 可與 code 不同</p>
                            )}
                          </div>
                          <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
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
                        <div>
                          <label className="label mb-1 text-xs">刻度點數</label>
                          <select
                            className="field"
                            value={field.scalePoints || 5}
                            disabled={locked}
                            onChange={e =>
                              updateField(index, {
                                scalePoints: Number(e.target.value) as ScalePoints,
                              })
                            }
                          >
                            {SCALE_POINTS_OPTIONS.map(n => (
                              <option key={n} value={n}>
                                {n} 點
                              </option>
                            ))}
                          </select>
                          <p className="hint mt-1">
                            {locked
                              ? `由標準契約鎖定：${resolveScaleValueLabels(field)
                                  .map(l => `${l.value}=${l.label}`)
                                  .join('／')}`
                              : SCALE_DIRECTION_HINT}
                          </p>
                        </div>
                      )}

                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="rounded text-unicorn-600 focus:ring-unicorn-500"
                          checked={field.required}
                          onChange={e => updateField(index, { required: e.target.checked })}
                        />
                        必答
                      </label>

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
                              <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`inputMode-${field.clientId}`}
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
                              <label className="label mb-1 text-xs">預填值</label>
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="relative mt-4">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm text-slate-600 transition-colors hover:border-unicorn-400 hover:bg-unicorn-50"
              onClick={() => setMannerMenuOpen(v => !v)}
            >
              <Plus className="h-4 w-4" />
              新增問題
            </button>
            {mannerMenuOpen && (
              <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <p className="px-2 py-1 text-xs font-semibold text-slate-500">選擇回答方式</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {MANNER_OPTIONS.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => addFromManner(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <details className="mt-6 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              矩陣批次（量表）
            </summary>
            <div className="mt-3 space-y-3">
              <p className="hint">
                一次加入多題扁平量表。{SCALE_DIRECTION_HINT}
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
            </div>
          </details>

          {problems.length > 0 && (
            <ul className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
              {problems.map(problem => (
                <li key={problem}>· {problem}</li>
              ))}
            </ul>
          )}
          {problems.length === 0 && warnings.length > 0 && (
            <ul className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
              <li className="mb-1 font-medium">提醒（不影響儲存）</li>
              {warnings.map(warning => (
                <li key={warning}>· {warning}</li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex justify-end gap-2 pb-8">
            <Link href="/forms" className="btn-secondary">
              取消
            </Link>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || problems.length > 0}
            >
              {saving ? '儲存中…' : editId ? '儲存變更' : '建立表格'}
            </button>
          </div>
          </div>
        </div>
      </div>

      <FormSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        moduleId={moduleId}
        actionId={actionId}
        enabled={enabled}
        fillAccessType={fillAccessType}
        fillGroups={fillGroups}
        managerGroups={managerGroups}
        moduleItems={moduleItems}
        actionItems={actionItems}
        managerGroupItems={managerGroupItems}
        onModuleId={setModuleId}
        onActionId={setActionId}
        onEnabled={setEnabled}
        onFillAccessType={setFillAccessType}
        onFillGroups={setFillGroups}
        onManagerGroups={setManagerGroups}
      />
    </div>
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
