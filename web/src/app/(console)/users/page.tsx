'use client'

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/components/auth'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import { getUserRole, updateUserGroups, listOptionSets } from '@/lib/db'
import { MANAGER_GROUP_CODE } from '@/lib/keys'
import type { OptionSet, UserRole } from '@/types'

export default function UsersPage() {
  const { email, isSuperuser } = useAuth()
  
  const [optionSets, setOptionSets] = useState<OptionSet[]>([])
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  
  const [editingEmail, setEditingEmail] = useState('')
  const [editingGroups, setEditingGroups] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [sets, rolesSnap] = await Promise.all([
        listOptionSets(),
        getDocs(collection(db, 'userRoles'))
      ])
      setOptionSets(sets)
      setRoles(rolesSnap.docs.map(d => ({ email: d.id, ...d.data() } as UserRole)))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSuperuser) load()
  }, [isSuperuser])

  const managerGroupItems = useMemo(() => {
    const master = optionSets.find(os => os.code === MANAGER_GROUP_CODE && os.isMaster)
    return master?.items || []
  }, [optionSets])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmail.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateUserGroups(editingEmail.trim(), editingGroups, email)
      setEditingEmail('')
      setEditingGroups([])
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
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

  if (!isSuperuser) return null

  return (
    <>
      <PageHeader
        title="權限管理"
        description="設定各群組的管理員，讓他們能看到所屬群組的表單資料。"
      />

      {error && <ErrorBanner message={error} />}

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
            <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
              尚未建立 <code className="font-mono">{MANAGER_GROUP_CODE}</code> 選項池。請先到「選項池」建立並新增群組名稱。
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
