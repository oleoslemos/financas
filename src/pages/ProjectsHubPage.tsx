import { ArrowRight, BriefcaseBusiness, CheckSquare, FolderKanban, Gauge, KanbanSquare, Layers3, Users, Workflow } from 'lucide-react'
import { NavLink } from 'react-router-dom'

type ModuleCard = {
  title: string
  description: string
  to: string
  icon: typeof Gauge
  chip: string
}

const moduleCards: ModuleCard[] = [
  {
    title: 'Visão geral de portfólio',
    description: 'Indicadores, progresso e saúde dos projetos em um único painel de acompanhamento.',
    to: '/projetos',
    icon: Gauge,
    chip: 'Portfolio',
  },
  {
    title: 'Quadro Kanban',
    description: 'Fluxo visual por status para organizar tarefas e atividades da equipe.',
    to: '/projetos/kanban',
    icon: KanbanSquare,
    chip: 'Kanban',
  },
  {
    title: 'Backlog e priorização',
    description: 'Central de demandas para refinamento, priorização e planejamento de entrega.',
    to: '/projetos/backlog',
    icon: FolderKanban,
    chip: 'Planejamento',
  },
  {
    title: 'Projetos / Clientes',
    description: 'Cadastro específico para vincular tarefas sem usar os clientes da Bem Aviv.',
    to: '/projetos/clientes',
    icon: BriefcaseBusiness,
    chip: 'Cadastro',
  },
  {
    title: 'Responsáveis',
    description: 'Cadastro de responsáveis para vincular a execução das tarefas.',
    to: '/projetos/responsaveis',
    icon: Users,
    chip: 'Cadastro',
  },
  {
    title: 'Sprints e execução',
    description: 'Planejamento de ciclos, capacidade da equipe e acompanhamento de execução.',
    to: '/projetos/sprints',
    icon: Workflow,
    chip: 'Agile',
  },
  {
    title: 'Tarefas e atividades',
    description: 'Operação diária com tarefas, responsáveis, prazos e status de entrega.',
    to: '/projetos/atividades',
    icon: CheckSquare,
    chip: 'Operação',
  },
  {
    title: 'Bloco de anotações',
    description: 'Espaço rápido para checklist e post-its de planejamento e execução.',
    to: '/projetos/anotacoes',
    icon: CheckSquare,
    chip: 'Notas',
  },
]

export function ProjectsHubPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-6 text-white shadow-lg">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide">
          <Layers3 size={14} />
          Gestão de projetos
        </p>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Central de Projetos, Tarefas e Atividades</h2>
        <p className="mt-2 max-w-3xl text-sm text-emerald-50/90">
          Estrutura base inspirada nos conceitos de ClickUp, Trello e Jira para evoluirmos um sistema completo de execução, colaboração e controle de entregas.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {moduleCards.map((card) => (
          <NavLink
            key={card.title}
            to={card.to}
            className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <card.icon size={18} />
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">{card.chip}</span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{card.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{card.description}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              Acessar módulo
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </div>
          </NavLink>
        ))}
      </section>
    </div>
  )
}
