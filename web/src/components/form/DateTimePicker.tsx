'use client'

// 值的格式固定為 YYYY-MM-DDTHH:mm，可直接用字串比較排序
interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  error?: boolean
}

export function DateTimePicker({ value, onChange, error }: DateTimePickerProps) {
  const [date = '', time = ''] = (value || '').split('T')
  const cls = `field ${error ? 'field-error' : ''}`

  const emit = (nextDate: string, nextTime: string) => {
    if (!nextDate) return onChange('')
    onChange(`${nextDate}T${nextTime || '00:00'}`)
  }

  return (
    <div className="flex gap-2">
      <input
        type="date"
        className={cls}
        value={date}
        onChange={e => emit(e.target.value, time)}
      />
      <input
        type="time"
        className={`${cls} max-w-[9rem]`}
        value={time}
        onChange={e => emit(date, e.target.value)}
      />
    </div>
  )
}

export function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  return value.replace('T', ' ')
}
