// ============================================
// firestore.rules 攻擊面：所有「不該被允許」的操作必須被拒
//
// 直接繞過前端下惡意查詢。新的查詢設計把 status / module / 跨表 KEY 搬到前端精修，
// 所以規則本身必須守得住，不能靠 UI 不給按。
//
// 需要模擬器：
//   npx firebase emulators:start --only firestore --project demo-unicorn
// ============================================

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit as fsLimit,
  Timestamp,
} from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))

const SUPER = 'joeshi@dbyv.org'
const OWNER = 'owner@dbyv.org'
const ATTACKER = 'attacker@dbyv.org'
const MANAGER = 'manager@dbyv.org'
const OUTSIDER = 'outsider@gmail.com'

const UID = e => e.replace(/[^a-z0-9]/gi, '_')
const T_MANAGED = 't_managed'
const T_SECRET = 't_secret'

let testEnv
const instances = new Map()

const fs = email => {
  if (!instances.has(email)) {
    instances.set(
      email,
      testEnv.authenticatedContext(UID(email), { email, email_verified: true }).firestore()
    )
  }
  return instances.get(email)
}
const anon = () => testEnv.unauthenticatedContext().firestore()
const unverified = email =>
  testEnv.authenticatedContext(UID(email), { email, email_verified: false }).firestore()

/**
 * 規則被拒時，讀取與寫入丟出的錯誤形狀不同（有時只有 `false for 'list'`，
 * 沒有 PERMISSION_DENIED 字樣），所以要同時看 code 與訊息。
 */
async function assertDenied(fn) {
  let threw = false
  try {
    await fn()
  } catch (e) {
    threw = true
    const code = e?.code || ''
    const message = String(e?.message || e)
    const isPermission =
      code === 'permission-denied' ||
      code === 7 ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('permission-denied') ||
      message.includes('false for')
    assert.ok(isPermission, `被拒但原因不是權限：code=${code} ${message.slice(0, 120)}`)
  }
  assert.ok(threw, '這個操作不該成功')
}

const RANGE = [
  where('_submittedMonth', '>=', '2026-01'),
  where('_submittedMonth', '<=', '2026-01'),
]
const ORDER = [orderBy('_submittedMonth', 'asc'), orderBy('_submittedAt', 'desc'), fsLimit(500)]

const submission = over => ({
  _templateId: T_SECRET,
  _templateName: '機密表',
  _templateModule: 'SCD',
  _templateAction: 'REPORT',
  _eventType: 'SCD.REPORT',
  _templateVersion: 1,
  _submitterUid: UID(OWNER),
  _submitterEmail: OWNER,
  _actorUid: UID(OWNER),
  _actorEmail: OWNER,
  _eventKind: 'CREATE',
  _submittedAt: Timestamp.fromMillis(Date.parse('2026-01-15T00:00:00Z')),
  _submittedMonth: '2026-01',
  _status: 'ACTIVE',
  _isLatest: true,
  _fieldLabels: { note: '備註' },
  _optionLabels: {},
  _fieldKeys: ['note'],
  files: [],
  note: '機密內容',
  ...over,
})

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-unicorn',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(join(here, '..', 'firestore.rules'), 'utf8'),
    },
  })
  await testEnv.clearFirestore()

  await testEnv.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore()
    await setDoc(doc(d, 'submissions', 'secret1'), submission())
    await setDoc(doc(d, 'submissions', 'secret2'), submission({ _templateId: T_MANAGED }))
    await setDoc(
      doc(d, 'submissions', 'attacker_own'),
      submission({
        _submitterUid: UID(ATTACKER),
        _submitterEmail: ATTACKER,
        _templateId: T_MANAGED,
      })
    )
    await setDoc(doc(d, 'templates', T_MANAGED), {
      name: '受管表',
      enabled: true,
      fillAccessType: 'allOrgUsers',
      managerGroups: ['SCD Manager'],
      moduleId: 'SCD',
      actionId: 'REPORT',
      version: 1,
      fields: [],
    })
    await setDoc(doc(d, 'templates', T_SECRET), {
      name: '機密表',
      enabled: true,
      fillAccessType: 'groups',
      fillGroups: ['Nobody'],
      managerGroups: [],
      moduleId: 'SCD',
      actionId: 'REPORT',
      version: 1,
      fields: [],
    })
    await setDoc(doc(d, `userRoles/${MANAGER}`), { groups: ['SCD Manager'] })
    await setDoc(doc(d, 'standardKeys/sk_seed'), {
      key: 'emerContact',
      type: 'text',
      valueModel: 'free',
      status: 'active',
    })
  })
})

