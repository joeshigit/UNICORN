/**
 * UNICORN × Google Forms — locked schema contracts.
 * Only these two exported interfaces may exist in this file.
 *
 * Phase 1: used for draft googleFormConfigs/{googleFormId} only.
 * No KEY migration. unicornKey stays empty until mapping phases.
 */

/** Connected Google Form + mapping + watch + prefill contract (Meaning/Template layer). */
export interface GoogleFormConfig {
  /** Firestore doc id (recommended: same as googleFormId). */
  id: string

  /** Google Forms resource id (from forms.get). */
  googleFormId: string

  /** Google Form title from forms.get info.title */
  title: string

  /** Public responder URL (viewform). */
  responderUri: string

  /** Linked UNICORN template id (existing templates/{id}). Empty string if not supplied in Phase 1. */
  templateId: string

  /** Operational readiness after Verify. Phase 1 always DRAFT (no watch / ingest). */
  operationalStatus: 'DRAFT' | 'READY' | 'ERROR' | 'DISCONNECTED'

  /** Watch / ingest health. Phase 1: DISCONNECTED. */
  watchHealth:
    | 'CONNECTED'
    | 'SYNCING'
    | 'WARNING'
    | 'ERROR'
    | 'DISCONNECTED'
    | 'ACCESS_ERROR'
    | 'WATCH_RENEWAL_ERROR'

  /** forms.watches.create result. Phase 1: always null. */
  watch: {
    watchId: string
    topicName: string
    eventType: 'RESPONSES'
    expireTime: string
    state: 'ACTIVE' | 'SUSPENDED' | 'STATE_UNSPECIFIED'
  } | null

  /**
   * Question mapping: Google identity → UNICORN Universal KEY.
   * Identity is itemId + questionId (never order/label alone).
   * Phase 1: mappingStatus is always UNMAPPED; unicornKey is ''.
   */
  questionMappings: Array<{
    itemId: string
    questionId: string
    googleLabel: string
    googleQuestionType: string
    unicornKey: string
    requiredOnGoogle: boolean
    mappingStatus: 'MAPPED' | 'UNMAPPED' | 'BROKEN' | 'LABEL_DRIFT' | 'UNMANAGED'
    optionSetId?: string
    optionMappings?: Array<{
      googleOptionLabel: string
      unicornOptionValue: string
      confirmed: boolean
      confidence?: number
    }>
    /** Prefill entry id extracted from public page (not Forms REST). Phase 1: unused. */
    prefillEntryId?: string
  }>

  /** Snapshot of last successful Analyze/Verify. Phase 1: unused. */
  lastVerify?: {
    at: string
    ready: boolean
    mappedQuestions: number
    totalQuestions: number
    unknownOptions: number
    brokenMappings: number
  }

  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

/**
 * Immutable Google-originated submission written at ingest time.
 * Defined for architecture lock. NOT written in Phase 1.
 * Firestore doc id MUST be deterministic: `${googleFormId}_google_${googleResponseId}`
 */
export interface UnicornGoogleSubmission {
  id: string

  source: 'GOOGLE_FORM'
  googleFormId: string
  googleResponseId: string
  googleFormConfigId: string

  _templateId: string
  _templateModule: string
  _templateAction: string
  _templateVersion: number
  _submitterId: string
  _submitterEmail: string
  _submittedAt: string
  _submittedMonth: string
  _status: 'ACTIVE' | 'CANCELLED' | 'LOCKED'
  _fieldLabels: Record<string, string>
  _optionLabels?: Record<string, string>

  /** Flat Universal KEY → standardized VALUE (write-time). */
  answers: Record<string, unknown>

  /**
   * Answers that could not be mapped at ingest.
   * Never drop; preserve for Superuser repair.
   */
  rawUnmapped: Array<{
    questionId: string
    itemId?: string
    googleLabel?: string
    rawValue: unknown
    reason: 'NO_QUESTION_MAPPING' | 'NO_OPTION_MAPPING' | 'TYPE_MISMATCH' | 'OTHER'
  }>

  /** Version chain (Copy & Resubmit). */
  supersedesSubmissionId?: string
  supersededBySubmissionId?: string
  isCurrent: boolean

  /** Copy-intent token if this response came from a prefill resubmit. */
  copyFromSubmissionId?: string

  files: Array<{
    fieldKey: string
    driveFileId: string
    name: string
    mimeType: string
    size: number
    webViewLink: string
  }>

  _correctFor?: string
  _isLocked?: boolean
}
