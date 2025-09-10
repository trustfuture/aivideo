"use client"
import Link from 'next/link'
import { BusyIndicator } from '@/components/ui/busy-indicator'
import { LanguageSwitch } from '@/components/topbar/language-switch'
import { useI18n } from '@/components/providers/i18n-provider'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { BRAND_NAME } from '@/lib/brand'

export function TopNav() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 pb-3">
      <div className="font-semibold tracking-tight">
        <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
          {BRAND_NAME}
        </span>
      </div>
      <nav className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">{t('nav.home')}</Link>
        <Link href="/tasks" className="hover:text-foreground">{t('nav.tasks')}</Link>
        <Link href="/create" className="hover:text-foreground">{t('nav.create')}</Link>
        <Link href="/settings" className="hover:text-foreground">{t('nav.settings')}</Link>
      </nav>
      <div className="ml-2 flex items-center gap-2">
        <LanguageSwitch />
        <ThemeToggle />
        <BusyIndicator />
      </div>
    </div>
  )
}

export default TopNav
