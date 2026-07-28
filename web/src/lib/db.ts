// ============================================
// 🦄 UNICORN Capture（單人版）— Firestore 資料層
//
// 三個 collection，對應 Unicorn 的三層：
//   optionSets   Meaning     選項池（KEY 的定義 + VALUE 的字典）
//   templates    Template    表格定義（純資料，不是程式碼）
//   submissions  Submission  單一資料池，不可變事件
//
// 寫入當下（write-time）就決定好的東西，全部存進 submission：
//   _templateName / _templateVersion  表格快照
//   _fieldLabels / _optionLabels      顯示用文字快照
//   _submittedMonth                   月份查詢鍵
//   Universal KEY 平鋪在頂層          跨表查詢不需要 join
//
// 讀取一律用 *FromServer：離線時要明確報錯，不要拿本地快取
// 回一份看起來「沒有資料」的空清單。
// ============================================

import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  runTransaction,
  serverTimestamp,
  QueryConstraint,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { MODULE_CODE, ACTION_CODE, combinedKey, countKey } from './keys'
import type {
  FieldDefinition,
  FileInfo,
  OptionItem,
  OptionSet,
  Submission,
  SubmissionStatus,
  Template,
} from '@/types'

// ---------- 共用小工具 ----------

export function currentMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

function newId(collectionName: string): string {
  return doc(collection(db, collectionName)).id
}

// ============================================
// OptionSets（選項池）
// ============================================

