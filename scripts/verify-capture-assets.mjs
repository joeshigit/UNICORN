// ============================================
// 擷取資產保真檢查
//
// web/public/capture/ 下的 CSS 與 JS 是從 gas-capture-ref/ 的兩個 HTML 原樣切出來的，
// UI 已調校過，不得改動。這支腳本確認它們仍然是原檔的子字串。
//
// 唯一允許的差異：bill-paste.css 把外洩的 `h1 {` 規則加上 `#bill-paste-overlay` 作用域。
//
// 用法：node scripts/verify-capture-assets.mjs
// ============================================

import { readFileSync } from 'node:fs'

const H1_ORIGINAL = '    h1 { font-size: 1.25rem; margin: 0 0 12px; color: #1565c0; }'
const H1_SCOPED =
  '    #bill-paste-overlay h1 { font-size: 1.25rem; margin: 0 0 12px; color: #1565c0; }'

const CASES = [
  {
    source: 'gas-capture-ref/DocumentScanner.html',
    css: 'web/public/capture/document-scanner.css',
    js: 'web/public/capture/document-scanner.js',
    cssAllowsScopedH1: false,
  },
  {
    source: 'gas-capture-ref/BillPasteModal.html',
    css: 'web/public/capture/bill-paste.css',
    js: 'web/public/capture/bill-paste.js',
    cssAllowsScopedH1: true,
  },
]

const problems = []

for (const testCase of CASES) {
  const source = readFileSync(testCase.source, 'utf8')
  const css = readFileSync(testCase.css, 'utf8')
  const js = readFileSync(testCase.js, 'utf8')

  // JS 必須逐字元相同
  if (!source.includes(js)) {
    problems.push(`${testCase.js} 已不是 ${testCase.source} 的子字串`)
  }

  // CSS 還原掉允許的作用域修改後，必須逐字元相同
  const restored = testCase.cssAllowsScopedH1 ? css.replace(H1_SCOPED, H1_ORIGINAL) : css
  if (!source.includes(restored)) {
    problems.push(`${testCase.css} 有非預期的改動（僅允許 h1 加作用域）`)
  }

  if (testCase.cssAllowsScopedH1 && css.includes(H1_ORIGINAL)) {
    problems.push(`${testCase.css} 的 h1 規則缺少 #bill-paste-overlay 作用域，會外洩到全站`)
  }
}

if (problems.length > 0) {
  console.error('擷取資產保真檢查失敗：')
  for (const problem of problems) console.error(` - ${problem}`)
  process.exit(1)
}

console.log('擷取資產保真檢查通過：CSS 與 JS 與 gas-capture-ref 一致')
