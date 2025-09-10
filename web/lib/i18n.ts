import zh from '@/i18n/zh.json'
import en from '@/i18n/en.json'

export type Locale = 'zh-CN' | 'en-US'

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' }
]

export type Dictionary = Record<string, string>

const DICTS: Record<Locale, Dictionary> = {
  'zh-CN': zh as Dictionary,
  'en-US': en as Dictionary
}

export function normalizeLocale(input?: string | null): Locale {
  const val = (input || '').toLowerCase()
  if (val.startsWith('zh')) return 'zh-CN'
  if (val.startsWith('en')) return 'en-US'
  return 'zh-CN'
}

export function getDict(locale: Locale): Dictionary {
  return DICTS[locale] || DICTS['zh-CN']
}

