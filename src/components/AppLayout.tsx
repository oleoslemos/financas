import { UserButton } from '@clerk/clerk-react'
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-xs font-medium tracking-wide ${isActive ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`

function isLshSectionPath(pathname: string): boolean {
  if (pathname === '/' || pathname.startsWith('/lsh')) return true
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [bemCadastroOpen, setBemCadastroOpen] = useState(true)
  const [bemProdutosOpen, setBemProdutosOpen] = useState(true)
  const [bemGeralOpen, setBemGeralOpen] = useState(true)

  useEffect(() => {
    if (isLshSectionPath(location.pathname)) setLshOpen(true)
    if (location.pathname.startsWith('/bem-aviv')) setBemAvivOpen(true)
    setMobileMenuOpen(false)
  }, [location.pathname])

  const lshActive = isLshSectionPath(location.pathname)

  return (
    <div className="flex min-h-screen flex-col uppercase md:flex-row md:bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <h1 className="text-xs font-semibold tracking-wide text-sky-700">SISTEMA DE GESTÃO</h1>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white" onClick={() => setMobileMenuOpen((v) => !v)}>
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <aside className={`${mobileMenuOpen ? 'block' : 'hidden'} shrink-0 border-b border-slate-200 bg-white p-3 shadow-sm sm:p-4 md:block md:w-64 md:border-b-0 md:border-r md:shadow-none`}>
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
                <NavLink to="/lsh/resumo" className={linkClass} end>
                  RESUMO
                </NavLink>
                <NavLink to="/lsh/contas-bancarias" className={linkClass}>
                  CONTAS BANCÁRIAS
                </NavLink>
                <NavLink to="/lsh/categorias" className={linkClass}>
                  CATEGORIAS
                </NavLink>
                <NavLink to="/lsh/fluxo" className={linkClass}>
                  PAGAR / RECEBER
                </NavLink>
                <NavLink to="/lsh/cartoes" className={linkClass}>
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
              <div className="mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 md:ml-2">
                <button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100" onClick={() => setBemCadastroOpen((v) => !v)}>
                  <span>1. CADASTRO</span>
                  {bemCadastroOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {bemCadastroOpen && (
                  <div className="ml-2 border-l border-slate-200 pl-2">
                    <NavLink to="/bem-aviv/clientes" className={linkClass}>1.1 CLIENTES</NavLink>
                    <button type="button" className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100" onClick={() => setBemProdutosOpen((v) => !v)}>
                      <span>1.2 PRODUTOS GERAL</span>
                      {bemProdutosOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {bemProdutosOpen && (
                      <div className="ml-2 border-l border-slate-200 pl-2">
                        <NavLink to="/bem-aviv/produtos/plataforma-de-descanso" className={linkClass}>1.2.1 PLATAFORMA DE DESCANSO</NavLink>
                        <NavLink to="/bem-aviv/produtos/cabeceiras" className={linkClass}>1.2.3 CABECEIRAS</NavLink>
                        <NavLink to="/bem-aviv/produtos/bases-camas" className={linkClass}>1.2.4 BASES / CAMAS</NavLink>
                        <NavLink to="/bem-aviv/produtos/acessorios" className={linkClass}>1.2.5 ACESSÓRIOS</NavLink>
                      </div>
                    )}
                  </div>
                )}
                <NavLink to="/bem-aviv/pedidos" className={linkClass}>2. PEDIDOS DE VENDAS</NavLink>
                <button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100" onClick={() => setBemGeralOpen((v) => !v)}>
                  <span>3. GERAL</span>
                  {bemGeralOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {bemGeralOpen && (
                  <div className="ml-2 border-l border-slate-200 pl-2">
                    <NavLink to="/bem-aviv/categorias" className={linkClass}>3.1 CATEGORIAS</NavLink>
                    <NavLink to="/bem-aviv/tabela-preco" className={linkClass}>3.2 TABELA DE PREÇO</NavLink>
                  </div>
                )}
              </div>
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
