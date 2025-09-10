"use client"
import Link from 'next/link'
import { BusyIndicator } from '@/components/ui/busy-indicator'
import { LanguageSwitch } from '@/components/topbar/language-switch'
import { useI18n } from '@/components/providers/i18n-provider'

export function TopNav() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex max-w-7xl items-center gap-4 p-4">
      <div className="font-semibold">MoneyPrinterTurbo</div>
      <nav className="ml-auto flex items-center gap-4 text-sm text-neutral-600">
        <Link href="/" className="hover:text-black">{t('nav.home')}</Link>
        <Link href="/tasks" className="hover:text-black">{t('nav.tasks')}</Link>
        <Link href="/create" className="hover:text-black">{t('nav.create')}</Link>
        <Link href="/settings" className="hover:text-black">{t('nav.settings')}</Link>
      </nav>
      <div className="ml-2 flex items-center gap-2">
        <LanguageSwitch />
        <BusyIndicator />
      </div>
    </div>
  )
}

export default TopNav

