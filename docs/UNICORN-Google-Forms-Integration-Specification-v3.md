# UNICORN × Google Forms

## Cursor AI Builder — Consolidated Implementation Specification v3

**Status:** Implementation specification
**Purpose:** Guide Cursor AI through analysis, architecture validation, and phased implementation of Google Forms integration into the existing UNICORN system.

---

# 0. EXECUTIVE ARCHITECTURAL DECISION

The most important decision in this specification is:

> **UNICORN is no longer a general-purpose form builder. Google Forms is the form builder and the normal form-filling/submission interface. UNICORN is the organizational semantic, mapping, normalization, verification, answer-workspace, versioning, and Workspace Action engine around Google Forms.**

Do not rebuild Google Forms inside UNICORN.

Do not create a second public form runtime.

Do not create a second normal form-submission channel.

Instead:

```text
                    GOOGLE WORKSPACE
                          │
                          ▼
                  ┌───────────────┐
                  │ Google Forms  │
                  │               │
                  │ Create        │
                  │ Design        │
                  │ Present       │
                  │ Collect       │
                  └───────┬───────┘
                          │
                    Native event
                          │
                          ▼
                 Google Cloud / Firebase
                          │
                          ▼
                  ┌───────────────┐
                  │   UNICORN     │
                  │               │
                  │ Map           │
                  │ Standardize   │
                  │ Verify        │
                  │ Normalize     │
                  │ Understand    │
                  │ History       │
                  │ Resubmit      │
                  │ Actions       │
                  └───────────────┘
```

The final product should feel like:

> **Google Forms + UNICORN organizational intelligence + UNICORN Answer Workspace**

not:

> **Google Forms rebuilt inside UNICORN.**

---

# 1. PRODUCT PHILOSOPHY

## 1.1 The fundamental division of responsibility

### Google Forms owns

* Form creation
* Form layout
* Form formatting
* Sections
* Question ordering
* Public presentation
* Respondent interaction
* Mobile presentation
* Accessibility
* Normal form submission
* Google-native respondent features
* File upload behavior
* Existing public URLs
* Existing QR codes and distribution assets

### UNICORN owns

* Organizational meaning
* Standard Questions
* Universal KEYs
* Standardized values
* OptionSets
* Option mappings
* Question mappings
* Form analysis
* Standardization
* Validation
* Drift detection
* Response normalization
* Immutable answer history
* Version chains
* Comparison
* Copy & Resubmit workflow
* Workspace Actions
* Action history
* Organizational Answer Workspace

---

# 2. CORE PHILOSOPHY

Do not rebuild what Google Forms already does well.

Instead:

> **Google Forms collects information. UNICORN gives that information organizational meaning.**

The architecture must maintain a clean separation:

```text
Google Forms
    ↓
Raw organizational input
    ↓
UNICORN mapping
    ↓
UNICORN standardized meaning
    ↓
UNICORN Answer Workspace
    ↓
History / Resubmission / Actions
```

---

# 3. EXISTING UNICORN ARCHITECTURE MUST BE PRESERVED

This integration must build on the existing UNICORN architecture rather than creating a parallel semantic system.

Preserve the existing principles:

* Universal KEY
* Standard Keys
* OptionSets
* standardized answer values
* single submission pool
* immutable submissions
* write-time normalization
* historical truth
* role-based governance

Do not create a separate "Google Forms semantic model."

Google Forms is simply another external form surface connected to UNICORN's existing semantic model.

---

# 4. FORM CREATION MODEL

There are two conceptual sides.

## 4.1 Prototype

A manager, Superuser, or authorized user may create the initial Google Form prototype directly in Google Forms.

They can use Google's native Form Builder.

They do not need to construct it inside UNICORN.

Example:

```text
Google Form Prototype

Question:
請選擇你的學校

Options:
香島中學
菜農子弟學校
海星中學
```

At this stage, the form may not yet be standardized.

---

# 5. FORM NORMALIZATION

The Superuser connects the Google Form to UNICORN.

The workflow is:

```text
Google Form Prototype
        ↓
Connect
        ↓
Import
        ↓
Analyze
        ↓
Map
        ↓
Normalize
        ↓
Push Standardization
        ↓
Verify
        ↓
Operational
```

UNICORN does not replace the form.

UNICORN governs its semantic meaning.

---

# 6. CONNECTING AN EXISTING GOOGLE FORM

Superuser selects:

> Connect Google Form

and enters the Google Form URL or ID.

UNICORN should then:

