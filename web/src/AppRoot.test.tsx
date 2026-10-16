import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoot } from './AppRoot'
import { LOCALE_STORAGE_KEY } from './i18n/messages'
import { THEME_STORAGE_KEY } from './theme'

const ONBOARDING_STORAGE_KEY = 'steam-artwork-studio:onboarding-complete'

function mockLanguages(languages: string[]): void {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: languages,
  })
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: languages[0] ?? 'en-US',
  })
}

function resetRoute(path = '/'): void {
  window.history.replaceState(null, '', path)
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
  mockLanguages(['en-US'])
  resetRoute('/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppRoot locale routing', () => {
  it('redirects root to detected system locale when no locale is stored', async () => {
    mockLanguages(['uk-UA', 'en-US'])

    render(<AppRoot />)

    await waitFor(() => expect(window.location.pathname).toBe('/uk'))
    expect(document.documentElement.lang).toBe('uk')
  })

  it('uses stored locale on root before system locale', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'cs')
    mockLanguages(['uk-UA'])

    render(<AppRoot />)

    await waitFor(() => expect(window.location.pathname).toBe('/cs'))
    expect(document.documentElement.lang).toBe('cs')
  })

  it('explicit route locale overrides stored locale', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'uk')
    resetRoute('/cs')

    render(<AppRoot />)

    await waitFor(() => expect(document.documentElement.lang).toBe('cs'))
    expect(window.location.pathname).toBe('/cs')
  })

  it('manual switch pushes a localized route and stores the chosen locale', async () => {
    resetRoute('/uk')
    const { container } = render(<AppRoot />)
    const languageSelect = container.querySelector<HTMLSelectElement>('select.nav-language')

    expect(languageSelect).not.toBeNull()
    await userEvent.selectOptions(languageSelect!, 'en')

    expect(window.location.pathname).toBe('/en')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})

type SystemThemeListener = (event: MediaQueryListEvent) => void

function mockSystemTheme(initial: 'light' | 'dark'): (next: 'light' | 'dark') => void {
  let matches = initial === 'dark'
  const listeners = new Set<SystemThemeListener>()

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes('dark') && matches
      },
      media: query,
      addEventListener: (_: string, listener: SystemThemeListener) => listeners.add(listener),
      removeEventListener: (_: string, listener: SystemThemeListener) => listeners.delete(listener),
    }),
  })

  return (next) => {
    matches = next === 'dark'
    listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent))
  }
}

describe('AppRoot theme', () => {
  it('follows a light system theme when nothing is stored', () => {
    mockSystemTheme('light')

    render(<AppRoot />)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('follows a dark system theme when nothing is stored', () => {
    mockSystemTheme('dark')

    render(<AppRoot />)

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
  })

  it('tracks live system theme changes until the user picks a theme', async () => {
    const setSystemTheme = mockSystemTheme('light')
    render(<AppRoot />)

    act(() => setSystemTheme('dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => setSystemTheme('light'))
    act(() => setSystemTheme('dark'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('stored choice overrides the system theme', () => {
    mockSystemTheme('dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')

    render(<AppRoot />)

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('toggle switches the theme and stores the choice', async () => {
    mockSystemTheme('light')
    render(<AppRoot />)

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
