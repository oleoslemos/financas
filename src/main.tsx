import { ClerkProvider } from '@clerk/clerk-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import './index.css'

// Trim evita chave "vazia" com espaços (Vercel) que quebra o Clerk e deixa tela preta.
const clerkPub = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
const hasValidClerkPrefix = clerkPub?.startsWith('pk_')

// Garante que usuários recebam atualizações do app (evita ficar preso em build antigo).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkPub && hasValidClerkPrefix ? (
      <RootErrorBoundary>
        <ClerkProvider publishableKey={clerkPub}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ClerkProvider>
      </RootErrorBoundary>
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-white p-4 text-center text-slate-800 sm:p-6">
        {clerkPub && !hasValidClerkPrefix ? (
          <div className="max-w-md space-y-2 text-sm">
            <p>
              A variável <code className="text-sky-700">VITE_CLERK_PUBLISHABLE_KEY</code> está definida, mas o valor
              não é uma <strong>Publishable key</strong> válida (deve começar com <code className="text-sky-700">pk_</code>
              ).
            </p>
            <p className="text-slate-600">
              No Clerk → API Keys, use <strong>Publishable key</strong> (<code className="text-sky-700">pk_test_</code> ou{' '}
              <code className="text-sky-700">pk_live_</code>), não a Secret key (<code className="text-sky-700">sk_</code>
              ). Pode ser a <strong>mesma</strong> chave no <code className="text-sky-700">.env</code> local e na Vercel — sem
              aspas no valor. Depois de corrigir, faça <strong>Redeploy</strong>.
            </p>
          </div>
        ) : (
          <div className="max-w-md space-y-2 text-sm">
            <p>
              Faltam variáveis de ambiente para iniciar o app (
              <code className="text-sky-700">VITE_CLERK_PUBLISHABLE_KEY</code>,{' '}
              <code className="text-sky-700">VITE_SUPABASE_URL</code>,{' '}
              <code className="text-sky-700">VITE_SUPABASE_ANON_KEY</code>).
            </p>
            <p className="text-slate-600">
              Em desenvolvimento: arquivo <code className="text-sky-700">.env</code> na raiz (copie de{' '}
              <code className="text-sky-700">.env.example</code>).
            </p>
            <p className="text-slate-600">
              Na Vercel: projeto → <strong>Settings → Environment Variables</strong> → marque Production e Preview →
              salve e faça <strong>Redeploy</strong>.
            </p>
          </div>
        )}
      </div>
    )}
  </StrictMode>,
)
