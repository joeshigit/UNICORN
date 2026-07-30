// ============================================
// 純邏輯測試：分批、月份範圍閘門、欄位輸入模式、語意日期時間、module.action
// （不需模擬器）
// ============================================

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalKeyViolation,
  isCanonicalUniversalKey,
  UNPREFIXED_KEY_WHITELIST,
} from '../shared/universalKeyValidation.mjs'

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

// 閘門取回後不再依 status 丟掉 VOID（畫面用 maskVoid）；精修改 applyRefineFilters
function applyRefineFilters(rows, conditions) {
  const active = (conditions || []).filter(c => {
    if (!c.key) return false
    if (c.op === 'eq' || c.op === 'neq') return c.value !== undefined && c.value !== ''
    return true
  })
  if (active.length === 0) return rows.slice()

  function isBlank(raw) {
    if (raw === undefined || raw === null) return true
    if (Array.isArray(raw)) return raw.length === 0
    if (typeof raw === 'number') return false
    return String(raw).trim() === ''
  }

  return rows.filter(row =>
    active.every(c => {
      const raw = row[c.key]
      if (c.op === 'eq') return matchesFieldValue(raw, c.value)
      if (c.op === 'neq') return !matchesFieldValue(raw, c.value)
      if (c.op === 'hasValue') return !isBlank(raw)
      if (c.op === 'blank') return isBlank(raw)
      return true
    })
  )
}

function maskVoid(rows, showVoid) {
  if (showVoid) return rows.slice()
  return rows.filter(r => r._status !== 'VOID')
}

function resolveBrowseDefaultsForScope({ isSuperuser, isManager, managerScope }) {
  if (isSuperuser) return { days: 14, pageSize: 100 }
  if (isManager && managerScope === 'visible') return { days: 14, pageSize: 100 }
  if (isManager && managerScope === 'mine') return { days: 30, pageSize: 50 }
  return { days: 30, pageSize: 50 }
}

