'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, PenSquare, Plus, Trash2 } from 'lucide-react'
import { SuperuserGuard } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import {
  countSubmissionsForTemplate,
  deleteTemplate,
  listTemplates,
  setTemplateEnabled,
} from '@/lib/db'
import type { Template } from '@/types'

function FormsPageInner() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setTemplates(await listTemplates())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggle = async (template: Template) => {
    await setTemplateEnabled(template.id!, !template.enabled)
    load()
  }

  const handleDelete = async (template: Template) => {
    try {
      const used = await countSubmissionsForTemplate(template.id!)
      if (used > 0) {
        alert(`這張表格已經有 ${used} 筆資料，不能刪除。建議改成「停用」。`)
        return
      }
      if (!confirm(`確定刪除「${template.name}」？`)) return
      await deleteTemplate(template.id!)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  return (
    <>
      <PageHeader
        title="表格"
        description="建立表格＝挑 Universal KEY、取顯示名稱。表格是資料，不是程式碼。"
        actions={
          <a href="/forms/edit/" className="btn-primary">
            <Plus className="h-4 w-4" />
            建立表格
          </a>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label="載入中" />
      ) : templates.length === 0 ? (
        <EmptyState
          title="還沒有任何表格"
          description="先建一張表，把要收集的欄位挑好，就可以開始填報。"
          action={
            <a href="/forms/edit/" className="btn-primary">
              建立第一張表格
            </a>
          }
        />
      ) : (
        <div className="space-y-3">
          {templates.map(template => (
            <div key={template.id} className="card flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{template.name}</h3>
                  <span className="chip bg-slate-100 text-slate-500">v{template.version}</span>
                  {!template.enabled && (
                    <span className="chip bg-amber-50 text-amber-700">停用中</span>
                  )}
                </div>
                {template.description && (
                  <p className="mt-1 truncate text-sm text-slate-500">{template.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="key-chip">{template.moduleId}</span>
                  <span className="key-chip">{template.actionId}</span>
                  <span className="chip bg-slate-100 text-slate-500">
                    {template.fields.length} 個欄位
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded text-unicorn-600 focus:ring-unicorn-500"
                    checked={template.enabled}
                    onChange={() => handleToggle(template)}
                  />
                  啟用
                </label>
                <Link href={`/submit?form=${template.id}`} className="btn-secondary btn-sm">
                  填寫
                </Link>
                <a href={`/forms/edit/?id=${template.id}`} className="btn-ghost btn-sm">
                  <PenSquare className="h-4 w-4" />
                  編輯
                </a>
                <a href={`/forms/edit/?copy=${template.id}`} className="btn-ghost btn-sm">
                  <Copy className="h-4 w-4" />
                  複製
                </a>
                <button className="btn-ghost btn-sm text-red-500" onClick={() => handleDelete(template)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}


export default function FormsPage() {
  return (
    <SuperuserGuard>
      <FormsPageInner />
    </SuperuserGuard>
  )
}
