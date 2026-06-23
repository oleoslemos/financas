import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { formatBRL } from '../lib/format'
import {
  TrendingUp,
  DollarSign,
  RefreshCw,
  FileText,
  Truck
} from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis
} from 'recharts'

type DateRangePreset = 'MES_ATUAL' | 'ULTIMOS_30_DIAS' | 'ULTIMOS_90_DIAS' | 'ANO_ATUAL' | 'TODO_PERIODO'

interface OrderRow {
  id: string
  client_id: string | null
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  status: string
  total_amount: number
  payment_option: string | null
  payment_method: string | null
  discount_total: number | null
  freight_amount: number | null
  other_expenses: number | null
}

interface OrderItemRow {
  sales_order_id: string
  item_description: string
  quantity: number
  unit_price: number
  total_price: number
}

interface ClientRow {
  id: string
  full_name: string
  client_status: string | null
  commercial_stage: string | null
  eko7_presentation_at?: string | null
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#64748b']

export function BemAvivRelatoriosPage() {
  const supabase = useSupabase()
  const { activeCompanyId } = useCompany()

  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<DateRangePreset>('MES_ATUAL')
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [items, setItems] = useState<OrderItemRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])

  // Initialize date range based on preset
  const setRangeDates = useCallback((selectedPreset: DateRangePreset) => {
    const now = new Date()
    let start = new Date()
    let end = new Date()

    if (selectedPreset === 'MES_ATUAL') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (selectedPreset === 'ULTIMOS_30_DIAS') {
      start.setDate(now.getDate() - 30)
    } else if (selectedPreset === 'ULTIMOS_90_DIAS') {
      start.setDate(now.getDate() - 90)
    } else if (selectedPreset === 'ANO_ATUAL') {
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear(), 12, 0)
    } else {
      // Todo período
      setStartDateInput('')
      setEndDateInput('')
      return
    }

    const fmt = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    setStartDateInput(fmt(start))
    setEndDateInput(fmt(end))
  }, [])

  useEffect(() => {
    setRangeDates(preset)
  }, [preset, setRangeDates])

  const loadData = useCallback(async () => {
    if (!supabase || !activeCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    try {
      const [ordersRes, itemsRes, clientsRes] = await Promise.all([
        supabase
          .from('bem_aviv_sales_orders')
          .select('id, client_id, order_date, total_amount, document_type, status, payment_option, payment_method, freight_amount, other_expenses, discount_total')
          .eq('company_id', activeCompanyId),
        supabase
          .from('bem_aviv_sales_order_items')
          .select('sales_order_id, item_description, quantity, unit_price, total_price'),
        supabase
          .from('bem_aviv_clients')
          .select('id, full_name, client_status, commercial_stage, eko7_presentation_at')
          .eq('company_id', activeCompanyId)
      ])

      if (ordersRes.error) throw new Error(ordersRes.error.message)
      if (itemsRes.error) throw new Error(itemsRes.error.message)
      if (clientsRes.error) throw new Error(clientsRes.error.message)

      setOrders((ordersRes.data as OrderRow[]) ?? [])
      setItems((itemsRes.data as OrderItemRow[]) ?? [])
      setClients((clientsRes.data as ClientRow[]) ?? [])
    } catch (err: any) {
      alert(err.message || 'Erro ao carregar relatórios.')
    } finally {
      setLoading(false)
    }
  }, [supabase, activeCompanyId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Filter orders based on selected date range
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (startDateInput && o.order_date < startDateInput) return false
      if (endDateInput && o.order_date > endDateInput) return false
      return true
    })
  }, [orders, startDateInput, endDateInput])

  // Filter items matching the filtered orders
  const filteredItems = useMemo(() => {
    const orderIds = new Set(filteredOrders.map(o => o.id))
    return items.filter(it => orderIds.has(it.sales_order_id))
  }, [items, filteredOrders])

  // Map of client name by client ID
  const clientMap = useMemo(() => {
    return new Map(clients.map(c => [c.id, c.full_name]))
  }, [clients])

  // Metrics calculations
  const metrics = useMemo(() => {
    let salesTotal = 0
    let salesCount = 0
    let quotesTotal = 0
    let quotesCount = 0
    let deliveryPendingTotal = 0
    let deliveryPendingCount = 0

    const soldStatuses = new Set(['FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE'])

    for (const o of filteredOrders) {
      const amt = Number(o.total_amount ?? 0)
      const st = (o.status ?? '').toUpperCase()

      if (o.document_type === 'PEDIDO') {
        if (soldStatuses.has(st)) {
          salesTotal += amt
          salesCount++

          if (st === 'ENTREGA PENDENTE' || st === 'ENTREGA PARCIAL') {
            deliveryPendingTotal += amt
            deliveryPendingCount++
          }
        }
      } else if (o.document_type === 'ORCAMENTO') {
        if (st === 'ABERTO') {
          quotesTotal += amt
          quotesCount++
        }
      }
    }

    const avgTicket = salesCount > 0 ? salesTotal / salesCount : 0

    return {
      salesTotal,
      salesCount,
      quotesTotal,
      quotesCount,
      deliveryPendingTotal,
      deliveryPendingCount,
      avgTicket
    }
  }, [filteredOrders])

  // Client Ranking
  const clientRanking = useMemo(() => {
    const soldStatuses = new Set(['FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE'])
    const map = new Map<string, { total: number; count: number }>()

    for (const o of filteredOrders) {
      if (o.document_type === 'PEDIDO' && soldStatuses.has((o.status ?? '').toUpperCase()) && o.client_id) {
        const cur = map.get(o.client_id) ?? { total: 0, count: 0 }
        map.set(o.client_id, {
          total: cur.total + Number(o.total_amount),
          count: cur.count + 1
        })
      }
    }

    return Array.from(map.entries())
      .map(([clientId, info]) => ({
        clientId,
        name: clientMap.get(clientId) ?? 'Cliente não identificado',
        total: info.total,
        count: info.count,
        avg: info.total / info.count
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [filteredOrders, clientMap])

  // Product Ranking
  const productRanking = useMemo(() => {
    // Only count items belonging to confirmed sales orders
    const soldStatuses = new Set(['FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE'])
    const validOrderIds = new Set(
      filteredOrders
        .filter(o => o.document_type === 'PEDIDO' && soldStatuses.has((o.status ?? '').toUpperCase()))
        .map(o => o.id)
    )

    const map = new Map<string, { qty: number; revenue: number }>()

    for (const it of filteredItems) {
      if (validOrderIds.has(it.sales_order_id)) {
        const desc = (it.item_description ?? '').trim().toUpperCase()
        const cur = map.get(desc) ?? { qty: 0, revenue: 0 }
        map.set(desc, {
          qty: cur.qty + it.quantity,
          revenue: cur.revenue + Number(it.total_price)
        })
      }
    }

    return Array.from(map.entries())
      .map(([description, info]) => ({
        description,
        qty: info.qty,
        revenue: info.revenue,
        avgPrice: info.revenue / info.qty
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [filteredOrders, filteredItems])

  // Payment Methods distribution chart data
  const paymentMethodData = useMemo(() => {
    const soldStatuses = new Set(['FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE'])
    const map = new Map<string, number>()

    const labelMap: Record<string, string> = {
      DINHEIRO: 'Dinheiro',
      PIX: 'Pix',
      CARTAO_DEBITO: 'Cartão de Débito',
      CARTAO_CREDITO: 'Cartão de Crédito',
      BOLETO: 'Boleto',
    }

    for (const o of filteredOrders) {
      if (o.document_type === 'PEDIDO' && soldStatuses.has((o.status ?? '').toUpperCase())) {
        const method = (o.payment_method ?? 'OUTRO').toUpperCase()
        const name = labelMap[method] ?? method
        map.set(name, (map.get(name) ?? 0) + Number(o.total_amount))
      }
    }

    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value
    })).sort((a, b) => b.value - a.value)
  }, [filteredOrders])

  // CRM Commercial Stages metrics
  const crmConversion = useMemo(() => {
    const totalClients = clients.length
    if (totalClients === 0) return []

    const stages = ['CONTATO', 'APRESENTAÇÃO', 'EM RELACIONAMENTO', 'FECHAMENTO', 'PÓS-VENDA']
    const counts = stages.map(st => {
      const count = clients.filter(c => (c.commercial_stage ?? 'CONTATO').toUpperCase() === st).length
      return {
        name: st,
        quantidade: count,
        percentual: (count / totalClients) * 100
      }
    })

    return counts
  }, [clients])

  // Eko7 presentations stats
  const eko7Stats = useMemo(() => {
    const total = clients.length
    const apresentados = clients.filter(c => c.eko7_presentation_at).length
    const naoApresentados = total - apresentados
    const pct = total > 0 ? (apresentados / total) * 100 : 0
    return {
      total,
      apresentados,
      naoApresentados,
      pct
    }
  }, [clients])

  return (
    <div className="space-y-6 normal-case pb-10">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">RELATÓRIOS E INTELIGÊNCIA COMERCIAL</h2>
          <p className="text-sm font-medium text-slate-500">Métricas consolidadas de vendas, faturamento e conversão do funil de vendas Eko'7.</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Sincronizar Dados
        </button>
      </div>

      {/* Date filter bar */}
      <div className="flex flex-col flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Período Pré-definido</label>
          <div className="relative">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="MES_ATUAL">Mês Atual</option>
              <option value="ULTIMOS_30_DIAS">Últimos 30 Dias</option>
              <option value="ULTIMOS_90_DIAS">Últimos 90 Dias</option>
              <option value="ANO_ATUAL">Ano Atual ({new Date().getFullYear()})</option>
              <option value="TODO_PERIODO">Todo o Histórico</option>
            </select>
          </div>
        </div>

        <div className="w-full sm:w-auto flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Data Inicial</label>
            <div className="relative">
              <input
                type="date"
                value={startDateInput}
                onChange={(e) => {
                  setStartDateInput(e.target.value)
                  setPreset('TODO_PERIODO') // override preset on manual date change
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Data Final</label>
            <div className="relative">
              <input
                type="date"
                value={endDateInput}
                onChange={(e) => {
                  setEndDateInput(e.target.value)
                  setPreset('TODO_PERIODO') // override preset on manual date change
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white border border-slate-100 rounded-3xl">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Carregando painel de relatórios...</p>
        </div>
      ) : (
        <>
          {/* KPI Dashboard cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            
            {/* KPI 1: Faturamento Confirmado */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendas Confirmadas</span>
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                  <TrendingUp size={18} />
                </span>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                  {formatBRL(metrics.salesTotal)}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">
                  {metrics.salesCount} Pedido(s) concretizado(s) no período
                </p>
              </div>
            </div>

            {/* KPI 2: Ticket Médio */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Médio</span>
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <DollarSign size={18} />
                </span>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                  {formatBRL(metrics.avgTicket)}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">
                  Média de faturamento por pedido
                </p>
              </div>
            </div>

            {/* KPI 3: Orçamentos em Aberto */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Orçamentos em Aberto</span>
                <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                  <FileText size={18} />
                </span>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                  {formatBRL(metrics.quotesTotal)}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">
                  {metrics.quotesCount} Orçamento(s) sob negociação
                </p>
              </div>
            </div>

            {/* KPI 4: Valor Pendente de Entrega */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Logística Pendente</span>
                <span className="rounded-xl bg-pink-50 p-2.5 text-pink-600">
                  <Truck size={18} />
                </span>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                  {formatBRL(metrics.deliveryPendingTotal)}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">
                  {metrics.deliveryPendingCount} Carga(s) em trânsito/fabricação
                </p>
              </div>
            </div>
          </div>

          {/* Charts panel */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            
            {/* Chart 1: Payments Distribution */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex flex-col justify-between min-h-[380px]">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Meios de Pagamento de Pedidos</h3>
                <p className="text-xs font-semibold text-slate-400">Distribuição do faturamento por forma de pagamento no período.</p>
              </div>
              <div className="flex-1 min-h-[240px] flex items-center justify-center">
                {paymentMethodData.length === 0 ? (
                  <p className="text-xs font-medium text-slate-400 uppercase">Nenhuma venda faturada no período.</p>
                ) : (
                  <div className="w-full h-full flex flex-col sm:flex-row items-center justify-center gap-4">
                    <div className="flex-1 w-full h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={paymentMethodData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {paymentMethodData.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatBRL(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1.5 text-xs text-slate-600 w-full sm:w-48 font-medium">
                      {paymentMethodData.map((item, idx) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-md" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                            <span>{item.name}</span>
                          </div>
                          <span className="font-bold text-slate-800 tabular-nums">{formatBRL(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chart 2: CRM Conversion */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex flex-col justify-between min-h-[380px]">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Distribuição Funil de Vendas</h3>
                <p className="text-xs font-semibold text-slate-400">Posicionamento de clientes por etapa comercial activa no CRM.</p>
              </div>
              <div className="flex-1 min-h-[240px] flex items-center justify-center">
                {crmConversion.length === 0 ? (
                  <p className="text-xs font-medium text-slate-400 uppercase">Sem dados de clientes no banco.</p>
                ) : (
                  <div className="w-full h-[220px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={crmConversion} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Tooltip formatter={(value) => [`${value} clientes`]} />
                        <Bar dataKey="quantidade" fill="#10b981" radius={[8, 8, 0, 0]}>
                          {crmConversion.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CRM extra details cards */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
            {/* Eko7 presentation rate card */}
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-3 md:col-span-1">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Apresentação Técnica EKO'7</h4>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500">Apresentação Concluída</span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">{eko7Stats.apresentados} clientes</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500">Sem Apresentação</span>
                <span className="text-sm font-bold text-slate-700 tabular-nums">{eko7Stats.naoApresentados} clientes</span>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Taxa de Penetração</span>
                  <span className="text-emerald-700">{eko7Stats.pct.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full transition-all duration-500" style={{ width: `${eko7Stats.pct}%` }}></div>
                </div>
              </div>
            </div>

            {/* Top 10 clients list */}
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-3 md:col-span-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Maiores Compradores (Top 10)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[400px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-2">Cliente</th>
                      <th className="py-2 text-center w-24">Qtd Pedidos</th>
                      <th className="py-2 text-right w-28">Total Comprado</th>
                      <th className="py-2 text-right w-28">Ticket Médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {clientRanking.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 uppercase">Nenhuma compra faturada no período.</td>
                      </tr>
                    ) : (
                      clientRanking.map((item, idx) => (
                        <tr key={item.clientId} className="text-slate-700 hover:bg-slate-50/50 transition-colors">
                          <td className="py-2.5 font-semibold text-slate-800 flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-black ${
                              idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-200 text-slate-800' : idx === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {idx + 1}
                            </span>
                            {item.name}
                          </td>
                          <td className="py-2.5 text-center font-bold text-slate-700 tabular-nums">{item.count}</td>
                          <td className="py-2.5 text-right font-bold text-emerald-700 tabular-nums">{formatBRL(item.total)}</td>
                          <td className="py-2.5 text-right text-slate-500 tabular-nums">{formatBRL(item.avg)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Top 10 products list */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Produtos Mais Vendidos (Faturamento Acumulado)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-2">Produto</th>
                    <th className="py-2 text-center w-24">Qtd Vendida</th>
                    <th className="py-2 text-right w-32">Preço Médio Praticado</th>
                    <th className="py-2 text-right w-32">Faturamento Bruto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {productRanking.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400 uppercase">Nenhum item faturado no período.</td>
                    </tr>
                  ) : (
                    productRanking.map((item, idx) => (
                      <tr key={item.description} className="text-slate-700 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 font-semibold text-slate-800 leading-normal flex items-start gap-2.5">
                          <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-black shrink-0 mt-0.5 ${
                            idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-200 text-slate-800' : idx === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {idx + 1}
                          </span>
                          {item.description}
                        </td>
                        <td className="py-3 text-center font-bold text-slate-700 tabular-nums">{item.qty}</td>
                        <td className="py-3 text-right text-slate-500 tabular-nums">{formatBRL(item.avgPrice)}</td>
                        <td className="py-3 text-right font-bold text-emerald-700 tabular-nums">{formatBRL(item.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
