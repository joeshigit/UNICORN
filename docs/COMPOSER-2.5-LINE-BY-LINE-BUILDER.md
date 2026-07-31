# UNICORN × Google Forms — Composer 2.5 Line-by-Line Construction Runbook v3

**Status:** Canonical builder runbook  
**Execution mode:** Sequential numbered steps. Inspect → modify → verify → report → STOP at every phase gate.

> **Purpose:** This document is the executable construction specification for Cursor / Composer 2.5.
>
> **Core architecture:** Google Forms is the public form runtime. UNICORN is the semantic mapping, normalization, governance, verification, answer workspace, versioning, and Workspace Action engine.
>
> **Execution rule:** Composer MUST NOT interpret this document as a high-level roadmap. It must execute the numbered instructions sequentially, inspect the existing repository before modifying it, run the specified verification after each step, and stop at every phase gate.

## Document hierarchy (read this first)

| Priority | Document | Role |
|----------|----------|------|
| 1 | **This file** | How to build — sequential construction law and phase gates |
| 2 | [`GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md) | Locked technical contracts (schema, SDK signatures, Scheduler cron, prefill regex) |
| 3 | [`GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md`](./GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md) | Capability matrix with official sources |
| 4 | [`UNICORN-Google-Forms-Integration-Specification-v3.md`](./UNICORN-Google-Forms-Integration-Specification-v3.md) | Full product/architecture background |

When wording differs:

1. **Product / process / order / gates** → this Runbook wins.
2. **Concrete locked contracts** (only two schema interfaces; exact `@googleapis/forms` signatures; Scheduler `0 3 */6 * *` Asia/Hong_Kong; `FB_PUBLIC_LOAD_DATA_` regex) → Architecture Decision wins.
3. **Prefer extend over replace** → this Runbook §1.03 wins for existing UNICORN systems; still do not invent new Google schema type names.

## Schema lock (from Architecture Decision — do not violate)

- Only schema exports allowed for Google Forms integration:
  - `GoogleFormConfig`
  - `UnicornGoogleSubmission`
- Exact path when created (after Phase 1 sign-off): `web/src/types/google-forms.ts`
- Do not invent parallel schema types (`GoogleQuestionKey`, `PrefillMap`, etc.).
- Prefer extending existing UNICORN systems (templates, OptionSets, submissions, auth) over replacements.
- Concrete SDK / Scheduler / prefill contracts: see [`GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md).

## First command (human → Composer)

> Execute **PHASE 0 ONLY**: create `docs/GOOGLE-FORMS-CODEBASE-AUDIT.md`. No integration code. Stop and provide the Phase Report.

---

# 0. NON-NEGOTIABLE ARCHITECTURE

## 0.1 Product boundary

The system has exactly two major responsibilities:

### Google Forms

Google Forms owns:

* public form rendering
* question display
* question ordering
* respondent interaction
* required/optional interaction
* Google Forms response submission
* public form URL
* Google Forms accessibility/mobile experience
* file upload UI
* normal Google Forms presentation

### UNICORN

UNICORN owns:

* Google Form connection
* question identity mapping
* Universal KEY mapping
* OptionSet mapping
* standardized answer interpretation
* mapping analysis
* schema comparison
* drift detection
* standardization push
* verification
* immutable standardized submissions
* answer history
* version chains
* Copy & Resubmit
* Workspace Actions
* operational status
* organizational reporting

### Absolute boundary

**UNICORN MUST NOT become another public form renderer.**

Do not build:

* a second public form UI
* a UNICORN answer submission form
* an "edit and submit" answer page
* a custom replacement for Google Forms question rendering

---

# 1. FIRST EXECUTION RULE — INSPECT BEFORE CODING

Before writing any code:

### 1.01

Inspect the repository structure.

Use repository search to locate:

* existing form builder
* existing templates
* existing Universal KEY system
* existing OptionSet system
* existing `standardKeys`
* existing submission model
* existing Firestore helpers
* existing Firebase Functions
* existing Google authentication
* existing Workspace integration
* existing admin/superuser authorization
* existing UI components
* existing action system

### 1.02

Search for existing implementations of:

```text
Google Forms
forms.get
forms.batchUpdate
googleapis
OAuth
Firebase Functions
Pub/Sub
Cloud Tasks
Calendar
Gmail
Drive
standardKeys
optionSets
submissions
templates
FIXED_KEYS
```

