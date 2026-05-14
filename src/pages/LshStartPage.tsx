import { useUser } from '@clerk/clerk-react'
import { Building2, CalendarDays, LayoutDashboard, ListTodo } from 'lucide-react'
import { Link } from 'react-router-dom'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'

export function LshStartPage() {
  const { user } = useUser()
  const tasksHomologEnabled = canAccessTasksHomolog(user?.primaryEmailAddress?.emailAddress)

  return (
    <div className="mx-auto max-w-5xl space-y-6 normal-case">
      <header className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-surface)] p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-text)]">Início</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
          Escolha o módulo abaixo. Agenda e tarefas ficam agrupadas no primeiro atalho.
        </p>
      </header>

      <nav className="grid gap-3 sm:grid-cols-3" aria-label="Módulos principais">
        {tasksHomologEnabled ? (
          <Link
            to="/lsh/agenda"
            className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-white p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2"
          >
            <span
              className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
              style={{
                background:
                  'radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 55%)',
              }}
              aria-hidden
            />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[color:var(--color-text)]">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-black/5">
                  <CalendarDays size={20} className="text-sky-600" aria-hidden />
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-black/5">
                  <ListTodo size={20} className="text-emerald-600" aria-hidden />
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Agenda / Tarefas</h2>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  Abre a agenda; use o menu para tarefas quando precisar.
                </p>
              </div>
              <span className="text-xs font-semibold text-[color:var(--color-primary)]">Entrar</span>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-white p-5 text-sm text-[color:var(--color-text-muted)]">
            Agenda e tarefas não estão disponíveis para esta conta.
          </div>
        )}

        <Link
          to="/lsh/resumo"
          className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-surface)] p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2"
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
            style={{
              background:
                'radial-gradient(circle at 80% 0%, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 50%)',
            }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--color-surface-soft)] ring-1 ring-black/5">
              <LayoutDashboard size={20} className="text-[color:var(--color-primary)]" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[color:var(--color-text)]">LSH — Financeiro</h2>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">Resumo, contas, fluxo e cartões.</p>
            </div>
            <span className="text-xs font-semibold text-[color:var(--color-primary)]">Entrar</span>
          </div>
        </Link>

        <Link
          to="/bem-aviv"
          className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-surface)] p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-offset-2"
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
            style={{
              background:
                'radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--color-primary) 8%, transparent), transparent 55%)',
            }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--color-surface-soft)] ring-1 ring-black/5">
              <Building2 size={20} className="text-[color:var(--color-text-muted)]" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[color:var(--color-text)]">{"EKO'7"}</h2>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">Clientes, produtos e pedidos.</p>
            </div>
            <span className="text-xs font-semibold text-[color:var(--color-primary)]">Entrar</span>
          </div>
        </Link>
      </nav>
    </div>
  )
}
