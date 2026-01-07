import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { google } from 'googleapis'
import Busboy from 'busboy'
import cors from 'cors'

// 載入服務帳號金鑰（在編譯時載入）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('../service-account.json')

// 初始化 Firebase Admin
admin.initializeApp()

// CORS 設定
const corsHandler = cors({ origin: true })

// Google Drive 資料夾 ID
const DRIVE_FOLDER_ID = '18ITJdA2_w_0Xie0C0d_jKE987DumB3Pa'

// 允許的網域
const ALLOWED_DOMAIN = 'dbyv.org'

// 模擬的使用者（擁有 Drive 資料夾存取權的帳號）
const IMPERSONATE_USER = 'joeshi@dbyv.org'

/**
 * 驗證 Firebase ID Token
 */
async function verifyIdToken(req: functions.https.Request): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  
  const idToken = authHeader.split('Bearer ')[1]
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    
    // 驗證網域
    if (!decodedToken.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return null
    }
    
    return decodedToken
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

/**
 * 取得 Google Drive API 客戶端（使用 Domain-Wide Delegation + 服務帳號金鑰）
 */
async function getDriveClient() {
  console.log('Creating Drive client with service account:', serviceAccount.client_email)
  console.log('Impersonating user:', IMPERSONATE_USER)
  
  // 使用 JWT 客戶端，設定 subject 來模擬使用者
  const jwtClient = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: IMPERSONATE_USER // Domain-Wide Delegation: 模擬此使用者
  })
  
  // 授權
  await jwtClient.authorize()
  console.log('JWT client authorized successfully')
  
  return google.drive({ version: 'v3', auth: jwtClient })
}

/**
 * 上傳檔案到 Google Drive
 */
