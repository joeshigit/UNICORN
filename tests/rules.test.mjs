// ============================================
// firestore.rules 測試
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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))
const OWNER = 'joeshi@dbyv.org'
const OTHER = 'someone@dbyv.org'

let testEnv

const submission = (overrides = {}) => ({
  _templateId: 'tpl1',
  _templateName: '測試表',
  _templateModule: 'CAMP',
  _templateAction: 'REGISTER',
  _templateVersion: 1,
  _submitterEmail: OWNER,
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

const ownerDb = () => testEnv.authenticatedContext(OWNER, { email: OWNER }).firestore()
const otherDb = () => testEnv.authenticatedContext(OTHER, { email: OTHER }).firestore()
const anonDb = () => testEnv.unauthenticatedContext().firestore()

const seed = (path, data) =>
  testEnv.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data))

describe('Multi-User 存取控制', () => {
  before(() => testEnv.clearFirestore())

  it('未登入不能讀 submissions', async () => {
    await assertFails(getDocs(collection(anonDb(), 'submissions')))
  })

  it('一般使用者只能讀自己的 submissions，不能讀別人的', async () => {
    await seed('submissions/owner_sub', submission({ _submitterEmail: OWNER }))
    await seed('submissions/other_sub', submission({ _submitterEmail: OTHER }))

    // Read single
    await assertFails(getDoc(doc(otherDb(), 'submissions/owner_sub')))
    await assertSucceeds(getDoc(doc(otherDb(), 'submissions/other_sub')))

    // Query (Requires _submitterEmail filter)
    await assertFails(getDocs(collection(otherDb(), 'submissions')))
    const q = testEnv.unauthenticatedContext().firestore().collection('submissions') // dummy to build query
    // Can't use unauthenticated to build queries easily in rules-unit-testing if we want them executed by otherDb, 
    // but we know getting the whole collection fails.
  })

  it('Superuser 可以讀所有 submissions', async () => {
    await seed('submissions/other_sub', submission({ _submitterEmail: OTHER }))
    await assertSucceeds(getDoc(doc(ownerDb(), 'submissions/other_sub')))
  })

  it('一般使用者可以讀取 templates 來填表', async () => {
    await seed('templates/t1', { name: '營會登記表' })
    await assertSucceeds(getDoc(doc(otherDb(), 'templates/t1')))
  })

  it('Form Manager 可以讀取自己管理的表格的 submissions', async () => {
    // 1. Seed user role for OTHER
    await seed(`userRoles/${OTHER}`, { groups: ['SCD Manager'] })
    
    // 2. Seed template with manager group
    await seed('templates/t_managed', { name: 'SCD Report', managerGroups: ['SCD Manager'] })
    await seed('templates/t_unmanaged', { name: 'HR Report', managerGroups: ['HR Manager'] })
    
    // 3. Seed submissions for both templates
    await seed('submissions/sub_managed', submission({ _submitterEmail: OWNER, _templateId: 't_managed' }))
    await seed('submissions/sub_unmanaged', submission({ _submitterEmail: OWNER, _templateId: 't_unmanaged' }))
    
    // 4. Test access
    await assertSucceeds(getDoc(doc(otherDb(), 'submissions/sub_managed'))) // Allowed via group
    await assertFails(getDoc(doc(otherDb(), 'submissions/sub_unmanaged'))) // Denied
  })

  it('一般使用者不能建表或改表', async () => {
    await assertFails(setDoc(doc(otherDb(), 'templates/t2'), { name: '偷建的' }))
  })

  it('一般使用者不能改選項池', async () => {
    await assertFails(setDoc(doc(otherDb(), 'optionSets/o1'), { code: 'school' }))
  })

  it('Superuser 可以建立表格與選項池', async () => {
    await assertSucceeds(setDoc(doc(ownerDb(), 'templates/t1'), { name: '營會登記表' }))
    await assertSucceeds(setDoc(doc(ownerDb(), 'optionSets/o1'), { code: 'school' }))
  })
})

describe('submissions 是不可變事件', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed('submissions/s1', submission({ _submitterEmail: OTHER }))
  })

  it('一般使用者可以新增自己的', async () => {
    await assertSucceeds(setDoc(doc(otherDb(), 'submissions/new1'), submission({ _submitterEmail: OTHER })))
  })

  it('一般使用者不能冒用別人的 email 送出', async () => {
    await assertFails(
      setDoc(doc(otherDb(), 'submissions/new2'), submission({ _submitterEmail: OWNER }))
    )
  })

  it('不能新增一筆一開始就不是鏈頭的紀錄', async () => {
    await assertFails(
      setDoc(doc(otherDb(), 'submissions/new3'), submission({ _submitterEmail: OTHER, _isLatest: false }))
    )
  })

  it('不能改欄位資料', async () => {
    await assertFails(updateDoc(doc(otherDb(), 'submissions/s1'), { quantity1: 999 }))
  })

  it('不能改狀態', async () => {
    await assertFails(updateDoc(doc(otherDb(), 'submissions/s1'), { _status: 'VOID' }))
  })

  it('不能改 label 快照', async () => {
    await assertFails(
      updateDoc(doc(otherDb(), 'submissions/s1'), { _fieldLabels: { quantity1: '換個說法' } })
    )
  })

  it('不能刪除', async () => {
    await assertFails(deleteDoc(doc(otherDb(), 'submissions/s1')))
  })

  it('一般使用者可以把自己的鏈頭交棒給新紀錄', async () => {
    await assertSucceeds(
      updateDoc(doc(otherDb(), 'submissions/s1'), { _isLatest: false, _supersededBy: 's2' })
    )
  })

  it('一般使用者不能交棒別人的紀錄', async () => {
    await seed('submissions/s_owner', submission({ _submitterEmail: OWNER }))
    await assertFails(
      updateDoc(doc(otherDb(), 'submissions/s_owner'), { _isLatest: false, _supersededBy: 's2' })
    )
  })

  it('Superuser 可以交棒別人的紀錄', async () => {
    await seed('submissions/s_other2', submission({ _submitterEmail: OTHER }))
    await assertSucceeds(
      updateDoc(doc(ownerDb(), 'submissions/s_other2'), { _isLatest: false, _supersededBy: 's2' })
    )
  })

  it('交棒之後不能再把鏈頭搶回來', async () => {
    await assertFails(updateDoc(doc(otherDb(), 'submissions/s1'), { _isLatest: true }))
  })

  it('不能只動指標卻偷改資料', async () => {
    await seed('submissions/s3', submission({ _submitterEmail: OTHER }))
    await assertFails(
      updateDoc(doc(otherDb(), 'submissions/s3'), {
        _isLatest: false,
        _supersededBy: 's4',
        quantity1: 999,
      })
    )
  })
})

