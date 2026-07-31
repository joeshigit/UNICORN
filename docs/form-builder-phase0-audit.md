# PHASE 0 RESULT — Form Builder Template/Instance Law

Date: 2026-07-30  
Branch: `cursor/form-edit-three-frame-bd45`

## 1. FieldDefinition

| Property | Present |
|----------|---------|
| `key` | YES |
| `type` | YES |
| `label` / `helpText` / `required` | YES |
| `optionSetId` | YES |
| `yesNoAllowNa` | YES |
| `scalePoints` / `scaleValueLabels` | YES |
| `inputMode` / `presetValue` | YES |
| `templateId` / `sourceTemplateKey` / `semanticKey` | NO (do not add) |

## 2. OptionSet usage at fill/submit

`web/src/app/(console)/submit/page.tsx` loads options by `field.optionSetId` (getOptionSet by id).  
**Does NOT require** `optionSet.code === field.key` for answering.

## 3. Incompatible validation (form usage)

| Location | Check | Kind |
|----------|-------|------|
| `forms/edit/page.tsx` ~446 | `set.code !== field.key` → problem | **B Form usage → CHANGE** |
| `forms/edit/page.tsx` ~332 | locked standard rejects optionSetId if `set.code !== field.key` | **B Form usage → CHANGE** (bound standards: compare to standard.key / set code family) |
| `forms/edit/page.tsx` ~768 | `relevantSets = optionSets.filter(os => os.code === field.key)` | **B Form usage → CHANGE** (filter by bound set's code) |
| `keys.ts` `assertFieldMatchesStandard` ~307 | `optionSetCode !== field.key` | **B** when asserting registry bind → use `optionSetCode !== standard.key` |
| `keys.ts` `assertFieldMatchesStandard` ~288 | `field.key !== standard.key` | KEEP when asserting a **registry-bound** field (lookup by key). Template instances with a different KEY are not registry-bound by key; contract preserved via copied `optionSetId`/type. |
| `db.ts` `createStandardKey` ~333 | `set.code !== input.key` | **A Registry creation → KEEP** |

## 4. Classification

- **Registry creation:** KEEP (`standardKeys.key === optionSet.code` when creating optionSet-type standards; optionSet code uniqueness).
- **Form usage:** CHANGE — bind via `optionSetId`; allow `field.key !== optionSet.code`.

## 5. Query audit (representative)

| Pattern | Classification |
|---------|----------------|
| submit/buildSubmissionDoc uses `field.key` for payload | Form-local → keep KEY |
| submit loads options by `optionSetId` | Option-set → use optionSetId |
| data page keyChoices by optionSet code | Semantic/filter catalog → preserve; not form-instance KEY |
| `assertFieldMatchesStandard` key match | Registry bind when key equals standard |

No automatic reporting rewrite. Migration: **NO**.

## 6. Migration required?

**NO**

## 7. Smallest correction

1. Remove form-usage requirement that `optionSet.code === field.key` in the form builder.
2. Resolve option-set picker lists by the code of the optionSet referenced by `optionSetId` (or allow choosing any business master/subset when unbound).
3. In `assertFieldMatchesStandard` optionSet branch: require `optionSetCode === standard.key` (registry code), not `=== field.key`.
4. Keep `db.ts` createStandardKey registry equality.
5. Do not add `templateId` / `semanticKey` / `placeholder` / `yesNoLabels` for v1.

## Verdict

**GO: IMPLEMENT R14**
