"use client"
import Link from 'next/link'
import { BusyIndicator } from '@/components/ui/busy-indicator'
import { LanguageSwitch } from '@/components/topbar/language-switch'
import { useI18n } from '@/components/providers/i18n-provider'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { BRAND_NAME } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

interface Props {
  onOpenCommand?: () => void
}

export function TopNav({ onOpenCommand }: Props) {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pb-3">
      <div className="font-semibold tracking-tight select-none">
        <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
          {BRAND_NAME}
        </span>
      </div>
      <nav className="ml-auto flex items-center gap-4 text-sm text-muted-foreground md:hidden">
        <Link href="/" className="hover:text-foreground">{t('nav.home')}</Link>
        <Link href="/tasks" className="hover:text-foreground">{t('nav.tasks')}</Link>
        <Link href="/create" className="hover:text-foreground">{t('nav.create')}</Link>
        <Link href="/settings" className="hover:text-foreground">{t('nav.settings')}</Link>
      </nav>
      <div className="ml-2 flex items-center gap-2">
        <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={onOpenCommand}>
          <Search className="mr-2 h-4 w-4" />
          {t('nav.search', { defaultValue: '搜索 / 命令' })}
          <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
        </Button>
        <LanguageSwitch />
        <ThemeToggle />
        <BusyIndicator />
      </div>
    </div>
  )
}

export default TopNav
