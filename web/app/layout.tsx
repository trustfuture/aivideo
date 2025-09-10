import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import QueryProvider from '@/components/providers/query-provider'
import { I18nProvider } from '@/components/providers/i18n-provider'
import AppShell from '@/components/ui/app-shell'
import Script from 'next/script'
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand'

export const metadata: Metadata = {
  title: `${BRAND_NAME} – Studio`,
  description: BRAND_TAGLINE
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {`
          try {
            const t = localStorage.getItem('theme') || 'system';
            const m = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const dark = t === 'dark' || (t === 'system' && m);
            document.documentElement.classList.toggle('dark', dark);
          } catch (e) {}
          `}
        </Script>
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
