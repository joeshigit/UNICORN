'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import { useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusChip } from '@/components/ui'
import { SubmissionDetail } from '@/components/SubmissionDetail'
import {
  applyRefineFilters,
  browseSubmissions,
  countHiddenVoid,
  exportAllSubmissions,
  listOptionSets,
  listTemplates,
  maskVoid,
  monthRange,
  querySubmissions,
  recentMonths,
  resolveBrowseDefaultsForScope,
  toDate,
  userIsManager,
  type ManagerBrowseScope,
  type RefineCondition,
  type RefineOp,
  type SubmissionQuery,
} from '@/lib/db'
import { NON_SUBMISSION_QUERY_CODES, combinedKey, countKey } from '@/lib/keys'
import { downloadCsv, toCsv } from '@/lib/csv'
import type { OptionSet, Submission, Template } from '@/types'

function displayValue(submission: Submission, key: string): string {
  const optionLabel = submission._optionLabels?.[key]
  if (optionLabel) return optionLabel
  const raw = submission[key]
  if (raw === undefined || raw === null || raw === '') return ''
  if (Array.isArray(raw)) return raw.join('、')
  return String(raw)
}

function formatSubmittedAt(submission: Submission): string {
  const date = toDate(submission._submittedAt)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface BlockedInfo {
  count: number
  limit: number
}

type DataMode = 'browse' | 'advanced'

function emptyRefineRow(): RefineCondition {
  return { key: '', op: 'eq', value: '' }
}

function DataPool() {
  const params = useSearchParams()
  const { email, uid, isSuperuser } = useAuth()

  const [templates, setTemplates] = useState<Template[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [isManager, setIsManager] = useState(false)
  const [managerResolved, setManagerResolved] = useState(false)

  // 已載入的完整集合（含 VOID）
  const [loadedRows, setLoadedRows] = useState<Submission[]>([])
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Submission | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const setCursorsRef = useRef<Array<QueryDocumentSnapshot<DocumentData> | null>>([])
  const legExhaustedRef = useRef<boolean[]>([])

  const [mode, setMode] = useState<DataMode>('browse')
  const [managerScope, setManagerScope] = useState<ManagerBrowseScope>('visible')
  const [browseDays, setBrowseDays] = useState<14 | 30>(14)

  // 畫面遮罩（永不打 DB）
  const [showVoid, setShowVoid] = useState(false)

  // 精修草稿／已套用
  const [refineOpen, setRefineOpen] = useState(false)
  const [refineDraft, setRefineDraft] = useState<RefineCondition[]>([emptyRefineRow()])
  const [refineApplied, setRefineApplied] = useState<RefineCondition[]>([])

  // 進階搜尋草稿／已套用
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const initialRange = useMemo(() => monthRange(0, 1), [])
  const [fromMonth, setFromMonth] = useState(initialRange.fromMonth)
  const [toMonth, setToMonth] = useState(initialRange.toMonth)
  const [templateId, setTemplateId] = useState(params.get('form') || '')
  const [includeSuperseded, setIncludeSuperseded] = useState(false)
  const [withDerived, setWithDerived] = useState(false)
  const [appliedAdvanced, setAppliedAdvanced] = useState<SubmissionQuery | null>(null)

  const months = useMemo(() => recentMonths(36), [])
  const actor = useMemo(() => ({ uid, email }), [uid, email])

  const browseDefaults = useMemo(
    () =>
      resolveBrowseDefaultsForScope({
        isSuperuser,
        isManager,
        managerScope: isManager ? managerScope : 'mine',
      }),
    [isSuperuser, isManager, managerScope]
  )

  // 非 mine 時可用 14/30；mine／Submitter 固定 30
  const effectiveDays = useMemo(() => {
    if (isSuperuser) return browseDays
    if (isManager && managerScope === 'visible') return browseDays
    return 30
  }, [isSuperuser, isManager, managerScope, browseDays])

  const effectivePageSize = browseDefaults.pageSize

  useEffect(() => {
    Promise.all([listTemplates(), listOptionSets()])
      .then(([t, o]) => {
        setTemplates(t)
        setOptionSets(o)
      })
      .catch(err => setError(err instanceof Error ? err.message : '載入失敗'))
  }, [])

  useEffect(() => {
    if (!email || isSuperuser) {
      setIsManager(false)
      setManagerResolved(true)
      return
    }
    setManagerResolved(false)
    userIsManager(email)
      .then(v => {
        setIsManager(v)
        setManagerResolved(true)
      })
      .catch(() => {
        setIsManager(false)
        setManagerResolved(true)
      })
  }, [email, isSuperuser])

  // Manager／Superuser 進入可見範圍時預設 14 天
  useEffect(() => {
    if (isSuperuser || (isManager && managerScope === 'visible')) {
      setBrowseDays(d => (d === 14 || d === 30 ? d : 14))
    }
  }, [isSuperuser, isManager, managerScope])

  const runBrowse = useCallback(
    async (append: boolean) => {
      if (!uid || !email) return
      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setCursorsRef.current = []
        legExhaustedRef.current = []
      }
      setError('')
      setBlocked(null)
      try {
        const result = await browseSubmissions(
          {
            days: effectiveDays,
            pageSize: effectivePageSize,
            managerScope: isSuperuser ? 'visible' : isManager ? managerScope : 'mine',
            setCursors: append ? setCursorsRef.current : undefined,
            legExhausted: append ? legExhaustedRef.current : undefined,
          },
          actor,
          isSuperuser
        )
        setCursorsRef.current = result.setCursors
        legExhaustedRef.current = result.legExhausted
        setHasMore(result.hasMore)
        if (!append) {
          setMode('browse')
          setAppliedAdvanced(null)
        }
        if (append) {
          setLoadedRows(prev => {
            const map = new Map(prev.map(r => [r.id, r]))
            for (const r of result.rows) map.set(r.id!, r)
            return Array.from(map.values()).sort((a, b) => {
              const at = toDate(a._submittedAt)?.getTime() ?? 0
              const bt = toDate(b._submittedAt)?.getTime() ?? 0
              return bt - at
            })
          })
        } else {
          setLoadedRows(result.rows)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [
      uid,
      email,
      effectiveDays,
      effectivePageSize,
      isSuperuser,
      isManager,
      managerScope,
      actor,
    ]
  )

  // 進入頁／換 browse 伺服器條件 → 重查（等 manager 就緒；不覆蓋進階搜尋結果）
  useEffect(() => {
    if (!uid || !email || !managerResolved) return
    if (mode === 'advanced') return
    runBrowse(false)
  }, [
    uid,
    email,
    managerResolved,
    mode,
    effectiveDays,
    effectivePageSize,
    managerScope,
    isManager,
    isSuperuser,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  const runAdvanced = async () => {
    // '' = 尚未選；'*' = 全部表格（明示）
    if (templateId === '') {
      setError('請先選擇表格，或選「全部表格」')
      return
    }
    if (fromMonth > toMonth) {
      setError('起始月份不能晚於結束月份')
      return
    }
    setLoading(true)
    setError('')
    setBlocked(null)
    try {
      const q: SubmissionQuery = {
        fromMonth,
        toMonth,
        templateId: templateId === '*' ? undefined : templateId,
        includeSuperseded,
      }
      const result = await querySubmissions(q, actor, isSuperuser)
      if (result.blocked) {
        setBlocked({ count: result.count, limit: result.limit })
        setLoadedRows([])
        setAppliedAdvanced(null)
        setHasMore(false)
      } else {
        setBlocked(null)
        setLoadedRows(result.rows)
        setAppliedAdvanced(q)
        setMode('advanced')
        setHasMore(false)
        setCursorsRef.current = []
        legExhaustedRef.current = []
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }

  const applyQuickRange = (offset: number, span: number) => {
    const next = monthRange(offset, span)
    setFromMonth(next.fromMonth)
    setToMonth(next.toMonth)
  }

  const refineDirty = useMemo(
    () => JSON.stringify(refineDraft) !== JSON.stringify(refineApplied.length ? refineApplied : [emptyRefineRow()]),
    [refineDraft, refineApplied]
  )

  const applyRefine = () => {
    setRefineApplied(refineDraft.map(c => ({ ...c })))
  }

  const visibleRows = useMemo(() => {
    const refined = applyRefineFilters(loadedRows, refineApplied)
    return maskVoid(refined, showVoid)
  }, [loadedRows, refineApplied, showVoid])

  const hiddenVoidCount = useMemo(() => {
    const refined = applyRefineFilters(loadedRows, refineApplied)
    return showVoid ? 0 : countHiddenVoid(refined)
  }, [loadedRows, refineApplied, showVoid])

  const activeTemplate =
    mode === 'advanced' && appliedAdvanced?.templateId
      ? templates.find(t => t.id === appliedAdvanced.templateId) || null
      : templateId && templateId !== '*'
        ? templates.find(t => t.id === templateId) || null
        : null

  const keyChoices = useMemo(() => {
    const byCode = new Map<string, OptionSet[]>()
    for (const set of optionSets) {
      if (NON_SUBMISSION_QUERY_CODES.includes(set.code)) continue
      byCode.set(set.code, [...(byCode.get(set.code) || []), set])
    }
    return Array.from(byCode.entries())
      .map(([code, sets]) => {
        const values = new Map<string, string>()
        for (const set of sets) {
          for (const item of set.items) values.set(item.value, item.label)
        }
        return { code, name: sets[0].name, values: Array.from(values.entries()) }
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [optionSets])

  const columns = useMemo(() => {
    if (activeTemplate) {
      return [...activeTemplate.fields]
        .sort((a, b) => a.order - b.order)
        .map(f => ({ key: f.key, label: f.label }))
    }
    const seen = new Map<string, string>()
    for (const row of loadedRows) {
      for (const key of row._fieldKeys || []) {
        if (!seen.has(key)) seen.set(key, row._fieldLabels?.[key] || key)
      }
    }
    return Array.from(seen.entries())
      .slice(0, 6)
      .map(([key, label]) => ({ key, label }))
  }, [activeTemplate, loadedRows])

  const dropdownColumns = useMemo(
    () => columns.filter(c => loadedRows.some(row => row[countKey(c.key)] !== undefined)),
    [columns, loadedRows]
  )

  const buildCsv = (dataRows: Submission[]) => {
    const headers = [
      '提交時間',
      '表格',
      '版本',
      'module',
      'action',
      'eventType',
      '狀態',
      '擁有者',
      '操作者',
      ...columns.map(c => `${c.label} (${c.key})`),
    ]
    const extraColumns = withDerived ? dropdownColumns : []
    for (const column of extraColumns) {
      headers.push(`${column.label} 組合值 (${combinedKey(column.key)})`)
      headers.push(`${column.label} 數量 (${countKey(column.key)})`)
    }

    const data = dataRows.map(row => {
      const cells: unknown[] = [
        formatSubmittedAt(row),
        row._templateName,
        `v${row._templateVersion}`,
        row._templateModule,
        row._templateAction,
        row._eventType || '',
        row._status,
        row._submitterEmail,
        row._actorEmail || '',
        ...columns.map(c => displayValue(row, c.key)),
      ]
      for (const column of extraColumns) {
        cells.push(row[combinedKey(column.key)] ?? '')
        cells.push(row[countKey(column.key)] ?? '')
      }
      return cells
    })

    const name = activeTemplate ? activeTemplate.name : 'unicorn'
    const stamp =
      appliedAdvanced && appliedAdvanced.fromMonth === appliedAdvanced.toMonth
        ? appliedAdvanced.fromMonth
        : appliedAdvanced
          ? `${appliedAdvanced.fromMonth}_${appliedAdvanced.toMonth}`
          : 'export'
    downloadCsv(`${name}_${stamp}.csv`, toCsv(headers, data))
  }

  const handleExport = async () => {
    if (!appliedAdvanced) {
      setError('請先用進階搜尋選定月份範圍並查詢後再匯出')
      return
    }
    setExporting(true)
    setError('')
    try {
      const all = await exportAllSubmissions(appliedAdvanced, actor, isSuperuser)
      if (all.length === 0) {
        setError('這個條件沒有可匯出的資料')
        return
      }
      buildCsv(all)
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const rangeLabel =
    appliedAdvanced && appliedAdvanced.fromMonth === appliedAdvanced.toMonth
      ? appliedAdvanced.fromMonth
      : appliedAdvanced
        ? `${appliedAdvanced.fromMonth} ～ ${appliedAdvanced.toMonth}`
        : ''

  const showWindowToggle = isSuperuser || (isManager && managerScope === 'visible')

  const updateDraft = (index: number, patch: Partial<RefineCondition>) => {
    setRefineDraft(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <>
      <PageHeader
        title="已填的表格"
        description="預設瀏覽近期資料；需要完整月份範圍時再開進階搜尋。作廢預設隱藏，精修只作用在已載入的資料。"
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={() => (mode === 'browse' ? runBrowse(false) : runAdvanced())}
            >
              <RefreshCw className="h-4 w-4" />
              重新整理
            </button>
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting || !appliedAdvanced}
              title={!appliedAdvanced ? '請先用進階搜尋查詢後再匯出' : undefined}
            >
              <Download className="h-4 w-4" />
              {exporting ? '匯出中…' : '完整匯出 CSV'}
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="card mb-5 divide-y divide-slate-100">
        {/* Browse 控制 */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
            <CalendarRange className="h-4 w-4" />
            瀏覽近期
            <span className="hint font-normal">
              （近 {effectiveDays} 天，每批最多 {effectivePageSize} 筆）
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {isManager && !isSuperuser && (
              <>
                <button
                  className={`btn-secondary btn-sm ${managerScope === 'visible' ? 'ring-2 ring-unicorn-500' : ''}`}
                  onClick={() => {
                    setManagerScope('visible')
                    setBrowseDays(14)
                  }}
                >
                  可見範圍
                </button>
                <button
                  className={`btn-secondary btn-sm ${managerScope === 'mine' ? 'ring-2 ring-unicorn-500' : ''}`}
                  onClick={() => setManagerScope('mine')}
                >
                  只看我填的
                </button>
              </>
            )}
            {showWindowToggle && (
              <>
                <button
                  className={`btn-secondary btn-sm ${browseDays === 14 ? 'ring-2 ring-unicorn-500' : ''}`}
                  onClick={() => setBrowseDays(14)}
                >
                  近 14 天
                </button>
                <button
                  className={`btn-secondary btn-sm ${browseDays === 30 ? 'ring-2 ring-unicorn-500' : ''}`}
                  onClick={() => setBrowseDays(30)}
                >
                  近 30 天
                </button>
              </>
            )}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="rounded text-unicorn-600 focus:ring-unicorn-500"
                checked={showVoid}
                onChange={e => setShowVoid(e.target.checked)}
              />
              顯示作廢
            </label>
          </div>
        </div>

        {/* 精修（收合） */}
        <div className="p-4">
          <button
            type="button"
            className="mb-0 flex w-full items-center gap-2 text-sm font-medium text-slate-600"
            onClick={() => setRefineOpen(o => !o)}
          >
            {refineOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <SlidersHorizontal className="h-4 w-4" />
            精修已載入資料
            <span className="hint font-normal">（不重新查詢）</span>
            {refineDirty && <span className="hint text-amber-600">有未套用的變更</span>}
          </button>

          {refineOpen && (
            <div className="mt-3 space-y-3">
              {refineDraft.map((row, index) => {
                const keyChoice = keyChoices.find(k => k.code === row.key)
                return (
                  <div key={index} className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label mb-1">跨表 KEY</label>
                      <select
                        className="field"
                        value={row.key}
                        onChange={e => updateDraft(index, { key: e.target.value, value: '' })}
                      >
                        <option value="">不使用</option>
                        {keyChoices.map(k => (
                          <option key={k.code} value={k.code}>
                            {k.code}（{k.name}）
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label mb-1">條件</label>
                      <select
                        className="field"
                        value={row.op}
                        onChange={e => updateDraft(index, { op: e.target.value as RefineOp })}
                      >
                        <option value="eq">等於</option>
                        <option value="neq">不等於</option>
                        <option value="hasValue">有值</option>
                        <option value="blank">空白</option>
                      </select>
                    </div>
                    <div>
                      <label className="label mb-1">值</label>
                      <select
                        className="field"
                        value={row.value || ''}
                        disabled={!keyChoice || row.op === 'hasValue' || row.op === 'blank'}
                        onChange={e => updateDraft(index, { value: e.target.value })}
                      >
                        <option value="">選取值</option>
                        {keyChoice?.values.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setRefineDraft(prev => [...prev, emptyRefineRow()])}
                >
                  加一列條件
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={applyRefine}>
                  套用精修
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 進階搜尋（收合） */}
        <div className="p-4">
          <button
            type="button"
            className="mb-0 flex w-full items-center gap-2 text-sm font-medium text-slate-600"
            onClick={() => setAdvancedOpen(o => !o)}
          >
            {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Filter className="h-4 w-4" />
            進階搜尋
            <span className="hint font-normal">（月份範圍完整查詢，需按查詢）</span>
          </button>

          {advancedOpen && (
            <div className="mt-3">
              <div className="mb-3 flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm" onClick={() => applyQuickRange(0, 1)}>
                  本月
                </button>
                <button className="btn-secondary btn-sm" onClick={() => applyQuickRange(1, 1)}>
                  上月
                </button>
                <button className="btn-secondary btn-sm" onClick={() => applyQuickRange(0, 3)}>
                  近三個月
                </button>
                <button className="btn-secondary btn-sm" onClick={() => applyQuickRange(0, 12)}>
                  近十二個月
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label mb-1">起</label>
                  <select
                    className="field"
                    value={fromMonth}
                    onChange={e => setFromMonth(e.target.value)}
                  >
                    {months.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label mb-1">迄</label>
                  <select className="field" value={toMonth} onChange={e => setToMonth(e.target.value)}>
                    {months.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label mb-1">表格</label>
                  <select
                    className="field"
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                  >
                    <option value="">請選擇…</option>
                    <option value="*">全部表格</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {fromMonth > toMonth && (
                <p className="mt-2 text-sm text-red-600">起始月份不能晚於結束月份。</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded text-unicorn-600 focus:ring-unicorn-500"
                    checked={includeSuperseded}
                    onChange={e => setIncludeSuperseded(e.target.checked)}
                  />
                  連被更正的舊版本一起看
                </label>
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"
                  title="下拉欄位除了顯示值，另外帶出組合字串與選了幾個，方便做樞紐分析"
                >
                  <input
                    type="checkbox"
                    className="rounded text-unicorn-600 focus:ring-unicorn-500"
                    checked={withDerived}
                    onChange={e => setWithDerived(e.target.checked)}
                  />
                  匯出時帶出組合值與數量
                </label>
                <button type="button" className="btn-primary btn-sm" onClick={runAdvanced}>
                  查詢
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner label={mode === 'advanced' ? '查詢中' : '載入中'} />
      ) : blocked ? (
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <Filter className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h2 className="font-semibold">範圍太大，尚未取回資料</h2>
              <p className="mt-1 text-sm text-slate-600">
                {fromMonth === toMonth ? fromMonth : `${fromMonth} ～ ${toMonth}`} 這個範圍符合{' '}
                <strong>{blocked.count}</strong> 筆，超過單次顯示上限 {blocked.limit} 筆。
              </p>
              <p className="mt-2 text-sm text-slate-500">
                請縮小月份範圍或指定表格後再查；若要取得全部資料，請先成功查詢後再按「完整匯出 CSV」。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm" onClick={() => applyQuickRange(0, 1)}>
                  改成只看本月
                </button>
                <button className="btn-secondary btn-sm" onClick={() => applyQuickRange(1, 1)}>
                  改成只看上月
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={loadedRows.length === 0 ? '沒有資料' : '沒有符合精修條件的資料'}
          description={
            loadedRows.length === 0
              ? '換時間窗，或用進階搜尋查完整月份，或先去填一筆。'
              : showVoid
                ? '調整精修條件後再套用。'
                : '目前隱藏了作廢紀錄；可勾選「顯示作廢」或調整精修。'
          }
          action={
            loadedRows.length === 0 ? (
              <Link href="/fill" className="btn-primary">
                去填報
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">提交時間</th>
                  {!activeTemplate && <th className="whitespace-nowrap px-4 py-3 font-medium">表格</th>}
                  {columns.map(column => (
                    <th key={column.key} className="whitespace-nowrap px-4 py-3 font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-4 py-3 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map(row => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelected(row)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatSubmittedAt(row)}
                    </td>
                    {!activeTemplate && (
                      <td className="whitespace-nowrap px-4 py-3">{row._templateName}</td>
                    )}
                    {columns.map(column => (
                      <td key={column.key} className="max-w-[16rem] truncate px-4 py-3">
                        {displayValue(row, column.key)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusChip status={row._status} />
                      {row._isLatest === false && (
                        <span className="chip ml-1 bg-amber-50 text-amber-700">舊版</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            <span>
              {mode === 'advanced' && appliedAdvanced
                ? `${rangeLabel} 共 ${loadedRows.length} 筆（此範圍完整）`
                : `顯示 ${visibleRows.length}／已載入 ${loadedRows.length}（近 ${effectiveDays} 天${
                    hiddenVoidCount ? `，作廢已隱藏 ${hiddenVoidCount}` : ''
                  }）`}
            </span>
            {mode === 'browse' && hasMore && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={loadingMore}
                onClick={() => runBrowse(true)}
              >
                {loadingMore ? '載入中…' : '載入更多'}
              </button>
            )}
          </div>
        </div>
      )}

      {selected && (
        <SubmissionDetail
          submission={selected}
          actor={actor}
          isSuperuser={isSuperuser}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
            if (mode === 'advanced' && appliedAdvanced) runAdvanced()
            else runBrowse(false)
          }}
        />
      )}
    </>
  )
}

export default function DataPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DataPool />
    </Suspense>
  )
}
