// ============================================
// 🦄 UNICORN Capture（單人版）— 檔案上傳
//
// 直接用 Firebase Storage，不需要 Cloud Functions 或服務帳號。
// 路徑：uploads/{yyyy-mm}/{submissionId}/{檔名}
// ============================================

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'
import { currentMonth } from './db'
import type { FileInfo } from '@/types'

export const MAX_FILE_SIZE = 20 * 1024 * 1024

function safeName(name: string): string {
  return name.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_')
}

export async function uploadFile(
  file: File,
  fieldKey: string,
  submissionId: string,
  userEmail: string
): Promise<FileInfo> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`「${file.name}」超過 20MB 上限`)
  }

  const path = `uploads/${currentMonth()}/${submissionId}/${Date.now()}_${safeName(file.name)}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' })
  const url = await getDownloadURL(fileRef)

  return {
    fieldKey,
    path,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    url,
    uploadedAt: new Date().toISOString(),
    uploadedBy: userEmail,
  }
}

export async function removeFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path))
  } catch {
    // 檔案可能已經不在了，略過即可
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
