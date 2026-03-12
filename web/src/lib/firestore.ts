// ============================================
// 獨角獸 - Firestore 服務函數
// ============================================

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firebase'
import type { 
  Template, 
  OptionSet, 
  Submission, 
  FieldDefinition,
  OptionRequest,
  OptionRequestType,
  OptionRequestPayload,
  UserFormStats,
  OptionSetDraft,
  TemplateDraft,
  TemplateSuggestion
} from '@/types'

// ============================================
// Templates（表格定義）
// ============================================

export async function getTemplates(): Promise<Template[]> {
  const q = query(collection(db, 'templates'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Template[]
}

export async function getEnabledTemplates(): Promise<Template[]> {
  // 簡化查詢，只篩選 enabled，排序在前端處理
  const q = query(
    collection(db, 'templates'), 
    where('enabled', '==', true)
  )
  const snapshot = await getDocs(q)
  const templates = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Template[]
  
  // 在前端排序
  return templates.sort((a, b) => {
    if (a.moduleId !== b.moduleId) {
      return a.moduleId.localeCompare(b.moduleId)
    }
    return a.actionId.localeCompare(b.actionId)
  })
}

export async function getTemplate(id: string): Promise<Template | null> {
  const docRef = doc(db, 'templates', id)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Template
  }
  return null
}

// 🦄 UNICORN: Template version snapshot 結構
interface TemplateVersionSnapshot {
  name: string
  moduleId: string
  actionId: string
  enabled: boolean
  fields: FieldDefinition[]
  defaults?: Record<string, unknown>
  createdBy: string
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>
}

export async function createTemplate(
  data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail: string
): Promise<string> {
  // 🦄 UNICORN: 新建 template 時 version = 1
  const version = 1
  const now = serverTimestamp()
  
  // 1. 建立 head document
  const docRef = await addDoc(collection(db, 'templates'), {
    ...data,
    version,
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now
  })
  
  // 2. 🦄 UNICORN: 寫入 version 1 快照到 subcollection
  // 注意：Firestore 不允許 undefined 值，所以只包含有值的欄位
  const versionSnapshot: TemplateVersionSnapshot = {
    name: data.name,
    moduleId: data.moduleId,
    actionId: data.actionId,
    enabled: data.enabled,
    fields: data.fields || [],
    createdBy: userEmail,
    createdAt: now,
    ...(data.defaults && { defaults: data.defaults })  // 只在有值時加入
  }
  
  await setDoc(
    doc(db, 'templates', docRef.id, 'versions', String(version)),
    versionSnapshot
  )
  
  return docRef.id
}

export async function updateTemplate(
  id: string, 
  data: Partial<Omit<Template, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  // 🦄 UNICORN: 先取得目前版本號
  const currentDoc = await getDoc(doc(db, 'templates', id))
  if (!currentDoc.exists()) {
    throw new Error('Template not found')
  }
  
  const currentData = currentDoc.data()
  const currentVersion = currentData.version || 1
  const newVersion = currentVersion + 1
  const now = serverTimestamp()
  
  // 1. 更新 head document（含新版本號）
  const headUpdate = {
    ...data,
    version: newVersion,
    updatedAt: now
  }
  await updateDoc(doc(db, 'templates', id), headUpdate)
  
  // 2. 🦄 UNICORN: 寫入新版本快照到 subcollection
  // 合併現有資料與更新資料
  const mergedData = { ...currentData, ...data }
  // 注意：Firestore 不允許 undefined 值，所以只包含有值的欄位
  const versionSnapshot: TemplateVersionSnapshot = {
    name: mergedData.name,
    moduleId: mergedData.moduleId,
    actionId: mergedData.actionId,
    enabled: mergedData.enabled,
    fields: mergedData.fields || [],
    createdBy: currentData.createdBy,
    createdAt: now,  // 這個版本的建立時間
    ...(mergedData.defaults && { defaults: mergedData.defaults })  // 只在有值時加入
  }
  
  await setDoc(
    doc(db, 'templates', id, 'versions', String(newVersion)),
    versionSnapshot
  )
}

// 🦄 UNICORN: 取得特定版本的 template 快照（用於顯示舊 submission）
export async function getTemplateVersion(
  templateId: string, 
  version: number
): Promise<TemplateVersionSnapshot | null> {
  const versionDoc = await getDoc(
    doc(db, 'templates', templateId, 'versions', String(version))
  )
  if (versionDoc.exists()) {
    return versionDoc.data() as TemplateVersionSnapshot
  }
  return null
}

export async function deleteTemplate(id: string): Promise<void> {
  const docRef = doc(db, 'templates', id)
  await deleteDoc(docRef)
}

// ============================================
// OptionSets（下拉選項池）
// ============================================

export async function getOptionSets(): Promise<OptionSet[]> {
  const q = query(collection(db, 'optionSets'), orderBy('name'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionSet[]
}

export async function getOptionSet(id: string): Promise<OptionSet | null> {
  const docRef = doc(db, 'optionSets', id)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as OptionSet
  }
  return null
}

export async function createOptionSet(
  data: Omit<OptionSet, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail: string
): Promise<string> {
  const docRef = await addDoc(collection(db, 'optionSets'), {
    ...data,
    createdBy: userEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return docRef.id
}

export async function updateOptionSet(
  id: string, 
  data: Partial<Omit<OptionSet, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  const docRef = doc(db, 'optionSets', id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  })
}

export async function deleteOptionSet(id: string): Promise<void> {
  const docRef = doc(db, 'optionSets', id)
  await deleteDoc(docRef)
}

// ============================================
// Submissions（提交資料）
// ============================================

export async function getMySubmissions(userEmail: string): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    where('createdBy', '==', userEmail),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Submission[]
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const docRef = doc(db, 'submissions', id)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Submission
  }
  return null
}

// 🦄 UNICORN: 計算 _month (YYYY-MM) 用於 period 查詢
function computeMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export async function createSubmission(
  data: {
    templateId: string
    templateVersion: number                    // 🦄 UNICORN: Freeze template version
    moduleId: string
    actionId: string
    values: Record<string, unknown>
    labelsSnapshot: Record<string, string>     // 🦄 UNICORN: Preserve labels for display
    files?: Array<{
      fieldKey: string                         // 🦄 UNICORN: Link file to field
      driveFileId: string
      name: string
      mimeType: string
      size: number
      webViewLink?: string
    }>
    supersedesSubmissionId?: string            // 🦄 UNICORN: 更正鏈（可選）
  },
  userEmail: string
): Promise<string> {
  // 從 values 中提取日期範圍欄位（如果有）
  let _dateStart: string | null = null
  let _dateEnd: string | null = null
  
  // 遍歷 values 找日期欄位
  for (const [key, value] of Object.entries(data.values)) {
    if (key.toLowerCase().includes('start') && typeof value === 'string') {
      _dateStart = value
    }
    if (key.toLowerCase().includes('end') && typeof value === 'string') {
      _dateEnd = value
    }
  }

  // 🦄 UNICORN: Submission 是不可變事件，一次寫入所有欄位
  const docRef = await addDoc(collection(db, 'submissions'), {
    templateId: data.templateId,
    templateVersion: data.templateVersion,     // 🦄 UNICORN: Store frozen version
    moduleId: data.moduleId,
    actionId: data.actionId,
    createdBy: userEmail,
    status: 'ACTIVE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    values: data.values,
    labelsSnapshot: data.labelsSnapshot,       // 🦄 UNICORN: Store frozen labels
    files: data.files || [],
    _dateStart,
    _dateEnd,
    _month: computeMonth(),                    // 🦄 UNICORN: Period key for queries (§9)
    _refIds: [],
    // 🦄 UNICORN: 更正鏈（如果這是一個更正）
    ...(data.supersedesSubmissionId && { supersedesSubmissionId: data.supersedesSubmissionId })
  })
  return docRef.id
}

// 🦄 UNICORN: 使用預先產生的 ID 建立 submission（用於先上傳檔案再提交的流程）
export async function createSubmissionWithId(
  submissionId: string,
  data: {
    templateId: string
    templateVersion: number
    moduleId: string
    actionId: string
    values: Record<string, unknown>
    labelsSnapshot: Record<string, string>
    files?: Array<{
      fieldKey: string
      driveFileId: string
      name: string
      mimeType: string
      size: number
      webViewLink?: string
    }>
    supersedesSubmissionId?: string
  },
  userEmail: string
): Promise<void> {
  // 從 values 中提取日期範圍欄位
  let _dateStart: string | null = null
  let _dateEnd: string | null = null
  
  for (const [key, value] of Object.entries(data.values)) {
    if (key.toLowerCase().includes('start') && typeof value === 'string') {
      _dateStart = value
    }
    if (key.toLowerCase().includes('end') && typeof value === 'string') {
      _dateEnd = value
    }
  }

  const now = serverTimestamp()
  const month = computeMonth()

  // 🦄 UNICORN: Dual Write — 同時寫入舊欄位名（兼容）和 _ 前綴欄位名（UNICORN 標準）
  const submissionData: Record<string, any> = {
    // Legacy fields (for backward compatibility with old code + Firestore rules)
    templateId: data.templateId,
    templateVersion: data.templateVersion,
    moduleId: data.moduleId,
    actionId: data.actionId,
    createdBy: userEmail,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    values: data.values,
    labelsSnapshot: data.labelsSnapshot,

    // UNICORN _ prefixed metadata (standard going forward)
    _templateId: data.templateId,
    _templateModule: data.moduleId,
    _templateAction: data.actionId,
    _templateVersion: data.templateVersion,
    _submitterId: userEmail,
    _submitterEmail: userEmail,
    _submittedAt: now,
    _submittedMonth: month,
    _status: 'ACTIVE',
    _fieldLabels: data.labelsSnapshot,

    // Shared fields
    files: data.files || [],
    _month: month,
    _refIds: [],
  }

  // UNICORN: Flatten user values to top level (alongside nested `values` for compat)
  if (data.values) {
    for (const [key, val] of Object.entries(data.values)) {
      if (!key.startsWith('_') && val !== undefined) {
        submissionData[key] = val
      }
    }
  }

  if (_dateStart) submissionData._dateStart = _dateStart
  if (_dateEnd) submissionData._dateEnd = _dateEnd
  if (data.supersedesSubmissionId) {
    submissionData.supersedesSubmissionId = data.supersedesSubmissionId
    submissionData._correctFor = data.supersedesSubmissionId
  }

  await setDoc(doc(db, 'submissions', submissionId), submissionData)
}

// 🦄 UNICORN: 產生新的 submission ID（用於先上傳檔案）
export function generateSubmissionId(): string {
  return doc(collection(db, 'submissions')).id
}

// 🦄 UNICORN: 取消 Submission（呼叫 Cloud Function）
// Submission 不可變，狀態轉換必須透過 Cloud Function
const CANCEL_SUBMISSION_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/cancelSubmission'

export async function cancelSubmission(id: string): Promise<void> {
  // 取得 Firebase ID Token
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  // 🦄 UNICORN: 呼叫 Cloud Function 執行狀態轉換
  const response = await fetch(CANCEL_SUBMISSION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ submissionId: id })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '取消失敗')
  }
}

