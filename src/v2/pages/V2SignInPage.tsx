import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
    <div
      className="normal-case min-h-screen text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans"
      style={{ background: 'linear-gradient(135deg, #EEF5F9 0%, #F0F7EE 100%)' }}
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #0D6BAF, transparent 70%)' }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #7DC344, transparent 70%)' }} />
      </div>

      {/* Light Clean Card Container */}
      <main
        className="normal-case w-full max-w-[420px] rounded-[28px] p-7 sm:p-9 relative z-10 space-y-7"
        style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #C1D9EE', boxShadow: '0 8px 40px rgba(13,107,175,0.10)' }}
      >
        {/* Brand Logo & Header */}
        <div className="text-center space-y-2 normal-case">
          {/* Bem Aviv Logo Mark */}
          <div className="inline-flex flex-col items-center gap-1 mb-4">
            <img 
              src="/logo-bem-aviv.png" 
              alt="Bem Aviv - Saúde e Longevidade" 
              className="h-20 object-contain drop-shadow-sm" 
            />
          </div>

          <h2 className="text-lg font-bold pt-1 normal-case" style={{ color: '#1A2E1A' }}>
            {view === 'login' ? 'Entre na sua conta' : 'Crie seu acesso'}
          </h2>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="normal-case rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-medium" style={{ background: '#FEE8E8', border: '1px solid #FFCDD2', color: '#C62828' }}>
            <AlertCircle className="h-4 w-4 shrink-0" style={{ color: '#E53935' }} />
            <span className="normal-case">{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="normal-case rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-medium" style={{ background: '#EBF5E8', border: '1px solid #C8E6C0', color: '#2E7D32' }}>
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#7DC344' }} />
            <span className="normal-case">{successMessage}</span>
          </div>
        )}

        {/* VIEW: LOGIN */}
        {view === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4 normal-case">
            <div>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Usuário ou E-mail"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="normal-case placeholder:normal-case w-full rounded-2xl px-4 py-3.5 text-sm font-medium outline-none transition shadow-sm"
                  style={{ background: '#F5F9FC', border: '1px solid #C1D9EE', color: '#1A2E1A' }}
                  onFocus={(e) => { e.currentTarget.style.border = '1px solid #0D6BAF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,107,175,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.border = '1px solid #C1D9EE'; e.currentTarget.style.boxShadow = 'none' }}
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
                  className="normal-case placeholder:normal-case w-full rounded-2xl px-4 py-3.5 pr-11 text-sm font-medium outline-none transition shadow-sm"
                  style={{ background: '#F5F9FC', border: '1px solid #C1D9EE', color: '#1A2E1A' }}
                  onFocus={(e) => { e.currentTarget.style.border = '1px solid #0D6BAF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,107,175,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.border = '1px solid #C1D9EE'; e.currentTarget.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="normal-case absolute right-3.5 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: '#8AAAC0' }}
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
                className="normal-case text-xs font-semibold hover:underline"
                style={{ color: '#0D6BAF' }}
              >
                Esqueci minha senha
              </button>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="normal-case w-full text-white font-bold py-3.5 px-4 rounded-2xl transition-all duration-150 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              style={{ background: loading ? '#78B2DF' : '#0D6BAF', boxShadow: '0 4px 16px rgba(13,107,175,0.35)' }}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  <span className="normal-case">Entrando...</span>
                </>
              ) : (
                <span className="normal-case">Entrar</span>
              )}
            </button>

            {/* Bottom Register Link */}
            <div className="normal-case text-center pt-3 text-xs font-medium" style={{ color: '#8AAAC0' }}>
              <span className="normal-case">Ainda não tem conta? </span>
              <button
                type="button"
                onClick={() => {
                  setView('register')
                  setErrorMessage(null)
                  setSuccessMessage(null)
                }}
                className="normal-case font-bold hover:underline"
                style={{ color: '#0D6BAF' }}
              >
                Criar meu acesso
              </button>
            </div>
          </form>
        ) : (
          /* VIEW: REGISTER (CADASTRO) */
          <form onSubmit={handleRegisterSubmit} className="space-y-4 normal-case">
            <div>
              <label className="normal-case block text-slate-700 font-bold mb-1 text-xs">
                Nome Completo
              </label>
              <input
                type="text"
                required
                placeholder="Seu nome completo"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="normal-case placeholder:normal-case w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
              />
            </div>

            <div>
              <label className="normal-case block text-slate-700 font-bold mb-1 text-xs">
                Nome de Usuário (Login)
              </label>
              <input
                type="text"
                required
                placeholder="Ex: carlos.silva"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                className="normal-case placeholder:normal-case w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
              />
            </div>

            <div>
              <label className="normal-case block text-slate-700 font-bold mb-1 text-xs">
                E-mail
              </label>
              <input
                type="email"
                required
                placeholder="seu.email@empresa.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="normal-case placeholder:normal-case w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
              />
            </div>

            <div>
              <label className="normal-case block text-slate-700 font-bold mb-1 text-xs">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Sua senha secreta"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="normal-case placeholder:normal-case w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-3 pr-11 text-slate-900 text-xs font-medium placeholder-slate-400 outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="normal-case absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Register */}
            <button
              type="submit"
              disabled={loading}
              className="normal-case w-full text-white font-bold py-3.5 px-4 rounded-2xl transition-all duration-150 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              style={{ background: loading ? '#78B2DF' : '#0D6BAF', boxShadow: '0 4px 16px rgba(13,107,175,0.35)' }}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  <span className="normal-case">Cadastrando...</span>
                </>
              ) : (
                <span className="normal-case">Criar Meu Acesso</span>
              )}
            </button>

            {/* Back to Login Link */}
            <div className="normal-case text-center pt-2 text-xs font-medium" style={{ color: '#8AAAC0' }}>
              <span className="normal-case">Já possui uma conta? </span>
              <button
                type="button"
                onClick={() => {
                  setView('login')
                  setErrorMessage(null)
                  setSuccessMessage(null)
                }}
                className="normal-case font-bold hover:underline"
                style={{ color: '#0D6BAF' }}
              >
                Voltar para o login
              </button>
            </div>
          </form>
        )}

        {/* Multi-company info notice */}
        <div
          className="normal-case rounded-2xl p-3 flex items-center gap-2.5 text-[11px]"
          style={{ background: '#E8F1F8', border: '1px solid #C1D9EE', color: '#3A6090' }}
        >
          <Building2 className="h-4 w-4 shrink-0" style={{ color: '#0D6BAF' }} />
          <span className="normal-case">Este usuário futuramente será vinculado à empresa que cadastrar.</span>
        </div>

        {/* Admin link */}
        <div className="normal-case text-center">
          <Link
            to="/v2/admin/usuarios"
            className="normal-case text-[10px] font-medium transition hover:underline"
            style={{ color: '#AACCE0' }}
          >
            Administração de usuários
          </Link>
        </div>
      </main>
    </div>
  )
}

