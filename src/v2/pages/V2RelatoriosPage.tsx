import { useState, useEffect, useMemo, useCallback } from 'react'
import { BarChart2, TrendingUp, TrendingDown, DollarSign, Package, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { listPedidosVenda, PedidoVenda } from '../services/v2PedidoVendasService'
import { listPedidosCompra, PedidoCompra } from '../services/v2PedidoCompraService'
import { listMovimentacoesEstoque, MovimentacaoEstoqueV2 } from '../services/v2EstoqueService'
import { listContasPagar, ContaPagar } from '../services/v2ContasPagarService'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData, hoje } from '../../modules/lib/datas'

// ─── Utilitário de exportação XLSX ──────────────────────────────────────────

function exportarParaExcel(
  linhas: Record<string, string | number>[],
  nomeAba: string,
  nomeArquivo: string
) {
  const ws = XLSX.utils.json_to_sheet(linhas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomeAba)
  XLSX.writeFile(wb, nomeArquivo)
}

function exportarParaCSV(
  linhas: Record<string, string | number>[],
  nomeArquivo: string
) {
  if (linhas.length === 0) return
  const cabecalho = Object.keys(linhas[0]).join(';')
  const corpo = linhas
    .map((row) =>
      Object.values(row)
        .map((v) => (typeof v === 'string' && v.includes(';') ? `"${v}"` : v))
        .join(';')
    )
    .join('\n')
  const blob = new Blob(['\uFEFF' + cabecalho + '\n' + corpo], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

type Periodo = 'mes_atual' | 'ultimos_30' | 'ultimos_90' | 'este_ano'
type Aba = 'fluxo' | 'vendas' | 'compras' | 'estoque'

interface MesFluxo {
  label: string
  entradas: number
  saidas: number
  ano: number
  mes: number
}

interface SaldoProduto {
  produto_id: string
  produto_nome: string
  fisico: number
  reservado: number
  disponivel: number
  custo_medio: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function parseDateISO(str: string | null | undefined): Date | null {
  if (!str) return null
  const clean = str.split('T')[0]
  const parts = clean.split('-')
  if (parts.length < 3) return null
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
}

function getInitialDate(periodo: Periodo): Date {
  const now = new Date()
  switch (periodo) {
    case 'mes_atual': {
      return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    }
    case 'ultimos_30': {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      return d
    }
    case 'ultimos_90': {
      const d = new Date()
      d.setDate(d.getDate() - 90)
      return d
    }
    case 'este_ano': {
      return new Date(Date.UTC(now.getFullYear(), 0, 1))
    }
  }
}

function isInPeriod(dateStr: string | null | undefined, inicio: Date): boolean {
  const d = parseDateISO(dateStr)
  if (!d) return false
  return d >= inicio
}

function calcularSaldosProdutos(movs: MovimentacaoEstoqueV2[]): SaldoProduto[] {
  const map = new Map<string, SaldoProduto>()

  movs.forEach((m) => {
    const key = m.produto_id
    if (!map.has(key)) {
      map.set(key, {
        produto_id: m.produto_id,
        produto_nome: m.produto_nome,
        fisico: 0,
        reservado: 0,
        disponivel: 0,
        custo_medio: 0,
      })
    }
    const item = map.get(key)!
    if (m.tipo === 'entrada' || m.tipo === 'saida' || m.tipo === 'ajuste') {
      item.fisico += m.quantidade
    }
    if (m.tipo === 'reserva') {
      item.reservado += Math.abs(m.quantidade)
    }
    if (m.tipo === 'liberacao') {
      item.reservado = Math.max(0, item.reservado - m.quantidade)
    }
    if (m.tipo === 'entrada' && m.custo_unitario) {
      item.custo_medio = m.custo_unitario
    }
  })

  map.forEach((item) => {
    item.fisico = Math.max(0, item.fisico)
    item.reservado = Math.max(0, item.reservado)
    item.disponivel = Math.max(0, item.fisico - item.reservado)
  })

  return Array.from(map.values()).sort((a, b) => b.fisico - a.fisico)
}

type PedidoCompraComData = PedidoCompra & { dataPedido?: string }

function getDataRefCompra(c: PedidoCompra): string {
  const cc = c as PedidoCompraComData
  return cc.dataEmissao || cc.dataPedido || cc.created_at || ''
}

function calcularUltimos6Meses(
  vendas: PedidoVenda[],
  compras: PedidoCompra[],
  contas: ContaPagar[]
): MesFluxo[] {
  const now = new Date()
  const meses: MesFluxo[] = []

  for (let i = 5; i >= 0; i--) {
    const ano = now.getFullYear()
    const mes = now.getMonth() - i
    const d = new Date(Date.UTC(ano, mes, 1))
    const anoReal = d.getUTCFullYear()
    const mesReal = d.getUTCMonth() + 1

    const prefix = `${anoReal}-${String(mesReal).padStart(2, '0')}`

    const entradasContas = contas
      .filter((c) => c.tipo === 'receber' && (c.vencimento || '').startsWith(prefix))
      .reduce((acc, c) => acc + (c.status === 'paga' ? c.totalPago : c.total), 0)

    const saidasContas = contas
      .filter((c) => (c.tipo === 'pagar' || !c.tipo) && (c.vencimento || '').startsWith(prefix))
      .reduce((acc, c) => acc + (c.status === 'paga' ? c.totalPago : c.total), 0)

    const entradasVenda = vendas
      .filter(
        (v) =>
          (v.status === 'faturado' || v.status === 'entregue') &&
          (v.dataEmissao || '').startsWith(prefix)
      )
      .reduce((acc, v) => acc + v.total, 0)

    const saidasCompra = compras
      .filter(
        (c) =>
          (c.status === 'emitido' || c.status === 'recebido' || c.status === 'recebido_parcial') &&
          getDataRefCompra(c).startsWith(prefix)
      )
      .reduce((acc, c) => acc + c.total, 0)

    meses.push({
      label: `${MESES_NOMES[mesReal - 1]}/${String(anoReal).slice(2)}`,
      entradas: Math.max(entradasContas, entradasVenda),
      saidas: Math.max(saidasContas, saidasCompra),
      ano: anoReal,
      mes: mesReal,
    })
  }

  return meses
}

// ─── Componentes internos ─────────────────────────────────────────────────────

function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    proposta:         { bg: '#EFF6FF', color: '#2563EB', label: 'Proposta' },
    aprovado:         { bg: '#F0FDF4', color: '#16A34A', label: 'Aprovado' },
    faturado:         { bg: '#FFF7ED', color: '#EA580C', label: 'Faturado' },
    entregue:         { bg: '#F0FDF4', color: '#15803D', label: 'Entregue' },
    cancelado:        { bg: '#FEF2F2', color: '#DC2626', label: 'Cancelado' },
    rascunho:         { bg: '#F8FAFC', color: '#64748B', label: 'Rascunho' },
    emitido:          { bg: '#EFF6FF', color: '#3B82F6', label: 'Emitido' },
    recebido_parcial: { bg: '#FEFCE8', color: '#CA8A04', label: 'Rec. Parcial' },
    recebido:         { bg: '#F0FDF4', color: '#16A34A', label: 'Recebido' },
    aberta:           { bg: '#EFF6FF', color: '#2563EB', label: 'Em aberto' },
    vencida:          { bg: '#FEF2F2', color: '#DC2626', label: 'Vencida' },
    paga:             { bg: '#F0FDF4', color: '#16A34A', label: 'Paga' },
    parcial:          { bg: '#FEFCE8', color: '#CA8A04', label: 'Parcial' },
  }
  const cfg = map[status] || { bg: '#F8FAFC', color: '#64748B', label: status }
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}

function TipoMovBadge({ tipo }: { tipo: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    entrada:   { bg: '#F0FDF4', color: '#16A34A', label: '\u25b2 Entrada' },
    saida:     { bg: '#FEF2F2', color: '#DC2626', label: '\u25bc Sa\u00edda' },
    reserva:   { bg: '#FEFCE8', color: '#CA8A04', label: '\u23f8 Reserva' },
    liberacao: { bg: '#EFF6FF', color: '#2563EB', label: '\u21a9 Libera\u00e7\u00e3o' },
    ajuste:    { bg: '#F3E8FF', color: '#7C3AED', label: '\u270e Ajuste' },
  }
  const cfg = map[tipo] || { bg: '#F8FAFC', color: '#64748B', label: tipo }
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Estilo de select ─────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  background: '#fff',
  color: '#334155',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  outline: 'none',
}

// ─── Sub-componente: CardResumo ───────────────────────────────────────────────

function CardResumo({
  icone,
  bg,
  label,
  valor,
  sub,
  corValor,
}: {
  icone: React.ReactNode
  bg: string
  label: string
  valor: string
  sub: string
  corValor: string
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        border: '1px solid #F1F5F9',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icone}
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#94A3B8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: corValor, marginTop: 2 }}>{valor}</div>
        <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function V2RelatoriosPage() {
  const dataHoje = hoje()

  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const isMobile = windowWidth < 640
  const isTablet = windowWidth >= 640 && windowWidth < 1024

  const [periodo, setPeriodo] = useState<Periodo>('mes_atual')
  const [abaAtiva, setAbaAtiva] = useState<Aba>('fluxo')

  const [pedidosVenda, setPedidosVenda] = useState<PedidoVenda[]>([])
  const [pedidosCompra, setPedidosCompra] = useState<PedidoCompra[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoqueV2[]>([])
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [carregando, setCarregando] = useState(true)

  // Filtros de aba Vendas
  const [filtroVendaMes, setFiltroVendaMes] = useState<string>(dataHoje.slice(5, 7))
  const [filtroVendaAno, setFiltroVendaAno] = useState<number>(Number(dataHoje.slice(0, 4)))
  const [filtroVendaStatus, setFiltroVendaStatus] = useState<string>('todos')

  // Filtros de aba Compras
  const [filtroCompraMes, setFiltroCompraMes] = useState<string>(dataHoje.slice(5, 7))
  const [filtroCompraAno, setFiltroCompraAno] = useState<number>(Number(dataHoje.slice(0, 4)))
  const [filtroCompraStatus, setFiltroCompraStatus] = useState<string>('todos')

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      try {
        const [pv, pc, movs, conts] = await Promise.all([
          listPedidosVenda(),
          listPedidosCompra(),
          listMovimentacoesEstoque(),
          listContasPagar(),
        ])
        setPedidosVenda(pv)
        setPedidosCompra(pc)
        setMovimentacoes(movs)
        setContas(conts)
      } catch (e) {
        console.error('Erro ao carregar dados dos relat\u00f3rios:', e)
      } finally {
        setCarregando(false)
      }
    }
    void carregar()
  }, [])

  const dataInicio = useMemo(() => getInitialDate(periodo), [periodo])

  // ── Cards resumo ──────────────────────────────────────────────────────────

  const totalVendido = useMemo(() => {
    return pedidosVenda
      .filter((v) => v.status !== 'cancelado' && isInPeriod(v.dataEmissao, dataInicio))
      .reduce((acc, v) => acc + v.total, 0)
  }, [pedidosVenda, dataInicio])

  const totalComprado = useMemo(() => {
    return pedidosCompra
      .filter((c) => c.status !== 'cancelado' && isInPeriod(getDataRefCompra(c), dataInicio))
      .reduce((acc, c) => acc + c.total, 0)
  }, [pedidosCompra, dataInicio])

  const receitaLiquida = totalVendido - totalComprado

  const estoqueValorizado = useMemo(() => {
    const saldos = calcularSaldosProdutos(movimentacoes)
    return saldos.reduce((acc, s) => acc + s.fisico * s.custo_medio, 0)
  }, [movimentacoes])

  // ── Fluxo de caixa ────────────────────────────────────────────────────────

  const dadosFluxo = useMemo(
    () => calcularUltimos6Meses(pedidosVenda, pedidosCompra, contas),
    [pedidosVenda, pedidosCompra, contas]
  )

  const maxFluxo = useMemo(
    () => Math.max(...dadosFluxo.map((m) => Math.max(m.entradas, m.saidas)), 1),
    [dadosFluxo]
  )

  const contasReceber = useMemo(
    () =>
      contas
        .filter((c) => c.tipo === 'receber' && (c.status === 'aberta' || c.status === 'vencida'))
        .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')),
    [contas]
  )

  const contasPagarAbertas = useMemo(
    () =>
      contas
        .filter(
          (c) => (c.tipo === 'pagar' || !c.tipo) && (c.status === 'aberta' || c.status === 'vencida')
        )
        .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')),
    [contas]
  )

  // ── Vendas filtradas ──────────────────────────────────────────────────────

  const vendasFiltradas = useMemo(() => {
    const prefix = `${filtroVendaAno}-${filtroVendaMes}`
    return pedidosVenda.filter((v) => {
      const matchMes = (v.dataEmissao || '').startsWith(prefix)
      const matchStatus = filtroVendaStatus === 'todos' || v.status === filtroVendaStatus
      return matchMes && matchStatus
    })
  }, [pedidosVenda, filtroVendaMes, filtroVendaAno, filtroVendaStatus])

  const totaisVendaPorStatus = useMemo(() => {
    const map: Record<string, number> = {}
    vendasFiltradas.forEach((v) => {
      map[v.status] = (map[v.status] || 0) + v.total
    })
    return map
  }, [vendasFiltradas])

  // ── Compras filtradas ─────────────────────────────────────────────────────

  const comprasFiltradas = useMemo(() => {
    const prefix = `${filtroCompraAno}-${filtroCompraMes}`
    return pedidosCompra.filter((c) => {
      const matchMes = getDataRefCompra(c).startsWith(prefix)
      const matchStatus = filtroCompraStatus === 'todos' || c.status === filtroCompraStatus
      return matchMes && matchStatus
    })
  }, [pedidosCompra, filtroCompraMes, filtroCompraAno, filtroCompraStatus])

  const totalComprasFiltradas = useMemo(
    () => comprasFiltradas.reduce((acc, c) => acc + c.total, 0),
    [comprasFiltradas]
  )

  // ── Estoque ───────────────────────────────────────────────────────────────

  const saldosProdutos = useMemo(() => calcularSaldosProdutos(movimentacoes), [movimentacoes])
  const ultimas50Movs = useMemo(() => movimentacoes.slice(0, 50), [movimentacoes])

  // ── Anos disponíveis para filtro ──────────────────────────────────────────

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>()
    const anoAtual = Number(dataHoje.slice(0, 4))
    set.add(anoAtual)
    set.add(anoAtual - 1)
    pedidosVenda.forEach((v) => {
      const a = Number((v.dataEmissao || '').slice(0, 4))
      if (a > 2020) set.add(a)
    })
    pedidosCompra.forEach((c) => {
      const a = Number(getDataRefCompra(c).slice(0, 4))
      if (a > 2020) set.add(a)
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [pedidosVenda, pedidosCompra, dataHoje])

  // ─── Estilos comuns ──────────────────────────────────────────────────────

  // ─── Exportações ─────────────────────────────────────────────────────────

  const exportarVendasExcel = useCallback(() => {
    const linhas = vendasFiltradas.map((v) => ({
      'Nº Pedido': v.numero,
      'Data Emissão': v.dataEmissao,
      'Data Vencimento': v.dataVencimento || '',
      'Cliente': v.cliente_nome,
      'Cidade': v.cliente_cidade || '',
      'Forma Pagamento': v.formaPagamento,
      'Qtd Itens': v.itens.length,
      'Frete (R$)': v.frete || 0,
      'Subtotal (R$)': v.subtotal,
      'Total (R$)': v.total,
      'Status': v.status,
      'Canal': v.canal,
    }))
    const mes = `${filtroVendaAno}-${filtroVendaMes}`
    exportarParaExcel(linhas, 'Vendas', `relatorio_vendas_${mes}.xlsx`)
  }, [vendasFiltradas, filtroVendaAno, filtroVendaMes])

  const exportarVendasCSV = useCallback(() => {
    const linhas = vendasFiltradas.map((v) => ({
      'Nº Pedido': v.numero,
      'Data Emissão': v.dataEmissao,
      'Data Vencimento': v.dataVencimento || '',
      'Cliente': v.cliente_nome,
      'Cidade': v.cliente_cidade || '',
      'Forma Pagamento': v.formaPagamento,
      'Qtd Itens': v.itens.length,
      'Frete (R$)': v.frete || 0,
      'Subtotal (R$)': v.subtotal,
      'Total (R$)': v.total,
      'Status': v.status,
      'Canal': v.canal,
    }))
    const mes = `${filtroVendaAno}-${filtroVendaMes}`
    exportarParaCSV(linhas, `relatorio_vendas_${mes}.csv`)
  }, [vendasFiltradas, filtroVendaAno, filtroVendaMes])

  const exportarComprasExcel = useCallback(() => {
    const linhas = comprasFiltradas.map((c) => ({
      'Nº Pedido': c.numero,
      'Data Pedido': getDataRefCompra(c),
      'Data Vencimento': (c as unknown as Record<string, unknown>)['dataVencimento'] as string || '',
      'Fornecedor': c.fornecedor,
      'Forma Pagamento': c.formaPagamento,
      'Qtd Itens': c.itens.length,
      'Frete (R$)': c.frete || 0,
      'Total (R$)': c.total,
      'Status': c.status,
    }))
    const mes = `${filtroCompraAno}-${filtroCompraMes}`
    exportarParaExcel(linhas, 'Compras', `relatorio_compras_${mes}.xlsx`)
  }, [comprasFiltradas, filtroCompraAno, filtroCompraMes])

  const exportarComprasCSV = useCallback(() => {
    const linhas = comprasFiltradas.map((c) => ({
      'Nº Pedido': c.numero,
      'Data Pedido': getDataRefCompra(c),
      'Data Vencimento': (c as unknown as Record<string, unknown>)['dataVencimento'] as string || '',
      'Fornecedor': c.fornecedor,
      'Forma Pagamento': c.formaPagamento,
      'Qtd Itens': c.itens.length,
      'Frete (R$)': c.frete || 0,
      'Total (R$)': c.total,
      'Status': c.status,
    }))
    const mes = `${filtroCompraAno}-${filtroCompraMes}`
    exportarParaCSV(linhas, `relatorio_compras_${mes}.csv`)
  }, [comprasFiltradas, filtroCompraAno, filtroCompraMes])

  const exportarEstoqueExcel = useCallback(() => {
    const linhas = saldosProdutos.map((s) => ({
      'Produto': s.produto_nome,
      'Estoque Físico': s.fisico,
      'Reservado': s.reservado,
      'Disponível': s.disponivel,
      'Custo Médio (R$)': s.custo_medio,
      'Valor Total (R$)': Math.round(s.fisico * s.custo_medio * 100) / 100,
    }))
    exportarParaExcel(linhas, 'Estoque', `relatorio_estoque_${hoje()}.xlsx`)
  }, [saldosProdutos])

  const exportarEstoqueCSV = useCallback(() => {
    const linhas = saldosProdutos.map((s) => ({
      'Produto': s.produto_nome,
      'Estoque Físico': s.fisico,
      'Reservado': s.reservado,
      'Disponível': s.disponivel,
      'Custo Médio (R$)': s.custo_medio,
      'Valor Total (R$)': Math.round(s.fisico * s.custo_medio * 100) / 100,
    }))
    exportarParaCSV(linhas, `relatorio_estoque_${hoje()}.csv`)
  }, [saldosProdutos])

  const s = {
    page: {
      padding: isMobile ? '0 12px 32px' : '0 24px 40px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#334155',
      maxWidth: 1100,
      margin: '0 auto',
    } as React.CSSProperties,
    header: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-start' : 'center',
      gap: 14,
      marginBottom: 20,
      paddingTop: isMobile ? 16 : 28,
    } as React.CSSProperties,
    titulo: {
      fontSize: isMobile ? 20 : 22,
      fontWeight: 700,
      color: '#0F2A43',
      margin: 0,
    } as React.CSSProperties,
    card: {
      background: '#fff',
      borderRadius: 14,
      padding: isMobile ? '14px 16px' : '18px 22px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: '1px solid #F1F5F9',
    } as React.CSSProperties,
    tabelaWrapper: {
      overflowX: 'auto' as const,
      WebkitOverflowScrolling: 'touch' as const,
    },
    tabela: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: 13,
    },
    th: {
      textAlign: 'left' as const,
      padding: '8px 12px',
      borderBottom: '1px solid #E2E8F0',
      fontWeight: 600,
      color: '#475569',
      fontSize: 12,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap' as const,
    },
    td: {
      padding: '9px 12px',
      borderBottom: '1px solid #F1F5F9',
      color: '#334155',
      verticalAlign: 'middle' as const,
    },
    label: {
      fontSize: 11,
      fontWeight: 600,
      color: '#94A3B8',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
    } as React.CSSProperties,
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #0D5BA3 0%, #1E40AF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BarChart2 size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={s.titulo}>Relat\u00f3rios</h1>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            Vis\u00e3o consolidada de vendas, compras e estoque
          </p>
        </div>

        {/* Seletor de período */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              { value: 'mes_atual' as Periodo, label: 'Este m\u00eas' },
              { value: 'ultimos_30' as Periodo, label: '\u00daltimos 30d' },
              { value: 'ultimos_90' as Periodo, label: '\u00daltimos 90d' },
              { value: 'este_ano' as Periodo, label: 'Este ano' },
            ]
          ).map((op) => (
            <button
              key={op.value}
              onClick={() => setPeriodo(op.value)}
              style={{
                padding: '6px 13px',
                borderRadius: 8,
                border: periodo === op.value ? '1.5px solid #0D5BA3' : '1.5px solid #E2E8F0',
                background: periodo === op.value ? '#EFF6FF' : '#fff',
                color: periodo === op.value ? '#0D5BA3' : '#64748B',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards resumo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <CardResumo
          icone={<TrendingUp size={18} color="#16A34A" />}
          bg="#F0FDF4"
          label="Total Vendido"
          valor={formatarMoeda(totalVendido)}
          sub="no período selecionado"
          corValor="#16A34A"
        />
        <CardResumo
          icone={<TrendingDown size={18} color="#DC2626" />}
          bg="#FEF2F2"
          label="Total Comprado"
          valor={formatarMoeda(totalComprado)}
          sub="pedidos emitidos/recebidos"
          corValor="#DC2626"
        />
        <CardResumo
          icone={<DollarSign size={18} color={receitaLiquida >= 0 ? '#0D5BA3' : '#EA580C'} />}
          bg={receitaLiquida >= 0 ? '#EFF6FF' : '#FFF7ED'}
          label="Receita Líquida"
          valor={formatarMoeda(receitaLiquida)}
          sub="vendas − compras"
          corValor={receitaLiquida >= 0 ? '#0D5BA3' : '#EA580C'}
        />
        <CardResumo
          icone={<Package size={18} color="#7C3AED" />}
          bg="#F5F3FF"
          label="Estoque Valorizado"
          valor={formatarMoeda(estoqueValorizado)}
          sub="pelo custo médio"
          corValor="#7C3AED"
        />
      </div>

      {/* Abas */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '2px solid #E2E8F0',
          marginBottom: 20,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {(
          [
            { value: 'fluxo' as Aba, label: 'Fluxo de Caixa' },
            { value: 'vendas' as Aba, label: 'Vendas' },
            { value: 'compras' as Aba, label: 'Compras' },
            { value: 'estoque' as Aba, label: 'Estoque' },
          ]
        ).map((aba) => (
          <button
            key={aba.value}
            onClick={() => setAbaAtiva(aba.value)}
            style={{
              padding: isMobile ? '8px 14px' : '10px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: abaAtiva === aba.value ? 700 : 500,
              color: abaAtiva === aba.value ? '#0D5BA3' : '#64748B',
              borderBottom: abaAtiva === aba.value ? '2px solid #0D5BA3' : '2px solid transparent',
              marginBottom: -2,
              fontSize: isMobile ? 13 : 14,
              whiteSpace: 'nowrap',
            }}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {carregando && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
          Carregando dados…
        </div>
      )}

      {!carregando && (
        <>
          {/* ── Aba: Fluxo de Caixa ── */}
          {abaAtiva === 'fluxo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Gráfico de barras CSS */}
              <div style={s.card}>
                <p style={{ ...s.label, marginBottom: 16 }}>
                  Entradas × Saídas — últimos 6 meses
                </p>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: isMobile ? 12 : 18,
                      height: 180,
                      padding: '0 8px',
                      minWidth: isMobile ? 420 : 'auto',
                    }}
                  >
                  {dadosFluxo.map((m) => {
                    const hEntrada = Math.round((m.entradas / maxFluxo) * 140)
                    const hSaida = Math.round((m.saidas / maxFluxo) * 140)
                    return (
                      <div
                        key={m.label}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            gap: 4,
                            height: 140,
                          }}
                        >
                          {/* Barra Entrada */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: 140 }}>
                            {m.entradas > 0 && (
                              <span style={{ fontSize: 9, color: '#16A34A', fontWeight: 600, whiteSpace: 'nowrap', marginBottom: 2 }}>
                                {(m.entradas / 1000).toFixed(1)}k
                              </span>
                            )}
                            <div
                              title={`Entradas: ${formatarMoeda(m.entradas)}`}
                              style={{
                                width: 22,
                                height: Math.max(hEntrada, 2),
                                background: m.entradas === 0 ? '#D1FAE5' : '#16A34A',
                                borderRadius: '4px 4px 0 0',
                              }}
                            />
                          </div>
                          {/* Barra Saída */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: 140 }}>
                            {m.saidas > 0 && (
                              <span style={{ fontSize: 9, color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap', marginBottom: 2 }}>
                                {(m.saidas / 1000).toFixed(1)}k
                              </span>
                            )}
                            <div
                              title={`Sa\u00eddas: ${formatarMoeda(m.saidas)}`}
                              style={{
                                width: 22,
                                height: Math.max(hSaida, 2),
                                background: m.saidas === 0 ? '#FEE2E2' : '#DC2626',
                                borderRadius: '4px 4px 0 0',
                              }}
                            />
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{m.label}</span>
                      </div>
                    )
                  })}
                </div>
                </div>
                {/* Legenda */}
                <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                    <span style={{ width: 12, height: 12, background: '#16A34A', borderRadius: 3, display: 'inline-block' }} />
                    Entradas
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                    <span style={{ width: 12, height: 12, background: '#DC2626', borderRadius: 3, display: 'inline-block' }} />
                    Sa\u00eddas
                  </span>
                </div>
              </div>

              {/* Contas a receber abertas */}
              <div style={s.card}>
                <p style={{ ...s.label, marginBottom: 12 }}>
                  Contas a receber em aberto ({contasReceber.length})
                </p>
                {contasReceber.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>Nenhuma conta a receber em aberto.</p>
                ) : (
                  <div style={s.tabelaWrapper}>
                    <table style={s.tabela}>
                      <thead>
                        <tr>
                          <th style={s.th}>Vencimento</th>
                          <th style={s.th}>Cliente / Descri\u00e7\u00e3o</th>
                          <th style={s.th}>Status</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contasReceber.map((c) => (
                          <tr key={c.id}>
                            <td style={s.td}>{formatarData(c.vencimento)}</td>
                            <td style={s.td}>
                              <div style={{ fontWeight: 500 }}>{c.fornecedor || '\u2014'}</div>
                              <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.descricao}</div>
                            </td>
                            <td style={s.td}><BadgeStatus status={c.status} /></td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>
                              {formatarMoeda(c.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ ...s.td, fontWeight: 700, color: '#0F2A43', borderTop: '2px solid #E2E8F0' }}>
                            Total a receber
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#16A34A', borderTop: '2px solid #E2E8F0' }}>
                            {formatarMoeda(contasReceber.reduce((a, c) => a + c.total, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Contas a pagar abertas */}
              <div style={s.card}>
                <p style={{ ...s.label, marginBottom: 12 }}>
                  Contas a pagar em aberto ({contasPagarAbertas.length})
                </p>
                {contasPagarAbertas.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>Nenhuma conta a pagar em aberto.</p>
                ) : (
                  <div style={s.tabelaWrapper}>
                    <table style={s.tabela}>
                      <thead>
                        <tr>
                          <th style={s.th}>Vencimento</th>
                          <th style={s.th}>Fornecedor / Descri\u00e7\u00e3o</th>
                          <th style={s.th}>Status</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contasPagarAbertas.map((c) => (
                          <tr key={c.id}>
                            <td style={s.td}>{formatarData(c.vencimento)}</td>
                            <td style={s.td}>
                              <div style={{ fontWeight: 500 }}>{c.fornecedor || '\u2014'}</div>
                              <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.descricao}</div>
                            </td>
                            <td style={s.td}><BadgeStatus status={c.status} /></td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>
                              {formatarMoeda(c.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ ...s.td, fontWeight: 700, color: '#0F2A43', borderTop: '2px solid #E2E8F0' }}>
                            Total a pagar
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#DC2626', borderTop: '2px solid #E2E8F0' }}>
                            {formatarMoeda(contasPagarAbertas.reduce((a, c) => a + c.total, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Aba: Vendas ── */}
          {abaAtiva === 'vendas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={s.label}>M\u00eas</label>
                <select value={filtroVendaMes} onChange={(e) => setFiltroVendaMes(e.target.value)} style={selectStyle}>
                  {MESES_NOMES.map((nome, i) => (
                    <option key={i} value={String(i + 1).padStart(2, '0')}>{nome}</option>
                  ))}
                </select>
                <select value={filtroVendaAno} onChange={(e) => setFiltroVendaAno(Number(e.target.value))} style={selectStyle}>
                  {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <label style={s.label}>Status</label>
                <select value={filtroVendaStatus} onChange={(e) => setFiltroVendaStatus(e.target.value)} style={selectStyle}>
                  <option value="todos">Todos</option>
                  <option value="proposta">Proposta</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="faturado">Faturado</option>
                  <option value="entregue">Entregue</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                {/* Botões de exportação */}
                <div style={{ marginLeft: isMobile ? 0 : 'auto', width: isMobile ? '100%' : 'auto', display: 'flex', gap: 8, marginTop: isMobile ? 8 : 0 }}>
                  <button
                    onClick={exportarVendasExcel}
                    disabled={vendasFiltradas.length === 0}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#0D5BA3', fontSize: 12, fontWeight: 700,
                      cursor: vendasFiltradas.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: vendasFiltradas.length === 0 ? 0.5 : 1,
                    }}
                    title="Exportar para Excel (.xlsx)"
                  >
                    <Download size={13} /> Excel
                  </button>
                  <button
                    onClick={exportarVendasCSV}
                    disabled={vendasFiltradas.length === 0}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#475569', fontSize: 12, fontWeight: 700,
                      cursor: vendasFiltradas.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: vendasFiltradas.length === 0 ? 0.5 : 1,
                    }}
                    title="Exportar para CSV"
                  >
                    <Download size={13} /> CSV
                  </button>
                </div>
              </div>

              <div style={s.card}>
                {vendasFiltradas.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>
                    Nenhum pedido de venda encontrado para o per\u00edodo selecionado.
                  </p>
                ) : (
                  <div style={s.tabelaWrapper}>
                    <table style={s.tabela}>
                      <thead>
                        <tr>
                          <th style={s.th}>N\u00ba Pedido</th>
                          <th style={s.th}>Data</th>
                          <th style={s.th}>Cliente</th>
                          <th style={{ ...s.th, textAlign: 'center' }}>Itens</th>
                          <th style={s.th}>Status</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendasFiltradas.map((v) => (
                          <tr key={v.id}>
                            <td style={{ ...s.td, fontWeight: 600, color: '#0D5BA3', whiteSpace: 'nowrap' }}>
                              {v.numero}
                            </td>
                            <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{formatarData(v.dataEmissao)}</td>
                            <td style={s.td}>
                              <div style={{ fontWeight: 500 }}>{v.cliente_nome}</div>
                              {v.cliente_cidade && (
                                <div style={{ fontSize: 11, color: '#94A3B8' }}>{v.cliente_cidade}</div>
                              )}
                            </td>
                            <td style={{ ...s.td, textAlign: 'center' }}>{v.itens.length}</td>
                            <td style={s.td}><BadgeStatus status={v.status} /></td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{formatarMoeda(v.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: '#0F2A43', borderTop: '2px solid #E2E8F0' }}>
                            Total ({vendasFiltradas.length} pedidos)
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#0D5BA3', borderTop: '2px solid #E2E8F0' }}>
                            {formatarMoeda(vendasFiltradas.reduce((a, v) => a + v.total, 0))}
                          </td>
                        </tr>
                        {Object.entries(totaisVendaPorStatus).map(([st, valor]) => (
                          <tr key={st}>
                            <td colSpan={5} style={{ ...s.td, color: '#64748B', fontSize: 12, paddingTop: 4, paddingBottom: 4 }}>
                              \u2014 <BadgeStatus status={st} />
                            </td>
                            <td style={{ ...s.td, textAlign: 'right', color: '#64748B', fontSize: 12, paddingTop: 4, paddingBottom: 4 }}>
                              {formatarMoeda(valor)}
                            </td>
                          </tr>
                        ))}
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Aba: Compras ── */}
          {abaAtiva === 'compras' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={s.label}>M\u00eas</label>
                <select value={filtroCompraMes} onChange={(e) => setFiltroCompraMes(e.target.value)} style={selectStyle}>
                  {MESES_NOMES.map((nome, i) => (
                    <option key={i} value={String(i + 1).padStart(2, '0')}>{nome}</option>
                  ))}
                </select>
                <select value={filtroCompraAno} onChange={(e) => setFiltroCompraAno(Number(e.target.value))} style={selectStyle}>
                  {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <label style={s.label}>Status</label>
                <select value={filtroCompraStatus} onChange={(e) => setFiltroCompraStatus(e.target.value)} style={selectStyle}>
                  <option value="todos">Todos</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="emitido">Emitido</option>
                  <option value="recebido_parcial">Receb. Parcial</option>
                  <option value="recebido">Recebido</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                {/* Botões de exportação */}
                <div style={{ marginLeft: isMobile ? 0 : 'auto', width: isMobile ? '100%' : 'auto', display: 'flex', gap: 8, marginTop: isMobile ? 8 : 0 }}>
                  <button
                    onClick={exportarComprasExcel}
                    disabled={comprasFiltradas.length === 0}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#0D5BA3', fontSize: 12, fontWeight: 700,
                      cursor: comprasFiltradas.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: comprasFiltradas.length === 0 ? 0.5 : 1,
                    }}
                    title="Exportar para Excel (.xlsx)"
                  >
                    <Download size={13} /> Excel
                  </button>
                  <button
                    onClick={exportarComprasCSV}
                    disabled={comprasFiltradas.length === 0}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                      background: '#FFFFFF', color: '#475569', fontSize: 12, fontWeight: 700,
                      cursor: comprasFiltradas.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: comprasFiltradas.length === 0 ? 0.5 : 1,
                    }}
                    title="Exportar para CSV"
                  >
                    <Download size={13} /> CSV
                  </button>
                </div>
              </div>

              <div style={s.card}>
                {comprasFiltradas.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>
                    Nenhum pedido de compra encontrado para o per\u00edodo selecionado.
                  </p>
                ) : (
                  <div style={s.tabelaWrapper}>
                    <table style={s.tabela}>
                      <thead>
                        <tr>
                          <th style={s.th}>N\u00ba Pedido</th>
                          <th style={s.th}>Data</th>
                          <th style={s.th}>Fornecedor</th>
                          <th style={{ ...s.th, textAlign: 'center' }}>Itens</th>
                          <th style={s.th}>Status</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comprasFiltradas.map((c) => (
                          <tr key={c.id}>
                            <td style={{ ...s.td, fontWeight: 600, color: '#0D5BA3', whiteSpace: 'nowrap' }}>
                              #{c.numero}
                            </td>
                            <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                              {formatarData(getDataRefCompra(c))}
                            </td>
                            <td style={{ ...s.td, fontWeight: 500 }}>{c.fornecedor}</td>
                            <td style={{ ...s.td, textAlign: 'center' }}>{c.itens.length}</td>
                            <td style={s.td}><BadgeStatus status={c.status} /></td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{formatarMoeda(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: '#0F2A43', borderTop: '2px solid #E2E8F0' }}>
                            Total ({comprasFiltradas.length} pedidos)
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#DC2626', borderTop: '2px solid #E2E8F0' }}>
                            {formatarMoeda(totalComprasFiltradas)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Aba: Estoque ── */}
          {abaAtiva === 'estoque' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Saldo por produto */}
              <div style={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <p style={{ ...s.label, margin: 0 }}>
                    Saldo atual por produto ({saldosProdutos.length})
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={exportarEstoqueExcel}
                      disabled={saldosProdutos.length === 0}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                        background: '#FFFFFF', color: '#0D5BA3', fontSize: 12, fontWeight: 700,
                        cursor: saldosProdutos.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: saldosProdutos.length === 0 ? 0.5 : 1,
                      }}
                      title="Exportar saldo de estoque para Excel (.xlsx)"
                    >
                      <Download size={13} /> Excel
                    </button>
                    <button
                      onClick={exportarEstoqueCSV}
                      disabled={saldosProdutos.length === 0}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                        background: '#FFFFFF', color: '#475569', fontSize: 12, fontWeight: 700,
                        cursor: saldosProdutos.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: saldosProdutos.length === 0 ? 0.5 : 1,
                      }}
                      title="Exportar para CSV"
                    >
                      <Download size={13} /> CSV
                    </button>
                  </div>
                </div>
                <div style={s.tabelaWrapper}>
                  <table style={s.tabela}>
                    <thead>
                      <tr>
                        <th style={s.th}>Produto</th>
                        <th style={{ ...s.th, textAlign: 'center' }}>F\u00edsico</th>
                        <th style={{ ...s.th, textAlign: 'center' }}>Reservado</th>
                        <th style={{ ...s.th, textAlign: 'center' }}>Dispon\u00edvel</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Custo M\u00e9dio</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Valor Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saldosProdutos.map((p) => (
                        <tr key={p.produto_id}>
                          <td style={s.td}>
                            <div style={{ fontWeight: 500 }}>{p.produto_nome}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{p.produto_id}</div>
                          </td>
                          <td style={{ ...s.td, textAlign: 'center', fontWeight: 600 }}>{p.fisico}</td>
                          <td style={{ ...s.td, textAlign: 'center', color: '#CA8A04' }}>{p.reservado}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <span
                              style={{
                                fontWeight: 700,
                                color: p.disponivel === 0 ? '#DC2626' : p.disponivel < 2 ? '#CA8A04' : '#16A34A',
                              }}
                            >
                              {p.disponivel}
                            </span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', color: '#64748B' }}>
                            {p.custo_medio > 0 ? formatarMoeda(p.custo_medio) : '\u2014'}
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>
                            {p.custo_medio > 0 ? formatarMoeda(p.fisico * p.custo_medio) : '\u2014'}
                          </td>
                        </tr>
                      ))}
                      {saldosProdutos.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#94A3B8' }}>
                            Nenhum produto com movimenta\u00e7\u00f5es registradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: '#0F2A43', borderTop: '2px solid #E2E8F0' }}>
                          Estoque valorizado total
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#7C3AED', borderTop: '2px solid #E2E8F0' }}>
                          {formatarMoeda(estoqueValorizado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Últimas movimentações */}
              <div style={s.card}>
                <p style={{ ...s.label, marginBottom: 12 }}>
                  \u00daltimas movimenta\u00e7\u00f5es de estoque ({ultimas50Movs.length})
                </p>
                <div style={s.tabelaWrapper}>
                  <table style={s.tabela}>
                    <thead>
                      <tr>
                        <th style={s.th}>Data</th>
                        <th style={s.th}>Produto</th>
                        <th style={s.th}>Tipo</th>
                        <th style={{ ...s.th, textAlign: 'center' }}>Qtd</th>
                        <th style={s.th}>Origem / Motivo</th>
                        <th style={s.th}>Usu\u00e1rio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimas50Movs.map((m) => (
                        <tr key={m.id}>
                          <td style={{ ...s.td, whiteSpace: 'nowrap', color: '#64748B', fontSize: 12 }}>
                            {m.data}
                          </td>
                          <td style={s.td}>
                            <div style={{ fontWeight: 500 }}>{m.produto_nome}</div>
                          </td>
                          <td style={s.td}><TipoMovBadge tipo={m.tipo} /></td>
                          <td
                            style={{
                              ...s.td,
                              textAlign: 'center',
                              fontWeight: 700,
                              color: m.quantidade > 0 ? '#16A34A' : m.quantidade < 0 ? '#DC2626' : '#64748B',
                            }}
                          >
                            {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                          </td>
                          <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>{m.origem}</td>
                          <td style={{ ...s.td, color: '#64748B', fontSize: 12 }}>{m.usuario}</td>
                        </tr>
                      ))}
                      {ultimas50Movs.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#94A3B8' }}>
                            Nenhuma movimenta\u00e7\u00e3o registrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
