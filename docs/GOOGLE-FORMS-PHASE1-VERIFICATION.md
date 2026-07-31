# Google Forms — Phase 1 Live Verification Report

**Date:** 2026-07-31  
**Commit under test:** `88dd000` (Phase 1 implementation)  
**Constraint:** No new Google Forms features. No Phase 1.5+. STOP after this report.

**Overall gate:**

```text
PHASE 1 LIVE VERIFICATION: BLOCKED — HUMAN ACTION REQUIRED
Implementation boundary: APPROVED
Phase 1.5: NOT APPROVED
```

---

## A. Live `forms.get` result

| Check | Result |
|-------|--------|
| Live `forms.get()` against a real form | **BLOCKED** |
| Reason | This Cloud Agent environment has **no** `functions/service-account.json` (gitignored; correctly not in repo). No `GOOGLE_APPLICATION_CREDENTIALS`, no gcloud auth, no Secret Manager injection, environment metadata has no secrets. |
| Deployed function probe | `POST https://asia-east1-unicorn-dcs.cloudfunctions.net/connectGoogleForm` → **HTTP 404** (function not deployed / not reachable from this environment) |
| Code path readiness | `getFormsClient()` → `formsClient.forms.get({ formId })` is implemented in `functions/src/googleForms/client.ts` |

**Human action required for A:**

1. Place service-account JSON only on the deploy host / Secret Manager (never commit).  
2. Deploy Functions including `connectGoogleForm`.  
3. Call with a form owned by / shared to `IMPERSONATE_USER` (`joeshi@dbyv.org`).  
4. Confirm `forms.get` returns title + items.

---

## B. Live Firestore document result

| Check | Result |
|-------|--------|
| Live write to `googleFormConfigs/{googleFormId}` | **BLOCKED** (depends on A + deploy) |
| Intended document shape (from code) | Matches locked `GoogleFormConfig` |

**Intended fields after successful connect (code review, not live inspect):**

```text
id                        = googleFormId
googleFormId
title                     = form.info.title
responderUri
templateId                = '' or supplied (not used to mutate templates)
operationalStatus         = DRAFT
watchHealth               = DISCONNECTED
watch                     = null
questionMappings[]:
  itemId
  questionId
  googleLabel             (Google question title)
  googleQuestionType
  unicornKey              = ''
  requiredOnGoogle
  mappingStatus           = UNMAPPED
  optionMappings[]        (googleOptionLabel, unicornOptionValue='', confirmed=false)
createdAt / updatedAt / createdBy / updatedBy
```

**Confirmed absent in Phase 1 write path:**

- Pub/Sub watch object (always `null`)
- prefillEntryId population
- response / submission docs
- batchUpdate

**Human action required for B:** After live connect, open Firestore console and inspect `googleFormConfigs/{googleFormId}` against the list above.

---

## C. Form ID test results

### Parser behavior (unit-verified in this environment)

| Input type | Accepted? | Resolved as | Conversion? |
|------------|-----------|-------------|-------------|
| Raw API Form ID | YES | same string | N/A |
| Edit URL `/forms/d/{FORM_ID}/edit` | YES | `{FORM_ID}` | path extract only |
| Public URL `/forms/d/e/{PUBLIC_ID}/viewform` | YES (parsed) | `{PUBLIC_ID}` | **NO conversion** to API Form ID |
| Empty / short / non-Google host | NO | `INVALID_FORM_ID` | — |

### Important identity fact (no invention)

Google’s **published** `/d/e/{PUBLIC_ID}` identifier is **not guaranteed** to equal the Forms API `formId` used by `forms.get`.

Phase 1 intentionally:

- extracts the public id from `/d/e/...` URLs;
- does **not** invent a lookup/conversion service;
- passes that id to `forms.get`;
- if Google rejects it → `FORM_NOT_FOUND` / `FORM_ACCESS_DENIED` with message directing use of the **edit URL Form ID**.

| Live connect test | Result |
|-------------------|--------|
| Raw Form ID → `connectGoogleForm` | **BLOCKED** (no credentials / not deployed) |
| Edit URL → `connectGoogleForm` | **BLOCKED** |
| Public `/d/e/...` → `connectGoogleForm` | **BLOCKED** (parser ready; live outcome unknown until deploy) |

---

## D. OAuth / DWD scope result