1. identify the form
2. verify authorization
3. retrieve the form structure
4. retrieve all relevant items
5. retrieve questions
6. retrieve labels
7. retrieve question types
8. retrieve options
9. retrieve required states where supported
10. identify stable Google question/item identities
11. display the form inside the Mapping Workspace

The first import should be **read-only**.

Do not immediately overwrite the user's Google Form.

---

# 7. GOOGLE FORM QUESTION IDENTITY

This is a critical architectural rule.

Do NOT identify a question using:

* Question 1
* Question 2
* question order
* section position
* display label alone

Use Google's stable item/question identity.

The conceptual relationship is:

```text
Google Form itemId
        ↓
Google questionId
        ↓
UNICORN Question KEY
        ↓
Organizational Meaning
```

Example:

```text
Google itemId:
abc123

Google questionId:
xyz789

Google label:
請選擇你的學校

UNICORN KEY:
school

Organizational meaning:
學校
```

The exact API relationship must be implemented according to the current Google Forms API response structure.

---

# 8. IMPORTANT QUESTION MAPPING RULE

The mapping engine must account for the distinction between:

* `itemId`
* `questionId`

Do not assume they are interchangeable.

Gemini's technical guidance requires a two-tier lookup:

```text
itemId
   ↓
questionId
   ↓
UNICORN KEY
```

Incoming response answers may be indexed by `questionId`.

Therefore the normalization engine must be able to resolve:

```text
incoming questionId
        ↓
associated Google item
        ↓
mapped UNICORN KEY
```

Do not map responses solely by label.

Do not map responses solely by position.

---

# 9. QUESTION MOVEMENT

If a question moves:

```text
Before:
Question 1

After:
Question 8
```

the mapping should remain valid because position is not the identity.

Expected result:

```text
Mapping:
VALID
```

---

# 10. QUESTION LABEL CHANGE

If Google Form changes:

```text
請選擇你的學校
```

to:

```text
就讀學校
```

the stable question identity should allow UNICORN to continue mapping the question.

However, UNICORN should detect this as:

> Label Drift

and show it to the Superuser.

The system should distinguish:

```text
Identity unchanged
+
Presentation changed
```

from:

```text
Identity broken
```

---

# 11. QUESTION DELETION

If the Google Form item disappears:

```text
Google itemId:
abc123

No longer exists
```

UNICORN must detect:

> Orphaned / Broken Mapping

The system must not silently delete the corresponding UNICORN semantic definition or historical submission data.

---

# 12. OPTION STANDARDIZATION

Options are one of the most important parts of this architecture.

Google Forms does not provide a suitable persistent semantic ID for individual choice options.

Therefore do not pretend that Google option choices have their own stable native identifiers.

Instead:

```text
Google visible label
        ↓
UNICORN mapping
        ↓
OptionSet
        ↓
Standard Option KEY
        ↓
Standard Value
```

Example:

```text
Google Form:
香島中學

UNICORN:
OptionSet = schools
Standard KEY = sch_xiangdao
```

---

# 13. NEVER EXPOSE TECHNICAL OPTION KEYS

Do NOT make the public option:

```text
香島中學（sch_xiangdao）
```

The public respondent should see only:

```text
香島中學
```

UNICORN stores the organizational meaning separately.

This preserves:

* clean UX
* localization
* multilingual capability
* label changes
* organizational abstraction
* separation of display text from semantic identity

---

# 14. OPTION MAPPING STRATEGY

Use exact governed mapping where possible.

Example:

```text
Google label:
香島中學

UNICORN:
OptionSet:
schools

Standard KEY:
sch_xiangdao
```

Text matching may be used to **suggest** a mapping.

Example:

```text
Google:
香島中學

Suggested:
sch_xiangdao
Confidence:
98%
```

But automatic text matching must not be treated as unquestionable semantic truth.

A Superuser should be able to confirm the semantic relationship.

Once confirmed, UNICORN should use the governed mapping rather than continuously guessing.

---

# 15. OPTION DRIFT DETECTION

The system must detect:

### Missing standard option

UNICORN expects:

```text
sch_xiangdao
```

but Google Form no longer contains the corresponding option.

### Unknown option

Google contains:

```text
某新學校
```

but UNICORN has no recognized mapping.

### Changed option label

A Google administrator changes:

```text
香島中學
```

to:

```text
香島
```

The system must flag the change rather than silently assuming semantic identity.

### Duplicate semantic options

Two Google options may map to the same UNICORN standard value.

This should be detected.

---

# 16. RAW UNMAPPED FALLBACK

Never discard an incoming answer merely because UNICORN cannot map it.

If:

```text
Google answer:
某新學校
```

