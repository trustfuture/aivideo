"use client"
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { get, request } from '@/lib/api'
import { Dictionary, getDict, Locale, normalizeLocale, SUPPORTED_LOCALES } from '@/lib/i18n'

type Ctx = {
  locale: Locale
  dict: Dictionary
  t: (key: string) => string
  setLocale: (l: Locale) => void
}

const I18nContext = createContext<Ctx | null>(null)

const STORAGE_KEY = 'ui_language'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh-CN')

  useEffect(() => {
    // 1) localStorage
    const fromStorage = normalizeLocale(typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : undefined)
    if (fromStorage) {
      setLocaleState(fromStorage)
      if (typeof document !== 'undefined') document.documentElement.lang = fromStorage
      return
    }
    // 2) backend config
    let cancelled = false
    ;(async () => {
      try {
        const res = await get('/v1/config')
        const json = await res.json().catch(() => ({}))
        const lang = normalizeLocale(json?.data?.ui?.language)
        if (!cancelled) {
          setLocaleState(lang)
          if (typeof document !== 'undefined') document.documentElement.lang = lang
        }
      } catch {
        // 3) navigator fallback
        if (!cancelled) {
          const nav = normalizeLocale(typeof navigator !== 'undefined' ? navigator.language : 'zh-CN')
          setLocaleState(nav)
          if (typeof document !== 'undefined') document.documentElement.lang = nav
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const dict = useMemo(() => getDict(locale), [locale])

  function t(key: string) {
    return dict[key] ?? key
  }

  async function setLocale(next: Locale) {
    setLocaleState(next)
    try {
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
      if (typeof document !== 'undefined') document.documentElement.lang = next
    } catch {}
    // Best-effort writeback to backend
    try {
      await request('/v1/config', { method: 'PUT', body: JSON.stringify({ ui: { language: next } }) })
    } catch {}
  }

  const value: Ctx = { locale, dict, t, setLocale }
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

