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
  getDownloadURL,
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

export interface OpenedFile {
  url: string
  /** 用完要呼叫，blob URL 才會被釋放 */
  revoke: () => void
  /** true = 走了退路，產生的是帶 token 的永久網址 */
  usedFallback: boolean
}

/**
 * 取得可以開啟檔案的網址。
 *
 * 首選 getBlob：以已驗證身分把內容取回，產生只存在這個瀏覽器分頁的短效 blob URL，
 * 不會留下任何可以轉傳的連結。
 *
 * 但 getBlob 走的是 XHR，需要 Storage bucket 設定 CORS 允許本站網域下載
 * （上傳端點自己帶 CORS 標頭，所以上傳不受影響，只有下載會被擋）。
 * 設定方式見專案根目錄的 cors.json。
 *
 * 沒設好時退回 getDownloadURL：同樣受安全規則檢查（沒有讀取權限拿不到），
 * 但產生的網址帶著長期有效的 token，誰拿到都能開。所以那只是退路，
 * 不是正常狀態——會在 console 留下警告。
 */
export async function openStoredFile(path: string): Promise<OpenedFile> {
  try {
    const blob = await getBlob(ref(storage, path))
    const url = URL.createObjectURL(blob)
    return { url, revoke: () => URL.revokeObjectURL(url), usedFallback: false }
  } catch (err) {
    console.warn(
      '[unicorn] 以 SDK 取回檔案失敗，退回帶 token 的下載網址。' +
        '請依 cors.json 設定 Storage bucket 的 CORS，才能走不留連結的方式。',
      err
    )
    const url = await getDownloadURL(ref(storage, path))
    return { url, revoke: () => {}, usedFallback: true }
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
