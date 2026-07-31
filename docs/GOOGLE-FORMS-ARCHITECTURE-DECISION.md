# Google Forms Architecture Decision — Phase 0 Technical Specification

**Builder execution order:** follow [`COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`](./COMPOSER-2.5-LINE-BY-LINE-BUILDER.md).  
This file remains the locked technical contract (schema / SDK / cron / prefill).

**Status:** Phase 1 gate correction — PO Option B (2026-07-31)  
**Constraint acceptance:** ACCEPTED

- Do not invent any new schema types beyond `GoogleFormConfig` and `UnicornGoogleSubmission`.
- Forms SDK contract: **existing monolithic `googleapis` only** (PO Option B). Do **not** install `@googleapis/forms`.
- No Phase 1.5+ feature code without explicit human sign-off.

**Related:** [`COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`](./COMPOSER-2.5-LINE-BY-LINE-BUILDER.md) · [`GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`](./GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md) · [`COMPOSER-2.5-GOOGLE-FORMS-EXECUTION-PLAN.md`](./COMPOSER-2.5-GOOGLE-FORMS-EXECUTION-PLAN.md) · [`UNICORN-Google-Forms-Integration-Specification-v3.md`](./UNICORN-Google-Forms-Integration-Specification-v3.md)

---

## 1. Locked schema types (no others)

### 1.1 Exact file path (to create only after Phase 1 sign-off)

```text
web/src/types/google-forms.ts
```

Also re-export from `web/src/types/index.ts` after creation:

```ts
export type { GoogleFormConfig, UnicornGoogleSubmission } from './google-forms'
```

**Forbidden after sign-off:** adding any additional exported schema interfaces/types for Google Forms integration (e.g. no `GoogleQuestionKey`, `GoogleOptionKey`, `GoogleFormWatch`, `PrefillMap` as separate schema types). Nested object shapes live **inside** the two interfaces below.

### 1.2 Exact interface contents for `web/src/types/google-forms.ts`

```ts
/**
 * UNICORN × Google Forms — locked schema contracts.
 * Only these two exported interfaces may exist in this file.
 */

/** Connected Google Form + mapping + watch + prefill contract (Meaning/Template layer). */
export interface GoogleFormConfig {
  /** Firestore doc id (recommended: same as googleFormId). */
  id: string

  /** Google Forms resource id (from forms.get). */
  googleFormId: string

  /** Public responder URL (viewform). */
  responderUri: string

  /** Linked UNICORN template id (existing templates/{id}). */
  templateId: string

  /** Operational readiness after Verify. */
  operationalStatus: 'DRAFT' | 'READY' | 'ERROR' | 'DISCONNECTED'

  /** Watch / ingest health. */
  watchHealth:
    | 'CONNECTED'
    | 'SYNCING'
    | 'WARNING'
    | 'ERROR'
    | 'DISCONNECTED'
    | 'ACCESS_ERROR'
    | 'WATCH_RENEWAL_ERROR'

  /** forms.watches.create result. */
  watch: {
    watchId: string
    topicName: string
    eventType: 'RESPONSES'
    expireTime: string
    state: 'ACTIVE' | 'SUSPENDED' | 'STATE_UNSPECIFIED'
  } | null

  /**
   * Question mapping: Google identity → UNICORN Universal KEY.
   * Identity is itemId + questionId (never order/label alone).
   */
  questionMappings: Array<{
    itemId: string
    questionId: string
    googleLabel: string
    googleQuestionType: string
    unicornKey: string
    requiredOnGoogle: boolean
    mappingStatus: 'MAPPED' | 'UNMAPPED' | 'BROKEN' | 'LABEL_DRIFT' | 'UNMANAGED'
    optionSetId?: string
    optionMappings?: Array<{
      googleOptionLabel: string
      unicornOptionValue: string
      confirmed: boolean
      confidence?: number
    }>
    /** Prefill entry id extracted from public page (not Forms REST). */
    prefillEntryId?: string
  }>

  /** Snapshot of last successful Analyze/Verify. */
  lastVerify?: {
    at: string
    ready: boolean
    mappedQuestions: number
    totalQuestions: number
    unknownOptions: number
    brokenMappings: number
  }

  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

/**
 * Immutable Google-originated submission written at ingest time.
 * Extends UNICORN submission semantics; does not replace Universal KEY flat fields.
 * Firestore doc id MUST be deterministic: `${googleFormId}_google_${googleResponseId}`
 */
export interface UnicornGoogleSubmission {
  id: string

  source: 'GOOGLE_FORM'
  googleFormId: string
  googleResponseId: string
  googleFormConfigId: string

  _templateId: string
  _templateModule: string
  _templateAction: string
  _templateVersion: number
  _submitterId: string
  _submitterEmail: string
  _submittedAt: string
  _submittedMonth: string
  _status: 'ACTIVE' | 'CANCELLED' | 'LOCKED'
  _fieldLabels: Record<string, string>
  _optionLabels?: Record<string, string>

  /** Flat Universal KEY → standardized VALUE (write-time). */
  answers: Record<string, unknown>

  /**
   * Answers that could not be mapped at ingest.
   * Never drop; preserve for Superuser repair.
   */
  rawUnmapped: Array<{
    questionId: string
    itemId?: string
    googleLabel?: string
    rawValue: unknown
    reason: 'NO_QUESTION_MAPPING' | 'NO_OPTION_MAPPING' | 'TYPE_MISMATCH' | 'OTHER'
  }>

  /** Version chain (Copy & Resubmit). */
  supersedesSubmissionId?: string
  supersededBySubmissionId?: string
  isCurrent: boolean

  /** Copy-intent token if this response came from a prefill resubmit. */
  copyFromSubmissionId?: string

  files: Array<{
    fieldKey: string
    driveFileId: string
    name: string
    mimeType: string
    size: number
    webViewLink: string
  }>

  _correctFor?: string
  _isLocked?: boolean
}
```

