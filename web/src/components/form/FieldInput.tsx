'use client'

import { DateTimePicker } from './DateTimePicker'
import { FileUploader } from './FileUploader'
import type { Actor } from '@/lib/db'
import type { FieldDefinition, FileInfo, OptionItem } from '@/types'

interface FieldInputProps {
  field: FieldDefinition
  value: unknown
  onChange: (value: unknown) => void
  options: OptionItem[]
  error?: string
  submissionId: string
  actor: Actor
  /** locked 欄位：留在原本的位置但不能改 */
  disabled?: boolean
}

export function FieldInput({
  field,
  value,
  onChange,
  options,
  error,
  submissionId,
  actor,
  disabled,
}: FieldInputProps) {
  const cls = `field ${error ? 'field-error' : ''}`
  const placeholder = field.helpText || `輸入${field.label}`

  switch (field.type) {
    case 'number':
      return (
        <input
          type="number"
          className={cls}
          disabled={disabled}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      )

    case 'textarea':
      return (
        <textarea
          className={cls}
          rows={4}
          disabled={disabled}
          value={(value as string) || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )

    case 'date':
      return (
        <input
          type="date"
          className={cls}
          disabled={disabled}
          value={(value as string) || ''}
          onChange={e => onChange(e.target.value)}
        />
      )

    case 'time':
      return (
        <input
          type="time"
          className={cls}
          disabled={disabled}
          value={(value as string) || ''}
          onChange={e => onChange(e.target.value)}
        />
      )

    case 'datetime':
      return (
        <DateTimePicker
          value={(value as string) || ''}
          onChange={onChange}
          error={!!error}
          disabled={disabled}
        />
      )

    case 'file':
      // 檔案欄位不允許 locked（無法預先塞一個檔案），所以不需要處理 disabled
      return (
        <FileUploader
          value={Array.isArray(value) ? (value as FileInfo[]) : []}
          onChange={onChange}
          fieldKey={field.key}
          submissionId={submissionId}
          actor={actor}
          error={!!error}
        />
      )

    case 'dropdown': {
      const active = options.filter(o => o.status !== 'deprecated')

      if (field.multiple) {
        const selected = Array.isArray(value) ? (value as string[]) : []
        return (
          <div
            className={`max-h-52 space-y-1 overflow-y-auto rounded-xl border p-2 ${
              error
                ? 'border-red-300 bg-red-50'
                : disabled
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-slate-300 bg-white'
            }`}
          >
            {active.length === 0 && <p className="hint px-1 py-2">這個選項池還沒有選項</p>}
            {active.map(option => (
              <label
                key={option.value}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                  disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="rounded text-unicorn-600 focus:ring-unicorn-500"
                  disabled={disabled}
                  checked={selected.includes(option.value)}
                  onChange={e =>
                    onChange(
                      e.target.checked
                        ? [...selected, option.value]
                        : selected.filter(v => v !== option.value)
                    )
                  }
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        )
      }

      return (
        <select
          className={cls}
          disabled={disabled}
          value={(value as string) || ''}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">請選擇…</option>
          {active.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    default:
      return (
        <input
          type="text"
          className={cls}
          disabled={disabled}
          value={(value as string) || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )
  }
}
