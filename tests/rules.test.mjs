// ============================================
// firestore.rules 測試（Step 1–2 Stabilization）
//
// 跑之前要先開模擬器：
//   npx firebase emulators:start --only firestore --project demo-unicorn
// 然後：
//   npm --prefix tests test
// ============================================

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))
const SUPER = 'joeshi@dbyv.org'
const OTHER = 'someone@dbyv.org'
const OUTSIDER = 'outsider@gmail.com'
const MANAGER = 'manager@dbyv.org'

let testEnv

const auth = (email, uid = email.replace(/[^a-z0-9]/gi, '_')) =>
  testEnv.authenticatedContext(uid, {
    email,
    email_verified: true,
  }).firestore()

const unverified = email =>
  testEnv.authenticatedContext('unverified', {
    email,
    email_verified: false,
  }).firestore()

const anonDb = () => testEnv.unauthenticatedContext().firestore()

const submission = (overrides = {}) => ({
  _templateId: 'tpl_open',
  _templateName: '測試表',
  _templateModule: 'CAMP',
  _templateAction: 'REGISTER',
  _eventType: 'CAMP.REGISTER',
  _templateVersion: 1,
  _submitterUid: 'someone_dbyv_org',
  _submitterEmail: OTHER,
  _actorUid: 'someone_dbyv_org',
  _actorEmail: OTHER,
  _eventKind: 'CREATE',
  _submittedAt: new Date(),
  _submittedMonth: '2026-07',
  _status: 'ACTIVE',
  _isLatest: true,
  _fieldLabels: { quantity1: '人數' },
  _optionLabels: {},
  _fieldKeys: ['quantity1'],
  files: [],
  quantity1: 30,
  ...overrides,
})

const openTemplate = (overrides = {}) => ({
  name: '開放表',
  enabled: true,
  fillAccessType: 'allOrgUsers',
  fillGroups: [],
  managerGroups: [],
  moduleId: 'CAMP',
  actionId: 'REGISTER',
  version: 1,
  fields: [],
  ...overrides,
})

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'unicorn-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(join(here, '..', 'firestore.rules'), 'utf8'),
    },
  })
})

after(async () => {
  await testEnv?.cleanup()
})

const seed = (path, data) =>
  testEnv.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data))

describe('組織網域身分邊界', () => {
  before(() => testEnv.clearFirestore())

  it('未登入不能讀任何資料', async () => {
    await seed('submissions/s1', submission())
    await assertFails(getDocs(collection(anonDb(), 'submissions')))
    await assertFails(getDocs(collection(anonDb(), 'optionSets')))
  })

  it('未驗證 email 的組織帳號無法讀', async () => {
    await seed('optionSets/o1', { code: 'school' })
    await assertFails(getDoc(doc(unverified(OTHER), 'optionSets/o1')))
  })

  it('組織使用者可以讀 optionSets，但不能寫', async () => {
    await seed('optionSets/o1', { code: 'school', name: '學校' })
    await assertSucceeds(getDoc(doc(auth(OTHER), 'optionSets/o1')))
    await assertFails(setDoc(doc(auth(OTHER), 'optionSets/o2'), { code: 'dept' }))
  })

  it('Superuser 可以寫 optionSets / templates', async () => {
    await assertSucceeds(setDoc(doc(auth(SUPER), 'optionSets/o1'), { code: 'school' }))
    await assertSucceeds(setDoc(doc(auth(SUPER), 'templates/t1'), openTemplate()))
  })
})

