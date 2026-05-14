import { useUser, UserButton } from '@clerk/clerk-react'
import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  CreditCard,
  FolderKanban,
  KanbanSquare,
  Landmark,
  LayoutGrid,
  ListTodo,
  MessageCircleMore,
  NotebookText,
  Package,
  PieChart,
  ShoppingCart,
  Menu,
  StickyNote,
  Table2,
  Tags,
  UserCircle,
  Users,
  Workflow,
} from 'lucide-react'
import { type ComponentType, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn'
import { getHubBreadcrumb } from '../lib/hubBreadcrumb'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { canAccessProjects } from '../lib/projectsAccess'
import { isBemAvivOnlyUser } from '../lib/userAccess'
import { CompanyProvider, useCompany } from '../context/CompanyContext'

type MenuItem = {
  label: string
  to?: string
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  children?: Array<{ label: string; to: string; icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }> }>
}

type NavLinkEntry = {
  kind: 'link'
  key: string
  label: string
  to: string
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
}

type TreeGroupEntry = {
  kind: 'group'
  key: string
  label: string
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  children: NavLinkEntry[]
}

type SidebarEntry = NavLinkEntry | TreeGroupEntry

type SidebarSystem = 'global' | 'financeiro' | 'bem-aviv' | 'projetos'

type SidebarSection = {
  key: string
  title: string
  system: SidebarSystem
  items: SidebarEntry[]
}

function flattenMenuItems(items: MenuItem[]): NavLinkEntry[] {
  return items.flatMap((item) => {
    const parent = item.to ? [{ kind: 'link' as const, key: item.to, label: item.label, to: item.to, icon: item.icon }] : []
    const children = (item.children ?? []).map((c) => ({ kind: 'link' as const, key: c.to, label: c.label, to: c.to, icon: c.icon }))
    return [...parent, ...children]
  })
}

const hubBrand = {
  primary: '#185FA5',
}

export function AppLayout() {
  return (
    <CompanyProvider>
      <AppLayoutShell />
    </CompanyProvider>
  )
}

