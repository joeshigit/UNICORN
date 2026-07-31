# Composer 2.5 — UNICORN × Google Forms Execution Plan

**Canonical builder runbook:** [`COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`](./COMPOSER-2.5-LINE-BY-LINE-BUILDER.md)  
Composer must execute that runbook sequentially, not this summary alone.

**Audience:** Cursor Composer 2.5 (implementation agent)  
**Background spec:** [`UNICORN-Google-Forms-Integration-Specification-v3.md`](./UNICORN-Google-Forms-Integration-Specification-v3.md)  
**Technical lock:** [`GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md)  
**Mode:** Phased. Additive. Stop at gates. Do not rebuild Google Forms.

---

## 0. Mission in one sentence

Build UNICORN as the **organizational intelligence and Answer Workspace around Google Forms** — not a second form builder, not a second submission channel.

```text
Google Forms = create / design / present / collect
UNICORN      = map / standardize / verify / answer workspace / history / resubmit / actions
```

---

## 1. Hard rules (never violate)

1. Google Forms is the **only normal respondent submission surface**.
2. Do **not** build a UNICORN public form runtime or “Edit & Submit” on the Answer page.
3. Reuse existing UNICORN semantics: Universal KEY, OptionSets, single `submissions` pool, immutable submissions, write-time normalization.
4. Do **not** invent parallel concepts like `GoogleQuestionKey` / `GoogleOptionKey`.
5. Question identity = Google stable `itemId` / `questionId`, never order or label alone.
6. Option identity = UNICORN OptionSet value/key after governed mapping; Google choice labels are presentation.
7. Never drop unmapped answers; preserve raw + flag for repair.
8. Primary Google-originated submission IDs must be **deterministic** from `formId + responseId` (no `addDoc` for primary ingest).
9. Pub/Sub payload is **not** the answer; always `forms.responses.get`.
10. Persist submission before successful ack; Actions are async (Cloud Tasks), never inside the ingest hot path.
11. Prefer additive changes. Do not delete the existing Staff form builder until later phases explicitly retire it.
12. **Phase gate:** complete and report Phase 0 before any production integration code.

### 1.1 Rigid Phase 0 / schema constraints (MANDATORY — acknowledged)

These constraints override any looser wording elsewhere:

1. **Do not invent any new schema types.** Strictly use only:
   - `GoogleFormConfig`
   - `UnicornGoogleSubmission`
   as defined for [`web/src/types/google-forms.ts`](../web/src/types/google-forms.ts) in [`GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md).
2. Phase 0 output must **not** be generic markdown summaries. It must be a **concrete technical specification** in:
   - [`docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md)
   containing at minimum:
   - Exact TypeScript interface file path: `web/src/types/google-forms.ts`
   - Exact `googleapis` Forms SDK method signatures to call (`google.forms('v1')`; no `@googleapis/forms`)
   - Exact Cloud Scheduler cron configuration for **6-day** `forms.watches.renew`
   - Exact DOM/parser regex + logic for extracting `entry.XXXXXX` prefill parameters from the public form URL payload
3. Also produce [`docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`](./GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md) with requirement → official capability → source → decision (not essays).
4. **Stop after Phase 0 docs** for human approval.
5. **Do not write any Phase 1+ feature code** without explicit human sign-off.

---

## 2. Required reading order (before any work)

1. This file  
2. [`UNICORN-Google-Forms-Integration-Specification-v3.md`](./UNICORN-Google-Forms-Integration-Specification-v3.md) — especially §§0–3, 7–8, 24–35, 50–69, 63  
3. [`.cursorrules`](../.cursorrules) — Universal KEY / immutable / write-time  
4. [`UNICORN FIRESTORE SYSTEM GUIDE.md`](../UNICORN%20FIRESTORE%20SYSTEM%20GUIDE.md)  
5. Existing code (inspect, do not rewrite casually):
   - [`web/src/types/index.ts`](../web/src/types/index.ts)
   - [`web/src/lib/firestore.ts`](../web/src/lib/firestore.ts)
   - [`web/src/lib/auth.ts`](../web/src/lib/auth.ts)
   - [`web/src/app/staff/submit/[templateId]/page.tsx`](../web/src/app/staff/submit/[templateId]/page.tsx)
   - [`web/src/app/leader/create/page.tsx`](../web/src/app/leader/create/page.tsx)
   - [`functions/src/index.ts`](../functions/src/index.ts) — especially Drive JWT / DWD pattern
   - [`firestore.rules`](../firestore.rules)

---

## 3. Current codebase reality (starting point)

| Area | Status |
|------|--------|
| Templates + Universal KEY fields | Exists |
| OptionSets + governance | Exists |
| Immutable submissions + `_correctFor` / supersede | Exists |
| Staff in-UNICORN submit UI | Exists — becomes obsolete as normal fill surface |
| Drive upload via service account + DWD | Exists — pattern to reuse for Forms auth research |
| Forms API / watches / Pub/Sub | **Missing** |
| Mapping Workspace | **Missing** |
| Answer Workspace (Google-origin) | **Missing** |
| Prefill / Copy & Resubmit via Google | **Missing** |
| Workspace Actions queue (Calendar/Email) | **Missing** as generic async Action system |
| Sheets export | UI mock only |

**Preserve:** OptionSets, Universal KEY model, submission immutability / correction chain ideas, Superuser governance, Drive JWT style of Google auth.

**Do not delete yet:** Staff submit UI / Leader template builder. Mark conceptually as “legacy fill surface”; retire only after Google Forms path is operational and product decision confirms cutover.

**Known debt to resolve during Phase 0 docs (not silent code churn):** KEY naming drift (`dateTimeStart` vs `startDateTime`, etc.), dual-write `values` + flat fields, fragmented allowlists (`developer` / `admin` / `superuser`).

---

## 4. Phase plan for Composer 2.5

### PHASE 0 — Concrete technical specification (docs only)  
**Status: FIRST AND MANDATORY**  
**Allowed outputs:** documentation only — no `web/src/types/google-forms.ts` file creation yet, no Functions, no UI  
**Forbidden:** any Phase 1+ feature code without explicit human sign-off

#### Rigid deliverable contract

[`GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md) MUST contain:

