import { Building2, Package, ShoppingCart, Table2, Tags, UserCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

const cards = [
  { to: '/bem-aviv/clientes', title: 'Clientes', desc: 'Cadastro e gestão de clientes', icon: UserCircle, tone: 'sky' as const },
  { to: '/bem-aviv/produtos/plataforma-de-descanso', title: 'Produtos', desc: 'Catálogo por linha de produto', icon: Package, tone: 'slate' as const },
  { to: '/bem-aviv/pedidos', title: 'Pedidos de vendas', desc: 'Acompanhar pedidos', icon: ShoppingCart, tone: 'emerald' as const },
  { to: '/bem-aviv/categorias', title: 'Categorias', desc: 'Classificação de itens', icon: Tags, tone: 'amber' as const },
  { to: '/bem-aviv/tabela-preco', title: 'Tabela de preço', desc: 'Preços e regras comerciais', icon: Table2, tone: 'violet' as const },
]

const toneRing: Record<(typeof cards)[number]['tone'], string> = {
  sky: 'ring-sky-100 hover:border-sky-200/80 hover:ring-sky-100',
  slate: 'ring-slate-100 hover:border-slate-200 hover:ring-slate-100',
  emerald: 'ring-emerald-100 hover:border-emerald-200/80 hover:ring-emerald-100',
  amber: 'ring-amber-100 hover:border-amber-200/80 hover:ring-amber-100',
  violet: 'ring-violet-100 hover:border-violet-200/80 hover:ring-violet-100',
}

export function BemAvivHomePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 normal-case">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/60">
          <Building2 size={26} strokeWidth={1.75} aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bem Aviv</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Visão geral do módulo. Escolha uma área abaixo ou use o menu lateral para ir direto a uma tela.
          </p>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Acesso rápido</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map(({ to, title, desc, icon: Icon, tone }) => (
            <li key={to}>
              <Link
                to={to}
                className={`flex gap-4 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.04] transition hover:shadow-md ${toneRing[tone]}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200/80">
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
      </section>
    </div>
  )
}