function AppLayoutShell() {
  const { user } = useUser()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openSectionKey, setOpenSectionKey] = useState<string | null>(null)
  const [openTreeGroupKeys, setOpenTreeGroupKeys] = useState<string[]>([])

  const emails = clerkEmailCandidates(user)
  const { companies, activeCompanyId, setActiveCompanyId, loading: companiesLoading } = useCompany()
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
    const sections: SidebarSection[] = []

    if (!bemAvivOnlyUser) {
      sections.push({
        key: 'financeiro',
        title: 'Financeiro',
        system: 'financeiro',
        items: [
          { kind: 'link', key: '/lsh/resumo', label: 'Visão Geral', to: '/lsh/resumo', icon: PieChart },
          ...flattenMenuItems(lshItems),
        ],
      })
    }

    sections.push({
      key: 'comercial',
      title: "EKO'7",
      system: 'bem-aviv',
      items: [
        { kind: 'link', key: '/bem-aviv', label: 'Visão geral', to: '/bem-aviv', icon: LayoutGrid },
        { kind: 'link', key: '/bem-aviv/clientes', label: 'Clientes', to: '/bem-aviv/clientes', icon: UserCircle },
        { kind: 'link', key: '/bem-aviv/follow-up', label: 'Follow-up', to: '/bem-aviv/follow-up', icon: MessageCircleMore },
        { kind: 'link', key: '/bem-aviv/pedidos', label: 'Pedidos e orçamentos', to: '/bem-aviv/pedidos', icon: ShoppingCart },
        { kind: 'link', key: '/bem-aviv/empresas', label: 'Dados da empresa', to: '/bem-aviv/empresas', icon: Building2 },
        {
          kind: 'group',
          key: 'bem-aviv-catalogo',
          label: 'Catálogo',
          icon: LayoutGrid,
          children: [
            { kind: 'link', key: '/bem-aviv/produtos-catalogo', label: 'Produtos', to: '/bem-aviv/produtos-catalogo', icon: Package },
            { kind: 'link', key: '/bem-aviv/categorias', label: 'Categorias', to: '/bem-aviv/categorias', icon: Tags },
            {
              kind: 'link',
              key: '/bem-aviv/tabela-preco-catalogo',
              label: 'Tabela de preço',
              to: '/bem-aviv/tabela-preco-catalogo',
              icon: Table2,
            },
            { kind: 'link', key: '/bem-aviv/catalogos-preco', label: 'Catálogos em grade', to: '/bem-aviv/catalogos-preco', icon: LayoutGrid },
          ],
        },
      ],
    })

    if (projectsEnabled && !bemAvivOnlyUser) {
      sections.push({
        key: 'projetos',
        title: 'Projetos',
        system: 'projetos',
        items: flattenMenuItems(projectItems),
      })
    }

    return sections
  }, [bemAvivOnlyUser, lshItems, projectItems, projectsEnabled, tasksHomologEnabled])

  const currentSystem = useMemo<SidebarSystem>(() => {
    if (location.pathname.startsWith('/lsh')) return 'financeiro'
    if (location.pathname.startsWith('/bem-aviv')) return 'bem-aviv'
    if (location.pathname.startsWith('/projetos')) return 'projetos'
    return 'global'
  }, [location.pathname])

  useEffect(() => {
    // Ao trocar de sistema, recolhe qualquer menu aberto.
    setOpenSectionKey(null)
    setOpenTreeGroupKeys([])
  }, [currentSystem])

  useEffect(() => {
    // Em mobile, fecha o drawer ao navegar.
    setMobileMenuOpen(false)
  }, [location.pathname])

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
    <div className="hub-layout flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-slate-100 font-sans text-slate-900">
      {mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/35 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-[272px] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-full lg:w-auto lg:max-h-none lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-[56px]' : 'lg:w-[220px]',
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
          <button
            type="button"
            className="ml-auto hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:flex"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <ChevronLeft size={16} className={cn('transition-transform', sidebarCollapsed && 'rotate-180')} />
          </button>
          <button
            type="button"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu lateral"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-2 py-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sidebarSections.map((section) => (
            <div key={section.title} className="mb-2">
              {!sidebarCollapsed ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded-md px-2 pb-1 pt-2 text-left text-sidebar-section font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                  onClick={() => {
                    setOpenSectionKey((prev) => (prev === section.key ? null : section.key))
                    if (section.system === 'bem-aviv') {
                      navigate('/bem-aviv')
                    }
                  }}
                  aria-expanded={openSectionKey === section.key}
                  aria-controls={`sidebar-section-${section.key}`}
                >
                  <ChevronDown
                    size={12}
                    className={cn('shrink-0 transition-transform', openSectionKey === section.key ? 'rotate-0' : '-rotate-90')}
                    aria-hidden
                  />
                  <span>{section.title}</span>
                </button>
              ) : null}
              {openSectionKey === section.key ? (
                <ul id={`sidebar-section-${section.key}`} className="space-y-px">
                  {section.items.map((item) => {
                    if (item.kind === 'group') {
                      const isGroupOpen = openTreeGroupKeys.includes(item.key)
                      return (
                        <li key={`${section.title}-${item.key}`}>
                          <button
                            type="button"
                            className="flex w-full appearance-none items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-sidebar-item font-medium normal-case text-slate-600 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-0"
                            onClick={() =>
                              setOpenTreeGroupKeys((prev) =>
                                prev.includes(item.key) ? prev.filter((k) => k !== item.key) : [...prev, item.key],
                              )
                            }
                            aria-expanded={isGroupOpen}
                            aria-controls={`sidebar-group-${item.key}`}
                          >
                            {item.icon ? (
                              <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors [&_svg]:stroke-[2]">
                                <item.icon size={14} aria-hidden />
                              </span>
                            ) : null}
                            <span className="truncate">{item.label}</span>
                            <ChevronDown
                              size={12}
                              className={cn('ml-auto shrink-0 transition-transform', isGroupOpen ? 'rotate-0' : '-rotate-90')}
                              aria-hidden
                            />
                          </button>
                          {isGroupOpen ? (
                            <ul id={`sidebar-group-${item.key}`} className="mt-1 space-y-px pl-6">
                              {item.children.map((child) => (
                                <li key={`${section.title}-${child.key}-${child.label}`}>
                                  <NavLink
                                    to={child.to}
                                    title={sidebarCollapsed ? child.label : undefined}
                                    className={({ isActive }) =>
                                      cn(
                                        'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sidebar-item font-medium normal-case transition-colors',
                                        isActive
                                          ? 'bg-[#E6F1FB] font-semibold text-[#185FA5] [&>.sb-ico]:bg-[#185FA5] [&>.sb-ico]:text-white'
                                          : 'text-slate-600 hover:bg-slate-50',
                                      )
                                    }
                                  >
                                    {child.icon ? (
                                      <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors [&_svg]:stroke-[2]">
                                        <child.icon size={14} aria-hidden />
                                      </span>
                                    ) : null}
                                    {!sidebarCollapsed ? <span className="truncate">{child.label}</span> : null}
                                  </NavLink>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    }

                    return (
                      <li key={`${section.title}-${item.to}-${item.label}`}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/bem-aviv' || item.to === '/projetos'}
                          title={sidebarCollapsed ? item.label : undefined}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sidebar-item font-medium normal-case transition-colors',
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
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </nav>

      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-5">
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu lateral"
          >
            <Menu size={16} />
          </button>
          <p className="min-w-0 truncate text-xs text-slate-500">
            {breadcrumb.segment} / <span className="font-medium text-slate-900">{breadcrumb.current}</span>
          </p>
          {location.pathname.startsWith('/bem-aviv') && companies.length > 1 ? (
            <label className="hidden min-w-0 shrink sm:flex sm:max-w-[220px] sm:items-center sm:gap-2">
              <span className="sr-only">Empresa ativa</span>
              <select
                className="max-w-full truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                value={activeCompanyId ?? ''}
                disabled={companiesLoading}
                onChange={(e) => setActiveCompanyId(e.target.value)}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.trade_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 sm:px-2">
              <div
                className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                style={{ backgroundColor: hubBrand.primary }}
              >
                {userInitials}
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="max-w-[170px] truncate text-xs font-medium text-slate-800">
                  {user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Conta'}
                </p>
              </div>
              <div className="shrink-0 [&_.cl-userButtonBox]:scale-90">
                <UserButton afterSignOutUrl="/sign-in" />
              </div>
            </div>
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

        <main className="hub-content min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 normal-case sm:p-4 lg:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