export const uploadFile = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const busboy = Busboy({ headers: req.headers })
        const uploads: Promise<any>[] = []
        const fileInfos: any[] = []
        
        let moduleId = ''
        let submissionId = ''
        
        busboy.on('field', (name: string, val: string) => {
          if (name === 'moduleId') moduleId = val
          if (name === 'submissionId') submissionId = val
        })
        
        busboy.on('file', (name: string, file: NodeJS.ReadableStream, info: { filename: string, mimeType: string }) => {
          const { filename, mimeType } = info
          
          // 收集檔案資料
          const chunks: Buffer[] = []
          file.on('data', (chunk: Buffer) => chunks.push(chunk))
          
          const uploadPromise = new Promise<void>((resolve, reject) => {
            file.on('end', async () => {
              try {
                const buffer = Buffer.concat(chunks)
                const drive = await getDriveClient()
                
                // 上傳到 Drive（支援 Shared Drive）
                const driveResponse = await drive.files.create({
                  requestBody: {
                    name: `${submissionId || 'file'}_${filename}`,
                    parents: [DRIVE_FOLDER_ID],
                    description: `Uploaded by ${user.email} | Module: ${moduleId}`
                  },
                  media: {
                    mimeType: mimeType,
                    body: require('stream').Readable.from(buffer)
                  },
                  fields: 'id, name, mimeType, size, webViewLink, webContentLink',
                  supportsAllDrives: true // 支援 Shared Drive
                })
                
                fileInfos.push({
                  driveFileId: driveResponse.data.id,
                  name: filename,
                  mimeType: mimeType,
                  size: buffer.length,
                  webViewLink: driveResponse.data.webViewLink,
                  uploadedAt: new Date().toISOString(),
                  uploadedBy: user.email
                })
                
                resolve()
              } catch (error) {
                reject(error)
              }
            })
            
            file.on('error', reject)
          })
          
          uploads.push(uploadPromise)
        })
        
        busboy.on('finish', async () => {
          try {
            await Promise.all(uploads)
            res.status(200).json({ 
              success: true, 
              files: fileInfos 
            })
          } catch (error: any) {
            console.error('Upload failed:', error)
            res.status(500).json({ 
              error: 'Upload failed', 
              message: error.message 
            })
          }
        })
        
        busboy.end(req.rawBody)
        
      } catch (error: any) {
        console.error('Error:', error)
        res.status(500).json({ 
          error: 'Server error', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 取消 Submission（狀態轉換 ACTIVE → CANCELLED）
 * 這是唯一允許修改 submission 的方式
 */
export const cancelSubmission = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { submissionId } = req.body
        
        if (!submissionId) {
          res.status(400).json({ error: 'Missing submissionId' })
          return
        }
        
        const db = admin.firestore()
        const submissionRef = db.collection('submissions').doc(submissionId)
        const submissionDoc = await submissionRef.get()
        
        // 檢查 submission 是否存在
        if (!submissionDoc.exists) {
          res.status(404).json({ error: 'Submission not found' })
          return
        }
        
        const submissionData = submissionDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - 只有 owner 可以取消
        if (submissionData.createdBy !== user.email) {
          res.status(403).json({ error: 'You can only cancel your own submissions' })
          return
        }
        
        // 🦄 UNICORN: 狀態檢查 - 只有 ACTIVE 可以變成 CANCELLED
        if (submissionData._status !== 'ACTIVE') {
          res.status(400).json({ 
            error: 'Invalid state transition',
            message: `Cannot cancel a submission with status: ${submissionData._status}`
          })
          return
        }
        
        // 🦄 UNICORN: 執行狀態轉換（使用 Admin SDK 繞過 Rules）
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        await submissionRef.update({
          status: 'CANCELLED',
          updatedAt: now,
          cancelledAt: now,
          cancelledBy: user.email
        })
        
        // 🦄 UNICORN: 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'CANCEL_SUBMISSION',
          targetCollection: 'submissions',
          targetId: submissionId,
          performedBy: user.email,
          performedAt: now,
          previousStatus: 'ACTIVE',
          newStatus: 'CANCELLED',
          metadata: {
            templateId: submissionData.templateId,
            moduleId: submissionData.moduleId,
            actionId: submissionData.actionId
          }
        })
        
        console.log(`Submission ${submissionId} cancelled by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Submission cancelled successfully'
        })
        
      } catch (error: any) {
        console.error('Cancel submission failed:', error)
        res.status(500).json({ 
          error: 'Cancel failed', 
          message: error.message 
        })
      }
    })
  })

// ============================================
// 🦄 UNICORN: Admin 名單（之後可改為從 Firestore 讀取）
// ============================================
const ADMIN_EMAILS = ['joeshi@dbyv.org']

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email)
}

// ============================================
// 🦄 UNICORN: Superuser 名單
// ============================================
const SUPERUSER_EMAILS = ['tong@dbyv.org', 'jason@dbyv.org', 'joeshi@dbyv.org']

function isSuperuserEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return SUPERUSER_EMAILS.includes(email)
}

/**
 * 🦄 UNICORN: 處理選項變更申請（Governed Dictionary）
 * Admin 可以核准或拒絕選項申請
 */
export const processOptionRequest = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Admin 可以審核
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can process option requests' })
        return
      }
      
      try {
        const { requestId, action, reviewNote } = req.body
        
        if (!requestId || !action) {
          res.status(400).json({ error: 'Missing requestId or action' })
          return
        }
        
        if (!['approve', 'reject'].includes(action)) {
          res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' })
          return
        }
        
        const db = admin.firestore()
        const requestRef = db.collection('optionRequests').doc(requestId)
        const requestDoc = await requestRef.get()
        
        if (!requestDoc.exists) {
          res.status(404).json({ error: 'Option request not found' })
          return
        }
        
        const requestData = requestDoc.data()!
        
        // 🦄 UNICORN: 狀態檢查 - 只有 pending 可以處理
        if (requestData.status !== 'pending') {
          res.status(400).json({ 
            error: 'Request already processed',
            currentStatus: requestData.status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        const batch = db.batch()
        
        if (action === 'reject') {
          // 簡單拒絕
          batch.update(requestRef, {
            status: 'rejected',
            reviewedAt: now,
            reviewedBy: user.email,
            reviewNote: reviewNote || null
          })
        } else {
          // 核准 - 根據類型處理
          const { setId, type, payload } = requestData
          const optionSetRef = db.collection('optionSets').doc(setId)
          const optionSetDoc = await optionSetRef.get()
          
          if (!optionSetDoc.exists) {
            res.status(404).json({ error: 'Option set not found' })
            return
          }
          
          const optionSetData = optionSetDoc.data()!
          const items = optionSetData.items || []
          
          switch (type) {
            case 'add': {
              // 🦄 UNICORN: 檢查 label 一致性（跨 OptionSet）
              const optionSetCode = optionSetData.code
              if (optionSetCode && payload.code && payload.label) {
                const labelCheck = await checkLabelConsistency(
                  db, 
                  optionSetCode, 
                  [{ value: payload.code, label: payload.label }]
                )
                if (!labelCheck.valid) {
                  const conflict = labelCheck.conflicts[0]
                  res.status(400).json({ 
                    error: `Label 不一致！"${conflict.value}" 在其他同 code 的 OptionSet 中 label 是 "${conflict.existingLabel}"，但申請的是 "${conflict.newLabel}"` 
                  })
                  return
                }
              }
              
              // 新增選項（進入 staging 狀態）
              const newItem = {
                value: payload.code,
                label: payload.label,
                status: 'staging',
                sort: items.length,
                createdAt: new Date().toISOString(),
                createdBy: requestData.requestedBy,
                approvedAt: new Date().toISOString(),
                approvedBy: user.email,
                labelHistory: []
              }
              items.push(newItem)
              batch.update(optionSetRef, { 
                items, 
                updatedAt: now 
              })
              break
            }
            
            case 'rename': {
              // 改名
              const itemIndex = items.findIndex((i: any) => i.value === payload.code)
              if (itemIndex === -1) {
                res.status(404).json({ error: `Option "${payload.code}" not found` })
                return
              }
              
              const item = items[itemIndex]
              // 記錄舊標籤到歷史
              const labelHistory = item.labelHistory || []
              labelHistory.push({
                label: item.label,
                changedAt: new Date().toISOString(),
                changedBy: user.email,
                reason: payload.reason || 'Renamed'
              })
              
              items[itemIndex] = {
                ...item,
                label: payload.newLabel,
                labelHistory
              }
              batch.update(optionSetRef, { 
                items, 
                updatedAt: now 
              })
              
              // 🦄 UNICORN: Cascade rename to all OptionSets with same code + value
              // 維持 label 一致性
              const optionSetCode = optionSetData.code
              if (optionSetCode) {
                const siblingQuery = await db.collection('optionSets')
                  .where('code', '==', optionSetCode)
                  .get()
                
                for (const siblingDoc of siblingQuery.docs) {
                  // 跳過當前的 OptionSet
                  if (siblingDoc.id === setId) continue
                  
                  const siblingData = siblingDoc.data()
                  const siblingItems = siblingData.items || []
                  const siblingItemIndex = siblingItems.findIndex((i: any) => i.value === payload.code)
                  
                  if (siblingItemIndex !== -1) {
                    const siblingItem = siblingItems[siblingItemIndex]
                    const siblingLabelHistory = siblingItem.labelHistory || []
                    siblingLabelHistory.push({
                      label: siblingItem.label,
                      changedAt: new Date().toISOString(),
                      changedBy: user.email,
                      reason: `Cascaded from OptionSet "${optionSetData.name}": ${payload.reason || 'Renamed'}`
                    })
                    
                    siblingItems[siblingItemIndex] = {
                      ...siblingItem,
                      label: payload.newLabel,
                      labelHistory: siblingLabelHistory
                    }
                    
                    batch.update(siblingDoc.ref, { 
                      items: siblingItems, 
                      updatedAt: now 
                    })
                    
                    console.log(`Cascaded rename to OptionSet ${siblingDoc.id} (${siblingData.name})`)
                  }
                }
              }
              break
            }
            
            case 'merge': {
              // 合併選項
              const sourceIndex = items.findIndex((i: any) => i.value === payload.sourceCode)
              const targetIndex = items.findIndex((i: any) => i.value === payload.targetCode)
              
              if (sourceIndex === -1) {
                res.status(404).json({ error: `Source option "${payload.sourceCode}" not found` })
                return
              }
              if (targetIndex === -1) {
                res.status(404).json({ error: `Target option "${payload.targetCode}" not found` })
                return
              }
              
              // 標記 source 為 deprecated 並指向 target
              items[sourceIndex] = {
                ...items[sourceIndex],
                status: 'deprecated',
                mergedInto: payload.targetCode,
                deprecatedAt: new Date().toISOString(),
                deprecatedBy: user.email
              }
              batch.update(optionSetRef, { 
                items, 
                updatedAt: now 
              })
              
              // 建立 alias 映射
              const aliasRef = db.collection('optionAliases').doc()
              batch.set(aliasRef, {
                setId,
                oldCode: payload.sourceCode,
                newCode: payload.targetCode,
                mergedAt: now,
                mergedBy: user.email,
                reason: payload.reason || null
              })
              break
            }
            
            case 'deprecate': {
              // 停用選項
              const itemIndex = items.findIndex((i: any) => i.value === payload.code)
              if (itemIndex === -1) {
                res.status(404).json({ error: `Option "${payload.code}" not found` })
                return
              }
              
              items[itemIndex] = {
                ...items[itemIndex],
                status: 'deprecated',
                deprecatedAt: new Date().toISOString(),
                deprecatedBy: user.email
              }
              batch.update(optionSetRef, { 
                items, 
                updatedAt: now 
              })
              break
            }
            
            case 'activate': {
              // 啟用選項（staging → active）
              const itemIndex = items.findIndex((i: any) => i.value === payload.code)
              if (itemIndex === -1) {
                res.status(404).json({ error: `Option "${payload.code}" not found` })
                return
              }
              
              const item = items[itemIndex]
              if (item.status !== 'staging') {
                res.status(400).json({ 
                  error: `Option "${payload.code}" is not in staging status`,
                  currentStatus: item.status
                })
                return
              }
              
              items[itemIndex] = {
                ...item,
                status: 'active',
                activatedAt: new Date().toISOString(),
                activatedBy: user.email
              }
              batch.update(optionSetRef, { 
                items, 
                updatedAt: now 
              })
              break
            }
            
            default:
              res.status(400).json({ error: `Unknown request type: ${type}` })
              return
          }
          
          // 更新 request 狀態
          batch.update(requestRef, {
            status: 'approved',
            reviewedAt: now,
            reviewedBy: user.email,
            reviewNote: reviewNote || null
          })
        }
        
        // 🦄 UNICORN: 寫入 audit log
        const auditRef = db.collection('auditLogs').doc()
        batch.set(auditRef, {
          action: `OPTION_REQUEST_${action.toUpperCase()}`,
          targetCollection: 'optionRequests',
          targetId: requestId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            setId: requestData.setId,
            type: requestData.type,
            payload: requestData.payload,
            reviewNote: reviewNote || null
          }
        })
        
        await batch.commit()
        
        console.log(`Option request ${requestId} ${action}ed by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: `Request ${action}ed successfully`
        })
        
      } catch (error: any) {
        console.error('Process option request failed:', error)
        res.status(500).json({ 
          error: 'Process failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 檢查 label 一致性
 * 當相同的 code + value 在其他 OptionSet 中存在時，必須使用相同的 label
 */
async function checkLabelConsistency(
  db: admin.firestore.Firestore,
  code: string,
  items: Array<{ value: string; label: string }>
): Promise<{ valid: boolean; conflicts: Array<{ value: string; existingLabel: string; newLabel: string }> }> {
  if (!items || items.length === 0) {
    return { valid: true, conflicts: [] }
  }
  
  // 查找所有相同 code 的 OptionSets
  const existingQuery = await db.collection('optionSets')
    .where('code', '==', code)
    .get()
  
  if (existingQuery.empty) {
    return { valid: true, conflicts: [] }
  }
  
  // 建立現有 value -> label 的映射
  const existingLabels: Record<string, string> = {}
  existingQuery.docs.forEach(doc => {
    const data = doc.data()
    const existingItems = data.items || []
    existingItems.forEach((item: any) => {
      if (item.value && item.label) {
        existingLabels[item.value] = item.label
      }
    })
  })
  
  // 檢查新 items 是否有衝突
  const conflicts: Array<{ value: string; existingLabel: string; newLabel: string }> = []
  items.forEach(item => {
    const existingLabel = existingLabels[item.value]
    if (existingLabel && existingLabel !== item.label) {
      conflicts.push({
        value: item.value,
        existingLabel,
        newLabel: item.label
      })
    }
  })
  
  return { valid: conflicts.length === 0, conflicts }
}

/**
 * 🦄 UNICORN: 建立初始選項池（僅供管理員首次建立使用）
 * 之後的變更必須透過 optionRequests 工作流
 * 
 * NOTE: 允許多個 OptionSet 共用相同的 code（Faceted Option Sets）
 * 但強制相同 value 必須使用相同 label
 */
export const createOptionSet = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Admin 可以建立
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can create option sets' })
        return
      }
      
      try {
        const { code, name, description, items } = req.body
        
        // 🦄 UNICORN: 驗證 code（機器名稱）
        if (!code) {
          res.status(400).json({ error: 'Missing code (machine name)' })
          return
        }
        
        // 驗證 code 格式：只允許小寫字母開頭，包含小寫字母、數字、底線
        const codeRegex = /^[a-z][a-z0-9_]*$/
        if (!codeRegex.test(code)) {
          res.status(400).json({ 
            error: 'Invalid code format. Must start with lowercase letter and contain only lowercase letters, numbers, and underscores.' 
          })
          return
        }
        
        if (!name) {
          res.status(400).json({ error: 'Missing name' })
          return
        }
        
        const db = admin.firestore()
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 🦄 UNICORN: 允許 code 重複（Faceted Option Sets）
        // 但檢查 label 一致性 - 相同 code + value 必須使用相同 label
        const labelCheck = await checkLabelConsistency(db, code, items || [])
        if (!labelCheck.valid) {
          const conflictMsg = labelCheck.conflicts.map(c => 
            `"${c.value}": 現有 label 是 "${c.existingLabel}"，但你提供了 "${c.newLabel}"`
          ).join('; ')
          res.status(400).json({ 
            error: `Label 不一致！相同 code 的 OptionSet 中，相同 value 必須使用相同 label。衝突: ${conflictMsg}` 
          })
          return
        }
        
        // 建立新的選項池
        const docRef = await db.collection('optionSets').add({
          code,                        // 🦄 UNICORN: Machine name (can be shared)
          name,
          description: description || null,
          createdBy: user.email,
          createdAt: now,
          updatedAt: now,
          items: (items || []).map((item: any, index: number) => ({
            value: item.value,
            label: item.label,
            status: 'active', // 首次建立的選項直接是 active
            sort: index,
            createdAt: new Date().toISOString(),
            createdBy: user.email,
            labelHistory: []
          }))
        })
        
        // 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'CREATE_OPTION_SET',
          targetCollection: 'optionSets',
          targetId: docRef.id,
          performedBy: user.email,
          performedAt: now,
          metadata: { code, name, itemCount: items?.length || 0 }
        })
        
        console.log(`Option set "${name}" created by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          id: docRef.id,
          message: 'Option set created successfully'
        })
        
      } catch (error: any) {
        console.error('Create option set failed:', error)
        res.status(500).json({ 
          error: 'Create failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 匯出 Submissions 到回應
 */
export const exportSubmissions = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { templateId } = req.query
        
        let query = admin.firestore().collection('submissions')
        
        if (templateId) {
          query = query.where('templateId', '==', templateId) as any
        }
        
        const snapshot = await query.orderBy('createdAt', 'desc').get()
        
        const submissions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        res.status(200).json({ 
          success: true, 
          data: submissions,
          count: submissions.length
        })
        
      } catch (error: any) {
        console.error('Export failed:', error)
        res.status(500).json({ 
          error: 'Export failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 為現有選項池添加 code（遷移用）
 * Admin only
 * 
 * NOTE: 允許多個 OptionSet 共用相同的 code（Faceted Option Sets）
 * 但強制相同 value 必須使用相同 label
 */
export const migrateOptionSetCode = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Admin 可以執行遷移
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can migrate option sets' })
        return
      }
      
      try {
        const { optionSetId, code } = req.body
        
        if (!optionSetId || !code) {
          res.status(400).json({ error: 'Missing optionSetId or code' })
          return
        }
        
        // 驗證 code 格式
        const codeRegex = /^[a-z][a-z0-9_]*$/
        if (!codeRegex.test(code)) {
          res.status(400).json({ 
            error: 'Invalid code format. Must start with lowercase letter and contain only lowercase letters, numbers, and underscores.' 
          })
          return
        }
        
        const db = admin.firestore()
        
        // 檢查選項池是否存在
        const optionSetRef = db.collection('optionSets').doc(optionSetId)
        const optionSetDoc = await optionSetRef.get()
        
        if (!optionSetDoc.exists) {
          res.status(404).json({ error: 'Option set not found' })
          return
        }
        
        const optionSetData = optionSetDoc.data()!
        
        // 檢查是否已有 code
        if (optionSetData.code) {
          res.status(400).json({ 
            error: `Option set already has code: "${optionSetData.code}". Code is immutable.` 
          })
          return
        }
        
        // 🦄 UNICORN: 允許 code 重複（Faceted Option Sets）
        // 但檢查 label 一致性 - 相同 code + value 必須使用相同 label
        const items = optionSetData.items || []
        const labelCheck = await checkLabelConsistency(db, code, items)
        if (!labelCheck.valid) {
          const conflictMsg = labelCheck.conflicts.map(c => 
            `"${c.value}": 現有 label 是 "${c.existingLabel}"，但這裡是 "${c.newLabel}"`
          ).join('; ')
          res.status(400).json({ 
            error: `Label 不一致！相同 code 的 OptionSet 中，相同 value 必須使用相同 label。衝突: ${conflictMsg}` 
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 更新選項池
        await optionSetRef.update({
          code,
          updatedAt: now
        })
        
        // 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'MIGRATE_OPTION_SET_CODE',
          targetCollection: 'optionSets',
          targetId: optionSetId,
          performedBy: user.email,
          performedAt: now,
          metadata: { 
            name: optionSetData.name,
            newCode: code 
          }
        })
        
        console.log(`Option set ${optionSetId} migrated with code "${code}" by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: `Code "${code}" added to option set "${optionSetData.name}"`
        })
        
      } catch (error: any) {
        console.error('Migration failed:', error)
        res.status(500).json({ 
          error: 'Migration failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 刪除選項池（Admin 專用）
 * 只有 Admin 可以刪除選項池
 */
export const deleteOptionSet = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 DELETE 或 POST
      if (req.method !== 'DELETE' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Admin 可以刪除
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can delete option sets' })
        return
      }
      
      try {
        const { optionSetId } = req.body
        
        if (!optionSetId) {
          res.status(400).json({ error: 'Missing optionSetId' })
          return
        }
        
        const db = admin.firestore()
        const optionSetRef = db.collection('optionSets').doc(optionSetId)
        const optionSetDoc = await optionSetRef.get()
        
        if (!optionSetDoc.exists) {
          res.status(404).json({ error: 'Option set not found' })
          return
        }
        
        const optionSetData = optionSetDoc.data()!
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 刪除選項池
        await optionSetRef.delete()
        
        // 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'DELETE_OPTION_SET',
          targetCollection: 'optionSets',
          targetId: optionSetId,
          performedBy: user.email,
          performedAt: now,
          metadata: { 
            name: optionSetData.name,
            code: optionSetData.code,
            itemCount: optionSetData.items?.length || 0
          }
        })
        
        console.log(`Option set "${optionSetData.name}" deleted by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: `Option set "${optionSetData.name}" deleted successfully`
        })
        
      } catch (error: any) {
        console.error('Delete failed:', error)
        res.status(500).json({ 
          error: 'Delete failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 更新選項池（Admin 專用）
 * Admin 可以直接編輯選項池的 name、description、items
 */
export const updateOptionSet = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 PUT 或 POST
      if (req.method !== 'PUT' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Admin 可以更新
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can update option sets' })
        return
      }
      
      try {
        const { optionSetId, name, description, items } = req.body
        
        if (!optionSetId) {
          res.status(400).json({ error: 'Missing optionSetId' })
          return
        }
        
        const db = admin.firestore()
        const optionSetRef = db.collection('optionSets').doc(optionSetId)
        const optionSetDoc = await optionSetRef.get()
        
        if (!optionSetDoc.exists) {
          res.status(404).json({ error: 'Option set not found' })
          return
        }
        
        const optionSetData = optionSetDoc.data()!
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 準備更新的資料
        const updates: any = {
          updatedAt: now,
          updatedBy: user.email
        }
        
        if (name !== undefined) {
          updates.name = name
        }
        
        if (description !== undefined) {
          updates.description = description || null
        }
        
        if (items !== undefined) {
          // 🦄 UNICORN: 檢查 label 一致性（如果有 items 更新）
          const code = optionSetData.code
          if (code) {
            const labelCheck = await checkLabelConsistency(db, code, items)
            // 排除自己的 items
            const selfValues = new Set(optionSetData.items?.map((i: any) => i.value) || [])
            const filteredConflicts = labelCheck.conflicts.filter(c => !selfValues.has(c.value))
            
            if (filteredConflicts.length > 0) {
              const conflictMsg = filteredConflicts.map(c => 
                `"${c.value}": 其他 OptionSet 的 label 是 "${c.existingLabel}"，但你提供了 "${c.newLabel}"`
              ).join('; ')
              res.status(400).json({ 
                error: `Label 不一致！${conflictMsg}` 
              })
              return
            }
          }
          
          // 處理 items
          updates.items = items.map((item: any, index: number) => ({
            value: item.value,
            label: item.label,
            status: item.status || 'active',
            sort: index,
            createdAt: item.createdAt || new Date().toISOString(),
            createdBy: item.createdBy || user.email,
            labelHistory: item.labelHistory || []
          }))
        }
        
        // 更新選項池
        await optionSetRef.update(updates)
        
        // 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'UPDATE_OPTION_SET',
          targetCollection: 'optionSets',
          targetId: optionSetId,
          performedBy: user.email,
          performedAt: now,
          metadata: { 
            name: name || optionSetData.name,
            code: optionSetData.code,
            changes: Object.keys(updates).filter(k => k !== 'updatedAt' && k !== 'updatedBy')
          }
        })
        
        console.log(`Option set "${optionSetData.name}" updated by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Option set updated successfully'
        })
        
      } catch (error: any) {
        console.error('Update failed:', error)
        res.status(500).json({ 
          error: 'Update failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 批次上傳選項（Admin 專用）
 * 支援 CSV 格式：value,label 或 label（自動生成 value）
 */
export const batchUploadOptions = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // 只允許 POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      // 驗證用戶
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Admin 可以批次上傳
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can batch upload options' })
        return
      }
      
      try {
        const { optionSetId, csvData, mode } = req.body
        // mode: 'append' (新增) | 'replace' (取代所有) | 'merge' (合併，保留現有)
        
        if (!optionSetId) {
          res.status(400).json({ error: 'Missing optionSetId' })
          return
        }
        
        if (!csvData) {
          res.status(400).json({ error: 'Missing csvData' })
          return
        }
        
        const db = admin.firestore()
        const optionSetRef = db.collection('optionSets').doc(optionSetId)
        const optionSetDoc = await optionSetRef.get()
        
        if (!optionSetDoc.exists) {
          res.status(404).json({ error: 'Option set not found' })
          return
        }
        
        const optionSetData = optionSetDoc.data()!
        const existingItems = optionSetData.items || []
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 解析 CSV
        const lines = csvData.trim().split('\n').filter((line: string) => line.trim())
        const parsedItems: Array<{ value: string; label: string }> = []
        const errors: string[] = []
        
        lines.forEach((line: string, index: number) => {
          const parts = line.split(',').map((p: string) => p.trim())
          
          if (parts.length === 0 || !parts[0]) {
            errors.push(`Line ${index + 1}: Empty line`)
            return
          }
          
          let value: string
          let label: string
          
          if (parts.length >= 2) {
            // value,label 格式
            value = parts[0]
            label = parts[1]
          } else {
            // 只有 label，自動生成 value
            label = parts[0]
            value = parts[0]
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '')
              .substring(0, 30)
          }
          
          if (!value || !label) {
            errors.push(`Line ${index + 1}: Invalid format`)
            return
          }
          
          parsedItems.push({ value, label })
        })
        
        if (errors.length > 0 && parsedItems.length === 0) {
          res.status(400).json({ 
            error: 'CSV parsing failed', 
            details: errors 
          })
          return
        }
        
        // 🦄 UNICORN: 檢查 label 一致性
        const code = optionSetData.code
        if (code) {
          const labelCheck = await checkLabelConsistency(db, code, parsedItems)
          // 排除自己的 items
          const selfValues = new Set(existingItems.map((i: any) => i.value))
          const filteredConflicts = labelCheck.conflicts.filter(c => !selfValues.has(c.value))
          
          if (filteredConflicts.length > 0) {
            const conflictMsg = filteredConflicts.map(c => 
              `"${c.value}": 其他 OptionSet 的 label 是 "${c.existingLabel}"，但你提供了 "${c.newLabel}"`
            ).join('; ')
            res.status(400).json({ 
              error: `Label 不一致！${conflictMsg}` 
            })
            return
          }
        }
        
        // 根據模式處理
        let finalItems: any[]
        const uploadMode = mode || 'append'
        
        if (uploadMode === 'replace') {
          // 完全取代
          finalItems = parsedItems.map((item, index) => ({
            value: item.value,
            label: item.label,
            status: 'active',
            sort: index,
            createdAt: new Date().toISOString(),
            createdBy: user.email,
            labelHistory: []
          }))
        } else if (uploadMode === 'merge') {
          // 合併（保留現有，更新相同 value 的 label，新增新的）
          const existingMap = new Map<string, any>(existingItems.map((i: any) => [i.value, i]))
          
          parsedItems.forEach((item, index) => {
            if (existingMap.has(item.value)) {
              // 更新現有的 label
              const existing = existingMap.get(item.value) as any
              if (existing.label !== item.label) {
                const labelHistory = existing.labelHistory || []
                labelHistory.push({
                  label: existing.label,
                  changedAt: new Date().toISOString(),
                  changedBy: user.email,
                  reason: 'Batch upload merge'
                })
                existingMap.set(item.value, {
                  ...existing,
                  label: item.label,
                  labelHistory
                })
              }
            } else {
              // 新增
              existingMap.set(item.value, {
                value: item.value,
                label: item.label,
                status: 'active',
                sort: existingItems.length + index,
                createdAt: new Date().toISOString(),
                createdBy: user.email,
                labelHistory: []
              })
            }
          })
          
          finalItems = Array.from(existingMap.values())
        } else {
          // append（新增，跳過已存在的）
          const existingValues = new Set(existingItems.map((i: any) => i.value))
          const newItems = parsedItems
            .filter(item => !existingValues.has(item.value))
            .map((item, index) => ({
              value: item.value,
              label: item.label,
              status: 'active',
              sort: existingItems.length + index,
              createdAt: new Date().toISOString(),
              createdBy: user.email,
              labelHistory: []
            }))
          
          finalItems = [...existingItems, ...newItems]
        }
        
        // 更新選項池
        await optionSetRef.update({
          items: finalItems,
          updatedAt: now,
          updatedBy: user.email
        })
        
        // 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'BATCH_UPLOAD_OPTIONS',
          targetCollection: 'optionSets',
          targetId: optionSetId,
          performedBy: user.email,
          performedAt: now,
          metadata: { 
            name: optionSetData.name,
            code: optionSetData.code,
            mode: uploadMode,
            uploadedCount: parsedItems.length,
            finalCount: finalItems.length,
            errors: errors.length > 0 ? errors : null
          }
        })
        
        console.log(`Batch upload to "${optionSetData.name}" by ${user.email}: ${parsedItems.length} items (${uploadMode})`)
        
        res.status(200).json({ 
          success: true,
          message: `Successfully processed ${parsedItems.length} items`,
          stats: {
            uploaded: parsedItems.length,
            final: finalItems.length,
            mode: uploadMode,
            warnings: errors.length > 0 ? errors : undefined
          }
        })
        
      } catch (error: any) {
        console.error('Batch upload failed:', error)
        res.status(500).json({ 
          error: 'Batch upload failed', 
          message: error.message 
        })
      }
    })
  })

