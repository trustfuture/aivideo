import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import QueryProvider from '@/components/providers/query-provider'
import { I18nProvider } from '@/components/providers/i18n-provider'
import AppShell from '@/components/ui/app-shell'

export const metadata: Metadata = {
  title: 'MoneyPrinterTurbo – Studio',
  description: 'Next.js frontend for controllable short-video generation.'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <QueryProvider>
          <I18nProvider>
            <AppShell>
              {children}
            </AppShell>
            <Toaster richColors closeButton position="top-center" />
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
