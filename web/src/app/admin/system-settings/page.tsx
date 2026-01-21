'use client'

// 🦄 UNICORN: System Settings Page
// Comprehensive view of all system-level settings for Admin

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getOptionSets, seedModuleActionOptionSets } from '@/lib/firestore'
import type { OptionSet } from '@/types'
import { FIXED_KEYS } from '@/types'

export default function SystemSettingsPage() {
  const { user } = useAuth()
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const data = await getOptionSets()
      setOptionSets(data)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSeed() {
    if (!confirm('確定要建立模組和動作選項池嗎？')) return
    
    try {
      setSeeding(true)
      await seedModuleActionOptionSets()
      alert('建立成功！')
      await loadData()
    } catch (error: any) {
      alert('建立失敗: ' + error.message)
    } finally {
      setSeeding(false)
    }
  }

  // Get module and action OptionSets
  const moduleOptionSet = optionSets.find(os => os.code === 'module' && (os.isMaster === true || os.isMaster === undefined))
  const actionOptionSet = optionSets.find(os => os.code === 'action' && (os.isMaster === true || os.isMaster === undefined))

  // Group Fixed Keys by type
  const fixedKeysByType = Object.entries(FIXED_KEYS).reduce((acc, [key, config]) => {
    const type = config.type
    if (!acc[type]) acc[type] = []
    acc[type].push({ key, ...config })
    return acc
  }, {} as Record<string, Array<{ key: string; type: string; label: string }>>)

  const typeLabels: Record<string, string> = {
    number: '數字欄位',
    text: '單行文字欄位',
    textarea: '多行文字欄位',
    datetime: '日期時間欄位',
    date: '日期欄位',
    file: '檔案上傳欄位'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">系統設定</h1>
        <p className="text-slate-400 mt-1">
          查看和管理系統級設定，包括表格分類和固定欄位
        </p>
      </div>

      {/* Warning */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <p className="text-red-400 text-sm">
          ⚠️ 這些是系統核心設定，修改會影響所有表格。請謹慎操作。
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : (
        <>
          {/* Section 1: Template Classification (Editable) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-amber-400">📁</span>
                表格分類
              </h2>
              {(!moduleOptionSet || !actionOptionSet) && (
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {seeding ? '建立中...' : '初始化分類選項'}
                </button>
              )}
            </div>
            <p className="text-slate-400 text-sm">
              這些選項決定表格的分類方式，Leader 建立表格時必須選擇。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Module OptionSet */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      模組 (module)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">表格所屬的業務模組</p>
                  </div>
                  {moduleOptionSet && (
                    <a
                      href={`/admin/option-sets?edit=${moduleOptionSet.id}`}
                      className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                    >
                      編輯
                    </a>
                  )}
                </div>
                
                {moduleOptionSet ? (
                  <div className="flex flex-wrap gap-2">
                    {moduleOptionSet.items
                      ?.filter(i => i.status === 'active')
                      .sort((a, b) => a.sort - b.sort)
                      .map(item => (
                        <span
                          key={item.value}
                          className="px-3 py-1 bg-slate-700 rounded-full text-sm text-slate-300"
                        >
                          {item.label}
                          <span className="text-slate-500 ml-1">({item.value})</span>
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">尚未建立，請點擊「初始化分類選項」</p>
                )}
              </div>

              {/* Action OptionSet */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      動作 (action)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">表格的操作類型</p>
                  </div>
                  {actionOptionSet && (
                    <a
                      href={`/admin/option-sets?edit=${actionOptionSet.id}`}
                      className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                    >
                      編輯
                    </a>
                  )}
                </div>
                
                {actionOptionSet ? (
                  <div className="flex flex-wrap gap-2">
                    {actionOptionSet.items
                      ?.filter(i => i.status === 'active')
                      .sort((a, b) => a.sort - b.sort)
                      .map(item => (
                        <span
                          key={item.value}
                          className="px-3 py-1 bg-slate-700 rounded-full text-sm text-slate-300"
                        >
                          {item.label}
                          <span className="text-slate-500 ml-1">({item.value})</span>
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">尚未建立，請點擊「初始化分類選項」</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Fixed Keys (Read-only) */}
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-blue-400">🔒</span>
                固定欄位 KEY
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                這些是系統固定的欄位 KEY，不可新增或修改。Leader 建立表格時從這些 KEY 中選擇。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(fixedKeysByType).map(([type, keys]) => (
                <div key={type} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <h4 className="font-medium text-slate-300 mb-3 flex items-center gap-2">
                    {type === 'number' && '🔢'}
                    {type === 'text' && '📝'}
                    {type === 'textarea' && '📄'}
                    {type === 'datetime' && '📅'}
                    {type === 'date' && '🗓️'}
                    {type === 'file' && '📎'}
                    {typeLabels[type] || type}
                  </h4>
                  <div className="space-y-2">
                    {keys.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{label}</span>
                        <code className="px-2 py-0.5 bg-slate-900 rounded text-amber-400 font-mono text-xs">
                          {key}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Dynamic OptionSet Keys (Read-only info) */}
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-green-400">🔄</span>
                動態選項池 KEY
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                這些 KEY 來自選項池的 code 欄位。新增選項池時會自動產生新的 KEY。
              </p>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="flex flex-wrap gap-2">
                {optionSets
                  .filter(os => os.code !== 'module' && os.code !== 'action')
                  .filter(os => os.isMaster === true || os.isMaster === undefined)
                  .map(os => (
                    <span
                      key={os.id}
                      className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm"
                    >
                      {os.name}
                      <code className="ml-1 text-green-300">({os.code})</code>
                    </span>
                  ))}
                {optionSets.filter(os => os.code !== 'module' && os.code !== 'action' && (os.isMaster === true || os.isMaster === undefined)).length === 0 && (
                  <p className="text-slate-500 text-sm">尚無其他選項池</p>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-4">
                💡 前往「選項池管理」新增更多選項池，其 code 將自動成為可用的欄位 KEY。
              </p>
            </div>
          </div>

          {/* Section 4: Superuser List */}
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-purple-400">👑</span>
                Superuser 名單
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                擁有最高權限的使用者，可以進行系統級操作。
              </p>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="flex flex-wrap gap-2">
                {['tong@dbyv.org', 'jason@dbyv.org', 'joeshi@dbyv.org'].map(email => (
                  <span
                    key={email}
                    className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm"
                  >
                    {email}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">
                ⚠️ Superuser 名單在程式碼中定義，需要工程師修改。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
