import { useUser, UserButton } from '@clerk/clerk-react'
import { BriefcaseBusiness, CalendarDays, CircleDollarSign, CreditCard, FolderKanban, KanbanSquare, Landmark, ListTodo, MessageCircleMore, NotebookText, Package, ShoppingCart, StickyNote, Table2, Tags, UserCircle, Users, Workflow } from 'lucide-react'
import { type ComponentType, useMemo } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { canAccessProjects } from '../lib/projectsAccess'

type MenuItem = {
  label: string
  to?: string
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  children?: Array<{ label: string; to: string; icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }> }>
}

const topTriggerBase =
  'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900'

const moduleLinkBase =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900'

export function AppLayout() {
  const { user } = useUser()
  const location = useLocation()

  const emails = clerkEmailCandidates(user)
  const bemAvivOnlyUser = emails.includes('suelenjalves@gmail.com')
  const hideAgendaTasks = emails.includes('suelenjalves@gmail.com')
  const tasksHomologEnabled = !hideAgendaTasks && canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)
  const projectsEnabled = emails.some((email) => canAccessProjects(email))

  const agendaItems = useMemo<MenuItem[]>(
    () => [
      { label: 'Agenda', to: '/lsh/agenda', icon: CalendarDays },
      { label: 'Tarefas', to: '/lsh/tarefas', icon: ListTodo },
    ],
    [],
  )

  const lshItems = useMemo<MenuItem[]>(
    () => [
      { label: 'Movimentos financeiros', to: '/lsh/fluxo', icon: CircleDollarSign },
      {
        label: 'Cadastros',
        children: [
          { label: 'Contas bancárias', to: '/lsh/contas-bancarias', icon: Landmark },
          { label: 'Categorias', to: '/lsh/categorias', icon: Tags },
          { label: 'Cartões', to: '/lsh/cartoes', icon: CreditCard },
        ],
      },
    ],
    [],
  )

  const bemAvivItems = useMemo<MenuItem[]>(
    () => [
      { label: 'Clientes', to: '/bem-aviv/clientes', icon: UserCircle },
      { label: 'Follow-up', to: '/bem-aviv/follow-up', icon: MessageCircleMore },
      { label: 'Pedidos de vendas / orçamento', to: '/bem-aviv/pedidos', icon: ShoppingCart },
      { label: 'Produtos', to: '/bem-aviv/produtos-catalogo', icon: Package },
      { label: 'Produtos old (todos)', to: '/bem-aviv/produtos', icon: Package },
      {
        label: 'Cadastros',
        children: [
          { label: 'Categorias', to: '/bem-aviv/categorias', icon: Tags },
          { label: 'Tabela de preço', to: '/bem-aviv/tabela-preco-catalogo', icon: Table2 },
          { label: 'Catálogos em grade', to: '/bem-aviv/catalogos-preco', icon: Table2 },
        ],
      },
    ],
    [],
  )

  const projectItems = useMemo<MenuItem[]>(
    () => [
      { label: 'Quadro Kanban', to: '/projetos/kanban', icon: KanbanSquare },
      { label: 'Backlog e planejamento', to: '/projetos/backlog', icon: FolderKanban },
      {
        label: 'Execução',
        children: [
          { label: 'Projetos / Clientes', to: '/projetos/clientes', icon: BriefcaseBusiness },
          { label: 'Responsáveis', to: '/projetos/responsaveis', icon: Users },
          { label: 'Sprints', to: '/projetos/sprints', icon: Workflow },
          { label: 'Tarefas e atividades', to: '/projetos/atividades', icon: ListTodo },
          { label: 'Lista de tarefas', to: '/projetos/anotacoes', icon: NotebookText },
          { label: 'Post-its', to: '/projetos/anotacoes', icon: StickyNote },
        ],
      },
    ],
    [],
  )

  const activeSystem = useMemo<'agenda' | 'projects' | 'lsh' | 'bem-aviv'>(() => {
    if (location.pathname.startsWith('/bem-aviv')) return 'bem-aviv'
    if (location.pathname.startsWith('/projetos')) return 'projects'
    if (location.pathname.startsWith('/lsh/agenda') || location.pathname.startsWith('/lsh/tarefas')) return 'agenda'
    if (location.pathname.startsWith('/lsh')) return 'lsh'
    return 'bem-aviv'
  }, [location.pathname])

  const selectedLinks = useMemo(() => {
    const source =
      activeSystem === 'agenda' && tasksHomologEnabled
        ? agendaItems
        : activeSystem === 'projects' && projectsEnabled
          ? projectItems
          : activeSystem === 'lsh' && !bemAvivOnlyUser
            ? lshItems
            : bemAvivItems

    return source.flatMap((item) => {
      const parent = item.to ? [{ label: item.label, to: item.to, icon: item.icon }] : []
      const children = (item.children ?? []).map((c) => ({ label: c.label, to: c.to, icon: c.icon }))
      return [...parent, ...children]
    })
  }, [activeSystem, tasksHomologEnabled, projectsEnabled, bemAvivOnlyUser, agendaItems, projectItems, lshItems, bemAvivItems])

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4 lg:px-6">
          <h1 className="text-sm font-semibold tracking-tight text-emerald-800">Sistema de gestão</h1>
          <div className="flex items-center gap-2">
            <nav className="flex flex-col items-end gap-1" aria-label="Navegação principal">
              <div className="flex items-center gap-1">
                {tasksHomologEnabled ? (
                  <NavLink
                    to="/lsh/agenda"
                    className={({ isActive }) =>
                      `${topTriggerBase} ${isActive || activeSystem === 'agenda' ? 'bg-slate-100 text-slate-900' : ''}`
                    }
                  >
                    Agenda e Tarefas
                  </NavLink>
                ) : null}
                {projectsEnabled ? (
                  <NavLink
                    to="/projetos"
                    className={({ isActive }) =>
                      `${topTriggerBase} ${isActive || activeSystem === 'projects' ? 'bg-slate-100 text-slate-900' : ''}`
                    }
                  >
                    Projetos
                  </NavLink>
                ) : null}
                {!bemAvivOnlyUser ? (
                  <NavLink
                    to="/lsh/inicio"
                    className={({ isActive }) =>
                      `${topTriggerBase} ${isActive || activeSystem === 'lsh' ? 'bg-slate-100 text-slate-900' : ''}`
                    }
                  >
                    Sistema Gestão
                  </NavLink>
                ) : null}
                <NavLink
                  to="/bem-aviv"
                  className={({ isActive }) =>
                    `${topTriggerBase} ${isActive || activeSystem === 'bem-aviv' ? 'bg-slate-100 text-slate-900' : ''}`
                  }
                >
                  Bem Aviv
                </NavLink>
              </div>
              <div className="flex max-w-[74vw] flex-wrap justify-end gap-1">
                {selectedLinks.map((item) => (
                  <NavLink
                    key={`${item.to}-${item.label}`}
                    to={item.to}
                    className={({ isActive }) => `${moduleLinkBase} ${isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : ''}`}
                  >
                    {item.icon ? <item.icon size={13} className="opacity-80" aria-hidden /> : null}
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="w-full min-w-0 bg-white p-3 sm:p-4 lg:p-6 xl:px-10 xl:py-8 2xl:px-12">
        <Outlet />
      </main>
    </div>
  )
}