cannot be mapped, preserve it as raw/unmapped information.

Conceptually:

```text
Standardized answer
+
rawUnmapped
```

This guarantees:

> **No data loss simply because the external Google Form has drifted.**

The submission should still be preserved and flagged for administrative repair.

---

# 17. MAPPING WORKSPACE

This should become one of the most important UNICORN interfaces.

It is NOT a Form Builder.

It is a:

> **Semantic Mapping Workspace**

Use a dual-panel design.

```text
┌──────────────────────────────┬────────────────────────────────┐
│ GOOGLE FORM                  │ UNICORN                        │
│                              │                                │
│ Question                     │ Standard Meaning               │
│                              │                                │
│ 請選擇你的學校                │ KEY: school                    │
│                              │ Meaning: 學校                  │
│ Item ID: abc123              │ Type: Standard Question        │
│                              │                                │
│ OPTIONS                      │ OPTIONSET: schools             │
│ ○ 香島中學                   │                                │
│ ○ 菜農子弟學校               │ sch_xiangdao                   │
│                              │ sch_cainong                    │
└──────────────────────────────┴────────────────────────────────┘
```

---

# 18. ONE-CLICK MAPPING ANALYSIS

The Superuser should be able to click:

> Analyze Form

The Mapping Analysis Engine should compare:

```text
Google Form
        VS
UNICORN Standard Model
```

and identify:

* mapped questions
* unmapped questions
* broken mappings
* deleted questions
* new questions
* changed labels
* question type conflicts
* missing options
* unknown options
* duplicate options
* OptionSet mismatches
* required-state differences
* Workspace Action dependencies
* other contract-breaking differences

---

# 19. ANALYSIS STATUS

Use clear visual states.

### GREEN

Valid / mapped.

### YELLOW

Warning / review recommended.

### RED

Broken / incompatible.

### BLUE

New / not yet standardized.

### GREY

Intentionally unmanaged.

Every warning should be clickable and take the Superuser directly to the affected mapping.

---

# 20. ONE-CLICK BIRD'S-EYE VERIFICATION

Provide:

> Verify Form

Example:

```text
FORM STATUS

Questions                  18 / 18 ✓
Question mappings          18 / 18 ✓
Standard options           43 / 43 ✓
Unknown options             0    ✓
Broken mappings             0    ✓
Workspace Actions           3 / 3 ✓

Response contract          VALID ✓

READY
```

If invalid:

```text
NOT READY

2 questions require mapping
1 option is unrecognized
1 Action dependency is missing
```

Each issue must be clickable.

The Superuser should be able to understand the health of a form in seconds.

---

# 21. PUSH STANDARDIZATION

Provide one primary action:

> Push Standardization

Workflow:

```text
Analyze
   ↓
Review
   ↓
Preview
   ↓
Confirm
   ↓
Push
   ↓
Verify
```

UNICORN may push governed changes such as:

* standardized question labels
* help text where governed
* required state where governed
* standardized OptionSet labels
* standardized question structures
* questions required by Workspace Actions

Do not blindly rewrite unrelated Google Form presentation.

---

# 22. PUSH PREVIEW

Before writing to Google Forms, display:

```text
GOOGLE FORM CURRENT
        ↓
UNICORN STANDARD TARGET
```

Example:

```text
Question

Current:
您的學校？

Target:
就讀學校


Option

Current:
香島中學

Target:
香島中學

No change


Option

Missing:
菜農子弟學校

Action:
Add
```

Superuser must explicitly confirm the push.

Never silently overwrite Google Forms.

---

# 23. MANUAL GOOGLE FORM EDITING

The architecture must support a controlled dual-world model.

Google Forms remains useful for normal visual editing.

UNICORN remains the semantic authority.

Manual Google Form changes should therefore be classified.

### Presentation-only change

Example:

* theme
* formatting
* layout
* section movement
* question movement

→ Normally acceptable.

### Semantic drift

Example:

* label changed
* option changed
* required state changed
* question type changed

→ Warning / review.

### Broken contract

Example:

* governed question deleted
* required Action question deleted
* incompatible question type

→ Error requiring repair.

---

# 24. RESPONSE EVENT ARCHITECTURE

Use Google Forms native event notifications where supported.

Target:

```text
Google Form
      ↓
Google Forms Watch
      ↓
Google Cloud Pub/Sub
      ↓
Firebase Function / Cloud Run
      ↓
Fetch complete response
      ↓
Normalize
      ↓
Firestore
```

Do NOT use:

* Apps Script triggers
* Google Sheets as middleware
* response polling loops

unless technical verification proves the native architecture cannot satisfy the requirement.

