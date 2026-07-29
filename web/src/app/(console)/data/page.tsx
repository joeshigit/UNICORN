'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Download, Filter, RefreshCw } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusChip } from '@/components/ui'
import { SubmissionDetail } from '@/components/SubmissionDetail'
import {
  exportAllSubmissions,
  listOptionSets,
  listTemplates,
  querySubmissions,
  recentMonths,
  toDate,
} from '@/lib/db'
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

function DataPool() {
  const params = useSearchParams()
  const { email, uid, isSuperuser } = useAuth()

  const [templates, setTemplates] = useState<Template[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [rows, setRows] = useState<Submission[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Submission | null>(null)

  const [templateId, setTemplateId] = useState(params.get('form') || '')
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState<SubmissionStatus | 'ALL'>('ACTIVE')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldValue, setFieldValue] = useState('')
  const [includeSuperseded, setIncludeSuperseded] = useState(false)
  const [withDerived, setWithDerived] = useState(false)

  useEffect(() => {
    Promise.all([listTemplates(), listOptionSets()])
      .then(([t, o]) => {
        setTemplates(t)
        setOptionSets(o)
      })
      .catch(err => setError(err instanceof Error ? err.message : '載入失敗'))
  }, [])

  const queryInput = useMemo(
    () => ({
      templateId: templateId || undefined,
      month: month || undefined,
      status,
      includeSuperseded,
      module: moduleFilter || undefined,
      action: actionFilter || undefined,
      fieldKey: fieldKey || undefined,
      fieldValue: fieldKey && fieldValue ? fieldValue : undefined,
    }),
    [templateId, month, status, includeSuperseded, moduleFilter, actionFilter, fieldKey, fieldValue]
  )

  const runQuery = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await querySubmissions(queryInput, email, isSuperuser)
      setRows(result.rows)
      setTruncated(result.truncated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [queryInput, email, isSuperuser])

  useEffect(() => {
    runQuery()
  }, [runQuery])

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
    downloadCsv(`${name}_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, data))
  }

  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      const all = truncated
        ? await exportAllSubmissions(queryInput, email, isSuperuser)
        : rows
      buildCsv(all)
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const actor = useMemo(() => ({ uid, email }), [uid, email])

  return (
    <>
      <PageHeader
        title="資料池"
        description="所有表格的提交都在同一個 submissions 池，用 Universal KEY 跨表查詢"
        actions={
          <>
            <button className="btn-secondary" onClick={runQuery}>
              <RefreshCw className="h-4 w-4" />
              重新查詢
            </button>
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={rows.length === 0 || exporting}
            >
              <Download className="h-4 w-4" />
              {exporting ? '匯出中…' : truncated ? '完整匯出 CSV' : '匯出 CSV'}
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}
      {truncated && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          畫面只顯示前 {rows.length} 筆（已達上限）。請縮小篩選，或按「完整匯出 CSV」取得全部資料。
        </div>
      )}

      <div className="card mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
          <Filter className="h-4 w-4" />
          篩選
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <label className="label mb-1">月份</label>
            <select className="field" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="">全部月份</option>
              {recentMonths().map(m => (
                <option key={m} value={m}>
                  {m}
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

      {loading ? (
        <Spinner label="查詢中" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="沒有符合條件的資料"
          description="換個篩選條件，或先去填一筆看看。"
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
            共 {rows.length} 筆{truncated ? '（已截斷）' : ''}
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
