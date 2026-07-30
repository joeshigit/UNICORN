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
  getCountFromServer,
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
  canPresetFieldType,
  combinedKey,
  countKey,
  isLegacyDateKey,
  isPresetEmpty,
  isValidScalePoints,
  resolveScaleValueLabels,
  validateScaleValueLabels,
  validateStandardKeyCode,
  validateTypeValueModel,
  usesOptionSet,
  usesThreeShape,
} from './keys'
import type {
  FieldDefinition,
  FileInfo,
  FillAccessType,
  OptionItem,
  OptionSet,
  ScalePoints,
  ScaleValueLabel,
  StandardKey,
  StandardKeyStatus,
  StandardValueModel,
  Submission,
  SubmissionEventKind,
  SubmissionStatus,
  Template,
  UserRole,
} from '@/types'
import {
  browseCutoffDate,
  mergeBrowsePages,
  type ManagerBrowseScope,
} from './submissionView'

export type { ManagerBrowseScope }
export {
  applyRefineFilters,
  browseCutoffDate,
  BROWSE_MANAGER_MINE,
  BROWSE_MANAGER_VISIBLE,
  BROWSE_SUBMITTER,
  BROWSE_SUPERUSER,
  countHiddenVoid,
  maskVoid,
  mergeBrowsePages,
  resolveBrowseDefaultsForScope,
  type BrowseDefaults,
  type RefineCondition,
  type RefineOp,
} from './submissionView'

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

// ============================================
// Standard Keys（標準資料）
// ============================================