describe('模板填報 ACL', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed('templates/tpl_open', openTemplate())
    await seed(
      'templates/tpl_group',
      openTemplate({
        name: '群組表',
        fillAccessType: 'groups',
        fillGroups: ['SCD Manager'],
      })
    )
    await seed('templates/tpl_disabled', openTemplate({ enabled: false }))
    await seed(`userRoles/${MANAGER}`, { groups: ['SCD Manager'] })
  })

  it('全組織表：任何組織使用者可讀', async () => {
    await assertSucceeds(getDoc(doc(auth(OTHER), 'templates/tpl_open')))
  })

  it('群組表：無角色者不可讀', async () => {
    await assertFails(getDoc(doc(auth(OTHER), 'templates/tpl_group')))
  })

  it('群組表：有對應群組可讀', async () => {
    await assertSucceeds(getDoc(doc(auth(MANAGER), 'templates/tpl_group')))
  })

  it('停用表：一般使用者不可讀', async () => {
    await assertFails(getDoc(doc(auth(OTHER), 'templates/tpl_disabled')))
  })

  it('缺少 userRoles 時 Manager ACL 不崩潰且拒絕', async () => {
    await seed(
      'templates/tpl_mgr',
      openTemplate({ managerGroups: ['SCD Manager'], fillAccessType: 'allOrgUsers' })
    )
    await seed(
      'submissions/sub_mgr',
      submission({
        _templateId: 'tpl_mgr',
        _submitterUid: 'joeshi_dbyv_org',
        _submitterEmail: SUPER,
        _actorUid: 'joeshi_dbyv_org',
        _actorEmail: SUPER,
      })
    )
    // OTHER 不是擁有者、也沒有 userRoles → 不可讀
    await assertFails(getDoc(doc(auth(OTHER), 'submissions/sub_mgr')))
  })
})

describe('Manager 可讀不可改鏈', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed(`userRoles/${MANAGER}`, { groups: ['SCD Manager'] })
    await seed(
      'templates/t_managed',
      openTemplate({ managerGroups: ['SCD Manager'] })
    )
    await seed(
      'templates/t_other',
      openTemplate({ managerGroups: ['HR Manager'] })
    )
    await seed(
      'submissions/sub_managed',
      submission({
        _templateId: 't_managed',
        _submitterUid: 'someone_dbyv_org',
        _submitterEmail: OTHER,
      })
    )
    await seed(
      'submissions/sub_other',
      submission({
        _templateId: 't_other',
        _submitterUid: 'someone_dbyv_org',
        _submitterEmail: OTHER,
      })
    )
  })

  it('Manager 可讀所管表格 submission', async () => {
    await assertSucceeds(getDoc(doc(auth(MANAGER), 'submissions/sub_managed')))
  })

  it('Manager 不可讀未管表格', async () => {
    await assertFails(getDoc(doc(auth(MANAGER), 'submissions/sub_other')))
  })

  it('Manager 不可交棒他人鏈頭', async () => {
    await assertFails(
      updateDoc(doc(auth(MANAGER), 'submissions/sub_managed'), {
        _isLatest: false,
        _supersededBy: 'x',
      })
    )
  })

  it('Manager 不可建立冒充他人的更正', async () => {
    await assertFails(
      setDoc(
        doc(auth(MANAGER), 'submissions/fake_corr'),
        submission({
          _templateId: 't_managed',
          _submitterUid: 'someone_dbyv_org',
          _submitterEmail: OTHER,
          _actorUid: 'manager_dbyv_org',
          _actorEmail: MANAGER,
          _eventKind: 'CORRECTION',
          _supersedes: 'sub_managed',
        })
      )
    )
  })
})

