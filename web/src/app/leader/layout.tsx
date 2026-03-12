'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth'
import { isAdmin } from '@/lib/auth'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const navItems = [
  { 
    href: '/leader', 
    label: '所有表格',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  { 
    href: '/leader/create', 
    label: '建立表格',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    )
  },
  { 
    href: '/leader/option-sets', 
    label: '選項池',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  },
]

export default function LeaderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, signOut, isDeveloper } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (user && !isDeveloper) {
      router.push('/staff')
    }
  }, [user, isDeveloper, router])

  if (user && !isDeveloper) {
    return null
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-violet-100">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/leader" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                  <span className="text-white text-xl">&#x2726;</span>
                </div>
                <div>
                  <h1 className="font-bold text-gray-900">獨角獸</h1>
                  <p className="text-xs text-gray-500">Developer Console</p>
                </div>
              </Link>

              <nav className="hidden md:flex items-center gap-1">
                {navItems.map(item => {
                  const isActive = pathname === item.href || 
                    (item.href !== '/leader' && pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        isActive
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item.icon}
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className="flex items-center gap-4">
                <Link
                  href="/staff"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1"
                  title="前往填報中心"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="hidden lg:inline">填報中心</span>
                </Link>
                
                {isAdmin(user) && (
                  <Link
                    href="/admin"
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    管理員
                  </Link>
                )}
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.displayName || user?.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-purple-600">Developer</p>
                </div>
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-9 h-9 rounded-full border-2 border-purple-200"
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

          <div className="md:hidden border-t border-gray-100 px-4 py-2 flex gap-1 overflow-x-auto">
            {navItems.map(item => {
              const isActive = pathname === item.href || 
                (item.href !== '/leader' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