// ============================================
// Leader 專用：查看所有提交
// ============================================

export async function getAllSubmissions(): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Submission[]
}

export async function getSubmissionsByTemplate(templateId: string): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    where('templateId', '==', templateId),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Submission[]
}

// ============================================
// 🦄 UNICORN: Option Requests（選項變更申請）
// ============================================

/**
 * 取得所有選項申請（Admin 用）
 */
export async function getAllOptionRequests(): Promise<OptionRequest[]> {
  const q = query(
    collection(db, 'optionRequests'),
    orderBy('requestedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionRequest[]
}

/**
 * 取得待處理的選項申請（Admin 用）
 */
export async function getPendingOptionRequests(): Promise<OptionRequest[]> {
  const q = query(
    collection(db, 'optionRequests'),
    where('status', '==', 'pending'),
    orderBy('requestedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionRequest[]
}

/**
 * 取得我的選項申請（Leader 用）
 */
export async function getMyOptionRequests(userEmail: string): Promise<OptionRequest[]> {
  const q = query(
    collection(db, 'optionRequests'),
    where('requestedBy', '==', userEmail),
    orderBy('requestedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionRequest[]
}

/**
 * 建立選項變更申請
 */
export async function createOptionRequest(
  data: {
    setId: string
    setName: string
    type: OptionRequestType
    payload: OptionRequestPayload
  },
  userEmail: string
): Promise<string> {
  const docRef = await addDoc(collection(db, 'optionRequests'), {
    setId: data.setId,
    setName: data.setName,
    type: data.type,
    payload: data.payload,
    status: 'pending',
    requestedAt: serverTimestamp(),
    requestedBy: userEmail
  })
  return docRef.id
}

/**
 * 🦄 UNICORN: 處理選項申請（呼叫 Cloud Function）
 */
const PROCESS_OPTION_REQUEST_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/processOptionRequest'

export async function processOptionRequest(
  requestId: string,
  action: 'approve' | 'reject',
  reviewNote?: string
): Promise<void> {
  // 取得 Firebase ID Token
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(PROCESS_OPTION_REQUEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ requestId, action, reviewNote })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '處理失敗')
  }
}

/**
 * 🦄 UNICORN: 建立選項池（呼叫 Cloud Function）
 * 首次建立選項池必須透過 Cloud Function
 */
const CREATE_OPTION_SET_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/createOptionSet'

export async function createOptionSetViaFunction(
  data: {
    code: string
    name: string
    description?: string
    items?: Array<{ value: string; label: string }>
    isMaster?: boolean
    masterSetId?: string
  }
): Promise<string> {
  // 取得 Firebase ID Token
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(CREATE_OPTION_SET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(data)
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '建立失敗')
  }
  
  const result = await response.json()
  return result.id
}

/**
 * 🦄 UNICORN: 為現有選項池添加 code（遷移用）
 */
const MIGRATE_OPTION_SET_CODE_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/migrateOptionSetCode'

export async function migrateOptionSetCode(
  optionSetId: string,
  code: string
): Promise<void> {
  // 取得 Firebase ID Token
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(MIGRATE_OPTION_SET_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ optionSetId, code })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '遷移失敗')
  }
}

