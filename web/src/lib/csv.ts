// ============================================
// CSV 匯出 / 匯入（選項池批次貼上用）
// ============================================

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = Array.isArray(value) ? value.join(' | ') : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of rows) lines.push(row.map(escapeCell).join(','))
  // BOM 讓 Excel 正確辨識 UTF-8
  return `\uFEFF${lines.join('\r\n')}`
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 每行一個選項，支援「value,label」或只有「value」
export function parseOptionLines(text: string): Array<{ value: string; label: string }> {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [value, ...rest] = line.split(',')
      const label = rest.join(',').trim()
      return { value: value.trim(), label: label || value.trim() }
    })
    .filter(item => item.value)
}
