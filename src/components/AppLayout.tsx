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
import { Fragment, type ComponentType, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../lib/cn'
import { getHubBreadcrumb } from '../lib/hubBreadcrumb'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { canAccessProjects } from '../lib/projectsAccess'
import { isBemAvivOnlyUser } from '../lib/userAccess'
import { CompanySelectionGate } from './CompanySelectionGate'
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

const SIDEBAR_COLLAPSED_KEY = 'hub-sidebar-collapsed'
const SIDEBAR_WIDTH_EXPANDED = 240

function readSidebarCollapsedPreference() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function sectionKeyForSystem(system: SidebarSystem) {
  if (system === 'financeiro') return 'financeiro'
  if (system === 'bem-aviv') return 'comercial'
  if (system === 'projetos') return 'projetos'
  return null
}

function isCatalogPath(pathname: string) {
  return (
    pathname.startsWith('/bem-aviv/produtos-catalogo') ||
    pathname.startsWith('/bem-aviv/categorias') ||
    pathname.startsWith('/bem-aviv/tabela-preco-catalogo') ||
    pathname.startsWith('/bem-aviv/catalogos-preco')
  )
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openSectionKey, setOpenSectionKey] = useState<string | null>(null)
  const [openTreeGroupKeys, setOpenTreeGroupKeys] = useState<string[]>([])
  const emails = clerkEmailCandidates(user)
  const {
    companies,
    activeCompanyId,
    activeCompany,
    setActiveCompanyId,
    loading: companiesLoading,
    cannotListCompanyMembership,
    needsCompanySelection,
  } = useCompany()
  const hideBemAvivChrome =
    location.pathname.startsWith('/bem-aviv') && needsCompanySelection && !cannotListCompanyMembership
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
        { kind: 'link', key: '/bem-aviv/pedidos', label: 'Pedidos e orçamentos', to: '/bem-aviv/pedidos', icon: ShoppingCart },
        { kind: 'link', key: '/bem-aviv/empresas', label: 'Dados da empresa', to: '/bem-aviv/empresas', icon: Building2 },
        {
          kind: 'group',
          key: 'bem-aviv-catalogo',
          label: 'Catálogo',
          icon: Package,
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
    setOpenSectionKey(sectionKeyForSystem(currentSystem))
    setOpenTreeGroupKeys([])
  }, [currentSystem])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (isCatalogPath(location.pathname)) {
      setOpenTreeGroupKeys((prev) =>
        prev.includes('bem-aviv-catalogo') ? prev : [...prev, 'bem-aviv-catalogo'],
      )
    }
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

  const isBemAviv = currentSystem === 'bem-aviv'

  const sidebarSubtitle = useMemo(() => {
    if (currentSystem === 'bem-aviv') return activeCompany?.trade_name ?? "EKO'7"
    if (currentSystem === 'financeiro') return 'Financeiro'
    if (currentSystem === 'projetos') return 'Projetos'
    return 'Navegação'
  }, [activeCompany?.trade_name, currentSystem])

  function navLinkClass(isActive: boolean, collapsed: boolean) {
    return cn(
      'flex items-center rounded-lg text-sidebar-item font-medium normal-case transition-all duration-150',
      collapsed ? 'mx-1 justify-center px-0 py-2.5' : 'gap-2.5 px-2 py-1.5',
      isActive
        ? collapsed
          ? 'bg-[#E6F1FB] font-semibold text-[#185FA5] shadow-[inset_0_0_0_1px_rgba(24,95,165,0.2)] [&>.sb-ico]:bg-[#185FA5] [&>.sb-ico]:text-white'
          : 'border-l-2 border-[#185FA5] rounded-l-none bg-[#E6F1FB] pl-[6px] font-semibold text-[#185FA5] [&>.sb-ico]:bg-[#185FA5] [&>.sb-ico]:text-white'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    )
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((value) => !value)
  }

  return (
    <div className={cn(
      "hub-layout flex h-dvh max-h-dvh min-h-0 overflow-hidden font-sans text-slate-900 transition-colors",
      isBemAviv ? "bg-[#FAFBFD]" : "bg-slate-100"
    )}>
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
          'hub-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-600 transition-[width,transform] duration-300 ease-in-out lg:static lg:z-auto lg:h-full lg:max-h-none lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-[240px]',
          hideBemAvivChrome && 'hidden',
        )}
        style={{ width: mobileMenuOpen ? SIDEBAR_WIDTH_EXPANDED : undefined }}
        aria-label="Menu lateral"
        aria-expanded={!sidebarCollapsed}
      >
        <div
          className={cn(
            'flex shrink-0 items-center gap-2 border-b py-2',
            sidebarCollapsed ? 'min-h-[72px] flex-col justify-center px-1.5' : 'min-h-[52px] px-3',
            'border-slate-200',
          )}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm"
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
            <div className="min-w-0 flex-1">
              <p className="truncate font-hub text-sm font-semibold normal-case text-slate-900">LSH</p>
              <p className="truncate text-[10px] font-medium normal-case text-slate-500">{sidebarSubtitle}</p>
            </div>
          ) : null}
          <button
            type="button"
            className="hub-sidebar-trigger hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:flex"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <ChevronLeft size={15} className={cn('transition-transform duration-300', sidebarCollapsed && 'rotate-180')} />
          </button>
          <button
            type="button"
            className="hub-sidebar-trigger ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu lateral"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <nav
          className={cn(
            'flex flex-1 flex-col gap-0 overflow-x-hidden overflow-y-auto overscroll-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            sidebarCollapsed ? 'px-1.5' : 'px-2',
          )}
        >
          {sidebarSections.map((section, sectionIndex) => {
            const sectionOpen = openSectionKey === section.key || (sidebarCollapsed && section.system === currentSystem)
            return (
              <div key={section.key} className={cn(sectionIndex > 0 && !sidebarCollapsed && 'mt-1 border-t border-slate-200 pt-1')}>
                {!sidebarCollapsed ? (
                  <button
                    type="button"
                    className="hub-sidebar-trigger flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => setOpenSectionKey((prev) => (prev === section.key ? null : section.key))}
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
                {sectionOpen ? (
                  <ul id={`sidebar-section-${section.key}`} className={cn('space-y-0.5', sidebarCollapsed && 'pt-1')}>
                    {section.items.map((item) => {
                      if (item.kind === 'group') {
                        if (sidebarCollapsed) {
                          return (
                            <Fragment key={`${section.title}-${item.key}`}>
                              {item.children.map((child) => (
                                <li key={`${section.title}-${child.key}-${child.label}`}>
                                  <NavLink
                                    to={child.to}
                                    title={`${item.label} · ${child.label}`}
                                    className={({ isActive }) => navLinkClass(isActive, true)}
                                  >
                                    {child.icon ? (
                                      <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md [&_svg]:stroke-[2]">
                                        <child.icon size={16} aria-hidden />
                                      </span>
                                    ) : null}
                                  </NavLink>
                                </li>
                              ))}
                            </Fragment>
                          )
                        }

                        const isGroupOpen = openTreeGroupKeys.includes(item.key)
                        return (
                          <li key={`${section.title}-${item.key}`}>
                            <button
                              type="button"
                              className={cn(
                                'hub-sidebar-trigger flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sidebar-item font-medium normal-case transition-colors',
                                isGroupOpen
                                  ? 'bg-slate-100 text-slate-800'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                              )}
                              onClick={() =>
                                setOpenTreeGroupKeys((prev) =>
                                  prev.includes(item.key) ? prev.filter((k) => k !== item.key) : [...prev, item.key],
                                )
                              }
                              aria-expanded={isGroupOpen}
                              aria-controls={`sidebar-group-${item.key}`}
                            >
                              {item.icon ? (
                                <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md [&_svg]:stroke-[2]">
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
                              <ul id={`sidebar-group-${item.key}`} className="mt-0.5 space-y-0.5 pl-6">
                                {item.children.map((child) => (
                                  <li key={`${section.title}-${child.key}-${child.label}`}>
                                    <NavLink
                                      to={child.to}
                                      className={({ isActive }) => navLinkClass(isActive, false)}
                                    >
                                      {child.icon ? (
                                        <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md [&_svg]:stroke-[2]">
                                          <child.icon size={14} aria-hidden />
                                        </span>
                                      ) : null}
                                      <span className="truncate">{child.label}</span>
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
                            className={({ isActive }) => navLinkClass(isActive, sidebarCollapsed)}
                          >
                            {item.icon ? (
                              <span className="sb-ico flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md [&_svg]:stroke-[2]">
                                <item.icon size={sidebarCollapsed ? 16 : 14} aria-hidden />
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
            )
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className={cn(
          "flex h-[52px] shrink-0 items-center gap-3 border-b px-4 lg:px-5 transition-colors duration-200",
          isBemAviv ? "border-slate-200/50 bg-white/70 backdrop-blur-md" : "border-slate-200 bg-white"
        )}>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu lateral"
          >
            <Menu size={16} />
          </button>
          {sidebarCollapsed ? (
            <button
              type="button"
              className="hidden h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium normal-case text-slate-700 shadow-sm hover:bg-slate-50 lg:inline-flex"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expandir menu lateral"
            >
              <Menu size={14} />
              Menu
            </button>
          ) : null}
          <p className="min-w-0 truncate text-xs text-slate-500">
            {breadcrumb.segment} / <span className="font-medium text-slate-900">{breadcrumb.current}</span>
          </p>
          {location.pathname.startsWith('/bem-aviv') && companies.length > 1 && !needsCompanySelection ? (
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
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-1.5 py-1 sm:px-2 transition-all duration-200",
              isBemAviv ? "border-slate-200/50 bg-white/50 backdrop-blur-sm" : "border-slate-200 bg-slate-50"
            )}>
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
              className={cn(
                "relative flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-slate-600 transition-colors duration-200",
                isBemAviv 
                  ? "border-slate-200/50 bg-white/50 hover:bg-white/80" 
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              )}
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

        <main className={cn(
          "hub-content min-h-0 flex-1 overflow-y-auto p-3 normal-case sm:p-4 lg:p-5 transition-colors duration-200",
          isBemAviv ? "bg-[#FAFBFD]/60" : "bg-slate-100"
        )}>
          {location.pathname.startsWith('/bem-aviv') && cannotListCompanyMembership ? (
            <div
              className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 shadow-sm"
              role="alert"
            >
              <p className="font-semibold">Nenhuma empresa visível no Supabase (RLS).</p>
              <p className="mt-1 leading-snug">
                O token de sessão do Clerk costuma <strong>não incluir o e-mail</strong> por padrão; as policies comparam o
                e-mail com <code className="rounded bg-amber-100/80 px-1">company_members</code>. Sem e-mail no JWT, a lista
                de vínculos vem vazia e os dados do hub ficam em branco.
              </p>
              <p className="mt-2 leading-snug">
                <strong>Opção 1:</strong> no Clerk → Session token → inclua o claim de e-mail (veja comentário no README,
                secção Clerk + RLS multi-empresa).
              </p>
              <p className="mt-1 leading-snug">
                <strong>Opção 2:</strong> aplique a migration mais recente e, no SQL Editor do Supabase (como admin),
                execute:{' '}
                <code className="break-all rounded bg-amber-100/80 px-1 text-xs">
                  {`UPDATE public.company_members SET clerk_user_id = 'user_SEU_ID_CLERK' WHERE lower(trim(email)) = 'seu@email.com';`}
                </code>
              </p>
            </div>
          ) : null}
          <CompanySelectionGate>
            <Outlet />
          </CompanySelectionGate>
        </main>
      </div>
    </div>
  )
}
