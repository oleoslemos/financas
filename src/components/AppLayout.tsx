import { useUser, UserButton } from '@clerk/clerk-react'
import {
  ArrowLeftRight,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  Landmark,
  ListTodo,
  Menu,
  Package,
  ShoppingCart,
  Table2,
  Tags,
  UserCircle,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'

/** Links de navegação: sem caixa de formulário, hierarquia por cor e recuo. */
const navLinkBase =
  'flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-normal leading-snug transition-colors normal-case'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} ${isActive ? 'bg-sky-100 font-medium text-sky-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`

const navLinkNested = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} ${isActive ? 'bg-sky-50 font-medium text-sky-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`

const navLinkDeep = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} pl-1 text-[12.5px] ${isActive ? 'bg-sky-50 font-medium text-sky-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`

/** Grupo expansível: sem borda de input; affordance por chevron à esquerda. */
function NavGroupToggle(props: {
  open: boolean
  active: boolean
  label: string
  onClick: () => void
  icon?: ReactNode
}) {
  const { open, active, label, onClick, icon } = props
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-[13px] font-semibold normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
        active ? 'text-sky-900' : 'text-slate-800'
      } hover:bg-slate-50`}
    >
      <span className="flex shrink-0 text-slate-400" aria-hidden>
        {open ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
      </span>
      {icon ? <span className="shrink-0 text-slate-500">{icon}</span> : null}
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  )
}

function NavSubGroupToggle(props: { open: boolean; label: string; onClick: () => void }) {
  const { open, label, onClick } = props
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12.5px] font-medium normal-case text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
    >
      <span className="flex shrink-0 text-slate-400" aria-hidden>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  )
}

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
  const { user } = useUser()
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
  const tasksHomologEnabled = canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 uppercase lg:hidden">
        <h1 className="text-xs font-semibold tracking-wide text-sky-700">Sistema de gestão</h1>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white uppercase"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <aside
        className={`${mobileMenuOpen ? 'block' : 'hidden'} shrink-0 border-b border-slate-200 bg-white p-3 shadow-sm normal-case sm:p-4 lg:block lg:w-64 lg:border-b-0 lg:border-r lg:shadow-none`}
      >
        <h1 className="mb-4 text-sm font-semibold leading-tight tracking-tight text-sky-800 sm:mb-6">
          Sistema de gestão
        </h1>
        <nav className="flex flex-col gap-0.5" aria-label="Navegação principal">
          {tasksHomologEnabled ? (
            <div className="mb-1">
              <NavLink
                to="/lsh/tarefas"
                className={({ isActive }) =>
                  `${navLinkBase} font-semibold ${isActive ? 'bg-sky-100 text-sky-900' : 'text-slate-800 hover:bg-slate-50'}`
                }
              >
                <ListTodo size={18} className="shrink-0 text-sky-600" aria-hidden />
                Tarefas
              </NavLink>
            </div>
          ) : null}

          <div className="pt-1">
            <NavGroupToggle
              open={lshOpen}
              active={lshActive}
              label="LSH"
              onClick={() => setLshOpen((v) => !v)}
              icon={<LayoutDashboard size={17} className="text-slate-500" aria-hidden />}
            />
            {lshOpen && (
              <div
                className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l-2 border-slate-200/90 py-0.5 pl-3"
                role="group"
                aria-label="LSH"
              >
                <NavLink to="/lsh/resumo" className={navLinkClass} end>
                  <LayoutDashboard size={16} className="shrink-0 opacity-70" aria-hidden />
                  Resumo
                </NavLink>
                <NavLink to="/lsh/contas-bancarias" className={navLinkClass}>
                  <Landmark size={16} className="shrink-0 opacity-70" aria-hidden />
                  Contas bancárias
                </NavLink>
                <NavLink to="/lsh/categorias" className={navLinkClass}>
                  <Tags size={16} className="shrink-0 opacity-70" aria-hidden />
                  Categorias
                </NavLink>
                <NavLink to="/lsh/fluxo" className={navLinkClass}>
                  <ArrowLeftRight size={16} className="shrink-0 opacity-70" aria-hidden />
                  Pagar / receber
                </NavLink>
                <NavLink to="/lsh/cartoes" className={navLinkClass}>
                  <CreditCard size={16} className="shrink-0 opacity-70" aria-hidden />
                  Cartões
                </NavLink>
              </div>
            )}
          </div>

          <div className="mt-2 pt-1">
            <NavGroupToggle
              open={bemAvivOpen}
              active={location.pathname.startsWith('/bem-aviv')}
              label="Bem Aviv"
              onClick={() => setBemAvivOpen((v) => !v)}
              icon={<Building2 size={17} className="text-slate-500" aria-hidden />}
            />
            {bemAvivOpen && (
              <div
                className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l-2 border-slate-200/90 py-0.5 pl-3"
                role="group"
                aria-label="Bem Aviv"
              >
                <NavSubGroupToggle open={bemCadastroOpen} label="Cadastro" onClick={() => setBemCadastroOpen((v) => !v)} />
                {bemCadastroOpen && (
                  <div className="ml-2 border-l border-slate-200 pl-2.5">
                    <NavLink to="/bem-aviv/clientes" className={navLinkNested}>
                      <UserCircle size={15} className="shrink-0 opacity-70" aria-hidden />
                      Clientes
                    </NavLink>
                    <NavSubGroupToggle open={bemProdutosOpen} label="Produtos" onClick={() => setBemProdutosOpen((v) => !v)} />
                    {bemProdutosOpen && (
                      <div className="ml-2 border-l border-slate-200 pl-2.5">
                        <NavLink to="/bem-aviv/produtos/plataforma-de-descanso" className={navLinkDeep}>
                          <Package size={14} className="shrink-0 opacity-60" aria-hidden />
                          Plataforma de descanso
                        </NavLink>
                        <NavLink to="/bem-aviv/produtos/cabeceiras" className={navLinkDeep}>
                          <Package size={14} className="shrink-0 opacity-60" aria-hidden />
                          Cabeceiras
                        </NavLink>
                        <NavLink to="/bem-aviv/produtos/bases-camas" className={navLinkDeep}>
                          <Package size={14} className="shrink-0 opacity-60" aria-hidden />
                          Bases / camas
                        </NavLink>
                        <NavLink to="/bem-aviv/produtos/acessorios" className={navLinkDeep}>
                          <Package size={14} className="shrink-0 opacity-60" aria-hidden />
                          Acessórios
                        </NavLink>
                      </div>
                    )}
                  </div>
                )}
                <NavLink to="/bem-aviv/pedidos" className={navLinkNested}>
                  <ShoppingCart size={15} className="shrink-0 opacity-70" aria-hidden />
                  Pedidos de vendas
                </NavLink>
                <NavSubGroupToggle open={bemGeralOpen} label="Geral" onClick={() => setBemGeralOpen((v) => !v)} />
                {bemGeralOpen && (
                  <div className="ml-2 border-l border-slate-200 pl-2.5">
                    <NavLink to="/bem-aviv/categorias" className={navLinkNested}>
                      <Tags size={15} className="shrink-0 opacity-70" aria-hidden />
                      Categorias
                    </NavLink>
                    <NavLink to="/bem-aviv/tabela-preco" className={navLinkNested}>
                      <Table2 size={15} className="shrink-0 opacity-70" aria-hidden />
                      Tabela de preço
                    </NavLink>
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
      <main className="w-full min-w-0 flex-1 bg-white p-3 sm:p-4 lg:bg-slate-50 lg:p-6 xl:px-10 xl:py-8 2xl:px-12">
        <Outlet />
      </main>
    </div>
  )
}