// ============================================
// 🦄 UNICORN: Draft System (Sandbox Layer)
// ============================================

/**
 * 🦄 UNICORN: 審核 OptionSet Draft（Admin 專用）
 * 核准時建立正式 OptionSet，拒絕時返回給 Leader 修改
 */
export const reviewOptionSetDraft = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can review drafts' })
        return
      }
      
      try {
        const { draftId, action, reviewNote } = req.body
        
        if (!draftId || !action) {
          res.status(400).json({ error: 'Missing draftId or action' })
          return
        }
        
        if (!['approve', 'reject'].includes(action)) {
          res.status(400).json({ error: 'Invalid action' })
          return
        }
        
        const db = admin.firestore()
        const draftRef = db.collection('optionSetDrafts').doc(draftId)
        const draftDoc = await draftRef.get()
        
        if (!draftDoc.exists) {
          res.status(404).json({ error: 'Draft not found' })
          return
        }
        
        const draftData = draftDoc.data()!
        
        if (draftData.status !== 'pending_review') {
          res.status(400).json({ 
            error: 'Draft is not pending review',
            currentStatus: draftData.status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        const batch = db.batch()
        
        if (action === 'reject') {
          // Reject: unfreeze draft for modification
          batch.update(draftRef, {
            status: 'rejected',
            reviewedAt: now,
            reviewedBy: user.email,
            reviewNote: reviewNote || null
          })
        } else {
          // Approve: create formal OptionSet
          const { code, name, description, items } = draftData
          
          // Check label consistency with existing OptionSets
          const labelCheck = await checkLabelConsistency(db, code, items || [])
          if (!labelCheck.valid) {
            const conflictMsg = labelCheck.conflicts.map((c: any) => 
              `"${c.value}": 現有 label 是 "${c.existingLabel}"，但 Draft 是 "${c.newLabel}"`
            ).join('; ')
            res.status(400).json({ 
              error: `Label 不一致！${conflictMsg}` 
            })
            return
          }
          
          // Create formal OptionSet
          const optionSetRef = db.collection('optionSets').doc()
          batch.set(optionSetRef, {
            code,
            name,
            description: description || null,
            createdBy: draftData.createdBy,
            createdAt: now,
            updatedAt: now,
            items: (items || []).map((item: any, index: number) => ({
              value: item.value,
              label: item.label,
              status: 'active',
              sort: index,
              createdAt: new Date().toISOString(),
              createdBy: draftData.createdBy,
              labelHistory: []
            }))
          })
          
          // Update draft
          batch.update(draftRef, {
            status: 'approved',
            reviewedAt: now,
            reviewedBy: user.email,
            reviewNote: reviewNote || null,
            createdOptionSetId: optionSetRef.id
          })
          
          // Audit log
          const auditRef = db.collection('auditLogs').doc()
          batch.set(auditRef, {
            action: 'APPROVE_OPTION_SET_DRAFT',
            targetCollection: 'optionSetDrafts',
            targetId: draftId,
            performedBy: user.email,
            performedAt: now,
            metadata: {
              draftId,
              createdOptionSetId: optionSetRef.id,
              code,
              name
            }
          })
        }
        
        await batch.commit()
        
        console.log(`OptionSet draft ${draftId} ${action}ed by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: `Draft ${action}ed successfully`
        })
        
      } catch (error: any) {
        console.error('Review draft failed:', error)
        res.status(500).json({ 
          error: 'Review failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 審核 Template Draft（Admin 專用）
 * 核准時建立正式 Template，拒絕時返回給 Leader 修改
 */
export const reviewTemplateDraft = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      if (!isAdminEmail(user.email)) {
        res.status(403).json({ error: 'Only admins can review drafts' })
        return
      }
      
      try {
        const { draftId, action, reviewNote } = req.body
        
        if (!draftId || !action) {
          res.status(400).json({ error: 'Missing draftId or action' })
          return
        }
        
        if (!['approve', 'reject'].includes(action)) {
          res.status(400).json({ error: 'Invalid action' })
          return
        }
        
        const db = admin.firestore()
        const draftRef = db.collection('templateDrafts').doc(draftId)
        const draftDoc = await draftRef.get()
        
        if (!draftDoc.exists) {
          res.status(404).json({ error: 'Draft not found' })
          return
        }
        
        const draftData = draftDoc.data()!
        
        if (draftData.status !== 'pending_review') {
          res.status(400).json({ 
            error: 'Draft is not pending review',
            currentStatus: draftData.status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        const batch = db.batch()
        
        if (action === 'reject') {
          // Reject: unfreeze draft for modification
          batch.update(draftRef, {
            status: 'rejected',
            reviewedAt: now,
            reviewedBy: user.email,
            reviewNote: reviewNote || null
          })
        } else {
          // Approve: create formal Template
          const { name, moduleId, actionId, fields, defaults } = draftData
          
          // Check if any referenced draft OptionSets need to be created first
          const usedDraftIds = draftData.usedDraftOptionSetIds || []
          for (const draftOptSetId of usedDraftIds) {
            const draftOptSetDoc = await db.collection('optionSetDrafts').doc(draftOptSetId).get()
            if (draftOptSetDoc.exists) {
              const draftOptSetData = draftOptSetDoc.data()!
              if (draftOptSetData.status !== 'approved') {
                res.status(400).json({ 
                  error: `Referenced Draft OptionSet "${draftOptSetData.name}" has not been approved yet. Please approve it first.`
                })
                return
              }
            }
          }
          
          // Create formal Template (version 1)
          const templateRef = db.collection('templates').doc()
          const version = 1
          
          batch.set(templateRef, {
            name,
            moduleId,
            actionId,
            enabled: true,
            version,
            createdBy: draftData.createdBy,
            createdAt: now,
            updatedAt: now,
            fields: fields || [],
            defaults: defaults || null
          })
          
          // Create version snapshot
          const versionRef = db.collection('templates').doc(templateRef.id)
            .collection('versions').doc(String(version))
          batch.set(versionRef, {
            name,
            moduleId,
            actionId,
            enabled: true,
            fields: fields || [],
            defaults: defaults || null,
            createdBy: draftData.createdBy,
            createdAt: now
          })
          
          // Update draft
          batch.update(draftRef, {
            status: 'approved',
            reviewedAt: now,
            reviewedBy: user.email,
            reviewNote: reviewNote || null,
            createdTemplateId: templateRef.id
          })
          
          // Audit log
          const auditRef = db.collection('auditLogs').doc()
          batch.set(auditRef, {
            action: 'APPROVE_TEMPLATE_DRAFT',
            targetCollection: 'templateDrafts',
            targetId: draftId,
            performedBy: user.email,
            performedAt: now,
            metadata: {
              draftId,
              createdTemplateId: templateRef.id,
              name,
              moduleId,
              actionId
            }
          })
        }
        
        await batch.commit()
        
        console.log(`Template draft ${draftId} ${action}ed by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: `Draft ${action}ed successfully`
        })
        
      } catch (error: any) {
        console.error('Review draft failed:', error)
        res.status(500).json({ 
          error: 'Review failed', 
          message: error.message 
        })
      }
    })
  })

