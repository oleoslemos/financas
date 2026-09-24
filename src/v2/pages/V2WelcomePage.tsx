import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentV2User } from '../services/v2AuthService'
import {
  Settings,
  Users,
  Building2,
  ArrowRight,
  Leaf,
  Sun,
  Sunset,
  Moon,
  Sparkles,
} from 'lucide-react'

function getGreeting(): { text: string; Icon: typeof Sun } {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return { text: 'Bom dia', Icon: Sun }
  if (h >= 12 && h < 18) return { text: 'Boa tarde', Icon: Sunset }
  return { text: 'Boa noite', Icon: Moon }
}

type QuickCard = {
  id: string
  icon: typeof Building2
  label: string
  description: string
  to: string
  accent: 'blue' | 'green'
}

const QUICK_CARDS: QuickCard[] = [
  {
    id: 'config',
    icon: Settings,
    label: 'Configurações',
    description: 'Dados da empresa e gestão de usuários',
    to: '/v2/configuracoes',
    accent: 'blue',
  },
  {
    id: 'usuarios',
    icon: Users,
    label: 'Usuários',
    description: 'Administrar acessos e permissões',
    to: '/v2/admin/usuarios',
    accent: 'green',
  },
  {
    id: 'empresa',
    icon: Building2,
    label: 'Minha Empresa',
    description: 'Perfil e informações cadastrais',
    to: '/v2/configuracoes',
    accent: 'blue',
  },
]

export function V2WelcomePage() {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('usuário')
  const [visible, setVisible] = useState(false)
  const { text: greetText, Icon: GreetIcon } = getGreeting()

  useEffect(() => {
    const user = getCurrentV2User()
    if (!user) {
      navigate('/v2/login', { replace: true })
      return
    }
    const first = user.full_name?.split(' ')[0] || user.username || 'usuário'
    setUserName(first)
    requestAnimationFrame(() => setVisible(true))
  }, [navigate])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: 'linear-gradient(135deg, #EEF5F9 0%, #F0F7EE 100%)' }}
    >
      {/* Decorative blobs */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #1A6BAA, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #5BA341, transparent 70%)' }}
        />
      </div>

      <div
        className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)' }}
      >
        {/* Bem Aviv Badge */}
        <div className="flex items-center gap-2 mb-10">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: '#E8F1F8', color: '#1A6BAA', border: '1px solid #C1D9EE' }}
          >
            <Leaf className="h-3.5 w-3.5" style={{ color: '#5BA341' }} />
            Bem Aviv · Saúde e Longevidade
          </div>
        </div>

        {/* Greeting */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <GreetIcon className="h-5 w-5" style={{ color: '#5BA341' }} />
            <span className="text-sm font-semibold" style={{ color: '#5BA341' }}>
              {greetText}!
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight" style={{ color: '#1A2E1A' }}>
            Olá,{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #1A6BAA, #5BA341)' }}
            >
              {userName}
            </span>
            .
          </h1>
          <p className="mt-3 text-base font-medium" style={{ color: '#4A6A4A' }}>
            Bem-vindo ao sistema de gestão financeira e comercial.
          </p>
        </div>

        {/* Divider */}
        <div className="h-px mb-10" style={{ background: 'linear-gradient(to right, #C1D9EE, #C8E6C0, transparent)' }} />

        {/* Quick Access Cards */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="h-4 w-4" style={{ color: '#1A6BAA' }} />
            <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#1A6BAA' }}>
              Acesso Rápido
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {QUICK_CARDS.map((card, i) => (
              <Link
                key={card.id}
                to={card.to}
                className="group relative flex flex-col gap-3 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: card.accent === 'blue' ? '1px solid #C1D9EE' : '1px solid #C8E6C0',
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: card.accent === 'blue' ? '#E8F1F8' : '#EBF5E8',
                  }}
                >
                  <card.icon
                    className="h-5 w-5"
                    style={{ color: card.accent === 'blue' ? '#1A6BAA' : '#5BA341' }}
                  />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#1A2E1A' }}>
                    {card.label}
                  </p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: '#6A8A6A' }}>
                    {card.description}
                  </p>
                </div>
                <ArrowRight
                  className="absolute top-5 right-5 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: card.accent === 'blue' ? '#1A6BAA' : '#5BA341' }}
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Info Banner */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: '#E8F1F8', border: '1px solid #C1D9EE' }}
        >
          <Building2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#1A6BAA' }} />
          <div>
            <p className="text-xs font-bold" style={{ color: '#1A6BAA' }}>
              Configure sua empresa
            </p>
            <p className="text-xs font-medium mt-0.5" style={{ color: '#3A6090' }}>
              Acesse{' '}
              <Link
                to="/v2/configuracoes"
                className="underline underline-offset-2 font-bold"
                style={{ color: '#1A6BAA' }}
              >
                Configurações
              </Link>{' '}
              para cadastrar o nome da empresa e convidar novos usuários.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
