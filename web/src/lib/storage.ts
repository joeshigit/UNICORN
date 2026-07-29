// ============================================
// 🦄 UNICORN Capture — 檔案上傳
//
// 路徑：uploads/{uid}/{submissionId}/{fieldKey}/{fileId}
// 只存 path；下載用已驗證 SDK 產生短效 blob URL。
// ============================================

import {
  ref,
  uploadBytes,
  deleteObject,
  getBlob,
} from 'firebase/storage'
import { storage } from './firebase'
import { ensureUploadSession } from './db'
import type { Actor } from './db'
import type { FileInfo } from '@/types'

export const MAX_FILE_SIZE = 20 * 1024 * 1024

const APPROVED_MIME_PREFIXES = ['image/']
const APPROVED_MIME_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
])

export function isApprovedMime(mime: string): boolean {
  if (!mime) return false
  if (APPROVED_MIME_EXACT.has(mime)) return true
  return APPROVED_MIME_PREFIXES.some(p => mime.startsWith(p))
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_')
}

function newFileId(name: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${Date.now()}_${rand}_${safeName(name)}`
}

export async function uploadFile(
  file: File,
  fieldKey: string,
  submissionId: string,
  actor: Actor
): Promise<FileInfo> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`「${file.name}」超過 20MB 上限`)
  }
  const mime = file.type || 'application/octet-stream'
  if (!isApprovedMime(mime)) {
    throw new Error(`不支援的檔案類型：${mime || '未知'}`)
  }

  await ensureUploadSession(submissionId, actor)

  const fileId = newFileId(file.name)
  const path = `uploads/${actor.uid}/${submissionId}/${fieldKey}/${fileId}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file, { contentType: mime })

  return {
    fieldKey,
    path,
    name: file.name,
    mimeType: mime,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: actor.email.toLowerCase(),
  }
}

export async function removeFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path))
  } catch {
    // 檔案可能已經不在了
  }
}

/** 以已驗證身分下載，回傳短效 Object URL（呼叫端負責 revoke） */
export async function createAuthorizedObjectUrl(path: string): Promise<string> {
  const blob = await getBlob(ref(storage, path))
  return URL.createObjectURL(blob)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