| Item | Result |
|------|--------|
| Auth pattern | Same as Drive: service account JWT + `subject: IMPERSONATE_USER` (`joeshi@dbyv.org`) |
| Phase 1 scope in code | **Only** `https://www.googleapis.com/auth/forms.body.readonly` |
| Forms write scope in Phase 1 | **NOT added** (least privilege) |
| Live DWD authorize() | **BLOCKED** (no service-account in environment) |
| Secrets in repo | **None added** (`**/service-account*.json` remains gitignored) |

### Scope plan (documented, not implemented beyond Phase 1)

| Phase / capability | Scope needed |
|--------------------|--------------|
| Phase 1 `forms.get` (now) | `forms.body.readonly` |
| Later Push Standardization `forms.batchUpdate` | `forms.body` (write) |
| Later response ingest `forms.responses.get` | `forms.responses.readonly` |
| Later watches create/renew | typically Forms body/responses read scopes per Google docs (verify at that phase) |
| Drive upload (existing, unrelated) | `drive` (unchanged; separate client) |

---

## E. Existing `googleapis` capability result

Package: `googleapis@169.0.0` (already in `functions/package.json`).

| Operation | Present as function on `google.forms('v1')` |
|-----------|---------------------------------------------|
| `forms.get` | YES |
| `forms.responses.get` | YES |
| `forms.watches.create` | YES |
| `forms.watches.renew` | YES |
| `forms.watches.delete` | YES |
| `forms.batchUpdate` | YES |

**Decision upheld:** Do **not** install `@googleapis/forms` / second Forms SDK. Existing `googleapis` covers the planned architecture surface.

Phase 1 code uses only `forms.get`. Other methods are verified as available for later phases, **not called**.

---

## F. Regression result

| Area | Result |
|------|--------|
| Phase 1 commit file set | Only: `web/src/types/google-forms.ts`, `web/src/types/index.ts`, `functions/src/googleForms/*`, `functions/src/index.ts` (+5 export lines) |
| `web/src/app/staff/*` | **Unchanged** |
| `web/src/app/leader/*` | **Unchanged** |
| `web/src/components/form/*` | **Unchanged** |
| OptionSet governance / Drive upload logic | **Unchanged** |
| Existing `Submission` schema / dual-write path | **Unchanged** |
| Prefill / Pub/Sub / watches / ingest / Tasks / mapping UI / batchUpdate / Answer Workspace | **Not implemented** |
| Functions `tsc` build | **PASS** |
| Web `tsc` | **PRE-EXISTING FAILURES** in `leader/templates` + `firestore.ts` (unrelated to Phase 1; `google-forms.ts` clean) |

---

## G. Exact remaining blockers

1. **Credentials unavailable in Cloud Agent** — cannot run live DWD / `forms.get` here without injecting secrets (must not commit JSON).  
2. **`connectGoogleForm` not deployed** — remote probe returned HTTP 404.  
3. **No Firebase ID token in this environment** — even if deployed, Admin/Superuser Bearer auth cannot be exercised here.  
4. **Public `/d/e/` vs API Form ID** — live outcome of public URL must be recorded after deploy; no conversion layer will be added unless Google provides an official mechanism and product approves a later phase.  
5. **DWD Forms scope grant** — Workspace Admin must ensure the service account’s Domain-Wide Delegation includes `forms.body.readonly` for the impersonated user (likely still needed even though code requests it).  
6. **Human must supply a real test Form ID** (edit-URL id preferred) accessible to `joeshi@dbyv.org`.

### Minimal human verification script (for your machine / deploy host)

```bash
# 1) Ensure functions/service-account.json exists locally (gitignored)
# 2) Deploy
firebase deploy --only functions:connectGoogleForm

# 3) Call with Firebase ID token of Admin/Superuser
curl -X POST \
  "https://asia-east1-unicorn-dcs.cloudfunctions.net/connectGoogleForm" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"formIdOrUrl":"PASTE_EDIT_URL_OR_API_FORM_ID"}'

# 4) Repeat with edit URL and public /d/e/ URL; record which succeed
# 5) Inspect Firestore googleFormConfigs/{googleFormId}
```

---

## Architecture boundary re-confirm

```text
Pub/Sub watches: NOT IMPLEMENTED
Response ingestion: NOT IMPLEMENTED
Cloud Tasks: NOT IMPLEMENTED
Prefill extractor: NOT IMPLEMENTED
Mapping UI: NOT IMPLEMENTED
Push Standardization / batchUpdate: NOT IMPLEMENTED
Answer Workspace: NOT IMPLEMENTED
Second Forms SDK: NOT INSTALLED
```

---

## STOP

Await human completion of live steps A–C (or provision of a secrets-capable environment) and explicit approval before Phase 1.5.
