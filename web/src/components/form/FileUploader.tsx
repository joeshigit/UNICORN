'use client'

import { useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, X } from 'lucide-react'
import {
  createAuthorizedObjectUrl,
  formatFileSize,
  removeFile,
  uploadFile,
} from '@/lib/storage'
import { CaptureButtons } from './CaptureButtons'
import type { Actor } from '@/lib/db'
import type { FileInfo } from '@/types'

interface FileUploaderProps {
  value: FileInfo[]
  onChange: (files: FileInfo[]) => void
  fieldKey: string
  submissionId: string
  actor: Actor
  error?: boolean
  maxFiles?: number
}

function FileLink({ file }: { file: FileInfo }) {
  const [href, setHref] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return () => {
      if (href) URL.revokeObjectURL(href)
    }
  }, [href])

  const open = async () => {
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    setBusy(true)
    try {
      const url = await createAuthorizedObjectUrl(file.path)
      setHref(url)
      window.open(url, '_blank', 'noopener,noreferrer')
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
      className="min-w-0 flex-1 truncate text-left text-sm text-unicorn-700 hover:underline disabled:opacity-60"
    >
      {busy ? '開啟中…' : file.name}
    </button>
  )
}

export function FileUploader({
  value,
  onChange,
  fieldKey,
  submissionId,
  actor,
  error,
  maxFiles = 10,
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 上傳與擷取都是非同步的，期間父層可能因為別的欄位而重繪。
  // 用 ref 讀最新的清單，避免用到點擊當下捕獲的舊 value 把其他上傳蓋掉。
  const valueRef = useRef(value)
  valueRef.current = value

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    if (valueRef.current.length + selected.length > maxFiles) {
      setUploadError(`最多 ${maxFiles} 個檔案`)
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const uploaded: FileInfo[] = []
      for (const file of selected) {
        uploaded.push(await uploadFile(file, fieldKey, submissionId, actor))
      }
      onChange([...valueRef.current, ...uploaded])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上傳失敗')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (index: number) => {
    const target = value[index]
    onChange(value.filter((_, i) => i !== index))
    await removeFile(target.path)
  }

  return (
    <div className="space-y-2">
      {value.map((file, index) => (
        <div
          key={file.path}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
        >
          <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
          <FileLink file={file} />
          <span className="hint shrink-0">{formatFileSize(file.size)}</span>
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="text-slate-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {value.length < maxFiles && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5
            text-sm transition-colors disabled:opacity-60 ${
              error
                ? 'border-red-300 bg-red-50 text-red-500'
                : 'border-slate-300 text-slate-500 hover:border-unicorn-400 hover:bg-unicorn-50'
            }`}
        >
          <Upload className="h-4 w-4" />
          {uploading ? '上傳中…' : '選擇檔案上傳'}
        </button>
      )}

      {value.length < maxFiles && (
        <CaptureButtons
          fieldKey={fieldKey}
          submissionId={submissionId}
          actor={actor}
          onUploaded={file => onChange([...valueRef.current, file])}
          onError={setUploadError}
          disabled={uploading}
        />
      )}

      <input ref={inputRef} type="file" multiple hidden onChange={handleSelect} />
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
    </div>
  )
}