### 1.03

Do NOT create replacement systems if an equivalent system already exists.

If an existing implementation can support this architecture:

> extend it.

Do not create:

```text
newUniversalKeySystem
newOptionSetSystem
newSubmissionSystem
newAuthSystem
newWorkspaceActionSystem
```

just because the new integration needs them.

### 1.04

Write an audit report before implementation:

```text
docs/GOOGLE-FORMS-CODEBASE-AUDIT.md
```

The report must contain:

1. existing relevant files
2. existing reusable components
3. existing Firestore structures
4. existing authentication model
5. existing Workspace integration
6. existing submission model
7. files that must be extended
8. files that should NOT be changed
9. architectural conflicts discovered

### 1.05 STOP CONDITION

Do not begin Phase 1 until the audit exists.

---

# 2. READ ARCHITECTURE DOCUMENTS

Composer MUST read:

```text
docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md
docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md
docs/UNICORN-Google-Forms-Integration-Specification-v3.md
```

If any file does not exist:

**STOP.**

Do not invent the missing specification.

---

# 3. ARCHITECTURAL IDENTITIES

The following identities are mandatory.

## 3.1 Question identity

Google Form:

```text
Google itemId
    ↓
Google questionId
    ↓
UNICORN Universal KEY
```

The primary mapping anchor is the **Google Form item identity**, not question order and not question wording.

A question may be moved or its visible label may change without automatically breaking its semantic mapping.

---

# 4. OPTION IDENTITY

This is a critical design rule.

Google Forms does not provide a persistent semantic option ID equivalent to the UNICORN OptionSet key.

Therefore:

### Google Forms displays

```text
香島中學
```

### UNICORN internally understands

```text
OptionSet:
  sch_xiangdao
```

The public Google Form MUST NOT display:

```text
香島中學（sch_xiangdao）
```

Technical keys must never leak into the respondent-facing form.

---

# 5. OPTION MAPPING CONTRACT

Every standardized Google choice must have:

```text
Google visible label
        ↓
UNICORN OptionSet
        ↓
UNICORN standard value/key
```

Example:

```text
Google:
香島中學

UNICORN:
OptionSet = schools
Value = sch_xiangdao
```

## 5.1 Exact matching

When analyzing a Google Form:

1. retrieve current Google option labels
2. compare them with the approved UNICORN option labels
3. identify exact matches
4. identify missing options
5. identify unexpected options
6. identify changed labels

## 5.2 Drift

If Google contains:

```text
香島中學（澳門）
```

but UNICORN expects:

```text
香島中學
```

do NOT silently create a new standard value.

Mark:

```text
OPTION_DRIFT
```

and preserve the raw incoming value.

---

# 6. SOURCE OF TRUTH RULE

Use this hierarchy:

### Google Forms is authoritative for:

* actual public form appearance
* actual question order
* actual question labels
* actual respondent-facing choices
* actual responses

### UNICORN is authoritative for:

* semantic KEY
* standard meaning
* OptionSet identity
* approved standardized values
* mapping relationship
* organizational interpretation
* governance state

Therefore neither side completely replaces the other.

This is why the mapping UI must be dual-panel.

---

# 7. PHASE 1 — CREATE GOOGLE FORM CONNECTION

## 1.1 Create or extend the Google Form configuration type

First inspect existing types.

If no appropriate type exists, create:

```text
web/src/types/google-forms.ts
```

It must represent at minimum:

```text
Google Form identity
connection status
source form information
question mappings
option mappings
approved schema snapshot
watch status
prefill mapping
last analysis
last verification
```

Locked contract: implement as `GoogleFormConfig` (+ `UnicornGoogleSubmission` for ingest later) exactly as defined in `docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md`. Do not invent additional exported schema types.

Do not create duplicate types if an existing form configuration model can be extended.

---

## 1.2 Install Google Forms SDK

Inspect:

```text
functions/package.json
```

If Google Forms SDK is absent, install the currently supported official package (`@googleapis/forms`).

Do NOT blindly install an old version from this document.

Verify the current compatible version first.

---

## 1.3 Create Google Forms client

Extend/create:

```text
functions/src/googleForms/client.ts
```

The client must:

1. authenticate using the organization's existing Google Workspace authentication architecture
2. use least-privilege scopes
3. retrieve the Google Forms API client
4. centralize Google Forms API calls

