import { useEffect, useState } from 'react'
import { IntlProvider } from 'react-intl'
import App from './App'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  buildLocalePath,
  detectSystemLocale,
  getRouteLocale,
  messagesByLocale,
  normalizeLocale,
  type AppLocale,
} from './i18n/messages'

function getNavigatorLanguages(): string[] {
  return Array.from(navigator.languages?.length ? navigator.languages : [navigator.language])
}

function readStoredLocale(): AppLocale | null {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored ? normalizeLocale(stored) : null
}

function resolveFallbackLocale(): AppLocale {
  return readStoredLocale() ?? detectSystemLocale(getNavigatorLanguages()) ?? DEFAULT_LOCALE
}

function resolveInitialLocale(): AppLocale {
  return getRouteLocale(window.location.pathname) ?? resolveFallbackLocale()
}

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function updateLocaleRoute(locale: AppLocale, mode: 'push' | 'replace'): void {
  const nextPath = buildLocalePath(locale, window.location)
  if (currentRoute() === nextPath) {
    return
  }

  if (mode === 'replace') {
    window.history.replaceState(null, '', nextPath)
    return
  }

  window.history.pushState(null, '', nextPath)
}

export function AppRoot() {
  const [locale, setLocale] = useState<AppLocale>(resolveInitialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (!getRouteLocale(window.location.pathname)) {
      updateLocaleRoute(locale, 'replace')
    }
  }, [locale])

  useEffect(() => {
    const handlePopState = (): void => {
      const routeLocale = getRouteLocale(window.location.pathname)
      if (routeLocale) {
        setLocale(routeLocale)
        return
      }

      const fallbackLocale = resolveFallbackLocale()
      setLocale(fallbackLocale)
      updateLocaleRoute(fallbackLocale, 'replace')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function handleLocaleChange(nextLocale: AppLocale): void {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    setLocale(nextLocale)
    updateLocaleRoute(nextLocale, 'push')
  }

  return (
    <IntlProvider locale={locale} messages={messagesByLocale[locale]}>
      <App locale={locale} onLocaleChange={handleLocaleChange} />
    </IntlProvider>
  )
}
