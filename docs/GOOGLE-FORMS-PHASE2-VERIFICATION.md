# Google Forms — Phase 2 Verification Report

**Date:** 2026-07-31  
**Branch:** `cursor/google-forms-composer-plan-a7fd`  
**Constraint:** Phase 2 ONLY — connect + display imported structure. No Mapping UI / ingest / Prefill productization.

**Overall gate:**

```text
PHASE 2 GATE: PASS
NEXT PHASE: NOT STARTED
AWAITING PO APPROVAL: YES
STOP
```

---

## Inspect — missing pieces before implement

| Capability | Before Phase 2 |
|------------|----------------|
| `connectGoogleForm` CF + `forms.get` | Present (Phase 1) |
| `GoogleFormConfig` / `googleFormConfigs` write | Present (Phase 1) |
| Firestore client read rules for `googleFormConfigs` | **MISSING** |
| Admin UI connect / list / structure display | **MISSING** |
| Mapping UI / Analyze / Push / ingest | Absent (correct) |

Phase 1 backend **not modified**.

---

## Implementation

### What was implemented

1. Firestore rules: Admin/Superuser **read** on `googleFormConfigs`; client writes denied (CF Admin SDK only).
2. Client helpers: `web/src/lib/googleForms.ts` — call existing `connectGoogleForm`, list/get configs.
3. Admin UI:
   - `/admin/google-forms` — connect form + list connected forms
   - `/admin/google-forms/[formId]` — **display-only** structure (title, types, labels, choices, required, itemId, questionId, UNMAPPED)
4. Admin nav + dashboard link to Google Forms.

### Explicitly not implemented

Mapping controls, Analyze/Verify/Push, `batchUpdate`, ingest, watches, Answer Workspace, Copy & Resubmit, Prefill productization, FB↔API itemId join.

---

## API evidence

| Call | Result | Classification |
|------|--------|----------------|
| `POST connectGoogleForm` with Form ID `19g7qoqlw8KgPTjhsh8p8yzBbU-IyKFCZ61WKNvh_vPc` | HTTP 200, title `UNICORN Phase 1.5 Prefill POC`, 6 questions | **PASS** |
| `forms.get` (readonly scope) after connect | Same title, 6 items — Form not rewritten | **PASS** |
| No `forms.batchUpdate` in Phase 2 code path | Confirmed by scope + no write calls | **PASS** |

---

## Firestore evidence

Document: `googleFormConfigs/19g7qoqlw8KgPTjhsh8p8yzBbU-IyKFCZ61WKNvh_vPc`

| Field | Live |
|-------|------|
| title | `UNICORN Phase 1.5 Prefill POC` |
| operationalStatus | `DRAFT` |
| watch | `null` |
| questionCount | 6 |
| all mappingStatus | `UNMAPPED` |
| sample itemId / questionId | `30e2c0ca` / `30686868` (Short text Q) |
| choices preserved | MC Opt A/B; Dropdown Red/Blue; Checkbox One/Two |
| required | Short text `requiredOnGoogle: true` |

Client read via Firestore REST with Admin ID token after rules deploy: **PASS**.

---

## UI evidence

Local Next.js (`localhost:3000`) as Admin `joeshi@dbyv.org`:

| Check | Result |
|-------|--------|
| Nav shows **Google Forms** | PASS |
| List shows connected forms (POC 6題 + Phase1 form 8題) | PASS |
| Detail shows title, googleFormId, DRAFT, watch=null | PASS |
| Questions show label, type, UNMAPPED, itemId, questionId | PASS |
| Choices visible for MC / Dropdown / Checkbox | PASS |
| required badge on Short text Q | PASS |
| No mapping controls | PASS |

---

## Test / Gate checklist

| Gate item | Result |
|-----------|--------|
| Form can be connected | **PASS** |
| Structure can be read | **PASS** |
| itemId stored correctly | **PASS** |
| questionId stored correctly | **PASS** |
| labels preserved | **PASS** |
| choices preserved | **PASS** |
| required state preserved where supported | **PASS** |
| Google Form was not modified | **PASS** (readonly `forms.get` only) |
| Existing UNICORN forms still work | **PASS** (no changes under `staff/*` or `leader/*` submit paths; classification: inspect) |
| Imported structure accurately displayed in UNICORN | **PASS** (live localhost UI) |

---

## Files changed / added / deleted

### Added

| File | Why |
|------|-----|
| `web/src/lib/googleForms.ts` | Connect helper + Firestore list/get |
| `web/src/app/admin/google-forms/page.tsx` | Connect + list UI |
| `web/src/app/admin/google-forms/[formId]/page.tsx` | Structure display UI (§2.6) |
| `docs/GOOGLE-FORMS-PHASE2-VERIFICATION.md` | This report |

### Changed

| File | Why |
|------|-----|
| `firestore.rules` | Allow Admin/Superuser read of `googleFormConfigs` |
| `web/src/app/admin/layout.tsx` | Nav entry |
| `web/src/app/admin/page.tsx` | Dashboard link |

### Deleted

| File | Why |
|------|-----|
| (none in final tree) | Temporary localhost-only `dev-auth` helper used for UI login was removed after verification |

### Not modified

- `functions/src/googleForms/config.ts` / `client.ts` (Phase 1)
- Phase 1.5 Prefill files
- Staff / Leader form submit UI

---

## Known limitations

1. **Hosting:** Firebase Hosting still targets `web/out` while `output: 'export'` is disabled; Phase 2 UI verified on **local Next dev**, not yet on `unicorn-dcs.web.app` until hosting deploy path is aligned (pre-existing hosting setup).
2. **FB itemId ≠ API itemId:** unchanged; Phase 2 displays **Forms API** identities only (correct for mapping anchors).
3. **Admin layout** remains `isAdmin` gate; Superusers who are not Admin still cannot open `/admin/*` (pre-existing). `connectGoogleForm` CF still allows Superuser via Bearer.

---

## Classification summary

| Area | Classification |
|------|----------------|
| Connect API | PASS |
| Firestore write/read | PASS |
| Structure fidelity | PASS |
| UI display §2.6 | PASS |
| Google Form unmodified | PASS |
| Staff/Leader regression | PASS (inspect; no code touch) |
| Production hosting deploy of new pages | NOT TESTED (local UI evidence used) |
| Phase 3+ features | NOT STARTED |

---

## STOP

```text
PHASE 2 GATE: PASS
NEXT PHASE: NOT STARTED
AWAITING PO APPROVAL: YES
STOP
```
