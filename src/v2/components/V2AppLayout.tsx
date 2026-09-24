import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useUser } from '../../hooks/useClerkCompat'
import { supabase } from '../../lib/supabaseClient'
import { CompanyProvider, useCompany } from '../../context/CompanyContext'
import {
  LogOut,
  Sparkles,
  Grid,
  Building2,
  ChevronDown,
  Building,
} from 'lucide-react'

export function V2AppLayout() {
  return (
    <CompanyProvider>
      <V2AppLayoutInner />
    </CompanyProvider>
  )
}

function V2AppLayoutInner() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false)

  const { companies, activeCompany, activeCompanyId, setActiveCompanyId } = useCompany()

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    }
    navigate('/v2/login')
  }

  const userEmail = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || 'Usuário'
  const userName = user?.fullName || user?.firstName || userEmail.split('@')[0] || 'Usuário'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Main Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/85 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/v2/login" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-sky-500 to-emerald-400 p-[1.5px] shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <div className="h-full w-full bg-slate-950 rounded-[10.5px] flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-white bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  FINANÇAS
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  V2 PRO
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Gestão Financeira Multiempresa</p>
            </div>
          </Link>
        </div>

        {/* Company Switcher & User Profile Bar */}
        <div className="flex items-center gap-3">
          {/* Multi-company Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700/60 shadow-sm transition-all"
            >
              <Building2 className="h-4 w-4 text-sky-400" />
              <span className="max-w-[140px] truncate">
                {activeCompany?.trade_name || (companies.length > 0 ? 'Selecionar Empresa' : 'Minha Empresa')}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {companyDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 space-y-1">
                <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Empresas Disponíveis ({companies.length})
                </div>

                {companies.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 text-center">Empresa Padrão Ativa</div>
                ) : (
                  companies.map((c) => {
                    const isCurrent = c.id === activeCompanyId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setActiveCompanyId(c.id)
                          setCompanyDropdownOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition ${
                          isCurrent
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-300 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate">{c.trade_name}</span>
                        </div>
                        {isCurrent && <span className="text-[9px] bg-indigo-700 px-1.5 py-0.5 rounded">Ativa</span>}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          <Link
            to="/escolher-sistema"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/50 transition-all"
          >
            <Grid className="h-3.5 w-3.5 text-indigo-400" />
            <span>Trocar Hub</span>
          </Link>

          <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <div className="h-7 w-7 rounded-lg bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-bold text-slate-200 leading-none">{userName}</p>
              <p className="text-[10px] text-slate-400 truncate max-w-[140px] leading-tight">{userEmail}</p>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              title="Sair da Conta"
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition ml-1"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Dynamic Page Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <Outlet />
      </main>
    </div>
  )
}
