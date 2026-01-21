'use client'

import { useState, useEffect } from 'react'

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  error?: boolean
  className?: string
}

// 分鐘選項（10 分鐘間隔）
const MINUTES = ['00', '10', '20', '30', '40', '50']

// 小時選項（12 小時制）
const HOURS = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']

export function DateTimePicker({ value, onChange, error, className }: DateTimePickerProps) {
  // 解析初始值
  const parseValue = (val: string) => {
    if (!val) {
      return { date: '', hour: '09', minute: '00', period: 'AM' }
    }
    
    try {
      // 預期格式：2025-12-31T09:30 或 2025-12-31T21:30
      const [datePart, timePart] = val.split('T')
      if (!timePart) {
        return { date: datePart || '', hour: '09', minute: '00', period: 'AM' }
      }
      
      const [hourStr, minuteStr] = timePart.split(':')
      let hour24 = parseInt(hourStr, 10)
      const minute = minuteStr || '00'
      
      // 轉換為 12 小時制
      let period = 'AM'
      let hour12 = hour24
      
      if (hour24 === 0) {
        hour12 = 12
        period = 'AM'
      } else if (hour24 === 12) {
        hour12 = 12
        period = 'PM'
      } else if (hour24 > 12) {
        hour12 = hour24 - 12
        period = 'PM'
      } else {
        period = 'AM'
      }
      
      return {
        date: datePart,
        hour: hour12.toString().padStart(2, '0'),
        minute: MINUTES.includes(minute) ? minute : '00',
        period
      }
    } catch {
      return { date: '', hour: '09', minute: '00', period: 'AM' }
    }
  }

  const initial = parseValue(value)
  const [date, setDate] = useState(initial.date)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [period, setPeriod] = useState(initial.period)

  // 當任何值改變時，更新外部值
  useEffect(() => {
    if (!date) {
      onChange('')
      return
    }
    
    // 轉換為 24 小時制
    let hour24 = parseInt(hour, 10)
    
    if (period === 'AM') {
      if (hour24 === 12) hour24 = 0
    } else {
      if (hour24 !== 12) hour24 += 12
    }
    
    const timeStr = `${hour24.toString().padStart(2, '0')}:${minute}`
    onChange(`${date}T${timeStr}`)
  }, [date, hour, minute, period])

  const baseSelectClass = `px-2 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${
    error ? 'border-red-300 bg-red-50' : 'border-gray-300'
  }`

  return (
    <div className={`flex flex-wrap gap-2 items-center ${className || ''}`}>
      {/* 日期選擇 */}
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className={`flex-1 min-w-[140px] px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-300 bg-red-50' : 'border-gray-300'
        }`}
      />
      
      {/* 時間選擇 */}
      <div className="flex items-center gap-1">
        {/* 小時 */}
        <select
          value={hour}
          onChange={e => setHour(e.target.value)}
          className={baseSelectClass}
        >
          {HOURS.map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        
        <span className="text-gray-500 font-medium">:</span>
        
        {/* 分鐘 */}
        <select
          value={minute}
          onChange={e => setMinute(e.target.value)}
          className={baseSelectClass}
        >
          {MINUTES.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        
        {/* AM/PM */}
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className={baseSelectClass}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  )
}

// 格式化顯示函數（給其他地方用）
export function formatDateTime(value: string): string {
  if (!value) return '-'
  
  try {
    const [datePart, timePart] = value.split('T')
    if (!timePart) return datePart
    
    const [hourStr, minuteStr] = timePart.split(':')
    let hour24 = parseInt(hourStr, 10)
    const minute = minuteStr || '00'
    
    let period = 'AM'
    let hour12 = hour24
    
    if (hour24 === 0) {
      hour12 = 12
      period = 'AM'
    } else if (hour24 === 12) {
      hour12 = 12
      period = 'PM'
    } else if (hour24 > 12) {
      hour12 = hour24 - 12
      period = 'PM'
    }
    
    return `${datePart} ${hour12.toString().padStart(2, '0')}:${minute} ${period}`
  } catch {
    return value
  }
}







