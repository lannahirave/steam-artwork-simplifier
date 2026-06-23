import { describe, expect, it } from 'vitest'
import { messagesByLocale, type AppLocale } from './messages'

const localesToCheck = Object.keys(messagesByLocale).filter((locale) => locale !== 'en') as AppLocale[]
const englishKeys = Object.keys(messagesByLocale.en).sort()

function missingKeysFor(locale: AppLocale): string[] {
  const localeKeys = new Set(Object.keys(messagesByLocale[locale]))
  return englishKeys.filter((key) => !localeKeys.has(key))
}

function extraKeysFor(locale: AppLocale): string[] {
  const englishKeySet = new Set(englishKeys)
  return Object.keys(messagesByLocale[locale])
    .filter((key) => !englishKeySet.has(key))
    .sort()
}

describe('translation files', () => {
  it.each(localesToCheck)('%s contains every English message key', (locale) => {
    expect(missingKeysFor(locale)).toEqual([])
  })

  it.each(localesToCheck)('%s does not contain keys absent from English', (locale) => {
    expect(extraKeysFor(locale)).toEqual([])
  })
})