Do not duplicate authentication logic elsewhere.

Exact method signatures: see Architecture Decision §2.

---

# 8. PHASE 2 — CONNECT EXISTING GOOGLE FORM

Create/extend:

```text
connectGoogleForm()
```

Input:

```text
Google Form URL or Form ID
```

Execution:

### 2.1

Extract Form ID.

### 2.2

Call:

```text
forms.get(formId)
```

### 2.3

Read:

* form title
* form description
* items
* item IDs
* question IDs
* question types
* labels
* choices
* required state
* section structure where available

### 2.4

Create a draft UNICORN mapping.

Every question initially has:

```text
mappingStatus = UNMAPPED
```

unless an existing known mapping can be safely reused.

### 2.5

Do not modify the Google Form yet.

### 2.6

Display imported form in UNICORN.

---

# 9. PHASE 2 GATE

Verify:

* [ ] Form can be connected.
* [ ] Form structure can be read.
* [ ] Google item IDs are stored.
* [ ] Question IDs are stored.
* [ ] Existing labels are preserved.
* [ ] Existing choices are preserved.
* [ ] No Google Form content has been modified.
* [ ] Existing UNICORN forms still work.

STOP.

Report:

```text
Files created
Files modified
API calls tested
Firestore records created
Tests passed
Known problems
```

---

# 10. PHASE 3 — DUAL-PANEL MAPPING UI

Create/extend the admin mapping page.

Preferred location:

```text
web/src/app/admin/google-forms/[formId]/mapping/page.tsx
```

If an existing admin route already performs this function, extend it instead.

---

## 10.1 LEFT PANEL — GOOGLE REALITY

Display:

```text
Question number
Google itemId
Google label
Google question type
Google required state
Google options
Current Google state
Drift state
```

This panel represents:

> "What Google Forms actually contains right now."

---

# 11. RIGHT PANEL — UNICORN MEANING

Display:

```text
Universal KEY
Standard question meaning
OptionSet
Standard values
Mapping status
Approved state
```

This panel represents:

> "What this question means to the organization."

---

# 12. QUESTION MAPPING

For each Google item:

Composer must implement controls to:

1. select a Universal KEY
2. show the standardized question meaning
3. save the relationship
4. prevent duplicate KEY usage within the same form where the architecture requires uniqueness
5. show unmapped status
6. show broken mapping status

Mapping:

```text
Google itemId
      ↓
Universal KEY
```

Do not use:

```text
question order
label string
array index
```

as the permanent identity.

---

# 13. OPTION MAPPING UI

For every choice question:

Display two columns:

```text
Google Choice              UNICORN Standard
------------------------------------------------
香島中學                    sch_xiangdao
菜農子弟學校                sch_cnc
海星中學                    sch_haihing
```

The user must be able to:

* map an existing option
* detect missing options
* detect unexpected options
* detect changed labels
* see standard value
* see Google visible label

---

# 14. OPTION MAPPING RULE

Do NOT automatically approve fuzzy matches.

Allowed:

```text
exact match → suggest
```

Not allowed:

```text
similar-looking text → silently approve
```

Human confirmation is required when ambiguity exists.

---

# 15. PHASE 3 GATE

Verify:

* [ ] Question mappings save.
* [ ] itemId remains the anchor.
* [ ] Options map to OptionSet values.
* [ ] Technical keys are not displayed in public Google Form.
* [ ] Duplicate semantic mappings are prevented or explicitly warned.
* [ ] Drift states are visible.
* [ ] Mapping survives question reordering in Google Forms.

STOP.

---

# 16. PHASE 4 — ANALYZE ENGINE

Implement:

```text
Analyze Form
```

This must be a one-click operation.

When clicked:

### Step 1

Fetch current Google Form.

### Step 2

Compare against UNICORN mapping.

### Step 3

Compare against approved schema snapshot.

### Step 4

Produce diagnostics.

At minimum:

```text
READY
WARNING
ERROR
```

---

# 17. ANALYZE QUESTIONS

Detect:

```text
NEW_ITEM
MISSING_ITEM
MAPPED
UNMAPPED
LABEL_CHANGED
TYPE_CHANGED
REQUIREDNESS_CHANGED
ITEM_REORDERED
```

Question movement alone must NOT be an error.

---

# 18. ANALYZE OPTIONS

Detect:

