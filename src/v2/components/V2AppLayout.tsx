import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getCurrentV2User, logoutV2User } from '../../v2/services/v2AuthService'
import { CompanyProvider, useCompany } from '../../context/CompanyContext'
import {
  LogOut,
  Home,
  Settings,
  Building2,
  ChevronDown,
  Building,
  Menu,
  X,
} from 'lucide-react'

export function V2AppLayout() {
  return (
    <CompanyProvider>
      <V2AppLayoutInner />
    </CompanyProvider>
  )
}

function V2AppLayoutInner() {
  const navigate = useNavigate()
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const { companies, activeCompany, activeCompanyId, setActiveCompanyId } = useCompany()

  const v2User = getCurrentV2User()
  const userName = v2User?.full_name?.split(' ')[0] || v2User?.username || 'Usuário'
  const userInitial = (v2User?.full_name || v2User?.username || 'U').charAt(0).toUpperCase()

  const handleSignOut = () => {
    logoutV2User()
    navigate('/v2/login')
  }

  const navItems = [
    { to: '/v2/inicio', icon: Home, label: 'Início' },
    { to: '/v2/configuracoes', icon: Settings, label: 'Configurações' },
  ]

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: '#F0F7EE' }}>
      {/* ── HEADER ── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-0"
        style={{
          background: 'rgba(26, 107, 170, 0.97)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 2px 16px rgba(26,107,170,0.25)',
          minHeight: '60px',
        }}
      >
        {/* ── Left: Logo ── */}
        <Link to="/v2/inicio" className="flex items-center gap-3 group py-3">
          {/* Leaf icon badge */}
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            {/* Leaf SVG inline matching brand */}
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-none">
              <path
                d="M12 3C8 3 4 7 4 12C4 15 6 18 9 19.5L12 21L15 19.5C18 18 20 15 20 12C20 7 16 3 12 3Z"
                fill="#5BA341"
              />
              <path d="M12 3 L12 21" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 10 C10 8 7 8 6 10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
              <path d="M12 14 C14 12 17 12 18 14" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black tracking-tight text-white leading-none">
                Bem Aviv
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(91,163,65,0.35)', color: '#B8E6A0', border: '1px solid rgba(91,163,65,0.4)' }}
              >
                SISTEMA
              </span>
            </div>
            <p className="text-[10px] font-medium leading-none mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Saúde e Longevidade
            </p>
          </div>
        </Link>

        {/* ── Center Nav (desktop) ── */}
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive ? '' : 'hover:bg-white/10'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(255,255,255,0.2)' : undefined,
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                border: isActive ? '1px solid rgba(255,255,255,0.25)' : '1px solid transparent',
              })}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* ── Right: Company + User ── */}
        <div className="flex items-center gap-2">
          {/* Company switcher */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <Building2 className="h-3.5 w-3.5" style={{ color: '#9BD87A' }} />
              <span className="max-w-[120px] truncate">
                {activeCompany?.trade_name || (companies.length > 0 ? 'Selecionar' : 'Empresa')}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {companyDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-60 rounded-2xl p-2 shadow-2xl z-50 space-y-1"
                style={{ background: '#FFFFFF', border: '1px solid #C1D9EE' }}
              >
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest" style={{ color: '#1A6BAA' }}>
                  Empresas ({companies.length})
                </div>
                {companies.length === 0 ? (
                  <div className="p-3 text-xs text-center font-medium" style={{ color: '#9AAA9A' }}>
                    Empresa Padrão Ativa
                  </div>
                ) : (
                  companies.map((c) => {
                    const isCurrent = c.id === activeCompanyId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setActiveCompanyId(c.id); setCompanyDropdownOpen(false) }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition"
                        style={{
                          background: isCurrent ? '#1A6BAA' : 'transparent',
                          color: isCurrent ? '#FFFFFF' : '#1A2E1A',
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          <span className="truncate">{c.trade_name}</span>
                        </div>
                        {isCurrent && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: 'rgba(255,255,255,0.25)' }}
                          >
                            Ativa
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* User pill */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <div
              className="h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
              style={{ background: '#5BA341', color: '#FFFFFF' }}
            >
              {userInitial}
            </div>
            <span className="hidden md:block text-xs font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {userName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sair"
              className="p-1 rounded-lg transition"
              style={{ color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FFCDD2'; e.currentTarget.style.background = 'rgba(229,57,53,0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="sm:hidden p-2 rounded-xl transition"
            style={{ color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.1)' }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── Mobile Nav Drawer ── */}
      {mobileMenuOpen && (
        <div
          className="sm:hidden flex flex-col gap-1 px-4 py-3"
          style={{ background: '#155490', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={() =>
                `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all`
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
              })}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      {/* ── Page content ── */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
