'use client'

// ============================================
// 🦄 擷取模組載入器
//
// DocumentScanner（相機掃描）與 BillPaste（螢幕截圖拼貼）原樣搬自 GAS 版，
// 是掛在 window 上的 IIFE，不是 React 元件。這裡只負責：
//   1. 按需載入 CSS / JS（含 jsPDF），同一份資產只載一次
//   2. 把 onConfirm / onCancel 包成 Promise<Blob | null>
//
// 兩個模組自己建立 overlay、自己收尾、列印也在模組內完成，
// 這裡不碰它們的 DOM 或樣式。
// ============================================

export interface CaptureOptions {
  onConfirm: (pdfBlob: Blob) => void
  onCancel: () => void
  showMessage: (message: string, type?: string) => void
}

interface CaptureModule {
  open: (options: CaptureOptions) => void
}

declare global {
  interface Window {
    jspdf?: unknown
    DocumentScanner?: CaptureModule
    BillPaste?: CaptureModule
  }
}

const JSPDF_URL = '/vendor/jspdf.umd.min.js'
const GUARD_CSS_URL = '/capture/preflight-guard.css'
const SCANNER_CSS_URL = '/capture/document-scanner.css'
const SCANNER_JS_URL = '/capture/document-scanner.js'
const BILL_PASTE_CSS_URL = '/capture/bill-paste.css'
const BILL_PASTE_JS_URL = '/capture/bill-paste.js'

const pending = new Map<string, Promise<void>>()

function loadAsset(url: string, kind: 'js' | 'css'): Promise<void> {
  const cached = pending.get(url)
  if (cached) return cached

  const task = new Promise<void>((resolve, reject) => {
    let element: HTMLScriptElement | HTMLLinkElement

    if (kind === 'js') {
      const script = document.createElement('script')
      script.src = url
      // 必須依序執行：bill-paste.js 在 open() 時就會讀 window.jspdf
      script.async = false
      element = script
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      element = link
    }

    element.onload = () => resolve()
    element.onerror = () => {
      pending.delete(url)
      reject(new Error(`載入失敗：${url}`))
    }
    document.head.appendChild(element)
  })

  pending.set(url, task)
  return task
}

// guard 先載，模組 CSS 後載，讓模組樣式永遠最後定案
async function ensureBase(): Promise<void> {
  await loadAsset(GUARD_CSS_URL, 'css')
  await loadAsset(JSPDF_URL, 'js')
}

function openAsPromise(
  module: CaptureModule,
  onMessage: (message: string) => void
): Promise<Blob | null> {
  return new Promise(resolve => {
    module.open({
      onConfirm: blob => resolve(blob),
      onCancel: () => resolve(null),
      showMessage: message => onMessage(message),
    })
  })
}

/** 開啟相機掃描；使用者完成時回傳 PDF Blob，取消時回傳 null */
export async function openDocumentScanner(
  onMessage: (message: string) => void
): Promise<Blob | null> {
  await ensureBase()
  await loadAsset(SCANNER_CSS_URL, 'css')
  await loadAsset(SCANNER_JS_URL, 'js')
  if (!window.DocumentScanner) throw new Error('掃描模組未載入')
  return openAsPromise(window.DocumentScanner, onMessage)
}

/** 開啟螢幕截圖拼貼；使用者完成時回傳 PDF Blob，取消時回傳 null */
export async function openBillPaste(
  onMessage: (message: string) => void
): Promise<Blob | null> {
  await ensureBase()
  await loadAsset(BILL_PASTE_CSS_URL, 'css')
  await loadAsset(BILL_PASTE_JS_URL, 'js')
  if (!window.BillPaste) throw new Error('拼貼模組未載入')
  return openAsPromise(window.BillPaste, onMessage)
}
