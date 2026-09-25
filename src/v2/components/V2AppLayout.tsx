import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getCurrentV2User, logoutV2User } from '../../v2/services/v2AuthService'
import { CompanyProvider } from '../../context/CompanyContext'
import {
  LogOut,
  Home,
  Settings,
  Users,
  Menu,
  X,
  Package,
  Tag,
  ShoppingCart,
  ClipboardList,
  Warehouse,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  const v2User = getCurrentV2User()
  const userName = v2User?.full_name?.split(' ')[0] || v2User?.username || 'Usuário'
  const userInitial = (v2User?.full_name || v2User?.username || 'U').charAt(0).toUpperCase()

  const handleSignOut = () => {
    logoutV2User()
    navigate('/v2/login')
  }

  type NavItem = { to: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string }
  type NavGroup = { group: string; items: NavItem[] }
  type NavEntry = NavItem | NavGroup

  const navEntries: NavEntry[] = [
    { to: '/v2/inicio', icon: Home, label: 'Início' },
    { to: '/v2/clientes', icon: Users, label: 'Clientes' },
    {
      group: 'Comercial',
      items: [
        { to: '/v2/produtos', icon: Package, label: 'Produtos' },
        { to: '/v2/tabela-preco', icon: Tag, label: 'Tabela de Preço' },
        { to: '/v2/pedido-compra', icon: ShoppingCart, label: 'Ped. de Compra' },
        { to: '/v2/pedido-vendas', icon: ClipboardList, label: 'Ped. de Vendas' },
        { to: '/v2/estoque', icon: Warehouse, label: 'Estoque' },
      ],
    },
    { to: '/v2/configuracoes', icon: Settings, label: 'Configurações' },
  ]

  // Flat list for navigation (desktop & mobile)
  const navItems: NavItem[] = navEntries.flatMap((entry) =>
    'group' in entry ? entry.items : [entry]
  )



  return (
    <div className="h-screen w-screen flex overflow-hidden font-sans" style={{ background: '#F0F7EE' }}>

      {/* ── SIDEBAR (DESKTOP - FIXED) ── */}
      <aside
        className="hidden sm:flex flex-col h-screen sticky top-0 left-0 transition-all duration-300 z-50 shrink-0"
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
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-y-auto">

        {/* Mobile Header (apenas para telas pequenas) */}
        <header
          className="sm:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-[50px] shrink-0"
          style={{
            background: 'rgba(13, 107, 175, 1)',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-none">
                <path d="M12 3C8 3 4 7 4 12C4 15 6 18 9 19.5L12 21L15 19.5C18 18 20 15 20 12C20 7 16 3 12 3Z" fill="#7DC344" />
              </svg>
            </div>
            <span className="text-sm font-black text-white">Bem Aviv</span>
          </div>

          <button
            type="button"
            className="p-1.5 rounded-xl transition"
            style={{ color: '#FFFFFF', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer' }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </header>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div
            className="sm:hidden flex flex-col gap-1 px-4 py-3 shrink-0"
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
