// ============================================
// 🦄 UNICORN Capture — Firestore 資料層
//
// 四層：
//   optionSets / templates / submissions / uploadSessions(+derived)
// 寫入當下決定好的衍生值全部存進 submission。
// 讀取一律用 *FromServer。
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
  startAfter,
  runTransaction,
  serverTimestamp,
  QueryConstraint,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { BUSINESS_TIMEZONE } from './config'
import {
  MODULE_CODE,
  ACTION_CODE,
  MANAGER_GROUP_CODE,
  combinedKey,
  countKey,
  isLegacyDateKey,
} from './keys'
import type {
  FieldDefinition,
  FileInfo,
  FillAccessType,
  OptionItem,
  OptionSet,
  Submission,
  SubmissionEventKind,
  SubmissionStatus,
  Template,
  UserRole,
} from '@/types'

/** Firestore `in` / `array-contains-any` 目前 disjunction 上限 */
export const FIRESTORE_IN_LIMIT = 30

export interface Actor {
  uid: string
  email: string
}

// ---------- 共用小工具 ----------

/** 以 Asia/Macau 計算 YYYY-MM */
export function currentMonth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  return `${y}-${m}`
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

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function eventTypeOf(moduleId: string, actionId: string): string {
  return `${moduleId}.${actionId}`
}

/** 掃描模板是否仍使用已退役日期 KEY */
export function findLegacyDateKeyUsage(
  templates: Template[]
): Array<{ templateId: string; templateName: string; keys: string[] }> {
  return templates
    .map(t => ({
      templateId: t.id || '',
      templateName: t.name,
      keys: t.fields.map(f => f.key).filter(isLegacyDateKey),
    }))
    .filter(x => x.keys.length > 0)
}

export function canUserFillTemplate(template: Template, groups: string[], isSuperuser: boolean): boolean {
  if (isSuperuser) return !!template.enabled
  if (!template.enabled) return false
  const access: FillAccessType = template.fillAccessType || 'allOrgUsers'
  if (access === 'allOrgUsers') return true
  const fillGroups = template.fillGroups || []
  return fillGroups.some(g => groups.includes(g))
}

// ============================================
// User Roles
// ============================================

export async function getUserRole(email: string): Promise<UserRole | null> {
  const snap = await getDocFromServer(doc(db, 'userRoles', email.toLowerCase()))
  return snap.exists() ? ({ email: snap.id, ...snap.data() } as UserRole) : null
}

export async function updateUserGroups(email: string, groups: string[], byEmail: string) {
  await setDoc(doc(db, 'userRoles', email.toLowerCase()), {
    groups,
    updatedAt: serverTimestamp(),
    updatedBy: byEmail,
  })
}

// ============================================
// Upload Sessions
// ============================================

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

export async function ensureUploadSession(submissionId: string, actor: Actor): Promise<void> {
  await setDoc(
    doc(db, 'uploadSessions', submissionId),
    {
      uid: actor.uid,
      email: actor.email.toLowerCase(),
      submissionId,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + SESSION_TTL_MS)),
    },
    { merge: true }
  )
}

export async function deleteUploadSession(submissionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'uploadSessions', submissionId))
  } catch {
    // 忽略
  }
}

/**
 * 孤兒 session／檔案清理設計（稍後排程後端實作，不放寬 Storage 規則）：
 * 1. 列出 expiresAt < now 的 uploadSessions
 * 2. 若對應 submissions/{id} 不存在 → 刪除 Storage uploads/{uid}/{id}/** 與 session
 * 3. 若 submission 已存在 → 只刪 session（檔案已定稿）
 */

// ============================================
// OptionSets
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

