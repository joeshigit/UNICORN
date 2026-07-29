'use client'

import { useState } from 'react'
import { Camera, ClipboardPaste } from 'lucide-react'
import { openBillPaste, openDocumentScanner } from '@/lib/capture'
import { uploadFile } from '@/lib/storage'
import type { Actor } from '@/lib/db'
import type { FileInfo } from '@/types'

interface CaptureButtonsProps {
  fieldKey: string
  submissionId: string
  actor: Actor
  onUploaded: (file: FileInfo) => void
  onError: (message: string) => void
  disabled?: boolean
}

function pdfName(prefix: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${prefix}_${stamp}.pdf`
}

export function CaptureButtons({
  fieldKey,
  submissionId,
  actor,
  onUploaded,
  onError,
  disabled,
}: CaptureButtonsProps) {
  const [busy, setBusy] = useState(false)

  const run = async (
    launch: (onMessage: (message: string) => void) => Promise<Blob | null>,
    prefix: string
  ) => {
    setBusy(true)
    try {
      const blob = await launch(onError)
      if (!blob) return
      const file = new File([blob], pdfName(prefix), { type: 'application/pdf' })
      onUploaded(await uploadFile(file, fieldKey, submissionId, actor))
    } catch (err) {
      onError(err instanceof Error ? err.message : '擷取失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={busy || disabled}
        onClick={() => run(openDocumentScanner, '掃描')}
      >
        <Camera className="h-4 w-4" />
        掃描文件
      </button>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={busy || disabled}
        onClick={() => run(openBillPaste, '截圖')}
      >
        <ClipboardPaste className="h-4 w-4" />
        螢幕截圖拼貼
      </button>
    </div>
  )
}
