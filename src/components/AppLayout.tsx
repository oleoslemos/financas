import { useUser, UserButton } from '@clerk/clerk-react'
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  CircleDollarSign,
  CreditCard,
  FolderKanban,
  Home,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  SlidersHorizontal,
  MessageCircleMore,
  NotebookText,
  Package,
  PieChart,
  ShoppingCart,
  PlusCircle,
  StickyNote,
  Table2,
  Tags,
  UserCircle,
  Users,
  Workflow,
} from 'lucide-react'
import { type ComponentType, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../lib/cn'
import { getHubBreadcrumb } from '../lib/hubBreadcrumb'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { canAccessProjects } from '../lib/projectsAccess'
import { isBemAvivOnlyUser, isMultiSystemUser } from '../lib/userAccess'

type MenuItem = {
  label: string
  to?: string
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  children?: Array<{ label: string; to: string; icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }> }>
}

type NavLinkEntry = {
  label: string
  to: string
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
}

function flattenMenuItems(items: MenuItem[]): NavLinkEntry[] {
  return items.flatMap((item) => {
    const parent = item.to ? [{ label: item.label, to: item.to, icon: item.icon }] : []
    const children = (item.children ?? []).map((c) => ({ label: c.label, to: c.to, icon: c.icon }))
    return [...parent, ...children]
  })
}

const hubBrand = {
  primary: '#185FA5',
}

