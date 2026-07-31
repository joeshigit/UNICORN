# Google Forms — Codebase Audit (PHASE 0)

**Status:** COMPLETE (Phase 0)  
**Date:** 2026-07-31  
**Branch:** `cursor/google-forms-composer-plan-a7fd`  
**Runbook:** [`COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`](./COMPOSER-2.5-LINE-BY-LINE-BUILDER.md) §1 / §61  
**Constraint:** Documentation only. No Google Forms integration code in this phase.

**Amendment (PO Option B, 2026-07-31):** Forms SDK = existing `googleapis` only. Absence of `@googleapis/forms` is **correct by contract**, not a gap to fill.

**Verdict:** Reuse OptionSets, Universal KEY intent, immutable submission pool, Drive JWT+DWD, and `asia-east1` Functions. Do **not** invent parallel meaning/auth/submission systems. Google Forms surface code does not exist yet (types/SDK/watches/Pub/Sub/Tasks/mapping UI are missing).

---

## Existence checklist

| Artifact | Status |
|----------|--------|
| `web/src/types/google-forms.ts` | MISSING (locked in Architecture Decision only) |
| `GoogleFormConfig` / `UnicornGoogleSubmission` in code | MISSING |
| `@googleapis/forms` | ABSENT by design (PO Option B — use `googleapis` only) |
| Forms watches / Pub/Sub ingest / Cloud Tasks actions | MISSING |
| Region | `asia-east1` |
| `IMPERSONATE_USER` | `joeshi@dbyv.org` in `functions/src/index.ts` |
| Sheets API | MISSING (exports UI mock; `exportSubmissions` returns JSON) |

Required architecture docs present:

- [x] `docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md`
- [x] `docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`
- [x] `docs/UNICORN-Google-Forms-Integration-Specification-v3.md`
- [x] `docs/COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`

---

## 1. Existing relevant files

### Infra / config

| Path | Role |
|------|------|
| `firebase.json` | Firestore, Functions, Hosting (`web/out`) |
| `firestore.rules` | Domain + leader/admin/superuser allowlists; collection ACLs |
| `firestore.indexes.json` | Composite indexes (submissions, drafts, stats, etc.) |
| `storage.rules` | Company read on uploads; client write denied |
| `.cursorrules` | Unicorn architecture (KEY names differ from code) |

### Types & client libs

| Path | Role |
|------|------|
| `web/src/types/index.ts` | `FIXED_KEYS`, `Template`, `Submission`, `OptionSet`, `SUPERUSER_EMAILS` |
| `web/src/lib/firebase.ts` | Firebase app / Auth / Firestore client |
| `web/src/lib/auth.ts` | Google popup, domain gate, developer/leader/admin allowlists |
| `web/src/lib/firestore.ts` | Client CRUD + CF proxies; dual-write `createSubmissionWithId` |

### Auth / form UI components

| Path | Role |
|------|------|
| `web/src/components/auth/*` | AuthProvider, ProtectedRoute, LoginButton |
| `web/src/components/form/DateTimePicker.tsx` | Native fill datetime UI |
| `web/src/components/form/FileUploader.tsx` | Drive upload via `uploadFile` CF |

### Staff (current fill surface)

| Path | Role |
|------|------|
| `web/src/app/staff/page.tsx` | Enabled template list |
| `web/src/app/staff/submit/[templateId]/page.tsx` | **Primary fill UI** (create / edit / correct) |
| `web/src/app/staff/my-submissions/page.tsx` | Own submissions; cancel / edit / resubmit |
| `web/src/app/staff/suggestions/page.tsx` | Template suggestions |

### Leader / Developer (native form builder)

| Path | Role |
|------|------|
| `web/src/app/leader/create/page.tsx` | Multi-step template builder (`FIXED_KEYS`) |
| `web/src/app/leader/templates/page.tsx` | Template management |
| `web/src/app/leader/design-forms/page.tsx` | Design hub |
| `web/src/app/leader/draft-templates/page.tsx` | Template drafts |
| `web/src/app/leader/option-sets/page.tsx` | OptionSet browse / master-subset |
| `web/src/app/leader/exports/page.tsx` | Mock Sheets export UI |
| Other `leader/*` | Drafts, requests, my-templates, settings |

### Admin

