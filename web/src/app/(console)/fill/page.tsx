'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { listTemplates } from '@/lib/db'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import type { Template } from '@/types'

export default function FillCenterPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    listTemplates()
      .then(all => setTemplates(all.filter(t => t.enabled)))
      .catch(err => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const filtered = kw
      ? templates.filter(t =>
          [t.name, t.description, t.moduleId, t.actionId]
            .filter(Boolean)
            .some(text => String(text).toLowerCase().includes(kw))
        )
      : templates

    const byModule = new Map<string, Template[]>()
    for (const template of filtered) {
      const list = byModule.get(template.moduleId) || []
      list.push(template)
      byModule.set(template.moduleId, list)
    }
    return Array.from(byModule.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [templates, keyword])

  return (
    <>
      <PageHeader title="填報" description="選一張表格開始填寫" />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label="載入表格中" />
      ) : templates.length === 0 ? (
        <EmptyState
          title="還沒有啟用中的表格"
          description="先到「表格」建立一張表，發佈後就會出現在這裡。"
          action={
            <Link href="/forms/edit" className="btn-primary">
              建立第一張表格
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="field pl-9"
              placeholder="搜尋表格名稱、分類…"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>

          {groups.length === 0 && <EmptyState title="找不到符合的表格" />}

          {groups.map(([moduleId, list]) => (
            <section key={moduleId}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {moduleId}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map(template => (
                  <Link
                    key={template.id}
                    href={`/submit?form=${template.id}`}
                    className="card group p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold group-hover:text-unicorn-700">{template.name}</h3>
                      <span className="chip shrink-0 bg-slate-100 text-slate-500">
                        v{template.version}
                      </span>
                    </div>
                    {template.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {template.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="key-chip">{template.moduleId}</span>
                      <span className="key-chip">{template.actionId}</span>
                      <span className="chip bg-slate-100 text-slate-500">
                        {template.fields.length} 個欄位
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
