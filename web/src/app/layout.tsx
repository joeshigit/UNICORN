import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/auth'

export const metadata: Metadata = {
  title: '獨角獸 Unicorn Capture',
  description: '個人用資料收集系統',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