| Path | Role |
|------|------|
| `web/src/app/admin/system-settings/page.tsx` | Fixed keys + module/action OptionSets |
| `web/src/app/admin/option-sets/page.tsx` | Admin OptionSet management |
| `web/src/app/admin/option-reviews/page.tsx` | Option request reviews |
| `web/src/app/admin/draft-reviews/page.tsx` | Draft reviews |
| `web/src/app/admin/audit-logs/page.tsx` | Audit log viewer |
| **No** `admin/google-forms/*` | Not present |

### Cloud Functions

| Path | Role |
|------|------|
| `functions/src/index.ts` | All backend (~2856 lines): Drive, submission lifecycle, OptionSet governance, drafts, stats |
| `functions/package.json` | `googleapis` ^169; Node 20; **no `@googleapis/forms`** |

---

## 2. Existing reusable components

| Asset | Reuse for Google Forms |
|-------|------------------------|
| OptionSet governance (UI + CF) | **Primary** — option mapping target |
| `FIXED_KEYS` / Template field model | Mapping target for Universal KEY (after KEY dictionary freeze) |
| `createSubmissionWithId` dual-write pattern | Inform Google ingest write shape (extend, do not replace pool) |
| Immutability + `_correctFor` / `supersedesSubmissionId` | Align with supersede / version chain |
| `getDriveClient` JWT + DWD | Pattern for Forms client auth |
| `AuthProvider` / `ProtectedRoute` | Gate mapping / Answer Workspace UI |
| Staff submit / Leader create | Keep early; do **not** delete; not Google Forms builder |

**Missing reusable UI:** dual-panel Mapping Workspace, Answer Workspace for Google-origin submissions, Analyze/Verify/Push controls.

---

## 3. Existing Firestore structures

| Collection | Layer | Client write | Notes |
|------------|-------|--------------|-------|
| `templates` (+ `versions`) | Template | Leader CRUD; versions create-only | Meaning target for connected forms |
| `optionSets` | Meaning | Denied (CF only) | Master/subset; `code` = Universal KEY |
| `optionRequests` | Workflow | Leader create pending | Approve via CF |
| `optionAliases` | Derived | CF only | Merge mapping |
| `submissions` | Submission | Company create; no client update/delete | Dual schema; CF for status transitions |
| `auditLogs` | Derived | CF only | |
| `optionSetDrafts` / `templateDrafts` | Sandbox | Leader owner | Admin review via CF |
| `userFormStats` | Derived | Limited | `onSubmissionCreated` |
| `formAccessRequests` / `templateSuggestions` | Workflow | Create self | |
| `formNameRegistry` | Meaning | CF only | |

**Planned, not in rules/code:** `googleFormConfigs/{googleFormId}` → `GoogleFormConfig`.

**Indexes today:** submissions by `createdBy`, `templateId`, `_correctFor+_status`, `_reverseOf+_status`, etc.  
**Missing for Forms:** `googleFormId`, `source`, `isCurrent`, watch health queries.

---

## 4. Existing authentication model

### Web (`web/src/lib/auth.ts`)

- Firebase Google Sign-In; domain `dbyv.org`
- Developer/Leader allowlist: `joeshi@dbyv.org` (`isDeveloper` ≡ `isLeader`)
- Admin allowlist: `joeshi@dbyv.org`
- `SUPERUSER_EMAILS` in types is **not** checked by web auth helpers

### Cloud Functions

- `verifyIdToken` + `@dbyv.org`
- `ADMIN_EMAILS`: `joeshi@dbyv.org`
- `SUPERUSER_EMAILS`: `tong@dbyv.org`, `jason@dbyv.org`, `joeshi@dbyv.org`
- No custom claims; hardcoded lists

### Firestore rules

| Role | Emails |
|------|--------|
| Company | `*@dbyv.org` |
| Leader | `joeshi@dbyv.org` |
| Admin | `joeshi@dbyv.org` |
| Superuser | tong / jason / joeshi |

### Route gates

| Area | Gate |
|------|------|
| `/staff/*` | Authenticated company user |
| `/leader/*` | `isDeveloper` |
| `/admin/*` | `isAdmin` |

**Conflict:** Superusers tong/jason can pass rules/CF Superuser checks but cannot enter `/admin` via web `isAdmin`.

