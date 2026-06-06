/* eslint-disable react-refresh/only-export-components */
import { createContext, use, type ReactNode } from 'react'
import { useConversionSession, type ConvertContextValue } from './conversionSession'

const ConvertContext = createContext<ConvertContextValue | null>(null)

export function useConvertContext(): ConvertContextValue {
  const context = use(ConvertContext)
  if (!context) {
    throw new Error('useConvertContext must be used within ConvertProvider.')
  }
  return context
}

export function ConvertProvider({ children }: { children: ReactNode }) {
  const value = useConversionSession()

  return <ConvertContext value={value}>{children}</ConvertContext>
}
