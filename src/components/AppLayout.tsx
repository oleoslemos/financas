import { useUser, UserButton } from '@clerk/clerk-react'
import { BarChart3, BriefcaseBusiness, CalendarDays, ChevronDown, CircleDollarSign, CreditCard, FolderKanban, Gauge, KanbanSquare, LayoutDashboard, Landmark, ListTodo, MessageCircleMore, NotebookText, Package, ShoppingCart, StickyNote, Table2, Tags, UserCircle, Users, Workflow } from 'lucide-react'
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
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

const dropdownItemBase =
  'flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-normal leading-snug text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950'

function TreeDropdown({
  title,
  items,
  open,
  onOpen,
  onToggleClick,
  onClose,
  onCancelClose,
  onNavigate,
}: {
  title: string
  items: MenuItem[]
  open: boolean
  onOpen: () => void
  onToggleClick: () => void
  onClose: () => void
  onCancelClose: () => void
  onNavigate: () => void
}) {
  return (
    <div className="relative" onMouseEnter={onCancelClose} onMouseLeave={onClose}>
      <button type="button" className={`${topTriggerBase} ${open ? 'bg-slate-100 text-slate-900' : ''}`} onMouseEnter={onOpen} onClick={onToggleClick} aria-expanded={open}>
        {title}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" onMouseEnter={onCancelClose} onMouseLeave={onClose}>
          {items.map((item) => (
            <div key={item.label} className="mb-1 last:mb-0">
              {item.to ? (
                <NavLink to={item.to} onClick={onNavigate} className={({ isActive }) => `${dropdownItemBase} ${isActive ? 'bg-emerald-100/70 text-emerald-900' : ''}`}>
                  {item.icon ? <item.icon size={16} className="shrink-0 opacity-70" aria-hidden /> : null}
                  {item.label}
                </NavLink>
              ) : (
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
              )}
              {item.children ? (
                <div className="ml-3 border-l border-slate-200 pl-2">
                  {item.children.map((child) => (
                    <NavLink key={child.label} to={child.to} onClick={onNavigate} className={({ isActive }) => `${dropdownItemBase} text-[12.5px] ${isActive ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600'}`}>
                      {child.icon ? <child.icon size={15} className="shrink-0 opacity-70" aria-hidden /> : null}
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AppLayout() {
  const { user } = useUser()
  const location = useLocation()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const emails = clerkEmailCandidates(user)
  const bemAvivOnlyUser = emails.includes('suelenjalves@gmail.com')
  const hideAgendaTasks = emails.includes('suelenjalves@gmail.com')
  const tasksHomologEnabled = !hideAgendaTasks && canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)
  const projectsEnabled = emails.some((email) => canAccessProjects(email))
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleClose = (key: string) => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      setOpenMenu((current) => (current === key ? null : current))
      closeTimerRef.current = null
    }, 220)
  }

  const openMenuNow = (key: string) => {
    cancelClose()
    setOpenMenu(key)
  }

  const agendaItems = useMemo<MenuItem[]>(
    () => [
      { label: 'Visão geral', to: '/lsh/agenda', icon: LayoutDashboard },
      { label: 'Agenda', to: '/lsh/agenda', icon: CalendarDays },
      { label: 'Tarefas', to: '/lsh/tarefas', icon: ListTodo },
    ],
    [],
  )

  const lshItems = useMemo<MenuItem[]>(
    () => [
      { label: 'Visão geral', to: '/lsh/inicio', icon: LayoutDashboard },
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
      { label: 'Visão geral', to: '/bem-aviv', icon: LayoutDashboard },
      { label: 'Pedidos de vendas / orçamento', to: '/bem-aviv/pedidos', icon: ShoppingCart },
      { label: 'Clientes', to: '/bem-aviv/clientes', icon: UserCircle },
      { label: 'Follow-up', to: '/bem-aviv/follow-up', icon: MessageCircleMore },
      { label: 'Produtividade follow-up', to: '/bem-aviv/follow-up/produtividade', icon: BarChart3 },
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
      { label: 'Visão geral', to: '/projetos', icon: Gauge },
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

  const selectedTreeMenu = useMemo(() => {
    if (activeSystem === 'agenda' && tasksHomologEnabled) return { key: 'agenda', title: 'Menu Agenda e Tarefas', items: agendaItems, to: '/lsh/agenda' }
    if (activeSystem === 'projects' && projectsEnabled) return { key: 'projects', title: 'Menu Projetos', items: projectItems, to: '/projetos' }
    if (activeSystem === 'lsh' && !bemAvivOnlyUser) return { key: 'lsh', title: 'Menu Sistema Gestão', items: lshItems, to: '/lsh/inicio' }
    return { key: 'bem-aviv', title: 'Menu Bem Aviv', items: bemAvivItems, to: '/bem-aviv' }
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
              <TreeDropdown
                title={selectedTreeMenu.title}
                items={selectedTreeMenu.items}
                open={openMenu === selectedTreeMenu.key}
                onOpen={() => openMenuNow(selectedTreeMenu.key)}
                onToggleClick={() => {
                  navigate(selectedTreeMenu.to)
                  setOpenMenu((current) => (current === selectedTreeMenu.key ? null : selectedTreeMenu.key))
                }}
                onClose={() => scheduleClose(selectedTreeMenu.key)}
                onCancelClose={cancelClose}
                onNavigate={() => setOpenMenu(null)}
              />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="w-full min-w-0 bg-white p-3 sm:p-4 lg:p-6 xl:px-10 xl:py-8 2xl:px-12" onClick={() => setOpenMenu(null)}>
        <Outlet />
      </main>
    </div>
  )
}
