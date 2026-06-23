import en from './en.json'
import uk from './uk.json'
import cs from './cs.json'

export const SUPPORTED_LOCALES = ['en', 'uk', 'cs'] as const
export const DEFAULT_LOCALE = 'en'
export const LOCALE_STORAGE_KEY = 'steam-artwork-studio:locale'

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const localeLabels: Record<AppLocale, string> = {
  en: 'English',
  uk: 'Українська',
  cs: 'Čeština',
}

export const messagesByLocale: Record<AppLocale, typeof en> = {
  en,
  uk,
  cs,
}

export const messages = messagesByLocale[DEFAULT_LOCALE]
export type MessageId = keyof typeof messages
