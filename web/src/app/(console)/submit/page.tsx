'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { FieldInput } from '@/components/form'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '@/components/ui'
import {
  canUserFillTemplate,
  createSubmission,
  correctSubmission,
  ensureUploadSession,
  getOptionSet,
  getSubmission,
  getTemplate,
  getUserRole,
  newSubmissionId,
} from '@/lib/db'
import { SCALE_DIRECTION_HINT, resolveInitialValue, resolveScaleValueLabels } from '@/lib/keys'
import type { FileInfo, OptionItem, Submission, Template } from '@/types'

function SubmitForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { email, uid, isSuperuser } = useAuth()

  const templateId = params.get('form') || ''
  const correctId = params.get('correct') || ''

  const [template, setTemplate] = useState<Template | null>(null)
  const [optionsBySet, setOptionsBySet] = useState<Record<string, OptionItem[]>>({})
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [savedId, setSavedId] = useState('')
  const [draftId, setDraftId] = useState(() => newSubmissionId())

  const actor = useMemo(() => ({ uid, email }), [uid, email])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      if (!uid || !email) throw new Error('請先登入')

      const found = await getTemplate(templateId)
      if (!found) throw new Error('找不到這張表格')

      const role = await getUserRole(email)
      const groups = role?.groups || []

      let source: Submission | null = null
      if (correctId) {
        source = await getSubmission(correctId)
        if (!source) throw new Error('找不到要更正的紀錄')
        if (source._isLatest !== true) throw new Error('這筆紀錄已經有更新的版本了')
        const isOwner =
          source._submitterUid === uid ||
          source._submitterEmail?.toLowerCase() === email.toLowerCase()
        if (!isOwner && !isSuperuser) {
          throw new Error('只有擁有者或 Superuser 可以更正此紀錄')
        }
      } else if (!canUserFillTemplate(found, groups, isSuperuser)) {
        throw new Error('這張表格已停用，或你沒有填報權限')
      }

      setTemplate(found)

      const setIds = Array.from(
        new Set(
          found.fields
            .filter(f => (f.type === 'dropdown' || f.type === 'choice') && f.optionSetId)
            .map(f => f.optionSetId!)
        )
      )
      const loaded: Record<string, OptionItem[]> = {}
      await Promise.all(
        setIds.map(async setId => {
          const optionSet = await getOptionSet(setId)
          if (optionSet) loaded[setId] = optionSet.items
        })
      )
      setOptionsBySet(loaded)

      await ensureUploadSession(draftId, { uid, email })

      const initial: Record<string, unknown> = {}
      for (const field of found.fields) {
        const previous = source?.[field.key]
        const multiValue =
          field.type === 'file' ||
          ((field.type === 'dropdown' || field.type === 'choice') && field.multiple)
        const emptyValue: unknown = multiValue ? [] : ''
        const isThreeShape =
          field.type === 'dropdown' || field.type === 'choice' || field.type === 'scale'

        if (previous !== undefined) {
          // 空白現在存成 null，所以選擇題／量表要把 null 正規化成空值，
          // 否則複選會變成 [null]
          if (isThreeShape && !field.multiple) {
            initial[field.key] = Array.isArray(previous) ? (previous[0] ?? '') : (previous ?? '')
          } else if (isThreeShape && field.multiple) {
            initial[field.key] = Array.isArray(previous)
              ? previous
              : previous == null
                ? []
                : [previous]
          } else {
            initial[field.key] = previous
          }
          continue
        }

        // 沒有舊值才套預填值。舊值優先是快照語意：更正舊紀錄要沿用原值，
        // 不能被新版模板的預填值蓋掉。
        const preset = resolveInitialValue(field, undefined, emptyValue)
        if (isThreeShape && field.multiple) {
          initial[field.key] = Array.isArray(preset) ? preset : preset ? [preset] : []
        } else if (isThreeShape) {
          initial[field.key] = Array.isArray(preset) ? (preset[0] ?? '') : preset
        } else {
          initial[field.key] = preset
        }
      }
      if (source) {
        for (const field of found.fields) {
          if (field.type !== 'file') continue
          initial[field.key] = (source.files || []).filter(f => f.fieldKey === field.key)
        }
      }
      setValues(initial)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [templateId, correctId, uid, email, isSuperuser, draftId])

  useEffect(() => {
    if (!templateId) {
      setLoadError('沒有指定表格')
      setLoading(false)
      return
    }
    if (uid && email) load()
  }, [templateId, load, uid, email])

  const sortedFields = useMemo(
    () => (template ? [...template.fields].sort((a, b) => a.order - b.order) : []),
    [template]
  )

  const setValue = (key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setErrors(prev => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    for (const field of sortedFields) {
      if (!field.required) continue
      const value = values[field.key]
      const empty = Array.isArray(value)
        ? value.length === 0
        : value === '' || value === null || value === undefined
      if (empty) next[field.key] = '此欄位必填'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template || !validate()) return

    setSaving(true)
    setSubmitError('')
    try {
      const optionLabels: Record<string, string> = {}
      const optionOrder: Record<string, string[]> = {}
      const files: FileInfo[] = []
      const payload: Record<string, unknown> = {}

      for (const field of sortedFields) {
        const value = values[field.key]

        if (field.type === 'file') {
          const list = Array.isArray(value) ? (value as FileInfo[]) : []
          files.push(...list)
          payload[field.key] = list.length
          continue
        }

        payload[field.key] = value

        if ((field.type === 'dropdown' || field.type === 'choice') && field.optionSetId) {
          const items = optionsBySet[field.optionSetId] || []
          optionOrder[field.key] = items.map(i => i.value)

          // 空白也要寫（空字串），讓同一張表的每一筆 _optionLabels 鍵集合一致
          const picked = Array.isArray(value) ? (value as string[]) : value ? [value as string] : []
          optionLabels[field.key] = items
            .filter(i => picked.includes(i.value))
            .map(i => i.label)
            .join('、')
        }

        if (field.type === 'scale') {
          const items = resolveScaleValueLabels(field)
          optionOrder[field.key] = items.map(i => i.value)
          const picked = Array.isArray(value) ? (value as string[]) : value ? [value as string] : []
          optionLabels[field.key] = items
            .filter(i => picked.includes(i.value))
            .map(i => i.label)
            .join('、')
        }
      }

      const input = { template, values: payload, files, optionLabels, optionOrder }
      const id = correctId
        ? await correctSubmission(correctId, input, actor, draftId)
        : await createSubmission(input, actor, draftId)

      setSavedId(id)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '送出失敗')
    } finally {
      setSaving(false)
    }
  }

  const resetForAnother = () => {
    setSavedId('')
    setDraftId(newSubmissionId())
    router.replace(`/submit?form=${templateId}`)
  }

  if (loading) return <Spinner label="載入表格中" />

  if (loadError || !template) {
    return (
      <>
        <PageHeader title="填報" />
        <ErrorBanner message={loadError || '找不到表格'} />
        <Link href="/fill" className="btn-secondary">
          回到填報中心
        </Link>
      </>
    )
  }

  if (savedId) {
    return (
      <div className="card mx-auto max-w-lg px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-4 text-xl font-semibold">
          {correctId ? '更正完成' : '已送出'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{template.name}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={resetForAnother}>
            再填一筆
          </button>
          <Link href={`/data?form=${templateId}`} className="btn-secondary">
            查看資料
          </Link>
          <Link href="/fill" className="btn-ghost">
            回填報中心
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Link href={correctId ? '/data' : '/fill'} className="btn-ghost btn-sm mb-4 -ml-3">
        <ArrowLeft className="h-4 w-4" />
        {correctId ? '回已填的表格' : '回填報中心'}
      </Link>

      <PageHeader
        title={template.name}
        description={template.description || `${template.moduleId} · ${template.actionId}`}
      />

      {correctId && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          更正模式：送出後會建立一筆新紀錄，原擁有者不變；原紀錄保留不動，只會標記為已被更正。
        </div>
      )}

      {submitError && <ErrorBanner message={submitError} />}

      {sortedFields.length === 0 ? (
        <EmptyState title="這張表格還沒有欄位" />
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-5 p-6">
          {/* locked 欄位留在原本的順序位置，只是不能改。欄位順序對應使用者熟悉的
              資料結構，搬到別處會破壞對照習慣。 */}
          {sortedFields.map(field => {
            const locked = field.inputMode === 'locked'
            return (
              <div key={field.key}>
                <label className="label mb-1.5">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                  {locked && (
                    <Lock
                      className="ml-1.5 inline h-3 w-3 text-slate-400"
                      aria-label="此欄位由表格固定"
                    />
                  )}
                </label>
                {field.type === 'scale' && (
                  <p className="hint mb-1.5">{SCALE_DIRECTION_HINT}</p>
                )}
                <FieldInput
                  field={field}
                  value={values[field.key]}
                  onChange={value => setValue(field.key, value)}
                  options={field.optionSetId ? optionsBySet[field.optionSetId] || [] : []}
                  error={errors[field.key]}
                  submissionId={draftId}
                  actor={actor}
                  disabled={locked}
                />
                {errors[field.key] ? (
                  <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
                ) : locked ? (
                  <p className="hint mt-1">此表格固定為此值{field.helpText ? `　·　${field.helpText}` : ''}</p>
                ) : (
                  field.helpText && <p className="hint mt-1">{field.helpText}</p>
                )}
              </div>
            )
          })}

          <div className="border-t border-slate-100 pt-4">
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? '送出中…' : correctId ? '送出更正' : '送出'}
            </button>
          </div>
        </form>
      )}
    </>
  )
}

export default function SubmitPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SubmitForm />
    </Suspense>
  )
}
