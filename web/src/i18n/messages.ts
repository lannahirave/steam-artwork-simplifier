import en from './en.json'
import uk from './uk.json'
import cs from './cs.json'

export const SUPPORTED_LOCALES = ['en', 'uk', 'cs'] as const
export const DEFAULT_LOCALE = 'en'
export const LOCALE_STORAGE_KEY = 'steam-artwork-studio:locale'

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const localeLabels: Record<AppLocale, string> = {
  en: 'English',
  uk: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430',
  cs: '\u010ce\u0161tina',
}

export const messagesByLocale: Record<AppLocale, typeof en> = {
  en,
  uk,
  cs,
}

export const messages = messagesByLocale[DEFAULT_LOCALE]
export type MessageId = keyof typeof messages

export function isAppLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale)
}

export function normalizeLocale(value: string): AppLocale | null {
  const base = value.trim().toLowerCase().split('-')[0]
  return isAppLocale(base) ? base : null
}

export function detectSystemLocale(languages: readonly string[] = []): AppLocale | null {
  for (const language of languages) {
    const locale = normalizeLocale(language)
    if (locale) {
      return locale
    }
  }

  return null
}

export function getRouteLocale(pathname: string): AppLocale | null {
  const [maybeLocale] = pathname.replace(/^\/+/, '').split('/')
  return maybeLocale && isAppLocale(maybeLocale) ? maybeLocale : null
}

function stripLocalePrefix(pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  const parts = normalized.split('/')

  if (parts.length > 1 && isAppLocale(parts[1])) {
    const rest = parts.slice(2).join('/')
    return rest ? `/${rest}` : ''
  }

  return normalized === '/' ? '' : normalized
}

export function buildLocalePath(
  locale: AppLocale,
  locationLike: Pick<Location, 'pathname' | 'search' | 'hash'>,
): string {
  const suffix = stripLocalePrefix(locationLike.pathname)
  return `/${locale}${suffix}${locationLike.search}${locationLike.hash}`
}
