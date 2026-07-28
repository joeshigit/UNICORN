'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ClipboardList, Database, LayoutGrid, ListTree, LogOut, Menu, Sparkles, Users, X } from 'lucide-react'
import { useAuth } from '@/components/auth'
import { APP_NAME, APP_SUBTITLE, SUPERUSERS } from '@/lib/config'
import { Spinner } from '@/components/ui'

const NAV = [
  { href: '/fill', label: '填報', icon: ClipboardList, desc: '選一張表格填寫' },
  { href: '/data', label: '資料池', icon: Database, desc: '查詢與匯出所有提交' },
  { href: '/forms', label: '表格', icon: LayoutGrid, desc: '建立與管理表格' },
  { href: '/options', label: '選項池', icon: ListTree, desc: '管理 KEY 與標準值' },
  { href: '/users', label: '權限', icon: Users, desc: '設定各群組管理員' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, isSuperuser, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [loading, user, router])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  // Active navigation based on user role
  const activeNav = isSuperuser
    ? NAV
    : NAV.filter(item => item.label === '填報' || item.label === '資料池')

  const nav = (
    <nav className="space-y-1">
      {activeNav.map(item => {
        const active = pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
              active ? 'bg-unicorn-50 text-unicorn-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs text-slate-400">{item.desc}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/fill" className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 text-unicorn-600" />
          {APP_NAME}
        </Link>
        <button className="btn-ghost btn-sm" onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {menuOpen && (
        <div className="border-b border-slate-200 bg-white p-4 lg:hidden">
          {nav}
          <button
            className="btn-ghost mt-2 w-full justify-start"
            onClick={() => signOut().then(() => router.replace('/'))}
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <Link href="/fill" className="mb-6 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-unicorn-100">
            <Sparkles className="h-5 w-5 text-unicorn-600" />
          </span>
          <span>
            <span className="block font-semibold leading-tight">{APP_NAME}</span>
            <span className="block text-xs text-slate-400">{APP_SUBTITLE}</span>
          </span>
        </Link>

        {nav}

        <div className="mt-auto border-t border-slate-100 pt-4">
          <p className="truncate px-3 text-xs text-slate-400">{user.email}</p>
          <button
            className="btn-ghost mt-1 w-full justify-start"
            onClick={() => signOut().then(() => router.replace('/'))}
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