// ============================================
// 🦄 Master/Subset Migration
// ============================================

export const migrateOptionSetsToMaster = functions.region('asia-east1').https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Verify authentication and admin
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Check if user is admin (same check as in rules)
      const admins = ['joeshi@dbyv.org']
      if (!admins.includes(user.email || '')) {
        res.status(403).json({ error: 'Forbidden: Admin only' })
        return
      }

      const db = admin.firestore()
      
      // Get all OptionSets
      const snapshot = await db.collection('optionSets').get()
      
      let updated = 0
      const errors: string[] = []
      let batch = db.batch()
      let batchCount = 0
      
      for (const doc of snapshot.docs) {
        const data = doc.data()
        
        // Skip if already has isMaster field
        if (data.isMaster !== undefined) continue
        
        try {
          batch.update(doc.ref, {
            isMaster: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          })
          
          updated++
          batchCount++
          
          // Firestore batch limit is 500
          if (batchCount >= 500) {
            await batch.commit()
            batch = db.batch()
            batchCount = 0
          }
          
        } catch (error: any) {
          errors.push(`${data.name || doc.id}: ${error.message}`)
        }
      }
      
      // Commit remaining
      if (batchCount > 0) {
        await batch.commit()
      }
      
      console.log(`OptionSets migration completed: ${updated} updated, ${errors.length} errors`)
      
      res.status(200).json({
        success: true,
        updated,
        errors
      })
      
    } catch (error: any) {
      console.error('Migration failed:', error)
      res.status(500).json({
        error: 'Migration failed',
        message: error.message
      })
    }
  })
})

