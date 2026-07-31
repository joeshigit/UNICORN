/**
 * Phase 1.5 — Prefill POC HTTPS endpoint.
 * Prove extraction + prefilled URL generation only.
 * No watches, ingest, mapping UI, Answer Workspace, or submissions.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import cors from 'cors'
import {
  applyPrefillBindingsToMappings,
  extractPrefillEntries,
  fetchViewformHtml,
  runPrefillPoc,
} from './prefillEntryExtractor'

const corsHandler = cors({ origin: true })
const ALLOWED_DOMAIN = 'dbyv.org'
const ADMIN_EMAILS = ['joeshi@dbyv.org']
const SUPERUSER_EMAILS = ['tong@dbyv.org', 'jason@dbyv.org', 'joeshi@dbyv.org']

async function verifyIdToken(
  req: functions.https.Request
): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const idToken = authHeader.split('Bearer ')[1]
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    if (!decodedToken.email?.endsWith(`@${ALLOWED_DOMAIN}`)) return null
    return decodedToken
  } catch {
    return null
  }
}

function canRunPrefillPoc(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email) || SUPERUSER_EMAILS.includes(email)
}

/**
 * POST body:
 * {
 *   responderUri: string            // required — public viewform URL
 *   googleFormId?: string           // optional — persist prefillEntryId onto draft config
 *   samples?: Record<string, string | string[]>  // optional — itemId/entryId → sample values
 *   persistBindings?: boolean       // default false; when true + googleFormId, write prefillEntryId only
 * }
 */
export const proveGoogleFormPrefill = functions
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
      if (!canRunPrefillPoc(user.email)) {
        res.status(403).json({
          error: 'UNAUTHORIZED',
          message: 'Only Admin or Superuser may run Prefill POC',
        })
        return
      }

      const responderUri =
        typeof req.body?.responderUri === 'string' ? req.body.responderUri.trim() : ''
      const googleFormId =
        typeof req.body?.googleFormId === 'string' ? req.body.googleFormId.trim() : ''
      const persistBindings = req.body?.persistBindings === true
      const samples =
        req.body?.samples && typeof req.body.samples === 'object'
          ? (req.body.samples as Record<string, string | string[]>)
          : undefined

      if (!responderUri) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'responderUri is required',
        })
        return
      }

      const poc = await runPrefillPoc({ responderUri, samples })

      let persisted = false
      if (
        persistBindings &&
        googleFormId &&
        (poc.status === 'success' || poc.status === 'unsupported') &&
        poc.bindings.length > 0
      ) {
        try {
          const db = admin.firestore()
          const ref = db.collection('googleFormConfigs').doc(googleFormId)
          const snap = await ref.get()
          if (snap.exists) {
            const data = snap.data() || {}
            const mappings = Array.isArray(data.questionMappings)
              ? data.questionMappings
              : []
            // Re-extract for Architecture §4.5 join shape (itemId/entryId/title)
            const html = await fetchViewformHtml(responderUri)
            const bindings = extractPrefillEntries(html)
            const nextMappings = applyPrefillBindingsToMappings(mappings, bindings)
            await ref.set(
              {
                questionMappings: nextMappings,
                updatedAt: new Date().toISOString(),
                updatedBy: user.email || '',
              },
              { merge: true }
            )
            persisted = true
          }
        } catch (err: unknown) {
          console.error('proveGoogleFormPrefill persist failed:', err)
          res.status(500).json({
            error: 'FIRESTORE_WRITE_ERROR',
            message: 'Failed to persist prefillEntryId onto googleFormConfigs',
            poc,
          })
          return
        }
      }

      const http =
        poc.status === 'success'
          ? 200
          : poc.status === 'unsupported'
            ? 200
            : poc.status === 'parse_failure' || poc.status === 'PREFILL_UNAVAILABLE'
              ? 422
              : 500

      res.status(http).json({
        phase: '1.5',
        success: poc.status === 'success',
        status: poc.status,
        message: poc.message,
        prefillUrl: poc.prefillUrl,
        bindings: poc.bindings,
        supportedCount: poc.supportedCount,
        unsupportedCount: poc.unsupportedCount,
        sampleEntriesApplied: poc.sampleEntriesApplied,
        persistedPrefillEntryIds: persisted,
        note:
          'Prefill POC only. No ingest, watches, mapping UI, or Answer Workspace. Fake URLs are never returned on parse failure.',
      })
    })
  })