after(async () => {
  await testEnv?.cleanup()
})

describe('身分邊界', () => {
  it('未登入不能列出 submissions', () =>
    assertDenied(() => getDocs(query(collection(anon(), 'submissions'), ...RANGE, ...ORDER))))

  it('未登入不能計數 submissions', () =>
    assertDenied(() => getCountFromServer(query(collection(anon(), 'submissions'), ...RANGE))))

  it('外網域帳號不能列出 submissions', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(fs(OUTSIDER), 'submissions'),
          where('_submitterUid', '==', UID(OUTSIDER)),
          ...RANGE,
          ...ORDER
        )
      )
    ))

  it('未驗證 email 不能列出 submissions', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(unverified(ATTACKER), 'submissions'),
          where('_submitterUid', '==', UID(ATTACKER)),
          ...RANGE,
          ...ORDER
        )
      )
    ))
})

describe('一般使用者的攻擊面', () => {
  it('不能無條件列出整個資料池', () =>
    assertDenied(() => getDocs(query(collection(fs(ATTACKER), 'submissions'), ...RANGE, ...ORDER))))

  it('不能無條件計數整個資料池', () =>
    assertDenied(() => getCountFromServer(query(collection(fs(ATTACKER), 'submissions'), ...RANGE))))

  it('不能冒用別人的 _submitterUid 查詢', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(fs(ATTACKER), 'submissions'),
          where('_submitterUid', '==', UID(OWNER)),
          ...RANGE,
          ...ORDER
        )
      )
    ))

  // 規則只認 uid：用 email 過濾無法證明擁有者身分，所以整個查詢被拒
  it('不能改用 _submitterEmail 繞過', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(fs(ATTACKER), 'submissions'),
          where('_submitterEmail', '==', ATTACKER),
          ...RANGE,
          ...ORDER
        )
      )
    ))

  it('不能直接查別人管的表格', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(fs(ATTACKER), 'submissions'),
          where('_templateId', '==', T_MANAGED),
          ...RANGE,
          ...ORDER
        )
      )
    ))

  it('不能用 _templateId in 掃描表格', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(fs(ATTACKER), 'submissions'),
          where('_templateId', 'in', [T_MANAGED, T_SECRET]),
          ...RANGE,
          ...ORDER
        )
      )
    ))

  it('不能單筆讀取別人的紀錄', () =>
    assertDenied(() => getDoc(doc(fs(ATTACKER), 'submissions/secret1'))))
})

describe('Manager 的界線', () => {
  it('不能列出非管轄表格', () =>
    assertDenied(() =>
      getDocs(
        query(
          collection(fs(MANAGER), 'submissions'),
          where('_templateId', '==', T_SECRET),
          ...RANGE,
          ...ORDER
        )
      )
    ))

  it('不能無條件列出整池', () =>
    assertDenied(() => getDocs(query(collection(fs(MANAGER), 'submissions'), ...RANGE, ...ORDER))))

  it('不能改他人紀錄的鏈頭', () =>
    assertDenied(() =>
      updateDoc(doc(fs(MANAGER), 'submissions/secret2'), { _isLatest: false, _supersededBy: 'x' })
    ))

  it('不能刪除紀錄', () => assertDenied(() => deleteDoc(doc(fs(MANAGER), 'submissions/secret2'))))
})