export async function listStandardKeys(): Promise<StandardKey[]> {
  const snap = await getDocsFromServer(query(collection(db, 'standardKeys'), orderBy('key')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as StandardKey[]
}

export async function getStandardKey(id: string): Promise<StandardKey | null> {
  const snap = await getDocFromServer(doc(db, 'standardKeys', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as StandardKey) : null
}

export interface StandardKeyCreateInput {
  key: string
  meaning: string
  defaultLabel: string
  type: FieldDefinition['type']
  valueModel: StandardValueModel
  optionSetId?: string
  scalePoints?: ScalePoints
  scaleValueLabels?: ScaleValueLabel[]
}

export interface StandardKeyUpdateInput {
  meaning?: string
  defaultLabel?: string
  status?: StandardKeyStatus
}

function assertCreatableStandard(input: StandardKeyCreateInput): void {
  const codeErr = validateStandardKeyCode(input.key)
  if (codeErr) throw new Error(codeErr)
  const vmErr = validateTypeValueModel(input.type, input.valueModel)
  if (vmErr) throw new Error(vmErr)
  if (!input.defaultLabel.trim()) throw new Error('請填預設顯示名稱')
  if (!input.meaning.trim()) throw new Error('請填意義說明')

  if (input.valueModel === 'optionSet') {
    if (!input.optionSetId) throw new Error('請選擇標準選項（Master）')
  } else if (input.valueModel === 'scale') {
    const labelErr = validateScaleValueLabels(input.scalePoints, input.scaleValueLabels)
    if (labelErr) throw new Error(labelErr)
  } else if (input.optionSetId || input.scalePoints || input.scaleValueLabels?.length) {
    throw new Error('自由填寫型標準問題不能帶標準選項或量表契約')
  }
}

export async function createStandardKey(input: StandardKeyCreateInput, userEmail: string): Promise<string> {
  assertCreatableStandard(input)

  const existing = await listStandardKeys()
  if (existing.some(s => s.key === input.key.trim())) {
    throw new Error(`標準 KEY「${input.key.trim()}」已經存在（含已停用）`)
  }

  if (input.valueModel === 'optionSet' && input.optionSetId) {
    const set = await getOptionSet(input.optionSetId)
    if (!set || !set.isMaster) throw new Error('標準選項型標準必須綁定 Master')
    if (set.code !== input.key.trim()) {
      throw new Error('MVP：標準 KEY 必須等於標準選項 code')
    }
  }

  const id = newId('standardKeys')
  const isScale = input.valueModel === 'scale'
  const isOption = input.valueModel === 'optionSet'
  await setDoc(
    doc(db, 'standardKeys', id),
    stripUndefined({
      key: input.key.trim(),
      meaning: input.meaning.trim(),
      defaultLabel: input.defaultLabel.trim(),
      type: input.type,
      valueModel: input.valueModel,
      optionSetId: isOption ? input.optionSetId : undefined,
      scalePoints: isScale ? input.scalePoints : undefined,
      scaleValueLabels: isScale
        ? input.scaleValueLabels!.map(l => ({ value: l.value, label: l.label.trim() }))
        : undefined,
      status: 'active' as StandardKeyStatus,
      createdBy: userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  )
  return id
}

/** 僅允許改 meaning／defaultLabel／status；答案契約 immutable */
export async function updateStandardKey(id: string, input: StandardKeyUpdateInput): Promise<void> {
  const current = await getStandardKey(id)
  if (!current) throw new Error('找不到這筆標準問題')

  const meaning = input.meaning !== undefined ? input.meaning.trim() : current.meaning
  const defaultLabel =
    input.defaultLabel !== undefined ? input.defaultLabel.trim() : current.defaultLabel
  if (!meaning) throw new Error('請填意義說明')
  if (!defaultLabel) throw new Error('請填預設顯示名稱')

  const status = input.status ?? current.status
  if (status !== 'active' && status !== 'deprecated') {
    throw new Error('狀態只能是 active 或 deprecated')
  }

  await updateDoc(doc(db, 'standardKeys', id), {
    meaning,
    defaultLabel,
    status,
    updatedAt: serverTimestamp(),
  })
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

/**
 * 正規化輸入模式：
 *  - open（或未設）不存 inputMode 與 presetValue，舊模板保持原樣
 *  - default 沒有值就降級成 open（不然它跟 open 沒有差別，只是多一個誤導的旗標）
 *  - locked 沒有值是合法的，代表鎖定為空白
 *  - 檔案欄位無法預填，一律降級成 open
 */
function normalizeInputMode(f: FieldDefinition): Pick<FieldDefinition, 'inputMode' | 'presetValue'> {
  const mode = f.inputMode ?? 'open'
  if (mode === 'open' || !canPresetFieldType(f.type)) {
    return { inputMode: undefined, presetValue: undefined }
  }

  const empty = isPresetEmpty(f.presetValue)
  if (mode === 'default' && empty) {
    return { inputMode: undefined, presetValue: undefined }
  }

  return {
    inputMode: mode,
    presetValue: empty ? undefined : f.presetValue,
  }
}

function cleanScaleValueLabels(f: FieldDefinition, scalePoints: ScalePoints | undefined): ScaleValueLabel[] | undefined {
  if (f.type !== 'scale' || !scalePoints) return undefined
  if (!f.scaleValueLabels?.length) return undefined
  if (validateScaleValueLabels(scalePoints, f.scaleValueLabels)) return undefined
  return f.scaleValueLabels.map(l => ({ value: l.value, label: l.label.trim() }))
}

function cleanFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((f, i) => {
    const { inputMode, presetValue } = normalizeInputMode(f)
    const isScale = f.type === 'scale'
    const scalePoints = isScale && isValidScalePoints(f.scalePoints) ? f.scalePoints : isScale ? 5 : undefined
    return stripUndefined({
      key: f.key,
      type: f.type,
      label: f.label.trim(),
      required: !!f.required,
      order: i,
      helpText: f.helpText?.trim() || undefined,
      optionSetId: usesOptionSet(f.type) ? f.optionSetId : undefined,
      multiple: f.type === 'choice' && f.multiple ? true : f.type === 'dropdown' && f.multiple ? true : undefined,
      scalePoints,
      scaleValueLabels: cleanScaleValueLabels(f, scalePoints),
      inputMode,
      presetValue,
    })
  })
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

/** 刪除保護用。伺服器端聚合，不必把文件撈回來。 */
export async function countSubmissionsForTemplate(templateId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, 'submissions'), where('_templateId', '==', templateId))
  )
  return snap.data().count
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

/**
 * 同一張表的每一筆資料形狀必須完全相同。
 *
 * 空白是一個答案，不是欄位消失——每個被問到的問題，每一筆都要有對應的欄位：
 *
 *   文字／多行／數字／日期／時間   有值 → 值      空白 → null      查空白：== null
 *   下拉                          ['A']/'A'/1    []/''/0          查空白：<key>Count == 0
 *   檔案                          數量           0                查空白：== 0
 *
 * 為什麼不能讓 KEY 消失：缺少的欄位在 Firestore 不是一個值，是索引上的一個洞。
 * 任何條件都撈不到它（連 != 也不行），orderBy 那個欄位時整筆紀錄會直接消失。
 */
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
    if (usesThreeShape(field.type)) {
      // dropdown／choice／scale：空白＝[] / '' / 0，不是 null（Count 可查）
      const order =
        field.type === 'scale'
          ? resolveScaleValueLabels(field).map(o => o.value)
          : optionOrder[field.key]
      const picked = canonicalOrder(asArray(values[field.key]), order)
      payload[field.key] = picked
      payload[combinedKey(field.key)] = picked.join(', ')
      payload[countKey(field.key)] = picked.length
      continue
    }

    // 空白一律寫 null，不要讓 KEY 消失。
    //
    // 缺少的欄位在 Firestore 不是一個值，是索引上的一個洞：任何條件都撈不到它，
    // orderBy 那個欄位時整筆紀錄會直接消失。null 是真正的值，可以用 == null 查、
    // orderBy 會納入（排最前）、數字的範圍查詢也會正確排除它——就是標準的可空欄位語意。
    //
    // 這樣同一張表的每一筆資料形狀完全相同，不需要記「哪些型別空白會少一個欄位」。
    const value = values[field.key]
    const blank =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    payload[field.key] = blank ? null : value
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

/** 單次顯示上限。超過就擋下，請使用者縮小月份範圍。 */
export const QUERY_DISPLAY_LIMIT = 500

/** 單次匯出上限 */
export const EXPORT_HARD_CAP = 20_000

export interface SubmissionQuery {
  /** 必填：提交月份範圍（YYYY-MM，字典序比較） */
  fromMonth: string
  toMonth: string
  /** 送進 Firestore 的第二個條件 */
  templateId?: string
  /** 是否連被更正的舊版本一起取（伺服器條件） */
  includeSuperseded?: boolean
}

export type SubmissionQueryResult =
  | { blocked: true; count: number; limit: number }
  /** rows 含 VOID；畫面遮罩／精修在 UI 層。count = 取回筆數（此範圍完整）。 */
  | { blocked: false; rows: Submission[]; count: number }

export interface BrowseQuery {
  days: number
  pageSize: number
  includeSuperseded?: boolean
  /**
   * Manager：visible = 自己 ∪ 所管表格；mine = 只看自己。
   * Submitter／非 Manager 一律等同 mine。
   */
  managerScope?: ManagerBrowseScope
  /** 上一頁各隔離腿的 cursor；與 isolation sets 對齊 */
  setCursors?: Array<QueryDocumentSnapshot<DocumentData> | null>
  /** 與 sets 對齊；true = 該腿已無更多，不再查詢 */
  legExhausted?: boolean[]
}

export interface BrowseResult {
  rows: Submission[]
  hasMore: boolean
  setCursors: Array<QueryDocumentSnapshot<DocumentData> | null>
  legExhausted: boolean[]
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

/**
 * 送進 Firestore 的條件。計數與取資料共用同一份，兩處分開寫必定漂移。
 *
 * 用 _submittedMonth（YYYY-MM 字串）做範圍而不是 _submittedAt，是為了避開時區：
 * 那個月份桶在寫入當下就已經按 Asia/Macau 算好了。
 */
function rangeConstraints(q: SubmissionQuery): QueryConstraint[] {
  const constraints: QueryConstraint[] = []
  if (!q.includeSuperseded) constraints.push(where('_isLatest', '==', true))
  if (q.templateId) constraints.push(where('_templateId', '==', q.templateId))
  constraints.push(where('_submittedMonth', '>=', q.fromMonth))
  constraints.push(where('_submittedMonth', '<=', q.toMonth))
  return constraints
}

/** 不等式欄位必須是第一個 orderBy */
function displayOrder(): QueryConstraint[] {
  return [orderBy('_submittedMonth', 'asc'), orderBy('_submittedAt', 'desc')]
}

/**
 * 每一組回傳值代表一次獨立查詢要額外加上的條件。
 * Superuser 只需要一次；其他人需要「自己填的」加上「自己管的表格」。
 *
 * 擁有者那一組必須用 _submitterUid 而不是 _submitterEmail：
 * 清單查詢的規則是對「查詢條件推導出的 resource」求值，沒有被條件約束的欄位是
 * undefined。firestore.rules 的 isOwnerOfRecord() 檢查 _submitterUid，所以查詢
 * 也必須約束同一個欄位，否則規則判不出擁有者身分而整個查詢被拒。
 */
function isolationPlan(
  q: SubmissionQuery,
  actor: Actor,
  isSuperuser: boolean,
  managedTemplateIds: string[]
): QueryConstraint[][] {
  if (isSuperuser) return [[]]

  const sets: QueryConstraint[][] = [[where('_submitterUid', '==', actor.uid)]]

  if (q.templateId) {
    // 已指定表格時不能再加 _templateId 的 in 條件（會和 rangeConstraints 的 == 衝突）。
    // 只要那張表在管理清單內，就多跑一次不限提交者的查詢。
    if (managedTemplateIds.includes(q.templateId)) sets.push([])
  } else {
    for (const batch of chunk(managedTemplateIds, FIRESTORE_IN_LIMIT)) {
      sets.push([where('_templateId', 'in', batch)])
    }
  }

  return sets
}

async function resolveIsolation(
  q: SubmissionQuery,
  actor: Actor,
  isSuperuser: boolean
): Promise<QueryConstraint[][]> {
  if (isSuperuser) return [[]]
  const role = await getUserRole(actor.email)
  const managedTemplateIds = await listManagedTemplateIds(role?.groups || [])
  return isolationPlan(q, actor, isSuperuser, managedTemplateIds)
}

/**
 * 各組查詢的筆數相加是**上界**：同一筆可能既是自己填的、又屬於自己管的表格，
 * 會被重複計。上界是安全的（相加 ≤ 上限就一定安全），代價是偶爾多擋一次，
 * 使用者再縮小一次月份範圍即可。這不是 bug。
 *
 * displayOrder() 必須保留，即使計數不需要排序。
 * 少了它 Firestore 會自己補 __name__ 當最後的排序鍵，於是要求一組結尾是
 * __name__ 的索引——和取資料用的那組（結尾是 _submittedAt）不同，等於每種
 * 等值組合都要多一個索引。加上排序就與取資料共用同一個索引。
 * 兩個排序欄位每筆都有值，所以不會影響筆數。
 */
async function countIsolated(
  whereConstraints: QueryConstraint[],
  sets: QueryConstraint[][]
): Promise<number> {
  let total = 0
  for (const extra of sets) {
    const snap = await getCountFromServer(
      query(collection(db, 'submissions'), ...extra, ...whereConstraints, ...displayOrder())
    )
    total += snap.data().count
  }
  return total
}

async function fetchIsolated(
  whereConstraints: QueryConstraint[],
  sets: QueryConstraint[][],
  limit: number
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>()
  for (const extra of sets) {
    const snap = await getDocsFromServer(
      query(
        collection(db, 'submissions'),
        ...extra,
        ...whereConstraints,
        ...displayOrder(),
        fsLimit(limit)
      )
    )
    for (const d of snap.docs) merged.set(d.id, d)
  }
  return Array.from(merged.values())
}

async function fetchAllIsolated(
  whereConstraints: QueryConstraint[],
  sets: QueryConstraint[][],
  pageSize: number,
  hardCap: number
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>()
  for (const extra of sets) {
    let last: QueryDocumentSnapshot<DocumentData> | null = null
    for (;;) {
      const constraints: QueryConstraint[] = [
        ...extra,
        ...whereConstraints,
        ...displayOrder(),
        fsLimit(pageSize),
      ]
      if (last) constraints.push(startAfter(last))

      const snap = await getDocsFromServer(query(collection(db, 'submissions'), ...constraints))
      if (snap.empty) break
      for (const d of snap.docs) merged.set(d.id, d)
      last = snap.docs[snap.docs.length - 1]
      if (snap.docs.length < pageSize) break
      if (merged.size >= hardCap) break
    }
  }
  return Array.from(merged.values())
}

function assertMonthRange(q: SubmissionQuery, action: string): void {
  if (!q.fromMonth || !q.toMonth) throw new Error(`${action}必須指定提交月份範圍`)
  if (q.fromMonth > q.toMonth) throw new Error('月份範圍的起始不能晚於結束')
}

/**
 * Browse 隔離：mine 只跑擁有者那組；visible／Superuser 沿用 isolationPlan。
 * 不改 isolationPlan 語意——mine 以空 managed 清單表達「不要管表格那幾腿」。
 */
async function resolveBrowseIsolation(
  actor: Actor,
  isSuperuser: boolean,
  managerScope: ManagerBrowseScope
): Promise<QueryConstraint[][]> {
  if (isSuperuser) return [[]]
  if (managerScope === 'mine') {
    return isolationPlan({ fromMonth: '', toMonth: '' }, actor, false, [])
  }
  const role = await getUserRole(actor.email)
  const managedTemplateIds = await listManagedTemplateIds(role?.groups || [])
  return isolationPlan({ fromMonth: '', toMonth: '' }, actor, false, managedTemplateIds)
}

function browseWhereConstraints(includeSuperseded: boolean, cutoff: Date): QueryConstraint[] {
  const constraints: QueryConstraint[] = []
  if (!includeSuperseded) constraints.push(where('_isLatest', '==', true))
  constraints.push(where('_submittedAt', '>=', Timestamp.fromDate(cutoff)))
  return constraints
}

/**
 * 資料池 Browse：時間窗 + 角色 pageSize，無 count 閘門。
 * 多腿合併後取前 pageSize 為近似「可見範圍最新」；完整月份請走 querySubmissions。
 */
export async function browseSubmissions(
  q: BrowseQuery,
  actor: Actor,
  isSuperuser: boolean
): Promise<BrowseResult> {
  if (!q.days || q.days < 1) throw new Error('Browse 必須指定天數')
  if (!q.pageSize || q.pageSize < 1) throw new Error('Browse 必須指定每頁筆數')

  const managerScope: ManagerBrowseScope = q.managerScope ?? 'visible'
  const sets = await resolveBrowseIsolation(actor, isSuperuser, managerScope)
  const cutoff = browseCutoffDate(q.days)
  const whereConstraints = browseWhereConstraints(!!q.includeSuperseded, cutoff)
  const prevCursors = q.setCursors || []
  const prevExhausted = q.legExhausted || sets.map(() => false)

  const pages: QueryDocumentSnapshot<DocumentData>[][] = []
  const nextCursors: Array<QueryDocumentSnapshot<DocumentData> | null> = []
  const nextLegExhausted: boolean[] = []

  for (let i = 0; i < sets.length; i++) {
    if (prevExhausted[i]) {
      pages.push([])
      nextCursors.push(prevCursors[i] ?? null)
      nextLegExhausted.push(true)
      continue
    }

    const extra = sets[i]
    const constraints: QueryConstraint[] = [
      ...extra,
      ...whereConstraints,
      orderBy('_submittedAt', 'desc'),
      fsLimit(q.pageSize),
    ]
    const cursor = prevCursors[i]
    if (cursor) constraints.push(startAfter(cursor))

    const snap = await getDocsFromServer(query(collection(db, 'submissions'), ...constraints))
    pages.push(snap.docs)

    if (snap.docs.length < q.pageSize) {
      nextCursors.push(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : (cursor ?? null))
      nextLegExhausted.push(true)
    } else {
      nextCursors.push(snap.docs[snap.docs.length - 1])
      nextLegExhausted.push(false)
    }
  }

  const merged = mergeBrowsePages(pages, q.pageSize, doc => {
    const at = toDate(doc.data()._submittedAt)?.getTime() ?? 0
    return at
  })

  return {
    rows: sortBySubmittedAtDesc(mapDocs(merged)),
    hasMore: nextLegExhausted.some(exhausted => !exhausted),
    setCursors: nextCursors,
    legExhausted: nextLegExhausted,
  }
}

/** 使用者是否管理至少一張表（決定 Manager Browse UI）。 */
export async function userIsManager(email: string): Promise<boolean> {
  const role = await getUserRole(email)
  const ids = await listManagedTemplateIds(role?.groups || [])
  return ids.length > 0
}

export async function querySubmissions(
  q: SubmissionQuery,
  actor: Actor,
  isSuperuser: boolean
): Promise<SubmissionQueryResult> {
  assertMonthRange(q, '查詢')

  const sets = await resolveIsolation(q, actor, isSuperuser)
  const whereConstraints = rangeConstraints(q)

  // 閘門：超過上限就不取資料，省下數百次文件讀取
  const count = await countIsolated(whereConstraints, sets)
  if (count > QUERY_DISPLAY_LIMIT) {
    return { blocked: true, count, limit: QUERY_DISPLAY_LIMIT }
  }

  const docs = await fetchIsolated(whereConstraints, sets, QUERY_DISPLAY_LIMIT)
  // 保留 VOID；遮罩與精修在 UI
  const rows = sortBySubmittedAtDesc(mapDocs(docs))

  return { blocked: false, rows, count: rows.length }
}

/**
 * 完整匯出：不套用顯示上限，走 cursor 分頁把整個月份範圍取完。
 * 這是筆數超過顯示上限時的正式出口。含 VOID。
 */
export async function exportAllSubmissions(
  q: SubmissionQuery,
  actor: Actor,
  isSuperuser: boolean,
  pageSize = 500
): Promise<Submission[]> {
  assertMonthRange(q, '匯出')

  const sets = await resolveIsolation(q, actor, isSuperuser)
  const whereConstraints = rangeConstraints(q)

  const count = await countIsolated(whereConstraints, sets)
  if (count > EXPORT_HARD_CAP) {
    throw new Error(
      `這個範圍有 ${count} 筆，超過單次匯出上限 ${EXPORT_HARD_CAP} 筆，請縮小月份範圍`
    )
  }

  const docs = await fetchAllIsolated(whereConstraints, sets, pageSize, EXPORT_HARD_CAP)
  return sortBySubmittedAtDesc(mapDocs(docs))
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

/** 月份快捷範圍。offset 0 = 本月、1 = 上月；span 為往前涵蓋幾個月。 */
export function monthRange(offset = 0, span = 1): { fromMonth: string; toMonth: string } {
  const now = new Date()
  const to = currentMonth(new Date(now.getFullYear(), now.getMonth() - offset, 15))
  const from = currentMonth(new Date(now.getFullYear(), now.getMonth() - offset - (span - 1), 15))
  return { fromMonth: from, toMonth: to }
}
