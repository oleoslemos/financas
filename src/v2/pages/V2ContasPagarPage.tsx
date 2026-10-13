import { useState, useEffect } from 'react'
import {
  Wallet,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronDown,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  listContasPagar,
  updateContaPagar,
  saveContaPagar,
  ContaPagar,
  StatusConta,
  OrigemConta,
  TipoLancamento,
  ContaPagarParcela,
  BaixaParcelaInfo,
} from '../services/v2ContasPagarService'

const STATUS_CONFIG: Record<StatusConta, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  aberta: { label: 'Aberta', color: '#2563EB', bg: '#EFF6FF', icon: <Clock size={13} /> },
  parcial: { label: 'Parcial', color: '#D97706', bg: '#FFFBEB', icon: <AlertCircle size={13} /> },
  paga: { label: 'Paga', color: '#16A34A', bg: '#F0FDF4', icon: <CheckCircle2 size={13} /> },
  cancelada: { label: 'Cancelada', color: '#6B7280', bg: '#F3F4F6', icon: <XCircle size={13} /> },
  vencida: { label: 'Vencida', color: '#DC2626', bg: '#FEF2F2', icon: <AlertCircle size={13} /> },
}

const ORIGEM_CONFIG: Record<OrigemConta, { label: string; icon: React.ReactNode }> = {
  compra: { label: 'Pedido de Compra', icon: <span style={{ fontSize: 11 }}>🛒</span> },
  venda: { label: 'Venda / Pedido', icon: <span style={{ fontSize: 11 }}>💰</span> },
  avulsa: { label: 'Avulsa / Financeiro', icon: <span style={{ fontSize: 11 }}>📋</span> },
  recorrente: { label: 'Recorrente', icon: <span style={{ fontSize: 11 }}>🔄</span> },
}

