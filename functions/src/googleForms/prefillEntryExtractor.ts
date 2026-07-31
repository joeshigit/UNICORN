/**
 * Phase 1.5 — Prefill entry extraction (POC).
 *
 * Unofficial: parse public viewform HTML for FB_PUBLIC_LOAD_DATA_.
 * Exact regex/logic locked in GOOGLE-FORMS-ARCHITECTURE-DECISION.md §4.
 * Isolate all HTML parsing in this file only.
 *
 * Does NOT: ingest responses, create watches, mutate Google Forms, write submissions.
 */

export type PrefillEntryBinding = {
  itemId: string
  entryId: string // numeric string used as entry.{entryId}
  title: string
  /** FB_PUBLIC_LOAD_DATA_ question type code when present. */
  fbTypeCode: number | null
}

/** POC outcome states required by Runbook Phase 6. */
export type PrefillPocStatus =
  | 'success'
  | 'unsupported'
  | 'parse_failure'
  | 'PREFILL_UNAVAILABLE'

export type PrefillSupportLevel =
  | 'SUPPORTED'
  | 'UNSUPPORTED'
  | 'PARSE_FAILURE'

/** Architecture Decision §4.3 */
export const FB_PUBLIC_LOAD_DATA_REGEX =
  /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/

export const FB_PUBLIC_LOAD_DATA_REGEX_FALLBACK =
  /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/

/**
 * Map FB type codes (public load data) → support classification for Prefill POC.
 * File upload / grids / unknown → UNSUPPORTED (do not invent fake URLs).
 */
export function classifyFbType(fbTypeCode: number | null): PrefillSupportLevel {
  switch (fbTypeCode) {
    case 0: // short answer
    case 1: // paragraph
    case 2: // multiple choice
    case 3: // dropdown
    case 4: // checkboxes
    case 9: // date
      return 'SUPPORTED'
    case 5: // linear scale — often works as entry.X=n but not in POC required set
    case 7: // grid
    case 8: // checkbox grid
    case 10: // time — special entry suffixes; treat unsupported in POC unless proven
    case 13: // file upload (common)
      return 'UNSUPPORTED'
    default:
      return fbTypeCode == null ? 'UNSUPPORTED' : 'UNSUPPORTED'
  }
}

export function fbTypeLabel(fbTypeCode: number | null): string {
  switch (fbTypeCode) {
    case 0:
      return 'SHORT_TEXT'
    case 1:
      return 'PARAGRAPH'
    case 2:
      return 'MULTIPLE_CHOICE'
    case 3:
      return 'DROPDOWN'
    case 4:
      return 'CHECKBOX'
    case 5:
      return 'LINEAR_SCALE'
    case 7:
      return 'GRID'
    case 8:
      return 'CHECKBOX_GRID'
    case 9:
      return 'DATE'
    case 10:
      return 'TIME'
    case 13:
      return 'FILE_UPLOAD'
    default:
      return fbTypeCode == null ? 'UNKNOWN' : `FB_TYPE_${fbTypeCode}`
  }
}

/**
 * Architecture Decision §4.4 — extract entry bindings from viewform HTML.
 * Throws on missing/unparseable payload (caller maps to PREFILL_UNAVAILABLE).
 */
export function extractPrefillEntries(html: string): PrefillEntryBinding[] {
  const match =
    html.match(FB_PUBLIC_LOAD_DATA_REGEX) ??
    html.match(FB_PUBLIC_LOAD_DATA_REGEX_FALLBACK)

  if (!match?.[1]) {
    throw new Error('FB_PUBLIC_LOAD_DATA_ not found — prefill map unavailable')
  }

  let data: unknown
  try {
    data = JSON.parse(match[1]) as unknown[]
  } catch {
    throw new Error('FB_PUBLIC_LOAD_DATA_ JSON parse failed — prefill map unavailable')
  }

  const questions = (data as any)?.[1]?.[1]
  if (!Array.isArray(questions)) {
    throw new Error('FB_PUBLIC_LOAD_DATA_ questions array missing at [1][1]')
  }

  const bindings: PrefillEntryBinding[] = []

  for (const q of questions) {
    if (!Array.isArray(q) || q.length < 5) continue
    const itemId = String(q[0])
    const title = typeof q[1] === 'string' ? q[1] : ''
    const fbTypeCode = typeof q[3] === 'number' ? q[3] : null
    const details = q[4]
    if (!Array.isArray(details)) continue

    for (const detail of details) {
      if (!Array.isArray(detail) || detail[0] == null) continue
      const entryId = String(detail[0])
      if (!/^\d+$/.test(entryId)) continue
      bindings.push({ itemId, entryId, title, fbTypeCode })
    }
  }

  return bindings
}

