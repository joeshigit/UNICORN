'use client'

import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface AuditLog {
  id: string
  action: string
  targetCollection: string
  targetId: string
  performedBy: string
  performedAt: any
  metadata?: Record<string, any>
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  async function loadLogs() {
    try {
      const q = query(
        collection(db, 'auditLogs'),
        orderBy('performedAt', 'desc'),
        limit(100)
      )
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[]
      setLogs(data)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateValue: any) {
    if (!dateValue) return '-'
    if (typeof dateValue === 'object' && 'seconds' in dateValue) {
      return new Date(dateValue.seconds * 1000).toLocaleString('zh-TW')
    }
    if (dateValue instanceof Date) {
      return dateValue.toLocaleString('zh-TW')
    }
    return new Date(dateValue).toLocaleString('zh-TW')
  }

  function getActionColor(action: string): string {
    if (action.includes('APPROVE')) return 'text-green-400'
    if (action.includes('REJECT')) return 'text-red-400'
    if (action.includes('CANCEL')) return 'text-orange-400'
    if (action.includes('CREATE')) return 'text-blue-400'
    return 'text-slate-400'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">稽核記錄</h1>
        <p className="text-slate-400 mt-1">系統操作記錄（最近 100 筆）</p>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400">還沒有任何稽核記錄</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="text-left px-4 py-3 text-sm text-slate-400 font-medium">時間</th>
                <th className="text-left px-4 py-3 text-sm text-slate-400 font-medium">操作</th>
                <th className="text-left px-4 py-3 text-sm text-slate-400 font-medium">目標</th>
                <th className="text-left px-4 py-3 text-sm text-slate-400 font-medium">執行者</th>
                <th className="text-left px-4 py-3 text-sm text-slate-400 font-medium">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                    {formatDate(log.performedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-500 text-sm">{log.targetCollection}/</span>
                    <span className="text-white text-sm font-mono">{log.targetId.substring(0, 8)}...</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {log.performedBy}
                  </td>
                  <td className="px-4 py-3">
                    {log.metadata && (
                      <button
                        onClick={() => alert(JSON.stringify(log.metadata, null, 2))}
                        className="text-sm text-amber-400 hover:text-amber-300"
                      >
                        查看詳情
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}




