import { UserButton } from '@clerk/clerk-react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-xs font-medium tracking-wide ${isActive ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`

function isLshSectionPath(pathname: string): boolean {
  if (pathname === '/') return true
  return (
    pathname.startsWith('/contas-bancarias') ||
    pathname.startsWith('/categorias') ||
    pathname.startsWith('/fluxo') ||
    pathname.startsWith('/cartoes')
  )
}

export function AppLayout() {
  const location = useLocation()
  const [lshOpen, setLshOpen] = useState(true)
  const [bemAvivOpen, setBemAvivOpen] = useState(false)

  useEffect(() => {
    if (isLshSectionPath(location.pathname)) setLshOpen(true)
  }, [location.pathname])

  const lshActive = isLshSectionPath(location.pathname)

  return (
    <div className="flex min-h-screen flex-col uppercase md:flex-row md:bg-slate-50">
      <aside className="shrink-0 border-b border-slate-200 bg-white p-3 shadow-sm sm:p-4 md:w-56 md:border-b-0 md:border-r md:shadow-none">
        <h1 className="mb-4 text-sm font-semibold leading-tight tracking-wide text-sky-700 sm:mb-6">
          SISTEMA DE GESTÃO
        </h1>
        <nav className="flex flex-col gap-1">
          <div>
            <button
              type="button"
              onClick={() => setLshOpen((v) => !v)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold tracking-wide transition-colors ${
                lshActive ? 'bg-sky-100 text-sky-900' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>LSH</span>
              {lshOpen ? <ChevronDown size={16} className="shrink-0 opacity-80" /> : <ChevronRight size={16} className="shrink-0 opacity-80" />}
            </button>
            {lshOpen && (
              <div className="mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 md:ml-2">
                <NavLink to="/" className={linkClass} end>
                  RESUMO
                </NavLink>
                <NavLink to="/contas-bancarias" className={linkClass}>
                  CONTAS BANCÁRIAS
                </NavLink>
                <NavLink to="/categorias" className={linkClass}>
                  CATEGORIAS
                </NavLink>
                <NavLink to="/fluxo" className={linkClass}>
                  PAGAR / RECEBER
                </NavLink>
                <NavLink to="/cartoes" className={linkClass}>
                  CARTÕES
                </NavLink>
              </div>
            )}
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setBemAvivOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <span>BEM AVIV</span>
              {bemAvivOpen ? (
                <ChevronDown size={16} className="shrink-0 opacity-80" />
              ) : (
                <ChevronRight size={16} className="shrink-0 opacity-80" />
              )}
            </button>
            {bemAvivOpen && (
              <p className="mt-2 px-3 text-[10px] leading-snug text-slate-500">
                NENHUM ITEM NESTA SEÇÃO NO MOMENTO.
              </p>
            )}
          </div>
        </nav>
        <div className="mt-6 flex items-center gap-2 sm:mt-8">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </aside>
      <main className="w-full min-w-0 flex-1 bg-white p-3 sm:p-4 md:bg-slate-50 md:p-6 lg:px-8 lg:py-8 xl:px-12">
        <Outlet />
      </main>
    </div>
  )
}