```text
OPTION_MATCHED
OPTION_MISSING
OPTION_ADDED
OPTION_DRIFT
OPTION_UNMAPPED
```

Never silently discard an unknown option.

---

# 19. ANALYZE RESULT

The UI should provide a bird's-eye summary:

```text
Form: Application Form

Questions
✓ 12 mapped
⚠ 1 label changed
✗ 1 unmapped

Options
✓ 27 matched
⚠ 2 changed
✗ 1 missing

Overall:
WARNING
```

---

# 20. PHASE 4 GATE

Verify that one click:

```text
Analyze
```

can identify:

* broken question mapping
* missing question
* new question
* changed type
* changed option
* missing option
* unexpected option

STOP.

---

# 21. PHASE 5 — PUSH STANDARDIZATION

This is the second critical one-click workflow.

Button:

```text
Push Standardization
```

Before execution, show a diff.

Example:

```text
Google Form
BEFORE:
香島中學

UNICORN STANDARD:
香島中學
No change
```

or:

```text
Google Form
BEFORE:
香島中學（澳門）

UNICORN STANDARD:
香島中學

Action:
Replace Google choice label
```

---

# 22. PUSH RULES

UNICORN may push:

* standardized question labels where explicitly approved
* standardized choices
* requiredness where part of the semantic contract
* standardized descriptions/help text where explicitly governed

UNICORN must NOT unexpectedly overwrite:

* theme
* visual formatting
* unrelated descriptions
* presentation elements
* unrelated questions
* administrator customizations

---

# 23. PUSH EXECUTION

Before calling Google Forms update:

1. generate diff
2. display diff
3. require confirmation
4. execute update
5. re-fetch Google Form
6. analyze again
7. create/update approved snapshot
8. display final verification

---

# 24. ONE-CLICK VERIFY

The UI must support:

```text
Analyze
↓
Push Standardization
↓
Verify
```

Verify must re-read Google Forms rather than trusting the previous write operation.

---

# 25. PHASE 5 GATE

Must demonstrate:

```text
Google Form
      ↓
Analyze
      ↓
Mapping issues shown
      ↓
Push
      ↓
Google Form updated
      ↓
Verify
      ↓
READY
```

STOP.

---

# 26. PHASE 6 — PREFILL TECHNICAL POC

Do this BEFORE building Copy & Resubmit.

Create:

```text
functions/src/googleForms/prefillEntryExtractor.ts
```

The extractor must:

1. retrieve the public Google Form page
2. inspect the publicly exposed form metadata
3. identify the appropriate prefill parameter mapping
4. associate the parameter with the corresponding Google question
5. store the mapping only if it can be reliably established

Do not assume the internal HTML structure is permanent.

Use the exact regex/logic in Architecture Decision §4 (`FB_PUBLIC_LOAD_DATA_`). Isolate parsing in this one file only.

The implementation must have:

```text
success
unsupported
parse failure
```

states.

---

# 27. PREFILL POC TEST

Use a dedicated test form containing:

```text
short text
paragraph
multiple choice
dropdown
checkbox
date
```

Test each type separately.

Generate a prefilled URL.

Open it in browser.

Verify that expected fields are populated.

If Google changes its public HTML structure and extraction fails:

**do not silently generate a broken URL.**

Return:

```text
PREFILL_UNAVAILABLE
```

---

# 28. PHASE 6 GATE

Do not proceed until:

* [ ] Prefill works for supported field types.
* [ ] Unsupported types are explicitly identified.
* [ ] Failed extraction does not produce a fake prefilled URL.
* [ ] Existing form submission remains unaffected.

STOP.

---

# 29. PHASE 7 — RESPONSE INGESTION

Now implement native Google Forms response ingestion.

Preferred architecture:

```text
Google Forms
     ↓
Google Forms Watch
     ↓
Google Cloud Pub/Sub
     ↓
Firebase Function
     ↓
forms.responses.get()
     ↓
Normalize
     ↓
Firestore
     ↓
Cloud Tasks
```

---

# 30. PUB/SUB RULE

The notification is NOT the authoritative answer payload.

Composer MUST NOT assume:

```text
event.data.answers
```

contains the submitted answers.

Instead:

1. receive notification metadata
2. identify form
3. identify response where available from the notification contract
4. call:

```text
forms.responses.get()
```

5. use returned response as authoritative source

---

# 31. RESPONSE NORMALIZATION

Create/extend:

```text
functions/src/googleForms/normalize.ts
```

