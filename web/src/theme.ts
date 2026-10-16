export const THEME_STORAGE_KEY = 'steam-artwork-studio:theme'
export const DEFAULT_THEME = 'light'

export type AppTheme = 'light' | 'dark'

export function readStoredTheme(): AppTheme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(theme: AppTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this session.
  }
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
}
