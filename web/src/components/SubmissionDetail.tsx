'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Ban, Paperclip, Pencil, X } from 'lucide-react'
import { StatusChip } from '@/components/ui'
import { voidSubmission, toDate } from '@/lib/db'
import type { Actor } from '@/lib/db'
import { formatFileSize, openStoredFile } from '@/lib/storage'
import type { FileInfo, Submission } from '@/types'

interface SubmissionDetailProps {
  submission: Submission
  actor: Actor
  isSuperuser: boolean
  onClose: () => void
  onChanged: () => void
}

function renderValue(submission: Submission, key: string): string {
  const optionLabel = submission._optionLabels?.[key]
  if (optionLabel) return optionLabel
  const raw = submission[key]
  if (raw === undefined || raw === null || raw === '') return '—'
  if (Array.isArray(raw)) return raw.join('、')
  return String(raw)
}

function AuthFileLink({ file }: { file: FileInfo }) {
  const [busy, setBusy] = useState(false)
  const openedRef = useRef<{ url: string; revoke: () => void } | null>(null)

  useEffect(() => {
    return () => {
      openedRef.current?.revoke()
      openedRef.current = null
    }
  }, [])

  const open = async () => {
    if (openedRef.current) {
      window.open(openedRef.current.url, '_blank', 'noopener,noreferrer')
      return
    }
    setBusy(true)
    try {
      const opened = await openStoredFile(file.path)
      openedRef.current = opened
      window.open(opened.url, '_blank', 'noopener,noreferrer')
    } catch {
      alert('無法開啟檔案（可能沒有權限）')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
    >
      <Paperclip className="h-4 w-4 text-slate-400" />
      <span className="min-w-0 flex-1 truncate text-unicorn-700">
        {busy ? '開啟中…' : file.name}
      </span>
      <span className="hint">{formatFileSize(file.size)}</span>
    </button>
  )
}

export function SubmissionDetail({
  submission,
  actor,
  isSuperuser,
  onClose,
  onChanged,
}: SubmissionDetailProps) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const isOwner =
    !!actor.uid &&
    (submission._submitterUid === actor.uid ||
      submission._submitterEmail?.toLowerCase() === actor.email.toLowerCase())
  const canMutateChain = isOwner || isSuperuser
  const editable =
    canMutateChain && submission._isLatest === true && submission._status === 'ACTIVE'
  const submittedAt = toDate(submission._submittedAt)
  const fileFieldKeys = new Set((submission.files || []).map(f => f.fieldKey))

  const handleVoid = async () => {
    if (!confirm('作廢後這筆資料就不會出現在有效清單裡（原紀錄仍然保留）。確定嗎？')) return
    setWorking(true)
    setError('')
    try {
      await voidSubmission(submission, actor)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '作廢失敗')
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="font-semibold">{submission._templateName}</h2>
            <p className="hint mt-0.5">
              v{submission._templateVersion} · {submission._templateModule} ·{' '}
              {submission._templateAction}
              {submission._eventType ? ` · ${submission._eventType}` : ''}
            </p>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <StatusChip status={submission._status} />
            {submission._eventKind && (
              <span className="chip bg-slate-100 text-slate-600">{submission._eventKind}</span>
            )}
            {!submission._isLatest && (
              <span className="chip bg-amber-50 text-amber-700">已被更正</span>
            )}
            <span>{submittedAt ? submittedAt.toLocaleString('zh-TW') : ''}</span>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <p>擁有者：{submission._submitterEmail}</p>
            {submission._actorEmail && submission._actorEmail !== submission._submitterEmail && (
              <p>操作者：{submission._actorEmail}</p>
            )}
          </div>

          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {(submission._fieldKeys || []).map(key => (
              <div key={key} className="grid grid-cols-3 gap-3 px-4 py-3">
                <dt className="col-span-1">
                  <span className="block text-sm text-slate-600">
                    {submission._fieldLabels?.[key] || key}
                  </span>
                  <span className="key-chip mt-1">{key}</span>
                </dt>
                <dd className="col-span-2 whitespace-pre-wrap break-words text-sm">
                  {fileFieldKeys.has(key)
                    ? `${(submission.files || []).filter(f => f.fieldKey === key).length} 個檔案`
                    : renderValue(submission, key)}
                </dd>
              </div>
            ))}
          </dl>

          {(submission.files || []).length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">檔案</h3>
              <div className="space-y-2">
                {submission.files.map(file => (
                  <AuthFileLink key={file.path} file={file} />
                ))}
              </div>
            </div>
          )}

          {(submission._supersedes || submission._supersededBy) && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              {submission._supersedes && <p>更正自：{submission._supersedes}</p>}
              {submission._supersededBy && <p>已被取代為：{submission._supersededBy}</p>}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {editable && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link
                href={`/submit?form=${submission._templateId}&correct=${submission.id}`}
                className="btn-secondary"
              >
                <Pencil className="h-4 w-4" />
                更正
              </Link>
              <button className="btn-danger" onClick={handleVoid} disabled={working}>
                <Ban className="h-4 w-4" />
                {working ? '處理中…' : '作廢'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