/**
 * Architecture Decision §4.5 — join bindings onto questionMappings by itemId.
 * Only sets prefillEntryId when a reliable binding exists.
 */
export function applyPrefillBindingsToMappings<
  T extends { itemId: string; prefillEntryId?: string }
>(
  questionMappings: T[],
  bindings: PrefillEntryBinding[]
): T[] {
  return questionMappings.map((mapping) => {
    const hit = bindings.find((b) => b.itemId === mapping.itemId)
    if (!hit) return mapping
    return { ...mapping, prefillEntryId: hit.entryId }
  })
}

/**
 * Architecture Decision §4.6 — build prefill URL.
 * Callers MUST only invoke when extraction succeeded and entries are trusted.
 */
export function buildPrefillUrl(
  responderUri: string,
  entries: Array<{ entryId: string; value: string }>
): string {
  const base = responderUri.split('?')[0]
  const params = new URLSearchParams({ usp: 'pp_url' })
  for (const { entryId, value } of entries) {
    params.append(`entry.${entryId}`, value)
  }
  return `${base}?${params.toString()}`
}

/**
 * Date prefill uses entry.ID_year / _month / _day (product behavior).
 * Kept in this file so URL construction stays with the replaceable prefill service.
 */
export function buildDatePrefillParams(
  entryId: string,
  isoDate: string
): Array<{ entryId: string; value: string }> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) {
    throw new Error('DATE prefill requires YYYY-MM-DD')
  }
  const [, year, month, day] = m
  return [
    { entryId: `${entryId}_year`, value: year },
    { entryId: `${entryId}_month`, value: String(Number(month)) },
    { entryId: `${entryId}_day`, value: String(Number(day)) },
  ]
}