export async function listOptionSets(): Promise<OptionSet[]> {
  const snap = await getDocsFromServer(query(collection(db, 'optionSets'), orderBy('code')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as OptionSet[]
}

export async function getOptionSet(id: string): Promise<OptionSet | null> {
  const snap = await getDocFromServer(doc(db, 'optionSets', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as OptionSet) : null
}

export interface OptionSetInput {
  code: string
  name: string
  description?: string
  isMaster: boolean
  masterSetId?: string
  items: Array<{ value: string; label: string; status?: 'active' | 'deprecated' }>
}

function normalizeItems(items: OptionSetInput['items']): OptionItem[] {
  const seen = new Set<string>()
  const out: OptionItem[] = []
  items.forEach(item => {
    const value = item.value.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    out.push({
      value,
      label: (item.label || value).trim() || value,
      status: item.status === 'deprecated' ? 'deprecated' : 'active',
      sort: out.length,
    })
  })
  return out
}

export async function createOptionSet(input: OptionSetInput, userEmail: string): Promise<string> {
  const id = newId('optionSets')
  await setDoc(
    doc(db, 'optionSets', id),
    stripUndefined({
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || '',
      isMaster: input.isMaster,
      masterSetId: input.isMaster ? undefined : input.masterSetId,
      items: normalizeItems(input.items),
      createdBy: userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  )
  return id
}

export async function updateOptionSet(
  id: string,
  input: Pick<OptionSetInput, 'name' | 'description' | 'items'>
): Promise<void> {
  await updateDoc(doc(db, 'optionSets', id), {
    name: input.name.trim(),
    description: input.description?.trim() || '',
    items: normalizeItems(input.items),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteOptionSet(id: string): Promise<void> {
  await deleteDoc(doc(db, 'optionSets', id))
}

// 子集只能挑 Master 已有的 value，確保存進 submission 的 VALUE 永遠標準化
export async function createSubset(
  master: OptionSet,
  name: string,
  selectedValues: string[],
  userEmail: string
): Promise<string> {
  const allowed = new Set(master.items.map(i => i.value))
  const invalid = selectedValues.filter(v => !allowed.has(v))
  if (invalid.length > 0) {
    throw new Error(`以下選項不在 Master 中：${invalid.join('、')}`)
  }
  const items = master.items.filter(i => selectedValues.includes(i.value))
  return createOptionSet(
    {
      code: master.code,
      name,
      description: `從「${master.name}」建立的子集`,
      isMaster: false,
      masterSetId: master.id,
      items,
    },
    userEmail
  )
}

// module / action 是建表時的分類與動作，第一次進系統自動建立
export async function ensureCoreOptionSets(userEmail: string): Promise<void> {
  const existing = await listOptionSets()
  const codes = new Set(existing.map(os => os.code))

  const seeds: Array<{ code: string; name: string; items: string[] }> = [
    { code: MODULE_CODE, name: '表格分類', items: ['GENERAL'] },
    { code: ACTION_CODE, name: '表格動作', items: ['RECORD'] },
  ]

  for (const seed of seeds) {
    if (codes.has(seed.code)) continue
    await createOptionSet(
      {
        code: seed.code,
        name: seed.name,
        isMaster: true,
        items: seed.items.map(v => ({ value: v, label: v })),
      },
      userEmail
    )
  }
}

// ============================================
// Templates（表格定義）
// ============================================

export async function listTemplates(): Promise<Template[]> {
  const snap = await getDocsFromServer(query(collection(db, 'templates'), orderBy('updatedAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Template[]
}

export async function getTemplate(id: string): Promise<Template | null> {
  const snap = await getDocFromServer(doc(db, 'templates', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Template) : null
}

export interface TemplateInput {
  name: string
  moduleId: string
  actionId: string
  description?: string
  enabled: boolean
  fields: FieldDefinition[]
}

function cleanFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((f, i) =>
    stripUndefined({
      key: f.key,
      type: f.type,
      label: f.label.trim(),
      required: !!f.required,
      order: i,
      helpText: f.helpText?.trim() || undefined,
      optionSetId: f.type === 'dropdown' ? f.optionSetId : undefined,
      multiple: f.type === 'dropdown' && f.multiple ? true : undefined,
    })
  )
}

export async function createTemplate(input: TemplateInput, userEmail: string): Promise<string> {
  const id = newId('templates')
  await setDoc(
    doc(db, 'templates', id),
    stripUndefined({
      name: input.name.trim(),
      moduleId: input.moduleId,
      actionId: input.actionId,
      description: input.description?.trim() || '',
      enabled: input.enabled,
      version: 1,
      fields: cleanFields(input.fields),
      createdBy: userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      _createdMonth: currentMonth(),
    })
  )
  return id
}

// 改欄位 = 換版本。已提交的資料帶著舊 version 與舊 label 快照，不受影響。
export async function updateTemplate(
  id: string,
  input: TemplateInput,
  currentVersion: number,
  fieldsChanged: boolean
): Promise<void> {
  await updateDoc(doc(db, 'templates', id), {
    name: input.name.trim(),
    moduleId: input.moduleId,
    actionId: input.actionId,
    description: input.description?.trim() || '',
    enabled: input.enabled,
    version: fieldsChanged ? currentVersion + 1 : currentVersion,
    fields: cleanFields(input.fields),
    updatedAt: serverTimestamp(),
  })
}

export async function setTemplateEnabled(id: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(db, 'templates', id), { enabled, updatedAt: serverTimestamp() })
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id))
}

export async function countSubmissionsForTemplate(templateId: string): Promise<number> {
  const snap = await getDocsFromServer(
    query(collection(db, 'submissions'), where('_templateId', '==', templateId), fsLimit(1000))
  )
  return snap.size
}

// ============================================
// Submissions（單一資料池）
// ============================================

export interface SubmitInput {
  template: Template
  values: Record<string, unknown>
  files: FileInfo[]
  optionLabels: Record<string, string>
  // 欄位 KEY → 該選項池的完整值清單，用來決定組合字串的標準順序
  optionOrder: Record<string, string[]>
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => v !== '' && v != null).map(String)
  if (value === '' || value == null) return []
  return [String(value)]
}

// 組合字串一律照選項池的排序產生，跟使用者點選的先後無關。
// 否則「A, B」和「B, A」會被當成兩種組合，分組統計就散了。
function canonicalOrder(picked: string[], order?: string[]): string[] {
  const unique = Array.from(new Set(picked))
  if (!order || order.length === 0) return unique.sort()
  const rank = new Map(order.map((value, index) => [value, index]))
  return unique.sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER))
}

function buildSubmissionDoc(
  input: SubmitInput,
  userEmail: string,
  extra: Partial<Submission>
): Record<string, unknown> {
  const { template, values, files, optionLabels, optionOrder } = input

  const fieldLabels: Record<string, string> = {}
  const fieldKeys: string[] = []
  for (const field of template.fields) {
    fieldLabels[field.key] = field.label
    fieldKeys.push(field.key)
  }

  const payload: Record<string, unknown> = {
    _templateId: template.id,
    _templateName: template.name,
    _templateModule: template.moduleId,
    _templateAction: template.actionId,
    _templateVersion: template.version,
    _submitterEmail: userEmail,
    _submittedAt: serverTimestamp(),
    _submittedMonth: currentMonth(),
    _status: 'ACTIVE' as SubmissionStatus,
    _isLatest: true,
    _fieldLabels: fieldLabels,
    _optionLabels: optionLabels,
    _fieldKeys: fieldKeys,
    files,
    ...extra,
  }

  // Universal KEY 平鋪在頂層，跨表查詢直接 where(key, ...)
  for (const field of template.fields) {
    // 下拉欄位一律寫成三個形狀，單選複選都一樣，見 lib/keys.ts
    if (field.type === 'dropdown') {
      const picked = canonicalOrder(asArray(values[field.key]), optionOrder[field.key])
      payload[field.key] = picked
      payload[combinedKey(field.key)] = picked.join(', ')
      payload[countKey(field.key)] = picked.length
      continue
    }

    const value = values[field.key]
    if (value === undefined || value === '' || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    payload[field.key] = value
  }

  return stripUndefined(payload)
}

// 提前產生 ID，讓檔案可以在送出前就上傳到對應的資料夾
export function newSubmissionId(): string {
  return newId('submissions')
}

export async function createSubmission(
  input: SubmitInput,
  userEmail: string,
  id: string = newId('submissions')
): Promise<string> {
  await setDoc(doc(db, 'submissions', id), buildSubmissionDoc(input, userEmail, {}))
  return id
}

// 更正：原紀錄一個字都不改，只把鏈頭指標移到新紀錄上。
export async function correctSubmission(
  originalId: string,
  input: SubmitInput,
  userEmail: string,
  newSubmissionId: string = newId('submissions')
): Promise<string> {
  await runTransaction(db, async tx => {
    const originalRef = doc(db, 'submissions', originalId)
    const original = await tx.get(originalRef)
    if (!original.exists()) throw new Error('找不到原始紀錄')
    if (original.data()._isLatest !== true) throw new Error('這筆紀錄已經被更正過了')

    tx.set(
      doc(db, 'submissions', newSubmissionId),
      buildSubmissionDoc(input, userEmail, { _supersedes: originalId })
    )
    tx.update(originalRef, { _isLatest: false, _supersededBy: newSubmissionId })
  })
  return newSubmissionId
}

// 作廢：同樣不改原紀錄，寫一筆 VOID 的墓碑接在鏈頭。
export async function voidSubmission(original: Submission, userEmail: string): Promise<string> {
  const originalId = original.id!
  const voidId = newId('submissions')

  // 墓碑要帶著原本的資料，包含下拉欄位的三個衍生形狀
  const copy: Record<string, unknown> = {}
  for (const key of original._fieldKeys || []) {
    for (const candidate of [key, combinedKey(key), countKey(key)]) {
      if (original[candidate] !== undefined) copy[candidate] = original[candidate]
    }
  }

  await runTransaction(db, async tx => {
    const originalRef = doc(db, 'submissions', originalId)
    const snap = await tx.get(originalRef)
    if (!snap.exists()) throw new Error('找不到原始紀錄')
    if (snap.data()._isLatest !== true) throw new Error('這筆紀錄已經不是最新版本')

    tx.set(
      doc(db, 'submissions', voidId),
      stripUndefined({
        ...copy,
        _templateId: original._templateId,
        _templateName: original._templateName,
        _templateModule: original._templateModule,
        _templateAction: original._templateAction,
        _templateVersion: original._templateVersion,
        _submitterEmail: userEmail,
        _submittedAt: serverTimestamp(),
        _submittedMonth: currentMonth(),
        _status: 'VOID' as SubmissionStatus,
        _isLatest: true,
        _supersedes: originalId,
        _fieldLabels: original._fieldLabels,
        _optionLabels: original._optionLabels,
        _fieldKeys: original._fieldKeys,
        files: original.files || [],
      })
    )
    tx.update(originalRef, { _isLatest: false, _supersededBy: voidId })
  })

  return voidId
}

export interface SubmissionQuery {
  templateId?: string
  month?: string
  status?: SubmissionStatus | 'ALL'
  includeSuperseded?: boolean
  fieldKey?: string
  fieldValue?: string
  max?: number
}

export async function querySubmissions(
  q: SubmissionQuery = {},
  userEmail: string,
  isSuperuser: boolean
): Promise<Submission[]> {
  const max = q.max ?? 500
  const status = q.status ?? 'ACTIVE'
  const hasFieldFilter = !!(q.fieldKey && q.fieldValue)

  let rows: Submission[]

  if (hasFieldFilter) {
    // 跨表查詢：只用單一欄位條件（自動索引），排序與其他條件在前端處理。
    //
    // 同時跑 == 和 array-contains：下拉欄位存的是陣列，但舊資料或非下拉欄位
    // 存的是純值。Firestore 的 == 對陣列要求整個陣列一樣，array-contains 對
    // 非陣列則永遠不成立，所以兩個都跑再合併才不會漏。
    const baseConstraints: QueryConstraint[] = [fsLimit(max)]
    if (!isSuperuser) baseConstraints.push(where('_submitterEmail', '==', userEmail))

    const [exact, contains] = await Promise.all([
      getDocsFromServer(
        query(
          collection(db, 'submissions'),
          where(q.fieldKey!, '==', q.fieldValue!),
          ...baseConstraints
        )
      ),
      getDocsFromServer(
        query(
          collection(db, 'submissions'),
          where(q.fieldKey!, 'array-contains', q.fieldValue!),
          ...baseConstraints
        )
      ),
    ])
    const merged = new Map<string, Submission>()
    for (const snap of [exact, contains]) {
      for (const d of snap.docs) merged.set(d.id, { id: d.id, ...d.data() } as Submission)
    }
    rows = Array.from(merged.values())
  } else {
    const constraints: QueryConstraint[] = []
    if (!isSuperuser) constraints.push(where('_submitterEmail', '==', userEmail))
    if (!q.includeSuperseded) constraints.push(where('_isLatest', '==', true))
    if (q.templateId) constraints.push(where('_templateId', '==', q.templateId))
    if (q.month) constraints.push(where('_submittedMonth', '==', q.month))
    constraints.push(orderBy('_submittedAt', 'desc'), fsLimit(max))
    const snap = await getDocsFromServer(query(collection(db, 'submissions'), ...constraints))
    rows = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Submission[]
  }

  if (hasFieldFilter) {
    if (!q.includeSuperseded) rows = rows.filter(r => r._isLatest === true)
    if (q.templateId) rows = rows.filter(r => r._templateId === q.templateId)
    if (q.month) rows = rows.filter(r => r._submittedMonth === q.month)
  }

  if (status !== 'ALL') rows = rows.filter(r => r._status === status)

  return rows.sort((a, b) => {
    const at = toDate(a._submittedAt)?.getTime() ?? 0
    const bt = toDate(b._submittedAt)?.getTime() ?? 0
    return bt - at
  })
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const snap = await getDocFromServer(doc(db, 'submissions', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null
}

// 最近 N 個月，給篩選器用（不必查資料庫）
export function recentMonths(count = 18): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    out.push(currentMonth(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return out
}
