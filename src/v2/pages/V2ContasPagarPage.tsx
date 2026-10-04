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
} from 'lucide-react'
import { listContasPagar, ContaPagar, StatusConta, OrigemConta } from '../services/v2ContasPagarService'

const STATUS_CONFIG: Record<StatusConta, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  aberta: { label: 'Aberta', color: '#2563EB', bg: '#EFF6FF', icon: <Clock size={13} /> },
  parcial: { label: 'Parcial', color: '#D97706', bg: '#FFFBEB', icon: <AlertCircle size={13} /> },
  paga: { label: 'Paga', color: '#16A34A', bg: '#F0FDF4', icon: <CheckCircle2 size={13} /> },
  cancelada: { label: 'Cancelada', color: '#6B7280', bg: '#F3F4F6', icon: <XCircle size={13} /> },
  vencida: { label: 'Vencida', color: '#DC2626', bg: '#FEF2F2', icon: <AlertCircle size={13} /> },
}

const ORIGEM_CONFIG: Record<OrigemConta, { label: string; icon: React.ReactNode }> = {
  compra: { label: 'Pedido de Compra', icon: <span style={{ fontSize: 10 }}>🛒</span> },
  avulsa: { label: 'Avulsa', icon: <span style={{ fontSize: 10 }}>📋</span> },
  recorrente: { label: 'Recorrente', icon: <span style={{ fontSize: 10 }}>🔄</span> },
}

function StatusBadge({ status }: { status: StatusConta }) {
  const cfg = STATUS_CONFIG[status]
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
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [contaExpandida, setContaExpandida] = useState<string | null>(null)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [contas, setContas] = useState<ContaPagar[]>([])
  
  useEffect(() => {
    async function load() {
      const data = await listContasPagar()
      setContas(data)
    }
    load()
  }, [])

  const contasFiltradas = contas.filter((c) => {
    const matchBusca =
      !busca ||
      c.descricao.toLowerCase().includes(busca.toLowerCase()) ||
      (c.fornecedor ?? '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.categoria ?? '').toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  const totalAberto = contas.filter((c) => c.status === 'aberta' || c.status === 'parcial' || c.status === 'vencida')
    .reduce((acc, c) => acc + (c.total - c.totalPago), 0)
  const totalVencido = contas.filter((c) => c.status === 'vencida')
    .reduce((acc, c) => acc + (c.total - c.totalPago), 0)

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: '#FEF2F2',
              border: '1.5px solid #FECACA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wallet size={22} color="#DC2626" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>Contas a Pagar</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#6B7280', marginTop: 2 }}>
              Em aberto: {fmt(totalAberto)}
              {totalVencido > 0 && (
                <span style={{ color: '#DC2626', marginLeft: 8, fontWeight: 700 }}>
                  · Vencido: {fmt(totalVencido)}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            background: '#DC2626',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Nova Conta
        </button>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(['aberta', 'vencida', 'parcial', 'paga'] as StatusConta[]).map((status) => {
          const cfg = STATUS_CONFIG[status]
          const qtd = contas.filter((c) => c.status === status).length
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

      {/* Barra de busca */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Buscar por descrição, fornecedor ou categoria…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10,
            border: '1.5px solid #E5E7EB', background: mostrarFiltros ? '#FEF2F2' : '#FFFFFF',
            color: mostrarFiltros ? '#DC2626' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Filter size={14} />
          Filtros
          <ChevronDown size={13} style={{ transform: mostrarFiltros ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* Filtros */}
      {mostrarFiltros && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['todos', 'aberta', 'vencida', 'parcial', 'paga', 'cancelada'] as (string)[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${filtroStatus === f ? '#DC2626' : '#E5E7EB'}`,
                background: filtroStatus === f ? '#DC2626' : '#FFFFFF',
                color: filtroStatus === f ? '#FFFFFF' : '#374151',
              }}
            >
              {f === 'todos' ? 'Todos' : STATUS_CONFIG[f as StatusConta]?.label ?? f}
            </button>
          ))}
        </div>
      )}

      {/* Lista de contas */}
      {contasFiltradas.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB' }}>
          <Wallet size={40} color="#D1D5DB" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#374151' }}>Nenhuma conta encontrada</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9CA3AF' }}>Ajuste os filtros ou crie uma nova conta.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contasFiltradas.map((conta) => {
            const saldoAberto = conta.total - conta.totalPago
            const expandida = contaExpandida === conta.id
            return (
              <div
                key={conta.id}
                style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}
              >
                {/* Linha principal */}
                <div
                  style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
                  onClick={() => setContaExpandida(expandida ? null : conta.id)}
                >
                  {/* Origem */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 18,
                    }}
                    title={ORIGEM_CONFIG[conta.origem].label}
                  >
                    {ORIGEM_CONFIG[conta.origem].icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{conta.descricao}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                      {conta.fornecedor ?? ORIGEM_CONFIG[conta.origem].label}
                      {conta.categoria && ` · ${conta.categoria}`}
                      {' · '}{conta.parcelas.length} parcela{conta.parcelas.length > 1 ? 's' : ''}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>TOTAL</p>
                      <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 900, color: '#111827' }}>{fmt(conta.total)}</p>
                    </div>
                    {saldoAberto > 0 && saldoAberto < conta.total && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>EM ABERTO</p>
                        <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#DC2626' }}>{fmt(saldoAberto)}</p>
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
                  <div style={{ borderTop: '1px solid #F3F4F6', background: '#F9FAFB', padding: '12px 20px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Parcelas
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {conta.parcelas.map((p) => (
                        <div
                          key={p.numero}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#6B7280' }}>#{p.numero}</span>
                          <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>
                            Vence em {p.vencimento.split('-').reverse().join('/')}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{fmt(p.valor)}</span>
                          <StatusBadge status={p.status} />
                          {(p.status === 'aberta' || p.status === 'parcial' || p.status === 'vencida') && (
                            <button
                              style={{
                                padding: '5px 12px',
                                borderRadius: 8,
                                border: '1.5px solid #DC2626',
                                background: 'none',
                                color: '#DC2626',
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
    </div>
  )
}