---

## 5. Existing Workspace integration

| Integration | Status |
|-------------|--------|
| Drive upload | **Exists** — `getDriveClient`, `uploadFile`, DWD `IMPERSONATE_USER=joeshi@dbyv.org`, scope `drive` |
| Sheets export | **Not real** — UI mock; CF returns JSON |
| Forms API | **Absent** |
| Pub/Sub / watches | **Absent** |
| Cloud Tasks | **Absent** |
| Calendar / Gmail Actions | **Absent** as generic Action system |

All Functions: `.region('asia-east1')`.  
Hardcoded base: `https://asia-east1-unicorn-dcs.cloudfunctions.net/...`

---

## 6. Existing submission model

### Write path (active)

`createSubmissionWithId` dual-writes:

- Legacy (rules): `templateId`, `templateVersion`, `moduleId`, `actionId`, `createdBy`, `status`, `values`, `labelsSnapshot`, …
- UNICORN `_`: `_templateId`, `_templateModule`, `_templateAction`, `_templateVersion`, `_submitterId`, `_submitterEmail`, `_submittedAt`, `_submittedMonth`, `_status`, `_fieldLabels`
- Flat Universal KEY fields from `values`
- Optional `supersedesSubmissionId` + `_correctFor`

### Immutability

- Client update/delete on `submissions` = false
- Status via CF: cancel / reactivate / lock / unlock
- Correction/reverse create **new** documents

### Correction paths (fragmented)

1. Staff `?edit=` → new submission + supersede + cancel old (ACTIVE)
2. Staff `?correctFor=` → new submission with `_correctFor`
3. CF `createCorrectionSubmission` — LOCKED only; sets `_correctFor`; UI does not call it reliably

**Vs Google Forms spec:** needs `source`, `googleFormId`, `googleResponseId`, `isCurrent`, `supersededBySubmissionId`, deterministic id `` `${formId}_google_${responseId}` `` — none of these exist in code yet.

---

## 7. Files that must be extended (after Phase 1 sign-off)

| File / area | Why |
|-------------|-----|
| **NEW** `web/src/types/google-forms.ts` | Only `GoogleFormConfig` + `UnicornGoogleSubmission` |
| `web/src/types/index.ts` | Re-export |
| `functions/package.json` | Reuse existing `googleapis` for Forms (PO Option B). Do **not** add `@googleapis/forms` |
| **NEW** `functions/src/googleForms/*` | client, connect, watches, ingest, normalize, prefillEntryExtractor |
| `functions/src/index.ts` | Export new HTTPS/Pub/Sub/Scheduler targets; keep Drive |
| `firestore.rules` | `googleFormConfigs`; Google ingest likely Admin SDK only |
| `firestore.indexes.json` | Forms query indexes |
| **NEW** `web/src/app/admin/google-forms/...` | Mapping Workspace (extend if similar route appears) |
| `web/src/lib/firestore.ts` | Config / Answer Workspace read helpers |
| Auth allowlists | Superuser access to mapping UI (resolve fragmentation) |

---

## 8. Files that should NOT be changed in early phases

| File / area | Reason |
|-------------|--------|
| `web/src/app/staff/submit/[templateId]/page.tsx` | Legacy fill; keep until cutover |
| Leader template builder (`create`, drafts, templates) | Not Google Forms editor; keep for meaning layer |
| `web/src/components/form/*` | Still used by native fill |
| OptionSet governance CF + rules | Extend via mapping; do not replace |
| Drive `getDriveClient` / `uploadFile` | Do not break |
| Phase 0 / Architecture Decision docs | Locked contracts — do not invent parallel schemas |
| Silent KEY rename across repo | Requires explicit human decision |
| Removing dual-write prematurely | Rules + UI still depend on legacy fields |

---

## 9. Architectural conflicts discovered

### A. KEY naming drift

| Source | Example keys |
|--------|----------------|
| `.cursorrules` / theme docs | `startDateTime`, `notes1` |
| Code `FIXED_KEYS` | `dateTimeStart`, `note` |

**Must freeze dictionary before Phase 1 mapping.** Recommend: map Google → **code `FIXED_KEYS` + OptionSet codes** until a dedicated KEY migration is approved.

### B. Dual schema on submissions

