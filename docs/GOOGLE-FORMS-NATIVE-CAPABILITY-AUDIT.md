# Google Forms Native Capability Audit — Phase 0

**Builder execution order:** [`COMPOSER-2.5-LINE-BY-LINE-BUILDER.md`](./COMPOSER-2.5-LINE-BY-LINE-BUILDER.md)

**Status:** Phase 0 — awaiting human sign-off  
**Constraint:** Concrete matrix only. No feature code.  
**Architecture binding:** [`GOOGLE-FORMS-ARCHITECTURE-DECISION.md`](./GOOGLE-FORMS-ARCHITECTURE-DECISION.md)

Schema lock: only `GoogleFormConfig` and `UnicornGoogleSubmission` (path `web/src/types/google-forms.ts`).

---

## Capability matrix

| # | Requirement | Google native capability | Supported? | Official source | Recommended implementation | Risks / limitations |
|---|-------------|--------------------------|------------|-----------------|----------------------------|---------------------|
| 1 | Read form structure (items, labels, types, options, required) | `forms.get` | YES | https://developers.google.com/workspace/forms/api/reference/rest/v1/forms/get | Existing `googleapis` → `google.forms('v1').forms.get({ formId })` | Must map `itemId`/`questionId` carefully; structure differs by question type |
| 2 | Push governed label/option/required updates | `forms.batchUpdate` | YES | https://developers.google.com/workspace/forms/api/reference/rest/v1/forms/batchUpdate | `formsClient.forms.batchUpdate({ formId, requestBody })` with preview/confirm | Can overwrite presentation if request is too broad — push only governed diffs |
| 3 | Fetch authoritative response | `forms.responses.get` | YES | https://developers.google.com/workspace/forms/api/guides/retrieve-forms-responses | `formsClient.forms.responses.get({ formId, responseId })` | Answers keyed by `questionId`, not `itemId` |
| 4 | List responses (backfill/recovery) | `forms.responses.list` | YES | same guide | `formsClient.forms.responses.list({ formId, filter })` | Use for recovery, not primary ingest loop |
| 5 | Native response notifications | `forms.watches.create` + Pub/Sub | YES | https://developers.google.com/workspace/forms/api/guides/push-notifications | Watch `eventType: 'RESPONSES'` → topic `projects/unicorn-dcs/topics/unicorn-forms-responses` | Notification is metadata, not full answers |
| 6 | Renew watch before expiry | `forms.watches.renew` | YES | https://developers.google.com/workspace/forms/api/reference/rest/v1/forms.watches/renew | Scheduler job `unicorn-forms-watch-renew-6d` cron `0 3 */6 * *` Asia/Hong_Kong | TTL = 7 days; expired renew → `NOT_FOUND` → must recreate |
| 7 | Watch lifetime | 7 days from create/renew | YES | https://developers.google.com/workspace/forms/api/reference/rest/v1/forms.watches | Renew every 6 days | Silent stop if renewal fails |
| 8 | Pub/Sub contains full answers | — | NO | Push notifications guide | Always call `forms.responses.get` | Never parse answers from Pub/Sub body |
| 9 | Official prefill entry ids via Forms REST | — | NO | Forms API reference (no entry id field) | Isolated HTML extractor on `FB_PUBLIC_LOAD_DATA_` (see Architecture Decision §4) | Unofficial; HTML can change; file uploads not prefillable |
| 10 | Public prefill URL `entry.XXXXXX` | Product behavior (viewform query params) | PARTIAL (product, not API) | Google Forms product prefill links | `buildPrefillUrl(responderUri, entries)` | Not editable historical response; abandon = no version |
| 11 | Stable option semantic ids in Google Forms | — | NO | Forms API choice options are labels | Map label → OptionSet value inside `GoogleFormConfig.questionMappings[].optionMappings` | Label rename = drift |
| 12 | Service account owns Forms like a user | Forms ownership model | PARTIAL | Workspace / Forms auth guides | DWD impersonate dedicated Workspace owner (`IMPERSONATE_USER`) | Employee-owned forms break on offboarding |
| 13 | Narrow Forms scopes | `forms.body`, `forms.responses.readonly` | YES | forms.get / responses.get auth scopes | Prefer Forms scopes over broad Drive when sufficient | Watch create examples often show Drive scope — verify least privilege in Phase 1 |
| 14 | Apps Script onSubmit | Apps Script triggers | YES but FORBIDDEN | — | Do not use | Violates v3 architecture |
| 15 | Sheets middleware | Sheets API | YES but FORBIDDEN | — | Do not use for ingest | Dual truth / sync debt |
| 16 | Response polling loop | `responses.list` polling | POSSIBLE but FORBIDDEN as primary | — | Watch/Pub/Sub only | Cost, lag, complexity |
| 17 | Cloud Tasks for Actions | Cloud Tasks | YES | https://cloud.google.com/tasks/docs | Enqueue after ingest persist | Must not block Pub/Sub ack path for Action work |
| 18 | Cloud Scheduler | Cloud Scheduler HTTP + OIDC | YES | https://cloud.google.com/scheduler/docs | Exact job in Architecture Decision §3 | Cron `*/6` is day-of-month step, not rolling 144h — still required config |
| 19 | Firebase Functions v2 (asia-east1) | Cloud Functions | YES | Existing repo `functions/` | Keep ingest/renew in asia-east1 | Align SA permissions |
| 20 | Deterministic Firestore ids | Firestore `set`/`create` with known id | YES | Firestore docs | `` `${formId}_google_${responseId}` `` on `UnicornGoogleSubmission` | `addDoc` forbidden for primary Google ingest |

---

## Existing UNICORN reuse (codebase facts)

| Asset | Path | Phase 0 decision |
|-------|------|------------------|
| Drive JWT + DWD pattern | `functions/src/index.ts` `getDriveClient` | Reuse pattern for Forms JWT client |
| Universal KEY + OptionSets | `web/src/types/index.ts` | Keep; map into via `GoogleFormConfig.questionMappings` |
| Immutable correction chain | `_correctFor` / `supersedesSubmissionId` | Align with `UnicornGoogleSubmission.supersedesSubmissionId` |
| Staff submit UI | `web/src/app/staff/submit/[templateId]/page.tsx` | Do not delete in Phase 0–1; not normal path for connected Forms |
| `googleapis` package | `functions/package.json` | Keep for Drive **and** Forms (PO Option B). Do **not** add `@googleapis/forms` |

---

## Explicit non-goals until sign-off

- Do not create `web/src/types/google-forms.ts` yet (spec locked in Architecture Decision).
- Do not invent additional schema type names.
- Do not implement Mapping Workspace, ingest, prefill service, or Actions.

---

## Human decisions required before Phase 1

1. Approve schema lock: `GoogleFormConfig` + `UnicornGoogleSubmission` only.  
2. Approve Forms owner / `IMPERSONATE_USER` identity.  
3. Approve Pub/Sub topic name `projects/unicorn-dcs/topics/unicorn-forms-responses`.  
4. Approve unofficial prefill extractor approach (Architecture Decision §4).  
5. Explicit sign-off to begin Phase 1 (read-only `forms.get` import only).

**STOP after this audit + Architecture Decision. No Phase 1 code without sign-off.**
