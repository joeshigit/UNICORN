'use client'

/**
 * Phase 2 — Display imported Google Form structure (inspection only).
 * No mapping controls, Analyze, Push, or Prefill productization.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getGoogleFormConfig } from '@/lib/googleForms'
import type { GoogleFormConfig } from '@/types'

export default function AdminGoogleFormDetailPage() {
  const params = useParams()
  const formId = decodeURIComponent(String(params?.formId || ''))
  const [config, setConfig] = useState<GoogleFormConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!formId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const row = await getGoogleFormConfig(formId)
        if (!cancelled) {
          if (!row) setError('找不到此 googleFormConfigs 文件')
          setConfig(row)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '載入失敗')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [formId])

  if (loading) {
    return <p className="text-slate-400">載入中…</p>
  }

  if (error || !config) {
    return (
      <div className="space-y-4">
        <Link href="/admin/google-forms" className="text-amber-400 text-sm hover:underline">
          ← 返回列表
        </Link>
        <p className="text-red-300">{error || '無資料'}</p>
      </div>
    )
  }

  const mappings = config.questionMappings || []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/google-forms" className="text-amber-400 text-sm hover:underline">
            ← 返回列表
          </Link>
          <h1 className="text-2xl font-bold text-white mt-2">{config.title || '(無標題)'}</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Phase 2 結構檢視（唯讀）· 不修改 Google Form · 無對應操作
          </p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-slate-500">googleFormId</p>
            <p className="text-white font-mono break-all">{config.googleFormId}</p>
          </div>
          <div>
            <p className="text-slate-500">operationalStatus</p>
            <p className="text-amber-400">{config.operationalStatus}</p>
          </div>
          <div>
            <p className="text-slate-500">watch</p>
            <p className="text-white">{config.watch == null ? 'null' : JSON.stringify(config.watch)}</p>
          </div>
          <div>
            <p className="text-slate-500">watchHealth</p>
            <p className="text-white">{config.watchHealth}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-slate-500">responderUri</p>
            <p className="text-slate-300 break-all text-xs">{config.responderUri || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">題數</p>
            <p className="text-white">{mappings.length}</p>
          </div>
          <div>
            <p className="text-slate-500">updatedAt</p>
            <p className="text-slate-300">{config.updatedAt}</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">匯入的題目結構</h2>
          <p className="text-xs text-slate-500 mt-1">
            顯示 Google 真實結構快照：label、type、choices、required、itemId、questionId、mappingStatus
          </p>
        </div>
        {mappings.length === 0 ? (
          <p className="p-6 text-slate-500">沒有題目</p>
        ) : (
          <ol className="divide-y divide-slate-700">
            {mappings.map((q, index) => (
              <li key={`${q.itemId}-${q.questionId}`} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-slate-500 text-sm">#{index + 1}</span>
                  <span className="font-medium text-white">{q.googleLabel || '(無標籤)'}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {q.googleQuestionType}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      q.mappingStatus === 'UNMAPPED'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {q.mappingStatus}
                  </span>
                  {q.requiredOnGoogle && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300">
                      required
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400 font-mono">
                  <div>
                    <dt className="text-slate-600">itemId</dt>
                    <dd className="text-slate-300 break-all">{q.itemId}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">questionId</dt>
                    <dd className="text-slate-300 break-all">{q.questionId}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">unicornKey</dt>
                    <dd className="text-slate-300">{q.unicornKey === '' ? "'' (empty)" : q.unicornKey}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">requiredOnGoogle</dt>
                    <dd className="text-slate-300">{String(q.requiredOnGoogle)}</dd>
                  </div>
                </dl>
                {(q.optionMappings?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-1">choices (googleOptionLabel)</p>
                    <ul className="flex flex-wrap gap-2">
                      {q.optionMappings!.map((opt, i) => (
                        <li
                          key={`${q.itemId}-opt-${i}`}
                          className="text-xs px-2 py-1 rounded bg-slate-900 border border-slate-600 text-slate-300"
                        >
                          {opt.googleOptionLabel}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
