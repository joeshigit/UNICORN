'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { 
  getOptionSets, 
  createOptionSetViaFunction, 
  migrateOptionSetCode,
  deleteOptionSetViaFunction,
  updateOptionSetViaFunction,
  batchUploadOptionsViaFunction,
  migrateOptionSetsToMaster
} from '@/lib/firestore'
import type { OptionSet, OptionItem } from '@/types'

const statusColors: Record<string, string> = {
  staging: 'bg-yellow-500/20 text-yellow-400',
  active: 'bg-green-500/20 text-green-400',
  deprecated: 'bg-slate-500/20 text-slate-400',
}

// 🦄 UNICORN Pattern: Dictionary Preloading with Similarity Preview
interface SimilarOption {
  value: string
  label: string
  fromOptionSet: string
  status: string
}

export default function AdminOptionSetsPage() {
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  
  // Create form state
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newItems, setNewItems] = useState<Array<{ value: string; label: string }>>([])
  
  // Similarity Preview state
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null)
  const [showSimilarityPanel, setShowSimilarityPanel] = useState(false)
  
  // Migration state
  const [migratingId, setMigratingId] = useState<string | null>(null)
  const [migrateCode, setMigrateCode] = useState('')
  const [migrating, setMigrating] = useState(false)
  
  // 🦄 ADMIN POWER: Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editItems, setEditItems] = useState<Array<{
    value: string
    label: string
    status?: string
    createdAt?: string
    createdBy?: string
  }>>([])
  const [saving, setSaving] = useState(false)
  
  // 🦄 ADMIN POWER: Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  
  // 🦄 ADMIN POWER: CSV Upload state
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [csvData, setCsvData] = useState('')
  const [uploadMode, setUploadMode] = useState<'append' | 'replace' | 'merge'>('append')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Master/Subset migration state
  const [migratingToMaster, setMigratingToMaster] = useState(false)
  
  // Dictionary Preloading
  const preloadedOptions = useMemo(() => {
    if (!newCode.trim()) return []
    
    const options: SimilarOption[] = []
    optionSets
      .filter(os => os.code === newCode.trim())
      .forEach(os => {
        os.items.forEach(item => {
          if (!options.find(o => o.value === item.value)) {
            options.push({
              value: item.value,
              label: item.label,
              fromOptionSet: os.name,
              status: item.status || 'active'
            })
          }
        })
      })
    
    return options
  }, [newCode, optionSets])
  
  function findSimilarOptions(inputLabel: string): SimilarOption[] {
    if (!inputLabel || inputLabel.length < 2) return []
    
    const input = inputLabel.trim().toLowerCase()
    const inputPrefix = input.substring(0, 2)
    
    return preloadedOptions.filter(opt => {
      const label = opt.label.toLowerCase()
      return (
        label.startsWith(inputPrefix) ||
        label.includes(input) ||
        input.includes(label)
      )
    })
  }

  useEffect(() => {
    loadOptionSets()
  }, [])

  async function loadOptionSets() {
    try {
      const data = await getOptionSets()
      setOptionSets(data)
    } catch (error) {
      console.error('載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newCode.trim()) {
      alert('請輸入代碼（機器名稱）')
      return
    }
    if (!newName.trim()) {
      alert('請輸入顯示名稱')
      return
    }
    const codeRegex = /^[a-z][a-z0-9_]*$/
    if (!codeRegex.test(newCode.trim())) {
      alert('代碼格式錯誤：必須以小寫字母開頭，只能包含小寫字母、數字、底線')
      return
    }
    
    setCreating(true)
    try {
      await createOptionSetViaFunction({
        code: newCode.trim(),
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        items: newItems.filter(i => i.value && i.label)
      })
      
      await loadOptionSets()
      setShowCreate(false)
      setNewCode('')
      setNewName('')
      setNewDescription('')
      setNewItems([])
    } catch (error: any) {
      console.error('建立失敗:', error)
      alert('建立失敗: ' + error.message)
    } finally {
      setCreating(false)
    }
  }

  function addItem() {
    setNewItems([...newItems, { value: '', label: '' }])
  }

  function updateItem(index: number, field: 'value' | 'label', value: string) {
    const updated = [...newItems]
    updated[index][field] = value
    
    if (field === 'label' && !updated[index].value) {
      updated[index].value = value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30)
    }
    
    if (field === 'label' && value.length >= 2) {
      setActiveItemIndex(index)
      setShowSimilarityPanel(true)
    }
    
    setNewItems(updated)
  }

  function removeItem(index: number) {
    setNewItems(newItems.filter((_, i) => i !== index))
    if (activeItemIndex === index) {
      setActiveItemIndex(null)
      setShowSimilarityPanel(false)
    }
  }
  
  function useExistingOption(index: number, option: SimilarOption) {
    const updated = [...newItems]
    updated[index] = {
      value: option.value,
      label: option.label
    }
    setNewItems(updated)
    setShowSimilarityPanel(false)
    setActiveItemIndex(null)
  }

  function getItemStatus(item: OptionItem): string {
    return item.status || 'active'
  }

  async function handleMigrate(optionSetId: string) {
    if (!migrateCode.trim()) {
      alert('請輸入代碼')
      return
    }
    
    const codeRegex = /^[a-z][a-z0-9_]*$/
    if (!codeRegex.test(migrateCode.trim())) {
      alert('代碼格式錯誤：必須以小寫字母開頭，只能包含小寫字母、數字、底線')
      return
    }
    
    setMigrating(true)
    try {
      await migrateOptionSetCode(optionSetId, migrateCode.trim())
      await loadOptionSets()
      setMigratingId(null)
      setMigrateCode('')
      alert('遷移成功！')
    } catch (error: any) {
      console.error('遷移失敗:', error)
      alert('遷移失敗: ' + error.message)
    } finally {
      setMigrating(false)
    }
  }
  
  // Migrate all OptionSets to Master
  async function handleMigrateToMaster() {
    if (!confirm('確定要將所有現有的 OptionSets 標記為 Master？\n\n這個操作會為所有沒有 isMaster 欄位的 OptionSets 加上 isMaster: true。\n\n已有 isMaster 欄位的不會受影響。')) {
      return
    }
    
    setMigratingToMaster(true)
    try {
      const result = await migrateOptionSetsToMaster()
      
      if (result.errors.length > 0) {
        alert(`遷移完成！\n\n成功: ${result.updated} 個\n失敗: ${result.errors.length} 個\n\n錯誤：\n${result.errors.join('\n')}`)
      } else {
        alert(`遷移成功！已將 ${result.updated} 個 OptionSets 標記為 Master。`)
      }
      
      await loadOptionSets()
    } catch (error: any) {
      console.error('遷移失敗:', error)
      alert('遷移失敗: ' + error.message)
    } finally {
      setMigratingToMaster(false)
    }
  }
  
  // 🦄 ADMIN POWER: Delete
  async function handleDelete(optionSetId: string) {
    if (!confirm('確定要刪除此選項池？此操作無法復原！')) {
      return
    }
    
    setDeleting(true)
    try {
      await deleteOptionSetViaFunction(optionSetId)
      await loadOptionSets()
      setDeletingId(null)
      alert('刪除成功！')
    } catch (error: any) {
      console.error('刪除失敗:', error)
      alert('刪除失敗: ' + error.message)
    } finally {
      setDeleting(false)
    }
  }
  
  // 🦄 ADMIN POWER: Start Edit
  function startEdit(optionSet: OptionSet) {
    setEditingId(optionSet.id!)
    setEditName(optionSet.name)
    setEditDescription(optionSet.description || '')
    setEditItems(optionSet.items.map(item => ({
      value: item.value,
      label: item.label,
      status: item.status || 'active',
      createdAt: item.createdAt as string,
      createdBy: item.createdBy
    })))
  }
  
  // 🦄 ADMIN POWER: Save Edit
  async function handleSaveEdit() {
    if (!editingId) return
    
    setSaving(true)
    try {
      await updateOptionSetViaFunction(editingId, {
        name: editName,
        description: editDescription || undefined,
        items: editItems.filter(i => i.value && i.label)
      })
      await loadOptionSets()
      setEditingId(null)
      alert('儲存成功！')
    } catch (error: any) {
      console.error('儲存失敗:', error)
      alert('儲存失敗: ' + error.message)
    } finally {
      setSaving(false)
    }
  }
  
  // Edit item functions
  function addEditItem() {
    setEditItems([...editItems, { value: '', label: '', status: 'active' }])
  }
  
  function updateEditItem(index: number, field: string, value: string) {
    const updated = [...editItems]
    ;(updated[index] as any)[field] = value
    
    if (field === 'label' && !updated[index].value) {
      updated[index].value = value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30)
    }
    
    setEditItems(updated)
  }
  
  function removeEditItem(index: number) {
    setEditItems(editItems.filter((_, i) => i !== index))
  }
  
  // 🦄 ADMIN POWER: CSV Upload
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvData(text)
    }
    reader.readAsText(file)
  }
  
  async function handleUpload() {
    if (!uploadingId || !csvData.trim()) {
      alert('請選擇檔案或輸入 CSV 資料')
      return
    }
    
    setUploading(true)
    try {
      const result = await batchUploadOptionsViaFunction(uploadingId, csvData, uploadMode)
      await loadOptionSets()
      setUploadingId(null)
      setCsvData('')
      alert(`上傳成功！處理了 ${result.uploaded} 筆資料，最終共 ${result.final} 個選項`)
    } catch (error: any) {
      console.error('上傳失敗:', error)
      alert('上傳失敗: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const needsMigration = optionSets.filter(os => !os.code)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">選項池管理</h1>
          <p className="text-slate-400 mt-1">Admin 完整控制：建立、編輯、刪除、批次上傳</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors font-medium"
        >
          + 建立選項池
        </button>
      </div>

      {/* Admin Power Info */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
        <p className="text-purple-400 text-sm">
          🔑 Admin 模式：您擁有完整的選項池控制權限，包括直接編輯、刪除和 CSV 批次上傳。所有操作都會記錄到 Audit Log。
        </p>
      </div>

      {/* Migration Warning */}
      {needsMigration.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm">
            🚨 有 {needsMigration.length} 個選項池缺少代碼（code），需要進行遷移。
          </p>
        </div>
      )}

      {/* Master/Subset Migration */}
      {optionSets.some(os => os.isMaster === undefined) && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-blue-400 text-sm mb-2">
                🦄 <strong>Master/Subset 功能升級</strong>
              </p>
              <p className="text-blue-300 text-sm mb-3">
                系統已升級支援 Master/Subset OptionSet 設計。現有的 OptionSets 需要標記為 Master，才能在「設計表格」中顯示並建立子集。
              </p>
              <p className="text-blue-400 text-xs">
                • 此操作會為所有現有 OptionSets 加上 isMaster: true<br/>
                • 已標記的 OptionSets 不會受影響<br/>
                • 操作後 Leader 才能建立 Subset
              </p>
            </div>
            <button
              onClick={handleMigrateToMaster}
              disabled={migratingToMaster}
              className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
            >
              {migratingToMaster ? '遷移中...' : '執行遷移'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : optionSets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400">還沒有任何選項池</p>
        </div>
      ) : (
        <div className="space-y-4">
          {optionSets.map(optionSet => (
            <div
              key={optionSet.id}
              className="bg-slate-800 rounded-xl border border-slate-700 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{optionSet.name}</h3>
                    {optionSet.code ? (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-sm font-mono">
                        {optionSet.code}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-sm">
                        缺少代碼
                      </span>
                    )}
                  </div>
                  {optionSet.description && (
                    <p className="text-slate-400 text-sm mt-1">{optionSet.description}</p>
                  )}
                </div>
                
                {/* 🦄 ADMIN POWER: Action Buttons */}
                <div className="flex items-center gap-2">
                  {!optionSet.code && (
                    <button
                      onClick={() => {
                        setMigratingId(optionSet.id!)
                        setMigrateCode('')
                      }}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30 transition-colors"
                    >
                      設定代碼
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(optionSet)}
                    className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 transition-colors"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => setUploadingId(optionSet.id!)}
                    className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 transition-colors"
                  >
                    CSV 上傳
                  </button>
                  <button
                    onClick={() => handleDelete(optionSet.id!)}
                    disabled={deleting}
                    className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {deleting ? '刪除中...' : '刪除'}
                  </button>
                </div>
              </div>
              
              {/* Migration Input */}
              {migratingId === optionSet.id && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm mb-3">
                    為「{optionSet.name}」設定代碼（機器名稱）：
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={migrateCode}
                      onChange={(e) => setMigrateCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="例如：school"
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-red-500 focus:outline-none font-mono"
                    />
                    <button
                      onClick={() => handleMigrate(optionSet.id!)}
                      disabled={migrating || !migrateCode.trim()}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50"
                    >
                      {migrating ? '處理中...' : '確認'}
                    </button>
                    <button
                      onClick={() => {
                        setMigratingId(null)
                        setMigrateCode('')
                      }}
                      className="px-4 py-2 text-slate-400 hover:text-white"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
              
              {/* CSV Upload Panel */}
              {uploadingId === optionSet.id && (
                <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 text-sm mb-3">
                    📤 CSV 批次上傳到「{optionSet.name}」
                  </p>
                  
                  <div className="space-y-3">
                    {/* Upload Mode */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">上傳模式</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setUploadMode('append')}
                          className={`px-3 py-1 rounded text-sm ${uploadMode === 'append' ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                        >
                          新增
                        </button>
                        <button
                          onClick={() => setUploadMode('merge')}
                          className={`px-3 py-1 rounded text-sm ${uploadMode === 'merge' ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                        >
                          合併
                        </button>
                        <button
                          onClick={() => setUploadMode('replace')}
                          className={`px-3 py-1 rounded text-sm ${uploadMode === 'replace' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                        >
                          取代全部
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {uploadMode === 'append' && '新增：只新增不存在的選項'}
                        {uploadMode === 'merge' && '合併：更新現有選項的 label，新增不存在的'}
                        {uploadMode === 'replace' && '⚠️ 取代：刪除所有現有選項，用新的取代'}
                      </p>
                    </div>
                    
                    {/* File Input */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">選擇 CSV 檔案</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleFileSelect}
                        className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-500/20 file:text-green-400 hover:file:bg-green-500/30"
                      />
                    </div>
                    
                    {/* CSV Text Area */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">或直接貼上 CSV 資料</label>
                      <textarea
                        value={csvData}
                        onChange={(e) => setCsvData(e.target.value)}
                        placeholder="格式：value,label（每行一個）&#10;例如：&#10;HAISUM,海星中學&#10;LAOBO,勞校中學&#10;&#10;或只有 label（自動生成 value）：&#10;海星中學&#10;勞校中學"
                        rows={6}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-green-500 focus:outline-none font-mono text-sm"
                      />
                    </div>
                    
                    {/* Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpload}
                        disabled={uploading || !csvData.trim()}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-400 transition-colors disabled:opacity-50"
                      >
                        {uploading ? '上傳中...' : '開始上傳'}
                      </button>
                      <button
                        onClick={() => {
                          setUploadingId(null)
                          setCsvData('')
                        }}
                        className="px-4 py-2 text-slate-400 hover:text-white"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex flex-wrap gap-2">
                {optionSet.items.map((item, index) => {
                  const status = getItemStatus(item)
                  return (
                    <div
                      key={index}
                      className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                        status === 'deprecated'
                          ? 'bg-slate-700/50 text-slate-500 line-through'
                          : status === 'staging'
                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="font-mono text-xs text-slate-500">{item.value}</span>
                      <span>{item.label}</span>
                      {status !== 'active' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[status]}`}>
                          {status}
                        </span>
                      )}
                      {item.mergedInto && (
                        <span className="text-xs text-orange-400">→ {item.mergedInto}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              
              <div className="mt-4 text-xs text-slate-500">
                共 {optionSet.items.length} 個選項 
                (Active: {optionSet.items.filter(i => getItemStatus(i) === 'active').length}, 
                Staging: {optionSet.items.filter(i => getItemStatus(i) === 'staging').length}, 
                Deprecated: {optionSet.items.filter(i => getItemStatus(i) === 'deprecated').length})
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">建立選項池</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    代碼（機器名稱）* 
                    <span className="text-amber-400 ml-2">建立後不可變更</span>
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
                    placeholder="例如：school、program、location"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    此代碼將作為文件中的欄位名稱（如 school: &quot;海星中學&quot;）
                  </p>
                  
                  {preloadedOptions.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-blue-400 text-xs mb-2">
                        💡 發現 {preloadedOptions.length} 個現有選項使用相同的代碼「{newCode}」
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {preloadedOptions.slice(0, 10).map((opt, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                            {opt.label}
                          </span>
                        ))}
                        {preloadedOptions.length > 10 && (
                          <span className="px-2 py-0.5 text-blue-400 text-xs">
                            +{preloadedOptions.length - 10} 個更多
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">顯示名稱 *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    placeholder="例如：全澳中學"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">描述</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    placeholder="選填"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-slate-400">初始選項</label>
                    <button
                      onClick={addItem}
                      className="text-sm text-amber-400 hover:text-amber-300"
                    >
                      + 新增選項
                    </button>
                  </div>
                  
                  {newItems.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">
                      點擊「新增選項」來新增初始選項
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {newItems.map((item, index) => {
                        const similarOptions = findSimilarOptions(item.label)
                        const hasSimilar = similarOptions.length > 0 && activeItemIndex === index && showSimilarityPanel
                        
                        return (
                          <div key={index} className="relative">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) => updateItem(index, 'label', e.target.value)}
                                onFocus={() => {
                                  setActiveItemIndex(index)
                                  if (item.label.length >= 2) {
                                    setShowSimilarityPanel(true)
                                  }
                                }}
                                onBlur={() => {
                                  setTimeout(() => setShowSimilarityPanel(false), 200)
                                }}
                                className={`flex-1 px-3 py-2 bg-slate-900 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${
                                  hasSimilar ? 'border-amber-500' : 'border-slate-700 focus:border-amber-500'
                                }`}
                                placeholder="顯示名稱"
                              />
                              <input
                                type="text"
                                value={item.value}
                                onChange={(e) => updateItem(index, 'value', e.target.value)}
                                className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono text-sm"
                                placeholder="Code"
                              />
                              <button
                                onClick={() => removeItem(index)}
                                className="p-2 text-red-400 hover:text-red-300"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            
                            {hasSimilar && (
                              <div className="absolute left-0 right-12 mt-1 bg-slate-900 border border-amber-500/50 rounded-lg shadow-lg z-10 overflow-hidden">
                                <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30">
                                  <p className="text-amber-400 text-xs font-medium">
                                    ⚠️ 發現 {similarOptions.length} 個相似選項
                                  </p>
                                </div>
                                <div className="max-h-40 overflow-auto">
                                  {similarOptions.map((opt, optIndex) => (
                                    <button
                                      key={optIndex}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        useExistingOption(index, opt)
                                      }}
                                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-800 transition-colors text-left"
                                    >
                                      <div>
                                        <span className="text-white">{opt.label}</span>
                                        <span className="text-slate-500 text-xs ml-2">({opt.fromOptionSet})</span>
                                      </div>
                                      <span className="text-slate-400 text-xs font-mono">{opt.value}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreate(false)
                    setNewCode('')
                    setNewName('')
                    setNewDescription('')
                    setNewItems([])
                  }}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  disabled={creating}
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newCode.trim() || !newName.trim()}
                  className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-400 transition-colors font-medium disabled:opacity-50"
                >
                  {creating ? '建立中...' : '建立'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">編輯選項池</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">顯示名稱 *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">描述</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-slate-400">選項列表</label>
                    <button
                      onClick={addEditItem}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      + 新增選項
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {editItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => updateEditItem(index, 'label', e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          placeholder="顯示名稱"
                        />
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) => updateEditItem(index, 'value', e.target.value)}
                          className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono text-sm"
                          placeholder="Code"
                        />
                        <select
                          value={item.status || 'active'}
                          onChange={(e) => updateEditItem(index, 'status', e.target.value)}
                          className="px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        >
                          <option value="active">Active</option>
                          <option value="staging">Staging</option>
                          <option value="deprecated">Deprecated</option>
                        </select>
                        <button
                          onClick={() => removeEditItem(index)}
                          className="p-2 text-red-400 hover:text-red-300"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
