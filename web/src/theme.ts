export const THEME_STORAGE_KEY = 'steam-artwork-studio:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export type AppTheme = 'light' | 'dark'

/** The theme the user picked explicitly, or null when they follow the system. */
export function readStoredTheme(): AppTheme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function storeTheme(theme: AppTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this session.
  }
}

export function readSystemTheme(): AppTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Calls `onChange` whenever the OS color scheme flips; returns an unsubscribe function. */
export function watchSystemTheme(onChange: (theme: AppTheme) => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY)
  if (!query) {
    return () => {}
  }

  const handleChange = (event: MediaQueryListEvent): void => {
    onChange(event.matches ? 'dark' : 'light')
  }
  query.addEventListener('change', handleChange)
  return () => query.removeEventListener('change', handleChange)
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
}
