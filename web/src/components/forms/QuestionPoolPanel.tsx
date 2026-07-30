'use client'

import { useMemo, useState } from 'react'
import {
  POOL_GROUP_ORDER,
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

  const selected = items.find(i => i.id === selectedId) || null
  const defaultKeyUsed = selected ? usedKeys.has(selected.defaultKey) : false

  const body = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-3 py-3">
        <h2 className="text-sm font-semibold text-slate-800">UNICORN 題庫</h2>
        <p className="mt-0.5 text-xs text-slate-400">可重用問題模板</p>
        <input
          className="field mt-2 text-sm"
          placeholder="搜尋題目…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {POOL_GROUP_ORDER.map(group => {
          const rows = filtered.filter(i => i.groupId === group.id)
          if (rows.length === 0) return null
          return (
            <div key={group.id} className="mb-3">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {rows.map(item => {
                  const selectedRow = item.id === selectedId
                  const keyUsed = usedKeys.has(item.defaultKey)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(selectedRow ? null : item.id)}
                        className={`w-full rounded-lg px-2 py-2 text-left transition-colors ${
                          selectedRow
                            ? 'bg-unicorn-50 ring-1 ring-unicorn-200'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="block text-sm font-medium text-slate-800">
                          {selectedRow ? '✓ ' : ''}
                          {item.label}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-500">
                          {item.defaultKey} · {item.formatLabel}
                        </span>
                        {keyUsed && (
                          <span className="mt-0.5 block text-[11px] text-amber-700">
                            ⚠ 預設 KEY 已使用
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="border-t border-slate-100 px-3 py-3">
          <p className="text-sm font-medium text-slate-800">{selected.label}</p>
          <p className="font-mono text-xs text-slate-500">
            {selected.defaultKey} · {selected.formatLabel}
          </p>
          {defaultKeyUsed && (
            <p className="mt-2 text-xs text-amber-800">
              ⚠ 預設 KEY「{selected.defaultKey}」已在此表格使用。仍可加入，但此題需要新的 KEY。
            </p>
          )}
          <button
            type="button"
            className="btn-primary btn-sm mt-3 w-full"
            onClick={() => {
              onAdd(selected)
              onMobileClose?.()
            }}
          >
            ＋ 加入表格
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 lg:flex xl:w-64">
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
          <aside className="relative z-40 flex h-full w-[min(100%,20rem)] flex-col bg-white shadow-xl">
            <div className="flex justify-end border-b border-slate-100 px-2 py-2">
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
