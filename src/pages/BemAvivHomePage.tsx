import { useUser } from '@clerk/clerk-react'
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  MessageCircleMore,
  Package,
  ShoppingCart,
  Table2,
  Tags,
  Target,
  TrendingUp,
  UserCircle,
  UserX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL } from '../lib/format'

type Card = {
  to: string
  title: string
  desc: string
  icon: typeof UserCircle
  tone: 'sky' | 'slate' | 'emerald' | 'amber' | 'violet' | 'cyan'
}

const DISTRIBUTION_GOAL_BRL = 100_000

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

type ClientRow = {
  id: string
  full_name: string
  next_followup_at: string | null
  next_followup_status: string | null
}

function formatShortDateTime(iso: string | null) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(dt)
}

function addDays(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function monthKeyFromOrderDate(orderDate: string) {
  return orderDate.slice(0, 7)
}

function FollowListCard({
  title,
  icon: Icon,
  tone,
  items,
  emptyText,
  max = 12,
}: {
  title: string
  icon: typeof CalendarDays
  tone: 'rose' | 'sky' | 'indigo'
  items: ClientRow[]
  emptyText: string
  max?: number
}) {
  const toneBorder = {
    rose: 'border-rose-200 bg-rose-50/50',
    sky: 'border-sky-200 bg-sky-50/40',
    indigo: 'border-indigo-200 bg-indigo-50/40',
  }
  const toneIcon = {
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  }

  const slice = items.slice(0, max)

  return (
    <section className={`rounded-xl border ${toneBorder[tone]} p-4 shadow-sm`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneIcon[tone]}`}>
          <Icon size={18} aria-hidden />
        </span>
        <h3 className="font-hub text-sm font-semibold text-slate-900">{title}</h3>
        <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600">{items.length}</span>
      </div>
      {slice.length === 0 ? (
        <p className="text-sm text-slate-600">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-slate-200/80 rounded-lg border border-slate-200/60 bg-white">
          {slice.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 font-medium text-slate-900">{c.full_name}</span>
              <span className="text-xs text-slate-500">{formatShortDateTime(c.next_followup_at)}</span>
              <Link
                to="/bem-aviv/follow-up"
                state={{ bemAvivClientFocus: { id: c.id, mode: 'schedule' as const } }}
                className="text-xs font-semibold text-[#185FA5] hover:underline"
              >
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > max ? (
        <p className="mt-2 text-center text-xs text-slate-500">
          Mostrando {max} de {items.length}.{' '}
          <Link className="font-medium text-[#185FA5] hover:underline" to="/bem-aviv/follow-up">
            Ver na página de follow-up
          </Link>
        </p>
      ) : null}
    </section>
  )
}

export function BemAvivHomePage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const followupUserId = ownerUserId ? ownerUserId.toUpperCase() : null

  const [loading, setLoading] = useState(true)
  const [totalSold, setTotalSold] = useState(0)
  const [monthlyTotals, setMonthlyTotals] = useState<Record<string, number>>({})
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientIdsWithFollowupHistory, setClientIdsWithFollowupHistory] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId || !followupUserId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [ordersRes, clientsRes, fuRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('order_date, total_amount, document_type, status')
        .eq('user_id', ownerUserId)
        .eq('document_type', 'PEDIDO')
        .neq('status', 'CANCELADO'),
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, next_followup_at, next_followup_status')
        .eq('user_id', ownerUserId),
      supabase.from('bem_aviv_client_followups').select('client_id').eq('user_id', followupUserId),
    ])

    if (ordersRes.error) console.error(ordersRes.error)
    if (clientsRes.error) console.error(clientsRes.error)
    if (fuRes.error) console.error(fuRes.error)

    const orders = (ordersRes.data ?? []) as Array<{
      order_date: string
      total_amount: number
      document_type: string
      status: string
    }>

    let sum = 0
    const byMonth: Record<string, number> = {}
    for (const o of orders) {
      const amt = Number(o.total_amount ?? 0)
      if (!Number.isFinite(amt)) continue
      sum += amt
      const mk = monthKeyFromOrderDate(o.order_date || '')
      if (!mk || mk.length < 7) continue
      byMonth[mk] = (byMonth[mk] ?? 0) + amt
    }
    setTotalSold(sum)
    setMonthlyTotals(byMonth)

    setClients(((clientsRes.data ?? []) as ClientRow[]) ?? [])

    const ids = new Set<string>()
    for (const row of fuRes.data ?? []) {
      const id = (row as { client_id: string }).client_id
      if (id) ids.add(id)
    }
    setClientIdsWithFollowupHistory(ids)

    setLoading(false)
  }, [ownerUserId, followupUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const followBuckets = useMemo(() => {
    const pending = (c: ClientRow) => (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE'

    const withDate = clients.filter((c) => c.next_followup_at && pending(c))
    const tNow = Date.now()
    const today = new Date()
    const end7 = addDays(today, 7)
    const end30 = addDays(today, 30)

    const overdue = withDate
      .filter((c) => new Date(c.next_followup_at!).getTime() < tNow)
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())

    const next7 = withDate
      .filter((c) => {
        const t = new Date(c.next_followup_at!).getTime()
        return t >= tNow && t <= end7.getTime()
      })
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())

    const day8to30 = withDate
      .filter((c) => {
        const t = new Date(c.next_followup_at!).getTime()
        return t > end7.getTime() && t <= end30.getTime()
      })
      .sort((a, b) => new Date(a.next_followup_at!).getTime() - new Date(b.next_followup_at!).getTime())

    return { overdue, next7, day8to30 }
  }, [clients])

  const clientsSemFollowupRegistrado = useMemo(() => {
    return clients
      .filter((c) => !clientIdsWithFollowupHistory.has(c.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  }, [clients, clientIdsWithFollowupHistory])

  const chartMonths = useMemo(() => {
    const keys = Object.keys(monthlyTotals).sort()
    if (keys.length === 0) {
      const cur = new Date()
      const out: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(cur.getFullYear(), cur.getMonth() - i, 1)
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        out.push(k)
      }
      return out
    }
    const min = keys[0]!
    const max = keys[keys.length - 1]!
    const start = new Date(min + '-01T12:00:00')
    const end = new Date(max + '-01T12:00:00')
    const out: string[] = []
    const d = new Date(start)
    while (d <= end) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() + 1)
    }
    return out.length > 12 ? out.slice(-12) : out
  }, [monthlyTotals])

  const chartMax = useMemo(() => {
    let m = 1
    for (const mo of chartMonths) {
      m = Math.max(m, monthlyTotals[mo] ?? 0)
    }
    return m
  }, [chartMonths, monthlyTotals])

  const progressPct = Math.min(100, DISTRIBUTION_GOAL_BRL > 0 ? (totalSold / DISTRIBUTION_GOAL_BRL) * 100 : 0)

  return (
    <div className="mx-auto max-w-5xl space-y-10 normal-case">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/60">
          <Building2 size={26} strokeWidth={1.75} aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bem Aviv — Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Meta de distribuição, vendas e follow-up. Abaixo, atalhos do <strong className="font-medium text-slate-700">fluxo atual</strong> e{' '}
            <strong className="font-medium text-slate-700">legado</strong>.
          </p>
        </div>
      </header>

      {!supabase || !ownerUserId ? (
        <p className="text-sm text-slate-600">Conectando ao Supabase…</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Carregando indicadores…</p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <Target size={18} className="text-[#185FA5]" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">Meta distribuição</span>
              </div>
              <p className="font-hub mt-2 text-2xl font-bold text-slate-900">{formatBRL(DISTRIBUTION_GOAL_BRL)}</p>
              <p className="mt-1 text-xs text-slate-500">Referência para o período comercial.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <TrendingUp size={18} className="text-emerald-600" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">Total vendido (pedidos)</span>
              </div>
              <p className="font-hub mt-2 text-2xl font-bold text-slate-900">{formatBRL(totalSold)}</p>
              <p className="mt-1 text-xs text-slate-500">Soma dos pedidos não cancelados (valor líquido do documento).</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progresso da meta</span>
                <span className="text-sm font-semibold text-[#185FA5]">{progressPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#185FA5] to-sky-400 transition-[width]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {totalSold >= DISTRIBUTION_GOAL_BRL ? (
                  <span className="font-medium text-emerald-700">Meta atingida.</span>
                ) : (
                  <>
                    Faltam <strong className="font-semibold text-slate-700">{formatBRL(Math.max(0, DISTRIBUTION_GOAL_BRL - totalSold))}</strong> para a
                    meta.
                  </>
                )}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-hub text-sm font-semibold text-slate-900">Resultado mês a mês (pedidos)</h2>
            <p className="mt-0.5 text-xs text-slate-500">Valores por mês conforme data do pedido.</p>
            <div className="mt-4 flex min-h-[180px] items-end gap-1.5 sm:gap-2">
              {chartMonths.map((mk) => {
                const v = monthlyTotals[mk] ?? 0
                const h = chartMax > 0 ? Math.round((v / chartMax) * 100) : 0
                const [y, mo] = mk.split('-')
                const label = `${mo}/${y?.slice(2)}`
                return (
                  <div key={mk} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-medium tabular-nums text-slate-600 sm:text-xs">{formatBRL(v)}</span>
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div
                        className="w-full max-w-[44px] rounded-t-md bg-[#185FA5]/85 transition-[height]"
                        style={{ height: `${Math.max(8, h)}px` }}
                        title={`${mk}: ${formatBRL(v)}`}
                      />
                    </div>
                    <span className="max-w-full truncate text-[9px] text-slate-500 sm:text-[10px]" title={mk}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <FollowListCard
              title="Follow-up atrasados"
              icon={AlertTriangle}
              tone="rose"
              items={followBuckets.overdue}
              emptyText="Nenhum follow-up pendente com data anterior a agora."
            />
            <FollowListCard
              title="Próximos 7 dias"
              icon={CalendarClock}
              tone="sky"
              items={followBuckets.next7}
              emptyText="Nenhum agendamento entre agora e sete dias."
            />
            <FollowListCard
              title="De 8 a 30 dias"
              icon={CalendarDays}
              tone="indigo"
              items={followBuckets.day8to30}
              emptyText="Nenhum agendamento entre o 8º e o 30º dia."
            />
          </section>

          {clientsSemFollowupRegistrado.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <UserX size={18} aria-hidden />
                </span>
                <div>
                  <h2 className="font-hub text-sm font-semibold text-slate-900">Sem registro de follow-up</h2>
                  <p className="text-xs text-slate-600">
                    Clientes sem nenhum contato registrado no histórico (independente de prospecção ou cliente ativo).
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                  {clientsSemFollowupRegistrado.length}
                </span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {clientsSemFollowupRegistrado.slice(0, 24).map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/bem-aviv/follow-up"
                      state={{ bemAvivClientFocus: { id: c.id, mode: 'schedule' as const } }}
                      className="inline-flex items-center rounded-full border border-amber-200/80 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-amber-50"
                    >
                      {c.full_name}
                    </Link>
                  </li>
                ))}
              </ul>
              {clientsSemFollowupRegistrado.length > 24 ? (
                <p className="mt-3 text-center text-xs text-slate-500">
                  +{clientsSemFollowupRegistrado.length - 24} clientes —{' '}
                  <Link className="font-medium text-[#185FA5] hover:underline" to="/bem-aviv/clientes">
                    ver cadastro
                  </Link>
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <section className="space-y-3 border-t border-slate-200 pt-8">
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