---

# 25. PUB/SUB HARD RULES

These are non-negotiable implementation constraints.

## MUST NOT

Do NOT expect complete answer data in the Pub/Sub event.

The notification contains event metadata, not the complete respondent answer payload.

## MUST

When an event arrives:

```text
Pub/Sub event
   ↓
formId
responseId / event context
   ↓
forms.responses.get
   ↓
authoritative response
```

Use the official Google Forms API SDK where appropriate.

---

# 26. RESPONSE INGESTION

The ingestion pipeline should be:

```text
Google Form Submission
        ↓
Pub/Sub notification
        ↓
Identify Form + Response
        ↓
Fetch authoritative response
        ↓
Resolve questionId
        ↓
Resolve parent itemId
        ↓
Resolve UNICORN Question KEY
        ↓
Resolve OptionSet mapping
        ↓
Normalize
        ↓
Write immutable submission
        ↓
Queue Actions
```

---

# 27. FIRESTORE IDEMPOTENCY

Never use an auto-generated Firestore document ID for a Google Form submission.

Do NOT use:

```typescript
addDoc(...)
```

for the primary submission record.

Use a deterministic identity based on:

```text
formId + responseId
```

Conceptually:

```text
submissions/{formId}_google_{responseId}
```

This ensures:

```text
Pub/Sub delivery #1
        ↓
Submission A

Pub/Sub delivery #2
        ↓
Same Submission A
```

instead of:

```text
Submission A
Submission B
```

---

# 28. IMPORTANT: IDEMPOTENCY IS NOT VERSIONING

Do not confuse:

### Duplicate event

Same:

```text
formId
+
responseId
```

→ same submission.

### Resubmission

New:

```text
responseId
```

→ new submission/version.

These are completely different cases.

---

# 29. IMMUTABLE SUBMISSION

After ingestion and normalization:

> The standardized submission is frozen.

Do not silently recalculate historical submissions when:

* OptionSets change
* mappings change
* labels change
* Google Forms change
* administrators repair mappings

Historical truth must remain intact.

---

# 30. ANSWER WORKSPACE

UNICORN should become the organizational Answer Workspace.

A user should see something like:

```text
SOURCE
Google Forms

SUBMISSION
2026-07-31

STATUS
Current

STANDARDIZED ANSWERS

學校
香島中學

文件類型
合約

...

ACTIONS

Email
Completed

Calendar
Completed

HISTORY

Original
   ↓
Correction
   ↓
Current
```

The user should understand the organizational meaning without needing to interpret raw Google Form labels.

---

# 31. UNICORN MUST NOT BECOME A SECOND SUBMISSION CHANNEL

Do NOT create:

> Edit Submission

Do NOT create:

> Save Answer

Do NOT allow direct modification and submission from the Answer Workspace.

The Answer Workspace is for:

* reading
* understanding
* checking
* comparing
* history
* actions
* correction workflow

not normal form entry.

---

# 32. COPY & RESUBMIT

The correction mechanism is:

> Copy & Resubmit

Workflow:

```text
UNICORN Answer Workspace
        ↓
Copy & Resubmit
        ↓
Generate prefilled Google Form
        ↓
Open Google Form
        ↓
User edits
        ↓
User submits
        ↓
Google creates NEW responseId
        ↓
UNICORN receives new response
        ↓
UNICORN creates NEW immutable submission
        ↓
New submission supersedes previous version
```

The original submission remains untouched.

---

# 33. PREFILL LINK ARCHITECTURE

Google Forms public prefill URLs use parameters such as:

```text
entry.123456
```

These IDs are not exposed in the normal Forms REST API response in the same manner as the question/item identifiers.

Therefore the implementation must investigate a prefill mapping mechanism during the technical foundation phase.

The proposed approach is:

```text
Public Google Form
        ↓
Fetch public form page
        ↓
Extract supported public prefill identifiers
        ↓
Map questionId → entry.XXXXXX
        ↓
Store prefill mapping
```

Potentially this may involve Google's rendered page data such as:

```text
FB_PUBLIC_LOAD_DATA_
```

However:

> **Do not treat this internal page structure as a guaranteed stable Google API contract.**

Before production implementation, verify:

1. whether Google provides a supported native prefill mechanism;
2. whether the public page structure remains stable;
3. whether the extraction works for all required question types;
4. whether it works after form edits;
5. whether multilingual labels cause problems;
6. whether file upload questions can be prefilled;
7. whether the method remains compatible with current Google Forms behavior.

If an official supported mechanism exists, use it instead.

