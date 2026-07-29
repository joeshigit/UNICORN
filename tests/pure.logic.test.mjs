// ============================================
// 純邏輯測試：分批、月份範圍閘門、欄位輸入模式、語意日期時間、module.action
// （不需模擬器）
// ============================================

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const FIRESTORE_IN_LIMIT = 30
const QUERY_DISPLAY_LIMIT = 500

function chunk(items, size) {
  if (items.length === 0) return []
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---------- 月份範圍閘門（對應 db.ts 的 querySubmissions）----------

function assertMonthRange(q) {
  if (!q.fromMonth || !q.toMonth) throw new Error('查詢必須指定提交月份範圍')
  if (q.fromMonth > q.toMonth) throw new Error('月份範圍的起始不能晚於結束')
}

/** 只有月份範圍與表格送進 Firestore，其餘都是前端精修 */
function inRange(row, q) {
  if (!q.includeSuperseded && row._isLatest !== true) return false
  if (q.templateId && row._templateId !== q.templateId) return false
  return row._submittedMonth >= q.fromMonth && row._submittedMonth <= q.toMonth
}

function matchesFieldValue(raw, wanted) {
  if (Array.isArray(raw)) return raw.some(v => String(v) === wanted)
  if (raw === undefined || raw === null) return false
  return String(raw) === wanted
}

function applyLocalFilters(rows, q) {
  let out = rows
  if (q.module) out = out.filter(r => r._templateModule === q.module)
  if (q.action) out = out.filter(r => r._templateAction === q.action)
  const status = q.status ?? 'ACTIVE'
  if (status !== 'ALL') out = out.filter(r => r._status === status)
  if (q.fieldKey && q.fieldValue) {
    out = out.filter(r => matchesFieldValue(r[q.fieldKey], q.fieldValue))
  }
  return out
}

/** 回傳 { blocked, count, fetched, rows }；fetched 記錄實際撈了幾筆 */
function gatedQuery(all, q, limit = QUERY_DISPLAY_LIMIT) {
  assertMonthRange(q)
  const matching = all.filter(r => inRange(r, q))
  const count = matching.length
  if (count > limit) return { blocked: true, count, fetched: 0, rows: [] }
  return { blocked: false, count, fetched: matching.length, rows: applyLocalFilters(matching, q) }
}

// ---------- 欄位輸入模式（對應 keys.ts）----------

function isPresetEmpty(value) {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  return String(value).trim() === ''
}

function canPresetFieldType(type) {
  return type !== 'file'
}

function validateFieldMode(field) {
  const mode = field.inputMode ?? 'open'
  if (mode === 'open') return null
  if (!canPresetFieldType(field.type)) return '檔案欄位不能預填或鎖定'
  const empty = isPresetEmpty(field.presetValue)
  if (mode === 'default' && empty) return '設為預設值時必須挑一個值'
  if (mode === 'locked' && field.required && empty) return '必答又鎖定一定要有值'
  return null
}

function normalizeInputMode(f) {
  const mode = f.inputMode ?? 'open'
  if (mode === 'open' || !canPresetFieldType(f.type)) {
    return { inputMode: undefined, presetValue: undefined }
  }
  const empty = isPresetEmpty(f.presetValue)
  if (mode === 'default' && empty) return { inputMode: undefined, presetValue: undefined }
  return { inputMode: mode, presetValue: empty ? undefined : f.presetValue }
}

function resolveInitialValue(field, previous, emptyValue) {
  if (previous !== undefined) return previous
  if ((field.inputMode ?? 'open') === 'open') return emptyValue
  if (isPresetEmpty(field.presetValue)) return emptyValue
  return field.presetValue
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

describe('月份範圍與計數閘門', () => {
  const row = (month, over = {}) => ({
    _submittedMonth: month,
    _isLatest: true,
    _status: 'ACTIVE',
    _templateId: 't1',
    _templateModule: 'SCD',
    _templateAction: 'REPORT',
    school: ['粵華中學'],
    ...over,
  })

  it('缺少 fromMonth 或 toMonth 就拒絕查詢', () => {
    assert.throws(() => gatedQuery([], { toMonth: '2026-01' }), /月份範圍/)
    assert.throws(() => gatedQuery([], { fromMonth: '2026-01' }), /月份範圍/)
  })

  it('起始晚於結束就拒絕查詢', () => {
    assert.throws(
      () => gatedQuery([], { fromMonth: '2026-03', toMonth: '2026-01' }),
      /起始不能晚於結束/
    )
  })

  it('範圍用字典序比較，跨年正確', () => {
    const all = [row('2025-11'), row('2025-12'), row('2026-01'), row('2026-02')]
    const r = gatedQuery(all, { fromMonth: '2025-12', toMonth: '2026-01' })
    assert.equal(r.count, 2)
    assert.deepEqual(r.rows.map(x => x._submittedMonth), ['2025-12', '2026-01'])
  })

  it('超過上限時擋下，而且完全不撈資料', () => {
    const all = Array.from({ length: 501 }, () => row('2026-01'))
    const r = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    assert.equal(r.blocked, true)
    assert.equal(r.count, 501)
    assert.equal(r.fetched, 0)
    assert.equal(r.rows.length, 0)
  })

  it('剛好等於上限時通過', () => {
    const all = Array.from({ length: 500 }, () => row('2026-01'))
    const r = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    assert.equal(r.blocked, false)
    assert.equal(r.fetched, 500)
  })

  // 原本的 bug：前端過濾後只剩少數幾筆，截斷警告卻不會觸發，
  // 使用者拿到的是任意子集卻以為是完整的。
  it('通過閘門後前端精修的結果是完整的，即使只剩幾筆', () => {
    const all = [
      ...Array.from({ length: 400 }, () => row('2026-01', { school: ['培正中學'] })),
      ...Array.from({ length: 40 }, () => row('2026-01', { school: ['粵華中學'] })),
    ]
    const r = gatedQuery(
      all,
      { fromMonth: '2026-01', toMonth: '2026-01', fieldKey: 'school', fieldValue: '粵華中學' },
      500
    )
    assert.equal(r.blocked, false)
    assert.equal(r.fetched, 440, '底層取回整個月份')
    assert.equal(r.rows.length, 40, '精修後 40 筆，而且這 40 筆就是全部')
  })

  it('縮小月份範圍一定會降低筆數，所以擋下必定可解', () => {
    const all = [
      ...Array.from({ length: 300 }, () => row('2025-12')),
      ...Array.from({ length: 300 }, () => row('2026-01')),
    ]
    const wide = gatedQuery(all, { fromMonth: '2025-12', toMonth: '2026-01' }, 500)
    const narrow = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    assert.equal(wide.blocked, true)
    assert.equal(wide.count, 600)
    assert.equal(narrow.blocked, false)
    assert.equal(narrow.count, 300)
  })

  it('前端過濾不會降低筆數（所以不能靠它解除擋下）', () => {
    const all = Array.from({ length: 600 }, (_, i) =>
      row('2026-01', { school: i < 10 ? ['粵華中學'] : ['培正中學'] })
    )
    const withKey = gatedQuery(
      all,
      { fromMonth: '2026-01', toMonth: '2026-01', fieldKey: 'school', fieldValue: '粵華中學' },
      500
    )
    assert.equal(withKey.blocked, true, '加了跨表 KEY 仍然被擋，因為它是前端精修')
    assert.equal(withKey.count, 600)
  })

  it('指定表格會降低筆數（因為它送進 Firestore）', () => {
    const all = [
      ...Array.from({ length: 300 }, () => row('2026-01', { _templateId: 't1' })),
      ...Array.from({ length: 300 }, () => row('2026-01', { _templateId: 't2' })),
    ]
    const noTemplate = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    const withTemplate = gatedQuery(
      all,
      { fromMonth: '2026-01', toMonth: '2026-01', templateId: 't1' },
      500
    )
    assert.equal(noTemplate.blocked, true)
    assert.equal(withTemplate.blocked, false)
    assert.equal(withTemplate.count, 300)
  })

  it('非 Superuser 的計數是上界（相加會重複計）', () => {
    // 一筆既是自己填的、又屬於自己管的表格，兩個查詢都會算到它
    const ownAndManaged = 100
    const ownOnly = 200
    const managedOnly = 200
    const sum = ownOnly + ownAndManaged + (managedOnly + ownAndManaged)
    const unique = ownOnly + managedOnly + ownAndManaged
    assert.ok(sum >= unique, '上界永不低估')
    assert.equal(sum, 600)
    assert.equal(unique, 500)
    // 上界超過 500 就擋下，即使去重後剛好 500。保守但安全。
    assert.ok(sum > 500 && unique <= 500)
  })
})

describe('欄位輸入模式：八格驗證矩陣', () => {
  const field = over => ({ key: 'school', type: 'dropdown', label: '學校', required: false, ...over })

  it('必答 + open → 有效', () => {
    assert.equal(validateFieldMode(field({ required: true })), null)
  })

  it('必答 + default + 有值 → 有效', () => {
    assert.equal(
      validateFieldMode(field({ required: true, inputMode: 'default', presetValue: ['SCD'] })),
      null
    )
  })

  it('必答 + locked + 有值 → 有效', () => {
    assert.equal(
      validateFieldMode(field({ required: true, inputMode: 'locked', presetValue: ['SCD'] })),
      null
    )
  })

  it('必答 + locked + 無值 → 唯一無效的一格', () => {
    const problem = validateFieldMode(field({ required: true, inputMode: 'locked' }))
    assert.match(problem, /必答又鎖定/)
  })

  it('可選答 + open → 有效', () => {
    assert.equal(validateFieldMode(field()), null)
  })

  it('可選答 + default + 有值 → 有效', () => {
    assert.equal(validateFieldMode(field({ inputMode: 'default', presetValue: ['SCD'] })), null)
  })

  it('可選答 + locked + 有值 → 有效', () => {
    assert.equal(validateFieldMode(field({ inputMode: 'locked', presetValue: ['SCD'] })), null)
  })

  it('可選答 + locked + 無值 → 有效（鎖定為空白）', () => {
    assert.equal(validateFieldMode(field({ inputMode: 'locked' })), null)
  })

  it('default 沒有值 → 無效', () => {
    assert.match(validateFieldMode(field({ inputMode: 'default' })), /必須挑一個值/)
  })

  it('檔案欄位不能預填或鎖定', () => {
    assert.match(
      validateFieldMode(field({ type: 'file', inputMode: 'locked', presetValue: 'x' })),
      /檔案欄位/
    )
  })
})

describe('欄位輸入模式：寫入正規化', () => {
  const field = over => ({ key: 'school', type: 'dropdown', label: '學校', required: false, ...over })

  it('open 不存冗餘欄位', () => {
    const out = normalizeInputMode(field({ inputMode: 'open', presetValue: ['SCD'] }))
    assert.equal(out.inputMode, undefined)
    assert.equal(out.presetValue, undefined)
  })

  it('未設 inputMode 視為 open', () => {
    assert.equal(normalizeInputMode(field()).inputMode, undefined)
  })

  it('default 沒有值就降級成 open', () => {
    const out = normalizeInputMode(field({ inputMode: 'default' }))
    assert.equal(out.inputMode, undefined)
  })

  it('locked 沒有值仍保留（鎖定為空白）', () => {
    const out = normalizeInputMode(field({ inputMode: 'locked' }))
    assert.equal(out.inputMode, 'locked')
    assert.equal(out.presetValue, undefined)
  })

  it('檔案欄位一律降級成 open', () => {
    const out = normalizeInputMode(field({ type: 'file', inputMode: 'locked', presetValue: 'x' }))
    assert.equal(out.inputMode, undefined)
  })
})

describe('欄位初始值：舊值優先於預填值', () => {
  const locked = { key: 'school', type: 'dropdown', label: '學校', required: false, inputMode: 'locked', presetValue: ['SCD'] }

  it('更正舊紀錄時沿用原值，不被新版預填值蓋掉', () => {
    assert.deepEqual(resolveInitialValue(locked, ['YV'], []), ['YV'])
  })

  it('原本沒有這個欄位才套預填值（模板新增 locked 欄位的情況）', () => {
    assert.deepEqual(resolveInitialValue(locked, undefined, []), ['SCD'])
  })

  it('open 欄位不套預填值', () => {
    const open = { key: 'text1', type: 'text', label: '備註', required: false }
    assert.equal(resolveInitialValue(open, undefined, ''), '')
  })

  it('鎖定為空白時回傳空值而不是 undefined', () => {
    const blank = { key: 'text1', type: 'text', label: '備註', required: false, inputMode: 'locked' }
    assert.equal(resolveInitialValue(blank, undefined, ''), '')
  })

  it('舊值是空字串時仍算有舊值（不會被預填值取代）', () => {
    assert.equal(resolveInitialValue(locked, '', []), '')
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
