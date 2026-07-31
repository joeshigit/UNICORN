/**
 * Phase 1 — authenticated Google Forms API client (read-only).
 * Reuses existing DWD / service-account pattern from functions/src/index.ts.
 * Uses monolithic `googleapis` Forms surface (already a project dependency).
 * Does NOT install a second overlapping Google client in Phase 1.
 */

import { google, forms_v1 } from 'googleapis'

/** Same Workspace impersonation subject as Drive DWD. */
const IMPERSONATE_USER = 'joeshi@dbyv.org'

/** Phase 1 read-only Forms scope. */
const FORMS_READONLY_SCOPE = 'https://www.googleapis.com/auth/forms.body.readonly'

export type FormsClient = forms_v1.Forms

export class FormsClientError extends Error {
  code:
    | 'AUTHENTICATION_ERROR'
    | 'GOOGLE_API_ERROR'
    | 'FORM_NOT_FOUND'
    | 'FORM_ACCESS_DENIED'
    | 'INVALID_FORM_ID'

  constructor(
    code: FormsClientError['code'],
    message: string
  ) {
    super(message)
    this.code = code
    this.name = 'FormsClientError'
  }
}

function loadServiceAccount(): { client_email: string; private_key: string } {
  try {
    // Same file as functions/src/index.ts (gitignored; not committed).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../service-account.json')
  } catch {
    throw new FormsClientError(
      'AUTHENTICATION_ERROR',
      'service-account.json not available in this environment'
    )
  }
}

/**
 * Authenticated Forms API client via service account + Domain-Wide Delegation.
 * Same JWT + subject pattern as getDriveClient in functions/src/index.ts.
 */
export async function getFormsClient(): Promise<FormsClient> {
  try {
    const serviceAccount = loadServiceAccount()
    const authClient = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [FORMS_READONLY_SCOPE],
      subject: IMPERSONATE_USER,
    })
    await authClient.authorize()
    return google.forms({ version: 'v1', auth: authClient })
  } catch (err: unknown) {
    if (err instanceof FormsClientError) throw err
    const message = err instanceof Error ? err.message : 'Failed to authorize Forms client'
    throw new FormsClientError('AUTHENTICATION_ERROR', message)
  }
}

/**
 * Extract Google Form API id from raw id or common Google Forms URLs.
 *
 * Notes:
 * - Edit URL `/forms/d/{FORM_ID}/edit` → API formId
 * - Public URL `/forms/d/e/{PUBLIC_ID}/viewform` → published id (may NOT equal API formId)
 */
export function parseGoogleFormId(formIdOrUrl: string): string {
  const raw = (formIdOrUrl || '').trim()
  if (!raw) {
    throw new FormsClientError('INVALID_FORM_ID', 'formIdOrUrl is empty')
  }

  // Bare form id (API id is typically alphanumeric / _ / -)
  if (!/^https?:\/\//i.test(raw) && !raw.includes('/')) {
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(raw)) {
      throw new FormsClientError('INVALID_FORM_ID', 'Malformed Google Form ID')
    }
    return raw
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FormsClientError('INVALID_FORM_ID', 'Malformed Google Form URL')
  }

  if (!url.hostname.endsWith('google.com') && !url.hostname.endsWith('google.com.hk')) {
    throw new FormsClientError('INVALID_FORM_ID', 'Unsupported host for Google Form URL')
  }

  // /forms/d/e/{publicId}/viewform
  const publicMatch = url.pathname.match(/\/forms\/d\/e\/([^/]+)/)
  if (publicMatch?.[1]) {
    return publicMatch[1]
  }

  // /forms/d/{formId}/edit|viewform|...
  const editMatch = url.pathname.match(/\/forms\/d\/([^/]+)/)
  if (editMatch?.[1] && editMatch[1] !== 'e') {
    return editMatch[1]
  }

  throw new FormsClientError('INVALID_FORM_ID', 'Could not extract Form ID from URL')
}

export interface ExtractedGoogleQuestion {
  itemId: string
  questionId: string
  googleLabel: string
  googleQuestionType: string
  requiredOnGoogle: boolean
  googleOptionLabels: string[]
}

function choiceLabels(question: forms_v1.Schema$Question | undefined): string[] {
  const options = question?.choiceQuestion?.options
  if (!options || !Array.isArray(options)) return []
  return options
    .map((o) => (typeof o.value === 'string' ? o.value : ''))
    .filter((v) => v.length > 0)
}

function detectQuestionType(question: forms_v1.Schema$Question | undefined): string {
  if (!question) return 'UNKNOWN'
  if (question.choiceQuestion) {
    const type = question.choiceQuestion.type
    return type ? `CHOICE_${type}` : 'CHOICE'
  }
  if (question.textQuestion) {
    return question.textQuestion.paragraph ? 'TEXT_PARAGRAPH' : 'TEXT_SHORT'
  }
  if (question.scaleQuestion) return 'SCALE'
  if (question.dateQuestion) return 'DATE'
  if (question.timeQuestion) return 'TIME'
  if (question.fileUploadQuestion) return 'FILE_UPLOAD'
  if (question.rowQuestion) return 'ROW'
  if (question.ratingQuestion) return 'RATING'
  return 'UNKNOWN'
}

/**
 * Flatten forms.get items into question rows preserving itemId + questionId.
 */
export function extractQuestionsFromForm(form: forms_v1.Schema$Form): ExtractedGoogleQuestion[] {
  const items = form.items || []
  const out: ExtractedGoogleQuestion[] = []

  for (const item of items) {
    const itemId = item.itemId || ''
    const title = item.title || ''

    if (item.questionItem?.question) {
      const q = item.questionItem.question
      const questionId = q.questionId || ''
      if (!itemId || !questionId) continue
      out.push({
        itemId,
        questionId,
        googleLabel: title,
        googleQuestionType: detectQuestionType(q),
        requiredOnGoogle: q.required === true,
        googleOptionLabels: choiceLabels(q),
      })
      continue
    }

    if (item.questionGroupItem) {
      const groupQuestions = item.questionGroupItem.questions || []
      for (const q of groupQuestions) {
        const questionId = q.questionId || ''
        if (!itemId || !questionId) continue
        const rowLabel = q.rowQuestion?.title
        out.push({
          itemId,
          questionId,
          googleLabel: rowLabel ? `${title} / ${rowLabel}` : title,
          googleQuestionType: detectQuestionType(q) === 'UNKNOWN'
            ? 'QUESTION_GROUP'
            : detectQuestionType(q),
          requiredOnGoogle: q.required === true,
          googleOptionLabels: choiceLabels(q),
        })
      }
    }
  }

  return out
}

export async function getGoogleForm(formId: string): Promise<forms_v1.Schema$Form> {
  const formsClient = await getFormsClient()
  try {
    const response = await formsClient.forms.get({ formId })
    if (!response.data) {
      throw new FormsClientError('GOOGLE_API_ERROR', 'Empty forms.get response')
    }
    return response.data
  } catch (err: unknown) {
    if (err instanceof FormsClientError) throw err

    const anyErr = err as { code?: number; status?: number; message?: string }
    const code = anyErr.code || anyErr.status
    const message = anyErr.message || 'forms.get failed'

    if (code === 404) {
      throw new FormsClientError(
        'FORM_NOT_FOUND',
        'Form not found. For public /d/e/ URLs, use the edit URL Form ID if access fails.'
      )
    }
    if (code === 403 || code === 401) {
      throw new FormsClientError('FORM_ACCESS_DENIED', 'No permission to read this Google Form')
    }
    throw new FormsClientError('GOOGLE_API_ERROR', message)
  }
}
