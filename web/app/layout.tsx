import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import QueryProvider from '@/components/providers/query-provider'
import { I18nProvider } from '@/components/providers/i18n-provider'
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
            const d = localStorage.getItem('density') || 'compact';
            const r = localStorage.getItem('radius') || 'sm';
            const m = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const dark = t === 'dark' || (t === 'system' && m);
            document.documentElement.classList.toggle('dark', dark);
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
            document.documentElement.setAttribute('data-density', d);
            const radiusMap = { xs: '6px', sm: '8px', md: '10px' };
            document.documentElement.style.setProperty('--radius', radiusMap[r] || '8px');
          } catch (e) {}
          `}
        </Script>
        <QueryProvider>
          <I18nProvider>
            {children}
            <Toaster richColors closeButton position="top-center" />
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
