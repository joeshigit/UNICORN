import {
  ACTION_CODE,
  FIXED_KEYS,
  MANAGER_GROUP_CODE,
  MODULE_CODE,
  answerFormatLabel,
  applyStandardToField,
  isYesNoField,
} from '@/lib/keys'
import type { FieldDefinition, FieldType, OptionSet, StandardKey } from '@/types'

export type PoolGroupId =
  | 'frequent'
  | 'standard'
  | 'optionSet'
  | 'datetime'
  | 'file'
  | 'other'

export interface QuestionPoolItem {
  id: string
  groupId: PoolGroupId
  defaultKey: string
  label: string
  type: FieldType
  formatLabel: string
  source: 'standardKey' | 'fixed' | 'optionSet'
  standard?: StandardKey
  optionSetId?: string
  yesNoAllowNa?: boolean
  scalePoints?: FieldDefinition['scalePoints']
  scaleValueLabels?: FieldDefinition['scaleValueLabels']
}

const FREQUENT_KEYS = new Set(['school', 'startDate', 'endDate', 'expiryDate', 'upload'])

export function buildQuestionPool(
  standardKeys: StandardKey[],
  optionSets: OptionSet[]
): QuestionPoolItem[] {
  const items: QuestionPoolItem[] = []
  const seen = new Set<string>()

  for (const s of standardKeys) {
    if (s.status === 'deprecated') continue
    const id = `standard:${s.key}`
    if (seen.has(s.key)) continue
    seen.add(s.key)
    items.push({
      id,
      groupId: FREQUENT_KEYS.has(s.key) ? 'frequent' : 'standard',
      defaultKey: s.key,
      label: s.defaultLabel,
      type: s.type,
      formatLabel: answerFormatLabel({
        type: s.type,
        yesNoAllowNa: s.valueModel === 'yesNo' ? s.allowNa : undefined,
      }),
      source: 'standardKey',
      standard: s,
      optionSetId: s.optionSetId,
      yesNoAllowNa: s.valueModel === 'yesNo' ? s.allowNa : undefined,
      scalePoints: s.scalePoints,
      scaleValueLabels: s.scaleValueLabels,
    })
  }

  for (const [key, meta] of Object.entries(FIXED_KEYS)) {
    if (seen.has(key)) continue
    seen.add(key)
    let groupId: PoolGroupId = 'other'
    if (meta.group === '日期時間') groupId = 'datetime'
    else if (meta.group === '檔案') groupId = 'file'
    else if (FREQUENT_KEYS.has(key)) groupId = 'frequent'
    items.push({
      id: `fixed:${key}`,
      groupId: FREQUENT_KEYS.has(key) ? 'frequent' : groupId,
      defaultKey: key,
      label: meta.label,
      type: meta.type,
      formatLabel: answerFormatLabel({ type: meta.type }),
      source: 'fixed',
    })
  }

  const masters = optionSets.filter(
    os =>
      os.isMaster &&
      os.code !== MODULE_CODE &&
      os.code !== ACTION_CODE &&
      os.code !== MANAGER_GROUP_CODE
  )
  for (const os of masters) {
    if (seen.has(os.code)) {
      // already covered by standard/fixed — still list under optionSet only if not present as optionSet group
      continue
    }
    seen.add(os.code)
    items.push({
      id: `optionSet:${os.id}`,
      groupId: FREQUENT_KEYS.has(os.code) ? 'frequent' : 'optionSet',
      defaultKey: os.code,
      label: os.name,
      type: 'dropdown',
      formatLabel: '下拉選單',
      source: 'optionSet',
      optionSetId: os.id,
    })
  }

  return items
}

export const POOL_GROUP_ORDER: Array<{ id: PoolGroupId; label: string }> = [
  { id: 'frequent', label: '常用' },
  { id: 'standard', label: '標準問題' },
  { id: 'optionSet', label: '標準選項' },
  { id: 'datetime', label: '日期／時間' },
  { id: 'file', label: '檔案' },
  { id: 'other', label: '其他固定題目' },
]

/** Builder-only draft wrapper (never persist clientId / needsKey / contractLocked) */
export interface DraftField extends FieldDefinition {
  clientId: string
  needsKey?: boolean
  /** Lock type / optionSet / scale / yesNo after template insert */
  contractLocked?: boolean
  templateDefaultKey?: string
}

export function newClientId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`
}

export function toDraftFields(fields: FieldDefinition[]): DraftField[] {
  return fields.map((f, i) => ({
    ...f,
    order: i,
    clientId: newClientId(),
    contractLocked: false,
  }))
}

export function stripDraft(fields: DraftField[]): FieldDefinition[] {
  return fields.map((f, i) => {
    const {
      clientId: _c,
      needsKey: _n,
      contractLocked: _l,
      templateDefaultKey: _t,
      ...rest
    } = f
    return { ...rest, order: i }
  })
}

export function fieldFromPoolItem(
  item: QuestionPoolItem,
  usedKeys: Set<string>,
  order: number
): DraftField {
  const collision = usedKeys.has(item.defaultKey)
  const base: FieldDefinition = {
    key: collision ? '' : item.defaultKey,
    type: item.type,
    label: item.label,
    required: false,
    order,
    helpText: undefined,
    optionSetId: item.optionSetId,
    yesNoAllowNa: item.yesNoAllowNa,
    scalePoints: item.scalePoints,
    scaleValueLabels: item.scaleValueLabels,
  }

  let field = base
  if (item.standard && !collision) {
    field = applyStandardToField(base, item.standard)
  } else if (item.standard && collision) {
    // Copy contract without forcing registry KEY
    field = {
      ...applyStandardToField(base, item.standard),
      key: '',
      label: item.label,
    }
  }

  return {
    ...field,
    order,
    clientId: newClientId(),
    needsKey: collision,
    contractLocked: true,
    templateDefaultKey: item.defaultKey,
  }
}

export function blankFieldFromManner(
  manner: FieldType | 'yesNo' | 'yesNoNa',
  order: number
): DraftField {
  const base: DraftField = {
    clientId: newClientId(),
    key: '',
    type: 'text',
    label: '',
    required: false,
    order,
    needsKey: true,
    contractLocked: false,
  }

  if (manner === 'yesNo') {
    return { ...base, type: 'choice', yesNoAllowNa: false }
  }
  if (manner === 'yesNoNa') {
    return { ...base, type: 'choice', yesNoAllowNa: true }
  }
  if (manner === 'scale') {
    return { ...base, type: 'scale', scalePoints: 5 }
  }
  if (manner === 'dropdown' || manner === 'choice') {
    return { ...base, type: manner }
  }
  return { ...base, type: manner }
}

export function optionSetsForField(
  field: FieldDefinition,
  optionSets: OptionSet[]
): OptionSet[] {
  if (!field.optionSetId) {
    return optionSets.filter(
      os =>
        os.code !== MODULE_CODE &&
        os.code !== ACTION_CODE &&
        os.code !== MANAGER_GROUP_CODE
    )
  }
  const bound = optionSets.find(os => os.id === field.optionSetId)
  if (!bound) return []
  return optionSets.filter(os => os.code === bound.code)
}

export function isContractLockedField(field: DraftField, standardKeys: StandardKey[]): boolean {
  if (field.contractLocked) return true
  if (standardKeys.some(s => s.key === field.key)) return true
  return false
}

export { answerFormatLabel, isYesNoField }
