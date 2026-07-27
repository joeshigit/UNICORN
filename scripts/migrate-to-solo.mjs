// ============================================
// 舊版（多角色）資料 → 單人版 的一次性搬遷
//
// 為什麼需要這個：
//   1. 舊 submission 沒有 _isLatest，新版查詢用 where('_isLatest','==',true)
//      篩選鏈頭，所以舊資料整批看不到
//   2. 舊 submission 可能只有 templateId / createdBy 這類舊欄位名，
//      或把使用者資料塞在巢狀的 values:{} 裡
//   3. 舊 optionSet 可能沒有 code（新版用 orderBy('code') 查，缺欄位的文件直接不會回傳）
//      或沒有 isMaster（舊程式把 undefined 當成 Master，新版沒有）
//
// 用 Admin SDK 跑，因為新的 firestore.rules 禁止客戶端改 submission。
//
// 用法（在你自己的電腦上，不要把金鑰交給任何人）：
//   node scripts/migrate-to-solo.mjs --key "C:\\path\\to\\serviceAccountKey.json"          # 只檢查，不寫入
//   node scripts/migrate-to-solo.mjs --key "C:\\path\\to\\serviceAccountKey.json" --apply   # 真的寫入
// ============================================

import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const keyPath = args[args.indexOf('--key') + 1]

