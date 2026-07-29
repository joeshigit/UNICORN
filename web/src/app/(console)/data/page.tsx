'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CalendarRange, Download, Filter, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusChip } from '@/components/ui'
import { SubmissionDetail } from '@/components/SubmissionDetail'
import {
  exportAllSubmissions,
  listOptionSets,
  listTemplates,
  monthRange,
  querySubmissions,
  recentMonths,
  toDate,
} from '@/lib/db'
import type { SubmissionQuery } from '@/lib/db'
import { ACTION_CODE, MODULE_CODE, NON_SUBMISSION_QUERY_CODES, combinedKey, countKey } from '@/lib/keys'
import { downloadCsv, toCsv } from '@/lib/csv'
import type { OptionSet, Submission, SubmissionStatus, Template } from '@/types'

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

function DataPool() {
  const params = useSearchParams()
  const { email, uid, isSuperuser } = useAuth()

  const [templates, setTemplates] = useState<Template[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [rows, setRows] = useState<Submission[]>([])
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Submission | null>(null)

  // 第一個條件：提交月份範圍，必填，預設當月
  const initialRange = useMemo(() => monthRange(0, 1), [])
  const [fromMonth, setFromMonth] = useState(initialRange.fromMonth)
  const [toMonth, setToMonth] = useState(initialRange.toMonth)

  // 第二個條件：表格
  const [templateId, setTemplateId] = useState(params.get('form') || '')

  // 以下都是前端精修
  const [status, setStatus] = useState<SubmissionStatus | 'ALL'>('ACTIVE')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldValue, setFieldValue] = useState('')
  const [includeSuperseded, setIncludeSuperseded] = useState(false)
  const [withDerived, setWithDerived] = useState(false)

  const months = useMemo(() => recentMonths(36), [])

  useEffect(() => {
    Promise.all([listTemplates(), listOptionSets()])
      .then(([t, o]) => {
        setTemplates(t)
        setOptionSets(o)
      })
      .catch(err => setError(err instanceof Error ? err.message : '載入失敗'))
  }, [])

  const queryInput = useMemo<SubmissionQuery>(
    () => ({
      fromMonth,
      toMonth,
      templateId: templateId || undefined,
      status,
      includeSuperseded,
      module: moduleFilter || undefined,
      action: actionFilter || undefined,
      fieldKey: fieldKey || undefined,
      fieldValue: fieldKey && fieldValue ? fieldValue : undefined,
    }),
    [
      fromMonth,
      toMonth,
      templateId,
      status,
      includeSuperseded,
      moduleFilter,
      actionFilter,
      fieldKey,
      fieldValue,
    ]
  )

  const actor = useMemo(() => ({ uid, email }), [uid, email])

  const runQuery = useCallback(async () => {
    // 範圍顛倒時不要送查詢，畫面已經有提示了
    if (fromMonth > toMonth) {
      setRows([])
      setBlocked(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await querySubmissions(queryInput, actor, isSuperuser)
      if (result.blocked) {
        setBlocked({ count: result.count, limit: result.limit })
        setRows([])
      } else {
        setBlocked(null)
        setRows(result.rows)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [queryInput, actor, isSuperuser, fromMonth, toMonth])

  useEffect(() => {
    if (uid && email) runQuery()
  }, [runQuery, uid, email])

  const applyQuickRange = (offset: number, span: number) => {
    const next = monthRange(offset, span)
    setFromMonth(next.fromMonth)
    setToMonth(next.toMonth)
  }

  const activeTemplate = templates.find(t => t.id === templateId) || null

  const moduleChoices = useMemo(() => {
    const master = optionSets.find(os => os.code === MODULE_CODE && os.isMaster)
    return master?.items || []
  }, [optionSets])

  const actionChoices = useMemo(() => {
    const master = optionSets.find(os => os.code === ACTION_CODE && os.isMaster)
    return master?.items || []
  }, [optionSets])

  // 跨表 KEY：排除 module / action / managerGroup（它們是模板維度或 ACL）
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

  const selectedKeyChoice = keyChoices.find(k => k.code === fieldKey)

  const columns = useMemo(() => {
    if (activeTemplate) {
      return [...activeTemplate.fields]
        .sort((a, b) => a.order - b.order)
        .map(f => ({ key: f.key, label: f.label }))
    }
    const seen = new Map<string, string>()
    for (const row of rows) {
      for (const key of row._fieldKeys || []) {
        if (!seen.has(key)) seen.set(key, row._fieldLabels?.[key] || key)
      }
    }
    return Array.from(seen.entries())
      .slice(0, 6)
      .map(([key, label]) => ({ key, label }))
  }, [activeTemplate, rows])

  const dropdownColumns = useMemo(
    () => columns.filter(c => rows.some(row => row[countKey(c.key)] !== undefined)),
    [columns, rows]
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
    const stamp = fromMonth === toMonth ? fromMonth : `${fromMonth}_${toMonth}`
    downloadCsv(`${name}_${stamp}.csv`, toCsv(headers, data))
  }

  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      // 匯出不套用顯示上限，走 cursor 分頁把整個範圍取完
      const all = await exportAllSubmissions(queryInput, actor, isSuperuser)
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

  const rangeLabel = fromMonth === toMonth ? fromMonth : `${fromMonth} ～ ${toMonth}`

  return (
    <>
      <PageHeader
        title="資料池"
        description="先選提交月份範圍，再選表格。其餘條件是在取回的範圍內精修。"
        actions={
          <>
            <button className="btn-secondary" onClick={runQuery}>
              <RefreshCw className="h-4 w-4" />
              重新查詢
            </button>
            <button className="btn-primary" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? '匯出中…' : '完整匯出 CSV'}
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="card mb-5 divide-y divide-slate-100">
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
            <CalendarRange className="h-4 w-4" />
            提交月份範圍（必填）
          </div>

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
              <select className="field" value={fromMonth} onChange={e => setFromMonth(e.target.value)}>
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
              <select className="field" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">全部表格</option>
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
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
            <SlidersHorizontal className="h-4 w-4" />
            在這個範圍內精修
            <span className="hint font-normal">（不影響取回的資料量）</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label mb-1">分類 module</label>
              <select
                className="field"
                value={moduleFilter}
                onChange={e => setModuleFilter(e.target.value)}
              >
                <option value="">全部</option>
                {moduleChoices.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1">動作 action</label>
              <select
                className="field"
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
              >
                <option value="">全部</option>
                {actionChoices.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1">狀態</label>
              <select
                className="field"
                value={status}
                onChange={e => setStatus(e.target.value as SubmissionStatus | 'ALL')}
              >
                <option value="ACTIVE">有效</option>
                <option value="VOID">已作廢</option>
                <option value="ALL">全部</option>
              </select>
            </div>

            <div>
              <label className="label mb-1">跨表 KEY</label>
              <select
                className="field"
                value={fieldKey}
                onChange={e => {
                  setFieldKey(e.target.value)
                  setFieldValue('')
                }}
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
              <label className="label mb-1">KEY 的值</label>
              <select
                className="field"
                value={fieldValue}
                disabled={!selectedKeyChoice}
                onChange={e => setFieldValue(e.target.value)}
              >
                <option value="">全部</option>
                {selectedKeyChoice?.values.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end gap-2 pb-1.5">
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
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <Spinner label="查詢中" />
      ) : blocked ? (
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <Filter className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h2 className="font-semibold">範圍太大，尚未取回資料</h2>
              <p className="mt-1 text-sm text-slate-600">
                {rangeLabel} 這個範圍符合 <strong>{blocked.count}</strong> 筆，超過單次顯示上限{' '}
                {blocked.limit} 筆。
              </p>
              <p className="mt-2 text-sm text-slate-500">
                請縮小月份範圍或指定表格後再查；若要取得全部資料，請按上方「完整匯出 CSV」。
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
      ) : rows.length === 0 ? (
        <EmptyState
          title="這個範圍沒有符合條件的資料"
          description="換個月份範圍或精修條件，或先去填一筆看看。"
          action={
            <Link href="/fill" className="btn-primary">
              去填報
            </Link>
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
                {rows.map(row => (
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
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            {rangeLabel} 共 {rows.length} 筆（完整）
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
            runQuery()
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
