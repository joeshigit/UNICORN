'use client'

import type { FillAccessType, OptionItem } from '@/types'

interface FormSettingsDrawerProps {
  open: boolean
  onClose: () => void
  moduleId: string
  actionId: string
  enabled: boolean
  fillAccessType: FillAccessType
  fillGroups: string[]
  managerGroups: string[]
  moduleItems: OptionItem[]
  actionItems: OptionItem[]
  managerGroupItems: OptionItem[]
  onModuleId: (v: string) => void
  onActionId: (v: string) => void
  onEnabled: (v: boolean) => void
  onFillAccessType: (v: FillAccessType) => void
  onFillGroups: (v: string[]) => void
  onManagerGroups: (v: string[]) => void
}

export function FormSettingsDrawer({
  open,
  onClose,
  moduleId,
  actionId,
  enabled,
  fillAccessType,
  fillGroups,
  managerGroups,
  moduleItems,
  actionItems,
  managerGroupItems,
  onModuleId,
  onActionId,
  onEnabled,
  onFillAccessType,
  onFillGroups,
  onManagerGroups,
}: FormSettingsDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30"
        aria-label="關閉設定"
        onClick={onClose}
      />
      <aside className="relative z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">表單設定</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">基本／系統設定</h3>
            <div>
              <label className="label mb-1">分類 module</label>
              <select className="field" value={moduleId} onChange={e => onModuleId(e.target.value)}>
                <option value="">請選擇…</option>
                {moduleItems.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label mb-1">動作 action</label>
              <select className="field" value={actionId} onChange={e => onActionId(e.target.value)}>
                <option value="">請選擇…</option>
                {actionItems.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded text-unicorn-600 focus:ring-unicorn-500"
                checked={enabled}
                onChange={e => onEnabled(e.target.checked)}
              />
              啟用（出現在填報中心）
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">權限</h3>
            <div>
              <label className="label mb-2">誰可以填這張表？</label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="fillAccessType"
                    className="text-unicorn-600 focus:ring-unicorn-500"
                    checked={fillAccessType === 'allOrgUsers'}
                    onChange={() => onFillAccessType('allOrgUsers')}
                  />
                  所有 @dbyv.org 使用者
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="fillAccessType"
                    className="text-unicorn-600 focus:ring-unicorn-500"
                    checked={fillAccessType === 'groups'}
                    onChange={() => onFillAccessType('groups')}
                  />
                  僅指定群組
                </label>
              </div>
              {fillAccessType === 'groups' && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {managerGroupItems.length === 0 ? (
                    <p className="text-sm text-amber-700">請先到「權限」建立管理群組。</p>
                  ) : (
                    managerGroupItems.map(item => (
                      <label key={`fill-${item.value}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="rounded text-unicorn-600 focus:ring-unicorn-500"
                          checked={fillGroups.includes(item.value)}
                          onChange={e =>
                            onFillGroups(
                              e.target.checked
                                ? [...fillGroups, item.value]
                                : fillGroups.filter(v => v !== item.value)
                            )
                          }
                        />
                        {item.label}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="label mb-2">哪些管理群組可以看這張表的資料？</label>
              {managerGroupItems.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  尚未建立管理群組。
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {managerGroupItems.map(item => (
                    <label key={item.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded text-unicorn-600 focus:ring-unicorn-500"
                        checked={managerGroups.includes(item.value)}
                        onChange={e =>
                          onManagerGroups(
                            e.target.checked
                              ? [...managerGroups, item.value]
                              : managerGroups.filter(v => v !== item.value)
                          )
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