describe('擁有者／操作者與不可變生命週期', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed('templates/tpl_open', openTemplate())
    await seed(
      'submissions/s1',
      submission({
        _submitterUid: 'someone_dbyv_org',
        _submitterEmail: OTHER,
        _actorUid: 'someone_dbyv_org',
        _actorEmail: OTHER,
      })
    )
  })

  it('一般使用者可建立自己的 ACTIVE CREATE', async () => {
    await assertSucceeds(
      setDoc(
        doc(auth(OTHER), 'submissions/new1'),
        submission({
          _submitterUid: 'someone_dbyv_org',
          _submitterEmail: OTHER,
          _actorUid: 'someone_dbyv_org',
          _actorEmail: OTHER,
          _eventKind: 'CREATE',
          _status: 'ACTIVE',
        })
      )
    )
  })

  it('一般使用者不能直接建立 VOID（無鏈）', async () => {
    await assertFails(
      setDoc(
        doc(auth(OTHER), 'submissions/void_forge'),
        submission({
          _submitterUid: 'someone_dbyv_org',
          _submitterEmail: OTHER,
          _actorUid: 'someone_dbyv_org',
          _actorEmail: OTHER,
          _eventKind: 'VOID',
          _status: 'VOID',
        })
      )
    )
  })

  it('一般使用者不能冒用別人 email/uid', async () => {
    await assertFails(
      setDoc(
        doc(auth(OTHER), 'submissions/steal'),
        submission({
          _submitterUid: 'joeshi_dbyv_org',
          _submitterEmail: SUPER,
          _actorUid: 'someone_dbyv_org',
          _actorEmail: OTHER,
        })
      )
    )
  })

  it('擁有者可建立 CORRECTION 並保留擁有者', async () => {
    await assertSucceeds(
      setDoc(
        doc(auth(OTHER), 'submissions/corr1'),
        submission({
          _submitterUid: 'someone_dbyv_org',
          _submitterEmail: OTHER,
          _actorUid: 'someone_dbyv_org',
          _actorEmail: OTHER,
          _eventKind: 'CORRECTION',
          _status: 'ACTIVE',
          _supersedes: 's1',
        })
      )
    )
  })

  it('Superuser 代為更正時保留原擁有者', async () => {
    await seed(
      'submissions/s_owner',
      submission({
        _submitterUid: 'someone_dbyv_org',
        _submitterEmail: OTHER,
        _actorUid: 'someone_dbyv_org',
        _actorEmail: OTHER,
      })
    )
    await assertSucceeds(
      setDoc(
        doc(auth(SUPER), 'submissions/corr_su'),
        submission({
          _submitterUid: 'someone_dbyv_org',
          _submitterEmail: OTHER,
          _actorUid: 'joeshi_dbyv_org',
          _actorEmail: SUPER,
          _eventKind: 'CORRECTION',
          _status: 'ACTIVE',
          _supersedes: 's_owner',
        })
      )
    )
  })

  it('不能改欄位資料，只能交棒指標', async () => {
    await seed(
      'submissions/s3',
      submission({
        _submitterUid: 'someone_dbyv_org',
        _submitterEmail: OTHER,
      })
    )
    await assertFails(updateDoc(doc(auth(OTHER), 'submissions/s3'), { quantity1: 999 }))
    await assertSucceeds(
      updateDoc(doc(auth(OTHER), 'submissions/s3'), {
        _isLatest: false,
        _supersededBy: 's4',
      })
    )
  })

  it('不能刪除 submission', async () => {
    await seed(
      'submissions/s_del',
      submission({
        _submitterUid: 'someone_dbyv_org',
        _submitterEmail: OTHER,
      })
    )
    await assertFails(deleteDoc(doc(auth(OTHER), 'submissions/s_del')))
    await assertFails(deleteDoc(doc(auth(SUPER), 'submissions/s_del')))
  })
})

describe('uploadSessions', () => {
  before(() => testEnv.clearFirestore())

  it('使用者只能建立自己的 session', async () => {
    const expiresAt = new Date(Date.now() + 3600_000)
    await assertSucceeds(
      setDoc(doc(auth(OTHER), 'uploadSessions/draft1'), {
        uid: 'someone_dbyv_org',
        email: OTHER,
        submissionId: 'draft1',
        expiresAt,
      })
    )
    await assertFails(
      setDoc(doc(auth(OTHER), 'uploadSessions/draft2'), {
        uid: 'joeshi_dbyv_org',
        email: SUPER,
        submissionId: 'draft2',
        expiresAt,
      })
    )
  })
})

// 修正外網域測試：auth() 回傳的就是 firestore
describe('外網域拒絕（修正）', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed('optionSets/o1', { code: 'school' })
  })

  it('gmail 帳號無法讀 optionSets', async () => {
    await assertFails(getDoc(doc(auth(OUTSIDER), 'optionSets/o1')))
  })
})