**Schema rule:** later phases may add Firestore fields only by extending these two interfaces in this same file — not by introducing parallel schema type names.

---

## 2. Exact `googleapis` Forms SDK usage (PO Option B — locked)

**PO decision (2026-07-31):** Keep the existing monolithic `googleapis` package already used for Drive DWD. Do **not** add a second Forms client (`@googleapis/forms`).

### 2.1 Package

```text
functions/package.json dependency:
  "googleapis": "^169.0.0"   // already present; reuse for Forms + Drive
```

Do **not** install `@googleapis/forms`. All new Forms code MUST use `google.forms({ version: 'v1', auth })` from `googleapis`.

### 2.2 Client construction (Phase 1 live pattern)

```ts
import { google, forms_v1 } from 'googleapis'

const authClient = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  // Phase 1: least privilege — read-only body only
  scopes: ['https://www.googleapis.com/auth/forms.body.readonly'],
  subject: IMPERSONATE_USER, // Domain-Wide Delegation — same pattern as Drive
})

await authClient.authorize()

const formsClient: forms_v1.Forms = google.forms({
  version: 'v1',
  auth: authClient,
})
```

Later phases may widen scopes only when that phase needs them (e.g. `forms.body` for `batchUpdate`, `forms.responses.readonly` for ingest). Phase 1 must not request write/responses scopes.

### 2.3 Exact method signatures to call

| Purpose | SDK call | Signature (TypeScript) |
|---------|----------|------------------------|
| Import form structure | `forms.get` | `formsClient.forms.get({ formId: string }): Promise<GaxiosResponse<forms_v1.Schema$Form>>` |
| Push standardization | `forms.batchUpdate` | `formsClient.forms.batchUpdate({ formId: string, requestBody: forms_v1.Schema$BatchUpdateFormRequest }): Promise<GaxiosResponse<forms_v1.Schema$BatchUpdateFormResponse>>` |
| Authoritative response | `forms.responses.get` | `formsClient.forms.responses.get({ formId: string, responseId: string }): Promise<GaxiosResponse<forms_v1.Schema$FormResponse>>` |
| List responses (recovery) | `forms.responses.list` | `formsClient.forms.responses.list({ formId: string, filter?: string, pageSize?: number, pageToken?: string }): Promise<GaxiosResponse<forms_v1.Schema$ListFormResponsesResponse>>` |
| Create watch | `forms.watches.create` | `formsClient.forms.watches.create({ formId: string, requestBody: { watch: forms_v1.Schema$Watch, watchId?: string } }): Promise<GaxiosResponse<forms_v1.Schema$Watch>>` |
| Renew watch | `forms.watches.renew` | `formsClient.forms.watches.renew({ formId: string, watchId: string }): Promise<GaxiosResponse<forms_v1.Schema$Watch>>` |
| List watches | `forms.watches.list` | `formsClient.forms.watches.list({ formId: string }): Promise<GaxiosResponse<forms_v1.Schema$ListWatchesResponse>>` |
| Delete watch | `forms.watches.delete` | `formsClient.forms.watches.delete({ formId: string, watchId: string }): Promise<GaxiosResponse<void>>` |

### 2.4 Watch create request body (exact shape)

```ts
await formsClient.forms.watches.create({
  formId,
  requestBody: {
    watch: {
      target: {
        topic: {
          topicName: 'projects/unicorn-dcs/topics/unicorn-forms-responses',
        },
      },
      eventType: 'RESPONSES',
    },
    watchId: `resp-${formId}`.slice(0, 63).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
  },
})
```

Official: watches expire **7 days** after create/renew.  
Source: https://developers.google.com/workspace/forms/api/reference/rest/v1/forms.watches/renew

