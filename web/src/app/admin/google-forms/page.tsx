'use client'

/**
 * Phase 2 — Connect existing Google Form + list connected configs.
 * Display/inspection only. No mapping UI.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { connectGoogleForm, listGoogleFormConfigs } from '@/lib/googleForms'
import type { GoogleFormConfig } from '@/types'

export default function AdminGoogleFormsPage() {
  const [configs, setConfigs] = useState<GoogleFormConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [formIdOrUrl, setFormIdOrUrl] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const rows = await listGoogleFormConfigs()
      setConfigs(rows)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setConnecting(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await connectGoogleForm(formIdOrUrl.trim())
      setSuccess(
        `已連線：${result.config.title || result.googleFormId}（${result.questionCount} 題）`
      )
      setFormIdOrUrl('')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '連線失敗')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Google Forms 連線</h1>
        <p className="text-slate-400 mt-1">
          Phase 2：連線既有 Google Form，並檢視匯入的結構（唯讀顯示，無對應操作）
        </p>
      </div>

      <form
        onSubmit={handleConnect}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4"
      >
        <label className="block">
          <span className="text-sm text-slate-300">Google Form URL 或 Form ID</span>
          <input
            type="text"
            value={formIdOrUrl}
            onChange={(e) => setFormIdOrUrl(e.target.value)}
            placeholder="https://docs.google.com/forms/d/.../edit 或 API Form ID"
            className="mt-2 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            required
          />
        </label>
        <p className="text-xs text-slate-500">
          請使用 edit URL 的 Form ID。公開 /d/e/ 網址可能無法對應 API Form ID（Phase 1 已知限制）。
        </p>
        <button
          type="submit"
          disabled={connecting || !formIdOrUrl.trim()}
          className="px-4 py-2 rounded-lg bg-amber-500 text-slate-900 font-medium hover:bg-amber-400 disabled:opacity-50"
        >
          {connecting ? '連線中…' : '連線 Google Form'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-300 text-sm">
          {success}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">已連線表單</h2>
          <button
            type="button"
            onClick={load}
            className="text-sm text-slate-400 hover:text-white"
          >
            重新整理
          </button>
        </div>
        {loading ? (
          <p className="p-6 text-slate-400">載入中…</p>
        ) : configs.length === 0 ? (
          <p className="p-6 text-slate-500">尚無連線記錄。請先連線一張 Google Form。</p>
        ) : (
          <ul className="divide-y divide-slate-700">
            {configs.map((c) => (
              <li key={c.googleFormId}>
                <Link
                  href={`/admin/google-forms/${encodeURIComponent(c.googleFormId)}`}
                  className="block px-6 py-4 hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">
                        {c.title || '(無標題)'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 font-mono break-all">
                        {c.googleFormId}
                      </p>
                      <p className="text-sm text-slate-400 mt-2">
                        {c.questionMappings?.length ?? 0} 題 ·{' '}
                        <span className="text-amber-400">{c.operationalStatus}</span>
                        {' · '}
                        watch={c.watch == null ? 'null' : 'set'}
                      </p>
                    </div>
                    <span className="text-amber-400 text-sm shrink-0">檢視結構 →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