/**
 * 🦄 UNICORN: 刪除選項池（Admin 專用）
 */
const DELETE_OPTION_SET_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/deleteOptionSet'

export async function deleteOptionSetViaFunction(optionSetId: string): Promise<void> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(DELETE_OPTION_SET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ optionSetId })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '刪除失敗')
  }
}

/**
 * 🦄 UNICORN: 更新選項池（Admin 專用）
 */
const UPDATE_OPTION_SET_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/updateOptionSet'

export async function updateOptionSetViaFunction(
  optionSetId: string,
  data: {
    name?: string
    description?: string
    isMaster?: boolean
    masterSetId?: string | null
    items?: Array<{
      value: string
      label: string
      status?: string
      createdAt?: string
      createdBy?: string
      labelHistory?: Array<{
        label: string
        changedAt: string
        changedBy: string
        reason?: string
      }>
    }>
  }
): Promise<void> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(UPDATE_OPTION_SET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ optionSetId, ...data })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '更新失敗')
  }
}

/**
 * 🦄 UNICORN: 批次上傳選項（Admin 專用）
 * @param mode - 'append' (新增) | 'replace' (取代) | 'merge' (合併)
 */
const BATCH_UPLOAD_OPTIONS_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/batchUploadOptions'

export async function batchUploadOptionsViaFunction(
  optionSetId: string,
  csvData: string,
  mode: 'append' | 'replace' | 'merge' = 'append'
): Promise<{
  uploaded: number
  final: number
  mode: string
  warnings?: string[]
}> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(BATCH_UPLOAD_OPTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ optionSetId, csvData, mode })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '上傳失敗')
  }
  
  const result = await response.json()
  return result.stats
}

