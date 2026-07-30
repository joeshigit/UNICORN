'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { SuperuserGuard, useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import {
  createStandardKey,
  listOptionSets,
  listStandardKeys,
  updateStandardKey,
} from '@/lib/db'
import {
  FREE_STANDARD_TYPES,
  RESERVED_CODES,
  SCALE_POINTS_OPTIONS,
  expectedValueModel,
  scaleOptions,
  validateScaleValueLabels,
  validateStandardKeyCode,
  validateTypeValueModel,
} from '@/lib/keys'
import type {
  FieldType,
  OptionSet,
  ScalePoints,
  ScaleValueLabel,
  StandardKey,
  StandardValueModel,
} from '@/types'

type CreateMode = StandardValueModel

function blankLabels(points: ScalePoints): ScaleValueLabel[] {
  return scaleOptions(points).map(o => ({ value: o.value, label: o.label }))
}

function StandardsPageInner() {
  const { email } = useAuth()
  const [rows, setRows] = useState<StandardKey[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [mode, setMode] = useState<CreateMode>('free')
  const [freeType, setFreeType] = useState<FieldType>('text')
  const [optionType, setOptionType] = useState<'dropdown' | 'choice'>('choice')
  const [masterId, setMasterId] = useState('')
  const [meaning, setMeaning] = useState('')
  const [defaultLabel, setDefaultLabel] = useState('')
  const [freeKey, setFreeKey] = useState('')
  const [scalePoints, setScalePoints] = useState<ScalePoints>(5)
  const [scaleKey, setScaleKey] = useState('')
  const [scaleLabels, setScaleLabels] = useState<ScaleValueLabel[]>(() => blankLabels(5))

  const load = async () => {
    setLoading(true)
    try {
      const [standards, sets] = await Promise.all([listStandardKeys(), listOptionSets()])
      setRows(standards)
      setOptionSets(sets)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (email) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  const masters = useMemo(
    () =>
      optionSets.filter(
        os => os.isMaster && !(RESERVED_CODES as readonly string[]).includes(os.code)
      ),
    [optionSets]
  )

  const takenKeys = useMemo(() => new Set(rows.map(r => r.key)), [rows])

  const selectedMaster = masters.find(m => m.id === masterId)

  const freeKeyError = freeKey ? validateStandardKeyCode(freeKey) : null
  const scaleKeyError = scaleKey ? validateStandardKeyCode(scaleKey) : null
  const scaleLabelError = validateScaleValueLabels(scalePoints, scaleLabels)

  const resetCreate = () => {
    setMode('free')
    setFreeType('text')
    setOptionType('choice')
    setMasterId('')
    setMeaning('')
    setDefaultLabel('')
    setFreeKey('')
    setScalePoints(5)
    setScaleKey('')
    setScaleLabels(blankLabels(5))
  }

  const handleCreate = async () => {
    setSaving(true)
    setError('')
    try {
      if (mode === 'free') {
        if (freeKeyError || takenKeys.has(freeKey) || !meaning.trim() || !defaultLabel.trim()) {
          throw new Error(freeKeyError || '請填完整資料')
        }
        const vmErr = validateTypeValueModel(freeType, 'free')
        if (vmErr) throw new Error(vmErr)
        await createStandardKey(
          {
            key: freeKey.trim(),
            meaning: meaning.trim(),
            defaultLabel: defaultLabel.trim(),
            type: freeType,
            valueModel: 'free',
          },
          email
        )
      } else if (mode === 'optionSet') {
        if (!selectedMaster) throw new Error('請選擇 Master 選項池')
        if (takenKeys.has(selectedMaster.code)) {
          throw new Error(`標準 KEY「${selectedMaster.code}」已經存在`)
        }
        const codeErr = validateStandardKeyCode(selectedMaster.code)
        if (codeErr) throw new Error(codeErr)
        await createStandardKey(
          {
            key: selectedMaster.code,
            meaning: meaning.trim() || selectedMaster.name,
            defaultLabel: defaultLabel.trim() || selectedMaster.name,
            type: optionType,
            valueModel: 'optionSet',
            optionSetId: selectedMaster.id,
          },
          email
        )
      } else {
        if (scaleKeyError || takenKeys.has(scaleKey) || scaleLabelError) {
          throw new Error(scaleKeyError || scaleLabelError || '請填完整資料')
        }
        if (!meaning.trim() || !defaultLabel.trim()) throw new Error('請填意義與預設顯示名稱')
        await createStandardKey(
          {
            key: scaleKey.trim(),
            meaning: meaning.trim(),
            defaultLabel: defaultLabel.trim(),
            type: 'scale',
            valueModel: 'scale',
            scalePoints,
            scaleValueLabels: scaleLabels,
          },
          email
        )
      }
      setCreating(false)
      resetCreate()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleDeprecate = async (row: StandardKey) => {
    if (row.status === 'deprecated') return
    if (!confirm(`停用標準「${row.key}」？新表將不能選用；舊表與已提交資料不受影響。`)) return
    try {
      await updateStandardKey(row.id!, { status: 'deprecated' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '停用失敗')
    }
  }

  const handleSaveMeta = async (row: StandardKey, meaningVal: string, labelVal: string) => {
    try {
      await updateStandardKey(row.id!, { meaning: meaningVal, defaultLabel: labelVal })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    }
  }

  return (
    <>
      <PageHeader
        title="標準資料"
        description="標準資料是組織認定可跨表重用的資料概念。它規定 KEY 及答案格式；一次性問題仍可在表單中使用本表專用欄位。"
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setCreating(v => !v)
              if (creating) resetCreate()
            }}
          >
            <Plus className="h-4 w-4" />
            新增標準 KEY
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card mb-5 space-y-4 p-6">
          <h2 className="font-semibold">新增標準 KEY</h2>

          <div>
            <label className="label mb-1">答案模型</label>
            <select
              className="field"
              value={mode}
              onChange={e => {
                const next = e.target.value as CreateMode
                setMode(next)
                if (next === 'scale') setScaleLabels(blankLabels(scalePoints))
              }}
            >
              <option value="free">自由填寫（文字／數字／日期…）</option>
              <option value="optionSet">選項池（KEY＝Master code）</option>
              <option value="scale">量表（固定 1…N 標籤）</option>
            </select>
          </div>

          {mode === 'free' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label mb-1">KEY</label>
                <input
                  className={`field font-mono ${freeKeyError || takenKeys.has(freeKey) ? 'field-error' : ''}`}
                  value={freeKey}
                  onChange={e => setFreeKey(e.target.value)}
                  placeholder="emerContact"
                />
                {freeKeyError && <p className="mt-1 text-sm text-red-600">{freeKeyError}</p>}
                {!freeKeyError && takenKeys.has(freeKey) && (
                  <p className="mt-1 text-sm text-red-600">這個 KEY 已經在標準資料中</p>
                )}
              </div>
              <div>
                <label className="label mb-1">題型</label>
                <select
                  className="field"
                  value={freeType}
                  onChange={e => setFreeType(e.target.value as FieldType)}
                >
                  {FREE_STANDARD_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="hint mt-1">答案模型：{expectedValueModel(freeType)}</p>
              </div>
            </div>
          )}

          {mode === 'optionSet' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label mb-1">Master 選項池（KEY＝其 code）</label>
                <select
                  className="field font-mono"
                  value={masterId}
                  onChange={e => {
                    setMasterId(e.target.value)
                    const m = masters.find(x => x.id === e.target.value)
                    if (m) {
                      if (!defaultLabel.trim()) setDefaultLabel(m.name)
                      if (!meaning.trim()) setMeaning(m.name)
                    }
                  }}
                >
                  <option value="">請選擇…</option>
                  {masters.map(m => (
                    <option key={m.id} value={m.id} disabled={takenKeys.has(m.code)}>
                      {m.code} — {m.name}
                      {takenKeys.has(m.code) ? '（已登錄）' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label mb-1">顯示方式（鎖定）</label>
                <select
                  className="field"
                  value={optionType}
                  onChange={e => setOptionType(e.target.value as 'dropdown' | 'choice')}
                >
                  <option value="choice">選擇題（圓鈕／方框）</option>
                  <option value="dropdown">下拉選單</option>
                </select>
              </div>
            </div>
          )}

          {mode === 'scale' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label mb-1">KEY</label>
                  <input
                    className={`field font-mono ${scaleKeyError || takenKeys.has(scaleKey) ? 'field-error' : ''}`}
                    value={scaleKey}
                    onChange={e => setScaleKey(e.target.value)}
                    placeholder="serEvaluation"
                  />
                  {scaleKeyError && <p className="mt-1 text-sm text-red-600">{scaleKeyError}</p>}
                </div>
                <div>
                  <label className="label mb-1">刻度點數</label>
                  <select
                    className="field"
                    value={scalePoints}
                    onChange={e => {
                      const n = Number(e.target.value) as ScalePoints
                      setScalePoints(n)
                      setScaleLabels(blankLabels(n))
                    }}
                  >
                    {SCALE_POINTS_OPTIONS.map(n => (
                      <option key={n} value={n}>
                        {n} 點
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="label">各點標籤（VALUE 固定 1…N）</label>
                {scaleLabels.map((row, i) => (
                  <div key={row.value} className="flex items-center gap-2">
                    <span className="w-8 font-mono text-sm text-slate-500">{row.value}</span>
                    <input
                      className="field"
                      value={row.label}
                      onChange={e =>
                        setScaleLabels(prev =>
                          prev.map((r, j) => (j === i ? { ...r, label: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                ))}
                {scaleLabelError && <p className="text-sm text-red-600">{scaleLabelError}</p>}
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-1">預設顯示名稱</label>
              <input
                className="field"
                value={defaultLabel}
                onChange={e => setDefaultLabel(e.target.value)}
                placeholder="緊急聯絡電話"
              />
            </div>
            <div>
              <label className="label mb-1">意義說明</label>
              <input
                className="field"
                value={meaning}
                onChange={e => setMeaning(e.target.value)}
                placeholder="跨表統一的緊急聯絡電話"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setCreating(false)
                resetCreate()
              }}
            >
              取消
            </button>
            <button className="btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? '建立中…' : '建立'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner label="載入中" />
      ) : rows.length === 0 ? (
        <EmptyState title="還沒有標準資料" description="先新增幾個跨表會重用的 KEY。" />
      ) : (
        <div className="space-y-4">
          {rows.map(row => (
            <StandardRow
              key={row.id}
              row={row}
              onDeprecate={() => handleDeprecate(row)}
              onSaveMeta={(m, l) => handleSaveMeta(row, m, l)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function StandardRow({
  row,
  onDeprecate,
  onSaveMeta,
}: {
  row: StandardKey
  onDeprecate: () => void
  onSaveMeta: (meaning: string, label: string) => void
}) {
  const [meaning, setMeaning] = useState(row.meaning)
  const [label, setLabel] = useState(row.defaultLabel)
  useEffect(() => {
    setMeaning(row.meaning)
    setLabel(row.defaultLabel)
  }, [row.meaning, row.defaultLabel, row.id])

  const dirty = meaning !== row.meaning || label !== row.defaultLabel

  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="key-chip text-sm">{row.key}</span>
          <span className="ml-2 text-xs text-slate-500">
            {row.type} · {row.valueModel}
            {row.status === 'deprecated' ? ' · 已停用' : ''}
          </span>
        </div>
        {row.status === 'active' && (
          <button type="button" className="btn-ghost btn-sm text-amber-700" onClick={onDeprecate}>
            停用
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label mb-1 text-xs">預設顯示名稱</label>
          <input className="field" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label mb-1 text-xs">意義說明</label>
          <input className="field" value={meaning} onChange={e => setMeaning(e.target.value)} />
        </div>
      </div>

      <p className="hint">
        答案契約已鎖定
        {row.valueModel === 'optionSet' && ` · optionSetId=${row.optionSetId}`}
        {row.valueModel === 'scale' &&
          ` · ${row.scalePoints} 點：${(row.scaleValueLabels || []).map(l => l.label).join('／')}`}
        {row.valueModel === 'free' && ' · 自由填寫'}
      </p>

      {dirty && (
        <div className="flex justify-end">
          <button type="button" className="btn-secondary btn-sm" onClick={() => onSaveMeta(meaning, label)}>
            儲存說明
          </button>
        </div>
      )}
    </div>
  )
}

export default function StandardsPage() {
  return (
    <SuperuserGuard>
      <StandardsPageInner />
    </SuperuserGuard>
  )
}
