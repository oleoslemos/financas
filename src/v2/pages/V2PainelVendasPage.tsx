import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Target,
  ArrowUpRight,
  Settings,
  Calendar,
  Users,
  AlertCircle,
  Loader2,
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
import { listPedidosVenda, type PedidoVenda } from '../services/v2PedidoVendasService'
import {
  listRepresentantes,
  listRepresentativeGoals,
  type Representante,
} from '../services/v2SettingsService'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Statuses que representam vendas reais confirmadas na V2
const SOLD_STATUSES = new Set(['aprovado', 'faturado', 'entregue'])

export function V2PainelVendasPage() {
  const supabase = useSupabase()
  const navigate = useNavigate()

  const [periodoModo, setPeriodoModo] = useState<'mes' | 'ano' | 'tudo'>('mes')
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)
  const [selectedRepId, setSelectedRepId] = useState<string>('todos')

  // Representantes e Metas carregadas de Configurações > Metas Mensais
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [goalsMap, setGoalsMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  // Pedidos carregados da nova tabela v2_pedidos_venda
  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  // 1. Carregar Metas do Ano Selecionado (da tabela bem_aviv_representative_goals)
  const loadGoals = useCallback(async () => {
    try {
      // 1.1 Carregar lista de representantes
      const reps = await listRepresentantes()
      setRepresentantes(reps)

      // 1.2 Buscar metas na tabela bem_aviv_representative_goals
      let goalsRows: Array<{ representative_id: string; month: string; sales_goal: number | null }> = []

      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('bem_aviv_representative_goals')
            .select('representative_id, month, sales_goal')
            .gte('month', `${selectedYear}-01-01`)
            .lte('month', `${selectedYear}-12-01`)

          if (!error && data) {
            goalsRows = data as any[]
          }
        } catch (err) {
          console.warn('Erro ao consultar bem_aviv_representative_goals no Supabase:', err)
        }
      }

      // Fallback local se estiver offline ou sem retorno
      if (goalsRows.length === 0 && reps.length > 0) {
        for (const rep of reps) {
          const cached = await listRepresentativeGoals(rep.id, selectedYear)
          goalsRows.push(...cached)
        }
      }

      // 1.3 Mapear mês a mês (1 a 12) somando metas conforme filtro de representante
      const map: Record<string, number> = {}
      for (let m = 1; m <= 12; m++) {
        const monthDate = `${selectedYear}-${String(m).padStart(2, '0')}-01`
        const filtered =
          selectedRepId && selectedRepId !== 'todos'
            ? goalsRows.filter((g) => g.representative_id === selectedRepId && g.month === monthDate)
            : goalsRows.filter((g) => g.month === monthDate)

        const totalMetaMes = filtered.reduce((acc, curr) => acc + (Number(curr.sales_goal) || 0), 0)
        map[String(m)] = totalMetaMes
      }

      setGoalsMap(map)
    } catch (e) {
      console.error('Erro ao carregar metas comerciais:', e)
    }
  }, [supabase, selectedYear, selectedRepId])

  // 2. Carregar Pedidos de Venda da tabela v2_pedidos_venda
  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listPedidosVenda()
      setPedidos(list)
    } catch (e) {
      console.error('Erro ao carregar pedidos de venda v2:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  // Nome do representante selecionado (se filtrado)
  const repSelecionadoNome = useMemo(() => {
    if (selectedRepId === 'todos') return null
    return representantes.find((r) => r.id === selectedRepId)?.name || null
  }, [selectedRepId, representantes])

  // Filtragem de pedidos pelo representante e período
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((p) => {
      // Filtro de representante
      if (repSelecionadoNome && p.vendedor_nome) {
        if (p.vendedor_nome.trim().toUpperCase() !== repSelecionadoNome.trim().toUpperCase()) {
          return false
        }
      }

      // Filtro de data de emissão
      if (!p.dataEmissao) return false
      const ano = Number(p.dataEmissao.slice(0, 4))
      const mes = Number(p.dataEmissao.slice(5, 7))

      if (periodoModo === 'mes') {
        return ano === selectedYear && mes === selectedMonth
      } else if (periodoModo === 'ano') {
        return ano === selectedYear
      }
      return true // 'tudo'
    })
  }, [pedidos, repSelecionadoNome, periodoModo, selectedYear, selectedMonth])

  // Vendas confirmadas no período filtrado
  const pedidosConfirmados = useMemo(() => {
    return pedidosFiltrados.filter((p) => SOLD_STATUSES.has((p.status || '').toLowerCase()))
  }, [pedidosFiltrados])

  // Faturamento e métricas realizadas
  const faturamentoRealizado = useMemo(() => {
    return pedidosConfirmados.reduce((acc, p) => acc + (Number(p.total) || 0), 0)
  }, [pedidosConfirmados])

  const totalPedidos = pedidosConfirmados.length
  const ticketMedio = totalPedidos > 0 ? faturamentoRealizado / totalPedidos : 0

  // Meta calculada para o período selecionado (lendo de Configurações > Metas)
  const metaPeriodo = useMemo(() => {
    if (periodoModo === 'mes') {
      return goalsMap[String(selectedMonth)] ?? 0
    } else {
      return Object.values(goalsMap).reduce((a, b) => a + (b || 0), 0)
    }
  }, [periodoModo, selectedMonth, goalsMap])

  const atingimentoMeta = metaPeriodo > 0 ? (faturamentoRealizado / metaPeriodo) * 100 : 0
  const faltamValor = Math.max(0, metaPeriodo - faturamentoRealizado)

  // Cálculos de Ritmo e Projeções
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
  const estaAbaixoDoRitmo = metaPeriodo > 0 && atingimentoMeta < pacePercentageOfDay * 0.85

  const nomeMesAtivo = MONTH_NAMES[selectedMonth - 1] || 'Mês'

  // Histórico de vendas mês a mês para o ano selecionado
  const evolucaoMeses = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mesNum = i + 1
      const mesPrefix = `${selectedYear}-${String(mesNum).padStart(2, '0')}`

      // Soma dos pedidos confirmados daquele mês
      const vendasMes = pedidos
        .filter((p) => {
          if (!SOLD_STATUSES.has((p.status || '').toLowerCase())) return false
          if (repSelecionadoNome && p.vendedor_nome) {
            if (p.vendedor_nome.trim().toUpperCase() !== repSelecionadoNome.trim().toUpperCase()) return false
          }
          return (p.dataEmissao || '').startsWith(mesPrefix)
        })
        .reduce((sum, p) => sum + (Number(p.total) || 0), 0)

      const metaMes = goalsMap[String(mesNum)] ?? 0

      return {
        mes: MONTH_SHORT[i],
        mesNum,
        vendas: Math.round(vendasMes),
        meta: Math.round(metaMes),
        taxa: metaMes > 0 ? Math.round((vendasMes / metaMes) * 100) : 0,
      }
    })
  }, [selectedYear, pedidos, repSelecionadoNome, goalsMap])

  // Mix de Produtos Mais Vendidos (extraído dos itens dos pedidos confirmados)
  const produtosDestaque = useMemo(() => {
    const map: Record<string, { qtd: number; valor: number }> = {}

    for (const p of pedidosConfirmados) {
      for (const it of p.itens || []) {
        const nome = it.produto_nome || 'Produto sem descrição'
        if (!map[nome]) map[nome] = { qtd: 0, valor: 0 }
        map[nome].qtd += Number(it.quantidade || 1)
        map[nome].valor += Number(it.total ?? Number(it.quantidade || 1) * Number(it.preco_unitario || 0))
      }
    }

    const totalVal = Object.values(map).reduce((a, b) => a + b.valor, 0) || 1
    const lista = Object.entries(map).map(([nome, d]) => ({
      nome,
      qtd: d.qtd,
      valor: d.valor,
      fatia: Math.round((d.valor / totalVal) * 100),
    }))

    lista.sort((a, b) => b.valor - a.valor)
    return lista.slice(0, 5)
  }, [pedidosConfirmados])

  // Formas de Pagamento utilizadas nos pedidos confirmados
  const origensVendas = useMemo(() => {
    const payMap: Record<string, number> = {}
    for (const p of pedidosConfirmados) {
      const m = p.formaPagamento || 'Outros'
      payMap[m] = (payMap[m] ?? 0) + 1
    }
    const totalP = pedidosConfirmados.length || 1
    const paleta = ['#16A34A', '#2563EB', '#9333EA', '#D97706', '#06B6D4', '#EC4899']

    const entries = Object.entries(payMap)
    if (entries.length > 0) {
      return entries.map(([name, count], idx) => ({
        name: name.replace('_', ' '),
        value: Math.round((count / totalP) * 100),
        color: paleta[idx % paleta.length],
      }))
    }

    return []
  }, [pedidosConfirmados])

  // Anos disponíveis para seleção
  const anosDisponiveis = [selectedYear - 1, selectedYear, selectedYear + 1]

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 font-sans">
      {/* ── HEADER DA HISTÓRIA COMERCIAL ───────────────────────────── */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', padding: '10px', borderRadius: 12 }}>
            <TrendingUp size={24} color="#1D4ED8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
                Painel Comercial & Storytelling de Vendas
              </h1>
              {loading && <Loader2 size={16} className="animate-spin text-blue-600" />}
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748B' }}>
              Acompanhamento de vendas reais com base nas metas configuradas mês a mês.
            </p>
          </div>
        </div>

        {/* Controles de Filtros de Período (Botão Configurar Metas removido conforme solicitação) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

      {/* ── BARRA SECUNDÁRIA: SELEÇÃO DE MÊS, ANO, REPRESENTANTE E META ──────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

          {/* Seletor de Representante (se houver representantes cadastrados) */}
          {representantes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Users size={14} />
              </span>
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1.5px solid #CBD5E1',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#334155',
                  background: '#F8FAFC',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="todos">Todos os Representantes (Geral)</option>
                {representantes.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Indicador de meta configurada em Configurações > Metas Mensais */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155' }}>
          <span>
            Meta configurada para{' '}
            <strong>
              {periodoModo === 'mes'
                ? `${MONTH_NAMES[selectedMonth - 1]} / ${selectedYear}`
                : periodoModo === 'ano'
                ? `Ano ${selectedYear}`
                : 'Histórico'}
            </strong>
            : <span style={{ fontWeight: 900, color: metaPeriodo > 0 ? '#16A34A' : '#94A3B8', marginLeft: 4 }}>
                {metaPeriodo > 0 ? fmt(metaPeriodo) : 'Sem meta cadastrada'}
              </span>
          </span>

          <button
            type="button"
            onClick={() => navigate('/v2/configuracoes?tab=metas')}
            title="Ir para Configurações > Metas Mensais"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 6,
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#475569',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Settings size={12} />
            Metas
          </button>
        </div>
      </div>

      {/* ── CARD PRINCIPAL DE META MENSAL / RITMO COMERCIAL ── */}
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
          {metaPeriodo > 0 ? (
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
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 6,
                background: '#F1F5F9',
                border: '1.2px solid #CBD5E1',
                fontSize: 12,
                fontWeight: 800,
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <AlertCircle size={14} /> SEM META CONFIGURADA
            </span>
          )}

          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
            Meta do mês:{' '}
            <strong style={{ color: '#0F172A' }}>
              {metaPeriodo > 0 ? fmt(metaPeriodo) : 'R$ 0,00'}
            </strong>
          </span>
        </div>

        {/* Título de impacto: Mês, faltam R$ e dias restantes */}
        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
          {metaPeriodo === 0 ? (
            `${nomeMesAtivo} ainda não possui meta configurada em Configurações > Metas Mensais.`
          ) : atingimentoMeta >= 100 ? (
            `🎉 ${nomeMesAtivo} atingiu a meta: superada em ${fmt(faturamentoRealizado - metaPeriodo)}!`
          ) : (
            `${nomeMesAtivo} está ${estaAbaixoDoRitmo ? 'bem abaixo' : 'próximo'} da meta: faltam ${fmt(faltamValor)} em ${diasRestantes} dias.`
          )}
        </h2>

        {/* Subtítulo estimulante: Quanto precisa vender por dia vs ritmo atual */}
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>
          {metaPeriodo > 0 ? (
            <>
              Seria preciso vender <strong style={{ color: '#0F172A', fontWeight: 700 }}>{fmt(ritmoNecessarioPorDia)} por dia</strong> daqui até o fim do mês. O ritmo atual é de <strong style={{ color: '#0F172A', fontWeight: 700 }}>{fmt(ritmoAtualPorDia)} por dia</strong>.
            </>
          ) : (
            <>
              Cadastre a meta mensal da equipe em <strong>Configurações &gt; Metas Mensais</strong> para habilitar as projeções diárias e o cálculo de ritmo.
            </>
          )}
        </p>

        {/* Linha com valores de realização e meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
              {fmt(faturamentoRealizado)}
            </span>
            <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
              realizados {metaPeriodo > 0 ? `· ${atingimentoMeta.toFixed(1)}% da meta` : ''}
            </span>
          </div>

          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
            {metaPeriodo > 0 ? `Meta ${fmt(metaPeriodo)}` : 'Sem meta'}
          </span>
        </div>

        {/* Barra de Progresso com Marcador Flutuante "Esperado até hoje" */}
        <div style={{ position: 'relative', paddingTop: 28, marginBottom: 12 }}>
          {metaPeriodo > 0 && (
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
          )}

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
          Acompanhamento das vendas confirmadas em <strong>v2_pedidos_venda</strong> frente à meta cadastrada em <strong>Configurações &gt; Metas Mensais</strong>.
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
              {metaPeriodo > 0 && (
                <span style={{ fontSize: 13, color: '#64748B', fontWeight: 700 }}>
                  · {percentualProjecao.toFixed(0)}% da meta
                </span>
              )}
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
            <ArrowUpRight size={14} /> Total faturado / aprovado
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
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
            {metaPeriodo > 0 ? `${atingimentoMeta.toFixed(1)}%` : '—'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: atingimentoMeta >= 100 ? '#16A34A' : '#D97706', fontWeight: 700 }}>
            {metaPeriodo === 0
              ? 'Defina a meta em configurações'
              : atingimentoMeta >= 100
              ? 'Meta atingida!'
              : `Faltam ${fmt(faltamValor)}`}
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
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Histórico dos 12 meses de {selectedYear} (tabela v2_pedidos_venda)</p>
            </div>
            <button
              onClick={() => navigate('/v2/configuracoes?tab=metas')}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 8,
                background: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Settings size={13} />
              Configurar Metas
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
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2563EB' }} /> Vendas Realizadas (v2)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#E2E8F0' }} /> Meta Mensal
            </span>
          </div>
        </div>

        {/* Origem das Vendas & Formas de Pagamento */}
        <div style={{ background: '#FFFFFF', padding: '22px 24px', borderRadius: 18, border: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Formas de Pagamento</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Distribuição das vendas confirmadas no período selecionado</p>
          </div>

          {origensVendas.length > 0 ? (
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
          ) : (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Nenhum pedido faturado ou aprovado no período selecionado.
            </div>
          )}

          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 10, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            💡 <strong>Dica Comercial:</strong> Acompanhe as formas de pagamento para balancear recebimentos à vista e parcelamentos.
          </div>
        </div>
      </div>

      {/* ── PRODUTOS DE MAIOR IMPACTO NO FATURAMENTO ───────────────── */}
      <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: 18, border: '1.5px solid #E2E8F0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Mix de Produtos mais Vendidos</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Produtos líderes com base nos itens cadastrados na tabela de vendas</p>
          </div>
        </div>

        {produtosDestaque.length > 0 ? (
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
        ) : (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Nenhum item vendido nos pedidos confirmados do período selecionado.
          </div>
        )}
      </div>
    </div>
  )
}
