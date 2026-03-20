import { UserButton } from '@clerk/clerk-react'
import { NavLink, Outlet } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="border-b border-slate-800 bg-slate-950 p-4 md:w-56 md:border-b-0 md:border-r md:min-h-screen">
        <h1 className="mb-6 text-lg font-semibold tracking-tight text-sky-400">Financeiro LS</h1>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          <NavLink to="/" className={linkClass} end>
            Início
          </NavLink>
          <NavLink to="/contas-bancarias" className={linkClass}>
            Contas bancárias
          </NavLink>
          <NavLink to="/categorias" className={linkClass}>
            Categorias
          </NavLink>
          <NavLink to="/fluxo" className={linkClass}>
            Pagar / Receber
          </NavLink>
          <NavLink to="/cartoes" className={linkClass}>
            Cartões
          </NavLink>
        </nav>
        <div className="mt-8 flex items-center gap-2">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full">
        <Outlet />
      </main>
    </div>
  )
}