function browseCutoffDate(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function mergeBrowsePages(pages, pageSize, submittedAtMs) {
  const merged = new Map()
  for (const page of pages) {
    for (const doc of page) merged.set(doc.id, doc)
  }
  return Array.from(merged.values())
    .sort((a, b) => submittedAtMs(b) - submittedAtMs(a))
    .slice(0, pageSize)
}

/** 回傳 { blocked, count, fetched, rows }；fetched 記錄實際撈了幾筆；rows 含 VOID */
function gatedQuery(all, q, limit = QUERY_DISPLAY_LIMIT) {
  assertMonthRange(q)
  const matching = all.filter(r => inRange(r, q))
  const count = matching.length
  if (count > limit) return { blocked: true, count, fetched: 0, rows: [] }
  return { blocked: false, count, fetched: matching.length, rows: matching.slice() }
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

// ---------- 送出時的欄位形狀（對應 db.ts 的 buildSubmissionDoc）----------

function canonicalOrder(picked, order) {
  const unique = Array.from(new Set(picked))
  if (!order || order.length === 0) return unique.sort()
  const rank = new Map(order.map((v, i) => [v, i]))
  return unique.sort(
    (a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER)
  )
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(v => v !== '' && v != null).map(String)
  if (value === '' || value == null) return []
  return [String(value)]
}

/** 只做使用者欄位的部分，不含 _ 前綴的 metadata */
function buildFieldPayload(fields, values, optionOrder = {}) {
  const payload = {}
  for (const field of fields) {
    if (field.type === 'dropdown') {
      const picked = canonicalOrder(asArray(values[field.key]), optionOrder[field.key])
      payload[field.key] = picked
      payload[`${field.key}Combined`] = picked.join(', ')
      payload[`${field.key}Count`] = picked.length
      continue
    }
    const value = values[field.key]
    const blank =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    payload[field.key] = blank ? null : value
  }
  return payload
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
    const r = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    assert.equal(r.blocked, false)
    assert.equal(r.fetched, 440, '底層取回整個月份')
    const refined = applyRefineFilters(r.rows, [
      { key: 'school', op: 'eq', value: '粵華中學' },
    ])
    assert.equal(refined.length, 40, '精修後 40 筆，而且這 40 筆就是全部')
  })

  it('閘門取回保留 VOID，不依 status 丟棄', () => {
    const all = [
      row('2026-01', { _status: 'ACTIVE', id: 'a' }),
      row('2026-01', { _status: 'VOID', id: 'v' }),
    ]
    const r = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    assert.equal(r.rows.length, 2)
    assert.ok(r.rows.some(x => x._status === 'VOID'))
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

  it('前端精修不會降低閘門筆數（所以不能靠它解除擋下）', () => {
    const all = Array.from({ length: 600 }, (_, i) =>
      row('2026-01', { school: i < 10 ? ['粵華中學'] : ['培正中學'] })
    )
    const gated = gatedQuery(all, { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    assert.equal(gated.blocked, true, '精修前就被擋')
    assert.equal(gated.count, 600)
    // 若沒被擋，精修也只作用在已取回集合上
    const unblocked = gatedQuery(all.slice(0, 100), { fromMonth: '2026-01', toMonth: '2026-01' }, 500)
    const refined = applyRefineFilters(unblocked.rows, [
      { key: 'school', op: 'eq', value: '粵華中學' },
    ])
    assert.ok(refined.length <= unblocked.fetched)
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

describe('資料形狀：同一張表的每一筆都相同', () => {
  const fields = [
    { key: 'school', type: 'dropdown', label: '學校', required: false },
    { key: 'title', type: 'text', label: '標題', required: false },
    { key: 'note', type: 'textarea', label: '備註', required: false },
    { key: 'quantity1', type: 'number', label: '人數', required: false },
    { key: 'eventDate', type: 'date', label: '日期', required: false },
    { key: 'upload', type: 'file', label: '附件', required: false },
  ]
  const order = { school: ['粵華中學', '培正中學'] }

  const full = buildFieldPayload(
    fields,
    {
      school: ['粵華中學'],
      title: '個案 A',
      note: '有備註',
      quantity1: 3,
      eventDate: '2026-01-15',
      upload: 2,
    },
    order
  )
  const empty = buildFieldPayload(
    fields,
    { school: [], title: '', note: '', quantity1: '', eventDate: '', upload: 0 },
    order
  )

  it('全部填與全部空白的欄位集合完全一致', () => {
    assert.deepEqual(Object.keys(full).sort(), Object.keys(empty).sort())
  })

  it('空白的純量欄位存成 null，KEY 不會消失', () => {
    assert.equal(empty.title, null)
    assert.equal(empty.note, null)
    assert.equal(empty.quantity1, null)
    assert.equal(empty.eventDate, null)
    assert.ok('title' in empty && 'quantity1' in empty)
  })

  it('下拉維持三個形狀，空白時是 [] / "" / 0', () => {
    assert.deepEqual(empty.school, [])
    assert.equal(empty.schoolCombined, '')
    assert.equal(empty.schoolCount, 0)
  })

  it('檔案欄位空白時是數量 0，不是 null', () => {
    assert.equal(empty.upload, 0)
  })

  it('真正填 0 的數字不會被當成空白', () => {
    const zero = buildFieldPayload(fields, { quantity1: 0 }, order)
    assert.equal(zero.quantity1, 0)
    assert.notEqual(zero.quantity1, null)
  })

  // null 是值而不是索引上的洞，所以排序不會把它整筆丟掉
  it('依欄位排序時空白紀錄仍在結果內（排最前）', () => {
    const rows = [{ quantity1: 5 }, { quantity1: null }, { quantity1: 2 }]
    const sorted = [...rows].sort((a, b) => {
      if (a.quantity1 === null && b.quantity1 === null) return 0
      if (a.quantity1 === null) return -1
      if (b.quantity1 === null) return 1
      return a.quantity1 - b.quantity1
    })
    assert.equal(sorted.length, 3, '沒有紀錄消失')
    assert.equal(sorted[0].quantity1, null, 'null 排最前')
  })

  it('空白可以查得到（== null），不必另外存一個清單', () => {
    const rows = [
      { id: 1, note: '有寫' },
      { id: 2, note: null },
      { id: 3, note: null },
    ]
    assert.equal(rows.filter(r => r.note === null).length, 2)
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

describe('Browse 角色預設', () => {
  it('Submitter：30 天 × 50', () => {
    assert.deepEqual(
      resolveBrowseDefaultsForScope({ isSuperuser: false, isManager: false, managerScope: 'visible' }),
      { days: 30, pageSize: 50 }
    )
  })

  it('Manager 可見範圍：14 天 × 100', () => {
    assert.deepEqual(
      resolveBrowseDefaultsForScope({ isSuperuser: false, isManager: true, managerScope: 'visible' }),
      { days: 14, pageSize: 100 }
    )
  })

  it('Manager 只看我的：30 天 × 50', () => {
    assert.deepEqual(
      resolveBrowseDefaultsForScope({ isSuperuser: false, isManager: true, managerScope: 'mine' }),
      { days: 30, pageSize: 50 }
    )
  })

  it('Superuser：14 天 × 100', () => {
    assert.deepEqual(
      resolveBrowseDefaultsForScope({ isSuperuser: true, isManager: false, managerScope: 'visible' }),
      { days: 14, pageSize: 100 }
    )
  })

  it('cutoff 是 now 往前 days 天', () => {
    const now = new Date('2026-07-30T12:00:00Z')
    const c = browseCutoffDate(14, now)
    assert.equal(c.getTime(), now.getTime() - 14 * 24 * 60 * 60 * 1000)
  })
})

describe('作廢遮罩 maskVoid', () => {
  const rows = [
    { id: '1', _status: 'ACTIVE' },
    { id: '2', _status: 'VOID' },
    { id: '3', _status: 'ACTIVE' },
  ]

  it('預設隱藏 VOID，不改動原陣列', () => {
    const shown = maskVoid(rows, false)
    assert.equal(shown.length, 2)
    assert.equal(rows.length, 3)
  })

  it('顯示作廢時全部保留', () => {
    assert.equal(maskVoid(rows, true).length, 3)
  })
})

describe('精修 applyRefineFilters', () => {
  const rows = [
    { id: '1', school: ['粵華中學'], note: '有', quantity1: 1 },
    { id: '2', school: ['培正中學'], note: null, quantity1: null },
    { id: '3', school: [], note: '', quantity1: 0 },
  ]

  it('eq', () => {
    const out = applyRefineFilters(rows, [{ key: 'school', op: 'eq', value: '粵華中學' }])
    assert.deepEqual(out.map(r => r.id), ['1'])
  })

  it('neq', () => {
    const out = applyRefineFilters(rows, [{ key: 'school', op: 'neq', value: '粵華中學' }])
    assert.deepEqual(out.map(r => r.id), ['2', '3'])
  })

  it('blank：null / [] / "" 算空白；數字 0 不算', () => {
    const blankNote = applyRefineFilters(rows, [{ key: 'note', op: 'blank' }])
    assert.deepEqual(blankNote.map(r => r.id), ['2', '3'])
    const blankQty = applyRefineFilters(rows, [{ key: 'quantity1', op: 'blank' }])
    assert.deepEqual(blankQty.map(r => r.id), ['2'])
  })

  it('hasValue', () => {
    const out = applyRefineFilters(rows, [{ key: 'note', op: 'hasValue' }])
    assert.deepEqual(out.map(r => r.id), ['1'])
  })

  it('多條件 AND', () => {
    const out = applyRefineFilters(rows, [
      { key: 'school', op: 'neq', value: '粵華中學' },
      { key: 'quantity1', op: 'blank' },
    ])
    assert.deepEqual(out.map(r => r.id), ['2'])
  })
})

describe('Browse merge trim', () => {
  it('多來源去重後取最新 N', () => {
    const a = [
      { id: '1', t: 300 },
      { id: '2', t: 200 },
      { id: 'shared', t: 250 },
    ]
    const b = [
      { id: 'shared', t: 250 },
      { id: '3', t: 100 },
      { id: '4', t: 400 },
    ]
    const out = mergeBrowsePages([a, b], 3, r => r.t)
    assert.deepEqual(
      out.map(r => r.id),
      ['4', '1', 'shared']
    )
  })
})

/** 鏡像 browseSubmissions 的 legExhausted／hasMore 語意 */
function browseLegHasMore(legPageSizes, pageSize, prevExhausted = []) {
  const nextExhausted = []
  for (let i = 0; i < legPageSizes.length; i++) {
    if (prevExhausted[i]) {
      nextExhausted.push(true)
      continue
    }
    nextExhausted.push(legPageSizes[i] < pageSize)
  }
  return { legExhausted: nextExhausted, hasMore: nextExhausted.some(e => !e) }
}

describe('Browse legExhausted', () => {
  it('某腿不足一頁即標記耗盡，hasMore 只看未耗盡腿', () => {
    const r = browseLegHasMore([50, 30], 50)
    assert.deepEqual(r.legExhausted, [false, true])
    assert.equal(r.hasMore, true)

    const r2 = browseLegHasMore([30, 20], 50, r.legExhausted)
    assert.deepEqual(r2.legExhausted, [true, true])
    assert.equal(r2.hasMore, false)
  })

  it('已耗盡腿不再參與 hasMore', () => {
    const r = browseLegHasMore([50, 10], 50, [false, true])
    assert.deepEqual(r.legExhausted, [false, true])
    assert.equal(r.hasMore, true)
  })
})

// ---------- 量表／矩陣（對應 keys.ts）----------

const RATING_KEYS = Array.from({ length: 20 }, (_, i) => `rating${i + 1}`)
const SCALE_POINTS_OPTIONS = [3, 4, 5, 10, 100]

function allocateRatingKeys(usedKeys, count) {
  const used = new Set(usedKeys)
  const free = RATING_KEYS.filter(k => !used.has(k))
  if (free.length < count) return null
  return free.slice(0, count)
}

function expandScaleMatrixFields(labels, scalePoints, usedKeys, startOrder) {
  const trimmed = labels.map(l => l.trim()).filter(Boolean)
  if (trimmed.length === 0) return { error: '請至少輸入一列題目' }
  if (!SCALE_POINTS_OPTIONS.includes(scalePoints)) return { error: '請選擇有效的量表點數' }
  const keys = allocateRatingKeys(usedKeys, trimmed.length)
  if (!keys) {
    const free = RATING_KEYS.filter(k => !new Set(usedKeys).has(k)).length
    return { error: `量表 KEY 只剩 ${free} 個空位，無法加入 ${trimmed.length} 題` }
  }
  return trimmed.map((label, i) => ({
    key: keys[i],
    type: 'scale',
    label,
    required: false,
    order: startOrder + i,
    scalePoints,
  }))
}

function usesThreeShape(type) {
  return type === 'dropdown' || type === 'choice' || type === 'scale'
}

function usesOptionSet(type) {
  return type === 'dropdown' || type === 'choice'
}

function isYesNoField(field) {
  return field.yesNoAllowNa !== undefined
}

function fieldUsesOptionSet(field) {
  return usesOptionSet(field.type) && !isYesNoField(field)
}

function cleanFieldMirror(f) {
  const isScale = f.type === 'scale'
  return {
    key: f.key,
    type: f.type,
    optionSetId: fieldUsesOptionSet(f) ? f.optionSetId : undefined,
    multiple: fieldUsesOptionSet(f) && f.multiple ? true : undefined,
    scalePoints: isScale ? f.scalePoints || 5 : undefined,
    yesNoAllowNa: isYesNoField(f) ? f.yesNoAllowNa : undefined,
  }
}

function threeShapePayload(raw, order) {
  const asArray = v => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : [])
  const wanted = asArray(raw)
  const picked = order.filter(v => wanted.includes(v)).concat(wanted.filter(v => !order.includes(v)))
  return { values: picked, combined: picked.join(', '), count: picked.length }
}

describe('量表與矩陣', () => {
  it('分配尚未使用的 rating KEY', () => {
    assert.deepEqual(allocateRatingKeys(['rating1', 'rating2'], 2), ['rating3', 'rating4'])
  })

  it('空位不足回傳 null，不截斷', () => {
    const used = RATING_KEYS.slice(0, 19)
    assert.equal(allocateRatingKeys(used, 2), null)
  })

  it('矩陣展開為扁平 scale 欄位，共用 scalePoints', () => {
    const out = expandScaleMatrixFields(['喜歡午餐嗎？', '喜歡晚餐嗎？'], 3, [], 0)
    assert.ok(Array.isArray(out))
    assert.equal(out.length, 2)
    assert.equal(out[0].key, 'rating1')
    assert.equal(out[1].key, 'rating2')
    assert.equal(out[0].type, 'scale')
    assert.equal(out[0].scalePoints, 3)
    assert.equal(out[0].label, '喜歡午餐嗎？')
  })

  it('scale／choice 走三形狀；scale 不要 optionSetId', () => {
    assert.equal(usesThreeShape('scale'), true)
    assert.equal(usesThreeShape('choice'), true)
    assert.equal(usesOptionSet('scale'), false)
    assert.equal(usesOptionSet('choice'), true)
    assert.equal(fieldUsesOptionSet({ type: 'choice', yesNoAllowNa: false }), false)
    assert.equal(fieldUsesOptionSet({ type: 'choice', optionSetId: 'x' }), true)
    const cleaned = cleanFieldMirror({
      key: 'rating1',
      type: 'scale',
      scalePoints: 5,
      optionSetId: 'should-drop',
      multiple: true,
    })
    assert.equal(cleaned.optionSetId, undefined)
    assert.equal(cleaned.multiple, undefined)
    assert.equal(cleaned.scalePoints, 5)
    const yesNoCleaned = cleanFieldMirror({
      key: 'coun_risk',
      type: 'choice',
      yesNoAllowNa: false,
      optionSetId: 'should-drop',
      multiple: true,
    })
    assert.equal(yesNoCleaned.optionSetId, undefined)
    assert.equal(yesNoCleaned.multiple, undefined)
    assert.equal(yesNoCleaned.yesNoAllowNa, false)
  })

  it('scale 存 "1"…"N" 三形狀', () => {
    const order = ['1', '2', '3']
    const p = threeShapePayload('3', order)
    assert.deepEqual(p.values, ['3'])
    assert.equal(p.combined, '3')
    assert.equal(p.count, 1)
    const blank = threeShapePayload('', order)
    assert.deepEqual(blank.values, [])
    assert.equal(blank.count, 0)
  })
})

// ---------- 標準資料（對應 keys.ts standardKeys helpers）----------

function validateScaleValueLabels(points, labels) {
  if (![3, 4, 5, 10, 100].includes(points)) return '請選擇有效的量表點數'
  if (!Array.isArray(labels)) return '量表標籤必須是清單'
  if (labels.length !== points) return `量表標籤必須正好 ${points} 個`
  for (let i = 0; i < points; i++) {
    const expected = String(i + 1)
    const row = labels[i]
    if (!row || row.value !== expected) {
      return `量表 VALUE 必須依序為 "1"…"${points}"（不可缺號或使用 "01"）`
    }
    if (typeof row.label !== 'string' || !row.label.trim()) return `第 ${expected} 點需要標籤文字`
  }
  return null
}

function scaleValueLabelsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false
  return a.every((row, i) => row.value === b[i].value && row.label === b[i].label)
}

function assertFieldMatchesStandard(field, standard, optionSetCode) {
  if (field.key !== standard.key) return 'KEY 不一致'
  if (field.type !== standard.type) return '題型鎖定'
  if (standard.valueModel === 'yesNo') {
    if (field.optionSetId) return '不應綁選項'
    if (field.multiple) return '不可複選'
    if (field.yesNoAllowNa !== standard.allowNa) return '是/否變體鎖定'
    return null
  }
  if (standard.valueModel === 'optionSet') {
    if (!field.optionSetId) return '要選選項清單'
    if (optionSetCode != null && optionSetCode !== field.key) return 'code 必須等於 KEY'
    return null
  }
  if (standard.valueModel === 'scale') {
    if (field.scalePoints !== standard.scalePoints) return '點數鎖定'
    if (validateScaleValueLabels(field.scalePoints, field.scaleValueLabels)) return '標籤無效'
    if (!scaleValueLabelsEqual(field.scaleValueLabels, standard.scaleValueLabels)) return '標籤鎖定'
    return null
  }
  return null
}

function applyStandardToField(field, standard) {
  const next = {
    ...field,
    key: standard.key,
    type: standard.type,
    optionSetId: undefined,
    multiple: undefined,
    scalePoints: standard.scalePoints,
    scaleValueLabels: standard.scaleValueLabels
      ? standard.scaleValueLabels.map(l => ({ ...l }))
      : undefined,
    yesNoAllowNa: undefined,
    presetValue: undefined,
  }
  if (standard.valueModel === 'optionSet') next.optionSetId = standard.optionSetId
  if (standard.valueModel === 'yesNo') next.yesNoAllowNa = standard.allowNa
  if (!next.label?.trim()) next.label = standard.defaultLabel
  return next
}

const YES_NO_VALUES = ['是', '否']
const YES_NO_NA_VALUES = ['是', '否', '不適用']

function yesNoValueOrder(allowNa) {
  return allowNa ? YES_NO_NA_VALUES : YES_NO_VALUES
}

function isValidTypeValueModelPair(type, valueModel) {
  const free = ['text', 'textarea', 'number', 'date', 'time']
  if (type === 'scale') return valueModel === 'scale'
  if (type === 'dropdown') return valueModel === 'optionSet'
  if (type === 'choice') return valueModel === 'optionSet' || valueModel === 'yesNo'
  if (free.includes(type)) return valueModel === 'free'
  return false
}

function allowedValueModels(type) {
  if (type === 'scale') return ['scale']
  if (type === 'dropdown') return ['optionSet']
  if (type === 'choice') return ['optionSet', 'yesNo']
  if (['text', 'textarea', 'number', 'date', 'time'].includes(type)) return ['free']
  return null
}

function expectedValueModel(type) {
  const allowed = allowedValueModels(type)
  if (!allowed || allowed.length !== 1) return null
  return allowed[0]
}

function activeStandardsForPicker(standards) {
  return standards.filter(s => s.status === 'active')
}

function optionSetCodesWithoutStandard(masterCodes, standards) {
  const taken = new Set(standards.map(s => s.key))
  return masterCodes.filter(c => !taken.has(c))
}

describe('標準資料契約', () => {
  const ser = {
    key: 'serEvaluation',
    type: 'scale',
    valueModel: 'scale',
    scalePoints: 5,
    scaleValueLabels: [
      { value: '1', label: '很不滿意' },
      { value: '2', label: '不滿意' },
      { value: '3', label: '一般' },
      { value: '4', label: '滿意' },
      { value: '5', label: '很滿意' },
    ],
    defaultLabel: '活動評分',
    status: 'active',
  }

  it('A：契約 mismatch → reject', () => {
    const field = {
      key: 'serEvaluation',
      type: 'scale',
      scalePoints: 10,
      scaleValueLabels: ser.scaleValueLabels,
      label: 'x',
      required: false,
      order: 0,
    }
    assert.equal(assertFieldMatchesStandard(field, ser), '點數鎖定')
  })

  it('B：deprecated 不在可選列表', () => {
    const list = activeStandardsForPicker([
      { key: 'a', status: 'active' },
      { key: 'b', status: 'deprecated' },
    ])
    assert.deepEqual(
      list.map(s => s.key),
      ['a']
    )
  })

  it('C：deprecated + 契約正確 → 通過', () => {
    const field = applyStandardToField(
      { key: '', type: 'text', label: '', required: false, order: 0 },
      { ...ser, status: 'deprecated' }
    )
    assert.equal(assertFieldMatchesStandard(field, { ...ser, status: 'deprecated' }), null)
  })

  it('D：snapshot 深拷貝，改副本不影響來源', () => {
    const field = applyStandardToField(
      { key: '', type: 'text', label: '', required: false, order: 0 },
      ser
    )
    field.scaleValueLabels[0].label = '被改了'
    assert.equal(ser.scaleValueLabels[0].label, '很不滿意')
  })

  it('E：scaleValueLabels 缺號／01 → reject', () => {
    assert.ok(validateScaleValueLabels(5, [{ value: '01', label: 'x' }]))
    assert.ok(
      validateScaleValueLabels(3, [
        { value: '1', label: 'a' },
        { value: '2', label: 'b' },
      ])
    )
  })

  it('F：optionSetId.code ≠ key → reject', () => {
    const std = {
      key: 'school',
      type: 'choice',
      valueModel: 'optionSet',
      optionSetId: 'm1',
    }
    const field = {
      key: 'school',
      type: 'choice',
      optionSetId: 'm1',
      label: '校',
      required: false,
      order: 0,
    }
    assert.equal(assertFieldMatchesStandard(field, std, 'dept'), 'code 必須等於 KEY')
    assert.equal(assertFieldMatchesStandard(field, std, 'school'), null)
  })

  it('H：同 code 已有標準時不出現在未升格選項池', () => {
    assert.deepEqual(optionSetCodesWithoutStandard(['school', 'dept'], [{ key: 'school' }]), [
      'dept',
    ])
  })
})

describe('yesNo 標準契約', () => {
  const yesNoStd = {
    key: 'coun_riskSelfHarm',
    type: 'choice',
    valueModel: 'yesNo',
    allowNa: false,
    defaultLabel: '自伤风险评估',
    status: 'active',
  }

  it('pair 驗證：choice 接受 optionSet 或 yesNo', () => {
    assert.equal(isValidTypeValueModelPair('choice', 'optionSet'), true)
    assert.equal(isValidTypeValueModelPair('choice', 'yesNo'), true)
    assert.equal(isValidTypeValueModelPair('choice', 'free'), false)
    assert.equal(isValidTypeValueModelPair('dropdown', 'yesNo'), false)
    assert.deepEqual(allowedValueModels('choice'), ['optionSet', 'yesNo'])
    assert.equal(expectedValueModel('choice'), null)
    assert.equal(expectedValueModel('text'), 'free')
  })

  it('yesNoValueOrder：二元 vs 三元', () => {
    assert.deepEqual(yesNoValueOrder(false), ['是', '否'])
    assert.deepEqual(yesNoValueOrder(true), ['是', '否', '不適用'])
  })

  it('applyStandardToField snapshot allowNa', () => {
    const field = applyStandardToField(
      { key: '', type: 'text', label: '', required: false, order: 0 },
      yesNoStd
    )
    assert.equal(field.yesNoAllowNa, false)
    assert.equal(field.optionSetId, undefined)
    assert.equal(assertFieldMatchesStandard(field, yesNoStd), null)
  })

  it('allowNa mismatch → reject', () => {
    const field = {
      key: 'coun_riskSelfHarm',
      type: 'choice',
      yesNoAllowNa: true,
      label: 'x',
      required: false,
      order: 0,
    }
    assert.equal(assertFieldMatchesStandard(field, yesNoStd), '是/否變體鎖定')
  })

  it('submit order 來自 yesNoValueOrder', () => {
    const order = yesNoValueOrder(false)
    const p = threeShapePayload('是', order)
    assert.deepEqual(p.values, ['是'])
    assert.equal(p.combined, '是')
    assert.equal(p.count, 1)
  })
})

// ---------- Universal KEY naming（L1 shared + L2 policy 镜像 keys.ts）----------

const SYSTEM_RESERVED = ['module', 'action', 'managerGroup']

/** 镜像 web/src/lib/keys.ts validateOptionSetCode 的 L2 reserved 检查 */
function validateOptionSetCodeMirror(code) {
  if (canonicalKeyViolation(code)) return 'format'
  if (SYSTEM_RESERVED.includes(code.trim())) return 'reserved'
  return null
}

describe('Universal KEY naming L1 (shared/universalKeyValidation.mjs)', () => {
  it('accepts category-prefixed camelCase', () => {
    assert.equal(isCanonicalUniversalKey('demo_chineseName'), true)
    assert.equal(isCanonicalUniversalKey('coun_riskSelfHarm'), true)
    assert.equal(isCanonicalUniversalKey('fin_invoiceNo'), true)
  })

  it('accepts PO whitelist school only', () => {
    assert.deepEqual(UNPREFIXED_KEY_WHITELIST, ['school'])
    assert.equal(isCanonicalUniversalKey('school'), true)
  })

  it('rejects snake_case tail', () => {
    assert.equal(isCanonicalUniversalKey('demo_chinese_name'), false)
    assert.equal(canonicalKeyViolation('demo_chinese_name'), 'prefixed_invalid_tail')
  })

  it('rejects camelCase without prefix', () => {
    assert.equal(isCanonicalUniversalKey('demoChineseName'), false)
    assert.equal(canonicalKeyViolation('demoChineseName'), 'camel_without_prefix')
  })

  it('rejects bare semantic keys', () => {
    for (const key of ['name', 'phone', 'email']) {
      assert.equal(isCanonicalUniversalKey(key), false)
      assert.equal(canonicalKeyViolation(key), 'bare_semantic')
    }
  })

  it('rejects unprefixed keys not on whitelist', () => {
    assert.equal(isCanonicalUniversalKey('costcenter'), false)
    assert.equal(canonicalKeyViolation('costcenter'), 'unprefixed_not_whitelisted')
    assert.equal(canonicalKeyViolation('costCenter'), 'camel_without_prefix')
  })
})

describe('Universal KEY naming L2 policy (mirrors keys.ts)', () => {
  it('optionSet.code and standardKeys.key share format', () => {
    assert.equal(validateOptionSetCodeMirror('demo_chineseName'), null)
    assert.equal(validateOptionSetCodeMirror('school'), null)
    assert.equal(validateOptionSetCodeMirror('name'), 'format')
  })

  it('system reserved codes fail format before reserved guard (seeded only via ensureCoreOptionSets)', () => {
    assert.equal(validateOptionSetCodeMirror('managerGroup'), 'format')
    assert.equal(validateOptionSetCodeMirror('module'), 'format')
  })
})
