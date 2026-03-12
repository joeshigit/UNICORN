'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import {
  getOptionSets,
  getSubsetsForMaster,
  getTemplates,
  createOptionSetViaFunction,
  updateOptionSetViaFunction,
  deleteOptionSetViaFunction,
} from '@/lib/firestore'
import type { OptionSet, Template } from '@/types'

type RightPanel = 'none' | 'master-detail' | 'subset-edit' | 'new-subset' | 'add-item' | 'delete-item'

export default function OptionSetsPage() {
  const { user } = useAuth()
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [allTemplates, setAllTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedMaster, setSelectedMaster] = useState<OptionSet | null>(null)
  const [masterSubsets, setMasterSubsets] = useState<OptionSet[]>([])
  const [rightPanel, setRightPanel] = useState<RightPanel>('none')

  const [editingSubset, setEditingSubset] = useState<OptionSet | null>(null)
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [newSubsetName, setNewSubsetName] = useState('')
  const [newSubsetDesc, setNewSubsetDesc] = useState('')

  const [newItemValue, setNewItemValue] = useState('')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [deleteItemValue, setDeleteItemValue] = useState<string | null>(null)

  const [editingDesc, setEditingDesc] = useState(false)
  const [editDescValue, setEditDescValue] = useState('')

  const [showNewMaster, setShowNewMaster] = useState(false)
  const [newMasterCode, setNewMasterCode] = useState('')
  const [newMasterName, setNewMasterName] = useState('')
  const [newMasterDesc, setNewMasterDesc] = useState('')
  const [newMasterItems, setNewMasterItems] = useState('')

  useEffect(() => {
    if (user?.email) loadData()
  }, [user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [sets, templates] = await Promise.all([getOptionSets(), getTemplates()])
      setOptionSets(sets)
      setAllTemplates(templates)
    } catch (e) {
      console.error('載入失敗:', e)
    } finally {
      setLoading(false)
    }
  }

  const { masterSets, subsetSets } = useMemo(() => {
    const byCode = new Map<string, OptionSet[]>()
    optionSets.forEach(os => {
      const list = byCode.get(os.code) || []
      list.push(os)
      byCode.set(os.code, list)
    })

    const masters: OptionSet[] = []
    const subsets: OptionSet[] = []

    byCode.forEach(group => {
      if (group.length === 1) {
        masters.push(group[0])
        return
      }
      const explicit = group.find(os => os.isMaster === true)
      if (explicit) {
        masters.push(explicit)
        group.filter(os => os.id !== explicit.id).forEach(os => subsets.push(os))
        return
      }
      const sorted = [...group].sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0))
      masters.push(sorted[0])
      sorted.slice(1).forEach(os => subsets.push(os))
    })

    return { masterSets: masters, subsetSets: subsets }
  }, [optionSets])

  const getUsingTemplates = (optionSetId: string): string[] => {
    return allTemplates
      .filter(t => t.fields.some(f => f.optionSetId === optionSetId))
      .map(t => t.name)
  }

  const getSubsetsOf = (master: OptionSet): OptionSet[] => {
    return subsetSets.filter(os => os.masterSetId === master.id || os.code === master.code)
  }

  const handleSelectMaster = async (master: OptionSet) => {
    setSelectedMaster(master)
    setRightPanel('master-detail')
    setEditingSubset(null)
    try {
      const subs = await getSubsetsForMaster(master.id!)
      setMasterSubsets(subs)
    } catch (e) {
      console.error('載入子集失敗:', e)
      setMasterSubsets(getSubsetsOf(master))
    }
  }

  const refreshMaster = async () => {
    if (!selectedMaster) return
    const [sets, templates] = await Promise.all([getOptionSets(), getTemplates()])
    setOptionSets(sets)
    setAllTemplates(templates)
    const refreshed = sets.find(os => os.id === selectedMaster.id)
    if (refreshed) {
      setSelectedMaster(refreshed)
      try {
        const subs = await getSubsetsForMaster(refreshed.id!)
        setMasterSubsets(subs)
      } catch {
        setMasterSubsets(sets.filter(os => os.isMaster === false && os.masterSetId === refreshed.id))
      }
    }
  }

  // --- Edit description ---
  const startEditDesc = () => {
    if (!selectedMaster) return
    setEditDescValue(selectedMaster.description || '')
    setEditingDesc(true)
  }

  const handleSaveDesc = async () => {
    if (!selectedMaster) return
    try {
      await updateOptionSetViaFunction(selectedMaster.id!, { description: editDescValue.trim() || '' })
      setEditingDesc(false)
      await refreshMaster()
    } catch (e) { alert('更新失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- Master: Add Item ---
  const openAddItem = () => { setNewItemValue(''); setNewItemLabel(''); setRightPanel('add-item') }

  const handleAddItem = async () => {
    if (!selectedMaster || !newItemValue.trim()) return
    const value = newItemValue.trim()
    if (selectedMaster.items.some(i => i.value === value)) { alert(`選項 "${value}" 已存在`); return }
    const updatedItems = [
      ...selectedMaster.items.map(i => ({ value: i.value, label: i.label, status: i.status || 'active' })),
      { value, label: newItemLabel.trim() || value, status: 'active' },
    ]
    try {
      await updateOptionSetViaFunction(selectedMaster.id!, { items: updatedItems })
      setRightPanel('master-detail')
      await refreshMaster()
    } catch (e) { alert('新增失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- Master: Delete Item ---
  const openDeleteItem = () => { setDeleteItemValue(null); setRightPanel('delete-item') }

  const handleDeleteItem = async () => {
    if (!selectedMaster || !deleteItemValue) return
    const updatedItems = selectedMaster.items
      .filter(i => i.value !== deleteItemValue)
      .map(i => ({ value: i.value, label: i.label, status: i.status || 'active' }))
    try {
      await updateOptionSetViaFunction(selectedMaster.id!, { items: updatedItems })
      setDeleteItemValue(null)
      setRightPanel('master-detail')
      await refreshMaster()
    } catch (e) { alert('刪除失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- Master: New Subset (with isMaster patch) ---
  const openNewSubset = () => {
    if (!selectedMaster) return
    setNewSubsetName(''); setNewSubsetDesc(''); setSelectedValues(new Set()); setSearchQuery('')
    setRightPanel('new-subset')
  }

  const handleCreateSubset = async () => {
    if (!selectedMaster || !newSubsetName.trim() || selectedValues.size === 0) return
    const subsetItems = selectedMaster.items
      .filter(item => selectedValues.has(item.value))
      .map(item => ({ value: item.value, label: item.label }))
    try {
      await createOptionSetViaFunction({
        code: selectedMaster.code,
        name: newSubsetName.trim(),
        description: newSubsetDesc.trim() || undefined,
        items: subsetItems,
        isMaster: false,
        masterSetId: selectedMaster.id!,
      })
      alert('子集建立成功！')
      setRightPanel('master-detail')
      await refreshMaster()
    } catch (e) { alert('建立失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- Subset: Modify ---
  const openSubsetEdit = (subset: OptionSet) => {
    if (!selectedMaster) return
    setEditingSubset(subset)
    setSelectedValues(new Set(subset.items.map(i => i.value)))
    setNewSubsetDesc(subset.description && !subset.description.startsWith('子集 of') ? subset.description : '')
    setSearchQuery('')
    setRightPanel('subset-edit')
  }

  const handleSaveSubset = async () => {
    if (!editingSubset || !selectedMaster) return
    const subsetItems = selectedMaster.items
      .filter(item => selectedValues.has(item.value))
      .map(i => ({ value: i.value, label: i.label, status: i.status || 'active' }))
    if (subsetItems.length === 0) { alert('子集至少需要一個選項'); return }
    try {
      await updateOptionSetViaFunction(editingSubset.id!, { items: subsetItems, description: newSubsetDesc.trim() || '' })
      alert('子集已更新！')
      setRightPanel('master-detail')
      setEditingSubset(null)
      await refreshMaster()
    } catch (e) { alert('更新失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- Delete OptionSet (Master or Subset) ---
  const handleDeleteOptionSet = async (os: OptionSet) => {
    const usingTemplates = getUsingTemplates(os.id!)
    if (usingTemplates.length > 0) {
      alert(`無法刪除「${os.name}」，已被以下表格使用：\n${usingTemplates.join('、')}`)
      return
    }

    const isMaster = masterSets.some(m => m.id === os.id)
    if (isMaster) {
      const children = getSubsetsOf(os)
      if (children.length > 0) {
        alert(`無法刪除 Master「${os.name}」，仍有 ${children.length} 個子集。請先刪除子集。`)
        return
      }
    }

    if (isMaster) {
      if (!confirm(`⚠ 你正在刪除 Master「${os.name}」(code: ${os.code})。\n\n刪除後此 code 的所有選項將消失。\n確定要繼續嗎？`)) return
      if (!confirm(`再次確認：刪除 Master「${os.name}」？此操作不可復原。`)) return
    } else {
      if (!confirm(`確定要刪除子集「${os.name}」？此操作不可復原。`)) return
    }

    try {
      await deleteOptionSetViaFunction(os.id!)
      alert('已刪除')
      if (selectedMaster?.id === os.id) {
        setSelectedMaster(null)
        setRightPanel('none')
      }
      await loadData()
    } catch (e) { alert('刪除失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- New Master ---
  const handleCreateMaster = async () => {
    if (!user?.email || !newMasterCode.trim() || !newMasterName.trim()) return
    const code = newMasterCode.trim().toLowerCase()
    if (masterSets.find(os => os.code === code)) { alert(`code "${code}" 的 Master 已存在`); return }
    const items = newMasterItems.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ value: l, label: l }))
    try {
      await createOptionSetViaFunction({ code, name: newMasterName.trim(), description: newMasterDesc.trim() || undefined, items, isMaster: true })
      alert('Master 建立成功！')
      setShowNewMaster(false); setNewMasterCode(''); setNewMasterName(''); setNewMasterDesc(''); setNewMasterItems('')
      await loadData()
    } catch (e) { alert('建立失敗：' + (e instanceof Error ? e.message : '未知錯誤')) }
  }

  // --- Helpers ---
  const toggleValue = (v: string) => {
    const s = new Set(selectedValues); s.has(v) ? s.delete(v) : s.add(v); setSelectedValues(s)
  }
  const filteredMasterItems = selectedMaster?.items.filter(item =>
    item.value.toLowerCase().includes(searchQuery.toLowerCase()) || item.label.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []
  const toggleAll = () => {
    const s = new Set(selectedValues)
    if (selectedValues.size === filteredMasterItems.length) { filteredMasterItems.forEach(i => s.delete(i.value)) }
    else { filteredMasterItems.forEach(i => s.add(i.value)) }
    setSelectedValues(s)
  }

  return (
    <div className="space-y-6 min-h-screen bg-fuchsia-50/50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 rounded-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">選項池</h1>
        <p className="text-gray-500 mt-1">管理 Master OptionSet 和子集</p>
      </div>

      {showNewMaster && (
        <div className="bg-white rounded-xl border-2 border-purple-300 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">建立新 Master OptionSet</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code（Universal KEY）<span className="text-red-500">*</span></label>
              <input type="text" value={newMasterCode} onChange={e => setNewMasterCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="例：school" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono" />
              <p className="text-xs text-gray-400 mt-1">小寫英文、數字、底線，建立後不可更改</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名稱 <span className="text-red-500">*</span></label>
              <input type="text" value={newMasterName} onChange={e => setNewMasterName(e.target.value)} placeholder="例：學校" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <input type="text" value={newMasterDesc} onChange={e => setNewMasterDesc(e.target.value)} placeholder="例：教青局官方學校清單，每年 9 月更新" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">初始選項（每行一個）</label>
            <textarea value={newMasterItems} onChange={e => setNewMasterItems(e.target.value)} placeholder={"粵華中學\n培正中學"} rows={5} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateMaster} disabled={!newMasterCode.trim() || !newMasterName.trim()} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">建立</button>
            <button onClick={() => setShowNewMaster(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">取消</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="space-y-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              <div className="space-y-4">
                {masterSets.map(master => {
                  const inUse = getUsingTemplates(master.id!).length > 0
                  const children = getSubsetsOf(master)
                  return (
                    <div key={master.id} className="space-y-1">
                      {/* Master card */}
                      <div className={`p-4 rounded-xl border-2 transition-all ${selectedMaster?.id === master.id ? 'border-purple-500 bg-purple-50' : 'border-purple-200 bg-white hover:border-purple-300'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 cursor-pointer" onClick={() => handleSelectMaster(master)}>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-gray-900">{master.name}</h4>
                              <span className="px-1.5 py-0.5 bg-purple-600 text-white text-[10px] rounded font-bold">MASTER</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">code: <code className="text-purple-600">{master.code}</code> · {master.items.length} 個選項 · {children.length} 個子集</p>
                            {master.description && <p className="text-xs text-gray-400 mt-0.5">{master.description}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => { handleSelectMaster(master); setTimeout(openAddItem, 100) }} className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200">+選項</button>
                            <button onClick={() => { handleSelectMaster(master); setTimeout(openDeleteItem, 100) }} className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200">-選項</button>
                            <button onClick={() => { handleSelectMaster(master); setTimeout(openNewSubset, 100) }} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">+子集</button>
                            <button
                              onClick={() => handleDeleteOptionSet(master)}
                              className={`px-2 py-1 text-xs rounded ${inUse || children.length > 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'}`}
                              title={inUse ? '使用中，無法刪除' : children.length > 0 ? '有子集，無法刪除' : '刪除'}
                            >刪除</button>
                          </div>
                        </div>
                      </div>

                      {/* Children indented under master */}
                      {children.map(child => {
                        const childInUse = getUsingTemplates(child.id!).length > 0
                        return (
                          <div key={child.id} className={`ml-6 p-3 rounded-lg border transition-all ${editingSubset?.id === child.id ? 'border-teal-500 bg-teal-50' : 'border-teal-200 bg-teal-50/40'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-teal-400 text-xs">└</span>
                                  <h4 className="font-medium text-gray-800 text-sm">{child.name}</h4>
                                  <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 text-[10px] rounded font-medium">子集</span>
                                </div>
                                <p className="text-xs text-gray-500 ml-5">{child.items.length} 個選項</p>
                                {child.description && !child.description.startsWith('子集 of') && (
                                  <p className="text-xs text-gray-400 ml-5">{child.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { handleSelectMaster(master); setTimeout(() => openSubsetEdit(child), 150) }}
                                  className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700"
                                >修改</button>
                                <button
                                  onClick={() => handleDeleteOptionSet(child)}
                                  className={`px-2 py-1 text-xs rounded ${childInUse ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'}`}
                                  title={childInUse ? '使用中，無法刪除' : '刪除'}
                                >刪除</button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                {/* Orphan subsets (no matching master found) */}
                {subsetSets.filter(os => !masterSets.some(m => m.code === os.code)).length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h3 className="text-sm font-medium text-gray-400">未歸類的子集</h3>
                    {subsetSets.filter(os => !masterSets.some(m => m.code === os.code)).map(os => {
                      const inUse = getUsingTemplates(os.id!).length > 0
                      return (
                        <div key={os.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-700 text-sm">{os.name}</h4>
                              <p className="text-xs text-gray-400">code: {os.code} · {os.items.length} 個選項</p>
                            </div>
                            <button
                              onClick={() => handleDeleteOptionSet(os)}
                              className={`px-2 py-1 text-xs rounded ${inUse ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'}`}
                            >刪除</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Add new Master button */}
              <button
                onClick={() => setShowNewMaster(true)}
                className="w-full py-3 border-2 border-dashed border-purple-300 rounded-xl text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-colors text-sm font-medium"
              >
                + 建立新 Master OptionSet
              </button>
            </>
          )}
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {rightPanel === 'master-detail' && selectedMaster && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{selectedMaster.name}</h3>
              <p className="text-sm text-gray-500 mb-2">code: <code className="text-purple-600 font-mono">{selectedMaster.code}</code> · {selectedMaster.items.length} 個選項</p>
              <div className="mb-4">
                {editingDesc ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editDescValue}
                      onChange={e => setEditDescValue(e.target.value)}
                      placeholder="新增說明..."
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveDesc(); if (e.key === 'Escape') setEditingDesc(false) }}
                    />
                    <button onClick={handleSaveDesc} className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">儲存</button>
                    <button onClick={() => setEditingDesc(false)} className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">取消</button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 flex items-center gap-1 cursor-pointer group" onClick={startEditDesc}>
                    {selectedMaster.description || <span className="italic">無說明（點擊新增）</span>}
                    <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </p>
                )}
              </div>
              {masterSubsets.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">此 Master 的子集：</h4>
                  {masterSubsets.map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-600">{s.name} ({s.items.length})</span>
                      <button onClick={() => openSubsetEdit(s)} className="text-xs text-teal-600 hover:text-teal-700">修改</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">所有選項：</h4>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {selectedMaster.items.map(item => (
                    <div key={item.value} className="text-sm text-gray-700 py-1 px-2 bg-gray-50 rounded flex justify-between">
                      <span>{item.label}</span>
                      {item.value !== item.label && <span className="text-gray-400 font-mono text-xs">{item.value}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {rightPanel === 'add-item' && selectedMaster && (
            <div className="bg-white rounded-xl border-2 border-amber-300 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-amber-800">新增選項到「{selectedMaster.name}」</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Value <span className="text-red-500">*</span></label>
                  <input type="text" value={newItemValue} onChange={e => setNewItemValue(e.target.value)} placeholder="例：聖若瑟教區中學" className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Label（留空同 Value）</label>
                  <input type="text" value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} placeholder="留空則同 Value" className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddItem} disabled={!newItemValue.trim()} className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">新增</button>
                <button onClick={() => setRightPanel('master-detail')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">取消</button>
              </div>
            </div>
          )}

          {rightPanel === 'delete-item' && selectedMaster && (
            <div className="bg-white rounded-xl border-2 border-red-200 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-red-700">從「{selectedMaster.name}」刪除選項</h3>
              <p className="text-sm text-red-600">已使用的選項刪除後不影響既有 submission</p>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {selectedMaster.items.map(item => (
                  <label key={item.value} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${deleteItemValue === item.value ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <input type="radio" name="deleteItem" checked={deleteItemValue === item.value} onChange={() => setDeleteItemValue(item.value)} className="text-red-600" />
                    <span className="text-sm text-gray-900">{item.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleDeleteItem} disabled={!deleteItemValue} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">確認刪除</button>
                <button onClick={() => setRightPanel('master-detail')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">取消</button>
              </div>
            </div>
          )}

          {rightPanel === 'new-subset' && selectedMaster && (
            <div className="bg-white rounded-xl border-2 border-purple-300 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">從「{selectedMaster.name}」建立子集</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">子集名稱</label>
                <input type="text" value={newSubsetName} onChange={e => setNewSubsetName(e.target.value)} placeholder="例：中學" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
                <input type="text" value={newSubsetDesc} onChange={e => setNewSubsetDesc(e.target.value)} placeholder="例：僅包含中學" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">選擇選項</label>
                  <span className="text-sm text-gray-500">已選: {selectedValues.size}/{selectedMaster.items.length}</span>
                </div>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋選項..." className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 text-sm" />
                <button onClick={toggleAll} className="text-xs text-purple-600 hover:text-purple-700 mb-2">{selectedValues.size === filteredMasterItems.length ? '取消全選' : '全選'}</button>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {filteredMasterItems.map(item => (
                    <label key={item.value} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                      <input type="checkbox" checked={selectedValues.has(item.value)} onChange={() => toggleValue(item.value)} className="text-purple-600 rounded" />
                      <span className="text-sm text-gray-900">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateSubset} disabled={!newSubsetName.trim() || selectedValues.size === 0} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">建立子集 ({selectedValues.size})</button>
                <button onClick={() => setRightPanel('master-detail')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">取消</button>
              </div>
            </div>
          )}

          {rightPanel === 'subset-edit' && selectedMaster && editingSubset && (
            <div className="bg-white rounded-xl border-2 border-teal-300 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-teal-800">修改子集「{editingSubset.name}」</h3>
              <p className="text-sm text-gray-500 mb-2">子集名稱不可更改（已用於表格中）。從 Master「{selectedMaster.name}」重新勾選。</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
                <input type="text" value={newSubsetDesc} onChange={e => setNewSubsetDesc(e.target.value)} placeholder="例：僅包含中學" className="w-full px-3 py-2 border border-teal-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">選擇選項</label>
                  <span className="text-sm text-gray-500">已選: {selectedValues.size}/{selectedMaster.items.length}</span>
                </div>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋選項..." className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 text-sm" />
                <button onClick={toggleAll} className="text-xs text-teal-600 hover:text-teal-700 mb-2">{selectedValues.size === filteredMasterItems.length ? '取消全選' : '全選'}</button>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {filteredMasterItems.map(item => (
                    <label key={item.value} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                      <input type="checkbox" checked={selectedValues.has(item.value)} onChange={() => toggleValue(item.value)} className="text-teal-600 rounded" />
                      <span className="text-sm text-gray-900">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveSubset} disabled={selectedValues.size === 0} className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">儲存 ({selectedValues.size})</button>
                <button onClick={() => { setRightPanel('master-detail'); setEditingSubset(null) }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">取消</button>
              </div>
            </div>
          )}

          {rightPanel === 'none' && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-500">選擇左側的 OptionSet 進行操作</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