1. Exact path: `web/src/types/google-forms.ts` and the locked interfaces `GoogleFormConfig` + `UnicornGoogleSubmission` only  
2. Exact `googleapis` Forms SDK method signatures (`google.forms('v1')`; no `@googleapis/forms`)  
3. Exact Cloud Scheduler cron for 6-day `forms.watches.renew`  
4. Exact prefill `entry.XXXXXX` extraction regex/logic  

Plus [`GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`](./GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md) as a concrete capability matrix with official sources.

#### STOP GATE

After Phase 0:

- Commit docs only  
- **Stop**  
- Present for human approval  
- **Do not start Phase 1** until explicit sign-off  

---

### PHASE 1 — Read-only form import

**Goal:** UNICORN can understand an existing Google Form.

Implement:

- Superuser “Connect Google Form” (URL or ID)  
- Authorization check  
- Read-only import of structure: itemId, questionId, label, type, options, required  
- Persist connected-form metadata linked to UNICORN template/meaning layer (do not invent a second semantic model)

**Out of scope:** response ingest, Actions, destructive Google writes, Push Standardization.

**Acceptance:** Superuser can open a connected form and see accurate Google structure in UNICORN.

---

### PHASE 2 — Mapping engine (data + services)

Implement:

- `itemId` ↔ `questionId` resolution  
- `questionId` → item → UNICORN KEY  
- OptionSet + option mappings (governed; suggestions ≠ truth until confirmed)  
- Drift signals: label change, missing/unknown options, broken/orphan mappings  
- rawUnmapped policy for future ingest (design + types ready)

**Acceptance:** Superuser can normalize an existing form’s meaning without rebuilding it in UNICORN.

---

### PHASE 3 — Dual-panel Mapping Workspace UI

**Product surface priority: HIGH**

```text
Left:  Google Form reality
Right: UNICORN organizational meaning
```

Support mapping, search/filter, unresolved issues, suggestions + confirm, option mapping, Action dependency display (even if Actions execute later).

**Not a Form Builder.**

**Acceptance:** Mapping work is doable end-to-end in UI without spreadsheets.

---

### PHASE 4 — Analyze + Verify

Implement **Analyze Form** and **Verify Form** bird’s-eye:

- mapped / unmapped / broken / new / grey unmanaged  
- GREEN / YELLOW / RED / BLUE / GREY states  
- clickable issues → jump to mapping row  
- READY / NOT READY summary including Action dependencies when configured

**Acceptance:** Superuser knows form health in seconds.

---

### PHASE 5 — Standardization push

```text
Analyze → Preview → Confirm → Push → Verify
```

Push only governed changes (labels/options/required/Action-required questions as specified). Never silent overwrite. Preview diff required.

**Acceptance:** Confirmed push updates Google Form; unrelated presentation left alone; verify passes or lists remaining issues.

---

### PHASE 6 — Response ingestion

```text
Watch → Pub/Sub → fetch responses.get → resolve IDs → map → normalize → immutable submission → ack → queue Actions
```

Must include:

- deterministic ID (`formId` + `responseId`)  
- idempotency (duplicate events = one submission)  
- rawUnmapped preservation  
- watch create + scheduled renewal + health states  
- logging / retries without Sheets or Apps Script middleware  

**Acceptance:** Real Google submit appears once in `submissions` with Universal KEYs + snapshots; duplicate event does not duplicate docs.

---

### PHASE 7 — Answer Workspace

Show:

- source = Google Forms  
- standardized answers (label + KEY + canonical value)  
- current / superseded  
- history chain  
- compare  
- view original Google form/response (no false “edit” promise)  
- action history placeholders  

**Forbidden:** direct edit/save/submit of answers in UNICORN.

**Acceptance:** Users understand organizational meaning without reading raw Google labels.

