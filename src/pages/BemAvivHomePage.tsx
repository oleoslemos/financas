import { BarChart3, Building2, LayoutGrid, MessageCircleMore, Package, ShoppingCart, Table2, Tags, UserCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

type Card = {
  to: string
  title: string
  desc: string
  icon: typeof UserCircle
  tone: 'sky' | 'slate' | 'emerald' | 'amber' | 'violet' | 'cyan'
}

const toneRing: Record<Card['tone'], string> = {
  sky: 'ring-sky-100 hover:border-sky-200/80 hover:ring-sky-100',
  slate: 'ring-slate-100 hover:border-slate-200 hover:ring-slate-100',
  emerald: 'ring-emerald-100 hover:border-emerald-200/80 hover:ring-emerald-100',
  amber: 'ring-amber-100 hover:border-amber-200/80 hover:ring-amber-100',
  violet: 'ring-violet-100 hover:border-violet-200/80 hover:ring-violet-100',
  cyan: 'ring-cyan-100 hover:border-cyan-200/80 hover:ring-cyan-100',
}

const cardsFluxoAtual: Card[] = [
  { to: '/bem-aviv/clientes', title: 'Clientes', desc: 'Cadastro e gestão de clientes', icon: UserCircle, tone: 'sky' },
  {
    to: '/bem-aviv/follow-up',
    title: 'Follow-up',
    desc: 'Retornos por data e registro de contatos',
    icon: MessageCircleMore,
    tone: 'emerald',
  },
  {
    to: '/bem-aviv/follow-up/produtividade',
    title: 'Produtividade',
    desc: 'Indicadores e prioridades de follow-up',
    icon: BarChart3,
    tone: 'violet',
  },
  { to: '/bem-aviv/pedidos', title: 'Pedidos e orçamentos', desc: 'Documentos comerciais e itens do catálogo', icon: ShoppingCart, tone: 'emerald' },
  {
    to: '/bem-aviv/produtos-catalogo',
    title: 'Produtos (catálogo)',
    desc: 'Cadastro atual com variações e preço por item',
    icon: Package,
    tone: 'slate',
  },
  { to: '/bem-aviv/categorias', title: 'Categorias', desc: 'Classificação de itens', icon: Tags, tone: 'amber' },
  {
    to: '/bem-aviv/tabela-preco-catalogo',
    title: 'Tabela de preço (catálogo)',
    desc: 'Preços vinculados aos produtos do catálogo',
    icon: Table2,
    tone: 'violet',
  },
  {
    to: '/bem-aviv/catalogos-preco',
    title: 'Catálogos em grade',
    desc: 'Matrizes de preço (linha × coluna)',
    icon: LayoutGrid,
    tone: 'cyan',
  },
]

const cardsLegado: Card[] = [
  {
    to: '/bem-aviv/produtos',
    title: 'Produtos (legado)',
    desc: 'Cadastro por linha (plataforma, cabeceiras, bases, acessórios)',
    icon: Package,
    tone: 'slate',
  },
  { to: '/bem-aviv/tabela-preco', title: 'Tabela de preço Gold', desc: 'Estrutura e tabelas legadas', icon: Table2, tone: 'violet' },
]

function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.map(({ to, title, desc, icon: Icon, tone }) => (
        <li key={to}>
          <Link
            to={to}
            className={`flex gap-4 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.04] transition hover:shadow-md ${toneRing[tone]}`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200/80">
              <Icon size={20} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-slate-900">{title}</span>
              <span className="mt-0.5 block text-sm text-slate-500">{desc}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function BemAvivHomePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 normal-case">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/60">
          <Building2 size={26} strokeWidth={1.75} aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bem Aviv</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Visão geral do módulo comercial. Use <strong className="font-medium text-slate-700">Fluxo atual</strong> no dia a dia;{' '}
            <strong className="font-medium text-slate-700">Legado</strong> apenas para manutenção de dados antigos.
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fluxo atual</h2>
        <CardGrid cards={cardsFluxoAtual} />
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legado</h2>
        <p className="text-sm text-slate-500">Mantenha apenas o necessário até migração completa para o catálogo.</p>
        <CardGrid cards={cardsLegado} />
      </section>
    </div>
  )
}
