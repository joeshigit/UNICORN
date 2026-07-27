'use client'

import { DateTimePicker } from './DateTimePicker'
import { FileUploader } from './FileUploader'
import type { FieldDefinition, FileInfo, OptionItem } from '@/types'

interface FieldInputProps {
  field: FieldDefinition
  value: unknown
  onChange: (value: unknown) => void
  options: OptionItem[]
  error?: string
  submissionId: string
  userEmail: string
}

export function FieldInput({
  field,
  value,
  onChange,
  options,
  error,
  submissionId,
  userEmail,
}: FieldInputProps) {
  const cls = `field ${error ? 'field-error' : ''}`
  const placeholder = field.helpText || `輸入${field.label}`

  switch (field.type) {
    case 'number':
      return (
        <input
          type="number"
          className={cls}
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
        />
      )

    case 'file':
      return (
        <FileUploader
          value={Array.isArray(value) ? (value as FileInfo[]) : []}
          onChange={onChange}
          fieldKey={field.key}
          submissionId={submissionId}
          userEmail={userEmail}
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
              error ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
            }`}
          >
            {active.length === 0 && <p className="hint px-1 py-2">這個選項池還沒有選項</p>}
            {active.map(option => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="rounded text-unicorn-600 focus:ring-unicorn-500"
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
        <select className={cls} value={(value as string) || ''} onChange={e => onChange(e.target.value)}>
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
          value={(value as string) || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )
  }
}
