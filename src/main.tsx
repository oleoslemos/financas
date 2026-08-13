import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import './index.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const hasValidSupabase = supabaseUrl && supabaseAnonKey

// Garante que usuários recebam atualizações do app (evita ficar preso em build antigo).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {hasValidSupabase ? (
      <RootErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </RootErrorBoundary>
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-white p-4 text-center text-slate-800 sm:p-6">
        <div className="max-w-md space-y-2 text-sm">
          <p className="font-semibold text-rose-600">
            Faltam variáveis de ambiente do Supabase para iniciar o app!
          </p>
          <p className="text-slate-600">
            Garanta que <code className="text-indigo-700">VITE_SUPABASE_URL</code> e{' '}
            <code className="text-indigo-700">VITE_SUPABASE_ANON_KEY</code> estejam configurados.
          </p>
          <p className="text-slate-500">
            Em desenvolvimento: arquivo <code className="text-indigo-700">.env</code> na raiz.
          </p>
          <p className="text-slate-500">
            Na Vercel: projeto → <strong>Settings → Environment Variables</strong> → marque Production e Preview →
            salve e faça <strong>Redeploy</strong>.
          </p>
        </div>
      </div>
    )}
  </StrictMode>,
)