### 2.5 Ingest hard rule

Pub/Sub notification **must not** be parsed as answers.

```ts
// After Pub/Sub decode → extract formId + event context
const authoritative = await formsClient.forms.responses.get({
  formId,
  responseId,
})
// Normalize from authoritative.data.answers keyed by questionId
```

---

## 3. Exact Cloud Scheduler cron — 6-day `forms.watches.renew`

### 3.1 Why 6 days

- Google watch lifetime = **7 days** from create/renew.
- Renew on a **6-day** cadence → ≥1 day safety margin before expiry.
- Job must call `formsClient.forms.watches.renew({ formId, watchId })` for every `GoogleFormConfig` with non-null `watch`.

### 3.2 Exact Scheduler job configuration

```bash
gcloud scheduler jobs create http unicorn-forms-watch-renew-6d \
  --project=unicorn-dcs \
  --location=asia-east1 \
  --schedule="0 3 */6 * *" \
  --time-zone="Asia/Hong_Kong" \
  --description="Renew Google Forms RESPONSES watches every 6 days (7-day TTL margin)" \
  --uri="https://asia-east1-unicorn-dcs.cloudfunctions.net/renewGoogleFormWatches" \
  --http-method=POST \
  --oidc-service-account-email="unicorn-scheduler@unicorn-dcs.iam.gserviceaccount.com" \
  --oidc-token-audience="https://asia-east1-unicorn-dcs.cloudfunctions.net/renewGoogleFormWatches" \
  --attempt-deadline=320s
```

| Field | Exact value |
|-------|-------------|
| Job name | `unicorn-forms-watch-renew-6d` |
| Region | `asia-east1` |
| Cron | `0 3 */6 * *` |
| Time zone | `Asia/Hong_Kong` |
| HTTP method | `POST` |
| Target | `https://asia-east1-unicorn-dcs.cloudfunctions.net/renewGoogleFormWatches` |
| Auth | OIDC to scheduler SA |

**Cron meaning:** at 03:00 Asia/Hong_Kong on every month-day matching `*/6` (1, 7, 13, 19, 25, …). This is the required 6-day Scheduler configuration for this project.

**Renew handler pseudocontract (not implemented in Phase 0):**

```ts
// renewGoogleFormWatches
for (const config of allGoogleFormConfigsWithWatch) {
  const watch = await formsClient.forms.watches.renew({
    formId: config.googleFormId,
    watchId: config.watch.watchId,
  })
  // persist watch.expireTime + watch.state onto GoogleFormConfig.watch
}
```

If renew returns `NOT_FOUND` (expired): set `watchHealth = 'WATCH_RENEWAL_ERROR'`, then `watches.create` again — do not silent-fail.

---

## 4. Exact prefill `entry.XXXXXX` extraction logic

### 4.1 Decision

- Forms REST API does **not** expose public `entry.*` prefill parameter ids.
- Prefill extraction is **unofficial**: parse public `viewform` HTML for `FB_PUBLIC_LOAD_DATA_`.
- Isolate behind **one** replaceable service:  
  `functions/src/googleForms/prefillEntryExtractor.ts`  
  (implemented in Phase 1.5 Prefill POC; later Copy & Resubmit / Answer Workspace reuse this file only).

### 4.2 Exact fetch target

```text
GET {responderUri}
# example:
# https://docs.google.com/forms/d/e/{PUBLIC_FORM_ID}/viewform
```

### 4.3 Exact regex to extract payload

```ts
const FB_PUBLIC_LOAD_DATA_REGEX =
  /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/
```

Fallback if first regex fails (no closing script on same chunk):

```ts
const FB_PUBLIC_LOAD_DATA_REGEX_FALLBACK =
  /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/
```

### 4.4 Exact parse + walk logic (TypeScript)

```ts
type PrefillEntryBinding = {
  itemId: string
  entryId: string          // numeric string used as entry.{entryId}
  title: string
}

function extractPrefillEntries(html: string): PrefillEntryBinding[] {
  const match =
    html.match(FB_PUBLIC_LOAD_DATA_REGEX) ??
    html.match(FB_PUBLIC_LOAD_DATA_REGEX_FALLBACK)

  if (!match?.[1]) {
    throw new Error('FB_PUBLIC_LOAD_DATA_ not found — prefill map unavailable')
  }

  const data = JSON.parse(match[1]) as unknown[]
  // Public load structure: questions array at data[1][1]
  const questions = (data as any)?.[1]?.[1]
  if (!Array.isArray(questions)) {
    throw new Error('FB_PUBLIC_LOAD_DATA_ questions array missing at [1][1]')
  }

  const bindings: PrefillEntryBinding[] = []

  for (const q of questions) {
    if (!Array.isArray(q) || q.length < 5) continue
    const itemId = String(q[0])
    const title = typeof q[1] === 'string' ? q[1] : ''
    const details = q[4]
    if (!Array.isArray(details)) continue

    for (const detail of details) {
      if (!Array.isArray(detail) || detail[0] == null) continue
      const entryId = String(detail[0])
      // Skip non-numeric / structural noise
      if (!/^\d+$/.test(entryId)) continue
      bindings.push({ itemId, entryId, title })
    }
  }

  return bindings
}
```

