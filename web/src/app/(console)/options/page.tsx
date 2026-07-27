'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Layers, PenSquare, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import { createOptionSet, deleteOptionSet, ensureCoreOptionSets, listOptionSets } from '@/lib/db'
import { RESERVED_CODES, validateOptionSetCode } from '@/lib/keys'
import type { OptionSet } from '@/types'

export default function OptionsPage() {
  const { email } = useAuth()
  const [sets, setSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      await ensureCoreOptionSets(email)
      setSets(await listOptionSets())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (email) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  const groups = useMemo(() => {
    const byCode = new Map<string, OptionSet[]>()
    for (const set of sets) byCode.set(set.code, [...(byCode.get(set.code) || []), set])
    return Array.from(byCode.entries())
      .map(([code, list]) => ({
        code,
        master: list.find(s => s.isMaster) || null,
        subsets: list.filter(s => !s.isMaster),
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [sets])

  const codeError = newCode ? validateOptionSetCode(newCode) : null
  const codeTaken = sets.some(s => s.code === newCode)

  const handleCreate = async () => {
    if (codeError || codeTaken || !newName.trim()) return
    setSaving(true)
    try {
      const id = await createOptionSet(
        { code: newCode.trim(), name: newName.trim(), isMaster: true, items: [] },
        email
      )
      window.location.href = `/options/edit?id=${id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗')
      setSaving(false)
    }
  }

  const handleDelete = async (set: OptionSet) => {
    if (RESERVED_CODES.includes(set.code) && set.isMaster) {
      alert('module / action 是系統用的分類，不能刪除。')
      return
    }
    if (!confirm(`確定刪除「${set.name}」？已提交的資料不受影響。`)) return
    await deleteOptionSet(set.id!)
    load()
  }

  return (
    <>
      <PageHeader
        title="選項池"
        description="一個選項池 = 一個 KEY + 一份標準值清單。所有表格共用，資料才能跨表比較。"
        actions={
          <button className="btn-primary" onClick={() => setCreating(v => !v)}>
            <Plus className="h-4 w-4" />
            新增 KEY
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card mb-5 space-y-4 p-6">
          <h2 className="font-semibold">新增一個 KEY</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-1">KEY（英文，跨表格統一）</label>
              <input
                className={`field font-mono ${codeError || codeTaken ? 'field-error' : ''}`}
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                placeholder="school"
              />
              {codeError && <p className="mt-1 text-sm text-red-600">{codeError}</p>}
              {!codeError && codeTaken && (
                <p className="mt-1 text-sm text-red-600">這個 KEY 已經存在了</p>
              )}
            </div>
            <div>
              <label className="label mb-1">清單名稱（給自己看）</label>
              <input
                className="field"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="所有學校"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setCreating(false)}>
              取消
            </button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={saving || !!codeError || codeTaken || !newCode || !newName.trim()}
            >
              {saving ? '建立中…' : '建立並編輯選項'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner label="載入中" />
      ) : groups.length === 0 ? (
        <EmptyState title="還沒有任何選項池" />
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.code} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="key-chip text-sm">{group.code}</span>
                  <p className="mt-1 text-sm text-slate-500">
                    {group.master?.name || '（沒有完整清單）'}
                    {group.master && ` · ${group.master.items.length} 個選項`}
                    {RESERVED_CODES.includes(group.code) && ' · 系統保留'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {group.master && (
                    <>
                      <Link
                        href={`/options/edit?id=${group.master.id}`}
                        className="btn-secondary btn-sm"
                      >
                        <PenSquare className="h-3.5 w-3.5" />
                        編輯選項
                      </Link>
                      {!RESERVED_CODES.includes(group.code) && (
                        <Link
                          href={`/options/edit?subsetOf=${group.master.id}`}
                          className="btn-ghost btn-sm"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          建立子集
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>

              {group.subsets.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  {group.subsets.map(subset => (
                    <li key={subset.id} className="flex items-center gap-3 text-sm">
                      <Layers className="h-3.5 w-3.5 text-slate-400" />
                      <span className="flex-1 truncate">{subset.name}</span>
                      <span className="hint">{subset.items.length} 項</span>
                      <Link href={`/options/edit?id=${subset.id}`} className="btn-ghost btn-sm">
                        編輯
                      </Link>
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        onClick={() => handleDelete(subset)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