If not, isolate this mechanism behind one replaceable service.

Do not spread HTML parsing logic throughout UNICORN.

---

# 34. PREFILL LIMITATIONS

The Answer Workspace must clearly explain:

> **Prefill opens a new form containing previous values. It does not edit the historical Google response.**

Users should also be warned that some data types, particularly file uploads, may not be transferable through prefill and may require a new upload.

If a prefilled form is opened but never submitted:

> No new version exists.

The original remains current.

---

# 35. VERSION CHAIN

Support:

```text
Submission A
      ↓ superseded by
Submission B
      ↓ superseded by
Submission C
```

A/B/C remain immutable.

Only C is the current effective version.

The user must be able to see:

* who submitted
* when
* previous version
* current version
* what changed
* why it was superseded where available

---

# 36. CURRENT TRUTH VIEW

Normal Answer Workspace lists should default to:

> Current effective version

History should be expandable.

Do not make historical and current versions visually indistinguishable.

---

# 37. WORKSPACE ACTIONS

Workspace Actions are a first-class part of the UNICORN architecture.

Examples include:

* Calendar
* Email
* Drive
* Document generation
* future Google Workspace actions

Actions may:

### Require questions

Example:

```text
gAct_calendar

gActCal_dateTimeStart
gActCal_dateTimeEnd
gActCal_eventTitle
```

These standardized questions can be inserted into a Google Form by UNICORN.

### Or require no respondent-visible question

Example:

```text
emailTo
```

The Superuser can configure a forwarding destination internally.

The respondent does not need to see the internal routing.

---

# 38. ACTION QUESTIONS

A Workspace Action can declare required standardized questions.

Example:

```text
Calendar Action
        ↓
Requires

gActCal_dateTimeStart
gActCal_dateTimeEnd
gActCal_eventTitle
```

The Mapping / Verification Engine must detect whether those questions exist and are correctly mapped.

If missing:

```text
Calendar Action
NOT READY
```

This should appear in the bird's-eye verification.

---

# 39. ACTION EXECUTION

Do NOT execute Gmail, Calendar, Drive, or other long-running Workspace operations directly inside the Pub/Sub response handler.

Use:

```text
Response Ingestion
        ↓
Persist submission
        ↓
Acknowledge event
        ↓
Cloud Tasks
        ↓
Action Worker
        ↓
Gmail / Calendar / Drive
```

Cloud Tasks is the preferred mechanism based on the current architecture review, subject to verifying the current Google-native best practice during Phase 0.

Benefits:

* retries
* rate limiting
* failure isolation
* independent execution
* action-level logging

---

# 40. PUB/SUB ACKNOWLEDGEMENT RULE

Do not interpret:

> "return 200 quickly"

as:

> "acknowledge before saving the submission."

The correct rule is:

```text
Receive event
   ↓
Fetch authoritative response
   ↓
Normalize
   ↓
Persist submission successfully
   ↓
Only then acknowledge successful processing
   ↓
Queue downstream actions
```

The authoritative submission must be safely persisted before successful acknowledgement.

Do not allow downstream Gmail/Calendar failures to cause the response ingestion itself to fail.

---

# 41. ACTION VERSIONING

Actions must be tied to a specific answer version.

Example:

```text
Submission A
    ↓
Calendar created
    ↓
Email sent
```

Later:

```text
Submission B
```

must not silently repeat or overwrite the previous actions.

Each action should have an independent state, for example:

```text
Not Run
Pending
Completed
Failed
Skipped
Requires Confirmation
```

Do not implement complex resubmission action policies in MVP, but architect the Action system so they can be added later.

---

# 42. SECURITY

Public respondents interact only with Google Forms.

They should not require:

* UNICORN accounts
* Firebase Auth
* Firestore access
* direct UNICORN API access

UNICORN administrators use authenticated Google Workspace identity.

---

# 43. GOOGLE AUTHORIZATION

Before implementing production authorization, verify the current Google Workspace requirements for:

* OAuth
* service accounts
* Domain-Wide Delegation
* Forms API scopes
* Shared Drive ownership
* Workspace organizational ownership

Do not assume a service account can own or operate a Google Form exactly like a normal Workspace user.

Production form ownership should be designed to avoid employee offboarding breaking the system.

Investigate the best current approach, potentially involving:

* dedicated Workspace account
* appropriate Shared Drive configuration
* appropriate delegated authorization

Document the final decision.

---

# 44. CREDENTIAL SECURITY

Never:

* hardcode private keys
* commit credentials
* store service account JSON in source code
* put long-lived secrets in ordinary environment configuration unnecessarily

