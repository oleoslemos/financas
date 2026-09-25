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
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

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
    <div className="min-h-screen flex font-sans" style={{ background: '#F0F7EE' }}>

      {/* ── SIDEBAR (DESKTOP) ── */}
      <aside
        className="hidden sm:flex flex-col transition-all duration-300 z-50 shrink-0"
        style={{
          width: sidebarExpanded ? '220px' : '60px',
          background: 'rgba(13, 107, 175, 1)',
          borderRight: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '2px 0 16px rgba(13,107,175,0.25)',
        }}
      >
        {/* Logo — clicável para expandir/recolher */}
        <button
          type="button"
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          title={sidebarExpanded ? 'Recolher menu' : 'Expandir menu'}
          className="flex items-center gap-3 w-full px-3 border-b border-white/10 shrink-0 overflow-hidden transition-all hover:bg-white/10"
          style={{ height: 60, cursor: 'pointer', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          {/* Leaf icon */}
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-none">
              <path d="M12 3C8 3 4 7 4 12C4 15 6 18 9 19.5L12 21L15 19.5C18 18 20 15 20 12C20 7 16 3 12 3Z" fill="#7DC344" />
              <path d="M12 3 L12 21" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 10 C10 8 7 8 6 10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
              <path d="M12 14 C14 12 17 12 18 14" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>

          {sidebarExpanded && (
            <div className="whitespace-nowrap overflow-hidden">
              <span className="text-base font-black tracking-tight text-white leading-none block">Bem Aviv</span>
              <p className="text-[10px] font-medium leading-none mt-0.5 text-left" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Saúde e Longevidade
              </p>
            </div>
          )}
        </button>

        {/* Nav links */}
        <nav className="flex-1 py-5 px-2 space-y-1 overflow-x-hidden">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={!sidebarExpanded ? label : undefined}
              className={() =>
                'flex items-center gap-3 rounded-xl text-sm font-bold transition-all hover:bg-white/10 overflow-hidden'
              }
              style={({ isActive }) => ({
                padding: sidebarExpanded ? '10px 12px' : '10px 0',
                justifyContent: sidebarExpanded ? 'flex-start' : 'center',
                background: isActive ? 'rgba(255,255,255,0.2)' : undefined,
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                border: isActive ? '1px solid rgba(255,255,255,0.25)' : '1px solid transparent',
              })}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarExpanded && <span className="whitespace-nowrap">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* ── User section (bottom of sidebar) ── */}
        <div
          className="border-t border-white/10 overflow-hidden"
          style={{ padding: sidebarExpanded ? '12px' : '10px 0' }}
        >
          <div
            className="flex items-center rounded-xl transition-all"
            style={{
              gap: sidebarExpanded ? 10 : 0,
              justifyContent: sidebarExpanded ? 'flex-start' : 'center',
              padding: sidebarExpanded ? '8px 10px' : '8px 0',
              background: 'rgba(255,255,255,0.07)',
            }}
          >
            {/* Avatar */}
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[12px] font-black shrink-0"
              style={{ background: '#7DC344', color: '#FFFFFF' }}
            >
              {userInitial}
            </div>

            {sidebarExpanded && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{userName}</p>
                  <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {v2User?.email || v2User?.username || ''}
                  </p>
                </div>

                {/* Logout */}
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sair"
                  className="p-1.5 rounded-lg shrink-0 transition"
                  style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FFCDD2'; e.currentTarget.style.background = 'rgba(229,57,53,0.2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'none' }}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}

            {/* Collapsed: logout button below avatar */}
            {!sidebarExpanded && (
              <button
                type="button"
                onClick={handleSignOut}
                title="Sair"
                className="hidden"
              />
            )}
          </div>

          {/* Collapsed logout: separate row */}
          {!sidebarExpanded && (
            <button
              type="button"
              onClick={handleSignOut}
              title="Sair"
              className="w-full flex items-center justify-center mt-1.5 py-1.5 rounded-xl transition"
              style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FFCDD2'; e.currentTarget.style.background = 'rgba(229,57,53,0.15)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'none' }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header — agora mais enxuto, apenas empresa + mobile burger */}
        <header
          className="sticky top-0 z-40 flex items-center justify-between sm:justify-end px-4 sm:px-6 h-[60px]"
          style={{
            background: 'rgba(13, 107, 175, 0.97)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 2px 16px rgba(13,107,175,0.25)',
          }}
        >
          {/* Mobile: logo */}
          <div className="sm:hidden flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-none">
                <path d="M12 3C8 3 4 7 4 12C4 15 6 18 9 19.5L12 21L15 19.5C18 18 20 15 20 12C20 7 16 3 12 3Z" fill="#7DC344" />
                <path d="M12 3 L12 21" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 10 C10 8 7 8 6 10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                <path d="M12 14 C14 12 17 12 18 14" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <span className="text-sm font-black tracking-tight text-white">Bem Aviv</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Company switcher — só se > 1 empresa */}
            {companies.length > 1 && (
              <div className="relative">
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
                    {activeCompany?.trade_name || 'Selecionar'}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>

                {companyDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-60 rounded-2xl p-2 shadow-2xl z-50 space-y-1"
                    style={{ background: '#FFFFFF', border: '1px solid #C1D9EE' }}
                  >
                    <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest" style={{ color: '#0D6BAF' }}>
                      Empresas ({companies.length})
                    </div>
                    {companies.map((c) => {
                      const isCurrent = c.id === activeCompanyId
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setActiveCompanyId(c.id); setCompanyDropdownOpen(false) }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition"
                          style={{
                            background: isCurrent ? '#0D6BAF' : 'transparent',
                            color: isCurrent ? '#FFFFFF' : '#1A2E1A',
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Building className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            <span className="truncate">{c.trade_name}</span>
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(255,255,255,0.25)' }}>
                              Ativa
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              type="button"
              className="sm:hidden p-2 rounded-xl transition"
              style={{ color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer' }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div
            className="sm:hidden flex flex-col gap-1 px-4 py-3"
            style={{ background: 'rgba(13, 107, 175, 1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
          >
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className={() => 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all'}
                style={({ isActive }) => ({
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                })}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            {/* Mobile logout */}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold w-full"
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 relative">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
