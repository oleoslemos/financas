import { CalendarDays, ListTodo } from 'lucide-react'
import { Link } from 'react-router-dom'

const options = [
  {
    to: '/lsh/agenda',
    title: 'Agenda',
    description: 'Visão do dia com compromissos e pendências.',
    icon: CalendarDays,
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100',
  },
  {
    to: '/lsh/tarefas',
    title: 'Tarefas',
    description: 'Cadastro e acompanhamento de execução.',
    icon: ListTodo,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
  },
]

export function LshStartPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 normal-case">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Início LSH</h1>
        <p className="mt-1 text-sm text-slate-600">Escolha a área de trabalho:</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        {options.map(({ to, title, description, icon: Icon, tone }) => (
          <Link
            key={to}
            to={to}
            className={`rounded-xl border p-5 transition ${tone}`}
          >
            <div className="space-y-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/80 ring-1 ring-black/5">
                <Icon size={21} aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                <p className="mt-1 text-sm">{description}</p>
              </div>
              <span className="text-sm font-semibold">Abrir</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}