### 4.5 Exact join onto `GoogleFormConfig.questionMappings`

```ts
// After forms.get + extractPrefillEntries(viewformHtml):
for (const mapping of googleFormConfig.questionMappings) {
  const hit = bindings.find((b) => b.itemId === mapping.itemId)
  if (hit) mapping.prefillEntryId = hit.entryId
}
```

### 4.6 Exact prefill URL builder

```ts
function buildPrefillUrl(
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
```

### 4.7 Explicit limitations (must surface in Answer Workspace UI later)

- Prefill opens a **new** response initialized with values — not edit of historical `responseId`.
- File upload questions are **not** prefilled.
- If user opens prefill but does not submit → no new `UnicornGoogleSubmission`.
- This parser is **not** an official Google API; if HTML shape changes, only `prefillEntryExtractor` is replaced.

---

## 5. Identity, ingest, and storage decisions

| Topic | Decision |
|-------|----------|
| Question identity | `itemId` + `questionId` from `forms.get` / response answers |
| Response → KEY | `questionId` → find mapping by `questionId` → `unicornKey` |
| Options | Google visible label → confirmed `optionMappings` → OptionSet value |
| Submission doc id | `` `${googleFormId}_google_${googleResponseId}` `` |
| Write API | Admin SDK `set` / `create` with deterministic id — **never** `addDoc` for primary Google ingest |
| Idempotency | Same `formId+responseId` → same doc |
| Versioning | New `responseId` → new `UnicornGoogleSubmission`; set `supersedesSubmissionId` / `isCurrent` |
| Staff submit UI | Remains until cutover sign-off; not the normal path for Google-connected forms |

### 5.1 Firestore collections (operational, not new schema types)

| Collection | Document shape |
|------------|----------------|
| `googleFormConfigs/{googleFormId}` | `GoogleFormConfig` |
| `submissions/{googleFormId}_google_{responseId}` | `UnicornGoogleSubmission` (+ flat Universal KEY fields mirrored for query compatibility with existing pool) |

---

## 6. Auth / ownership decision (Phase 0)

| Topic | Decision |
|-------|----------|
| Forms API auth | Service account + Domain-Wide Delegation (`subject = IMPERSONATE_USER`), same pattern as existing Drive JWT in `functions/src/index.ts` |
| Scopes | `forms.body` + `forms.responses.readonly` (narrowest practical set for import/push/ingest/watch) |
| Production form ownership | Dedicated Workspace user (or shared operational account), **not** individual employee personal Drive ownership |
| Public respondents | Google Forms only — no UNICORN/Firebase Auth |
| Secrets | Secret Manager only — never commit SA JSON |

**Human approval needed:** confirm `IMPERSONATE_USER` / dedicated Forms owner account email before Phase 1.

---

## 7. Action execution decision

| Topic | Decision |
|-------|----------|
| In ingest handler | Persist `UnicornGoogleSubmission` only; ack after successful persist |
| Downstream | Cloud Tasks → Action workers (Calendar first, Email second) |
| Failure isolation | Action failure must not fail ingest |
| MVP policy | No complex supersede/update policies; per-version action state only |

---

## 8. Phase gate

### Completed in Phase 0 (this PR)

- [x] Rigid constraints acknowledged
- [x] Exact `web/src/types/google-forms.ts` contracts (`GoogleFormConfig`, `UnicornGoogleSubmission` only)
- [x] Exact `googleapis` Forms method signatures (`google.forms('v1')`)
- [x] Exact 6-day Cloud Scheduler cron for `forms.watches.renew`
- [x] Exact `FB_PUBLIC_LOAD_DATA_` regex + entry extraction logic
- [x] PO Option B: forbid second Forms SDK (`@googleapis/forms`)

### Forbidden until explicit human sign-off for that phase

- Installing `@googleapis/forms` (forbidden under Option B — use `googleapis` only)
- Mapping Workspace UI / imported-form display UI (beyond Phase 1 API+Firestore connect)
- Pub/Sub ingest
- Prefill runtime service
- Phase 1.5+ feature code without explicit human approval

**Phase 1 gate correction:** document aligned to Option B.  
**Phase 1.5:** Prefill POC implementation path = `functions/src/googleForms/prefillEntryExtractor.ts` (see `docs/GOOGLE-FORMS-PHASE1.5-PREFILL-POC.md`). STOP before Answer Workspace / ingest.
