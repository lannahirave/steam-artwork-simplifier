import en from './en.json'

export const DEFAULT_LOCALE = 'en'
export const messages = en

export type MessageId = keyof typeof messages
