import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginV2User, registerV2User } from '../services/v2AuthService'
import {
  Sparkles,
  User,
  Lock,
  Mail,
  UserCheck,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'

export function V2SignInPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('login')

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
  const [regConfirmPassword, setRegConfirmPassword] = useState('')

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

      setSuccessMessage(`Bem-vindo de volta, ${user.full_name}!`)
      setTimeout(() => {
        navigate('/v2')
      }, 700)
    } catch (err) {
      setErrorMessage('Erro inesperado ao realizar login.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('As senhas não coincidem.')
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

      setSuccessMessage(`Conta criada com sucesso para ${user.full_name}! Redirecionando...`)
      setTimeout(() => {
        navigate('/v2')
      }, 900)
    } catch (err) {
      setErrorMessage('Erro ao realizar o cadastro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans selection:bg-indigo-600 selection:text-white">
      {/* Luminous Light Ambient Background Highlights */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-indigo-100/60 via-sky-50/40 to-transparent blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-indigo-50/80 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[10%] left-[-100px] w-80 h-80 bg-sky-100/50 rounded-full blur-[100px] pointer-events-none" />

      {/* Center Container Card */}
      <main className="w-full max-w-lg bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-slate-300/40 relative z-10 space-y-8 backdrop-blur-md">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold tracking-wide">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span>FINANÇAS PRO V2</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            {tab === 'login' ? 'Acesse sua Conta' : 'Criar Nova Conta'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
            Plataforma Financeira & Comercial Multiempresa por Usuário e Senha.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-2 gap-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setTab('login')
              setErrorMessage(null)
              setSuccessMessage(null)
            }}
            className={`py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              tab === 'login'
                ? 'bg-white text-slate-900 shadow-md shadow-slate-200/60 font-black'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <User className="h-4 w-4 text-indigo-600" />
            <span>Entrar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('register')
              setErrorMessage(null)
              setSuccessMessage(null)
            }}
            className={`py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              tab === 'register'
                ? 'bg-white text-slate-900 shadow-md shadow-slate-200/60 font-black'
                : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <UserCheck className="h-4 w-4 text-indigo-600" />
            <span>Criar Conta</span>
          </button>
        </div>

        {/* Feedback Notifications */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 flex items-center gap-3 text-xs text-rose-700 font-semibold animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-800 font-semibold animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form: LOGIN */}
        {tab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Seu nome de usuário"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Sua senha secreta"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-11 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold py-3.5 px-5 rounded-2xl shadow-xl shadow-slate-900/10 transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed text-xs sm:text-sm mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Form: CADASTRO (REGISTER) */
          <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                Nome Completo
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Eduardo Silva"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  Usuário (Login)
                </label>
                <div className="relative">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="carlos.silva"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="carlos@empresa.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Sua senha"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Repita a senha"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition shadow-sm"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-5 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed text-xs sm:text-sm mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  <span>Cadastrando...</span>
                </>
              ) : (
                <>
                  <span>Criar minha conta</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Future Multi-company info notice */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3 text-[11px] text-slate-600">
          <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Vínculo Futuro:</strong> Este usuário poderá criar e se vincular a empresas cadastradas no sistema.
          </span>
        </div>

        {/* Footer */}
        <footer className="text-center pt-1 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
            <span>Acesso Seguro por Usuário e Senha (Sem Envio de E-mail)</span>
          </p>
        </footer>
      </main>
    </div>
  )
}
