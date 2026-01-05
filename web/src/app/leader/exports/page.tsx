'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

// TODO: 從 Firestore 讀取真實資料
const mockExportHistory = [
  {
    id: '1',
    type: 'submissions',
    status: 'completed',
    createdAt: '2025-01-20 14:30',
    completedAt: '2025-01-20 14:32',
    recordCount: 128,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/xxx',
  },
  {
    id: '2',
    type: 'submissions',
    status: 'completed',
    createdAt: '2025-01-15 10:00',
    completedAt: '2025-01-15 10:02',
    recordCount: 95,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/yyy',
  },
]

export default function ExportsPage() {
  const [isExporting, setIsExporting] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const handleExport = async () => {
    if (!selectedTemplate) {
      alert('請選擇要匯出的表格')
      return
    }

    setIsExporting(true)
    try {
      // TODO: 呼叫 Cloud Functions 執行匯出
      console.log('匯出表格:', selectedTemplate)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      alert('匯出成功！已建立 Google Sheet')
    } catch (error) {
      console.error('匯出失敗:', error)
      alert('匯出失敗，請稍後再試')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      {/* 標題 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Download className="w-6 h-6" />
          匯出資料
        </h1>
        <p className="text-gray-500 mt-1">
          將提交資料匯出到 Google Sheet
        </p>
      </div>

      {/* 匯出表單 */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">匯出資料到 Google Sheet</h2>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="input-field flex-1"
          >
            <option value="">選擇要匯出的表格...</option>
            <option value="all">所有表格（全部資料）</option>
            <option value="petty-cash">零用金報銷</option>
            <option value="camp-register">營隊登記</option>
            <option value="activity-record">活動記錄</option>
          </select>
          
          <button
            onClick={handleExport}
            disabled={isExporting || !selectedTemplate}
            className="btn-primary flex items-center justify-center gap-2 min-w-[140px]"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                匯出中...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                立即匯出
              </>
            )}
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-4">
          匯出後會自動建立 Google Sheet，你可以在匯出紀錄中找到連結。
        </p>
      </div>

      {/* 匯出紀錄 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          匯出紀錄
        </h2>

        {mockExportHistory.length === 0 ? (
          <div className="card text-center py-12">
            <Download className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">尚無匯出紀錄</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockExportHistory.map((record) => (
              <div key={record.id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  {record.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : record.status === 'failed' ? (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">
                      資料匯出 - {record.recordCount} 筆
                    </p>
                    <p className="text-sm text-gray-500">
                      {record.createdAt}
                    </p>
                  </div>
                </div>
                
                {record.status === 'completed' && record.sheetUrl && (
                  <a
                    href={record.sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 w-fit"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    開啟 Sheet
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}




