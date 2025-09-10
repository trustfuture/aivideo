import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import QueryProvider from '@/components/providers/query-provider'
import { I18nProvider } from '@/components/providers/i18n-provider'
import TopNav from '@/components/topbar/top-nav'

export const metadata: Metadata = {
  title: 'MoneyPrinterTurbo – Studio',
  description: 'Next.js frontend for controllable short-video generation.'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <QueryProvider>
          <I18nProvider>
            <div className="grid min-h-screen grid-rows-[auto,1fr]">
              <header className="border-b bg-white">
                <TopNav />
              </header>
              <main className="mx-auto w-full max-w-7xl p-4">{children}</main>
              <Toaster richColors closeButton position="top-center" />
            </div>
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