Nested `values` + flat fields; legacy names + `_` names. CF vs rules use different owner fields (`createdBy` vs `_submitterEmail`). Google ingest must write a compatible dual shape or rules/indexes break.

### C. Staff submit is still the fill surface

Conflicts with product boundary “Google Forms is the only normal submit surface.” Early phases: keep Staff submit; do not delete; mark Google-connected forms as Forms-only later by explicit cutover.

### D. Allowlist fragmentation

Developer / Admin / Superuser lists duplicated and inconsistent across web, rules, CF. Mapping Workspace needs a clear Superuser (or Admin) gate before Phase 3.

### E. Missing Forms / Pub/Sub / Tasks

No implementation yet — expected. Do not substitute Apps Script / Sheets / polling (Runbook absolute DO NOT).

### F. Correction model vs Copy & Resubmit

Native edit/correct ≠ Google prefill resubmit. Do not reuse Staff submit as Copy & Resubmit.

### G. DateTime format inconsistency

Types document `yyyymmdd hh:mm`; `DateTimePicker` uses ISO-like values. Normalize at Google ingest write-time.

### H. Impersonation / ownership risk

`IMPERSONATE_USER` is a personal account. Architecture Decision requires human approval of dedicated Forms owner before production watches.

### I. `UnicornGoogleSubmission.answers` vs flat pool

Spec has `answers` map + flat Universal KEY mirror. Existing queries use flat keys. Ingest must mirror flat keys into the single `submissions` pool.

### J. Dead / misleading helpers

Client `createOptionSet` in `firestore.ts` denied by rules; `exportSubmissions` is not Sheets; `CORRECTION_URL` unused in UI. Do not treat these as live integrations.

---

## 10. Key symbols index

| Symbol | Path |
|--------|------|
| `FIXED_KEYS` | `web/src/types/index.ts` |
| `Template` / `FieldDefinition` | `web/src/types/index.ts` |
| `Submission` | `web/src/types/index.ts` |
| `OptionSet` | `web/src/types/index.ts` |
| `SUPERUSER_EMAILS` | `web/src/types/index.ts` + `functions/src/index.ts` |
| `isDeveloper` / `isLeader` / `isAdmin` | `web/src/lib/auth.ts` |
| `createSubmissionWithId` | `web/src/lib/firestore.ts` |
| `getDriveClient` / `IMPERSONATE_USER` | `functions/src/index.ts` |
| `createCorrectionSubmission` / `createReverseSubmission` | `functions/src/index.ts` |
| `uploadFile` / `onSubmissionCreated` | `functions/src/index.ts` |

**Not in code:** `GoogleFormConfig`, `UnicornGoogleSubmission`, `getFormsClient`, `renewGoogleFormWatches`, ingest/normalize/prefill modules.

---

## 11. Cloud Functions inventory (`asia-east1`)

`uploadFile`, `cancelSubmission`, `processOptionRequest`, `createOptionSet`, `exportSubmissions`, `migrateOptionSetCode`, `deleteOptionSet`, `updateOptionSet`, `batchUploadOptions`, `reviewOptionSetDraft`, `reviewTemplateDraft`, `migrateOptionSetsToMaster`, `reactivateSubmission`, `lockSubmission`, `unlockSubmission`, `createReverseSubmission`, `createCorrectionSubmission`, `reportSubmissionIssue`, `onSubmissionCreated`, `processFormAccessRequest`, `reviewTemplateSuggestion`, `seedModuleActionOptionSets`

---

## 12. Human decisions required before Phase 1

1. Approve this audit (extend existing systems; no parallel semantic stack).  
2. Freeze Universal KEY dictionary for mapping: **code `FIXED_KEYS` + OptionSet codes** (recommended default).  
3. Approve Forms owner / `IMPERSONATE_USER` (dedicated account preferred).  
4. Approve who may open Mapping Workspace (Admin-only vs Superuser web access).  
5. Explicit sign-off to start **Phase 1 only** (read-only `forms.get` connect; no mapping UI / Pub/Sub / Actions).

---

## 13. Phase 0 STOP

No production behavior modified.  
No `web/src/types/google-forms.ts` created.  
No `@googleapis/forms` installed.  
No Functions / UI feature code added.

**NEXT PHASE:** Runbook Phase 1 — read-only Google Form connection — only after human approval.