Use Google Cloud Secret Manager where secrets are required.

Use the narrowest practical Google OAuth scopes.

Do not request full Drive access when Forms-specific scopes are sufficient.

Verify current required scopes against official Google documentation.

---

# 45. WATCH MANAGEMENT

Google Forms watch subscriptions have a limited lifetime.

The production architecture must automatically renew active watches.

Implement:

```text
Connected Form
       ↓
Watch created
       ↓
Watch expiration tracked
       ↓
Scheduled renewal
       ↓
Watch renewed
```

Also detect:

* renewal failure
* authorization failure
* deleted form
* inaccessible form
* invalid watch

The system must not silently stop receiving responses.

Use an appropriate scheduled Google Cloud mechanism.

The architecture review proposes a daily renewal process.

---

# 46. WATCH HEALTH

Each connected form should have a health state conceptually such as:

```text
CONNECTED
SYNCING
WARNING
ERROR
DISCONNECTED
ACCESS_ERROR
WATCH_RENEWAL_ERROR
```

The UI should make it obvious when response ingestion is no longer healthy.

---

# 47. FORM DRIFT DETECTION

The system must be able to detect:

### Question moved

No problem.

### Question label changed

Warning.

### Question deleted

Broken mapping.

### New question added

Needs mapping / intentionally unmanaged.

### Question type changed

Potential contract-breaking change.

### Option deleted

Missing standard option.

### Option added

Unknown option.

### Option renamed

Drift.

### OptionSet changed in UNICORN

Google Form may require standardization push.

---

# 48. DO NOT AUTOMATICALLY DESTROY DATA DURING DRIFT

If the Google Form changes unexpectedly:

Do not:

* delete historical answers
* rewrite historical semantic meanings
* silently remap old records
* discard unknown answers

Instead:

```text
Detect
 ↓
Preserve
 ↓
Flag
 ↓
Allow Superuser repair
```

---

# 49. FORM OWNERSHIP MODEL

The architecture should protect against:

> "The employee who created the form left the organization."

Research the current Google Workspace best practice for production form ownership.

The final system should make production Forms resilient to employee turnover.

Document the chosen ownership model before implementing production deployment.

---

# 50. PHASE 0 — NATIVE CAPABILITY AUDIT

This phase must happen before significant implementation.

Cursor must investigate current official Google capabilities for:

* Google Forms REST API
* `forms.get`
* `forms.batchUpdate`
* `forms.responses.get`
* `forms.watches.create`
* `forms.watches.renew`
* Pub/Sub event structure
* watch lifetime
* authorization requirements
* Forms API scopes
* prefilled form behavior
* prefill identifiers
* Workspace ownership
* Shared Drive compatibility
* Firebase Functions v2
* Cloud Run
* Cloud Tasks
* Cloud Scheduler

Create:

```text
docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md
docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md
```

For every important feature, record:

```text
Requirement
Google native capability
Supported?
Official source
Recommended implementation
Risks / limitations
```

Do not rely on assumptions.

Do not implement speculative Google API behavior.

### STOP CONDITION

After Phase 0, stop and report the findings before continuing to production implementation.

---

# 51. PHASE 1 — READ-ONLY FORM IMPORT

Implement:

```text
Connect Form
      ↓
Read Google Form
      ↓
Display:
- itemId
- questionId
- label
- type
- options
- required state
```

No response ingestion.

No Actions.

No destructive writes.

Success condition:

> UNICORN can reliably understand an existing Google Form.

---

# 52. PHASE 2 — MAPPING ENGINE

Implement:

* Google item → question mapping
* questionId → itemId resolution
* UNICORN KEY mapping
* OptionSet mapping
* option mapping
* mapping suggestions
* mapping confidence
* manual confirmation
* drift detection

Success condition:

> Superuser can normalize an existing Google Form without rebuilding it.

---

# 53. PHASE 3 — DUAL-PANEL MAPPING WORKSPACE

Implement the main mapping UI.

Left:

> Google Form reality

Right:

> UNICORN organizational meaning

Support:

* side-by-side comparison
* mapping
* search
* filtering
* unresolved issues
* one-click suggestions
* manual confirmation
* option mapping
* standard question insertion
* Action dependency display

This is one of the most important product surfaces in UNICORN.

---

# 54. PHASE 4 — ANALYZE + VERIFY

Implement:

> Analyze Form

and:

> Verify Form

The system must provide a bird's-eye summary.

The Superuser should not have to manually inspect every question just to know whether the form is ready.

---

# 55. PHASE 5 — STANDARDIZATION PUSH

Implement:

