# UNICORN × Google Forms — Phase 1 Gate Report (for external review)

**Date:** 2026-07-31  
**Branch:** `cursor/google-forms-composer-plan-a7fd`  
**PR:** https://github.com/joeshigit/UNICORN/pull/10  
**Phase 1 code commit:** `88dd000`  
**Gate correction:** PO Option B — lock existing `googleapis`; forbid `@googleapis/forms`

---

## Gate declaration

```text
PHASE 0: PASS
PHASE 1 CODE: COMPLETE (88dd000)
SDK CONTRACT: ALIGNED (PO Option B — document amendment; no code change)
PHASE 1 LIVE GATE: PASS
Phase 1.5: NOT APPROVED — STOP
```

---

## Review history (SDK conflict)

External review correctly found:

| Locked (old) | Implementation |
|--------------|----------------|
| `@googleapis/forms` | `googleapis` → `google.forms('v1')` |

**PO chose Option B (2026-07-31):** keep `googleapis`; amend Architecture Decision + Runbook + related docs.  
**Not Option A:** do not install `@googleapis/forms`.

After amendment, architecture compliance for SDK = **PASS**.

---

## Documents (priority)

1. `docs/COMPOSER-2.5-LINE-BY-LINE-BUILDER.md` — process/gates (SDK wording updated)
2. `docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md` — §2 now locks `googleapis`
3. `docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`
4. `docs/UNICORN-Google-Forms-Integration-Specification-v3.md`
5. `docs/COMPOSER-2.5-GOOGLE-FORMS-EXECUTION-PLAN.md`
6. `docs/GOOGLE-FORMS-CODEBASE-AUDIT.md`
7. `docs/GOOGLE-FORMS-PHASE1-VERIFICATION.md` — live PASS evidence
8. This file

---

## What Phase 1 implemented

- Types: `GoogleFormConfig` + `UnicornGoogleSubmission` (+ `title` on config)
- Client: DWD via existing `googleapis`, scope `forms.body.readonly` only
- Function: `connectGoogleForm` → `googleFormConfigs/{id}` DRAFT / watch=null / UNMAPPED

### Not implemented (correct)

Prefill, watches, ingest, Cloud Tasks, mapping UI, batchUpdate, Answer Workspace, `@googleapis/forms`

---

## Live evidence

| Test | Result |
|------|--------|
| A raw Form ID | HTTP 200 PASS |
| B edit URL | HTTP 200 PASS |
| C public `/d/e/` | HTTP 404 `FORM_NOT_FOUND` (expected) |
| No auth | 401 |
| Bad form id | 404 |
| Firestore shape | DRAFT / watch=null / all UNMAPPED / empty unicornKey |
| Form | `九澳鮑思高青年村_訓練課程_資料表` (8 questions) |

Form ID: `1DBOtDlahRnMzKHzUVamzK_msIKM8wgD3jCwk--f-LmY`

---

## Residual (non-blocking for Phase 1 gate)

| Item | Status |
|------|--------|
| Imported-form display UI (§2.6 / execution-plan wording) | Scope interpretation — PO accepted Phase 1 = API + Firestore connect; UI deferred. Mapping UI still blocked. |
| Public ID conversion | Intentionally not built — APPROVED |
| Phase 1.5 | BLOCKED until explicit approval |

---

## STOP

```text
PHASE 1 GATE: PASS
Phase 1.5: NOT APPROVED
```

Do not start Prefill / watches / ingest / mapping UI until human says so.
