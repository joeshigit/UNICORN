'use client'

import { Settings, Save, Info } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div>
      {/* 標題 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          設定
        </h1>
        <p className="text-gray-500 mt-1">
          系統設定與管理
        </p>
      </div>

      {/* 提示 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-blue-800 font-medium">Stage 1 佔位</p>
          <p className="text-sm text-blue-600">
            此頁面的功能將在後續版本中完善。目前可先使用表格和選項池管理功能。
          </p>
        </div>
      </div>

      {/* 分類與動作命名（佔位） */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">分類與動作命名</h2>
        <p className="text-sm text-gray-500 mb-4">
          定義系統中使用的 Module（分類）和 Action（動作）名稱
        </p>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Module（分類）
            </label>
            <textarea
              placeholder="FINANCE&#10;CAMP&#10;ACTIVITY"
              className="input-field"
              rows={4}
              disabled
            />
            <p className="text-xs text-gray-400 mt-1">每行一個</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Action（動作）
            </label>
            <textarea
              placeholder="REGISTER&#10;REIMBURSEMENT&#10;RECORD"
              className="input-field"
              rows={4}
              disabled
            />
            <p className="text-xs text-gray-400 mt-1">每行一個</p>
          </div>
        </div>

        <button className="btn-secondary mt-4 flex items-center gap-2" disabled>
          <Save className="w-4 h-4" />
          儲存（即將推出）
        </button>
      </div>

      {/* Leader 名單（佔位） */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Leader 權限</h2>
        <p className="text-sm text-gray-500 mb-4">
          管理誰可以存取「表格設定平台」
        </p>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Leader Email 名單
          </label>
          <textarea
            placeholder="leader1@dbyv.org&#10;leader2@dbyv.org"
            className="input-field"
            rows={4}
            disabled
          />
          <p className="text-xs text-gray-400 mt-1">
            每行一個 email，目前使用程式碼內的白名單
          </p>
        </div>

        <button className="btn-secondary mt-4 flex items-center gap-2" disabled>
          <Save className="w-4 h-4" />
          儲存（即將推出）
        </button>
      </div>
    </div>
  )
}




