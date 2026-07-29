// ============================================
// storage.rules 測試
//
// 需同時開 firestore + storage 模擬器（storage rules 會 get() Firestore）：
//   npx firebase emulators:start --only firestore,storage --project demo-unicorn
// ============================================

import { after, before, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))
const SUPER = 'joeshi@dbyv.org'
const OWNER = 'owner@dbyv.org'
const OTHER = 'other@dbyv.org'
const MANAGER = 'manager@dbyv.org'

const OWNER_UID = 'owner_uid'
const OTHER_UID = 'other_uid'
const MANAGER_UID = 'manager_uid'
const SUPER_UID = 'super_uid'

let testEnv

const ctx = (uid, email) =>
  testEnv.authenticatedContext(uid, { email, email_verified: true })

before(async () => {
  // Storage rules 的 firestore.get/exists 只有在與模擬器相同的 projectId 下才會連到 Firestore 模擬器
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-unicorn',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(join(here, '..', 'firestore.rules'), 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(join(here, '..', 'storage.rules'), 'utf8'),
    },
  })
})

after(async () => {
  await testEnv?.cleanup()
})

const seedFs = (path, data) =>
  testEnv.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), path), data))

const pathOf = (uid, submissionId, fieldKey = 'upload', fileId = 'f1.pdf') =>
  `uploads/${uid}/${submissionId}/${fieldKey}/${fileId}`

describe('Storage 隔離', () => {
  before(async () => {
    await testEnv.clearFirestore()
    await testEnv.clearStorage()

    const expiresAt = Timestamp.fromMillis(Date.now() + 3600_000)
    await seedFs('uploadSessions/draft_owner', {
      uid: OWNER_UID,
      email: OWNER,
      submissionId: 'draft_owner',
      expiresAt,
    })
    await seedFs('templates/t1', {
      name: '表',
      enabled: true,
      managerGroups: ['SCD Manager'],
      fillAccessType: 'allOrgUsers',
    })
    await seedFs(`userRoles/${MANAGER}`, { groups: ['SCD Manager'] })
    await seedFs('submissions/final1', {
      _templateId: 't1',
      _submitterUid: OWNER_UID,
      _submitterEmail: OWNER,
      _isLatest: true,
      _status: 'ACTIVE',
    })
  })

  it('擁有者可在有效 session 下上傳核准 MIME', async () => {
    const storage = ctx(OWNER_UID, OWNER).storage()
    await assertSucceeds(
      storage.ref(pathOf(OWNER_UID, 'draft_owner')).put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('拒絕過大檔案', async () => {
    const storage = ctx(OWNER_UID, OWNER).storage()
    const big = Buffer.alloc(20 * 1024 * 1024 + 1, 1)
    await assertFails(
      storage.ref(pathOf(OWNER_UID, 'draft_owner', 'upload', 'big.bin')).put(big, {
        contentType: 'application/pdf',
      })
    )
  })

  it('拒絕未核准 MIME', async () => {
    const storage = ctx(OWNER_UID, OWNER).storage()
    await assertFails(
      storage.ref(pathOf(OWNER_UID, 'draft_owner', 'upload', 'x.exe')).put(Buffer.from('MZ'), {
        contentType: 'application/x-msdownload',
      })
    )
  })

  it('他人不可上傳到別人的 uid 路徑', async () => {
    const storage = ctx(OTHER_UID, OTHER).storage()
    await assertFails(
      storage.ref(pathOf(OWNER_UID, 'draft_owner', 'upload', 'steal.pdf')).put(Buffer.from('%PDF'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('定稿後不可刪除檔案', async () => {
    await testEnv.withSecurityRulesDisabled(async c => {
      await c.storage().ref(pathOf(OWNER_UID, 'final1')).put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
      })
    })
    const storage = ctx(OWNER_UID, OWNER).storage()
    await assertFails(storage.ref(pathOf(OWNER_UID, 'final1')).delete())
  })

  it('擁有者可讀自己路徑上的定稿檔', async () => {
    const storage = ctx(OWNER_UID, OWNER).storage()
    await assertSucceeds(storage.ref(pathOf(OWNER_UID, 'final1')).getMetadata())
  })

  it('Manager 可讀所管表格的定稿檔', async () => {
    const storage = ctx(MANAGER_UID, MANAGER).storage()
    await assertSucceeds(storage.ref(pathOf(OWNER_UID, 'final1')).getMetadata())
  })

  it('無關使用者不可讀定稿檔', async () => {
    const storage = ctx(OTHER_UID, OTHER).storage()
    await assertFails(storage.ref(pathOf(OWNER_UID, 'final1')).getMetadata())
  })

  it('Superuser 可讀定稿檔', async () => {
    const storage = ctx(SUPER_UID, SUPER).storage()
    await assertSucceeds(storage.ref(pathOf(OWNER_UID, 'final1')).getMetadata())
  })
})