if (!keyPath || keyPath.startsWith('--')) {
  console.error('請用 --key 指定服務帳戶金鑰 JSON 的路徑')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
const db = getFirestore()

const log = (...a) => console.log(...a)
const plan = []

function asArray(value) {
  if (Array.isArray(value)) return value.filter(v => v !== '' && v != null).map(String)
  if (value === '' || value == null) return []
  return [String(value)]
}

// 組合字串照選項池排序，跟舊資料存的先後無關
function canonicalOrder(picked, order) {
  const unique = Array.from(new Set(picked))
  if (!order || order.length === 0) return unique.sort()
  const rank = new Map(order.map((value, index) => [value, index]))
  return unique.sort(
    (a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER)
  )
}

function monthOf(value) {
  const d =
    value instanceof Timestamp ? value.toDate() : value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ---------- optionSets ----------
async function migrateOptionSets() {
  const snap = await db.collection('optionSets').get()
  log(`\n【選項池】共 ${snap.size} 筆`)

  const missingCode = []

  for (const doc of snap.docs) {
    const d = doc.data()
    const patch = {}

    // 舊程式把 isMaster === undefined 當成 Master，新版要求明確的 true/false
    if (d.isMaster === undefined) patch.isMaster = !d.masterSetId

    // items 缺 status / sort 會讓下拉選單過濾與排序失準
    if (Array.isArray(d.items)) {
      const needsFix = d.items.some(i => i.status === undefined || i.sort === undefined)
      if (needsFix) {
        patch.items = d.items.map((item, i) => ({
          value: item.value,
          label: item.label ?? item.value,
          status: item.status === 'deprecated' ? 'deprecated' : 'active',
          sort: item.sort ?? i,
        }))
      }
    }

    if (!d.code) {
      missingCode.push({ id: doc.id, name: d.name || '(沒有名稱)' })
      continue
    }

    if (Object.keys(patch).length > 0) {
      plan.push({ ref: doc.ref, patch, what: `optionSet ${d.code}／${d.name}` })
    }
  }

  if (missingCode.length > 0) {
    log(`\n  ⚠️ 有 ${missingCode.length} 個選項池沒有 code，新版查不到它們。`)
    log('     code 沒辦法自動猜，請到 Firebase Console 手動補上（例如 school）：')
    missingCode.forEach(s => log(`     - ${s.id}  ${s.name}`))
  }
}

// ---------- templates ----------
async function migrateTemplates() {
  const snap = await db.collection('templates').get()
  log(`\n【表格】共 ${snap.size} 筆`)

  for (const doc of snap.docs) {
    const d = doc.data()
    const patch = {}

    if (d.enabled === undefined) patch.enabled = false
    if (d.version === undefined) patch.version = 1
    if (!Array.isArray(d.fields)) patch.fields = []
    if (!d._createdMonth) patch._createdMonth = monthOf(d.createdAt) ?? monthOf(new Date())
    // 舊的草稿在新版沒有對應概念，一律當成停用的表格
    if (d._isDraft === true) {
      patch.enabled = false
      patch._isDraft = false
    }

    if (Object.keys(patch).length > 0) {
      plan.push({ ref: doc.ref, patch, what: `template ${d.name || doc.id}` })
    }
  }
}

// ---------- submissions ----------
async function migrateSubmissions(templateNames, templateFields, optionOrder) {
  const snap = await db.collection('submissions').get()
  log(`\n【提交資料】共 ${snap.size} 筆`)

  for (const doc of snap.docs) {
    const d = doc.data()
    const patch = {}

    // 舊欄位名 → UNICORN 標準欄位名
    const pairs = [
      ['_templateId', d.templateId],
      ['_templateModule', d.moduleId],
      ['_templateAction', d.actionId],
      ['_templateVersion', d.templateVersion],
      ['_submitterEmail', d.createdBy],
      ['_submittedAt', d.createdAt],
      ['_fieldLabels', d.labelsSnapshot],
    ]
    for (const [key, fallback] of pairs) {
      if (d[key] === undefined && fallback !== undefined) patch[key] = fallback
    }

    const templateId = d._templateId ?? d.templateId
    if (!d._templateName) {
      patch._templateName = templateNames.get(templateId) || templateId || '(未知表格)'
    }
    if (!d._submittedMonth) {
      patch._submittedMonth = d._month ?? monthOf(d._submittedAt ?? d.createdAt)
    }
    if (!d._status) {
      // 舊的 CANCELLED 對應新版的 VOID，LOCKED 在新版沒有對應概念
      patch._status = d.status === 'CANCELLED' ? 'VOID' : 'ACTIVE'
    } else if (d._status === 'CANCELLED' || d._status === 'LOCKED') {
      patch._status = d._status === 'CANCELLED' ? 'VOID' : 'ACTIVE'
    }
    if (d._optionLabels === undefined) patch._optionLabels = {}
    if (!Array.isArray(d.files)) patch.files = []

    // 巢狀的 values:{} 攤平到頂層，跨表查詢才吃得到
    if (d.values && typeof d.values === 'object') {
      for (const [k, v] of Object.entries(d.values)) {
        if (!k.startsWith('_') && d[k] === undefined && v !== undefined) patch[k] = v
      }
    }

    if (!Array.isArray(d._fieldKeys)) {
      const labels = d._fieldLabels ?? d.labelsSnapshot ?? {}
      const keys = Object.keys(labels)
      patch._fieldKeys = keys.length > 0 ? keys : Object.keys(d.values ?? {})
    }

    // 最關鍵的一個：沒有這個欄位，新版資料池完全看不到這筆
    if (d._isLatest === undefined) patch._isLatest = true

    // 下拉欄位要補上三個衍生形狀（陣列 / 組合字串 / 數量），見 web/src/lib/keys.ts
    for (const field of templateFields.get(templateId) ?? []) {
      if (field.type !== 'dropdown') continue
      const raw = patch[field.key] ?? d[field.key]
      if (raw === undefined) continue

      const picked = canonicalOrder(asArray(raw), optionOrder(field))
      if (!Array.isArray(d[field.key])) patch[field.key] = picked
      if (d[`${field.key}Combined`] === undefined) patch[`${field.key}Combined`] = picked.join(', ')
      if (d[`${field.key}Count`] === undefined) patch[`${field.key}Count`] = picked.length
    }

    if (Object.keys(patch).length > 0) {
      plan.push({ ref: doc.ref, patch, what: `submission ${doc.id}` })
    }
  }
}

// ---------- 執行 ----------
const templateSnap = await db.collection('templates').get()
const templateNames = new Map(templateSnap.docs.map(d => [d.id, d.data().name]))
const templateFields = new Map(templateSnap.docs.map(d => [d.id, d.data().fields ?? []]))

const optionSetSnap = await db.collection('optionSets').get()
const orderById = new Map()
const orderByCode = new Map()
for (const doc of optionSetSnap.docs) {
  const data = doc.data()
  const values = (data.items ?? []).map(i => i.value)
  orderById.set(doc.id, values)
  if (data.code && (data.isMaster || !orderByCode.has(data.code))) orderByCode.set(data.code, values)
}
const optionOrder = field => orderById.get(field.optionSetId) ?? orderByCode.get(field.key)

await migrateOptionSets()
await migrateTemplates()
await migrateSubmissions(templateNames, templateFields, optionOrder)

log(`\n──────────────────────────────`)
log(`需要更新的文件：${plan.length} 筆`)

if (plan.length === 0) {
  log('資料已經是單人版的格式，不用搬。')
  process.exit(0)
}

const sample = plan.slice(0, 5)
log('\n前幾筆會這樣改：')
for (const item of sample) {
  log(`  ${item.what}`)
  log(`    ${JSON.stringify(item.patch).slice(0, 220)}`)
}
if (plan.length > sample.length) log(`  …還有 ${plan.length - sample.length} 筆`)

if (!APPLY) {
  log('\n這是試跑，沒有寫入任何東西。')
  log('確認上面沒問題之後，加上 --apply 再跑一次。')
  process.exit(0)
}

log('\n開始寫入…')
let done = 0
for (let i = 0; i < plan.length; i += 400) {
  const batch = db.batch()
  for (const item of plan.slice(i, i + 400)) batch.update(item.ref, item.patch)
  await batch.commit()
  done += Math.min(400, plan.length - i)
  log(`  ${done} / ${plan.length}`)
}
log('\n完成。到資料池頁面重新查詢一次，舊資料應該就看得到了。')
