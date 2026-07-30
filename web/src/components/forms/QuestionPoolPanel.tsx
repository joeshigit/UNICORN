'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  POOL_GROUP_ORDER,
  type PoolGroupId,
  type QuestionPoolItem,
} from '@/lib/formBuilder'

interface QuestionPoolPanelProps {
  items: QuestionPoolItem[]
  usedKeys: Set<string>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (item: QuestionPoolItem) => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const DEFAULT_EXPANDED: PoolGroupId[] = ['frequent']

export function QuestionPoolPanel({
  items,
  usedKeys,
  selectedId,
  onSelect,
  onAdd,
  mobileOpen,
  onMobileClose,
}: QuestionPoolPanelProps) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<PoolGroupId>>(() => new Set(DEFAULT_EXPANDED))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.defaultKey.toLowerCase().includes(q) ||
        item.formatLabel.includes(q)
    )
  }, [items, query])

  const searching = query.trim().length > 0

  const groupsWithRows = useMemo(
    () =>
      POOL_GROUP_ORDER.map(group => ({
        ...group,
        rows: filtered.filter(i => i.groupId === group.id),
      })).filter(g => g.rows.length > 0),
    [filtered]
  )

  useEffect(() => {
    if (!searching) return
    setExpanded(new Set(groupsWithRows.map(g => g.id)))
  }, [searching, groupsWithRows])

  const selected = items.find(i => i.id === selectedId) || null
  const defaultKeyUsed = selected ? usedKeys.has(selected.defaultKey) : false

  const toggleGroup = (id: PoolGroupId) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-3 py-3">
        <h2 className="text-sm font-semibold text-slate-800">UNICORN 題庫</h2>
        <p className="mt-0.5 text-xs text-slate-400">可重用問題模板</p>
        <input
          className="field mt-2 text-sm"
          placeholder="搜尋題目…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {selected && (
        <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-3">
          <button
            type="button"
            className="btn-primary btn-sm w-full"
            onClick={() => {
              onAdd(selected)
              onMobileClose?.()
            }}
          >
            ＋ 加入表格
          </button>
          <p className="mt-2 truncate text-sm font-medium text-slate-800">{selected.label}</p>
          <p className="truncate font-mono text-[11px] text-slate-500">
            {selected.defaultKey} · {selected.formatLabel}
          </p>
          {defaultKeyUsed && (
            <p className="mt-1.5 text-[11px] leading-snug text-amber-800">
              ⚠ 預設 KEY「{selected.defaultKey}」已使用，加入後需指定新 KEY
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {groupsWithRows.map(group => {
          const open = expanded.has(group.id)
          return (
            <div key={group.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
                aria-expanded={open}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                    open ? '' : '-rotate-90'
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{group.rows.length}</span>
              </button>
              {open && (
                <ul className="space-y-0.5 pb-2 pl-1">
                  {group.rows.map(item => {
                    const selectedRow = item.id === selectedId
                    const keyUsed = usedKeys.has(item.defaultKey)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(selectedRow ? null : item.id)}
                          className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                            selectedRow
                              ? 'bg-unicorn-50 ring-1 ring-unicorn-200'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {selectedRow ? '✓ ' : ''}
                            {item.label}
                          </span>
                          {keyUsed && (
                            <span className="mt-0.5 block truncate text-[10px] text-amber-700">
                              ⚠ 預設 KEY 已使用
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden h-full min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-50/80 lg:flex xl:w-64">
        {body}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            aria-label="關閉題庫"
            onClick={onMobileClose}
          />
          <aside className="relative z-40 flex h-full w-[min(100%,20rem)] min-h-0 flex-col overflow-hidden bg-white shadow-xl">
            <div className="flex shrink-0 justify-end border-b border-slate-100 px-2 py-2">
              <button type="button" className="btn-ghost btn-sm" onClick={onMobileClose}>
                關閉
              </button>
            </div>
            {body}
          </aside>
        </div>
      )}
    </>
  )
}
