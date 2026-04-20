import { useUser, UserButton } from '@clerk/clerk-react'
import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
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
import { clerkEmailCandidates } from '../lib/clerkEmails'

const navLinkBase =
  'flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-normal leading-snug transition-colors normal-case'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} ${isActive ? 'bg-emerald-100/70 font-medium text-emerald-900' : 'text-amber-900/75 hover:bg-amber-50 hover:text-amber-950'}`

const navLinkNested = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} ${isActive ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-amber-900/70 hover:bg-amber-50 hover:text-amber-950'}`

const navLinkDeep = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} pl-1 text-[12.5px] ${isActive ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-amber-900/65 hover:bg-amber-50 hover:text-amber-900'}`

const groupCardClass =
  'rounded-xl border border-amber-200/90 bg-gradient-to-b from-[#fffdf8] to-[#f8f2e7] shadow-sm ring-1 ring-amber-950/[0.05]'

const subGroupCardClass =
  'rounded-lg border border-amber-200/80 bg-[#fffdf9]/95 shadow-sm ring-1 ring-amber-950/[0.03]'

/** Grupo principal: caixa moderna; chevron só expande; título navega para resumo. */
function NavGroupCard(props: {
  open: boolean
  sectionActive: boolean
  summaryTo: string
  label: string
  icon?: ReactNode
  onToggle: () => void
}) {
  const { open, sectionActive, summaryTo, label, icon, onToggle } = props
  return (
    <div className={`${groupCardClass} mb-1.5`}>
      <div className="flex min-h-[44px] items-stretch">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Recolher seção' : 'Expandir seção'}
          onClick={(e) => {
            e.preventDefault()
            onToggle()
          }}
          className="flex w-10 shrink-0 items-center justify-center rounded-l-[0.65rem] border-r border-amber-200/70 text-amber-900/70 transition hover:bg-amber-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/40"
        >
          {open ? <ChevronDown size={18} strokeWidth={2} /> : <ChevronRight size={18} strokeWidth={2} />}
        </button>
        <NavLink
          to={summaryTo}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 items-center gap-2 rounded-r-[0.65rem] px-3 py-2.5 text-left text-[13px] font-semibold normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/35 ${
              sectionActive || isActive ? 'bg-emerald-50/80 text-emerald-950' : 'text-amber-950/85 hover:bg-amber-50'
            }`
          }
        >
          {icon ? <span className="shrink-0 text-amber-900/65">{icon}</span> : null}
          <span className="min-w-0 truncate">{label}</span>
        </NavLink>
      </div>
    </div>
  )
}

/** Subgrupo (Cadastro, Produtos, Geral): mesma lógica — resumo por área. */
function NavSubGroupCard(props: {
  open: boolean
  sectionActive: boolean
  summaryTo: string
  label: string
  onToggle: () => void
}) {
  const { open, sectionActive, summaryTo, label, onToggle } = props
  return (
    <div className={`${subGroupCardClass} mt-1.5`}>
      <div className="flex min-h-[40px] items-stretch">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Recolher' : 'Expandir'}
          onClick={(e) => {
            e.preventDefault()
            onToggle()
          }}
          className="flex w-9 shrink-0 items-center justify-center rounded-l-md border-r border-amber-200/60 text-amber-900/55 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/35"
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <NavLink
          to={summaryTo}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 items-center px-2.5 py-2 text-left text-[12.5px] font-medium normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/35 ${
              sectionActive || isActive ? 'bg-emerald-50/80 text-emerald-950' : 'text-amber-900/70 hover:bg-amber-50'
            }`
          }
        >
          <span className="truncate">{label}</span>
        </NavLink>
      </div>
    </div>
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
  const path = location.pathname
  const [lshOpen, setLshOpen] = useState(false)
  const [bemAvivOpen, setBemAvivOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [agendaMenuOpen, setAgendaMenuOpen] = useState(false)
  const [bemCadastroOpen, setBemCadastroOpen] = useState(false)
  const [bemProdutosOpen, setBemProdutosOpen] = useState(false)
  const [bemGeralOpen, setBemGeralOpen] = useState(false)

  useEffect(() => {
    // Keep sidebar groups collapsed by default; only close the mobile drawer on navigation.
    setMobileMenuOpen(false)
  }, [path])

  const lshActive = isLshSectionPath(path)
  const bemAvivActive = path.startsWith('/bem-aviv')
  const cadastroSectionActive = path.startsWith('/bem-aviv/clientes') || path.startsWith('/bem-aviv/produtos')
  const produtosSectionActive = path.startsWith('/bem-aviv/produtos')
  const geralSectionActive = path.startsWith('/bem-aviv/categorias') || path.startsWith('/bem-aviv/tabela-preco')

  const emails = clerkEmailCandidates(user)
  const hideAgendaTasks = emails.includes('suelenjalves@gmail.com')
  const tasksHomologEnabled = !hideAgendaTasks && canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)
  const agendaActive = path.startsWith('/lsh/agenda') || path === '/agenda'
  const tasksActive = path.startsWith('/lsh/tarefas') || path === '/tarefas'
  const agendaSectionActive = agendaActive || tasksActive

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:bg-[#f3ecdf]">
      <header className="flex items-center justify-between border-b border-amber-200 bg-[#fffdf8] px-3 py-2 uppercase lg:hidden">
        <h1 className="text-xs font-semibold tracking-wide text-emerald-800">Sistema de gestão</h1>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-300 bg-[#fffdf8] uppercase"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <aside
        className={`${mobileMenuOpen ? 'block' : 'hidden'} shrink-0 border-b border-amber-200 bg-[#fffdf8]/95 p-3 shadow-sm normal-case backdrop-blur-sm sm:p-4 lg:block lg:w-64 lg:border-b-0 lg:border-r lg:shadow-none`}
      >
        <h1 className="mb-4 text-sm font-semibold leading-tight tracking-tight text-emerald-800 sm:mb-6">
          Sistema de gestão
        </h1>
        <nav className="flex flex-col gap-1" aria-label="Navegação principal">
          {tasksHomologEnabled ? (
            <div className="mb-2">
              <NavGroupCard
                open={agendaMenuOpen}
                sectionActive={agendaSectionActive}
                summaryTo="/lsh/agenda"
                label="Agenda e Tarefas"
                onToggle={() => setAgendaMenuOpen((v) => !v)}
                icon={<CalendarDays size={17} className="text-slate-500" aria-hidden />}
              />
              {agendaMenuOpen && (
                <div className="ml-1.5 mt-1 flex flex-col gap-0.5 border-l-2 border-amber-200/90 py-0.5 pl-3">
                  <NavLink to="/lsh/agenda" className={navLinkClass}>
                    <CalendarDays size={16} className="shrink-0 opacity-70" aria-hidden />
                    Resumo da agenda
                  </NavLink>
                  <NavLink to="/lsh/tarefas" className={navLinkClass}>
                    <ListTodo size={16} className="shrink-0 opacity-70" aria-hidden />
                    Gestão de tarefas
                  </NavLink>
                </div>
              )}
            </div>
          ) : null}

          <div className="pt-0.5">
            <NavGroupCard
              open={lshOpen}
              sectionActive={lshActive}
              summaryTo="/lsh/resumo"
              label="LSH"
              onToggle={() => setLshOpen((v) => !v)}
              icon={<LayoutDashboard size={17} className="text-slate-500" aria-hidden />}
            />
            {lshOpen && (
              <div
                className="ml-1.5 mt-1 flex flex-col gap-0.5 border-l-2 border-amber-200/90 py-0.5 pl-3"
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
                  Movimentos financeiros
                </NavLink>
                <NavLink to="/lsh/cartoes" className={navLinkClass}>
                  <CreditCard size={16} className="shrink-0 opacity-70" aria-hidden />
                  Cartões
                </NavLink>
              </div>
            )}
          </div>

          <div className="mt-2 pt-0.5">
            <NavGroupCard
              open={bemAvivOpen}
              sectionActive={bemAvivActive}
              summaryTo="/bem-aviv"
              label="Bem Aviv"
              onToggle={() => setBemAvivOpen((v) => !v)}
              icon={<Building2 size={17} className="text-slate-500" aria-hidden />}
            />
            {bemAvivOpen && (
              <div
                className="ml-1.5 mt-1 flex flex-col gap-0.5 border-l-2 border-amber-200/90 py-0.5 pl-3"
                role="group"
                aria-label="Bem Aviv"
              >
                <NavSubGroupCard
                  open={bemCadastroOpen}
                  sectionActive={cadastroSectionActive}
                  summaryTo="/bem-aviv/clientes"
                  label="Cadastro"
                  onToggle={() => setBemCadastroOpen((v) => !v)}
                />
                {bemCadastroOpen && (
                  <div className="ml-2 border-l border-amber-200 pl-2.5">
                    <NavLink to="/bem-aviv/clientes" className={navLinkNested}>
                      <UserCircle size={15} className="shrink-0 opacity-70" aria-hidden />
                      Clientes
                    </NavLink>
                    <NavSubGroupCard
                      open={bemProdutosOpen}
                      sectionActive={produtosSectionActive}
                      summaryTo="/bem-aviv/produtos/plataforma-de-descanso"
                      label="Produtos"
                      onToggle={() => setBemProdutosOpen((v) => !v)}
                    />
                    {bemProdutosOpen && (
                      <div className="ml-2 border-l border-amber-200 pl-2.5">
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
                <NavSubGroupCard
                  open={bemGeralOpen}
                  sectionActive={geralSectionActive}
                  summaryTo="/bem-aviv/categorias"
                  label="Geral"
                  onToggle={() => setBemGeralOpen((v) => !v)}
                />
                {bemGeralOpen && (
                  <div className="ml-2 border-l border-amber-200 pl-2.5">
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
      <main className="w-full min-w-0 flex-1 bg-[#fffdf8]/70 p-3 sm:p-4 lg:bg-[#f5efe4] lg:p-6 xl:px-10 xl:py-8 2xl:px-12">
        <Outlet />
      </main>
    </div>
  )
}