// ============================================
// 🦄 UNICORN: Submission Workflow Operations
// ============================================

/**
 * 🦄 UNICORN: 重新啟用 Submission（CANCELLED → ACTIVE）
 * Owner 可以重新啟用被取消的 submission（非 locked）
 */
export const reactivateSubmission = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { submissionId } = req.body
        
        if (!submissionId) {
          res.status(400).json({ error: 'Missing submissionId' })
          return
        }
        
        const db = admin.firestore()
        const submissionRef = db.collection('submissions').doc(submissionId)
        const submissionDoc = await submissionRef.get()
        
        if (!submissionDoc.exists) {
          res.status(404).json({ error: 'Submission not found' })
          return
        }
        
        const submissionData = submissionDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - 只有 owner 可以重新啟用
        if (submissionData._submitterEmail !== user.email) {
          res.status(403).json({ error: 'Only owner can reactivate submission' })
          return
        }
        
        // 🦄 UNICORN: 狀態檢查 - 只有 CANCELLED 且未 locked 可以重新啟用
        if (submissionData._status !== 'CANCELLED') {
          res.status(400).json({ 
            error: 'Can only reactivate CANCELLED submissions',
            currentStatus: submissionData._status
          })
          return
        }
        
        if (submissionData._isLocked) {
          res.status(400).json({ error: 'Cannot reactivate locked submission' })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        await submissionRef.update({
          _status: 'ACTIVE',
          updatedAt: now
        })
        
        // 🦄 UNICORN: 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'REACTIVATE_SUBMISSION',
          targetCollection: 'submissions',
          targetId: submissionId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            templateId: submissionData._templateId,
            previousStatus: 'CANCELLED'
          }
        })
        
        console.log(`Submission ${submissionId} reactivated by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Submission reactivated successfully'
        })
        
      } catch (error: any) {
        console.error('Reactivate submission failed:', error)
        res.status(500).json({ 
          error: 'Reactivate failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 鎖定 Submission（ACTIVE → LOCKED）
 * Owner 或 Superuser 可以鎖定 submission
 */
export const lockSubmission = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { submissionId } = req.body
        
        if (!submissionId) {
          res.status(400).json({ error: 'Missing submissionId' })
          return
        }
        
        const db = admin.firestore()
        const submissionRef = db.collection('submissions').doc(submissionId)
        const submissionDoc = await submissionRef.get()
        
        if (!submissionDoc.exists) {
          res.status(404).json({ error: 'Submission not found' })
          return
        }
        
        const submissionData = submissionDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - Owner 或 Superuser
        const canLock = submissionData._submitterEmail === user.email || isSuperuserEmail(user.email)
        if (!canLock) {
          res.status(403).json({ error: 'Only owner or superuser can lock submission' })
          return
        }
        
        // 🦄 UNICORN: 狀態檢查 - 只有 ACTIVE 可以鎖定
        if (submissionData._status !== 'ACTIVE') {
          res.status(400).json({ 
            error: 'Can only lock ACTIVE submissions',
            currentStatus: submissionData._status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        await submissionRef.update({
          _status: 'LOCKED',
          _isLocked: true,
          _lockedAt: now,
          _lockedBy: user.email,
          updatedAt: now
        })
        
        // 🦄 UNICORN: 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'LOCK_SUBMISSION',
          targetCollection: 'submissions',
          targetId: submissionId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            templateId: submissionData._templateId,
            isSuperuser: isSuperuserEmail(user.email)
          }
        })
        
        console.log(`Submission ${submissionId} locked by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Submission locked successfully'
        })
        
      } catch (error: any) {
        console.error('Lock submission failed:', error)
        res.status(500).json({ 
          error: 'Lock failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 解鎖 Submission（LOCKED → ACTIVE）
 * 只有 Superuser 可以解鎖，並記錄警告
 */
export const unlockSubmission = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      // 🦄 UNICORN: 權限檢查 - 只有 Superuser
      if (!isSuperuserEmail(user.email)) {
        res.status(403).json({ error: 'Only superuser can unlock submission' })
        return
      }
      
      try {
        const { submissionId } = req.body
        
        if (!submissionId) {
          res.status(400).json({ error: 'Missing submissionId' })
          return
        }
        
        const db = admin.firestore()
        const submissionRef = db.collection('submissions').doc(submissionId)
        const submissionDoc = await submissionRef.get()
        
        if (!submissionDoc.exists) {
          res.status(404).json({ error: 'Submission not found' })
          return
        }
        
        const submissionData = submissionDoc.data()!
        
        // 🦄 UNICORN: 狀態檢查 - 只有 LOCKED 可以解鎖
        if (submissionData._status !== 'LOCKED') {
          res.status(400).json({ 
            error: 'Can only unlock LOCKED submissions',
            currentStatus: submissionData._status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        await submissionRef.update({
          _status: 'ACTIVE',
          _isLocked: false,
          updatedAt: now
        })
        
        // 🦄 UNICORN: 寫入 audit log（含警告標記）
        await db.collection('auditLogs').add({
          action: 'UNLOCK_SUBMISSION',
          targetCollection: 'submissions',
          targetId: submissionId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            templateId: submissionData._templateId,
            warning: 'Unlocked a LOCKED submission - should use reverse/correction if processed'
          }
        })
        
        console.log(`Submission ${submissionId} unlocked by ${user.email} (WARNING)`)
        
        res.status(200).json({ 
          success: true,
          message: 'Submission unlocked successfully',
          warning: 'If this submission was already processed, you should have used reverse/correction instead'
        })
        
      } catch (error: any) {
        console.error('Unlock submission failed:', error)
        res.status(500).json({ 
          error: 'Unlock failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 創建沖銷 Submission
 * Owner 或 Superuser 可以為 LOCKED submission 創建 reverse
 * 🚨 CRITICAL: 不修改原始 LOCKED submission
 */
export const createReverseSubmission = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { targetSubmissionId, modifiedData } = req.body
        
        if (!targetSubmissionId) {
          res.status(400).json({ error: 'Missing targetSubmissionId' })
          return
        }
        
        const db = admin.firestore()
        const targetRef = db.collection('submissions').doc(targetSubmissionId)
        const targetDoc = await targetRef.get()
        
        if (!targetDoc.exists) {
          res.status(404).json({ error: 'Target submission not found' })
          return
        }
        
        const targetData = targetDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - Owner 或 Superuser
        const canCreate = targetData._submitterEmail === user.email || isSuperuserEmail(user.email)
        if (!canCreate) {
          res.status(403).json({ error: 'Only owner or superuser can create reverse' })
          return
        }
        
        // 🦄 UNICORN: 狀態檢查 - 只有 LOCKED 可以創建 reverse
        if (targetData._status !== 'LOCKED') {
          res.status(400).json({ 
            error: 'Can only create reverse for LOCKED submissions',
            currentStatus: targetData._status
          })
          return
        }
        
        // 🦄 UNICORN: 約束檢查 - 不能有現存的 ACTIVE reverse
        const existingReverse = await db.collection('submissions')
          .where('_reverseOf', '==', targetSubmissionId)
          .where('_status', '==', 'ACTIVE')
          .limit(1)
          .get()
        
        if (!existingReverse.empty) {
          res.status(400).json({ 
            error: 'An active reverse submission already exists for this submission',
            existingReverseId: existingReverse.docs[0].id
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 🦄 UNICORN: 創建新 submission（不修改原始）
        const newSubmission: any = {
          ...modifiedData,
          _templateId: targetData._templateId,
          _templateModule: targetData._templateModule,
          _templateAction: targetData._templateAction,
          _templateVersion: targetData._templateVersion,
          _submitterId: user.uid || targetData._submitterId,
          _submitterEmail: user.email,
          _submittedAt: now,
          _submittedMonth: new Date().toISOString().slice(0, 7),
          _status: 'ACTIVE',
          _reverseOf: targetSubmissionId,  // 🦄 只有新文檔有這個欄位
          _fieldLabels: targetData._fieldLabels,
          _optionLabels: targetData._optionLabels,
          files: modifiedData.files || [],
          createdAt: now,
          updatedAt: now
        }
        
        const newRef = await db.collection('submissions').add(newSubmission)
        
        // 🦄 UNICORN: 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'CREATE_REVERSE_SUBMISSION',
          targetCollection: 'submissions',
          targetId: newRef.id,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            reverseOf: targetSubmissionId,
            templateId: targetData._templateId,
            isSuperuser: isSuperuserEmail(user.email)
          }
        })
        
        console.log(`Reverse submission ${newRef.id} created for ${targetSubmissionId} by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Reverse submission created successfully',
          newSubmissionId: newRef.id
        })
        
      } catch (error: any) {
        console.error('Create reverse submission failed:', error)
        res.status(500).json({ 
          error: 'Create reverse failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 創建更正 Submission
 * Owner 或 Superuser 可以為 LOCKED submission 創建 correction
 * 🚨 CRITICAL: 不修改原始 LOCKED submission
 */
export const createCorrectionSubmission = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { targetSubmissionId, modifiedData } = req.body
        
        if (!targetSubmissionId) {
          res.status(400).json({ error: 'Missing targetSubmissionId' })
          return
        }
        
        const db = admin.firestore()
        const targetRef = db.collection('submissions').doc(targetSubmissionId)
        const targetDoc = await targetRef.get()
        
        if (!targetDoc.exists) {
          res.status(404).json({ error: 'Target submission not found' })
          return
        }
        
        const targetData = targetDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - Owner 或 Superuser
        const canCreate = targetData._submitterEmail === user.email || isSuperuserEmail(user.email)
        if (!canCreate) {
          res.status(403).json({ error: 'Only owner or superuser can create correction' })
          return
        }
        
        // 🦄 UNICORN: 狀態檢查 - 只有 LOCKED 可以創建 correction
        if (targetData._status !== 'LOCKED') {
          res.status(400).json({ 
            error: 'Can only create correction for LOCKED submissions',
            currentStatus: targetData._status
          })
          return
        }
        
        // 🦄 UNICORN: 約束檢查 - 不能有現存的 ACTIVE correction
        const existingCorrection = await db.collection('submissions')
          .where('_correctFor', '==', targetSubmissionId)
          .where('_status', '==', 'ACTIVE')
          .limit(1)
          .get()
        
        if (!existingCorrection.empty) {
          res.status(400).json({ 
            error: 'An active correction submission already exists for this submission',
            existingCorrectionId: existingCorrection.docs[0].id
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // 🦄 UNICORN: 創建新 submission（不修改原始）
        const newSubmission: any = {
          ...modifiedData,
          _templateId: targetData._templateId,
          _templateModule: targetData._templateModule,
          _templateAction: targetData._templateAction,
          _templateVersion: targetData._templateVersion,
          _submitterId: user.uid || targetData._submitterId,
          _submitterEmail: user.email,
          _submittedAt: now,
          _submittedMonth: new Date().toISOString().slice(0, 7),
          _status: 'ACTIVE',
          _correctFor: targetSubmissionId,  // 🦄 只有新文檔有這個欄位
          _fieldLabels: targetData._fieldLabels,
          _optionLabels: targetData._optionLabels,
          files: modifiedData.files || [],
          createdAt: now,
          updatedAt: now
        }
        
        const newRef = await db.collection('submissions').add(newSubmission)
        
        // 🦄 UNICORN: 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'CREATE_CORRECTION_SUBMISSION',
          targetCollection: 'submissions',
          targetId: newRef.id,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            correctFor: targetSubmissionId,
            templateId: targetData._templateId,
            isSuperuser: isSuperuserEmail(user.email)
          }
        })
        
        console.log(`Correction submission ${newRef.id} created for ${targetSubmissionId} by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Correction submission created successfully',
          newSubmissionId: newRef.id
        })
        
      } catch (error: any) {
        console.error('Create correction submission failed:', error)
        res.status(500).json({ 
          error: 'Create correction failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 回報 Submission 問題
 * 用戶可以對 LOCKED submission 回報問題，發送郵件給 owner 和 managers
 */
export const reportSubmissionIssue = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { submissionId, issueDescription } = req.body
        
        if (!submissionId || !issueDescription) {
          res.status(400).json({ error: 'Missing submissionId or issueDescription' })
          return
        }
        
        const db = admin.firestore()
        const submissionRef = db.collection('submissions').doc(submissionId)
        const submissionDoc = await submissionRef.get()
        
        if (!submissionDoc.exists) {
          res.status(404).json({ error: 'Submission not found' })
          return
        }
        
        const submissionData = submissionDoc.data()!
        
        // 🦄 UNICORN: 狀態檢查 - 只能回報 LOCKED submission
        if (submissionData._status !== 'LOCKED') {
          res.status(400).json({ 
            error: 'Can only report issues for LOCKED submissions',
            currentStatus: submissionData._status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        // TODO: 實作郵件發送邏輯
        // 這裡應該使用 SendGrid 或其他郵件服務
        // 發送給 submissionData._submitterEmail 和 template managers
        
        console.log(`Issue reported for submission ${submissionId} by ${user.email}`)
        console.log(`Issue: ${issueDescription}`)
        console.log(`Should notify: ${submissionData._submitterEmail}`)
        
        // 🦄 UNICORN: 寫入 audit log
        await db.collection('auditLogs').add({
          action: 'REPORT_SUBMISSION_ISSUE',
          targetCollection: 'submissions',
          targetId: submissionId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            templateId: submissionData._templateId,
            issueDescription,
            notifiedEmail: submissionData._submitterEmail
          }
        })
        
        res.status(200).json({ 
          success: true,
          message: 'Issue reported successfully. Owner will be notified.'
        })
        
      } catch (error: any) {
        console.error('Report issue failed:', error)
        res.status(500).json({ 
          error: 'Report failed', 
          message: error.message 
        })
      }
    })
  })

// ============================================
// 🦄 UNICORN: User Stats and Request Management
// ============================================

/**
 * 🦄 UNICORN: Submission 創建時自動更新用戶統計
 * Write-time decision: useCount 和 lastUsedAt 在提交時計算
 */
export const onSubmissionCreated = functions
  .region('asia-east1')
  .firestore.document('submissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const submissionData = snap.data()
    const db = admin.firestore()
    
    try {
      const userEmail = submissionData._submitterEmail
      const templateId = submissionData._templateId
      const templateName = submissionData._templateName || 'Unknown Template'
      
      // 🦄 UNICORN: statsId = userEmail_templateId
      const statsId = `${userEmail}_${templateId}`
      const statsRef = db.collection('userFormStats').doc(statsId)
      const statsDoc = await statsRef.get()
      
      const now = admin.firestore.FieldValue.serverTimestamp()
      
      if (statsDoc.exists) {
        // 更新現有統計
        await statsRef.update({
          useCount: admin.firestore.FieldValue.increment(1),
          lastUsedAt: now
        })
      } else {
        // 創建新統計
        await statsRef.set({
          userEmail,
          templateId,
          templateName,
          useCount: 1,
          lastUsedAt: now,
          isFavorite: false
        })
      }
      
      console.log(`Updated userFormStats for ${userEmail} - ${templateId}`)
      
    } catch (error: any) {
      console.error('Update userFormStats failed:', error)
      // 不拋出錯誤，避免阻擋 submission 創建
    }
  })

/**
 * 🦄 UNICORN: 處理表格權限申請
 * Superuser 或表格 Owner/Manager 可以審核
 */
export const processFormAccessRequest = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { requestId, action } = req.body
        
        if (!requestId || !action) {
          res.status(400).json({ error: 'Missing requestId or action' })
          return
        }
        
        if (!['approve', 'reject'].includes(action)) {
          res.status(400).json({ error: 'Invalid action' })
          return
        }
        
        const db = admin.firestore()
        const requestRef = db.collection('formAccessRequests').doc(requestId)
        const requestDoc = await requestRef.get()
        
        if (!requestDoc.exists) {
          res.status(404).json({ error: 'Request not found' })
          return
        }
        
        const requestData = requestDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - Superuser 或 Owner/Manager
        const canProcess = isSuperuserEmail(user.email) ||
                          requestData.ownerEmail === user.email ||
                          (requestData.managerEmails || []).includes(user.email)
        
        if (!canProcess) {
          res.status(403).json({ error: 'You do not have permission to process this request' })
          return
        }
        
        if (requestData.status !== 'pending') {
          res.status(400).json({ 
            error: 'Request already processed',
            currentStatus: requestData.status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        const batch = db.batch()
        
        // Update request status
        batch.update(requestRef, {
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedAt: now,
          reviewedBy: user.email,
          _notifiedAt: now  // 🦄 UNICORN: Idempotency
        })
        
        // If approved, add to template's accessWhitelist
        if (action === 'approve') {
          const templateRef = db.collection('templates').doc(requestData.templateId)
          const templateDoc = await templateRef.get()
          
          if (templateDoc.exists) {
            const templateData = templateDoc.data()!
            const currentWhitelist = templateData.accessWhitelist || []
            
            if (!currentWhitelist.includes(requestData.requesterEmail)) {
              batch.update(templateRef, {
                accessWhitelist: [...currentWhitelist, requestData.requesterEmail],
                updatedAt: now
              })
            }
          }
        }
        
        // 🦄 UNICORN: Audit log
        const auditRef = db.collection('auditLogs').doc()
        batch.set(auditRef, {
          action: `FORM_ACCESS_REQUEST_${action.toUpperCase()}`,
          targetCollection: 'formAccessRequests',
          targetId: requestId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            templateId: requestData.templateId,
            requesterEmail: requestData.requesterEmail,
            isSuperuser: isSuperuserEmail(user.email)
          }
        })
        
        await batch.commit()
        
        console.log(`Form access request ${requestId} ${action}ed by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: `Request ${action}ed successfully`
        })
        
      } catch (error: any) {
        console.error('Process request failed:', error)
        res.status(500).json({ 
          error: 'Process failed', 
          message: error.message 
        })
      }
    })
  })

/**
 * 🦄 UNICORN: 審核表格建議
 * Superuser 或表格 Owner 可以審核
 */
export const reviewTemplateSuggestion = functions
  .region('asia-east1')
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }
      
      const user = await verifyIdToken(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      
      try {
        const { suggestionId, status, reviewNote } = req.body
        
        if (!suggestionId || !status) {
          res.status(400).json({ error: 'Missing suggestionId or status' })
          return
        }
        
        if (!['reviewed', 'implemented'].includes(status)) {
          res.status(400).json({ error: 'Invalid status' })
          return
        }
        
        const db = admin.firestore()
        const suggestionRef = db.collection('templateSuggestions').doc(suggestionId)
        const suggestionDoc = await suggestionRef.get()
        
        if (!suggestionDoc.exists) {
          res.status(404).json({ error: 'Suggestion not found' })
          return
        }
        
        const suggestionData = suggestionDoc.data()!
        
        // Get template to check ownership
        const templateRef = db.collection('templates').doc(suggestionData.templateId)
        const templateDoc = await templateRef.get()
        
        if (!templateDoc.exists) {
          res.status(404).json({ error: 'Template not found' })
          return
        }
        
        const templateData = templateDoc.data()!
        
        // 🦄 UNICORN: 權限檢查 - Superuser 或 Owner
        const canReview = isSuperuserEmail(user.email) || templateData.createdBy === user.email
        
        if (!canReview) {
          res.status(403).json({ error: 'Only template owner or superuser can review suggestions' })
          return
        }
        
        if (suggestionData.status !== 'pending') {
          res.status(400).json({ 
            error: 'Suggestion already reviewed',
            currentStatus: suggestionData.status
          })
          return
        }
        
        const now = admin.firestore.FieldValue.serverTimestamp()
        
        await suggestionRef.update({
          status,
          reviewedAt: now,
          reviewedBy: user.email,
          reviewNote: reviewNote || null,
          _notifiedAt: now  // 🦄 UNICORN: Idempotency
        })
        
        // 🦄 UNICORN: Audit log
        await db.collection('auditLogs').add({
          action: 'TEMPLATE_SUGGESTION_REVIEWED',
          targetCollection: 'templateSuggestions',
          targetId: suggestionId,
          performedBy: user.email,
          performedAt: now,
          metadata: {
            templateId: suggestionData.templateId,
            suggesterEmail: suggestionData.suggesterEmail,
            newStatus: status,
            isSuperuser: isSuperuserEmail(user.email)
          }
        })
        
        console.log(`Template suggestion ${suggestionId} reviewed by ${user.email}`)
        
        res.status(200).json({ 
          success: true,
          message: 'Suggestion reviewed successfully'
        })
        
      } catch (error: any) {
        console.error('Review suggestion failed:', error)
        res.status(500).json({ 
          error: 'Review failed', 
          message: error.message 
        })
      }
    })
  })
