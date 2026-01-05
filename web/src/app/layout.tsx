import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '獨角獸 - Unicorn DataCaptureSystem',
  description: '公司內部資料收集平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}




