'use client'

import { useRef, useState } from 'react'
import { Paperclip, Upload, X } from 'lucide-react'
import { formatFileSize, removeFile, uploadFile } from '@/lib/storage'
import type { FileInfo } from '@/types'

interface FileUploaderProps {
  value: FileInfo[]
  onChange: (files: FileInfo[]) => void
  fieldKey: string
  submissionId: string
  userEmail: string
  error?: boolean
  maxFiles?: number
}

export function FileUploader({
  value,
  onChange,
  fieldKey,
  submissionId,
  userEmail,
  error,
  maxFiles = 10,
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    if (value.length + selected.length > maxFiles) {
      setUploadError(`最多 ${maxFiles} 個檔案`)
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const uploaded: FileInfo[] = []
      for (const file of selected) {
        uploaded.push(await uploadFile(file, fieldKey, submissionId, userEmail))
      }
      onChange([...value, ...uploaded])
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
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-unicorn-700 hover:underline"
          >
            {file.name}
          </a>
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

      <input ref={inputRef} type="file" multiple hidden onChange={handleSelect} />
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
    </div>
  )
}
