import { ClerkProvider } from '@clerk/clerk-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import './index.css'

// Trim evita chave "vazia" com espaços (Vercel) que quebra o Clerk e deixa tela preta
const clerkPub = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()

// Garante que usuários recebam atualizações do app (evita ficar preso em build antigo).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkPub ? (
      <RootErrorBoundary>
        <ClerkProvider publishableKey={clerkPub}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ClerkProvider>
      </RootErrorBoundary>
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f1e8] p-4 text-center text-amber-900 sm:p-6">
        <p>
          Defina <code className="text-sky-700">VITE_CLERK_PUBLISHABLE_KEY</code> e{' '}
          <code className="text-sky-700">VITE_SUPABASE_*</code> no arquivo <code className="text-sky-700">.env</code>.
        </p>
      </div>
    )}
  </StrictMode>,
)
