'use client'

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Plus, Trash2 } from 'lucide-react'
import { SuperuserGuard, useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import {
  ensureCoreOptionSets,
  listOptionSets,
  updateOptionSet,
  updateUserGroups,
} from '@/lib/db'
import { MANAGER_GROUP_CODE } from '@/lib/keys'
import type { OptionSet, UserRole } from '@/types'

type GroupDraft = { value: string; label: string; isNew: boolean }

function UsersPageInner() {
  const { email } = useAuth()

  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [groupsSaving, setGroupsSaving] = useState(false)

  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [groupsDirty, setGroupsDirty] = useState(false)

  const [editingEmail, setEditingEmail] = useState('')
  const [editingGroups, setEditingGroups] = useState<string[]>([])

  const managerMaster = useMemo(
    () => optionSets.find(os => os.code === MANAGER_GROUP_CODE && os.isMaster),
    [optionSets]
  )

  const managerGroupItems = useMemo(() => managerMaster?.items || [], [managerMaster])

  const syncGroupDrafts = (master: OptionSet | undefined) => {
    setGroupDrafts(
      (master?.items || []).map(item => ({
        value: item.value,
        label: item.label,
        isNew: false,
      }))
    )
    setGroupsDirty(false)
  }

  const load = async () => {
    setLoading(true)
    try {
      await ensureCoreOptionSets(email)
      const [sets, rolesSnap] = await Promise.all([
        listOptionSets(),
        getDocs(collection(db, 'userRoles')),
      ])
      setOptionSets(sets)
      syncGroupDrafts(sets.find(os => os.code === MANAGER_GROUP_CODE && os.isMaster))
      setRoles(rolesSnap.docs.map(d => ({ email: d.id, ...d.data() } as UserRole)))
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

  const handleAddGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    if (groupDrafts.some(g => g.value === name)) {
      setError('這個群組名稱已經存在')
      return
    }
    setGroupDrafts(prev => [...prev, { value: name, label: name, isNew: true }])
    setNewGroupName('')
    setGroupsDirty(true)
    setError('')
  }

  const handleRemoveGroup = (index: number) => {
    const item = groupDrafts[index]
    if (!item.isNew) {
      if (
        !confirm(
          `確定移除「${item.label}」？\n\n若仍被表單或使用者引用，相關設定可能失效。`
        )
      ) {
        return
      }
    }
    setGroupDrafts(prev => prev.filter((_, i) => i !== index))
    setGroupsDirty(true)
  }

  const handleSaveGroups = async () => {
    if (!managerMaster?.id) return
    const trimmed = groupDrafts.map(g => ({
      value: g.value.trim(),
      label: g.label.trim() || g.value.trim(),
    }))
    if (trimmed.some(g => !g.label)) {
      setError('群組名稱不能空白')
      return
    }
    const values = trimmed.map(g => g.value)
    if (new Set(values).size !== values.length) {
      setError('群組名稱不能重複')
      return
    }
    setGroupsSaving(true)
    setError('')
    try {
      await updateOptionSet(managerMaster.id, {
        name: managerMaster.name,
        description: managerMaster.description || '',
        items: trimmed.map(g => ({ value: g.value, label: g.label, status: 'active' as const })),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存群組失敗')
    } finally {
      setGroupsSaving(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmail.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateUserGroups(editingEmail.trim(), editingGroups, email)
      setEditingEmail('')
      setEditingGroups([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (role: UserRole) => {
    setEditingEmail(role.email)
    setEditingGroups(role.groups)
  }

  const handleCancel = () => {
    setEditingEmail('')
    setEditingGroups([])
    setError('')
  }

  return (
    <>
      <PageHeader
        title="權限管理"
        description="設定各群組的管理員，讓他們能看到所屬群組的表單資料。"
      />

      {error && <ErrorBanner message={error} />}

      <section className="card mb-6 space-y-4 p-6">
        <div>
          <h2 className="font-semibold">管理群組</h2>
          <p className="hint mt-1">
            定義組織內可指派的管理／填報群組。建表時會從這份清單勾選誰能管、誰能填。
          </p>
        </div>

        {loading ? (
          <Spinner label="載入群組" />
        ) : (
          <>
            {groupDrafts.length === 0 ? (
              <p className="text-sm text-slate-500">尚未建立任何管理群組。</p>
            ) : (
              <ul className="space-y-2">
                {groupDrafts.map((group, index) => (
                  <li key={group.value} className="flex flex-wrap items-center gap-2">
                    <input
                      className="field max-w-xs flex-1"
                      value={group.label}
                      onChange={e => {
                        const label = e.target.value
                        setGroupDrafts(prev =>
                          prev.map((g, i) => (i === index ? { ...g, label } : g))
                        )
                        setGroupsDirty(true)
                      }}
                      placeholder="群組名稱"
                    />
                    {!group.isNew && (
                      <span className="font-mono text-xs text-slate-400">{group.value}</span>
                    )}
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-red-500"
                      onClick={() => handleRemoveGroup(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <div className="min-w-[12rem] flex-1">
                <label className="label mb-1">新增群組</label>
                <input
                  className="field"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="例如：SCD 主管"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddGroup()
                    }
                  }}
                />
              </div>
              <button type="button" className="btn-secondary" onClick={handleAddGroup}>
                <Plus className="h-4 w-4" />
                加入
              </button>
              {groupsDirty && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveGroups}
                  disabled={groupsSaving}
                >
                  {groupsSaving ? '儲存中…' : '儲存群組'}
                </button>
              )}
            </div>
            <p className="hint text-xs">
              已建立的群組代號（灰色小字）請勿隨意改動；要改顯示名稱請編輯左側欄位後按「儲存群組」。
            </p>
          </>
        )}
      </section>

      <form onSubmit={handleSave} className="card p-6 mb-6 space-y-4">
        <h2 className="font-semibold">{editingEmail ? '編輯使用者群組' : '新增使用者群組'}</h2>
        
        <div>
          <label className="label mb-1">使用者 Email</label>
          <input
            className="field"
            value={editingEmail}
            onChange={e => setEditingEmail(e.target.value)}
            placeholder="someone@dbyv.org"
            disabled={editingEmail !== '' && roles.some(r => r.email === editingEmail.toLowerCase())}
          />
        </div>

        <div>
          <label className="label mb-2">指派群組</label>
          {managerGroupItems.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              請先在上方「管理群組」建立至少一個群組。
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {managerGroupItems.map(item => (
                <label key={item.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    className="rounded text-unicorn-600 focus:ring-unicorn-500"
                    checked={editingGroups.includes(item.value)}
                    onChange={e =>
                      setEditingGroups(prev =>
                        e.target.checked
                          ? [...prev, item.value]
                          : prev.filter(v => v !== item.value)
                      )
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingEmail && (
            <button type="button" className="btn-secondary" onClick={handleCancel} disabled={saving}>
              取消
            </button>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !editingEmail.trim() || managerGroupItems.length === 0}
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </form>

      {loading ? (
        <Spinner label="載入中" />
      ) : roles.length === 0 ? (
        <EmptyState title="尚未設定任何管理員" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">所屬群組</th>
                <th className="px-4 py-3 font-medium">最後更新</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map(role => (
                <tr key={role.email} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{role.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {role.groups.length === 0 ? (
                        <span className="text-slate-400">無</span>
                      ) : (
                        role.groups.map(g => (
                          <span key={g} className="chip bg-unicorn-50 text-unicorn-700 font-medium">
                            {managerGroupItems.find(i => i.value === g)?.label || g}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    <div className="text-xs">
                      {/* @ts-ignore */}
                      {role.updatedAt?.toDate ? role.updatedAt.toDate().toLocaleString('zh-TW') : ''}
                    </div>
                    <div className="text-xs">by {role.updatedBy}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button className="btn-secondary btn-sm" onClick={() => handleEdit(role)}>
                      編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function UsersPage() {
  return (
    <SuperuserGuard>
      <UsersPageInner />
    </SuperuserGuard>
  )
}
