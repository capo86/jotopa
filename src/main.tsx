import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from './app/AppProviders'
import { router } from './app/router'
import './styles.css'

const root = document.getElementById('root')

if (!root) throw new Error('No se encontró el punto de montaje de Jotopa.')

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)