The normalization pipeline must resolve:

```text
Google response questionId
        ↓
Google itemId
        ↓
UNICORN Universal KEY
        ↓
OptionSet
        ↓
Standard value
```

Write shape: `UnicornGoogleSubmission` with deterministic id (Architecture Decision §1 / §5).

---

# 32. RAW FALLBACK

If a response cannot be mapped:

DO NOT reject the entire submission.

Store:

```text
rawUnmapped
```

with enough information to diagnose:

```text
Google item/question identity
raw label
raw answer
reason
```

The original response must never be lost merely because normalization failed.

---

# 33. DETERMINISTIC SUBMISSION ID

Use:

```text
${googleFormId}_google_${googleResponseId}
```

as the deterministic submission identity.

Do NOT use:

```text
addDoc()
```

or another random ID as the primary Google submission identity.

---

# 34. IDEMPOTENCY

If Google/Pub/Sub delivers the same response twice:

```text
same formId
+
same responseId
=
same UNICORN submission
```

No duplicate submission may be created.

---

# 35. INGESTION ORDER

The ingestion function MUST perform operations in this conceptual order:

```text
1. Receive notification
2. Extract event metadata
3. Fetch authoritative Google response
4. Load UNICORN mapping
5. Normalize answers
6. Preserve raw unmapped answers
7. Write deterministic submission
8. Record ingestion status
9. Enqueue Workspace Actions
10. Return successful acknowledgement
```

---

# 36. ACTION ISOLATION

Do NOT perform:

```text
Gmail API
Calendar API
Drive API
```

inside the core response ingestion path.

Instead:

```text
Submission saved
      ↓
Cloud Tasks
      ↓
Action Worker
```

If Calendar fails:

```text
submission = SUCCESS
calendar action = FAILED
```

The action failure must not destroy the submission.

---

# 37. PHASE 7 GATE

Test:

1. submit Google Form
2. receive notification
3. fetch response
4. normalize response
5. write submission
6. repeat event
7. verify no duplicate
8. create unmapped option
9. verify rawUnmapped
10. verify action queue

STOP.

---

# 38. PHASE 8 — WATCH MANAGEMENT

Implement:

```text
create watch
renew watch
disable watch
watch health
watch failure
```

Do not assume watches are permanent.

The renewal mechanism must use a reliable scheduled mechanism appropriate to the current Google Forms API contract.

Default locked config (verify current API still 7-day TTL before changing):

```bash
gcloud scheduler jobs create http unicorn-forms-watch-renew-6d \
  --project=unicorn-dcs \
  --location=asia-east1 \
  --schedule="0 3 */6 * *" \
  --time-zone="Asia/Hong_Kong" \
  --uri="https://asia-east1-unicorn-dcs.cloudfunctions.net/renewGoogleFormWatches" \
  --http-method=POST \
  --oidc-service-account-email="unicorn-scheduler@unicorn-dcs.iam.gserviceaccount.com" \
  --oidc-token-audience="https://asia-east1-unicorn-dcs.cloudfunctions.net/renewGoogleFormWatches"
```

Do not hard-code an obsolete renewal interval without verifying the current API behavior.

---

# 39. WATCH HEALTH

Every connected form should expose:

```text
CONNECTED
WATCH_HEALTHY
WATCH_EXPIRING
WATCH_RENEWAL_FAILED
FORM_ACCESS_ERROR
DISCONNECTED
```

(Also map to `GoogleFormConfig.watchHealth` values in Architecture Decision when persisting.)

Admin must be able to see:

```text
Last successful watch renewal
Next expected renewal
Last successful response ingestion
Last error
```

---

# 40. PHASE 8 GATE

Simulate:

```text
watch expires
renewal succeeds
renewal fails
form access revoked
```

Verify each state appears correctly.

STOP.

---

# 41. PHASE 9 — ANSWER WORKSPACE

Create or extend:

```text
web/src/app/staff/answers/page.tsx
web/src/app/staff/answers/[submissionId]/page.tsx
```

But FIRST inspect existing answer/submission pages.

Reuse existing components.

---

# 42. ANSWER WORKSPACE MUST SHOW

Each answer should clearly show:

```text
Source:
Google Form

Submission:
Google response

Submitted:
date/time

Standardized meaning:
UNICORN interpretation

Original answer:
actual Google response

Standard value:
UNICORN standard value

Status:
Current / Superseded
```

