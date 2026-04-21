import { useUser, UserButton } from '@clerk/clerk-react'
import { CalendarDays, ChevronDown, CircleDollarSign, CreditCard, LayoutDashboard, Landmark, ListTodo, Package, ShoppingCart, Table2, Tags, UserCircle } from 'lucide-react'
import { type ComponentType, useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'

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

function TreeDropdown({ title, items, open, onToggle, onClose }: { title: string; items: MenuItem[]; open: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="relative" onMouseLeave={onClose}>
      <button type="button" className={`${topTriggerBase} ${open ? 'bg-slate-100 text-slate-900' : ''}`} onMouseEnter={onToggle} onClick={onToggle} aria-expanded={open}>
        {title}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {items.map((item) => (
            <div key={item.label} className="mb-1 last:mb-0">
              {item.to ? (
                <NavLink to={item.to} className={({ isActive }) => `${dropdownItemBase} ${isActive ? 'bg-emerald-100/70 text-emerald-900' : ''}`}>
                  {item.icon ? <item.icon size={16} className="shrink-0 opacity-70" aria-hidden /> : null}
                  {item.label}
                </NavLink>
              ) : (
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
              )}
              {item.children ? (
                <div className="ml-3 border-l border-slate-200 pl-2">
                  {item.children.map((child) => (
                    <NavLink key={child.label} to={child.to} className={({ isActive }) => `${dropdownItemBase} text-[12.5px] ${isActive ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600'}`}>
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
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const emails = clerkEmailCandidates(user)
  const hideAgendaTasks = emails.includes('suelenjalves@gmail.com')
  const tasksHomologEnabled = !hideAgendaTasks && canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)

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
      { label: 'Visão geral', to: '/lsh/resumo', icon: LayoutDashboard },
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

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4 lg:px-6">
          <h1 className="text-sm font-semibold tracking-tight text-emerald-800">Sistema de gestão</h1>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1" aria-label="Navegação principal">
              {tasksHomologEnabled ? (
                <TreeDropdown
                  title="Agenda e Tarefas"
                  items={agendaItems}
                  open={openMenu === 'agenda'}
                  onToggle={() => setOpenMenu((current) => (current === 'agenda' ? null : 'agenda'))}
                  onClose={() => setOpenMenu((current) => (current === 'agenda' ? null : current))}
                />
              ) : null}
              <TreeDropdown
                title="Gestão LSH"
                items={lshItems}
                open={openMenu === 'lsh'}
                onToggle={() => setOpenMenu((current) => (current === 'lsh' ? null : 'lsh'))}
                onClose={() => setOpenMenu((current) => (current === 'lsh' ? null : current))}
              />
              <TreeDropdown
                title="Bem Aviv"
                items={bemAvivItems}
                open={openMenu === 'bem-aviv'}
                onToggle={() => setOpenMenu((current) => (current === 'bem-aviv' ? null : 'bem-aviv'))}
                onClose={() => setOpenMenu((current) => (current === 'bem-aviv' ? null : current))}
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
