export const ONBOARDING_STORAGE_KEY = 'steam-artwork-studio:onboarding-complete'

export function getStoredOnboardingComplete(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}

export function storeOnboardingComplete(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