---

### PHASE 8 — Prefill / Copy & Resubmit

Only after Phase 0 prefill decision is approved.

```text
Copy & Resubmit → prefilled Google Form → new responseId → new submission → supersedes previous
```

UI must state: prefill = new form with prior values; not editing historical response; files may need re-upload; abandon = no new version.

**Acceptance:** New version chain forms; original immutable; abandoned prefill changes nothing.

---

### PHASE 9 — Workspace Actions (generic + Calendar then Email)

- Persist submission first  
- Cloud Tasks workers  
- Per-version action state: Not Run / Pending / Completed / Failed / Skipped / Requires Confirmation  
- Calendar first, Email second  
- Do not implement complex resubmit action policies in MVP; leave extension points  

**Acceptance:** Action failure does not roll back submission; retry is independent.

---

### PHASE 10 — Governance & health

Drift detection, watch/access health, missing/unknown questions/options, type mismatches, Action dependency verification, operator-visible health.

**Acceptance:** Silent ingestion stop is impossible without UI/health signal.

---

## 5. Per-phase working method (Composer must follow)

For every phase after approval:

1. Re-read relevant v3 sections + this plan  
2. Inspect existing code for reuse  
3. State proposed file-level changes briefly  
4. Implement **smallest safe additive change**  
5. Test against that phase’s acceptance criteria  
6. Commit with a clear message  
7. Report: what changed, what was verified, remaining risks  
8. Stop if blocked by missing Google capability or human decision  

Do **not** implement multiple phases in one sweep unless explicitly instructed.

---

## 6. Testing checklist (minimum; expand per phase)

From v3 §61 — Composer must eventually cover:

| Case | Expected |
|------|----------|
| Move mapped question | Mapping still valid |
| Change question label | Mapping valid + Label Drift |
| Delete question | Broken mapping; history preserved |
| Add question | Unmapped / needs decision |
| Delete option | Missing governed option |
| Add option | Unknown option; raw preserved |
| Rename option | Drift; no history rewrite |
| Change question type | Contract-breaking warning |
| Duplicate Pub/Sub | One submission |
| Copy & Resubmit | New response + new submission + supersede |
| Open prefill, no submit | No version change |
| Action failure | Submission OK; action FAILED + retryable |

---

## 7. Priority order when tradeoffs appear

```text
1. Historical data integrity
2. Stable semantic mapping
3. Google-native capability
4. Security
5. Reliability
6. Low maintenance
7. Low cost
8. Administrative simplicity
9. User experience
10. Feature breadth
```

---

## 8. Explicit Do Not Build list

1. UNICORN public form renderer  
2. Second public fill route as normal path  
3. Google Forms clone  
4. Apps Script response triggers  
5. Google Sheets as ingest middleware  
6. Response polling loops (unless Phase 0 proves native watch impossible — then escalate, do not silently adopt)  
7. Technical keys inside public option labels  
8. Editable historical submissions  
9. Sync Gmail/Calendar/Drive inside Pub/Sub handler  
10. Custom auth for public respondents  
11. Auto-generated Firestore IDs for primary Google submissions  
12. Parsing answers from Pub/Sub body  
13. `questionId → KEY` without item relationship resolution  
14. Silent drop of unmapped answers  
15. Over-broad Drive scopes when Forms scopes suffice  

---

## 9. Suggested module boundaries (for later phases; do not create early)

Keep isolation clean when coding starts:

```text
functions/
  googleForms/client.ts          # Forms API wrapper
  googleForms/watches.ts         # create/renew/health
  googleForms/ingest.ts          # Pub/Sub handler + responses.get
  googleForms/normalize.ts       # questionId→item→KEY→OptionSet
  googleForms/prefill.ts         # ONE replaceable prefill service
  actions/queue.ts               # Cloud Tasks enqueue
  actions/workers/*              # calendar, email, ...

web/
  app/.../mapping-workspace/     # Superuser dual-panel
  app/.../answer-workspace/      # standardized answers + history
```

Exact paths may adapt to repo conventions; keep **prefill** and **ingest** isolated.

---

## 10. Immediate next action for Composer 2.5

```text
START PHASE 0 ONLY
→ inspect codebase
→ verify Google native capabilities with official sources
→ write:
   docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md
   docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md
→ commit
→ STOP and report for human review
→ DO NOT implement Phases 1–10 until approved
```

---

## 11. Definition of done for this planning package

- [x] v3 specification checked into `docs/`  
- [x] This Composer execution plan checked into `docs/`  
- [x] Rigid Phase 0 constraints acknowledged in §1.1  
- [x] `docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md` concrete technical spec  
- [x] `docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md` capability matrix  
- [x] Canonical runbook: `docs/COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`  
- [ ] Human assigns Composer to Runbook **PHASE 0 ONLY** (codebase audit)  
- [ ] Human sign-off to create `web/src/types/google-forms.ts` and start Phase 1  
- [ ] Then Composer proceeds phase-by-phase with stop reports  