export async function fetchViewformHtml(responderUri: string): Promise<string> {
  const url = responderUri.split('?')[0]
  if (!/^https:\/\/docs\.google\.com\/forms\//i.test(url)) {
    throw new Error('responderUri must be a docs.google.com/forms URL')
  }
  const res = await fetch(url, {
    headers: {
      // Google may return 401 for non-browser UAs on some forms.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch viewform HTML (HTTP ${res.status})`)
  }
  return await res.text()
}

export type PrefillBindingReport = PrefillEntryBinding & {
  typeLabel: string
  support: PrefillSupportLevel
}

export type PrefillPocResult = {
  status: PrefillPocStatus
  message: string
  responderUri: string
  bindings: PrefillBindingReport[]
  supportedCount: number
  unsupportedCount: number
  /** Only set when status === 'success' and at least one sample entry was applied. */
  prefillUrl: string | null
  sampleEntriesApplied: Array<{ entryId: string; value: string; title: string }>
}

function defaultSampleForBinding(b: PrefillEntryBinding): string[] | null {
  switch (b.fbTypeCode) {
    case 0:
      return ['POC short text']
    case 1:
      return ['POC paragraph line 1\nline 2']
    case 2:
    case 3:
      // Option label must match form; caller should override. Placeholder marks need for real option.
      return null
    case 4:
      return null
    case 9:
      return ['2026-07-31']
    default:
      return null
  }
}

/**
 * Full Prefill POC: fetch → extract → classify → optionally build URL.
 * Never returns a prefillUrl on parse failure / unavailable.
 */
export async function runPrefillPoc(options: {
  responderUri: string
  /**
   * Optional sample values keyed by itemId or entryId.
   * For choice/checkbox, values must be exact option labels.
   * Multiple checkbox values: pass string[].
   */
  samples?: Record<string, string | string[]>
}): Promise<PrefillPocResult> {
  const responderUri = options.responderUri.trim()
  const empty: PrefillPocResult = {
    status: 'PREFILL_UNAVAILABLE',
    message: '',
    responderUri,
    bindings: [],
    supportedCount: 0,
    unsupportedCount: 0,
    prefillUrl: null,
    sampleEntriesApplied: [],
  }

  let html: string
  try {
    html = await fetchViewformHtml(responderUri)
  } catch (err: unknown) {
    return {
      ...empty,
      status: 'PREFILL_UNAVAILABLE',
      message: err instanceof Error ? err.message : 'Failed to fetch viewform',
      prefillUrl: null,
    }
  }

  if (/no longer accepting responses/i.test(html)) {
    return {
      ...empty,
      status: 'PREFILL_UNAVAILABLE',
      message:
        'Form is closed (no longer accepting responses). FB_PUBLIC_LOAD_DATA_ may be absent. Use an open dedicated POC form.',
      prefillUrl: null,
    }
  }

  let bindings: PrefillEntryBinding[]
  try {
    bindings = extractPrefillEntries(html)
  } catch (err: unknown) {
    return {
      ...empty,
      status: 'parse_failure',
      message: err instanceof Error ? err.message : 'parse failure',
      prefillUrl: null,
    }
  }

  if (bindings.length === 0) {
    return {
      ...empty,
      status: 'PREFILL_UNAVAILABLE',
      message: 'No numeric entry bindings found in FB_PUBLIC_LOAD_DATA_',
      prefillUrl: null,
    }
  }

  const reports: PrefillBindingReport[] = bindings.map((b) => ({
    ...b,
    typeLabel: fbTypeLabel(b.fbTypeCode),
    support: classifyFbType(b.fbTypeCode),
  }))

  const supportedCount = reports.filter((r) => r.support === 'SUPPORTED').length
  const unsupportedCount = reports.filter((r) => r.support === 'UNSUPPORTED').length

  const sampleEntries: Array<{ entryId: string; value: string; title: string }> = []
  const urlEntries: Array<{ entryId: string; value: string }> = []

  for (const r of reports) {
    if (r.support !== 'SUPPORTED') continue

    const sampleRaw =
      options.samples?.[r.itemId] ??
      options.samples?.[r.entryId] ??
      defaultSampleForBinding(r)

    if (sampleRaw == null) continue

    const values = Array.isArray(sampleRaw) ? sampleRaw : [sampleRaw]

    if (r.fbTypeCode === 9) {
      try {
        const dateParams = buildDatePrefillParams(r.entryId, values[0])
        for (const p of dateParams) {
          urlEntries.push(p)
          sampleEntries.push({ entryId: p.entryId, value: p.value, title: r.title })
        }
      } catch {
        // skip invalid date sample; do not invent
      }
      continue
    }

    for (const value of values) {
      urlEntries.push({ entryId: r.entryId, value })
      sampleEntries.push({ entryId: r.entryId, value, title: r.title })
    }
  }

  if (supportedCount === 0) {
    return {
      status: 'unsupported',
      message: 'Form has extractable entries but no POC-supported question types',
      responderUri,
      bindings: reports,
      supportedCount,
      unsupportedCount,
      prefillUrl: null,
      sampleEntriesApplied: [],
    }
  }

  if (urlEntries.length === 0) {
    return {
      status: 'success',
      message:
        'Extraction succeeded for supported types, but no sample values were available to build a prefill URL (provide samples for choice/checkbox option labels).',
      responderUri,
      bindings: reports,
      supportedCount,
      unsupportedCount,
      prefillUrl: null,
      sampleEntriesApplied: [],
    }
  }

  return {
    status: 'success',
    message: 'Prefill map extracted; URL built from trusted entry bindings only',
    responderUri,
    bindings: reports,
    supportedCount,
    unsupportedCount,
    prefillUrl: buildPrefillUrl(responderUri, urlEntries),
    sampleEntriesApplied: sampleEntries,
  }
}
