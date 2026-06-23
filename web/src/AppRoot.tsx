import { useEffect, useState } from 'react'
import { IntlProvider } from 'react-intl'
import App from './App'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  messagesByLocale,
  type AppLocale,
} from './i18n/messages'

function isAppLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale)
}

function normalizeLocale(value: string): AppLocale | null {
  const base = value.toLowerCase().split('-')[0]
  return isAppLocale(base) ? base : null
}

function resolveInitialLocale(): AppLocale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored) {
    const locale = normalizeLocale(stored)
    if (locale) {
      return locale
    }
  }

  for (const language of navigator.languages ?? [navigator.language]) {
    const locale = normalizeLocale(language)
    if (locale) {
      return locale
    }
  }

  return DEFAULT_LOCALE
}

export function AppRoot() {
  const [locale, setLocale] = useState<AppLocale>(resolveInitialLocale)

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  return (
    <IntlProvider locale={locale} messages={messagesByLocale[locale]}>
      <App locale={locale} onLocaleChange={setLocale} />
    </IntlProvider>
  )
}