describe('不可變性（空白存 null 之後仍然成立）', () => {
  it('不能把 null 欄位改成有值', () =>
    assertDenied(() => updateDoc(doc(fs(OWNER), 'submissions/secret1'), { note: '被改了' })))

  it('不能改狀態', () =>
    assertDenied(() => updateDoc(doc(fs(OWNER), 'submissions/secret1'), { _status: 'VOID' })))

  it('不能改擁有者', () =>
    assertDenied(() =>
      updateDoc(doc(fs(OWNER), 'submissions/secret1'), { _submitterUid: UID(ATTACKER) })
    ))

  it('Superuser 也不能刪除紀錄', () =>
    assertDenied(() => deleteDoc(doc(fs(SUPER), 'submissions/secret2'))))

  it('Superuser 也不能改已寫入的資料', () =>
    assertDenied(() => updateDoc(doc(fs(SUPER), 'submissions/secret2'), { note: '改' })))
})

describe('建立時的偽造', () => {
  it('不能冒用他人身分建立', () =>
    assertDenied(() =>
      setDoc(
        doc(fs(ATTACKER), 'submissions/forged'),
        submission({ _submitterUid: UID(OWNER), _submitterEmail: OWNER })
      )
    ))

  it('不能對沒有填報權限的表格建立', () =>
    assertDenied(() =>
      setDoc(
        doc(fs(ATTACKER), 'submissions/forged2'),
        submission({
          _templateId: T_SECRET,
          _submitterUid: UID(ATTACKER),
          _submitterEmail: ATTACKER,
          _actorUid: UID(ATTACKER),
          _actorEmail: ATTACKER,
        })
      )
    ))

  it('不能建立一開始就不是鏈頭的紀錄', () =>
    assertDenied(() =>
      setDoc(
        doc(fs(ATTACKER), 'submissions/forged3'),
        submission({
          _templateId: T_MANAGED,
          _submitterUid: UID(ATTACKER),
          _submitterEmail: ATTACKER,
          _actorUid: UID(ATTACKER),
          _actorEmail: ATTACKER,
          _isLatest: false,
        })
      )
    ))

  it('不能直接建立 VOID 墓碑（沒有鏈）', () =>
    assertDenied(() =>
      setDoc(
        doc(fs(ATTACKER), 'submissions/forged4'),
        submission({
          _templateId: T_MANAGED,
          _submitterUid: UID(ATTACKER),
          _submitterEmail: ATTACKER,
          _actorUid: UID(ATTACKER),
          _actorEmail: ATTACKER,
          _eventKind: 'VOID',
          _status: 'VOID',
        })
      )
    ))
})

describe('模板、選項池與權限', () => {
  it('一般使用者不能改模板', () =>
    assertDenied(() =>
      setDoc(doc(fs(ATTACKER), `templates/${T_MANAGED}`), { name: '被改了' })
    ))

  it('一般使用者不能改選項池', () =>
    assertDenied(() => setDoc(doc(fs(ATTACKER), 'optionSets/x'), { code: 'school' })))

  it('一般使用者不能寫標準資料', () =>
    assertDenied(() =>
      setDoc(doc(fs(ATTACKER), 'standardKeys/hack'), {
        key: 'x',
        type: 'text',
        valueModel: 'free',
        status: 'active',
      })
    ))

  it('任何人不能刪標準資料', () =>
    assertDenied(() => deleteDoc(doc(fs(SUPER), 'standardKeys/sk_seed'))))

  it('一般使用者不能改別人的 userRoles', () =>
    assertDenied(() =>
      setDoc(doc(fs(ATTACKER), `userRoles/${MANAGER}`), { groups: ['SCD Manager'] })
    ))

  it('一般使用者不能自己加群組', () =>
    assertDenied(() =>
      setDoc(doc(fs(ATTACKER), `userRoles/${ATTACKER}`), { groups: ['SCD Manager'] })
    ))

  it('一般使用者不能讀沒有填報權限的模板', () =>
    assertDenied(() => getDoc(doc(fs(ATTACKER), `templates/${T_SECRET}`))))
})