---

# 43. NO DIRECT EDIT

There must be no:

```text
Edit Answer
Save Answer
Submit Answer
```

inside the UNICORN answer workspace.

Instead use:

```text
Copy & Resubmit
```

---

# 44. COPY & RESUBMIT

Flow:

```text
UNICORN Answer
       ↓
Copy & Resubmit
       ↓
Generate prefilled Google Form
       ↓
User edits in Google Forms
       ↓
User submits
       ↓
Google generates new response
       ↓
UNICORN receives new response
       ↓
UNICORN creates new standardized record
```

---

# 45. VERSIONING

Old record:

```text
v1
```

New record:

```text
v2
```

Relationship:

```text
v2 supersedes v1
```

Never overwrite v1.

---

# 46. VERSION CHAIN

Display:

```text
v1
 ↓
v2
 ↓
v3 CURRENT
```

Each version must retain:

* original submission
* timestamp
* source response ID
* standardization result
* actions performed
* supersession relationship

---

# 47. PHASE 9 GATE

Verify:

* [ ] User can view standardized answer.
* [ ] User can view original answer.
* [ ] User can open source Google Form.
* [ ] User cannot edit historical answer in UNICORN.
* [ ] Copy & Resubmit works.
* [ ] New submission creates a new record.
* [ ] Previous record remains unchanged.
* [ ] Version chain displays correctly.

STOP.

---

# 48. PHASE 10 — WORKSPACE ACTIONS

Actions may include questions OR may not.

Do not force every Action to have a question.

Action examples:

```text
Calendar
EmailTo
Create Document
Drive
Notification
```

---

# 49. CALENDAR ACTION

A Calendar action may introduce standardized questions:

```text
gAct_calendar
gActCal_dateTimeStart
gActCal_dateTimeEnd
gActCal_eventTitle
```

The mapping engine must understand that these are **action-related standardized fields**, not necessarily ordinary user questions.

---

# 50. EMAIL ACTION

Example:

```text
EmailTo
```

may:

* use a hidden forwarding destination
* read recipient from action configuration
* read subject from standardized answer data
* read body from submission data
* attach generated documents
* notify internal staff

The respondent does not necessarily need to know the destination.

---

# 51. ACTION MODEL

Every action must define:

```text
Action type
Trigger condition
Required standardized inputs
Optional standardized inputs
Destination/configuration
Execution policy
Retry policy
Result status
```

---

# 52. ACTION EXECUTION

Use:

```text
Submission
   ↓
Action eligibility
   ↓
Cloud Tasks
   ↓
Worker
   ↓
Execution
   ↓
Action Result
```

Never make action execution part of submission normalization.

---

# 53. ACTION IDEMPOTENCY

A resubmission must NOT silently repeat an old action.

Each action execution must be associated with:

```text
specific submission version
```

Therefore:

```text
v1 Calendar Event
```

and:

```text
v2 Calendar Event
```

are separate execution decisions.

The system must never assume:

> "new version = automatically repeat every action."

The action policy determines this.

---

# 54. PHASE 10 GATE

Test:

```text
Google Form
→ submission
→ normalized answer
→ Calendar Action queued
→ Calendar worker
→ execution result
```

Then submit a corrected version.

Verify that the previous action is NOT silently duplicated.

STOP.

---

# 55. PHASE 11 — BIRD'S-EYE VERIFICATION

This is the final governance view.

Create a one-click:

```text
Verify Form
```

The result should summarize:

```text
FORM
✓ Connected

QUESTIONS
✓ 15 mapped
⚠ 1 label drift
✗ 0 unmapped

OPTIONS
✓ 42 standardized
⚠ 2 drift
✗ 0 missing

ACTIONS
✓ Calendar configured
✓ Email configured

INGESTION
✓ Watch healthy
✓ Last response received

RESULT:
READY
```

---

# 56. FINAL REGRESSION TEST

Composer must test all of these:

### Question

* [ ] move question
* [ ] rename question
* [ ] delete question
* [ ] add question
* [ ] change type

### Option

* [ ] rename option
* [ ] remove option
* [ ] add option
* [ ] add unknown option

### Response

* [ ] normal submission
* [ ] duplicate event
* [ ] unmapped answer
* [ ] missing mapping

### Resubmission

