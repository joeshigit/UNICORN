// ============================================
// firestore.rules 放行測試：所有「應該被允許」的操作必須真的被允許
//
// 規則裡有多處 get() / exists() 交叉檢查。這種寫法最大的風險不是放行太多，
// 而是把合法操作誤拒——先前就發生過一次：清單查詢的規則是對「查詢條件推導出的
// resource」求值，isOwnerOfRecord() 檢查 _submitterUid 而查詢過濾 _submitterEmail，
// 導致每個非 Superuser 的資料池查詢都失敗。所以每一條合法路徑都要跑一次。
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
  runTransaction,
  Timestamp,
} from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))

const SUPER = 'joeshi@dbyv.org'
const OWNER = 'owner@dbyv.org'
const MANAGER = 'manager@dbyv.org'
const PLAIN = 'plain@dbyv.org'

const UID = e => e.replace(/[^a-z0-9]/gi, '_')
const T_OPEN = 't_open' // allOrgUsers，有 managerGroups
const T_GROUP = 't_group' // 只給 SCD Manager 填
const T_NOMGR = 't_nomgr' // managerGroups 是空陣列

let testEnv
const instances = new Map()

// 每個使用者只建一個 Firestore instance，否則 transaction 內外會是不同 instance
const fs = email => {
  if (!instances.has(email)) {
    instances.set(
      email,
      testEnv.authenticatedContext(UID(email), { email, email_verified: true }).firestore()
    )
  }
  return instances.get(email)
}

const RANGE = [
  where('_submittedMonth', '>=', '2026-01'),
  where('_submittedMonth', '<=', '2026-01'),
]
const ORDER = [orderBy('_submittedMonth', 'asc'), orderBy('_submittedAt', 'desc'), fsLimit(500)]

const submission = over => ({
  _templateId: T_OPEN,
  _templateName: 'x',
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
  note: null, // 空白存 null，形狀與有值的紀錄一致
  ...over,
})

const template = over => ({
  name: 'x',
  enabled: true,
  fillAccessType: 'allOrgUsers',
  managerGroups: ['SCD Manager'],
  moduleId: 'SCD',
  actionId: 'REPORT',
  version: 1,
  fields: [],
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
    await setDoc(doc(d, 'templates', T_OPEN), template())
    await setDoc(
      doc(d, 'templates', T_GROUP),
      template({ fillAccessType: 'groups', fillGroups: ['SCD Manager'] })
    )
    await setDoc(doc(d, 'templates', T_NOMGR), template({ managerGroups: [] }))
    await setDoc(doc(d, 'optionSets', 'o1'), { code: 'school', name: '學校', items: [] })
    await setDoc(doc(d, `userRoles/${MANAGER}`), { groups: ['SCD Manager'] })

    await setDoc(doc(d, 'submissions', 'own1'), submission())
    await setDoc(doc(d, 'submissions', 'own_nomgr'), submission({ _templateId: T_NOMGR }))
    // 每個鏈頭測試用獨立文件，避免互相耦合
    for (const id of ['chain_head', 'chain_a', 'chain_b', 'chain_c']) {
      await setDoc(doc(d, 'submissions', id), submission({ _templateId: T_NOMGR }))
    }
    await setDoc(doc(d, 'uploadSessions', 'draft_owner'), {
      uid: UID(OWNER),
      email: OWNER,
      submissionId: 'draft_owner',
      expiresAt: Timestamp.fromMillis(Date.now() + 3600_000),
    })
  })
})

after(async () => {
  await testEnv?.cleanup()
})

