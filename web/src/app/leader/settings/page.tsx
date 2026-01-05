'use client'

// Leader Settings Page (Placeholder)

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-gray-500 mt-1">
          系統設定與偏好
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-gray-600">
          設定功能佔位，未來將包含：
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-500 list-disc list-inside">
          <li>分類（Module）管理</li>
          <li>動作（Action）管理</li>
          <li>個人偏好設定</li>
        </ul>
      </div>
    </div>
  )
}