```text
Analyze
 ↓
Preview
 ↓
Confirm
 ↓
Push
 ↓
Verify
```

Push only governed changes.

Do not overwrite unrelated presentation.

---

# 56. PHASE 6 — RESPONSE INGESTION

Implement:

```text
Google Forms
 ↓
Native Forms Watch
 ↓
Pub/Sub
 ↓
Firebase Function / Cloud Run
 ↓
Fetch response
 ↓
questionId → itemId → UNICORN KEY
 ↓
Option mapping
 ↓
Normalization
 ↓
Immutable Firestore submission
```

Implement:

* deterministic submission identity
* idempotency
* rawUnmapped
* error handling
* retry handling
* logging
* watch renewal

---

# 57. PHASE 7 — ANSWER WORKSPACE

Implement:

* standardized answer display
* source information
* current/superseded status
* version history
* comparison
* original source navigation
* Copy & Resubmit
* action history

Do NOT implement direct editing/submission.

---

# 58. PHASE 8 — PREFILL / COPY & RESUBMIT

Implement only after the Phase 0 technical verification has confirmed the appropriate mechanism.

Support:

```text
Current answer
      ↓
Copy & Resubmit
      ↓
Prefilled Google Form
      ↓
User edits
      ↓
New Google response
      ↓
New UNICORN version
```

Old submission remains immutable.

---

# 59. PHASE 9 — WORKSPACE ACTIONS

Create a generic Action infrastructure.

Then implement:

### First

Calendar

### Second

Email

### Later

Drive / Docs / other Workspace capabilities.

Actions must be asynchronous and independently retryable.

---

# 60. PHASE 10 — GOVERNANCE & HEALTH

Implement:

* drift detection
* missing question detection
* unknown question detection
* missing option detection
* unknown option detection
* type mismatch detection
* watch health
* access health
* form deletion/access failure detection
* action dependency verification

---

# 61. TESTING REQUIREMENTS

Create test Google Forms and verify all of the following.

## Question movement

Move a mapped question.

Expected:

```text
Mapping remains valid.
```

## Question label change

Change:

```text
請選擇你的學校
```

to:

```text
就讀學校
```

Expected:

```text
Mapping remains valid.
Label Drift warning.
```

## Question deletion

Expected:

```text
Broken mapping.
Historical data preserved.
```

## New question

Expected:

```text
Unmapped question.
```

## Option deletion

Expected:

```text
Missing governed option.
```

## New option

Expected:

```text
Unknown option.
Submission preserved.
rawUnmapped populated.
Admin warning.
```

## Option label change

Expected:

```text
Mapping drift.
No historical destruction.
```

## Question type change

Expected:

```text
Contract-breaking warning.
```

## Duplicate Pub/Sub event

Expected:

```text
One submission only.
```

## Copy & Resubmit

Expected:

```text
New Google responseId.
New UNICORN submission.
Previous submission unchanged.
Version relationship created.
```

## Open prefill but do not submit

Expected:

```text
No new submission.
No version change.
```

## Workspace Action failure

Expected:

```text
Submission remains valid.
Action is marked FAILED.
Action can retry independently.
```

---

# 62. DATA INTEGRITY PRIORITIES

When choosing between two implementation approaches, use this order:

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

# 63. DO NOT BUILD

Do NOT build:

1. A UNICORN public form rendering engine.
2. A second public form-filling route.
3. A Google Forms clone.
4. Apps Script response triggers.
5. Google Sheets as middleware.
6. Polling loops for form responses.
7. Technical keys inside public option labels.
8. Editable historical submissions.
9. Synchronous Workspace Actions inside ingestion.
10. Custom authentication for public respondents.
11. Auto-generated Firestore IDs for primary Google submissions.
12. Response parsing from Pub/Sub payload.
13. Direct `questionId → KEY` assumptions without resolving the item relationship.
14. Silent dropping of unmapped answers.
15. Broad Google Drive permissions when narrower permissions are sufficient.

---

# 64. CURSOR DEVELOPMENT METHOD

Do not implement the whole system in one pass.

For each phase:

```text
1. Inspect the existing UNICORN codebase.
2. Identify existing reusable components.
3. Identify existing data structures that should be preserved.
4. Explain the proposed changes.
5. Implement the smallest safe change.
6. Run tests.
7. Verify against the acceptance criteria.
8. Report what changed.
9. Identify remaining risks.
10. Continue only after the phase is stable.
```

Do not perform broad refactoring simply because a cleaner architecture is possible.

Prefer additive changes.

Protect existing UNICORN functionality.

---

