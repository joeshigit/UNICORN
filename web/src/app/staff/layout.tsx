'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { 
    href: '/staff', 
    label: '填報中心',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  { 
    href: '/staff/my-submissions', 
    label: '我的提交',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    )
  },
]

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, signOut, isDeveloper } = useAuth()
  const pathname = usePathname()

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-200">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/staff" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white text-xl">✦</span>
                </div>
                <div>
                  <h1 className="font-bold text-gray-900">獨角獸</h1>
                  <p className="text-xs text-gray-500">資料填報中心</p>
                </div>
              </Link>

              {/* Nav */}
              <nav className="hidden sm:flex items-center gap-1">
                {navItems.map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item.icon}
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className="flex items-center gap-3">
                {isDeveloper && (
                  <Link
                    href="/leader"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors"
                    title="Developer Console"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Dev
                  </Link>
                )}
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.displayName || user?.email?.split('@')[0]}
                  </p>
                </div>
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-9 h-9 rounded-full border-2 border-blue-200"
                  />
                )}
                <button
                  onClick={signOut}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="登出"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Nav */}
          <div className="sm:hidden border-t border-gray-100 px-4 py-2 flex gap-1">
            {navItems.map(item => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              )
            })}
            {isDeveloper && (
              <Link
                href="/leader"
                className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center gap-1.5 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Dev
              </Link>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
