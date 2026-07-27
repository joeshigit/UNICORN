'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Download, Filter, RefreshCw } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusChip } from '@/components/ui'
import { SubmissionDetail } from '@/components/SubmissionDetail'
import { listOptionSets, listTemplates, querySubmissions, recentMonths, toDate } from '@/lib/db'
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
  const { email } = useAuth()

  const [templates, setTemplates] = useState<Template[]>([])
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Submission | null>(null)

  const [templateId, setTemplateId] = useState(params.get('form') || '')
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState<SubmissionStatus | 'ALL'>('ACTIVE')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldValue, setFieldValue] = useState('')
  const [includeSuperseded, setIncludeSuperseded] = useState(false)

  useEffect(() => {
    Promise.all([listTemplates(), listOptionSets()])
      .then(([t, o]) => {
        setTemplates(t)
        setOptionSets(o)
      })
      .catch(err => setError(err instanceof Error ? err.message : '載入失敗'))
  }, [])

  const runQuery = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(
        await querySubmissions({
          templateId: templateId || undefined,
          month: month || undefined,
          status,
          includeSuperseded,
          fieldKey: fieldKey || undefined,
          fieldValue: fieldKey && fieldValue ? fieldValue : undefined,
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [templateId, month, status, fieldKey, fieldValue, includeSuperseded])

  useEffect(() => {
    runQuery()
  }, [runQuery])

  const activeTemplate = templates.find(t => t.id === templateId) || null

  // 跨表查詢的 KEY 來自選項池 code：同一個 KEY 在所有表格代表同一件事
  const keyChoices = useMemo(() => {
    const byCode = new Map<string, OptionSet[]>()
    for (const set of optionSets) {
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
    // 混合多張表時，用出現過的 KEY 當欄位，LABEL 取第一次遇到的快照
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

  const handleExport = () => {
    const headers = ['提交時間', '表格', '版本', '狀態', ...columns.map(c => `${c.label} (${c.key})`)]
    const data = rows.map(row => [
      formatSubmittedAt(row),
      row._templateName,
      `v${row._templateVersion}`,
      row._status,
      ...columns.map(c => displayValue(row, c.key)),
    ])
    const name = activeTemplate ? activeTemplate.name : 'unicorn'
    downloadCsv(`${name}_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, data))
  }

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
            <button className="btn-primary" onClick={handleExport} disabled={rows.length === 0}>
              <Download className="h-4 w-4" />
              匯出 CSV
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

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

          <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-sm text-slate-600">
            <input
              type="checkbox"
              className="rounded text-unicorn-600 focus:ring-unicorn-500"
              checked={includeSuperseded}
              onChange={e => setIncludeSuperseded(e.target.checked)}
            />
            連被更正的舊版本一起看
          </label>
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
            共 {rows.length} 筆
          </div>
        </div>
      )}

      {selected && (
        <SubmissionDetail
          submission={selected}
          userEmail={email}
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
