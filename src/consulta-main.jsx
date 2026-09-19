import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ConsultaView from './ConsultaView.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConsultaView />
  </StrictMode>,
)