describe('組織使用者的基本讀取', () => {
  it('讀選項池（填表要用）', async () => {
    const snap = await getDoc(doc(fs(PLAIN), 'optionSets/o1'))
    assert.ok(snap.exists())
  })

  it('列出選項池', async () => {
    const snap = await getDocs(collection(fs(PLAIN), 'optionSets'))
    assert.equal(snap.size, 1)
  })

  it('讀 allOrgUsers 的模板', async () => {
    const snap = await getDoc(doc(fs(PLAIN), `templates/${T_OPEN}`))
    assert.ok(snap.exists())
  })

  it('讀 managerGroups 是空陣列的模板', async () => {
    const snap = await getDoc(doc(fs(PLAIN), `templates/${T_NOMGR}`))
    assert.ok(snap.exists())
  })

  it('讀自己的 userRoles（即使不存在）', async () => {
    const snap = await getDoc(doc(fs(PLAIN), `userRoles/${PLAIN}`))
    assert.equal(snap.exists(), false)
  })

  it('有群組的人讀 groups 限定的模板', async () => {
    const snap = await getDoc(doc(fs(MANAGER), `templates/${T_GROUP}`))
    assert.ok(snap.exists())
  })
})

describe('擁有者', () => {
  it('單筆讀自己的紀錄', async () => {
    assert.ok((await getDoc(doc(fs(OWNER), 'submissions/own1'))).exists())
  })

  // 模板的 managerGroups 是空陣列時，isManagerOfForm 會走到 size() > 0 的分支；
  // 擁有者這一支必須先短路成功，否則自己的資料會讀不到
  it('單筆讀自己的（模板 managerGroups 為空）', async () => {
    assert.ok((await getDoc(doc(fs(OWNER), 'submissions/own_nomgr'))).exists())
  })

  it('清單查自己的（必須用 uid 過濾）', async () => {
    const snap = await getDocs(
      query(
        collection(fs(OWNER), 'submissions'),
        where('_submitterUid', '==', UID(OWNER)),
        ...RANGE,
        ...ORDER
      )
    )
    assert.ok(snap.size >= 6)
  })

  it('計數自己的', async () => {
    const snap = await getCountFromServer(
      query(collection(fs(OWNER), 'submissions'), where('_submitterUid', '==', UID(OWNER)), ...RANGE)
    )
    assert.ok(snap.data().count >= 6)
  })

  it('清單查自己的＋指定表格', async () => {
    const snap = await getDocs(
      query(
        collection(fs(OWNER), 'submissions'),
        where('_submitterUid', '==', UID(OWNER)),
        where('_templateId', '==', T_NOMGR),
        ...RANGE,
        ...ORDER
      )
    )
    assert.ok(snap.size >= 5)
  })

  it('交棒自己的鏈頭', () =>
    updateDoc(doc(fs(OWNER), 'submissions/chain_head'), {
      _isLatest: false,
      _supersededBy: 'next1',
    }))

  // 與 correctSubmission 的流程一致：同一個 transaction 內寫新文件並交棒舊文件
  it('更正（transaction：寫新文件＋交棒舊文件）', () =>
    runTransaction(fs(OWNER), async tx => {
      const ref = doc(fs(OWNER), 'submissions/chain_a')
      assert.ok((await tx.get(ref)).exists())
      tx.set(
        doc(fs(OWNER), 'submissions/corr_a'),
        submission({ _templateId: T_NOMGR, _eventKind: 'CORRECTION', _supersedes: 'chain_a' })
      )
      tx.update(ref, { _isLatest: false, _supersededBy: 'corr_a' })
    }))

  it('作廢（transaction：寫 VOID 墓碑＋交棒）', () =>
    runTransaction(fs(OWNER), async tx => {
      const ref = doc(fs(OWNER), 'submissions/chain_b')
      assert.ok((await tx.get(ref)).exists())
      tx.set(
        doc(fs(OWNER), 'submissions/void_b'),
        submission({
          _templateId: T_NOMGR,
          _eventKind: 'VOID',
          _status: 'VOID',
          _supersedes: 'chain_b',
        })
      )
      tx.update(ref, { _isLatest: false, _supersededBy: 'void_b' })
    }))
})

