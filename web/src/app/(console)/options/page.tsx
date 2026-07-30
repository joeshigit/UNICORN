'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Layers, PenSquare, Plus, Trash2 } from 'lucide-react'
import { SuperuserGuard, useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import {
  createOptionSet,
  deleteOptionSet,
  ensureCoreOptionSets,
  listOptionSets,
  listTemplates,
} from '@/lib/db'
import {
  ACTION_CODE,
  MANAGER_GROUP_CODE,
  MODULE_CODE,
  RESERVED_CODES,
  validateOptionSetCode,
} from '@/lib/keys'
import type { OptionSet } from '@/types'

const DELETE_CONFIRM_PASSWORD = '0816'

function isReservedCode(code: string): boolean {
  return (RESERVED_CODES as readonly string[]).includes(code)
}

function optionSetTitle(name: string, code: string): ReactNode {
  const codeLabel = isReservedCode(code) ? code.toUpperCase() : code
  return (
    <>
      <span className="font-medium text-slate-800">{name}</span>{' '}
      <span className="font-normal text-slate-400">({codeLabel})</span>
    </>
  )
}

function OptionsPageInner() {
  const { email } = useAuth()
  const router = useRouter()
  const [sets, setSets] = useState<OptionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
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
      router.push(`/options/edit?id=${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗')
      setSaving(false)
    }
  }

  const confirmDeleteWithPassword = (setName: string): boolean => {
    const entered = prompt(
      `確定要刪除「${setName}」？\n\n已提交的資料不受影響，但刪除後新表單無法再選這份清單。\n\n請輸入密碼 ${DELETE_CONFIRM_PASSWORD} 以確認刪除：`
    )
    if (entered === null) return false
    if (entered !== DELETE_CONFIRM_PASSWORD) {
      alert('密碼錯誤，已取消刪除。')
      return false
    }
    return true
  }

  const handleDelete = async (set: OptionSet, subsetCount = 0) => {
    if (isReservedCode(set.code) && set.isMaster) {
      alert('module / action / 管理群組 是系統內建，不能刪除。')
      return
    }
    if (subsetCount > 0) {
      alert(`「${set.name}」底下還有 ${subsetCount} 個子集，先把子集刪掉。`)
      return
    }
    try {
      const templates = await listTemplates()
      const inUse = templates.filter(t => t.fields.some(f => f.optionSetId === set.id))
      if (inUse.length > 0) {
        alert(`「${set.name}」還被這些表格用著，先改掉表格再刪：\n${inUse.map(t => t.name).join('\n')}`)
        return
      }
      if (!confirmDeleteWithPassword(set.name)) return
      await deleteOptionSet(set.id!)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  return (
    <>
      <PageHeader
        title="標準選項"
        description="一份清單對應一種選項（例如學校、部門）。所有表格共用同一份清單，填進去的值才會一致、方便跨表比較。"
        actions={
          <button className="btn-primary" onClick={() => setCreating(v => !v)}>
            <Plus className="h-4 w-4" />
            新增標準選項
          </button>
        }
      />

      <p className="mb-4 text-sm">
        <button
          type="button"
          className="font-medium text-brand-700 underline decoration-brand-700/30 underline-offset-2 hover:decoration-brand-700"
          onClick={() => setShowGuide(v => !v)}
        >
          {showGuide ? '收起使用須知' : '使用須知（請先點開閱讀）'}
        </button>
      </p>

      {showGuide && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <p className="font-medium">給 Superuser 的提醒</p>
            <ul className="list-disc space-y-1 pl-4 text-amber-950/90">
              <li>
                <strong>不要</strong>為同一意思再建第二份清單（例如已有 school 又建 school2）；應先查是否已有「標準問題」或現有清單可重用。
              </li>
              <li>
                <strong>不要</strong>修改選項的「值 value」——那是已提交資料的標準碼；要改稱呼請只改顯示名稱。
              </li>
              <li>
                <strong>不要</strong>刪除仍被表單使用的清單；刪除前系統會檢查，且必須手動輸入密碼 {DELETE_CONFIRM_PASSWORD}。
              </li>
              <li>
                <strong>{MODULE_CODE}</strong>、<strong>{ACTION_CODE}</strong>、管理群組（{MANAGER_GROUP_CODE}）是系統內建代號，<strong>不能刪除或改代號</strong>，但選項內容仍可編輯。
              </li>
              <li>
                <strong>應</strong>用 Master 完整清單登錄全部標準值；子集只從 Master 挑選，填報結果才會一致。
              </li>
            </ul>
          </div>
        </div>
      )}

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
        <EmptyState title="還沒有任何標準選項" />
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const reserved = isReservedCode(group.code)
            const masterName = group.master?.name || '（沒有完整清單）'
            return (
            <div key={group.code} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {reserved && (
                    <p className="mb-1 font-mono text-xs uppercase tracking-wide text-slate-400">
                      {group.code}
                    </p>
                  )}
                  <p className="text-sm">
                    {group.master ? optionSetTitle(masterName, group.code) : masterName}
                  </p>
                  {reserved && (
                    <p className="mt-1 text-xs text-slate-400">
                      系統內建代號請勿刪除或改名；選項內容仍可編輯
                    </p>
                  )}
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
                      {!reserved && (
                        <>
                          <Link
                            href={`/options/edit?subsetOf=${group.master.id}`}
                            className="btn-ghost btn-sm"
                          >
                            <Layers className="h-3.5 w-3.5" />
                            建立子集
                          </Link>
                          <button
                            className="btn-ghost btn-sm text-red-500"
                            onClick={() => handleDelete(group.master!, group.subsets.length)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
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
            )
          })}
        </div>
      )}
    </>
  )
}


export default function OptionsPage() {
  return (
    <SuperuserGuard>
      <OptionsPageInner />
    </SuperuserGuard>
  )
}
