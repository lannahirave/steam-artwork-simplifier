import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IntlProvider } from 'react-intl'
import './index.css'
import App from './App.tsx'
import { DEFAULT_LOCALE, messages } from './i18n/messages'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IntlProvider locale={DEFAULT_LOCALE} messages={messages}>
      <App />
    </IntlProvider>
  </StrictMode>,
)
