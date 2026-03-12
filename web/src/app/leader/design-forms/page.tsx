'use client'

// Phase 2.4: Design Forms Page - Full Implementation
// Consolidates: OptionSets, DraftOptionSets, DraftTemplates

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { 
  getOptionSets,
  getSubsetsForMaster,
  createSubsetFromMaster,
  getTemplates,
} from '@/lib/firestore'
import type { OptionSet, Template } from '@/types'

type TabType = 'options' | 'templates'

export default function DesignFormsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('options')
  
  // Options tab state
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [selectedMaster, setSelectedMaster] = useState<OptionSet | null>(null)
  const [masterSubsets, setMasterSubsets] = useState<OptionSet[]>([])
  const [creatingSubset, setCreatingSubset] = useState(false)
  const [subsetName, setSubsetName] = useState('')
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  
  // Templates tab state
  const [templates, setTemplates] = useState<Template[]>([])
  
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      loadData()
    }
  }, [user, activeTab])

  const loadData = async () => {
    if (!user?.email) return
    
    try {
      setLoading(true)
      if (activeTab === 'options') {
        const sets = await getOptionSets()
        setOptionSets(sets)
      } else {
        const templatesData = await getTemplates()
        setTemplates(templatesData)
      }
    } catch (error) {
      console.error('載入資料失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectMaster = async (master: OptionSet) => {
    setSelectedMaster(master)
    try {
      const subsets = await getSubsetsForMaster(master.id!)
      setMasterSubsets(subsets)
    } catch (error) {
      console.error('載入子集失敗:', error)
    }
  }

  const startCreateSubset = () => {
    setCreatingSubset(true)
    setSubsetName('')
    setSelectedValues(new Set())
    setSearchQuery('')
  }

  const toggleValue = (value: string) => {
    const newSet = new Set(selectedValues)
    if (newSet.has(value)) {
      newSet.delete(value)
    } else {
      newSet.add(value)
    }
    setSelectedValues(newSet)
  }

  const toggleAll = () => {
    if (!selectedMaster) return
    const filteredItems = selectedMaster.items.filter(item =>
      item.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
    
    if (selectedValues.size === filteredItems.length) {
      // Deselect all filtered
      const newSet = new Set(selectedValues)
      filteredItems.forEach(item => newSet.delete(item.value))
      setSelectedValues(newSet)
    } else {
      // Select all filtered
      const newSet = new Set(selectedValues)
      filteredItems.forEach(item => newSet.add(item.value))
      setSelectedValues(newSet)
    }
  }

  const handleCreateSubset = async () => {
    if (!selectedMaster || !user?.email) return
    if (!subsetName.trim()) {
      alert('請輸入子集名稱')
      return
    }
    if (selectedValues.size === 0) {
      alert('請至少選擇一個選項')
      return
    }
    
    try {
      await createSubsetFromMaster(
        selectedMaster.id!,
        subsetName.trim(),
        Array.from(selectedValues),
        user.email
      )
      alert('子集建立成功！')
      setCreatingSubset(false)
      setSelectedMaster(null)
      await loadData()
    } catch (error) {
      console.error('建立子集失敗:', error)
      alert(`建立失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  // UNICORN: Backward compatibility - treat undefined as Master
  const masterSets = optionSets.filter(os => os.isMaster === true || os.isMaster === undefined)
  const subsetSets = optionSets.filter(os => os.isMaster === false)
  
  const filteredMasterItems = selectedMaster?.items.filter(item =>
    item.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">選項池與建表</h1>
        <p className="text-gray-500 mt-1">
          檢視 Master OptionSet、建立子集、建立與管理表格草稿
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1">
        <button
          onClick={() => setActiveTab('options')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'options'
              ? 'bg-purple-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Part A: 探索選項池
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'templates'
              ? 'bg-purple-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Part B: 建立表格
        </button>
      </div>

      {/* Part A: Explore Options */}
      {activeTab === 'options' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: OptionSets List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">選項池</h2>
            
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Master OptionSets */}
                {masterSets.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <span>📦</span>
                      <span>Master OptionSets</span>
                    </h3>
                    {masterSets.map(os => (
                      <div
                        key={os.id}
                        onClick={() => handleSelectMaster(os)}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedMaster?.id === os.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 bg-white hover:border-purple-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{os.name}</h4>
                            <p className="text-sm text-gray-500 mt-1">
                              code: <code className="text-purple-600">{os.code}</code> · {os.items.length} 個選項
                            </p>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                            MASTER
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Subset OptionSets */}
                {subsetSets.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <span>📑</span>
                      <span>Subsets</span>
                    </h3>
                    {subsetSets.map(os => (
                      <div
                        key={os.id}
                        className="p-4 rounded-xl border border-gray-200 bg-white"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{os.name}</h4>
                            <p className="text-sm text-gray-500 mt-1">
                              code: <code className="text-purple-600">{os.code}</code> · {os.items.length} 個選項
                            </p>
                          </div>
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">
                            SUBSET
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Master Details & Subset Creator */}
          <div className="space-y-4">
            {selectedMaster ? (
              <>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {selectedMaster.name}
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      MASTER
                    </span>
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    code: <code className="text-purple-600 font-mono">{selectedMaster.code}</code>
                    <span className="mx-2">·</span>
                    {selectedMaster.items.length} 個選項
                  </p>
                  
                  {/* Existing Subsets */}
                  {masterSubsets.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">現有子集：</h4>
                      <div className="space-y-1">
                        {masterSubsets.map(subset => (
                          <div key={subset.id} className="text-sm text-gray-600 flex items-center gap-2">
                            <span>📑</span>
                            <span>{subset.name}</span>
                            <span className="text-gray-400">({subset.items.length})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <button
                    onClick={startCreateSubset}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    建立子集
                  </button>
                </div>

                {/* Subset Creator Modal */}
                {creatingSubset && (
                  <div className="bg-white rounded-xl border-2 border-purple-300 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      從「{selectedMaster.name}」建立子集
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          子集名稱
                        </label>
                        <input
                          type="text"
                          value={subsetName}
                          onChange={(e) => setSubsetName(e.target.value)}
                          placeholder="例如：中學、教會小學"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            選擇要包含的選項
                          </label>
                          <span className="text-sm text-gray-500">
                            已選: {selectedValues.size}/{selectedMaster.items.length}
                          </span>
                        </div>
                        
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="🔍 搜尋選項..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                        />
                        
                        <button
                          onClick={toggleAll}
                          className="text-xs text-purple-600 hover:text-purple-700 mb-2"
                        >
                          {selectedValues.size === filteredMasterItems.length ? '取消全選' : '全選'}
                        </button>
                        
                        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                          {filteredMasterItems.map(item => (
                            <label
                              key={item.value}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedValues.has(item.value)}
                                onChange={() => toggleValue(item.value)}
                                className="text-purple-600 rounded"
                              />
                              <span className="text-sm text-gray-900">{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateSubset}
                          disabled={!subsetName.trim() || selectedValues.size === 0}
                          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          建立子集 ({selectedValues.size} 個選項)
                        </button>
                        <button
                          onClick={() => setCreatingSubset(false)}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
                <div className="text-gray-400 mb-3">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-gray-600">
                  選擇左側的 Master OptionSet<br/>
                  查看詳情並建立子集
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Part B: Create Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Browse Existing Templates */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">瀏覽現有表格</h2>
            
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.slice(0, 10).map(template => (
                  <div key={template.id} className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {template.moduleId} · {template.actionId} · v{template.version}
                        </p>
                        {template.description && (
                          <p className="text-sm text-gray-600 mt-2">{template.description}</p>
                        )}
                      </div>
                      {template.enabled && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                          啟用中
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-3">
                      {template.fields.length} 個欄位
                    </div>
                    
                    <button
                      onClick={() => alert('複製表格功能將在後續實作')}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      複製為草稿
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