// ============================================
// 🦄 UNICORN: Draft System (Sandbox Layer)
// ============================================

import type { OptionSetDraft, TemplateDraft, DraftStatus } from '@/types'

// ---------- OptionSet Drafts ----------

export async function getMyOptionSetDrafts(userEmail: string): Promise<OptionSetDraft[]> {
  const q = query(
    collection(db, 'optionSetDrafts'),
    where('createdBy', '==', userEmail),
    orderBy('updatedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionSetDraft[]
}

export async function getAllOptionSetDrafts(): Promise<OptionSetDraft[]> {
  const q = query(
    collection(db, 'optionSetDrafts'),
    orderBy('updatedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionSetDraft[]
}

export async function getPendingOptionSetDrafts(): Promise<OptionSetDraft[]> {
  const q = query(
    collection(db, 'optionSetDrafts'),
    where('status', '==', 'pending_review'),
    orderBy('submittedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionSetDraft[]
}

export async function getOptionSetDraft(id: string): Promise<OptionSetDraft | null> {
  const docRef = doc(db, 'optionSetDrafts', id)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as OptionSetDraft
  }
  return null
}

export async function createOptionSetDraft(
  data: {
    code: string
    name: string
    description?: string
    items: Array<{ value: string; label: string }>
  },
  userEmail: string
): Promise<string> {
  const now = serverTimestamp()
  const docRef = await addDoc(collection(db, 'optionSetDrafts'), {
    ...data,
    status: 'draft' as DraftStatus,
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now
  })
  return docRef.id
}

export async function updateOptionSetDraft(
  id: string,
  data: Partial<{
    code: string
    name: string
    description: string
    items: Array<{ value: string; label: string }>
  }>
): Promise<void> {
  const docRef = doc(db, 'optionSetDrafts', id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  })
}

export async function submitOptionSetDraftForReview(id: string): Promise<void> {
  const docRef = doc(db, 'optionSetDrafts', id)
  await updateDoc(docRef, {
    status: 'pending_review' as DraftStatus,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

export async function deleteOptionSetDraft(id: string): Promise<void> {
  const docRef = doc(db, 'optionSetDrafts', id)
  await deleteDoc(docRef)
}

// Review via Cloud Function
const REVIEW_OPTION_SET_DRAFT_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/reviewOptionSetDraft'

export async function reviewOptionSetDraft(
  draftId: string,
  action: 'approve' | 'reject',
  reviewNote?: string
): Promise<void> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(REVIEW_OPTION_SET_DRAFT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ draftId, action, reviewNote })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '審核失敗')
  }
}

// ---------- Template Drafts ----------

export async function getMyTemplateDrafts(userEmail: string): Promise<TemplateDraft[]> {
  const q = query(
    collection(db, 'templateDrafts'),
    where('createdBy', '==', userEmail),
    orderBy('updatedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as TemplateDraft[]
}

export async function getAllTemplateDrafts(): Promise<TemplateDraft[]> {
  const q = query(
    collection(db, 'templateDrafts'),
    orderBy('updatedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as TemplateDraft[]
}

export async function getPendingTemplateDrafts(): Promise<TemplateDraft[]> {
  const q = query(
    collection(db, 'templateDrafts'),
    where('status', '==', 'pending_review'),
    orderBy('submittedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as TemplateDraft[]
}

export async function getTemplateDraft(id: string): Promise<TemplateDraft | null> {
  const docRef = doc(db, 'templateDrafts', id)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as TemplateDraft
  }
  return null
}

export async function createTemplateDraft(
  data: {
    name: string
    moduleId: string
    actionId: string
    fields: any[]
    defaults?: Record<string, unknown>
    usedDraftOptionSetIds?: string[]
  },
  userEmail: string
): Promise<string> {
  const now = serverTimestamp()
  const docRef = await addDoc(collection(db, 'templateDrafts'), {
    ...data,
    status: 'draft' as DraftStatus,
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now
  })
  return docRef.id
}

export async function updateTemplateDraft(
  id: string,
  data: Partial<{
    name: string
    moduleId: string
    actionId: string
    fields: any[]
    defaults: Record<string, unknown>
    usedDraftOptionSetIds: string[]
  }>
): Promise<void> {
  const docRef = doc(db, 'templateDrafts', id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  })
}

export async function submitTemplateDraftForReview(id: string): Promise<void> {
  const docRef = doc(db, 'templateDrafts', id)
  await updateDoc(docRef, {
    status: 'pending_review' as DraftStatus,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

export async function deleteTemplateDraft(id: string): Promise<void> {
  const docRef = doc(db, 'templateDrafts', id)
  await deleteDoc(docRef)
}

// Review via Cloud Function
const REVIEW_TEMPLATE_DRAFT_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/reviewTemplateDraft'

export async function reviewTemplateDraft(
  draftId: string,
  action: 'approve' | 'reject',
  reviewNote?: string
): Promise<void> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(REVIEW_TEMPLATE_DRAFT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ draftId, action, reviewNote })
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '審核失敗')
  }
}

// ============================================
// Phase 2: Leader Dashboard & User Interaction
// ============================================

// ---------- User Form Stats ----------
export async function getUserFormStats(userEmail: string): Promise<UserFormStats[]> {
  const q = query(
    collection(db, 'userFormStats'),
    where('userEmail', '==', userEmail),
    orderBy('lastUsedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as UserFormStats[]
}

// Get favorite forms
export async function getFavoriteForms(userEmail: string): Promise<UserFormStats[]> {
  const q = query(
    collection(db, 'userFormStats'),
    where('userEmail', '==', userEmail),
    where('isFavorite', '==', true),
    orderBy('lastUsedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as UserFormStats[]
}

// Get most used forms
export async function getMostUsedForms(userEmail: string, limit: number = 5): Promise<UserFormStats[]> {
  const q = query(
    collection(db, 'userFormStats'),
    where('userEmail', '==', userEmail),
    orderBy('useCount', 'desc')
  )
  const snapshot = await getDocs(q)
  const stats = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as UserFormStats[]
  
  return stats.slice(0, limit)
}

// Toggle favorite
export async function toggleFavorite(userEmail: string, templateId: string): Promise<void> {
  // Use composite ID for predictable document reference
  const statsId = `${userEmail.replace(/[@.]/g, '_')}_${templateId}`
  const docRef = doc(db, 'userFormStats', statsId)
  const docSnap = await getDoc(docRef)
  
  if (docSnap.exists()) {
    const currentFavorite = docSnap.data().isFavorite || false
    await updateDoc(docRef, {
      isFavorite: !currentFavorite
    })
  }
}

// ---------- Templates Query Helpers ----------

// Get templates created this month (UNICORN: use _createdMonth period key)
export async function getTemplatesCreatedThisMonth(): Promise<Template[]> {
  const currentMonth = new Date().toISOString().slice(0, 7) // "2026-01"
  const q = query(
    collection(db, 'templates'),
    where('_createdMonth', '==', currentMonth),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Template[]
}

// Get templates managed by user (owner or in managerEmails)
export async function getMyManagedTemplates(userEmail: string): Promise<Template[]> {
  // Note: Firestore array-contains only works with single value
  // We need to query both createdBy and managerEmails separately
  
  const [ownedTemplates, managedTemplates] = await Promise.all([
    // Templates created by user
    getDocs(query(
      collection(db, 'templates'),
      where('createdBy', '==', userEmail),
      orderBy('updatedAt', 'desc')
    )),
    // Templates where user is in managerEmails
    getDocs(query(
      collection(db, 'templates'),
      where('managerEmails', 'array-contains', userEmail),
      orderBy('updatedAt', 'desc')
    ))
  ])
  
  // Combine and deduplicate
  const templateMap = new Map<string, Template>()
  
  ownedTemplates.docs.forEach(doc => {
    templateMap.set(doc.id, { id: doc.id, ...doc.data() } as Template)
  })
  
  managedTemplates.docs.forEach(doc => {
    if (!templateMap.has(doc.id)) {
      templateMap.set(doc.id, { id: doc.id, ...doc.data() } as Template)
    }
  })
  
  return Array.from(templateMap.values())
}

// Get recent submissions for user's managed templates
export async function getRecentSubmissionsForMyTemplates(
  templateIds: string[],
  limit: number = 10
): Promise<Submission[]> {
  if (templateIds.length === 0) return []
  
  // Firestore 'in' query limited to 10 items
  // If more than 10 templates, we need to batch
  const batchSize = 10
  const batches: Promise<Submission[]>[] = []
  
  for (let i = 0; i < templateIds.length; i += batchSize) {
    const batch = templateIds.slice(i, i + batchSize)
    const q = query(
      collection(db, 'submissions'),
      where('_templateId', 'in', batch),
      orderBy('_submittedAt', 'desc')
    )
    batches.push(
      getDocs(q).then(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Submission[]
      )
    )
  }
  
  const allResults = await Promise.all(batches)
  const combined = allResults.flat()
  
  // Sort by submittedAt and limit
  return combined
    .sort((a, b) => {
      const aTime = a._submittedAt instanceof Date ? a._submittedAt.getTime() : new Date(a._submittedAt as string).getTime()
      const bTime = b._submittedAt instanceof Date ? b._submittedAt.getTime() : new Date(b._submittedAt as string).getTime()
      return bTime - aTime
    })
    .slice(0, limit)
}

// ---------- Template Access Management ----------

// Update template access settings
export async function updateTemplateAccess(
  templateId: string,
  accessType: 'all' | 'whitelist',
  accessWhitelist?: string[]
): Promise<void> {
  await updateDoc(doc(db, 'templates', templateId), {
    accessType,
    accessWhitelist: accessWhitelist || [],
    updatedAt: serverTimestamp()
  })
}

// Update template managers
export async function updateTemplateManagers(
  templateId: string,
  managerEmails: string[]
): Promise<void> {
  // UNICORN: Limit to 5 managers
  if (managerEmails.length > 5) {
    throw new Error('最多只能設定 5 位管理者')
  }
  
  await updateDoc(doc(db, 'templates', templateId), {
    managerEmails,
    updatedAt: serverTimestamp()
  })
}

// Toggle template enabled status
export async function toggleTemplateEnabled(
  templateId: string,
  enabled: boolean
): Promise<void> {
  await updateDoc(doc(db, 'templates', templateId), {
    enabled,
    updatedAt: serverTimestamp()
  })
}

// ============================================
// Phase 2.4: OptionSet Subset Management
// ============================================

// Get Master OptionSets only
// UNICORN: Backward compatibility - treat undefined as Master
export async function getMasterOptionSets(): Promise<OptionSet[]> {
  const allSets = await getOptionSets()
  return allSets.filter(os => os.isMaster === true || os.isMaster === undefined)
}

// Get Subsets for a specific Master
export async function getSubsetsForMaster(masterSetId: string): Promise<OptionSet[]> {
  const q = query(
    collection(db, 'optionSets'),
    where('masterSetId', '==', masterSetId),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OptionSet[]
}

// Migration: Mark all existing OptionSets as Master (via Cloud Function)
const MIGRATE_TO_MASTER_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/migrateOptionSetsToMaster'

export async function migrateOptionSetsToMaster(): Promise<{ updated: number; errors: string[] }> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(MIGRATE_TO_MASTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    }
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || '遷移失敗')
  }
  
  const result = await response.json()
  return {
    updated: result.updated,
    errors: result.errors || []
  }
}

// Create Subset from Master (no approval needed)
export async function createSubsetFromMaster(
  masterSetId: string,
  name: string,
  selectedValues: string[],
  createdBy: string
): Promise<string> {
  // 1. Get Master OptionSet
  const masterDoc = await getDoc(doc(db, 'optionSets', masterSetId))
  if (!masterDoc.exists()) {
    throw new Error('Master OptionSet 不存在')
  }
  
  const masterData = masterDoc.data() as OptionSet
  if (!masterData.isMaster) {
    throw new Error('只能從 Master OptionSet 建立子集')
  }
  
  // 2. Validate all selected values exist in Master
  const masterValues = masterData.items.map(item => item.value)
  const invalidValues = selectedValues.filter(v => !masterValues.includes(v))
  if (invalidValues.length > 0) {
    throw new Error(`以下值不存在於 Master 中：${invalidValues.join(', ')}`)
  }
  
  // 3. Build subset items (preserve original item structure)
  const subsetItems = masterData.items
    .filter(item => selectedValues.includes(item.value))
    .map((item, index) => ({
      ...item,
      sort: index  // Re-index
    }))
  
  // 4. Create new OptionSet
  const now = serverTimestamp()
  const docRef = await addDoc(collection(db, 'optionSets'), {
    code: masterData.code,        // Same Universal KEY
    name,
    description: `從「${masterData.name}」建立的子集`,
    isMaster: false,
    masterSetId: masterSetId,
    items: subsetItems,
    createdBy,
    createdAt: now,
    updatedAt: now
  })
  
  return docRef.id
}

// Update Subset (modify selected items)
export async function updateSubset(
  subsetId: string,
  selectedValues: string[]
): Promise<void> {
  // 1. Get Subset
  const subsetDoc = await getDoc(doc(db, 'optionSets', subsetId))
  if (!subsetDoc.exists()) {
    throw new Error('Subset 不存在')
  }
  
  const subsetData = subsetDoc.data() as OptionSet
  if (subsetData.isMaster) {
    throw new Error('不能用此函數更新 Master OptionSet')
  }
  
  if (!subsetData.masterSetId) {
    throw new Error('此 OptionSet 不是 Subset')
  }
  
  // 2. Get Master
  const masterDoc = await getDoc(doc(db, 'optionSets', subsetData.masterSetId))
  if (!masterDoc.exists()) {
    throw new Error('Master OptionSet 不存在')
  }
  
  const masterData = masterDoc.data() as OptionSet
  
  // 3. Validate all selected values exist in Master
  const masterValues = masterData.items.map(item => item.value)
  const invalidValues = selectedValues.filter(v => !masterValues.includes(v))
  if (invalidValues.length > 0) {
    throw new Error(`以下值不存在於 Master 中：${invalidValues.join(', ')}`)
  }
  
  // 4. Build new subset items
  const newItems = masterData.items
    .filter(item => selectedValues.includes(item.value))
    .map((item, index) => ({
      ...item,
      sort: index
    }))
  
  // 5. Update Subset
  await updateDoc(doc(db, 'optionSets', subsetId), {
    items: newItems,
    updatedAt: serverTimestamp()
  })
}

// ============================================
// Phase 3.3: Template Suggestions
// ============================================

// Create template suggestion
export async function createTemplateSuggestion(
  templateId: string,
  templateName: string,
  suggestions: Record<string, string>,
  generalNotes: string | undefined,
  suggesterEmail: string
): Promise<string> {
  const docRef = await addDoc(collection(db, 'templateSuggestions'), {
    templateId,
    templateName,
    suggesterEmail,
    suggestions,
    generalNotes: generalNotes || '',
    status: 'pending',
    createdAt: serverTimestamp(),
    _notifiedAt: null  // UNICORN: Idempotency for email notification
  })
  
  return docRef.id
}

// Get my template suggestions
export async function getMyTemplateSuggestions(userEmail: string): Promise<TemplateSuggestion[]> {
  const q = query(
    collection(db, 'templateSuggestions'),
    where('suggesterEmail', '==', userEmail),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as TemplateSuggestion[]
}

// ============================================
// 🦄 UNICORN: Seed Module and Action OptionSets
// ============================================

const SEED_MODULE_ACTION_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/seedModuleActionOptionSets'

export async function seedModuleActionOptionSets(): Promise<{ module: any; action: any }> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) {
    throw new Error('請先登入')
  }
  const idToken = await user.getIdToken()
  
  const response = await fetch(SEED_MODULE_ACTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    }
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || errorData.error || 'Seed 失敗')
  }
  
  const result = await response.json()
  return result.results
}
