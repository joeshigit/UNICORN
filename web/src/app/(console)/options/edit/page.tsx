'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import { createSubset, getOptionSet, updateOptionSet } from '@/lib/db'
import { parseOptionLines } from '@/lib/csv'
import type { OptionItem, OptionSet } from '@/types'

interface DraftItem {
  value: string
  label: string
  status: 'active' | 'deprecated'
  isNew: boolean
}

function toDraft(items: OptionItem[]): DraftItem[] {
  return items.map(item => ({
    value: item.value,
    label: item.label,
    status: item.status === 'deprecated' ? 'deprecated' : 'active',
    isNew: false,
  }))
}

function OptionSetEditor() {
  const router = useRouter()
  const params = useSearchParams()
  const { email } = useAuth()

  const setId = params.get('id') || ''
  const subsetOf = params.get('subsetOf') || ''

  const [optionSet, setOptionSet] = useState<OptionSet | null>(null)
  const [master, setMaster] = useState<OptionSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [bulkText, setBulkText] = useState('')

  useEffect(() => {
    const boot = async () => {
      try {
        if (subsetOf) {
          const found = await getOptionSet(subsetOf)
          if (!found) throw new Error('找不到完整清單')
          setMaster(found)
          setName(`${found.name} — 子集`)
        } else if (setId) {
          const found = await getOptionSet(setId)
          if (!found) throw new Error('找不到選項池')
          setOptionSet(found)
          setName(found.name)
          setDescription(found.description || '')
          setItems(toDraft(found.items))
          if (!found.isMaster) {
            setSelectedValues(found.items.map(i => i.value))
            if (found.masterSetId) setMaster(await getOptionSet(found.masterSetId))
          }
        } else {
          throw new Error('沒有指定選項池')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗')
      } finally {
        setLoading(false)
      }
    }
    boot()
  }, [setId, subsetOf])

  const isSubsetMode = !!subsetOf || (!!optionSet && !optionSet.isMaster)
  const code = optionSet?.code || master?.code || ''

  const existingValues = useMemo(() => new Set(items.map(i => i.value)), [items])

  const addItem = () =>
    setItems(prev => [...prev, { value: '', label: '', status: 'active', isNew: true }])

  const updateItem = (index: number, patch: Partial<DraftItem>) =>
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index))

  const applyBulk = () => {
    const parsed = parseOptionLines(bulkText)
    const added = parsed
      .filter(p => !existingValues.has(p.value))
      .map(p => ({ value: p.value, label: p.label, status: 'active' as const, isNew: true }))
    setItems(prev => [...prev, ...added])
    setBulkText('')
  }

  const problems = useMemo(() => {
    const list: string[] = []
    if (!name.trim()) list.push('請填清單名稱')
    if (isSubsetMode) {
      if (selectedValues.length === 0 && subsetOf) list.push('至少要挑一個選項')
    } else {
      if (items.some(i => !i.value.trim())) list.push('選項的值不能空白')
      const values = items.map(i => i.value.trim())
      if (new Set(values).size !== values.length) list.push('選項的值不能重複')
    }
    return list
  }, [name, items, isSubsetMode, selectedValues, subsetOf])

  const handleSave = async () => {
    if (problems.length > 0) return
    setSaving(true)
    setError('')
    try {
      if (subsetOf && master) {
        await createSubset(master, name, selectedValues, email)
      } else if (optionSet && !optionSet.isMaster && master) {
        const chosen = master.items.filter(i => selectedValues.includes(i.value))
        await updateOptionSet(optionSet.id!, { name, description, items: chosen })
      } else if (optionSet) {
        await updateOptionSet(optionSet.id!, {
          name,
          description,
          items: items.map(i => ({
            value: i.value.trim(),
            label: i.label.trim() || i.value.trim(),
            status: i.status,
          })),
        })
      }
      router.push('/options')
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="載入中" />

  return (
    <>
      <Link href="/options" className="btn-ghost btn-sm mb-4 -ml-3">
        <ArrowLeft className="h-4 w-4" />
        回選項池
      </Link>

      <PageHeader
        title={subsetOf ? '建立子集' : isSubsetMode ? '編輯子集' : '編輯選項'}
        description={
          isSubsetMode
            ? '子集只能從完整清單裡挑，所以不管用哪個子集填報，存進資料池的值都是同一套。'
            : '值（value）是存進資料池的標準碼，建立後不要改；要換稱呼改顯示名稱就好。'
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="space-y-5">
        <section className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <span className="key-chip text-sm">{code}</span>
            <span className="hint">這個 KEY 在所有表格代表同一件事</span>
          </div>

          <div>
            <label className="label mb-1">清單名稱</label>
            <input className="field" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="label mb-1">說明</label>
            <input
              className="field"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="選填"
            />
          </div>
        </section>

        {isSubsetMode ? (
          <section className="card space-y-3 p-6">
            <h2 className="font-semibold">從完整清單挑選</h2>
            {!master ? (
              <p className="text-sm text-red-600">找不到對應的完整清單</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setSelectedValues(master.items.map(i => i.value))}
                  >
                    全選
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => setSelectedValues([])}>
                    全部取消
                  </button>
                </div>
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {master.items.map(item => (
                    <label
                      key={item.value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="rounded text-unicorn-600 focus:ring-unicorn-500"
                        checked={selectedValues.includes(item.value)}
                        onChange={e =>
                          setSelectedValues(prev =>
                            e.target.checked
                              ? [...prev, item.value]
                              : prev.filter(v => v !== item.value)
                          )
                        }
                      />
                      <span className="text-sm">{item.label}</span>
                      <span className="hint ml-auto font-mono">{item.value}</span>
                    </label>
                  ))}
                </div>
                <p className="hint">已選 {selectedValues.length} / {master.items.length}</p>
              </>
            )}
          </section>
        ) : (
          <>
            <section className="card space-y-3 p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">選項</h2>
                <span className="hint">{items.length} 項</span>
              </div>

              {items.length > 0 && (
                <div className="space-y-2">
                  <div className="hidden gap-2 px-1 text-xs text-slate-400 sm:grid sm:grid-cols-[1fr_1fr_auto_auto]">
                    <span>值 value（存進資料池）</span>
                    <span>顯示名稱 label</span>
                    <span>狀態</span>
                    <span />
                  </div>
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
                    >
                      <input
                        className="field font-mono disabled:bg-slate-50 disabled:text-slate-500"
                        value={item.value}
                        disabled={!item.isNew}
                        onChange={e => updateItem(index, { value: e.target.value })}
                        placeholder="粵華中學"
                      />
                      <input
                        className="field"
                        value={item.label}
                        onChange={e => updateItem(index, { label: e.target.value })}
                        placeholder="顯示名稱"
                      />
                      <select
                        className="field sm:w-28"
                        value={item.status}
                        onChange={e =>
                          updateItem(index, { status: e.target.value as 'active' | 'deprecated' })
                        }
                      >
                        <option value="active">啟用</option>
                        <option value="deprecated">停用</option>
                      </select>
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        onClick={() => removeItem(index)}
                        title={item.isNew ? '移除' : '刪除（歷史資料仍保留這個值）'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm
                  text-slate-500 transition-colors hover:border-unicorn-400 hover:bg-unicorn-50"
                onClick={addItem}
              >
                <Plus className="mr-1 inline h-4 w-4" />
                新增選項
              </button>
            </section>

            <section className="card space-y-3 p-6">
              <h2 className="font-semibold">批次貼上</h2>
              <p className="hint">一行一個，可以寫「值」或「值,顯示名稱」。重複的值會自動略過。</p>
              <textarea
                className="field font-mono"
                rows={5}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={'粵華中學\n培正中學,培正'}
              />
              <div className="flex justify-end">
                <button className="btn-secondary" onClick={applyBulk} disabled={!bulkText.trim()}>
                  加入清單
                </button>
              </div>
            </section>
          </>
        )}

        {problems.length > 0 && (
          <ul className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            {problems.map(problem => (
              <li key={problem}>· {problem}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pb-6">
          <Link href="/options" className="btn-secondary">
            取消
          </Link>
          <button className="btn-primary" onClick={handleSave} disabled={saving || problems.length > 0}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function OptionSetEditPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OptionSetEditor />
    </Suspense>
  )
}
