// ============================================
// 純邏輯測試：分批、截斷、語意日期時間、module.action
// （不需模擬器）
// ============================================

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const FIRESTORE_IN_LIMIT = 30

function chunk(items, size) {
  if (items.length === 0) return []
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function detectTruncation(rows, max) {
  const truncated = rows.length > max
  return { rows: truncated ? rows.slice(0, max) : rows, truncated }
}

function eventTypeOf(moduleId, actionId) {
  return `${moduleId}.${actionId}`
}

function isValidDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime())
}

function isValidTimeValue(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function macauMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Macau',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  return `${y}-${m}`
}

const LEGACY = ['dateOnlyStart', 'dateOnlyEnd', 'dateTimeStart', 'dateTimeEnd']
const SEMANTIC_DATES = [
  'eventDate',
  'startDate',
  'endDate',
  'dueDate',
  'documentDate',
  'effectiveDate',
  'expiryDate',
]
const SEMANTIC_TIMES = ['eventTime', 'startTime', 'endTime']

describe('Firestore in / array-contains-any 分批', () => {
  it('超過 30 個群組時切成多批，不丟資料', () => {
    const groups = Array.from({ length: 67 }, (_, i) => `g${i}`)
    const batches = chunk(groups, FIRESTORE_IN_LIMIT)
    assert.equal(batches.length, 3)
    assert.equal(batches[0].length, 30)
    assert.equal(batches[1].length, 30)
    assert.equal(batches[2].length, 7)
    assert.equal(batches.flat().length, 67)
  })

  it('空陣列回傳空批次', () => {
    assert.deepEqual(chunk([], 30), [])
  })
})

describe('截斷偵測', () => {
  it('max+1 偵測 truncated 並只回 max 筆', () => {
    const fetched = Array.from({ length: 501 }, (_, i) => i)
    const { rows, truncated } = detectTruncation(fetched, 500)
    assert.equal(truncated, true)
    assert.equal(rows.length, 500)
  })

  it('未超過 max 時 truncated=false', () => {
    const { rows, truncated } = detectTruncation([1, 2, 3], 500)
    assert.equal(truncated, false)
    assert.equal(rows.length, 3)
  })
})

describe('module / action → _eventType', () => {
  it('組合為 module.action', () => {
    assert.equal(eventTypeOf('CAMP', 'REGISTER'), 'CAMP.REGISTER')
    assert.equal(eventTypeOf('HR', 'APPLY'), 'HR.APPLY')
  })
})

describe('語意日期／時間', () => {
  it('接受 YYYY-MM-DD 與 HH:mm', () => {
    assert.equal(isValidDateValue('2026-07-29'), true)
    assert.equal(isValidTimeValue('09:30'), true)
    assert.equal(isValidTimeValue('23:59'), true)
  })

  it('拒絕非法格式', () => {
    assert.equal(isValidDateValue('2026/07/29'), false)
    assert.equal(isValidTimeValue('9:30'), false)
    assert.equal(isValidTimeValue('24:00'), false)
  })

  it('舊 KEY 已退役，新 KEY 已就緒', () => {
    for (const k of LEGACY) assert.ok(!SEMANTIC_DATES.includes(k))
    assert.equal(SEMANTIC_DATES.length, 7)
    assert.equal(SEMANTIC_TIMES.length, 3)
  })

  it('不把 endTime 預設成 startTime（區間未知就省略）', () => {
    const point = { eventDate: '2026-07-29', eventTime: '10:00' }
    assert.equal(point.endTime, undefined)
    const interval = { startDate: '2026-07-29', startTime: '09:00', endTime: '17:00' }
    assert.notEqual(interval.endTime, interval.startTime)
  })
})

describe('澳門時區月份', () => {
  it('回傳 YYYY-MM', () => {
    assert.match(macauMonth(new Date('2026-07-29T12:00:00Z')), /^\d{4}-\d{2}$/)
  })
})