describe('Manager', () => {
  it('列出所管表格的全部紀錄（含他人填的）', async () => {
    const snap = await getDocs(
      query(
        collection(fs(MANAGER), 'submissions'),
        where('_templateId', '==', T_OPEN),
        ...RANGE,
        ...ORDER
      )
    )
    assert.ok(snap.size >= 1)
  })

  it('計數所管表格', async () => {
    const snap = await getCountFromServer(
      query(collection(fs(MANAGER), 'submissions'), where('_templateId', '==', T_OPEN), ...RANGE)
    )
    assert.ok(snap.data().count >= 1)
  })

  it('用 in 列出多張所管表格', async () => {
    const snap = await getDocs(
      query(
        collection(fs(MANAGER), 'submissions'),
        where('_templateId', 'in', [T_OPEN]),
        ...RANGE,
        ...ORDER
      )
    )
    assert.ok(snap.size >= 1)
  })

  it('單筆讀所管表格的他人紀錄', async () => {
    assert.ok((await getDoc(doc(fs(MANAGER), 'submissions/own1'))).exists())
  })

  it('對 groups 限定的表格建立自己的紀錄', () =>
    setDoc(
      doc(fs(MANAGER), 'submissions/mgr_own'),
      submission({
        _templateId: T_GROUP,
        _submitterUid: UID(MANAGER),
        _submitterEmail: MANAGER,
        _actorUid: UID(MANAGER),
        _actorEmail: MANAGER,
      })
    ))
})

describe('一般使用者填報', () => {
  it('對 allOrgUsers 表格建立自己的紀錄', () =>
    setDoc(
      doc(fs(PLAIN), 'submissions/plain_own'),
      submission({
        _submitterUid: UID(PLAIN),
        _submitterEmail: PLAIN,
        _actorUid: UID(PLAIN),
        _actorEmail: PLAIN,
      })
    ))

  it('建立自己的 uploadSession', () =>
    setDoc(doc(fs(PLAIN), 'uploadSessions/draft_plain'), {
      uid: UID(PLAIN),
      email: PLAIN,
      submissionId: 'draft_plain',
      expiresAt: Timestamp.fromMillis(Date.now() + 3600_000),
    }))

  it('讀自己的 uploadSession', async () => {
    assert.ok((await getDoc(doc(fs(PLAIN), 'uploadSessions/draft_plain'))).exists())
  })

  it('刪自己的 uploadSession', () =>
    deleteDoc(doc(fs(PLAIN), 'uploadSessions/draft_plain')))
})

describe('Superuser', () => {
  it('列出整池', async () => {
    const snap = await getDocs(query(collection(fs(SUPER), 'submissions'), ...RANGE, ...ORDER))
    assert.ok(snap.size >= 8)
  })

  it('計數整池', async () => {
    const snap = await getCountFromServer(query(collection(fs(SUPER), 'submissions'), ...RANGE))
    assert.ok(snap.data().count >= 8)
  })

  it('讀所有模板與 userRoles', async () => {
    assert.ok((await getDocs(collection(fs(SUPER), 'templates'))).size >= 3)
    assert.ok((await getDocs(collection(fs(SUPER), 'userRoles'))).size >= 1)
  })

  it('寫模板與選項池', async () => {
    await setDoc(doc(fs(SUPER), 'templates/t_new'), template())
    await setDoc(doc(fs(SUPER), 'optionSets/o2'), { code: 'dept' })
  })

  it('指派群組', () =>
    setDoc(doc(fs(SUPER), `userRoles/${PLAIN}`), { groups: ['SCD Manager'] }))

  it('代為交棒他人鏈頭', () =>
    updateDoc(doc(fs(SUPER), 'submissions/own1'), { _isLatest: false, _supersededBy: 'next2' }))

  it('代為更正並保留原擁有者（transaction）', () =>
    runTransaction(fs(SUPER), async tx => {
      const ref = doc(fs(SUPER), 'submissions/chain_c')
      assert.ok((await tx.get(ref)).exists())
      tx.set(
        doc(fs(SUPER), 'submissions/su_corr'),
        submission({
          _templateId: T_NOMGR,
          _eventKind: 'CORRECTION',
          _supersedes: 'chain_c',
          _actorUid: UID(SUPER),
          _actorEmail: SUPER,
        })
      )
      tx.update(ref, { _isLatest: false, _supersededBy: 'su_corr' })
    }))

  it('計數某張表格的筆數（表格頁的刪除保護）', async () => {
    const snap = await getCountFromServer(
      query(collection(fs(SUPER), 'submissions'), where('_templateId', '==', T_OPEN))
    )
    assert.ok(snap.data().count >= 2)
  })
})
