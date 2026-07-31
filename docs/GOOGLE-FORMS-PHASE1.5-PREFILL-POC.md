# Google Forms — Phase 1.5 Prefill POC Report

**Date:** 2026-07-31  
**Branch:** `cursor/google-forms-composer-plan-a7fd`  
**Constraint:** Prefill POC only. No Answer Workspace, ingest, watches, mapping UI, batchUpdate standardization.

**Overall gate:**

```text
PHASE 1.5 GATE: PASS
Phase 2+ / Answer Workspace / ingest: NOT APPROVED — STOP
```

---

## Deliverables

| Item | Status |
|------|--------|
| `functions/src/googleForms/prefillEntryExtractor.ts` | DONE (Architecture Decision §4) |
| States: `success` / `unsupported` / `parse_failure` / `PREFILL_UNAVAILABLE` | DONE |
| No fake URL on failure | DONE |
| `proveGoogleFormPrefill` HTTPS (asia-east1) | DONE + deployed |
| Offline fixture tests | PASS (`npm run test:prefill`) |
| Live open-form browser verify | **PASS** |

Endpoint: `https://asia-east1-unicorn-dcs.cloudfunctions.net/proveGoogleFormPrefill`

---

## Dedicated POC form (live)

| Field | Value |
|-------|-------|
| Form ID | `19g7qoqlw8KgPTjhsh8p8yzBbU-IyKFCZ61WKNvh_vPc` |
| Title | `UNICORN Phase 1.5 Prefill POC` |
| responderUri | `https://docs.google.com/forms/d/e/1FAIpQLSccnl8tn0Wghg_Uxn3NZWAUNYI6ldSyYsr56f3HDpGnRYHQBA/viewform` |
| Setup | Created via Forms API after PO added DWD `forms.body`; published; Drive anyone-with-link reader for public HTML fetch |

Questions (Runbook §27):

| Question | Type | Prefill sample | Browser result |
|----------|------|----------------|----------------|
| Short text Q | SHORT_TEXT | `POC short text` | PASS |
| Paragraph Q | PARAGRAPH | `POC paragraph line` | PASS |
| Multiple choice Q | MULTIPLE_CHOICE | `Opt A` | PASS (selected) |
| Dropdown Q | DROPDOWN | `Red` | PASS (selected) |
| Checkbox Q | CHECKBOX | `One` + `Two` | PASS (both checked) |
| Date Q | DATE | month `07` / day `31` | PASS (form is MM/DD; no year field) |

Deployed `proveGoogleFormPrefill` → HTTP 200, `status: success`, `supportedCount: 6`, `prefillUrl` present.

---

## Support matrix (recorded)

| Type | Support |
|------|---------|
| Short text / Paragraph / MC / Dropdown / Checkbox / Date | **SUPPORTED** (live) |
| File upload | **UNSUPPORTED** (classified; not on POC form) |
| Time / grids / scale | **UNSUPPORTED** in POC classification |

---

## Negative / failure path

Closed Phase 1 form (no longer accepting responses):

```json
{ "status": "PREFILL_UNAVAILABLE", "prefillUrl": null }
```

Gate rule satisfied: failed / unavailable extraction **does not** invent a prefilled URL.

---

## Known limitation (do not “fix” in later phase without design)

`FB_PUBLIC_LOAD_DATA_` **itemId** values are numeric and **do not equal** Forms API `item.itemId` hex strings on this form.

| Source | Example |
|--------|---------|
| Forms API `itemId` | `30e2c0ca` |
| FB public load `itemId` | `820166858` |

Architecture Decision §4.5 joins by `itemId`. Phase 1.5 proves **entryId extraction + working prefill URL**.  
Persisting `prefillEntryId` onto `googleFormConfigs.questionMappings` via API itemId join may miss until a later approved join strategy (e.g. title+type match, or store FB itemId separately). **Not in Phase 1.5 scope to redesign.**

---

## Explicit STOP

```text
Answer Workspace: NOT STARTED
Copy & Resubmit UI: NOT STARTED
Response ingest / watches / Pub/Sub: NOT STARTED
Mapping UI: NOT STARTED
Push Standardization / batchUpdate: NOT STARTED
```

---

## Gate checklist (Runbook §28)

* [x] Prefill works for supported field types (live browser)
* [x] Unsupported types explicitly identified
* [x] Failed extraction does not produce a fake prefilled URL
* [x] Existing form submission path unaffected (no ingest / no Staff submit changes)

**STOP.** Await human approval before any later phase.
