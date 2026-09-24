import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { LoaderCircle, Sparkles, ShieldCheck, Wallet, CheckCircle } from 'lucide-react'
import { setV2DefaultActive } from '../config/cutover'

export function V2SignInPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const redirectUrl = `${window.location.origin}/v2/resumo`
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      })
      if (authError) throw authError
    } catch (err) {
      console.error('Erro de autenticação V2:', err)
      setError((err as Error)?.message || 'Erro inesperado ao iniciar login do Google.')
      setLoading(false)
    }
  }

  const handleEnterDemo = () => {
    // Navigate directly to V2 summary page for instant preview
    navigate('/v2/resumo')
  }

  const handleSetAsDefaultAndEnter = () => {
    setV2DefaultActive(true)
    navigate('/v2/resumo')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 sm:p-6 relative overflow-hidden font-sans text-slate-100">
      {/* Dynamic Animated Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-sky-500/20 rounded-full blur-[140px] pointer-events-none animate-pulse" />

      {/* Main Login Container */}
      <main className="w-full max-w-lg bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-indigo-950/40 relative z-10 space-y-8">
        {/* Header Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wide mb-1">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>SISTEMA FINANCEIRO V2</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white bg-gradient-to-r from-white via-indigo-100 to-sky-200 bg-clip-text text-transparent">
            Acesse seu Painel
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto">
            Nova experiência reconstruída com alta performance e controle total.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 px-5 rounded-2xl shadow-lg shadow-white/5 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            {loading ? (
              <LoaderCircle className="animate-spin h-5 w-5 text-indigo-600" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>Entrar com o Google</span>
          </button>

          <div className="relative flex items-center justify-center py-2">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest absolute">
              ou testar direto
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleEnterDemo}
              className="flex items-center justify-center gap-2 bg-slate-800/90 hover:bg-slate-800 text-slate-200 font-semibold py-3 px-4 rounded-xl border border-slate-700/60 text-xs transition-all hover:border-slate-600"
            >
              <Wallet className="h-4 w-4 text-sky-400" />
              <span>Explorar V2 (Preview)</span>
            </button>

            <button
              type="button"
              onClick={handleSetAsDefaultAndEnter}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-semibold py-3 px-4 rounded-xl text-xs shadow-md transition-all"
            >
              <CheckCircle className="h-4 w-4 text-emerald-300" />
              <span>Tornar V2 Principal</span>
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center text-xs text-rose-300 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Features highlight */}
        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
          <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/50">
            <span className="block font-bold text-indigo-300">Fast UI</span>
            <span>Alta Velocidade</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/50">
            <span className="block font-bold text-sky-300">Full Sync</span>
            <span>Mesmo Banco</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/50">
            <span className="block font-bold text-emerald-300">Modern</span>
            <span>Design Novo</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center space-y-2">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
            <span>Conexão Segura Supabase</span>
          </p>
          <div className="pt-1">
            <Link to="/sign-in" className="text-xs text-indigo-400 hover:underline">
              Ir para o Login Antigo (V1)
            </Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
