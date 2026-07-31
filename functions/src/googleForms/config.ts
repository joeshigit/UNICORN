/**
 * Phase 1 — connectGoogleForm
 * Read-only: parse id → forms.get → draft googleFormConfigs/{googleFormId}
 * No watches, ingest, prefill, mapping UI, or batchUpdate.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import cors from 'cors'
import {
  FormsClientError,
  extractQuestionsFromForm,
  getGoogleForm,
  parseGoogleFormId,
} from './client'

const corsHandler = cors({ origin: true })
const ALLOWED_DOMAIN = 'dbyv.org'
const ADMIN_EMAILS = ['joeshi@dbyv.org']
const SUPERUSER_EMAILS = ['tong@dbyv.org', 'jason@dbyv.org', 'joeshi@dbyv.org']

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_FORM_ID'
  | 'FORM_NOT_FOUND'
  | 'FORM_ACCESS_DENIED'
  | 'GOOGLE_API_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'FIRESTORE_WRITE_ERROR'
  | 'UNAUTHORIZED'

async function verifyIdToken(
  req: functions.https.Request
): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const idToken = authHeader.split('Bearer ')[1]
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    if (!decodedToken.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return null
    }
    return decodedToken
  } catch {
    return null
  }
}

function canConnectGoogleForm(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email) || SUPERUSER_EMAILS.includes(email)
}

function mapClientError(err: unknown): { http: number; code: ErrorCode; message: string } {
  if (err instanceof FormsClientError) {
    switch (err.code) {
      case 'INVALID_FORM_ID':
        return { http: 400, code: 'INVALID_FORM_ID', message: err.message }
      case 'FORM_NOT_FOUND':
        return { http: 404, code: 'FORM_NOT_FOUND', message: err.message }
      case 'FORM_ACCESS_DENIED':
        return { http: 403, code: 'FORM_ACCESS_DENIED', message: err.message }
      case 'AUTHENTICATION_ERROR':
        return { http: 500, code: 'AUTHENTICATION_ERROR', message: 'Google authentication failed' }
      default:
        return { http: 502, code: 'GOOGLE_API_ERROR', message: 'Google Forms API error' }
    }
  }
  return { http: 500, code: 'GOOGLE_API_ERROR', message: 'Unexpected error' }
}

/**
 * HTTPS Function: connect an existing Google Form (read-only draft config).
 *
 * Body: { formIdOrUrl: string, templateId?: string }
 */
export const connectGoogleForm = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('')
        return
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'INVALID_REQUEST', message: 'Method not allowed' })
        return
      }

      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({
          error: 'AUTHENTICATION_ERROR',
          message: 'Unauthorized — valid Firebase Bearer token required',
        })
        return
      }
      if (!canConnectGoogleForm(user.email)) {
        res.status(403).json({
          error: 'UNAUTHORIZED',
          message: 'Only Admin or Superuser may connect Google Forms',
        })
        return
      }

      const formIdOrUrl =
        typeof req.body?.formIdOrUrl === 'string' ? req.body.formIdOrUrl : ''
      const templateId =
        typeof req.body?.templateId === 'string' ? req.body.templateId : ''

      if (!formIdOrUrl.trim()) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'formIdOrUrl is required',
        })
        return
      }

      let formId: string
      try {
        formId = parseGoogleFormId(formIdOrUrl)
      } catch (err) {
        const mapped = mapClientError(err)
        res.status(mapped.http).json({ error: mapped.code, message: mapped.message })
        return
      }

      let form
      try {
        form = await getGoogleForm(formId)
      } catch (err) {
        const mapped = mapClientError(err)
        res.status(mapped.http).json({ error: mapped.code, message: mapped.message })
        return
      }

      // Prefer API formId from resource when present
      const googleFormId = form.formId || formId
      const title = form.info?.title || ''
      const responderUri = form.responderUri || ''
      const extracted = extractQuestionsFromForm(form)

      const now = new Date().toISOString()
      const questionMappings = extracted.map((q) => ({
        itemId: q.itemId,
        questionId: q.questionId,
        googleLabel: q.googleLabel,
        googleQuestionType: q.googleQuestionType,
        unicornKey: '',
        requiredOnGoogle: q.requiredOnGoogle,
        mappingStatus: 'UNMAPPED' as const,
        optionMappings: q.googleOptionLabels.map((label) => ({
          googleOptionLabel: label,
          unicornOptionValue: '',
          confirmed: false,
        })),
      }))

      const configDoc = {
        id: googleFormId,
        googleFormId,
        title,
        responderUri,
        templateId: templateId || '',
        operationalStatus: 'DRAFT' as const,
        watchHealth: 'DISCONNECTED' as const,
        watch: null,
        questionMappings,
        createdAt: now,
        updatedAt: now,
        createdBy: user.email || '',
        updatedBy: user.email || '',
      }

      try {
        const db = admin.firestore()
        await db.collection('googleFormConfigs').doc(googleFormId).set(configDoc, { merge: false })
      } catch (err: unknown) {
        console.error('connectGoogleForm Firestore write failed:', err)
        res.status(500).json({
          error: 'FIRESTORE_WRITE_ERROR',
          message: 'Failed to write googleFormConfigs document',
        })
        return
      }

      res.status(200).json({
        success: true,
        googleFormId,
        config: configDoc,
        questionCount: questionMappings.length,
        phase: 1,
        note: 'Draft read-only connection. No watch, ingest, or mapping assigned.',
      })
    })
  })
