import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Tag, Calculator, Users, LogOut, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { getCurrentV2User, logoutV2User } from '../../services/v2AuthService'
import { CompanyProvider } from '../../../context/CompanyContext'
import { subscribeNetworkStatus, syncOutboxNow, getOutbox } from '../services/v2OrcamentoOfflineService'
import { OrcamentoPwaManifest } from '../components/OrcamentoPwaManifest'

export function V2OrcamentoLayout() {
  return (
    <CompanyProvider>
      <V2OrcamentoLayoutInner />
    </CompanyProvider>
  )
}

function V2OrcamentoLayoutInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getCurrentV2User()
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState<number>(() => getOutbox().length)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((online) => {
      setIsOnline(online)
      setPendingCount(getOutbox().length)
    })
    return unsubscribe
  }, [])

  const handleManualSync = async () => {
    setIsSyncing(true)
    await syncOutboxNow()
    setPendingCount(getOutbox().length)
    setIsSyncing(false)
  }

  const handleLogout = () => {
    logoutV2User()
    navigate('/v2/orcamento/login')
  }

  const navItems = [
    {
      to: '/v2/orcamento/tabela-preco',
      label: 'Tabela',
      icon: Tag,
    },
    {
      to: '/v2/orcamento/propostas',
      label: 'Orçamento',
      icon: Calculator,
      matchPrefix: '/v2/orcamento/propostas',
    },
    {
      to: '/v2/orcamento/clientes',
      label: 'Clientes & CRM',
      icon: Users,
    },
  ]

  const isCurrentActive = (item: typeof navItems[0]) => {
    if (item.matchPrefix) {
      return location.pathname.startsWith(item.matchPrefix)
    }
    return location.pathname === item.to
  }

  return (
    <>
      <OrcamentoPwaManifest />
    <div className="min-h-[100dvh] w-screen flex flex-col md:flex-row bg-[#F4F8F3] text-slate-900 font-sans select-none overflow-x-hidden">
      
      {/* ── TOP BAR (MOBILE & TABLET COMPACT) ── */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-bem-aviv.png"
            alt="Bem Aviv"
            className="h-8 max-h-[32px] w-auto object-contain"
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-black tracking-tight text-[#0D6BAF] uppercase">Módulo Orçamento</span>
            <span className="text-[10px] text-slate-400 font-medium -mt-0.5">Vendas & Atendimento</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Offline / Online Badge */}
          {isOnline ? (
            pendingCount > 0 ? (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                title="Clique para sincronizar pedidos pendentes"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</span>
              </button>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Wifi className="w-3 h-3 text-emerald-600" />
                <span>Online</span>
              </span>
            )
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              <WifiOff className="w-3 h-3" />
              <span>Offline</span>
            </span>
          )}

          {/* User Name & Logout */}
          <div className="flex items-center gap-2 pl-1 border-l border-slate-200 ml-1">
            <span className="hidden sm:inline-block text-xs font-bold text-slate-700 truncate max-w-[120px]">
              {user?.full_name?.split(' ')[0] || user?.username}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
              title="Sair do sistema"
              aria-label="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* ── TABLET RAIL NAVIGATION (>= 768px) ── */}
        <aside className="hidden md:flex flex-col w-[72px] shrink-0 bg-white border-r border-slate-200 py-4 items-center justify-between z-20">
          <nav className="flex flex-col gap-3 w-full px-2" aria-label="Navegação Tablet">
            {navItems.map((item) => {
              const active = isCurrentActive(item)
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`w-full min-h-[56px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
                    active
                      ? 'bg-[#0D6BAF] text-white shadow-md shadow-[#0D6BAF]/20'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] font-bold leading-none tracking-tight text-center px-1">
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </nav>
        </aside>

        {/* ── SCREEN VIEW (PADDED AT BOTTOM ON MOBILE FOR BOTTOM NAV) ── */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6 p-3 sm:p-4 md:p-6" id="orcamento-main-container">
          <Outlet />
        </main>

        {/* ── MOBILE BOTTOM NAVIGATION (< 768px) ── */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 grid grid-cols-3 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          aria-label="Navegação Mobile"
        >
          {navItems.map((item) => {
            const active = isCurrentActive(item)
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-all relative ${
                  active ? 'text-[#0D6BAF]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#0D6BAF] rounded-b-full" />
                )}
                <Icon className={`w-5 h-5 shrink-0 transition-transform ${active ? 'scale-110' : ''}`} />
                <span className={`text-[11px] font-bold tracking-tight ${active ? 'font-black text-[#0D6BAF]' : ''}`}>
                  {item.label}
                </span>
              </NavLink>
            )
          })}
        </nav>

      </div>

    </div>
    </>
  )
}
