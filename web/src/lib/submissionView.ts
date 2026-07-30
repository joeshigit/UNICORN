// ============================================
// 資料池畫面層：browse 預設、作廢遮罩、精修
// （不打 Firestore；純函式，供 UI 與測試共用語意）
// ============================================

import type { Submission } from '@/types'

export type ManagerBrowseScope = 'visible' | 'mine'

export interface BrowseDefaults {
  days: number
  pageSize: number
}

/** Submitter：近 30 天 × 50 */
export const BROWSE_SUBMITTER: BrowseDefaults = { days: 30, pageSize: 50 }
/** Manager 可見範圍：近 14 天 × 100 */
export const BROWSE_MANAGER_VISIBLE: BrowseDefaults = { days: 14, pageSize: 100 }
/** Manager 只看我填的：近 30 天 × 50 */
export const BROWSE_MANAGER_MINE: BrowseDefaults = { days: 30, pageSize: 50 }
/** Superuser：近 14 天 × 100 */
export const BROWSE_SUPERUSER: BrowseDefaults = { days: 14, pageSize: 100 }

export function resolveBrowseDefaults(opts: {
  isSuperuser: boolean
  /** 非 Superuser 時：是否以 Manager 可見範圍瀏覽；false = 只看自己 */
  managerVisible: boolean
}): BrowseDefaults {
  if (opts.isSuperuser) return { ...BROWSE_SUPERUSER }
  if (opts.managerVisible) return { ...BROWSE_MANAGER_VISIBLE }
  return { ...BROWSE_SUBMITTER }
}

/** 依角色／scope 決定預設；Manager 切「只看我的」走 MINE 常數。 */
export function resolveBrowseDefaultsForScope(opts: {
  isSuperuser: boolean
  isManager: boolean
  managerScope: ManagerBrowseScope
}): BrowseDefaults {
  if (opts.isSuperuser) return { ...BROWSE_SUPERUSER }
  if (opts.isManager && opts.managerScope === 'visible') return { ...BROWSE_MANAGER_VISIBLE }
  if (opts.isManager && opts.managerScope === 'mine') return { ...BROWSE_MANAGER_MINE }
  return { ...BROWSE_SUBMITTER }
}

/** 近 N 天的 cutoff（毫秒時刻）。用絕對時間差，與 _submittedAt Timestamp 比較。 */
export function browseCutoffDate(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

/** 作廢遮罩：預設隱藏 VOID；不修改傳入陣列。 */
export function maskVoid<T extends { _status?: string }>(rows: T[], showVoid: boolean): T[] {
  if (showVoid) return rows.slice()
  return rows.filter(r => r._status !== 'VOID')
}

export type RefineOp = 'eq' | 'neq' | 'hasValue' | 'blank'

export interface RefineCondition {
  key: string
  op: RefineOp
  /** eq / neq 時使用 */
  value?: string
}

function isBlankValue(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true
  if (Array.isArray(raw)) return raw.length === 0
  if (typeof raw === 'number') return false // 0 是有值
  return String(raw).trim() === ''
}

function matchesFieldValue(raw: unknown, wanted: string): boolean {
  if (Array.isArray(raw)) return raw.some(v => String(v) === wanted)
  if (raw === undefined || raw === null) return false
  return String(raw) === wanted
}

function matchesCondition(row: Submission, c: RefineCondition): boolean {
  if (!c.key) return true
  const raw = row[c.key]
  switch (c.op) {
    case 'eq':
      return c.value !== undefined && c.value !== '' && matchesFieldValue(raw, c.value)
    case 'neq':
      if (c.value === undefined || c.value === '') return true
      return !matchesFieldValue(raw, c.value)
    case 'hasValue':
      return !isBlankValue(raw)
    case 'blank':
      return isBlankValue(raw)
    default:
      return true
  }
}

/** 精修：AND 所有條件；不修改傳入陣列。 */
export function applyRefineFilters(rows: Submission[], conditions: RefineCondition[]): Submission[] {
  const active = conditions.filter(c => {
    if (!c.key) return false
    if (c.op === 'eq' || c.op === 'neq') return c.value !== undefined && c.value !== ''
    return true
  })
  if (active.length === 0) return rows.slice()
  return rows.filter(row => active.every(c => matchesCondition(row, c)))
}

export interface BrowseMergeDoc {
  id: string
  _submittedAt?: unknown
}

/**
 * 多腿查詢結果去重後依 _submittedAt desc 排序，再取前 pageSize。
 * 合併後的「全域最新」是近似值（各腿各取一批再合）。
 */
export function mergeBrowsePages<T extends BrowseMergeDoc>(
  pages: T[][],
  pageSize: number,
  submittedAtMs: (row: T) => number
): T[] {
  const merged = new Map<string, T>()
  for (const page of pages) {
    for (const doc of page) merged.set(doc.id, doc)
  }
  return Array.from(merged.values())
    .sort((a, b) => submittedAtMs(b) - submittedAtMs(a))
    .slice(0, pageSize)
}

export function countHiddenVoid(rows: Array<{ _status?: string }>): number {
  return rows.filter(r => r._status === 'VOID').length
}
