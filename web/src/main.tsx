import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Before App.css (imported by the app), so feature styles there can adjust shared buttons.
import './components/ui/button.css'
import { AppRoot } from './AppRoot'
import { deleteLegacyHandoffDb } from './lib/artworkLibrary'

// Conversions now live in the Library; the old one-time handoff store is no longer read.
deleteLegacyHandoffDb()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
