'use client'

import { useState, useRef } from 'react'
import { auth } from '@/lib/firebase'

interface FileInfo {
  driveFileId: string
  name: string
  mimeType: string
  size: number
  webViewLink?: string
  uploadedAt: string
  uploadedBy: string
}

interface FileUploaderProps {
  value: FileInfo[]
  onChange: (files: FileInfo[]) => void
  moduleId?: string
  submissionId?: string
  error?: boolean
  maxFiles?: number
  accept?: string
}

// Cloud Functions URL
const UPLOAD_URL = 'https://asia-east1-unicorn-dcs.cloudfunctions.net/uploadFile'

export function FileUploader({ 
  value = [], 
  onChange, 
  moduleId = '', 
  submissionId = '',
  error,
  maxFiles = 10,
  accept = '*/*'
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    // 檢查檔案數量限制
    if (value.length + files.length > maxFiles) {
      setUploadError(`最多只能上傳 ${maxFiles} 個檔案`)
      return
    }
    
    setUploading(true)
    setUploadError(null)
    setUploadProgress(0)
    
    try {
      // 取得 Firebase ID Token
      const user = auth.currentUser
      if (!user) {
        throw new Error('請先登入')
      }
      const idToken = await user.getIdToken()
      
      // 建立 FormData
      const formData = new FormData()
      formData.append('moduleId', moduleId)
      formData.append('submissionId', submissionId || `temp_${Date.now()}`)
      
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i])
      }
      
      // 上傳
      const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '上傳失敗')
      }
      
      const result = await response.json()
      
      // 更新檔案清單
      onChange([...value, ...result.files])
      setUploadProgress(100)
      
    } catch (err: any) {
      console.error('Upload error:', err)
      setUploadError(err.message || '上傳失敗，請稍後再試')
    } finally {
      setUploading(false)
      // 清空 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = (index: number) => {
    const newFiles = [...value]
    newFiles.splice(index, 1)
    onChange(newFiles)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-3">
      {/* 已上傳的檔案 */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((file, index) => (
            <div 
              key={file.driveFileId || index}
              className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200"
            >
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                {file.webViewLink ? (
                  <a 
                    href={file.webViewLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate block"
                  >
                    {file.name}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-gray-900 truncate block">
                    {file.name}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 上傳區域 */}
      {value.length < maxFiles && (
        <div 
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            error ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          } ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {uploading ? (
            <div className="space-y-2">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-600">上傳中...</p>
              {uploadProgress > 0 && (
                <div className="w-32 h-2 bg-gray-200 rounded-full mx-auto overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 mt-2">點擊或拖曳檔案到這裡上傳</p>
              <p className="text-xs text-gray-400 mt-1">
                最多 {maxFiles} 個檔案
              </p>
            </>
          )}
        </div>
      )}

      {/* 錯誤訊息 */}
      {uploadError && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {uploadError}
        </div>
      )}
    </div>
  )
}

