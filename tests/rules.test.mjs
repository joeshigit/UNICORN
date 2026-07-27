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

describe('只有擁有者能進來', () => {
  before(() => testEnv.clearFirestore())

  it('未登入不能讀 submissions', async () => {
    await assertFails(getDocs(collection(anonDb(), 'submissions')))
  })

  it('其他公司同事不能讀 submissions', async () => {
    await assertFails(getDocs(collection(otherDb(), 'submissions')))
  })

  it('其他人不能建立表格', async () => {
    await assertFails(setDoc(doc(otherDb(), 'templates/t1'), { name: '偷建的' }))
  })

  it('其他人不能改選項池', async () => {
    await assertFails(setDoc(doc(otherDb(), 'optionSets/o1'), { code: 'school' }))
  })

  it('擁有者可以建立表格與選項池', async () => {
    await assertSucceeds(setDoc(doc(ownerDb(), 'templates/t1'), { name: '營會登記表' }))
    await assertSucceeds(setDoc(doc(ownerDb(), 'optionSets/o1'), { code: 'school' }))
  })
})

describe('submissions 是不可變事件', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed('submissions/s1', submission())
  })

  it('擁有者可以新增', async () => {
    await assertSucceeds(setDoc(doc(ownerDb(), 'submissions/new1'), submission()))
  })

  it('不能冒用別人的 email 送出', async () => {
    await assertFails(
      setDoc(doc(ownerDb(), 'submissions/new2'), submission({ _submitterEmail: OTHER }))
    )
  })

  it('不能新增一筆一開始就不是鏈頭的紀錄', async () => {
    await assertFails(
      setDoc(doc(ownerDb(), 'submissions/new3'), submission({ _isLatest: false }))
    )
  })

  it('不能改欄位資料', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'submissions/s1'), { quantity1: 999 }))
  })

  it('不能改狀態', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'submissions/s1'), { _status: 'VOID' }))
  })

  it('不能改 label 快照', async () => {
    await assertFails(
      updateDoc(doc(ownerDb(), 'submissions/s1'), { _fieldLabels: { quantity1: '換個說法' } })
    )
  })

  it('不能刪除', async () => {
    await assertFails(deleteDoc(doc(ownerDb(), 'submissions/s1')))
  })

  it('可以把鏈頭交棒給新紀錄', async () => {
    await assertSucceeds(
      updateDoc(doc(ownerDb(), 'submissions/s1'), { _isLatest: false, _supersededBy: 's2' })
    )
  })

  it('交棒之後不能再把鏈頭搶回來', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'submissions/s1'), { _isLatest: true }))
  })

  it('不能只動指標卻偷改資料', async () => {
    await seed('submissions/s3', submission())
    await assertFails(
      updateDoc(doc(ownerDb(), 'submissions/s3'), {
        _isLatest: false,
        _supersededBy: 's4',
        quantity1: 999,
      })
    )
  })
})

describe('擁有者讀得到自己的資料', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await seed('submissions/s1', submission())
  })

  it('讀單筆', async () => {
    await assertSucceeds(getDoc(doc(ownerDb(), 'submissions/s1')))
  })

  it('列清單', async () => {
    await assertSucceeds(getDocs(collection(ownerDb(), 'submissions')))
  })
})