export async function ensureCoreOptionSets(userEmail: string): Promise<void> {
  const existing = await listOptionSets()
  const codes = new Set(existing.map(os => os.code))

  const seeds: Array<{ code: string; name: string; items: string[] }> = [
    { code: MODULE_CODE, name: '表格分類', items: ['GENERAL'] },
    { code: ACTION_CODE, name: '表格動作', items: ['RECORD'] },
    {
      code: MANAGER_GROUP_CODE,
      name: '管理員群組',
      items: ['SCD Manager', 'Admin Manager', 'Training Manager'],
    },
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
// Templates
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
  managerGroups?: string[]
  fillAccessType?: FillAccessType
  fillGroups?: string[]
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
  const fillAccessType: FillAccessType = input.fillAccessType || 'allOrgUsers'
  await setDoc(
    doc(db, 'templates', id),
    stripUndefined({
      name: input.name.trim(),
      moduleId: input.moduleId,
      actionId: input.actionId,
      description: input.description?.trim() || '',
      enabled: input.enabled,
      managerGroups: input.managerGroups || [],
      fillAccessType,
      fillGroups: fillAccessType === 'groups' ? input.fillGroups || [] : [],
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

export async function updateTemplate(
  id: string,
  input: TemplateInput,
  currentVersion: number,
  fieldsChanged: boolean
): Promise<void> {
  const fillAccessType: FillAccessType = input.fillAccessType || 'allOrgUsers'
  await updateDoc(doc(db, 'templates', id), {
    name: input.name.trim(),
    moduleId: input.moduleId,
    actionId: input.actionId,
    description: input.description?.trim() || '',
    enabled: input.enabled,
    managerGroups: input.managerGroups || [],
    fillAccessType,
    fillGroups: fillAccessType === 'groups' ? input.fillGroups || [] : [],
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

/** 分批查詢使用者可管理的模板（不截斷群組） */
export async function listManagedTemplateIds(groups: string[]): Promise<string[]> {
  if (groups.length === 0) return []
  const ids = new Set<string>()
  for (const batch of chunk(groups, FIRESTORE_IN_LIMIT)) {
    const snap = await getDocsFromServer(
      query(collection(db, 'templates'), where('managerGroups', 'array-contains-any', batch))
    )
    for (const d of snap.docs) ids.add(d.id)
  }
  return Array.from(ids)
}

// ============================================
// Submissions
// ============================================

export interface SubmitInput {
  template: Template
  values: Record<string, unknown>
  files: FileInfo[]
  optionLabels: Record<string, string>
  optionOrder: Record<string, string[]>
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => v !== '' && v != null).map(String)
  if (value === '' || value == null) return []
  return [String(value)]
}

function canonicalOrder(picked: string[], order?: string[]): string[] {
  const unique = Array.from(new Set(picked))
  if (!order || order.length === 0) return unique.sort()
  const rank = new Map(order.map((value, index) => [value, index]))
  return unique.sort(
    (a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER)
  )
}

function buildSubmissionDoc(
  input: SubmitInput,
  owner: Actor,
  actor: Actor,
  eventKind: SubmissionEventKind,
  extra: Partial<Submission>
): Record<string, unknown> {
  const { template, values, files, optionLabels, optionOrder } = input

  const fieldLabels: Record<string, string> = {}
  const fieldKeys: string[] = []
  for (const field of template.fields) {
    fieldLabels[field.key] = field.label
    fieldKeys.push(field.key)
  }

  // 檔案 metadata 不存永久 URL
  const safeFiles = files.map(({ url: _url, ...rest }) => rest)

  const payload: Record<string, unknown> = {
    _templateId: template.id,
    _templateName: template.name,
    _templateModule: template.moduleId,
    _templateAction: template.actionId,
    _eventType: eventTypeOf(template.moduleId, template.actionId),
    _templateVersion: template.version,
    _submitterUid: owner.uid,
    _submitterEmail: owner.email.toLowerCase(),
    _actorUid: actor.uid,
    _actorEmail: actor.email.toLowerCase(),
    _eventKind: eventKind,
    _submittedAt: serverTimestamp(),
    _submittedMonth: currentMonth(),
    _status: 'ACTIVE' as SubmissionStatus,
    _isLatest: true,
    _fieldLabels: fieldLabels,
    _optionLabels: optionLabels,
    _fieldKeys: fieldKeys,
    files: safeFiles,
    ...extra,
  }

  for (const field of template.fields) {
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

export function newSubmissionId(): string {
  return newId('submissions')
}

export async function createSubmission(
  input: SubmitInput,
  actor: Actor,
  id: string = newId('submissions')
): Promise<string> {
  await setDoc(doc(db, 'submissions', id), buildSubmissionDoc(input, actor, actor, 'CREATE', {}))
  await deleteUploadSession(id)
  return id
}

export async function correctSubmission(
  originalId: string,
  input: SubmitInput,
  actor: Actor,
  newSubmissionId: string = newId('submissions')
): Promise<string> {
  await runTransaction(db, async tx => {
    const originalRef = doc(db, 'submissions', originalId)
    const original = await tx.get(originalRef)
    if (!original.exists()) throw new Error('找不到原始紀錄')
    const data = original.data()
    if (data._isLatest !== true) throw new Error('這筆紀錄已經被更正過了')

    const owner: Actor = {
      uid: String(data._submitterUid || actor.uid),
      email: String(data._submitterEmail || actor.email),
    }

    tx.set(
      doc(db, 'submissions', newSubmissionId),
      buildSubmissionDoc(input, owner, actor, 'CORRECTION', { _supersedes: originalId })
    )
    tx.update(originalRef, { _isLatest: false, _supersededBy: newSubmissionId })
  })
  await deleteUploadSession(newSubmissionId)
  return newSubmissionId
}

export async function voidSubmission(original: Submission, actor: Actor): Promise<string> {
  const originalId = original.id!
  const voidId = newId('submissions')

  const copy: Record<string, unknown> = {}
  for (const key of original._fieldKeys || []) {
    for (const candidate of [key, combinedKey(key), countKey(key)]) {
      if (original[candidate] !== undefined) copy[candidate] = original[candidate]
    }
  }

  const owner: Actor = {
    uid: original._submitterUid || actor.uid,
    email: original._submitterEmail || actor.email,
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
        _eventType: original._eventType || eventTypeOf(original._templateModule, original._templateAction),
        _templateVersion: original._templateVersion,
        _submitterUid: owner.uid,
        _submitterEmail: owner.email.toLowerCase(),
        _actorUid: actor.uid,
        _actorEmail: actor.email.toLowerCase(),
        _eventKind: 'VOID' as SubmissionEventKind,
        _submittedAt: serverTimestamp(),
        _submittedMonth: currentMonth(),
        _status: 'VOID' as SubmissionStatus,
        _isLatest: true,
        _supersedes: originalId,
        _fieldLabels: original._fieldLabels,
        _optionLabels: original._optionLabels,
        _fieldKeys: original._fieldKeys,
        files: (original.files || []).map(({ url: _url, ...rest }) => rest),
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
  /** 對應 _templateModule */
  module?: string
  /** 對應 _templateAction */
  action?: string
  fieldKey?: string
  fieldValue?: string
  max?: number
}

export interface SubmissionQueryResult {
  rows: Submission[]
  truncated: boolean
}

function mapDocs(docs: QueryDocumentSnapshot<DocumentData>[]): Submission[] {
  return docs.map(d => ({ id: d.id, ...d.data() } as Submission))
}

function sortBySubmittedAtDesc(rows: Submission[]): Submission[] {
  return rows.sort((a, b) => {
    const at = toDate(a._submittedAt)?.getTime() ?? 0
    const bt = toDate(b._submittedAt)?.getTime() ?? 0
    return bt - at
  })
}

async function fetchIsolationDocs(
  baseConstraints: QueryConstraint[],
  userEmail: string,
  isSuperuser: boolean,
  managedTemplateIds: string[]
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  if (isSuperuser) {
    const snap = await getDocsFromServer(query(collection(db, 'submissions'), ...baseConstraints))
    return snap.docs
  }

  const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>()

  const ownSnap = await getDocsFromServer(
    query(
      collection(db, 'submissions'),
      where('_submitterEmail', '==', userEmail.toLowerCase()),
      ...baseConstraints
    )
  )
  for (const d of ownSnap.docs) merged.set(d.id, d)

  for (const batch of chunk(managedTemplateIds, FIRESTORE_IN_LIMIT)) {
    const managedSnap = await getDocsFromServer(
      query(collection(db, 'submissions'), where('_templateId', 'in', batch), ...baseConstraints)
    )
    for (const d of managedSnap.docs) merged.set(d.id, d)
  }

  return Array.from(merged.values())
}

export async function querySubmissions(
  q: SubmissionQuery = {},
  userEmail: string,
  isSuperuser: boolean
): Promise<SubmissionQueryResult> {
  const max = q.max ?? 500
  const fetchLimit = max + 1
  const status = q.status ?? 'ACTIVE'
  const hasFieldFilter = !!(q.fieldKey && q.fieldValue)

  let managedTemplateIds: string[] = []
  if (!isSuperuser) {
    const role = await getUserRole(userEmail)
    managedTemplateIds = await listManagedTemplateIds(role?.groups || [])
  }

  let rows: Submission[]

  if (hasFieldFilter) {
    const exactDocs = await fetchIsolationDocs(
      [where(q.fieldKey!, '==', q.fieldValue!), fsLimit(fetchLimit)],
      userEmail,
      isSuperuser,
      managedTemplateIds
    )
    const containsDocs = await fetchIsolationDocs(
      [where(q.fieldKey!, 'array-contains', q.fieldValue!), fsLimit(fetchLimit)],
      userEmail,
      isSuperuser,
      managedTemplateIds
    )
    const merged = new Map<string, Submission>()
    for (const d of [...exactDocs, ...containsDocs]) {
      merged.set(d.id, { id: d.id, ...d.data() } as Submission)
    }
    rows = Array.from(merged.values())
  } else {
    const constraints: QueryConstraint[] = []
    if (!q.includeSuperseded) constraints.push(where('_isLatest', '==', true))
    if (q.templateId) constraints.push(where('_templateId', '==', q.templateId))
    if (q.month) constraints.push(where('_submittedMonth', '==', q.month))
    if (q.module) constraints.push(where('_templateModule', '==', q.module))
    if (q.action) constraints.push(where('_templateAction', '==', q.action))
    constraints.push(orderBy('_submittedAt', 'desc'), fsLimit(fetchLimit))

    const docs = await fetchIsolationDocs(constraints, userEmail, isSuperuser, managedTemplateIds)
    rows = mapDocs(docs)
  }

  if (hasFieldFilter) {
    if (!q.includeSuperseded) rows = rows.filter(r => r._isLatest === true)
    if (q.templateId) rows = rows.filter(r => r._templateId === q.templateId)
    if (q.month) rows = rows.filter(r => r._submittedMonth === q.month)
    if (q.module) rows = rows.filter(r => r._templateModule === q.module)
    if (q.action) rows = rows.filter(r => r._templateAction === q.action)
  }

  if (status !== 'ALL') rows = rows.filter(r => r._status === status)

  rows = sortBySubmittedAtDesc(rows)
  const truncated = rows.length > max
  if (truncated) rows = rows.slice(0, max)

  return { rows, truncated }
}

/** 分頁完整匯出：不靜默停在 500 */
export async function exportAllSubmissions(
  q: SubmissionQuery = {},
  userEmail: string,
  isSuperuser: boolean,
  pageSize = 500
): Promise<Submission[]> {
  const all: Submission[] = []
  let page = 0
  const hardCap = 50_000

  // 非 Superuser 仍走 isolation 合併路徑（無法用單一 cursor）；分批提高 max
  if (!isSuperuser) {
    let cursorMax = pageSize
    while (cursorMax <= hardCap) {
      const { rows, truncated } = await querySubmissions(
        { ...q, max: cursorMax },
        userEmail,
        isSuperuser
      )
      if (!truncated) return rows
      cursorMax *= 2
    }
    throw new Error('匯出筆數超過上限，請縮小篩選條件')
  }

  // Superuser：真正 cursor 分頁
  let last: QueryDocumentSnapshot<DocumentData> | null = null
  while (all.length < hardCap) {
    const constraints: QueryConstraint[] = []
    if (!q.includeSuperseded) constraints.push(where('_isLatest', '==', true))
    if (q.templateId) constraints.push(where('_templateId', '==', q.templateId))
    if (q.month) constraints.push(where('_submittedMonth', '==', q.month))
    if (q.module) constraints.push(where('_templateModule', '==', q.module))
    if (q.action) constraints.push(where('_templateAction', '==', q.action))
    if (q.status && q.status !== 'ALL') constraints.push(where('_status', '==', q.status))
    constraints.push(orderBy('_submittedAt', 'desc'), fsLimit(pageSize))
    if (last) constraints.push(startAfter(last))

    const snap = await getDocsFromServer(query(collection(db, 'submissions'), ...constraints))
    if (snap.empty) break

    let batch = mapDocs(snap.docs)
    if (q.fieldKey && q.fieldValue) {
      batch = batch.filter(r => {
        const raw = r[q.fieldKey!]
        if (Array.isArray(raw)) return raw.includes(q.fieldValue!)
        return raw === q.fieldValue
      })
    }
    all.push(...batch)
    last = snap.docs[snap.docs.length - 1]
    page += 1
    if (snap.docs.length < pageSize) break
    if (page > 200) break
  }

  return sortBySubmittedAtDesc(all)
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const snap = await getDocFromServer(doc(db, 'submissions', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null
}

export function recentMonths(count = 18): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    out.push(currentMonth(new Date(now.getFullYear(), now.getMonth() - i, 15)))
  }
  return out
}
