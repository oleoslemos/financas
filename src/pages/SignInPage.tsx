import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LoaderCircle } from 'lucide-react'

export function SignInPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const redirectUrl = `${window.location.origin}/lsh/resumo`
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      })
      if (authError) throw authError
    } catch (err) {
      console.error('Erro de autenticação:', err)
      setError((err as Error)?.message || 'Erro inesperado ao iniciar login do Google.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 sm:p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Login Card */}
      <main className="w-full max-w-md bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-2xl p-8 shadow-2xl relative z-10 transition-all duration-300">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-gradient-to-r from-indigo-200 via-sky-100 to-indigo-200 bg-clip-text text-transparent">
            LSH FINANÇAS
          </h1>
          <p className="text-sm text-slate-400">
            Sistema Financeiro & Comercial
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
            className="w-full flex items-center justify-center bg-white hover:bg-slate-50 text-slate-900 font-semibold py-3 px-4 rounded-xl border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <LoaderCircle className="animate-spin h-5 w-5 text-indigo-600 mr-2" />
            ) : (
              <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
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

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-center text-xs text-rose-400">
              {error}
            </div>
          )}
        </div>

        <footer className="mt-8 text-center">
          <p className="text-xs text-slate-500">
            Acesso restrito para colaboradores autorizados.
          </p>
        </footer>
      </main>
    </div>
  )
}
