import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { getCurrentV2User, logoutV2User } from '../../v2/services/v2AuthService'
import { CompanyProvider } from '../../context/CompanyContext'
import {
  Bell,
  LogOut,
  Home,
  Settings,
  Users,
  UserCheck,
  X,
  Package,
  Tag,
  ShoppingCart,
  ClipboardList,
  Warehouse,
  Wallet,
  TrendingUp,
  BarChart2,
  MoreHorizontal,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react'
import { PushNotificationModal } from '../../components/PushNotificationModal'
import { supabase } from '../../lib/supabaseClient'
import { fetchPendingNotificationItems } from '../../services/notificationAlertsService'

export function V2AppLayout() {
  return (
    <CompanyProvider>
      <V2AppLayoutInner />
    </CompanyProvider>
  )
}

function V2AppLayoutInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  )
  const [isPushModalOpen, setIsPushModalOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number>(0)

  // Atualizar expansão da sidebar conforme o redimensionamento (tablet recolhido por padrão)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarExpanded(false)
      } else {
        setSidebarExpanded(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fechar menu mobile ao mudar de rota
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Notificações pendentes
  useEffect(() => {
    let isCancelled = false
    void fetchPendingNotificationItems(supabase).then((items) => {
      if (!isCancelled) setPendingCount(items.length)
    })
    return () => {
      isCancelled = true
    }
  }, [isPushModalOpen])

  const v2User = getCurrentV2User()
  const userName = v2User?.full_name?.split(' ')[0] || v2User?.username || 'Usuário'
  const userInitial = (v2User?.full_name || v2User?.username || 'U').charAt(0).toUpperCase()

  const handleSignOut = () => {
    logoutV2User()
    navigate('/v2/login')
  }

  type NavSubItem = { to: string; label: string }
  type NavItem = {
    to: string
    icon: LucideIcon
    label: string
    subItems?: NavSubItem[]
  }

  const navItems: NavItem[] = [
    { to: '/v2/inicio', icon: Home, label: 'Início' },
    { to: '/v2/painel-vendas', icon: TrendingUp, label: 'Painel de vendas' },
    {
      to: '/v2/crm',
      icon: UserCheck,
      label: 'CRM',
      subItems: [
        { to: '/v2/crm', label: 'Visão Geral' },
        { to: '/v2/crm/follow-up', label: 'Follow-up' },
        { to: '/v2/crm/produtividade', label: 'Produtividade' },
        { to: '/v2/crm/atividades', label: 'Atividades V2' },
      ],
    },
    { to: '/v2/clientes', icon: Users, label: 'Clientes' },
    { to: '/v2/produtos', icon: Package, label: 'Produtos' },
    { to: '/v2/tabela-preco', icon: Tag, label: 'Tabela de preço' },
    { to: '/v2/pedido-compra', icon: ShoppingCart, label: 'Compras' },
    { to: '/v2/propostas-vendas', icon: ClipboardList, label: 'Propostas' },
    { to: '/v2/estoque', icon: Warehouse, label: 'Estoque' },
    { to: '/v2/contas-pagar', icon: Wallet, label: 'Financeiro' },
    { to: '/v2/relatorios', icon: BarChart2, label: 'Relatórios' },
    { to: '/v2/tags', icon: Tag, label: 'Tags' },
    { to: '/v2/configuracoes', icon: Settings, label: 'Configurações' },
  ]

  // 4 Tabs principais no celular — módulos mais acessados no dia a dia
  const mobileMainTabs = [
    { to: '/v2/inicio', icon: Home, label: 'Início' },
    { to: '/v2/crm', icon: UserCheck, label: 'CRM' },
    { to: '/v2/contas-pagar', icon: Wallet, label: 'Financeiro' },
    { to: '/v2/propostas-vendas', icon: ClipboardList, label: 'Propostas' },
  ]

  return (
    <div className="h-screen w-screen flex flex-col sm:flex-row overflow-hidden font-sans" style={{ background: '#F4F8F3' }}>

      {/* ── SIDEBAR DESKTOP & TABLET (WHITE LAYOUT) ── */}
      <aside
        className="hidden sm:flex flex-col h-screen sticky top-0 left-0 transition-all duration-300 z-40 shrink-0 bg-white border-r border-slate-200/90 shadow-2xs select-none"
        style={{
          width: sidebarExpanded ? '240px' : '72px',
        }}
      >
        {/* Top: Logo Bem Aviv */}
        <div className="h-[78px] px-3.5 flex items-center justify-between border-b border-slate-100 shrink-0">
          {sidebarExpanded ? (
            <div className="flex items-center justify-between w-full">
              <NavLink to="/v2/inicio" className="flex items-center gap-2">
                <img
                  src="/logo-bem-aviv.png"
                  alt="Bem Aviv · Saúde e Longevidade"
                  className="h-12 max-h-[50px] w-auto object-contain transition-transform hover:scale-102"
                />
              </NavLink>
              <button
                type="button"
                onClick={() => setSidebarExpanded(false)}
                title="Recolher menu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
          ) : (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                onClick={() => setSidebarExpanded(true)}
                title="Expandir menu"
                className="p-2 rounded-xl text-slate-500 hover:text-[#0D5BA3] hover:bg-[#EBF3FA] transition cursor-pointer flex flex-col items-center"
              >
                <div className="w-8 h-8 rounded-lg bg-[#EBF3FA] flex items-center justify-center">
                  <span className="text-[#0D5BA3] font-black text-sm">BA</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const { to, icon: Icon, label, subItems } = item
            const isCrm = to === '/v2/crm'
            const isCrmActive = isCrm && location.pathname.startsWith('/v2/crm')

            return (
              <div key={to} className="space-y-0.5">
                <NavLink
                  to={to}
                  title={!sidebarExpanded ? label : undefined}
                  className={({ isActive }) => {
                    const active = isActive || isCrmActive
                    return `group flex items-center gap-2.5 rounded-xl transition-all ${
                      sidebarExpanded ? 'px-3 py-1.5' : 'p-2 justify-center'
                    } ${
                      active
                        ? 'bg-[#EBF3FA] text-[#0D5BA3] font-bold shadow-2xs'
                        : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 font-semibold'
                    }`
                  }}
                >
                  {({ isActive }) => {
                    const active = isActive || isCrmActive
                    return (
                      <>
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            active ? 'text-[#0D5BA3]' : 'text-slate-500 group-hover:text-slate-800'
                          }`}
                        />
                        {sidebarExpanded && (
                          <span className="text-[11.5px] font-semibold tracking-tight truncate leading-tight">
                            {label}
                          </span>
                        )}
                      </>
                    )
                  }}
                </NavLink>

                {/* Submenus CRM quando expandido */}
                {subItems && sidebarExpanded && isCrmActive && (
                  <div className="pl-5 pr-1 py-0.5 space-y-0.5 border-l-2 border-slate-200 ml-4 my-0.5">
                    {subItems.map((sub) => {
                      const isSubActive =
                        sub.to === '/v2/crm'
                          ? location.pathname === '/v2/crm' || location.pathname === '/v2/crm/visao-geral'
                          : location.pathname === sub.to

                      return (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={`block rounded-lg px-2 py-1 text-[11px] font-semibold transition-all ${
                            isSubActive
                              ? 'bg-[#EBF3FA] text-[#0D5BA3] font-bold'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          {sub.label}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Rodapé da Sidebar: Usuário + Notificações + Sair */}
        <div className="border-t border-slate-100 p-2.5 bg-slate-50/70 shrink-0">
          <div
            className={`flex items-center rounded-xl transition-all ${
              sidebarExpanded ? 'p-2 justify-between' : 'py-2 justify-center flex-col gap-2'
            }`}
          >
            {/* Avatar & Nome */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[12px] font-black shrink-0 bg-[#E3EEFA] text-[#0D5BA3] border border-blue-200"
              >
                {userInitial}
              </div>
              {sidebarExpanded && (
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate leading-tight">{userName}</p>
                  <p className="text-[10px] text-slate-400 truncate leading-tight">
                    {v2User?.email || v2User?.username || 'Conectado'}
                  </p>
                </div>
              )}
            </div>

            {/* Ações: Notificações & Logout */}
            <div className={`flex items-center ${sidebarExpanded ? 'gap-1' : 'flex-col gap-1 w-full'}`}>
              <button
                type="button"
                onClick={() => setIsPushModalOpen(true)}
                title={pendingCount > 0 ? `${pendingCount} pendências` : 'Notificações'}
                className="relative p-1.5 rounded-lg text-slate-500 hover:text-[#0D5BA3] hover:bg-white transition cursor-pointer"
              >
                <Bell size={16} />
                {pendingCount > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-xs">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                ) : (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                title="Sair do sistema"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── ÁREA PRINCIPAL DE CONTEÚDO ── */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden relative">

        {/* ── HEADER MOBILE (SMARTPHONE <640px) CONFORME MOCKUP ── */}
        <header className="sm:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-[58px] shrink-0 bg-white border-b border-slate-200/80 shadow-2xs">
          <NavLink to="/v2/inicio" className="flex items-center">
            <img
              src="/logo-bem-aviv.png"
              alt="Bem Aviv"
              className="h-8 w-auto object-contain"
            />
          </NavLink>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPushModalOpen(true)}
              title="Notificações"
              className="relative h-9 w-9 rounded-xl border border-slate-200 bg-white shadow-2xs flex items-center justify-center text-slate-700 active:scale-95 transition"
            >
              <Bell size={18} className="text-[#0D5BA3]" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── CONTAINER DA PÁGINA (SCROLLÁVEL) ── */}
        <main className="flex-1 overflow-y-auto pb-20 sm:pb-6 relative">
          <Outlet />
        </main>

        {/* ── BOTTOM TAB NAVIGATION NO CELULAR ── */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 z-40 flex items-center justify-around px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {mobileMainTabs.map((tab) => {
            const isCrm = tab.to === '/v2/crm'
            const isActive = isCrm
              ? location.pathname.startsWith('/v2/crm')
              : location.pathname === tab.to || location.pathname.startsWith(tab.to + '/')

            const Icon = tab.icon

            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="flex flex-col items-center justify-center flex-1 py-1 transition-colors select-none"
              >
                <Icon
                  size={20}
                  className={isActive ? 'text-[#0D5BA3]' : 'text-slate-500'}
                />
                <span
                  className={`text-[11px] mt-1 ${
                    isActive ? 'font-bold text-[#0D5BA3]' : 'font-medium text-slate-600'
                  }`}
                >
                  {tab.label}
                </span>
              </NavLink>
            )
          })}

          {/* Botão "Mais" (abre sheet com todos os módulos) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 transition-colors select-none text-slate-600 hover:text-[#0D5BA3] cursor-pointer"
          >
            <MoreHorizontal size={22} className="text-slate-600" />
            <span className="text-[11px] mt-0.5 font-medium text-slate-600">
              Mais
            </span>
          </button>
        </nav>

        {/* ── DRAWER / BOTTOM SHEET "MAIS" (MÓDULOS NO CELULAR) ── */}
        {mobileMenuOpen && (
          <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Sheet Content */}
            <div className="relative bg-white rounded-t-3xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-250">
              {/* Drag bar indicator */}
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Menu Completo</h3>
                  <p className="text-xs text-slate-500">Módulos do sistema Bem Aviv</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Grid com todos os módulos */}
              <div className="grid grid-cols-2 gap-2.5 mb-6">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname.startsWith(item.to)

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border transition ${
                        isActive
                          ? 'border-[#0D5BA3] bg-[#EBF3FA] text-[#0D5BA3]'
                          : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white text-[#0D5BA3] shadow-xs' : 'bg-white text-slate-600'
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="text-xs font-bold leading-tight">{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>

              {/* Ações inferiores no menu mobile */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    setIsPushModalOpen(true)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
                >
                  <Bell size={15} className="text-[#0D5BA3]" />
                  Notificações
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700"
                >
                  <LogOut size={15} />
                  Sair
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <PushNotificationModal
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        systemSource="v2"
      />
    </div>
  )
}
