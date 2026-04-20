import { useUser, UserButton } from '@clerk/clerk-react'
import { CalendarDays, CreditCard, LayoutDashboard, Landmark, ListTodo, Menu, Package, ShoppingCart, Table2, Tags, UserCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'

const LAST_VISITED_PATH_KEY = 'sistema_financeiro:last_path'

const navLinkBase = 'flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-normal leading-snug transition-colors normal-case'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${navLinkBase} ${isActive ? 'bg-emerald-100/70 font-medium text-emerald-900' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'}`

function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
}

function SubTitle({ children }: { children: string }) {
  return <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

export function AppLayout() {
  const { user } = useUser()
  const location = useLocation()
  const path = location.pathname
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [path])

  useEffect(() => {
    if (!path.startsWith('/lsh') && !path.startsWith('/bem-aviv')) return
    window.localStorage.setItem(LAST_VISITED_PATH_KEY, path)
  }, [path])

  const emails = clerkEmailCandidates(user)
  const hideAgendaTasks = emails.includes('suelenjalves@gmail.com')
  const tasksHomologEnabled = !hideAgendaTasks && canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row lg:bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 uppercase lg:hidden">
        <h1 className="text-xs font-semibold tracking-wide text-emerald-800">Sistema de gestão</h1>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white uppercase"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      <aside
        className={`${mobileMenuOpen ? 'block' : 'hidden'} shrink-0 border-b border-slate-200 bg-white/95 p-3 shadow-sm normal-case backdrop-blur-sm sm:p-4 lg:block lg:w-64 lg:border-b-0 lg:border-r lg:shadow-none`}
      >
        <h1 className="mb-4 text-sm font-semibold leading-tight tracking-tight text-emerald-800 sm:mb-6">Sistema de gestão</h1>

        <nav className="flex flex-col gap-0.5" aria-label="Navegação principal">
          {tasksHomologEnabled ? (
            <>
              <SectionTitle>Agenda e Tarefas</SectionTitle>
              <NavLink to="/lsh/agenda" className={navLinkClass}>
                <LayoutDashboard size={16} className="shrink-0 opacity-70" aria-hidden />
                Visão geral
              </NavLink>
              <NavLink to="/lsh/agenda" className={navLinkClass}>
                <CalendarDays size={16} className="shrink-0 opacity-70" aria-hidden />
                Agenda
              </NavLink>
              <NavLink to="/lsh/tarefas" className={navLinkClass}>
                <ListTodo size={16} className="shrink-0 opacity-70" aria-hidden />
                Tarefas
              </NavLink>
            </>
          ) : null}

          <SectionTitle>Gestão LSH</SectionTitle>
          <NavLink to="/lsh/resumo" className={navLinkClass}>
            <LayoutDashboard size={16} className="shrink-0 opacity-70" aria-hidden />
            Visão geral
          </NavLink>
          <NavLink to="/lsh/fluxo" className={navLinkClass}>
            <ShoppingCart size={16} className="shrink-0 opacity-70" aria-hidden />
            Movimentos financeiros
          </NavLink>
          <SubTitle>Cadastros</SubTitle>
          <NavLink to="/lsh/contas-bancarias" className={navLinkClass}>
            <Landmark size={16} className="shrink-0 opacity-70" aria-hidden />
            Contas bancárias
          </NavLink>
          <NavLink to="/lsh/categorias" className={navLinkClass}>
            <Tags size={16} className="shrink-0 opacity-70" aria-hidden />
            Categorias
          </NavLink>
          <NavLink to="/lsh/cartoes" className={navLinkClass}>
            <CreditCard size={16} className="shrink-0 opacity-70" aria-hidden />
            Cartões
          </NavLink>

          <SectionTitle>Bem Aviv</SectionTitle>
          <NavLink to="/bem-aviv" className={navLinkClass}>
            <LayoutDashboard size={16} className="shrink-0 opacity-70" aria-hidden />
            Visão geral
          </NavLink>
          <NavLink to="/bem-aviv/pedidos" className={navLinkClass}>
            <ShoppingCart size={16} className="shrink-0 opacity-70" aria-hidden />
            Pedidos de vendas / orçamento
          </NavLink>
          <NavLink to="/bem-aviv/clientes" className={navLinkClass}>
            <UserCircle size={16} className="shrink-0 opacity-70" aria-hidden />
            Clientes
          </NavLink>
          <NavLink to="/bem-aviv/produtos-catalogo" className={navLinkClass}>
            <Package size={16} className="shrink-0 opacity-70" aria-hidden />
            Produtos
          </NavLink>
          <NavLink to="/bem-aviv/produtos" className={navLinkClass}>
            <Package size={16} className="shrink-0 opacity-70" aria-hidden />
            Produtos old (todos)
          </NavLink>
          <SubTitle>Cadastros</SubTitle>
          <NavLink to="/bem-aviv/categorias" className={navLinkClass}>
            <Tags size={16} className="shrink-0 opacity-70" aria-hidden />
            Categorias
          </NavLink>
          <NavLink to="/bem-aviv/tabela-preco-catalogo" className={navLinkClass}>
            <Table2 size={16} className="shrink-0 opacity-70" aria-hidden />
            Tabela de preço
          </NavLink>
          <NavLink to="/bem-aviv/catalogos-preco" className={navLinkClass}>
            <Table2 size={16} className="shrink-0 opacity-70" aria-hidden />
            Catálogos em grade
          </NavLink>
        </nav>

        <div className="mt-6 flex items-center gap-2 sm:mt-8">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </aside>

      <main className="w-full min-w-0 flex-1 bg-white p-3 sm:p-4 lg:bg-white lg:p-6 xl:px-10 xl:py-8 2xl:px-12">
        <Outlet />
      </main>
    </div>
  )
}
