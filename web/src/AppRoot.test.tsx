import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoot } from './AppRoot'
import { LOCALE_STORAGE_KEY } from './i18n/messages'

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