* [ ] create prefilled form
* [ ] edit answer
* [ ] submit
* [ ] verify new response ID
* [ ] verify new UNICORN version
* [ ] verify old version unchanged

### Actions

* [ ] Calendar
* [ ] Email
* [ ] action failure
* [ ] retry
* [ ] resubmission does not silently duplicate action

---

# 57. FINAL ARCHITECTURAL ACCEPTANCE TEST

The implementation is NOT complete until the following statement is demonstrably true:

```text
Google Forms
    ↓
collects the user's actual response

Google item identity
    ↓
anchors question mapping

UNICORN mapping
    ↓
translates Google meaning into organizational meaning

OptionSet
    ↓
translates human choice into standardized organizational value

Firestore
    ↓
stores immutable standardized submission

Answer Workspace
    ↓
allows people to understand, compare and manage versions

Copy & Resubmit
    ↓
returns the user to Google Forms

Google Forms
    ↓
creates the new response

UNICORN
    ↓
creates the new version

Workspace Actions
    ↓
operate against a specific submission version
```

---

# 58. STRICT COMPOSER EXECUTION PROTOCOL

Composer must execute:

```text
PHASE 0
→ STOP
→ report

PHASE 1
→ STOP
→ report

PHASE 2
→ STOP
→ report

...

PHASE 11
→ STOP
→ report
```

Do NOT implement all phases in one generation.

At every phase:

1. inspect
2. modify
3. test
4. verify
5. report
6. stop

---

# 59. REQUIRED PHASE REPORT

At the end of every phase, output:

```text
PHASE:
STATUS:

FILES CREATED:
-

FILES MODIFIED:
-

FILES NOT MODIFIED:
-

FUNCTIONS ADDED:
-

FUNCTIONS EXTENDED:
-

TESTS RUN:
-

TEST RESULTS:
-

FIRESTORE CHANGES:
-

GOOGLE API CALLS VERIFIED:
-

KNOWN LIMITATIONS:
-

ARCHITECTURAL DEVIATIONS:
-

NEXT PHASE:
```

If an architectural deviation is required:

**STOP and ask for human approval.**

---

# 60. ABSOLUTE STOP CONDITIONS

Composer MUST stop immediately if:

1. an existing system conflicts with this specification
2. Google API behavior differs from the assumption
3. a required Google Forms capability is unavailable
4. prefill extraction cannot reliably work
5. item identity cannot be reliably mapped
6. an existing Firestore schema must be destructively changed
7. existing forms would be broken
8. authentication architecture must be replaced
9. an action could duplicate silently
10. historical submissions would need to be modified

Do not work around these silently.

Report the problem.

---

# 61. FIRST COMMAND TO COMPOSER

Do NOT ask Composer to build the entire system.

The first instruction must be:

> Read this entire runbook and all referenced architecture documents.
>
> Execute **PHASE 0 ONLY**.
>
> Do not implement Google Forms integration yet.
>
> Audit the existing UNICORN repository, identify reusable systems, identify conflicts, and create `docs/GOOGLE-FORMS-CODEBASE-AUDIT.md`.
>
> Do not create new architecture merely because this document specifies a preferred file path.
>
> Do not modify production behavior.
>
> Stop after Phase 0 and provide the required Phase Report.

---

# 62. SECOND COMMAND

Only after human approval:

> Execute **PHASE 1 ONLY**.
>
> Implement the read-only Google Form connection.
>
> Do not implement mapping UI.
>
> Do not implement Pub/Sub.
>
> Do not implement response ingestion.
>
> Do not implement Workspace Actions.
>
> Do not modify the existing public form system.
>
> Stop at the Phase 1 Gate and provide the required Phase Report.

---

# 63. THIRD COMMAND

After approval:

> Execute **PHASE 1.5 / PREFILL POC ONLY**.
>
> Prove whether Copy & Resubmit can reliably generate a working Google Forms prefilled URL for the supported question types.
>
> Do not proceed to Answer Workspace.
>
> Stop after the Prefill Gate and report exact supported and unsupported cases.

---

# 64. OPERATING PRINCIPLE

The implementation must always preserve this product philosophy:

> **Google Forms collects.**
>
> **UNICORN understands.**
>
> **UNICORN standardizes.**
>
> **UNICORN verifies.**
>
> **UNICORN remembers.**
>
> **UNICORN acts.**
>
> **Google Forms remains the place where people submit.**
>
> **UNICORN never becomes the second form engine.**
