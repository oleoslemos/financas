import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginV2User, registerV2User } from '../services/v2AuthService'
import {
  Eye,
  EyeOff,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'

export function V2SignInPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'login' | 'register'>('login')

  // Common Form States
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Login Form States
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register Form States
  const [regName, setRegName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      const { user, error } = await loginV2User({
        username: loginUsername,
        password: loginPassword,
      })

      if (error) {
        setErrorMessage(error)
        setLoading(false)
        return
      }

      setSuccessMessage(`Bem-vindo, ${user.full_name}!`)
      setTimeout(() => {
        navigate('/v2')
      }, 600)
    } catch (err) {
      setErrorMessage('Erro ao realizar login. Verifique seu usuário e senha.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!regName.trim() || !regUsername.trim() || !regPassword.trim()) {
      setErrorMessage('Preencha todos os campos obrigatórios.')
      return
    }

    setLoading(true)

    try {
      const { user, error } = await registerV2User({
        full_name: regName,
        username: regUsername,
        email: regEmail,
        password: regPassword,
      })

      if (error) {
        setErrorMessage(error)
        setLoading(false)
        return
      }

      setSuccessMessage(`Cadastro de ${user.full_name} realizado com sucesso! Redirecionando...`)
      setTimeout(() => {
        navigate('/v2')
      }, 800)
    } catch (err) {
      setErrorMessage('Erro ao criar seu acesso. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#059669] selection:text-white">
      {/* Light Clean Card Container */}
      <main className="w-full max-w-[420px] bg-white border border-slate-200/90 rounded-[28px] p-7 sm:p-9 shadow-xl shadow-slate-200/60 relative z-10 space-y-7">
        {/* Brand Logo & Header (Matching Reference Design) */}
        <div className="text-center space-y-2">
          {/* Emerald Green Icon Logo */}
          <div className="inline-flex items-center justify-center gap-2.5 mb-1">
            <div className="h-11 w-11 rounded-2xl bg-[#059669] text-white flex items-center justify-center font-black text-xl shadow-md shadow-emerald-700/20">
              F
            </div>
            <span className="text-2xl font-black text-slate-900 tracking-tight">Finanças</span>
          </div>

          <p className="text-xs font-semibold text-slate-400">Gestão Financeira & Comercial</p>

          <h2 className="text-lg font-bold text-slate-800 pt-1">
            {view === 'login' ? 'Entre na sua conta' : 'Crie seu acesso'}
          </h2>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-rose-700 font-medium">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* VIEW: LOGIN */}
        {view === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Usuário ou E-mail"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3.5 text-slate-900 text-sm font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Senha"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3.5 pr-11 text-slate-900 text-sm font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="text-right">
              <button
                type="button"
                onClick={() => alert('Para redefinir sua senha, entre em contato com o administrador do sistema.')}
                className="text-xs font-semibold text-[#059669] hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-emerald-700/20 transition-all duration-150 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </button>

            {/* Bottom Register Link */}
            <div className="text-center pt-3 text-xs text-slate-500 font-medium">
              <span>Ainda não tem conta? </span>
              <button
                type="button"
                onClick={() => {
                  setView('register')
                  setErrorMessage(null)
                  setSuccessMessage(null)
                }}
                className="font-bold text-[#059669] hover:underline"
              >
                Criar meu acesso
              </button>
            </div>
          </form>
        ) : (
          /* VIEW: REGISTER (CADASTRO) */
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1 text-[11px] uppercase tracking-wider">
                Nome Completo
              </label>
              <input
                type="text"
                required
                placeholder="Seu nome completo"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 text-[11px] uppercase tracking-wider">
                Nome de Usuário (Login)
              </label>
              <input
                type="text"
                required
                placeholder="Ex: carlos.silva"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 text-[11px] uppercase tracking-wider">
                E-mail
              </label>
              <input
                type="email"
                required
                placeholder="seu.email@empresa.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 text-[11px] uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Sua senha secreta"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 pr-11 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Register */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-emerald-700/20 transition-all duration-150 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  <span>Cadastrando...</span>
                </>
              ) : (
                <span>Criar Meu Acesso</span>
              )}
            </button>

            {/* Back to Login Link */}
            <div className="text-center pt-2 text-xs text-slate-500 font-medium">
              <span>Já possui uma conta? </span>
              <button
                type="button"
                onClick={() => {
                  setView('login')
                  setErrorMessage(null)
                  setSuccessMessage(null)
                }}
                className="font-bold text-[#059669] hover:underline"
              >
                Voltar para o login
              </button>
            </div>
          </form>
        )}

        {/* Multi-company info notice */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3 flex items-center gap-2.5 text-[11px] text-slate-500">
          <Building2 className="h-4 w-4 text-[#059669] shrink-0" />
          <span>Este usuário futuramente será vinculado à empresa que cadastrar.</span>
        </div>
      </main>
    </div>
  )
}
