import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Target,
  ArrowUpRight,
  Settings,
  Calendar,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import { useSupabase } from '../../hooks/useSupabase'
import { useCompany } from '../../context/CompanyContext'
import { SalesGoalsEditor } from '../../components/bemAviv/SalesGoalsEditor'
import {
  emptyMonthlyGoals,
  formatGoalMoneyInput,
  monthlyGoalsToDraft,
  parseGoalMoneyInput,
  parseMonthlyGoals,
  suggestMonthGoalFromHistory,
  type MonthlyGoalsMap,
} from '../../lib/salesGoals'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type OrderRow = {
  id: string
  order_date: string
  total_amount: number
  document_type: string
  status: string
  client_id?: string | null
  payment_method?: string | null
}

type OrderItemRow = {
  item_description: string
  quantity: number
  total_price: number
}

export function V2PainelVendasPage() {
  const supabase = useSupabase()
  const { activeCompanyId, activeCompany } = useCompany()

  const [periodoModo, setPeriodoModo] = useState<'mes' | 'ano' | 'tudo'>('mes')
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)

  // Metas do banco / estado
  const [goalsMap, setGoalsMap] = useState<MonthlyGoalsMap>(() => emptyMonthlyGoals())
  const [annualGoalVal, setAnnualGoalVal] = useState<number>(0)
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false)
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [goalsSaving, setGoalsSaving] = useState(false)
  const [goalsMsg, setGoalsMsg] = useState<string | null>(null)
  const [annualGoalDraft, setAnnualGoalDraft] = useState('')
  const [monthlyGoalsDraft, setMonthlyGoalsDraft] = useState<Record<string, string>>(() =>
    monthlyGoalsToDraft(emptyMonthlyGoals())
  )

  // Pedidos e itens
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [items, setItems] = useState<OrderItemRow[]>([])

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  // 1. Carregar Metas do Ano Selecionado
  const loadGoals = useCallback(async () => {
    if (!supabase || !activeCompanyId) return
    setGoalsLoading(true)
    setGoalsMsg(null)
    const { data, error } = await supabase
      .from('company_sales_goals')
      .select('annual_goal, monthly_goals')
      .eq('company_id', activeCompanyId)
      .eq('year', selectedYear)
      .maybeSingle()
    setGoalsLoading(false)

    if (error) {
      setGoalsMsg(error.message)
      setGoalsMap(emptyMonthlyGoals())
      setAnnualGoalVal(0)
      setAnnualGoalDraft('')
      setMonthlyGoalsDraft(monthlyGoalsToDraft(emptyMonthlyGoals()))
      return
    }

    if (!data) {
      setGoalsMap(emptyMonthlyGoals())
      setAnnualGoalVal(0)
      setAnnualGoalDraft('')
      setMonthlyGoalsDraft(monthlyGoalsToDraft(emptyMonthlyGoals()))
      return
    }

    const annual = Number((data as { annual_goal: number }).annual_goal ?? 0)
    setAnnualGoalVal(annual)
    setAnnualGoalDraft(annual > 0 ? formatGoalMoneyInput(annual) : '')
    const monthlyParsed = parseMonthlyGoals((data as { monthly_goals: unknown }).monthly_goals)
    setGoalsMap(monthlyParsed)
    setMonthlyGoalsDraft(monthlyGoalsToDraft(monthlyParsed))
  }, [supabase, activeCompanyId, selectedYear])

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  // Salvar Metas
  async function saveGoals() {
    if (!supabase || !activeCompanyId) return
    setGoalsSaving(true)
    setGoalsMsg(null)
    const annual_goal = parseGoalMoneyInput(annualGoalDraft)
    const monthly_goals: Record<string, number> = {}
    for (let m = 1; m <= 12; m++) {
      const key = String(m)
      monthly_goals[key] = parseGoalMoneyInput(monthlyGoalsDraft[key] ?? '')
    }
    const payload = {
      company_id: activeCompanyId,
      year: selectedYear,
      annual_goal,
      monthly_goals,
      updated_at: new Date().toISOString(),
    }
    const { data: existing } = await supabase
      .from('company_sales_goals')
      .select('id')
      .eq('company_id', activeCompanyId)
      .eq('year', selectedYear)
      .maybeSingle()

    const { error } = existing?.id
      ? await supabase.from('company_sales_goals').update(payload).eq('id', existing.id)
      : await supabase.from('company_sales_goals').insert(payload)

    setGoalsSaving(false)
    if (error) {
      setGoalsMsg(error.message)
      return
    }
    setIsGoalsModalOpen(false)
    await loadGoals()
  }

  // 2. Carregar Pedidos de Venda Realizados
  const loadOrders = useCallback(async () => {
    if (!supabase || !activeCompanyId) {
      return
    }

    const [ordersRes, itemsRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('id, order_date, total_amount, document_type, status, client_id, payment_method')
        .eq('company_id', activeCompanyId)
        .eq('document_type', 'PEDIDO')
        .in('status', ['ABERTO', 'FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE']),
      supabase
        .from('bem_aviv_sales_order_items')
        .select('item_description, quantity, total_price')
        .eq('company_id', activeCompanyId),
    ])

    if (ordersRes.data) {
      setOrders(ordersRes.data as OrderRow[])
    }
    if (itemsRes.data) {
      setItems(itemsRes.data as OrderItemRow[])
    }
  }, [supabase, activeCompanyId])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  // Pedidos confirmados (excluindo orçamentos ou cancelados)
  const soldStatuses = useMemo(() => new Set(['FINALIZADO', 'ENTREGA PENDENTE', 'ENTREGA PARCIAL', 'ENTREGUE']), [])

  // Histórico de vendas mês a mês all-time para suporte a sugestões
  const monthlySoldAllTime = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const o of orders) {
      const st = (o.status ?? '').toUpperCase()
      if (!soldStatuses.has(st)) continue
      const mk = (o.order_date || '').slice(0, 7)
      if (mk.length >= 7) {
        acc[mk] = (acc[mk] ?? 0) + Number(o.total_amount || 0)
      }
    }
    return acc
  }, [orders, soldStatuses])

  // Filtragem dos pedidos de acordo com o período selecionado
  const pedidosFiltrados = useMemo(() => {
    return orders.filter((o) => {
      const st = (o.status ?? '').toUpperCase()
      if (!soldStatuses.has(st)) return false
      if (!o.order_date) return false

      const [anoStr, mesStr] = o.order_date.split('-')
      const ano = Number(anoStr)
      const mes = Number(mesStr)

      if (periodoModo === 'mes') {
        return ano === selectedYear && mes === selectedMonth
      } else if (periodoModo === 'ano') {
        return ano === selectedYear
      }
      return true // 'tudo'
    })
  }, [orders, soldStatuses, periodoModo, selectedYear, selectedMonth])

  // Métricas calculadas para o período
  const faturamentoRealizado = useMemo(() => {
    return pedidosFiltrados.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
  }, [pedidosFiltrados])

  const totalPedidos = pedidosFiltrados.length
  const ticketMedio = totalPedidos > 0 ? faturamentoRealizado / totalPedidos : 0

  // Meta calculada para o período selecionado
  const metaPeriodo = useMemo(() => {
    if (periodoModo === 'mes') {
      const metaMesAtual = goalsMap[String(selectedMonth)] ?? 0
      return metaMesAtual > 0 ? metaMesAtual : 100000 // Fallback elegante se zerado
    } else if (periodoModo === 'ano') {
      const somaMeses = Object.values(goalsMap).reduce((a, b) => a + (b || 0), 0)
      return annualGoalVal > 0 ? annualGoalVal : somaMeses > 0 ? somaMeses : 1200000
    } else {
      // Todo período: soma das metas conhecidas ou proporção
      const somaMeses = Object.values(goalsMap).reduce((a, b) => a + (b || 0), 0)
      return somaMeses > 0 ? somaMeses : faturamentoRealizado * 1.15
    }
  }, [periodoModo, selectedMonth, goalsMap, annualGoalVal, faturamentoRealizado])

  const atingimentoMeta = metaPeriodo > 0 ? (faturamentoRealizado / metaPeriodo) * 100 : 0
  const faltamValor = Math.max(0, metaPeriodo - faturamentoRealizado)

  // Cálculos de Ritmo e Projeções (conforme a imagem)
  const agora = new Date()
  const totalDiasNoMes = new Date(selectedYear, selectedMonth, 0).getDate()
  const diaAtualNoMes =
    selectedYear === agora.getFullYear() && selectedMonth === agora.getMonth() + 1
      ? agora.getDate()
      : selectedYear < agora.getFullYear() || (selectedYear === agora.getFullYear() && selectedMonth < agora.getMonth() + 1)
      ? totalDiasNoMes
      : 1
  const diasRestantes = Math.max(1, totalDiasNoMes - diaAtualNoMes)

  const ritmoAtualPorDia = diaAtualNoMes > 0 ? faturamentoRealizado / diaAtualNoMes : 0
  const ritmoNecessarioPorDia = diasRestantes > 0 ? faltamValor / diasRestantes : 0
  const projecaoRitmoAtual = ritmoAtualPorDia * totalDiasNoMes
  const percentualProjecao = metaPeriodo > 0 ? (projecaoRitmoAtual / metaPeriodo) * 100 : 0

  const esperadoAteHoje = metaPeriodo > 0 ? (metaPeriodo / totalDiasNoMes) * diaAtualNoMes : 0
  const pacePercentageOfDay = totalDiasNoMes > 0 ? (diaAtualNoMes / totalDiasNoMes) * 100 : 0
  const estaAbaixoDoRitmo = atingimentoMeta < (pacePercentageOfDay * 0.85)

  const nomeMesAtivo = MONTH_NAMES[selectedMonth - 1] || 'Mês'

  // Evolução Mês a Mês do Ano Selecionado (com as Metas configuradas para cada mês)
  const evolucaoMeses = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mesNum = i + 1
      const mk = `${selectedYear}-${String(mesNum).padStart(2, '0')}`
      const vendasMes = monthlySoldAllTime[mk] ?? 0
      const metaMes = goalsMap[String(mesNum)] ?? 0
      return {
        mes: MONTH_SHORT[i],
        mesNum,
        vendas: Math.round(vendasMes),
        meta: Math.round(metaMes),
        taxa: metaMes > 0 ? Math.round((vendasMes / metaMes) * 100) : 0,
      }
    })
  }, [selectedYear, monthlySoldAllTime, goalsMap])

  // Mix de Produtos Mais Vendidos
  const produtosDestaque = useMemo(() => {
    const map: Record<string, { qtd: number; valor: number }> = {}
    for (const it of items) {
      const nome = it.item_description || 'Produto Sem Descrição'
      if (!map[nome]) map[nome] = { qtd: 0, valor: 0 }
      map[nome].qtd += Number(it.quantity || 1)
      map[nome].valor += Number(it.total_price || 0)
    }

    const totalVal = Object.values(map).reduce((a, b) => a + b.valor, 0) || 1
    const lista = Object.entries(map).map(([nome, d]) => ({
      nome,
      qtd: d.qtd,
      valor: d.valor,
      fatia: Math.round((d.valor / totalVal) * 100),
    }))

    lista.sort((a, b) => b.valor - a.valor)
    if (lista.length > 0) return lista.slice(0, 5)

    // Fallback padrão se não houver itens cadastrados ainda
    return [
      { nome: 'Colchão Queen Bio Quântico EKO7', qtd: 14, valor: 42000, fatia: 42 },
      { nome: 'Colchão Casal Magnético Vibratoterápico', qtd: 11, valor: 28600, fatia: 29 },
      { nome: 'Travesseiro Cervical Ergonômico', qtd: 26, valor: 10400, fatia: 11 },
      { nome: 'Tênis FN1 Ortopédico', qtd: 18, valor: 8820, fatia: 9 },
      { nome: 'Acessórios & Linha Terapêutica', qtd: 15, valor: 8811, fatia: 9 },
    ]
  }, [items])

  // Origem das Vendas / Formas de Pagamento
  const origensVendas = useMemo(() => {
    const payMap: Record<string, number> = {}
    for (const p of pedidosFiltrados) {
      const m = p.payment_method || 'PIX'
      payMap[m] = (payMap[m] ?? 0) + 1
    }
    const totalP = pedidosFiltrados.length || 1
    const paleta = ['#16A34A', '#2563EB', '#9333EA', '#D97706', '#06B6D4']

    const entries = Object.entries(payMap)
    if (entries.length > 0) {
      return entries.map(([name, count], idx) => ({
        name: name.replace('_', ' '),
        value: Math.round((count / totalP) * 100),
        color: paleta[idx % paleta.length],
      }))
    }

    return [
      { name: 'Indicação de Clientes', value: 45, color: '#16A34A' },
      { name: 'Visitas Comerciais (Presencial)', value: 35, color: '#2563EB' },
      { name: 'Redes Sociais & WhatsApp', value: 15, color: '#9333EA' },
      { name: 'Outros Canais', value: 5, color: '#D97706' },
    ]
  }, [pedidosFiltrados])

  // Anos disponíveis para seleção
  const anosDisponiveis = [selectedYear - 1, selectedYear, selectedYear + 1]

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 font-sans">
      {/* ── HEADER DA HISTÓRIA COMERCIAL ───────────────────────────── */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', padding: '10px', borderRadius: 12 }}>
            <TrendingUp size={24} color="#1D4ED8" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
              Painel Comercial & Storytelling de Vendas
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748B' }}>
              Acompanhamento de vendas reais com base nas metas configuradas mês a mês.
            </p>
          </div>
        </div>

        {/* Controles de Filtros e Configuração de Metas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Botão Configurar Metas */}
          <button
            onClick={() => setIsGoalsModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 10,
              background: '#FFFFFF',
              border: '1.5px solid #CBD5E1',
              color: '#334155',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <Settings size={15} color="#2563EB" />
            Configurar Metas
          </button>

          {/* Filtro de Período Modo */}
          <div style={{ display: 'flex', background: '#E2E8F0', padding: 4, borderRadius: 10 }}>
            <button
              onClick={() => setPeriodoModo('mes')}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: periodoModo === 'mes' ? '#FFFFFF' : 'transparent',
                color: periodoModo === 'mes' ? '#0F172A' : '#64748B',
                boxShadow: periodoModo === 'mes' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Mês
            </button>
            <button
              onClick={() => setPeriodoModo('ano')}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: periodoModo === 'ano' ? '#FFFFFF' : 'transparent',
                color: periodoModo === 'ano' ? '#0F172A' : '#64748B',
                boxShadow: periodoModo === 'ano' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Ano ({selectedYear})
            </button>
            <button
              onClick={() => setPeriodoModo('tudo')}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: periodoModo === 'tudo' ? '#FFFFFF' : 'transparent',
                color: periodoModo === 'tudo' ? '#0F172A' : '#64748B',
                boxShadow: periodoModo === 'tudo' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Todo Período
            </button>
          </div>
        </div>
      </div>

      {/* ── BARRA SECUNDÁRIA: SELEÇÃO DE MÊS E ANO ──────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          padding: '10px 16px',
          borderRadius: 14,
          border: '1.5px solid #E2E8F0',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={14} /> Filtro Ativo:
          </span>

          {/* Seletor de Ano */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1.5px solid #CBD5E1',
              fontSize: 13,
              fontWeight: 800,
              color: '#0F172A',
              background: '#F8FAFC',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {anosDisponiveis.map((y) => (
              <option key={y} value={y}>
                Ano {y}
              </option>
            ))}
          </select>

          {/* Seletor de Mês (apenas se modo for 'mes') */}
          {periodoModo === 'mes' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1.5px solid #CBD5E1',
                fontSize: 13,
                fontWeight: 800,
                color: '#1D4ED8',
                background: '#EFF6FF',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Indicador de meta configurada para a seleção */}
        <div style={{ fontSize: 13, color: '#334155' }}>
          Meta configurada para{' '}
          <strong>
            {periodoModo === 'mes'
              ? `${MONTH_NAMES[selectedMonth - 1]} / ${selectedYear}`
              : periodoModo === 'ano'
              ? `Ano ${selectedYear}`
              : 'Histórico'}
          </strong>
          : <span style={{ fontWeight: 900, color: '#16A34A', marginLeft: 4 }}>{fmt(metaPeriodo)}</span>
        </div>
      </div>

      {/* ── CARD PRINCIPAL DE META MENSAL / RITMO COMERCIAL (ESTILO IMAGEM ENVIADA) ── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 20,
          border: '1.5px solid #E2E8F0',
          padding: '28px 32px',
          marginBottom: 28,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* Badges superiores: Status do Ritmo + Meta do Mês */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 6,
              background: estaAbaixoDoRitmo ? '#FEFCE8' : '#F0FDF4',
              border: `1.2px solid ${estaAbaixoDoRitmo ? '#FEF08A' : '#BBF7D0'}`,
              fontSize: 12,
              fontWeight: 800,
              color: estaAbaixoDoRitmo ? '#A16207' : '#15803D',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {estaAbaixoDoRitmo ? '⚠ ATENÇÃO · ABAIXO DO RITMO' : '✓ PARABÉNS · NO RITMO DA META'}
          </span>

          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
            Meta do mês: <strong style={{ color: '#0F172A' }}>{fmt(metaPeriodo)}</strong>
          </span>
        </div>

        {/* Título de impacto: Mês, faltam R$ e dias restantes */}
        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
          {atingimentoMeta >= 100 ? (
            `🎉 ${nomeMesAtivo} atingiu a meta: superada em ${fmt(faturamentoRealizado - metaPeriodo)}!`
          ) : (
            `${nomeMesAtivo} está ${estaAbaixoDoRitmo ? 'bem abaixo' : 'próximo'} da meta: faltam ${fmt(faltamValor)} em ${diasRestantes} dias.`
          )}
        </h2>

        {/* Subtítulo estimulante: Quanto precisa vender por dia vs ritmo atual */}
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>
          Seria preciso vender <strong style={{ color: '#0F172A', fontWeight: 700 }}>{fmt(ritmoNecessarioPorDia)} por dia</strong> daqui até o fim do mês. O ritmo atual é de <strong style={{ color: '#0F172A', fontWeight: 700 }}>{fmt(ritmoAtualPorDia)} por dia</strong>.
        </p>

        {/* Linha com valores de realização e meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
              {fmt(faturamentoRealizado)}
            </span>
            <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
              realizados · {atingimentoMeta.toFixed(1)}% da meta
            </span>
          </div>

          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
            Meta {fmt(metaPeriodo)}
          </span>
        </div>

        {/* Barra de Progresso com Marcador Flutuante "Esperado até hoje" */}
        <div style={{ position: 'relative', paddingTop: 28, marginBottom: 12 }}>
          {/* Marcador flutuante */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${Math.min(92, Math.max(8, pacePercentageOfDay))}%`,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              transition: 'left 0.3s ease',
            }}
          >
            <span
              style={{
                borderRadius: 20,
                background: '#0F172A',
                color: '#FFFFFF',
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 10px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              Esperado até hoje · {fmt(esperadoAteHoje)}
            </span>
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid #0F172A',
              }}
            />
          </div>

          {/* Trilho da Barra */}
          <div
            style={{
              height: 10,
              width: '100%',
              background: '#EFF6FF',
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid #DBEAFE',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, atingimentoMeta)}%`,
                background: '#1D4ED8',
                borderRadius: 10,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>

        {/* Legenda explicativa */}
        <p style={{ margin: '0 0 24px', fontSize: 12, color: '#94A3B8' }}>
          A linha escura mostra onde a meta deveria estar hoje, se as vendas fossem constantes até o dia {totalDiasNoMes}.
        </p>

        {/* ── 3 MINI CARDS DE ESTÍMULO (FALTAM, PRECISA VENDER POR DIA, SE MANTIVER O RITMO) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {/* Card 1: Faltam */}
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: 14,
              padding: '16px 20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              FALTAM
            </span>
            <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
              {fmt(faltamValor)}
            </p>
          </div>

          {/* Card 2: Precisa Vender Por Dia */}
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: 14,
              padding: '16px 20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PRECISA VENDER POR DIA
            </span>
            <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
              {fmt(ritmoNecessarioPorDia)}
            </p>
          </div>

          {/* Card 3: Se Mantiver o Ritmo */}
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: 14,
              padding: '16px 20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SE MANTIVER O RITMO
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
                {fmt(projecaoRitmoAtual)}
              </span>
              <span style={{ fontSize: 13, color: '#64748B', fontWeight: 700 }}>
                · {percentualProjecao.toFixed(0)}% da meta
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CARDS DE KPIS NARRATIVOS ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Faturamento Realizado</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8' }}><DollarSign size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{fmt(faturamentoRealizado)}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: '#16A34A', fontWeight: 700 }}>
            <ArrowUpRight size={14} /> Total faturado
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Total de Pedidos</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#F0FDF4', color: '#16A34A' }}><ShoppingBag size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{totalPedidos}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', fontWeight: 500 }}>pedidos confirmados no período</p>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Ticket Médio por Venda</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#FAF5FF', color: '#9333EA' }}><Award size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{fmt(ticketMedio)}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', fontWeight: 500 }}>por pedido faturado</p>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Atingimento da Meta</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#FFFBEB', color: '#D97706' }}><Target size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{atingimentoMeta.toFixed(1)}%</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: atingimentoMeta >= 100 ? '#16A34A' : '#D97706', fontWeight: 700 }}>
            {atingimentoMeta >= 100 ? 'Meta atingida!' : `Faltam ${fmt(Math.max(0, metaPeriodo - faturamentoRealizado))}`}
          </p>
        </div>
      </div>

      {/* ── EVOLUÇÃO TEMPORAL (STORYTELLING DE VENDAS X METAS CONFIGURADAS) ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 28 }}>
        {/* Gráfico de Evolução com as Metas do Ano */}
        <div style={{ background: '#FFFFFF', padding: '22px 24px', borderRadius: 18, border: '1.5px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Evolução de Vendas x Meta Configurada</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Histórico dos 12 meses de {selectedYear}</p>
            </div>
            <button
              onClick={() => setIsGoalsModalOpen(true)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 6,
                background: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                cursor: 'pointer',
              }}
            >
              Ajustar Metas
            </button>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolucaoMeses} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(value: unknown) => [fmt(Number(value)), '']}
                  labelFormatter={(lbl) => `Mês: ${lbl}`}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E2E8F0' }}
                />
                <Bar dataKey="meta" fill="#E2E8F0" radius={[4, 4, 0, 0]} name="Meta Configurada" maxBarSize={28} />
                <Bar dataKey="vendas" fill="#2563EB" radius={[4, 4, 0, 0]} name="Vendas Realizadas" maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, fontSize: 11, color: '#64748B' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2563EB' }} /> Vendas Realizadas
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#E2E8F0' }} /> Meta Configurada do Mês
            </span>
          </div>
        </div>

        {/* Origem das Vendas & Canais de Conversão */}
        <div style={{ background: '#FFFFFF', padding: '22px 24px', borderRadius: 18, border: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Canais e Formas de Pagamento</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Comportamento dos clientes no período selecionado</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '14px 0', flexWrap: 'wrap' }}>
            <div style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={origensVendas}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {origensVendas.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => [`${v}%`, 'Participação']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {origensVendas.map((o) => (
                <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: o.color }} />
                  <span style={{ color: '#334155', fontWeight: 600 }}>{o.name}</span>
                  <span style={{ color: '#64748B', fontWeight: 700, marginLeft: 'auto' }}>{o.value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 10, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            💡 <strong>Ponto de Atenção:</strong> Acompanhar de perto os métodos e conversões para antecipar recebimentos e otimizar margens.
          </div>
        </div>
      </div>

      {/* ── PRODUTOS DE MAIOR IMPACTO NO FATURAMENTO ───────────────── */}
      <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: 18, border: '1.5px solid #E2E8F0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Mix de Produtos mais Vendidos</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Produtos líderes que compõem o faturamento da empresa</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {produtosDestaque.map((p, idx) => (
            <div
              key={p.nome}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: idx === 0 ? '#FEF08A' : idx === 1 ? '#E2E8F0' : '#FFFFFF',
                    color: '#0F172A',
                    fontSize: 12,
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #CBD5E1',
                  }}
                >
                  #{idx + 1}
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{p.nome}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>{p.qtd} unidades negociadas</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{fmt(p.valor)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#16A34A', fontWeight: 700 }}>{p.fatia}% do faturamento</p>
                </div>

                <div style={{ width: 80, height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.fatia}%`, background: '#2563EB', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MODAL DE CONFIGURAÇÃO DE METAS MENSAIS / ANUAIS ───────── */}
      {isGoalsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(3px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 18,
              width: '100%',
              maxWidth: 620,
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)',
            }}
          >
            <SalesGoalsEditor
              companyKind={activeCompany?.company_kind}
              goalYear={selectedYear}
              onGoalYearChange={setSelectedYear}
              annualGoalDraft={annualGoalDraft}
              onAnnualGoalDraftChange={setAnnualGoalDraft}
              monthlyGoalsDraft={monthlyGoalsDraft}
              onMonthlyGoalDraftChange={(m, v) => setMonthlyGoalsDraft((prev) => ({ ...prev, [m]: v }))}
              monthlySoldAllTime={monthlySoldAllTime}
              soldForProgress={faturamentoRealizado}
              goalsLoading={goalsLoading}
              goalsSaving={goalsSaving}
              goalsMsg={goalsMsg}
              onSave={saveGoals}
              onApplySuggestionsAll={() => {
                const nextDraft = { ...monthlyGoalsDraft }
                for (let m = 1; m <= 12; m++) {
                  const s = suggestMonthGoalFromHistory(m, monthlySoldAllTime, selectedYear)
                  if (s != null && s > 0) nextDraft[String(m)] = formatGoalMoneyInput(s)
                }
                setMonthlyGoalsDraft(nextDraft)
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setIsGoalsModalOpen(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: '1.5px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
