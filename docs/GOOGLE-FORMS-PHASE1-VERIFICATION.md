# Google Forms — Phase 1 Live Verification Report

**Date:** 2026-07-31  
**Environment:** Local Windows Agent  
**Commit under test:** `88dd000` (Phase 1 implementation); docs aligned by PO Option B (this gate correction)  
**Constraint:** No new Google Forms features. No Phase 1.5+. STOP after this report.

**Overall gate:**

```text
PHASE 1 GATE: PASS
SDK contract: ALIGNED (PO Option B — existing googleapis only)
Implementation boundary: APPROVED
Phase 1.5: NOT APPROVED
```

---

## PO Option B (architecture compliance correction)

**Decision (2026-07-31):** Keep monolithic `googleapis` for Forms. Do **not** install `@googleapis/forms`.

Updated locked docs:

- `GOOGLE-FORMS-ARCHITECTURE-DECISION.md` §2
- `COMPOSER-2.5-LINE-BY-LINE-BUILDER.md` hierarchy + §1.2
- `GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`
- `COMPOSER-2.5-GOOGLE-FORMS-EXECUTION-PLAN.md`
- `GOOGLE-FORMS-CODEBASE-AUDIT.md` (amendment)

**Code change required for Option B:** none (implementation already used `googleapis`).

---

## Preconditions

| Item | Evidence |
|------|----------|
| Branch | `cursor/google-forms-composer-plan-a7fd` |
| `functions/service-account.json` | Present locally (gitignored) |
| Function | `https://asia-east1-unicorn-dcs.cloudfunctions.net/connectGoogleForm` ACTIVE |
| Workspace DWD | Client ID `114809014590828153152` → `drive` + `forms.body.readonly` |
| GCP API | `forms.googleapis.com` enabled on `unicorn-dcs` |
| Package | `googleapis@^169` present; `@googleapis/forms` **not** installed |

---

## A. Live `forms.get` / connect

| Check | Result |
|-------|--------|
| Local DWD + `forms.get` | PASS — title `九澳鮑思高青年村_訓練課程_資料表`, 8 items |
| Deployed Test A (raw Form ID) | PASS — HTTP 200 |
| Form ID | `1DBOtDlahRnMzKHzUVamzK_msIKM8wgD3jCwk--f-LmY` |

---

## B. Firestore document

`googleFormConfigs/1DBOtDlahRnMzKHzUVamzK_msIKM8wgD3jCwk--f-LmY`

| Field | Live |
|-------|------|
| `operationalStatus` | `DRAFT` |
| `watch` | `null` |
| `watchHealth` | `DISCONNECTED` |
| all `mappingStatus` | `UNMAPPED` |
| all `unicornKey` | `''` |
| snapshot fields | `title`, `googleLabel`, `googleQuestionType`, ids, options |

---

## C. Form ID tests

| Test | Input | HTTP | Result |
|------|-------|------|--------|
| A | Raw API Form ID | 200 | PASS |
| B | Edit URL | 200 | PASS |
| C | Public `/d/e/` | 404 | EXPECTED `FORM_NOT_FOUND` |

---

## D. OAuth / DWD

| Item | Result |
|------|--------|
| Pattern | JWT + `subject: joeshi@dbyv.org` via `googleapis` |
| Phase 1 scope | `forms.body.readonly` only |
| Second Forms SDK | **NOT installed** (contract) |

---

## E. Negatives

| Case | HTTP | Body |
|------|------|------|
| No Authorization | 401 | `AUTHENTICATION_ERROR` |
| Invalid form id | 404 | `FORM_NOT_FOUND` |

---

## F. Boundary

```text
Pub/Sub watches: NOT IMPLEMENTED
Response ingestion: NOT IMPLEMENTED
Cloud Tasks: NOT IMPLEMENTED
Prefill: NOT IMPLEMENTED
Mapping UI: NOT IMPLEMENTED
batchUpdate: NOT IMPLEMENTED
Answer Workspace: NOT IMPLEMENTED
@googleapis/forms: NOT INSTALLED (forbidden under Option B)
```

---

## STOP

```text
PHASE 1 GATE: PASS
Phase 1.5: NOT APPROVED
```