export function AppLayout() {
  const { user } = useUser()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const emails = clerkEmailCandidates(user)
  const bemAvivOnlyUser = isBemAvivOnlyUser(emails)
  const hideAgendaTasks = bemAvivOnlyUser
  const tasksHomologEnabled = !hideAgendaTasks && canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)
  const projectsEnabled = emails.some((email) => canAccessProjects(email))

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

  const sidebarSections = useMemo(() => {
    const sections: Array<{ title: string; items: NavLinkEntry[] }> = []

    const principal: NavLinkEntry[] = [{ label: 'Visão geral', to: '/bem-aviv', icon: LayoutDashboard }]
    if (tasksHomologEnabled) {
      principal.push(
        { label: 'Agenda', to: '/lsh/agenda', icon: CalendarDays },
        { label: 'Tarefas', to: '/lsh/tarefas', icon: ListTodo },
      )
    }
    sections.push({ title: 'Principal', items: principal })

    if (!bemAvivOnlyUser) {
      sections.push({
        title: 'Financeiro',
        items: flattenMenuItems([
          { label: 'Início', to: '/lsh/inicio', icon: Home },
          { label: 'Resumo', to: '/lsh/resumo', icon: PieChart },
          ...lshItems,
        ]),
      })
    }

    sections.push({
      title: 'Comercial',
      items: [
        { label: 'Clientes', to: '/bem-aviv/clientes', icon: UserCircle },
        { label: 'Follow-up', to: '/bem-aviv/follow-up', icon: MessageCircleMore },
        { label: 'Novo pedido', to: '/bem-aviv/pedidos/novo', icon: PlusCircle },
        { label: 'Pedidos e orçamentos', to: '/bem-aviv/pedidos', icon: ShoppingCart },
      ],
    })

    sections.push({
      title: 'Catálogo',
      items: [
        { label: 'Produtos', to: '/bem-aviv/produtos-catalogo', icon: Package },
        { label: 'Categorias', to: '/bem-aviv/categorias', icon: Tags },
        { label: 'Tabela de preço', to: '/bem-aviv/tabela-preco', icon: Table2 },
        { label: 'Catálogos em grade', to: '/bem-aviv/catalogos-preco', icon: LayoutGrid },
      ],
    })

    if (projectsEnabled && !bemAvivOnlyUser) {
      sections.push({
        title: 'Projetos',
        items: flattenMenuItems([{ label: 'Visão geral', to: '/projetos', icon: FolderKanban }, ...projectItems]),
      })
    }

    return sections
  }, [bemAvivOnlyUser, lshItems, projectItems, projectsEnabled, tasksHomologEnabled])

  const multiSystemUser = isMultiSystemUser(emails)

  const breadcrumb = useMemo(() => getHubBreadcrumb(location.pathname), [location.pathname])

  const userInitials = useMemo(() => {
    const fn = user?.firstName?.trim()
    const ln = user?.lastName?.trim()
    if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase()
    const mail = user?.primaryEmailAddress?.emailAddress
    if (mail) return mail.slice(0, 2).toUpperCase()
    return 'BA'
  }, [user?.firstName, user?.lastName, user?.primaryEmailAddress?.emailAddress])

  return (
    <div className="hub-layout flex min-h-screen bg-slate-100 font-sans text-slate-900">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[56px]' : 'w-[220px]',
        )}
        aria-label="Menu lateral"
      >
        <div className="flex min-h-[52px] items-center gap-2 border-b border-slate-200 px-3 py-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: hubBrand.primary }}
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white">
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          {!sidebarCollapsed ? (
            <span className="truncate font-hub text-[13px] font-bold tracking-tight" style={{ color: hubBrand.primary }}>
              Sistema de Gestão
            </span>
          ) : null}
          <button
            type="button"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <ChevronLeft size={16} className={cn('transition-transform', sidebarCollapsed && 'rotate-180')} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-2 py-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sidebarSections.map((section) => (
            <div key={section.title} className="mb-2">
              {!sidebarCollapsed ? (
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{section.title}</div>
              ) : null}
              <ul className="space-y-px">
                {section.items.map((item) => (
                  <li key={`${section.title}-${item.to}-${item.label}`}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/bem-aviv' || item.to === '/projetos'}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors',
                          isActive
                            ? 'bg-[#E6F1FB] font-semibold text-[#185FA5] [&>.sb-ico]:bg-[#185FA5] [&>.sb-ico]:text-white'
                            : 'text-slate-600 hover:bg-slate-50',
                        )
                      }
                    >
                      {item.icon ? (
                        <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors [&_svg]:stroke-[2]">
                          <item.icon size={14} aria-hidden />
                        </span>
                      ) : null}
                      {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {multiSystemUser ? (
          <div className="shrink-0 border-t border-slate-200 px-2 py-1.5">
            <NavLink
              to="/escolher-sistema"
              title={sidebarCollapsed ? 'Trocar sistema' : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-[#E6F1FB] font-semibold text-[#185FA5] [&>.sb-ico]:bg-[#185FA5] [&>.sb-ico]:text-white'
                    : 'text-slate-600 hover:bg-slate-50',
                )
              }
            >
              <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors [&_svg]:stroke-[2]">
                <SlidersHorizontal size={14} aria-hidden />
              </span>
              {!sidebarCollapsed ? <span className="truncate">Trocar sistema</span> : null}
            </NavLink>
          </div>
        ) : null}

        <div className="mt-auto border-t border-slate-200 p-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: hubBrand.primary }}
            >
              {userInitials}
            </div>
            {!sidebarCollapsed ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium text-slate-800">{user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Conta'}</p>
                <p className="truncate text-[10px] text-slate-500">Perfil</p>
              </div>
            ) : null}
            {!sidebarCollapsed ? (
              <div className="shrink-0 [&_.cl-userButtonBox]:scale-90">
                <UserButton afterSignOutUrl="/sign-in" />
              </div>
            ) : (
              <div className="flex justify-center [&_.cl-userButtonBox]:scale-90">
                <UserButton afterSignOutUrl="/sign-in" />
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-5">
          <p className="text-xs text-slate-500">
            {breadcrumb.segment} / <span className="font-medium text-slate-900">{breadcrumb.current}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="relative flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              aria-label="Notificações (em breve)"
              disabled
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M7 1a4 4 0 014 4v2.5l1 2H2l1-2V5a4 4 0 014-4z" />
                <path d="M5.5 11.5a1.5 1.5 0 003 0" />
              </svg>
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
            </button>
          </div>
        </header>

        <main className="hub-content min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4 normal-case lg:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