function StatusBadge({ status }: { status: StatusConta }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.aberta
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export function V2ContasPagarPage() {
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'pagar' | 'receber'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [contaExpandida, setContaExpandida] = useState<string | null>(null)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [contas, setContas] = useState<ContaPagar[]>([])

  // Modal de Baixa
  const [baixaModal, setBaixaModal] = useState<{
    conta: ContaPagar
    parcela: ContaPagarParcela
  } | null>(null)
  const [baixaData, setBaixaData] = useState(() => new Date().toISOString().split('T')[0])
  const [descontoTipo, setDescontoTipo] = useState<'R$' | '%'>('R$')
  const [descontoValor, setDescontoValor] = useState<number>(0)
  const [acrescimoTipo, setAcrescimoTipo] = useState<'R$' | '%'>('R$')
  const [acrescimoValor, setAcrescimoValor] = useState<number>(0)
  const [baixaFormaPagto, setBaixaFormaPagto] = useState('PIX')
  const [baixaObs, setBaixaObs] = useState('')

  // Modal de Nova Conta
  const [novaContaModal, setNovaContaModal] = useState(false)
  const [novaTipo, setNovaTipo] = useState<TipoLancamento>('pagar')
  const [novaDescricao, setNovaDescricao] = useState('')
  const [novaPessoa, setNovaPessoa] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novaTotal, setNovaTotal] = useState<number>(0)
  const [novaVencimento, setNovaVencimento] = useState(() => new Date().toISOString().split('T')[0])
  const [novaQtdParcelas, setNovaQtdParcelas] = useState<number>(1)

  useEffect(() => {
    async function load() {
      const data = await listContasPagar()
      setContas(data)
    }
    load()
  }, [])

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  // Filtragem
  const contasFiltradas = contas.filter((c) => {
    const matchTipo = tipoFiltro === 'todos' || (c.tipo || 'pagar') === tipoFiltro
    const matchBusca =
      !busca ||
      c.descricao.toLowerCase().includes(busca.toLowerCase()) ||
      (c.fornecedor ?? '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.categoria ?? '').toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchTipo && matchBusca && matchStatus
  })

  // Totais separados Pagar vs Receber
  const contasPagar = contas.filter((c) => (c.tipo || 'pagar') === 'pagar')
  const contasReceber = contas.filter((c) => c.tipo === 'receber')

  const totalAbertoPagar = contasPagar
    .filter((c) => c.status === 'aberta' || c.status === 'parcial' || c.status === 'vencida')
    .reduce((acc, c) => acc + (c.total - c.totalPago), 0)

  const totalAbertoReceber = contasReceber
    .filter((c) => c.status === 'aberta' || c.status === 'parcial' || c.status === 'vencida')
    .reduce((acc, c) => acc + (c.total - c.totalPago), 0)

  // Cálculo da Baixa
  const valorOriginal = baixaModal?.parcela.valor ?? 0
  const valorDescontoCalc =
    descontoTipo === 'R$'
      ? Math.max(0, descontoValor)
      : (valorOriginal * Math.max(0, descontoValor)) / 100
  const valorAcrescimoCalc =
    acrescimoTipo === 'R$'
      ? Math.max(0, acrescimoValor)
      : (valorOriginal * Math.max(0, acrescimoValor)) / 100
  const valorFinalLiquido = Math.max(0, valorOriginal - valorDescontoCalc + valorAcrescimoCalc)

  function abrirModalBaixa(conta: ContaPagar, parcela: ContaPagarParcela) {
    setBaixaModal({ conta, parcela })
    setBaixaData(new Date().toISOString().split('T')[0])
    setDescontoTipo('R$')
    setDescontoValor(0)
    setAcrescimoTipo('R$')
    setAcrescimoValor(0)
    setBaixaFormaPagto('PIX')
    setBaixaObs('')
  }

  async function confirmarBaixa() {
    if (!baixaModal) return
    const { conta, parcela } = baixaModal

    const baixaInfo: BaixaParcelaInfo = {
      dataBaixa: baixaData,
      valorOriginal: parcela.valor,
      descontoTipo,
      descontoValor,
      descontoFinal: valorDescontoCalc,
      acrescimoTipo,
      acrescimoValor,
      acrescimoFinal: valorAcrescimoCalc,
      valorFinalPago: valorFinalLiquido,
      formaPagamento: baixaFormaPagto,
      observacao: baixaObs.trim() || undefined,
    }

    const novasParcelas = conta.parcelas.map((p) => {
      if (p.numero === parcela.numero) {
        return {
          ...p,
          status: 'paga' as StatusConta,
          baixa: baixaInfo,
        }
      }
      return p
    })

    const totalPagoAtualizado = conta.totalPago + parcela.valor
    const todasPagas = novasParcelas.every((p) => p.status === 'paga')
    const novoStatus: StatusConta = todasPagas ? 'paga' : 'parcial'

    const contaAtualizada: ContaPagar = {
      ...conta,
      parcelas: novasParcelas,
      totalPago: totalPagoAtualizado,
      status: novoStatus,
    }

    await updateContaPagar(contaAtualizada)
    setContas((prev) => prev.map((c) => (c.id === contaAtualizada.id ? contaAtualizada : c)))
    setBaixaModal(null)
  }

  async function handleSalvarNovaConta(e: React.FormEvent) {
    e.preventDefault()
    if (!novaDescricao.trim() || novaTotal <= 0) return

    const parcelasGeradas: ContaPagarParcela[] = []
    const valorParcelaBase = Math.round((novaTotal / novaQtdParcelas) * 100) / 100
    let soma = 0

    for (let i = 1; i <= novaQtdParcelas; i++) {
      const dt = new Date(novaVencimento + 'T12:00:00')
      dt.setMonth(dt.getMonth() + (i - 1))
      const venc = dt.toISOString().split('T')[0]
      const valor = i === novaQtdParcelas ? Math.round((novaTotal - soma) * 100) / 100 : valorParcelaBase
      soma += valor
      parcelasGeradas.push({
        numero: i,
        vencimento: venc,
        valor,
        status: 'aberta',
      })
    }

    const nova: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'> = {
      tipo: novaTipo,
      descricao: novaDescricao.trim(),
      fornecedor: novaPessoa.trim() || null,
      categoria: novaCategoria.trim() || (novaTipo === 'pagar' ? 'Despesa Geral' : 'Receita Geral'),
      origem: 'avulsa',
      total: novaTotal,
      totalPago: 0,
      status: 'aberta',
      parcelas: parcelasGeradas,
    }

    const criada = await saveContaPagar(nova)
    setContas((prev) => [criada, ...prev])
    setNovaContaModal(false)
    setNovaDescricao('')
    setNovaPessoa('')
    setNovaCategoria('')
    setNovaTotal(0)
    setNovaQtdParcelas(1)
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wallet size={24} color="#1D4ED8" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#111827' }}>
              Gestão Financeira
            </h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: '#DC2626', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TrendingDown size={14} /> A Pagar em aberto: {fmt(totalAbertoPagar)}
              </span>
              <span style={{ color: '#16A34A', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={14} /> A Receber em aberto: {fmt(totalAbertoReceber)}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setNovaContaModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            background: '#1D4ED8',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <Plus size={16} />
          Novo Lançamento
        </button>
      </div>

      {/* Tabs Pagar vs Receber vs Todos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#E2E8F0', padding: 4, borderRadius: 12, width: 'fit-content' }}>
        <button
          onClick={() => setTipoFiltro('todos')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            background: tipoFiltro === 'todos' ? '#FFFFFF' : 'transparent',
            color: tipoFiltro === 'todos' ? '#0F172A' : '#64748B',
            boxShadow: tipoFiltro === 'todos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          Todos ({contas.length})
        </button>
        <button
          onClick={() => setTipoFiltro('pagar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            background: tipoFiltro === 'pagar' ? '#DC2626' : 'transparent',
            color: tipoFiltro === 'pagar' ? '#FFFFFF' : '#64748B',
            boxShadow: tipoFiltro === 'pagar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <ArrowDownLeft size={15} />
          Contas a Pagar ({contasPagar.length})
        </button>
        <button
          onClick={() => setTipoFiltro('receber')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            background: tipoFiltro === 'receber' ? '#16A34A' : 'transparent',
            color: tipoFiltro === 'receber' ? '#FFFFFF' : '#64748B',
            boxShadow: tipoFiltro === 'receber' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <ArrowUpRight size={15} />
          Contas a Receber ({contasReceber.length})
        </button>
      </div>

      {/* Cards de resumo por Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(['aberta', 'vencida', 'parcial', 'paga'] as StatusConta[]).map((status) => {
          const cfg = STATUS_CONFIG[status]
          const qtd = contas
            .filter((c) => tipoFiltro === 'todos' || (c.tipo || 'pagar') === tipoFiltro)
            .filter((c) => c.status === status).length
          return (
            <button
              key={status}
              onClick={() => setFiltroStatus(filtroStatus === status ? 'todos' : status)}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: filtroStatus === status ? cfg.bg : '#FFFFFF',
                border: `1.5px solid ${filtroStatus === status ? cfg.color + '66' : '#E5E7EB'}`,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {cfg.label}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 900, color: '#111827' }}>{qtd}</p>
            </button>
          )
        })}
      </div>

      {/* Barra de busca e filtros adicionais */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Buscar por descrição, fornecedor/cliente ou categoria…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10,
            border: '1.5px solid #E5E7EB', background: mostrarFiltros ? '#EFF6FF' : '#FFFFFF',
            color: mostrarFiltros ? '#1D4ED8' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Filter size={14} />
          Filtros de Status
          <ChevronDown size={13} style={{ transform: mostrarFiltros ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* Filtros em pílulas */}
      {mostrarFiltros && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['todos', 'aberta', 'vencida', 'parcial', 'paga', 'cancelada'] as string[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${filtroStatus === f ? '#1D4ED8' : '#E5E7EB'}`,
                background: filtroStatus === f ? '#1D4ED8' : '#FFFFFF',
                color: filtroStatus === f ? '#FFFFFF' : '#374151',
              }}
            >
              {f === 'todos' ? 'Todos' : STATUS_CONFIG[f as StatusConta]?.label ?? f}
            </button>
          ))}
        </div>
      )}

      {/* Lista de lançamentos */}
      {contasFiltradas.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB' }}>
          <Wallet size={40} color="#D1D5DB" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#374151' }}>Nenhum lançamento encontrado</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9CA3AF' }}>Ajuste os filtros ou crie um novo lançamento financeiro.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contasFiltradas.map((conta) => {
            const isPagar = (conta.tipo || 'pagar') === 'pagar'
            const saldoAberto = conta.total - conta.totalPago
            const expandida = contaExpandida === conta.id
            return (
              <div
                key={conta.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: 14,
                  border: '1.5px solid #E5E7EB',
                  borderLeft: `4px solid ${isPagar ? '#DC2626' : '#16A34A'}`,
                  overflow: 'hidden',
                }}
              >
                {/* Linha principal */}
                <div
                  style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
                  onClick={() => setContaExpandida(expandida ? null : conta.id)}
                >
                  {/* Ícone Indicador Pagar vs Receber */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: isPagar ? '#FEF2F2' : '#F0FDF4',
                      border: `1px solid ${isPagar ? '#FECACA' : '#BBF7D0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    title={isPagar ? 'Conta a Pagar' : 'Conta a Receber'}
                  >
                    {isPagar ? <ArrowDownLeft size={18} color="#DC2626" /> : <ArrowUpRight size={18} color="#16A34A" />}
                  </div>

                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: isPagar ? '#FEE2E2' : '#DCFCE7',
                          color: isPagar ? '#991B1B' : '#166534',
                          textTransform: 'uppercase',
                        }}
                      >
                        {isPagar ? 'A Pagar' : 'A Receber'}
                      </span>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{conta.descricao}</p>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                      {conta.fornecedor ?? ORIGEM_CONFIG[conta.origem]?.label}
                      {conta.categoria && ` · ${conta.categoria}`}
                      {' · '}{conta.parcelas.length} parcela{conta.parcelas.length > 1 ? 's' : ''}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>TOTAL</p>
                      <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 900, color: isPagar ? '#111827' : '#16A34A' }}>
                        {fmt(conta.total)}
                      </p>
                    </div>
                    {saldoAberto > 0 && saldoAberto < conta.total && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>EM ABERTO</p>
                        <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: isPagar ? '#DC2626' : '#2563EB' }}>
                          {fmt(saldoAberto)}
                        </p>
                      </div>
                    )}
                    <StatusBadge status={conta.status} />
                    <ChevronDown
                      size={16}
                      color="#9CA3AF"
                      style={{ transform: expandida ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
                    />
                  </div>
                </div>

                {/* Parcelas expandidas */}
                {expandida && (
                  <div style={{ borderTop: '1px solid #F3F4F6', background: '#F9FAFB', padding: '14px 20px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Parcelas & Baixas
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {conta.parcelas.map((p) => (
                        <div
                          key={p.numero}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#6B7280' }}>#{p.numero}</span>
                          <span style={{ fontSize: 13, color: '#374151', flex: 1, minWidth: 160 }}>
                            Vence em {p.vencimento.split('-').reverse().join('/')}
                            {p.baixa && (
                              <span style={{ display: 'block', fontSize: 11, color: '#16A34A', marginTop: 2, fontWeight: 600 }}>
                                Liquidado em {p.baixa.dataBaixa.split('-').reverse().join('/')} · Pago: {fmt(p.baixa.valorFinalPago)}
                                {p.baixa.descontoFinal > 0 && ` (Desc: -${fmt(p.baixa.descontoFinal)})`}
                                {p.baixa.acrescimoFinal > 0 && ` (Acrésc: +${fmt(p.baixa.acrescimoFinal)})`}
                              </span>
                            )}
                          </span>

                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{fmt(p.valor)}</span>
                          </div>

                          <StatusBadge status={p.status} />

                          {(p.status === 'aberta' || p.status === 'parcial' || p.status === 'vencida') && (
                            <button
                              onClick={() => abrirModalBaixa(conta, p)}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: isPagar ? '1.5px solid #DC2626' : '1.5px solid #16A34A',
                                background: 'none',
                                color: isPagar ? '#DC2626' : '#16A34A',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Baixar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL DE BAIXA COM DESCONTO E ACRÉSCIMO ───────────────── */}
      {baixaModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              width: '100%',
              maxWidth: 500,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0F172A' }}>
                  Baixar Parcela #{baixaModal.parcela.numero}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  {baixaModal.conta.descricao}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBaixaModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Valor Original */}
              <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Valor Nominal</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{fmt(baixaModal.parcela.valor)}</span>
              </div>

              {/* Data da Baixa */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Data do Pagamento / Liquidação
                </label>
                <input
                  type="date"
                  value={baixaData}
                  onChange={(e) => setBaixaData(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Desconto */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Desconto Concedido / Obtido
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => setDescontoTipo('R$')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: descontoTipo === 'R$' ? '#FFFFFF' : 'transparent',
                        color: descontoTipo === 'R$' ? '#0F172A' : '#64748B',
                        boxShadow: descontoTipo === 'R$' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescontoTipo('%')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: descontoTipo === '%' ? '#FFFFFF' : 'transparent',
                        color: descontoTipo === '%' ? '#0F172A' : '#64748B',
                        boxShadow: descontoTipo === '%' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={descontoValor || ''}
                    onChange={(e) => setDescontoValor(Number(e.target.value))}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {valorDescontoCalc > 0 && (
                    <div style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', borderRadius: 8, alignSelf: 'center' }}>
                      -{fmt(valorDescontoCalc)}
                    </div>
                  )}
                </div>
              </div>

              {/* Acréscimo / Juros / Multa */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Acréscimo (Juros / Multa / Taxa)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => setAcrescimoTipo('R$')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: acrescimoTipo === 'R$' ? '#FFFFFF' : 'transparent',
                        color: acrescimoTipo === 'R$' ? '#0F172A' : '#64748B',
                        boxShadow: acrescimoTipo === 'R$' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => setAcrescimoTipo('%')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: acrescimoTipo === '%' ? '#FFFFFF' : 'transparent',
                        color: acrescimoTipo === '%' ? '#0F172A' : '#64748B',
                        boxShadow: acrescimoTipo === '%' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={acrescimoValor || ''}
                    onChange={(e) => setAcrescimoValor(Number(e.target.value))}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {valorAcrescimoCalc > 0 && (
                    <div style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', borderRadius: 8, alignSelf: 'center' }}>
                      +{fmt(valorAcrescimoCalc)}
                    </div>
                  )}
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Forma de Pagamento
                </label>
                <select
                  value={baixaFormaPagto}
                  onChange={(e) => setBaixaFormaPagto(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', background: '#FFFFFF' }}
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto Bancário</option>
                  <option value="TRANSFERENCIA">Transferência / TED</option>
                  <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                  <option value="CARTAO_DEBITO">Cartão de Débito</option>
                  <option value="DINHEIRO">Dinheiro em Espécie</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              {/* Total Final a Liquidar */}
              <div
                style={{
                  background: '#EFF6FF',
                  border: '1.5px solid #BFDBFE',
                  padding: '14px 16px',
                  borderRadius: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 6,
                }}
              >
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                    Valor Efetivo da Baixa
                  </span>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748B' }}>
                    Nominal: {fmt(valorOriginal)} {valorDescontoCalc > 0 ? ` - ${fmt(valorDescontoCalc)}` : ''} {valorAcrescimoCalc > 0 ? ` + ${fmt(valorAcrescimoCalc)}` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#1E3A8A' }}>
                  {fmt(valorFinalLiquido)}
                </span>
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setBaixaModal(null)}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarBaixa}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#16A34A', color: '#FFFFFF', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                >
                  Confirmar Baixa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE NOVO LANÇAMENTO (PAGAR OU RECEBER) ───────────── */}
      {novaContaModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0F172A' }}>
                Novo Lançamento Financeiro
              </h3>
              <button
                type="button"
                onClick={() => setNovaContaModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaConta} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Tipo: A Pagar ou A Receber */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Tipo de Operação
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNovaTipo('pagar')}
                    style={{
                      padding: '10px',
                      borderRadius: 8,
                      border: `2px solid ${novaTipo === 'pagar' ? '#DC2626' : '#E2E8F0'}`,
                      background: novaTipo === 'pagar' ? '#FEF2F2' : '#FFFFFF',
                      color: novaTipo === 'pagar' ? '#DC2626' : '#64748B',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <ArrowDownLeft size={16} /> Conta a Pagar
                  </button>
                  <button
                    type="button"
                    onClick={() => setNovaTipo('receber')}
                    style={{
                      padding: '10px',
                      borderRadius: 8,
                      border: `2px solid ${novaTipo === 'receber' ? '#16A34A' : '#E2E8F0'}`,
                      background: novaTipo === 'receber' ? '#F0FDF4' : '#FFFFFF',
                      color: novaTipo === 'receber' ? '#16A34A' : '#64748B',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <ArrowUpRight size={16} /> Conta a Receber
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Descrição *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aluguel da Loja, Recebimento Cliente X..."
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    {novaTipo === 'pagar' ? 'Fornecedor' : 'Cliente / Origem'}
                  </label>
                  <input
                    type="text"
                    placeholder="Nome"
                    value={novaPessoa}
                    onChange={(e) => setNovaPessoa(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Categoria
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Despesa Operacional"
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Valor Total (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0,00"
                    value={novaTotal || ''}
                    onChange={(e) => setNovaTotal(Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    1º Vencimento
                  </label>
                  <input
                    type="date"
                    required
                    value={novaVencimento}
                    onChange={(e) => setNovaVencimento(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Parcelas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    value={novaQtdParcelas}
                    onChange={(e) => setNovaQtdParcelas(Math.max(1, Number(e.target.value)))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setNovaContaModal(false)}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1D4ED8', color: '#FFFFFF', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