# 65. EXISTING CODEBASE PROTECTION

Before changing anything:

Inspect:

* existing Form Builder code
* existing templates
* standardKeys
* OptionSets
* submissions
* Firestore rules
* authentication
* Superuser permissions
* existing Google Workspace integration
* existing Firebase Functions
* existing UI components

Determine what can be retired, what can be reused, and what should remain.

Do not delete the existing Form Builder immediately.

First determine:

> Which parts become obsolete, which parts become the Google Forms Mapping Workspace, and which parts remain useful for internal semantic configuration.

---

# 66. IMPORTANT: DO NOT CREATE A NEW SEMANTIC SYSTEM

The Google Forms integration must reuse the existing UNICORN concepts.

Do not create:

```text
GoogleQuestionKey
GoogleOptionKey
GoogleStandardKey
```

if an equivalent existing UNICORN concept already exists.

Use the existing semantic architecture wherever possible.

---

# 67. FINAL PRODUCT FLOW

The intended final user experience is:

```text
1. Manager creates Google Form
            ↓
2. Superuser connects Form to UNICORN
            ↓
3. UNICORN imports Google structure
            ↓
4. Mapping Analysis Engine runs
            ↓
5. Dual-panel Mapping Workspace
            ↓
6. Superuser maps questions
            ↓
7. Superuser maps OptionSets
            ↓
8. Superuser adds required Workspace Actions
            ↓
9. One-click Push Standardization
            ↓
10. One-click Verify
            ↓
11. Form becomes operational
            ↓
12. Public users submit through Google Forms
            ↓
13. Google sends native event
            ↓
14. UNICORN fetches authoritative response
            ↓
15. UNICORN normalizes answer
            ↓
16. Immutable standardized submission created
            ↓
17. Answer appears in Answer Workspace
            ↓
18. User can inspect / compare / audit
            ↓
19. If correction needed:
       Copy & Resubmit
            ↓
20. User returns to Google Forms
            ↓
21. New Google response
            ↓
22. New UNICORN version
            ↓
23. Previous version remains immutable
            ↓
24. Workspace Actions operate on specific version
```

---

# 68. FINAL ARCHITECTURAL DEFINITION

The final system should be understood as four layers:

```text
┌──────────────────────────────────────────┐
│ 1. GOOGLE FORM                           │
│                                          │
│ Build / Design / Present / Collect       │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ 2. UNICORN MAPPING ENGINE                │
│                                          │
│ itemId / questionId                      │
│        ↓                                 │
│ UNICORN KEY                              │
│        ↓                                 │
│ OptionSet / Standard Value               │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ 3. UNICORN ANSWER WORKSPACE              │
│                                          │
│ Understand / Verify / Compare / History  │
│ Copy & Resubmit                          │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ 4. UNICORN WORKSPACE ACTIONS             │
│                                          │
│ Email / Calendar / Drive / Documents     │
└──────────────────────────────────────────┘
```

The architectural boundary is:

> **Google Forms owns collection. UNICORN owns meaning.**

The historical boundary is:

> **A submitted response is immutable. Correction means a new submission.**

The semantic boundary is:

> **Google labels are presentation; UNICORN KEYs and OptionSets are organizational meaning.**

The identity boundary is:

> **Question identity comes from Google's stable item/question identity, not position or label.**

The operational boundary is:

> **Ingestion must be reliable and idempotent; Workspace Actions must be asynchronous and independently retryable.**

The product boundary is:

> **UNICORN is not another form builder. It is the intelligence layer and Answer Workspace around Google Forms.**

---

# 69. FIRST INSTRUCTION TO CURSOR

Before writing production code, perform **PHASE 0 ONLY**.

Do not implement the integration yet.

Inspect the existing UNICORN codebase and produce:

1. Current architecture relevant to Forms.
2. Current semantic model.
3. Existing Form Builder components that can be reused or retired.
4. Current Firebase Functions architecture.
5. Current authentication/authorization model.
6. Current submission model.
7. Current OptionSet / Standard Key model.
8. Google Forms native capability verification.
9. Pub/Sub/watch feasibility.
10. Prefill feasibility.
11. Workspace authorization feasibility.
12. Cloud Tasks feasibility.
13. Recommended final architecture.
14. Risks and unresolved questions.
15. Proposed implementation phases.

Create/update:

```text
docs/GOOGLE-FORMS-NATIVE-CAPABILITY-AUDIT.md
docs/GOOGLE-FORMS-ARCHITECTURE-DECISION.md
```

**Do not make production code changes until this Phase 0 review is complete.**

After completing Phase 0, stop and present the findings for review.
