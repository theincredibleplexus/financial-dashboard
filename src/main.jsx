import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted fonts — no Google Fonts requests
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/dm-sans'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/playfair-display/700.css'
import './global.css'
import Dashboard from './dashboard'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>
)