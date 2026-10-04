import { useState } from 'react'
import { ShoppingCart, Plus, Search, Filter, ChevronDown, CheckCircle2, Clock, XCircle, Package } from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData } from '../../modules/lib/datas'

type StatusPedido = 'rascunho' | 'emitido' | 'recebido_parcial' | 'recebido' | 'cancelado'

type PedidoCompra = {
  id: string
  numero: number
  fornecedor: string
  status: StatusPedido
  dataEmissao: string | null
  dataPrevistaEntrega: string | null
  total: number
  numeroParcelas: number
}

const STATUS_CONFIG: Record<
  StatusPedido,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  rascunho: {
    label: 'Rascunho',
    color: '#6B7280',
    bg: '#F3F4F6',
    icon: <Clock size={13} />,
  },
  emitido: {
    label: 'Emitido',
    color: '#2563EB',
    bg: '#EFF6FF',
    icon: <ShoppingCart size={13} />,
  },
  recebido_parcial: {
    label: 'Rec. Parcial',
    color: '#D97706',
    bg: '#FFFBEB',
    icon: <Package size={13} />,
  },
  recebido: {
    label: 'Recebido',
    color: '#16A34A',
    bg: '#F0FDF4',
    icon: <CheckCircle2 size={13} />,
  },
  cancelado: {
    label: 'Cancelado',
    color: '#DC2626',
    bg: '#FEF2F2',
    icon: <XCircle size={13} />,
  },
}

// Dados de demonstração
const PEDIDOS_DEMO: PedidoCompra[] = [
  {
    id: '1',
    numero: 1001,
    fornecedor: 'Distribuidora Nacional Ltda',
    status: 'emitido',
    dataEmissao: '2026-09-15',
    dataPrevistaEntrega: '2026-10-10',
    total: 8750.00,
    numeroParcelas: 3,
  },
  {
    id: '2',
    numero: 1002,
    fornecedor: 'Bem Estar Colchões ME',
    status: 'recebido_parcial',
    dataEmissao: '2026-09-20',
    dataPrevistaEntrega: '2026-10-05',
    total: 3200.00,
    numeroParcelas: 2,
  },
  {
    id: '3',
    numero: 1003,
    fornecedor: 'Tecidos Premium Ind. Com.',
    status: 'recebido',
    dataEmissao: '2026-09-01',
    dataPrevistaEntrega: '2026-09-25',
    total: 12400.50,
    numeroParcelas: 1,
  },
  {
    id: '4',
    numero: 1004,
    fornecedor: 'Distribuidora Nacional Ltda',
    status: 'rascunho',
    dataEmissao: null,
    dataPrevistaEntrega: null,
    total: 4980.00,
    numeroParcelas: 4,
  },
  {
    id: '5',
    numero: 1000,
    fornecedor: 'Madeireira do Vale S/A',
    status: 'cancelado',
    dataEmissao: '2026-08-10',
    dataPrevistaEntrega: '2026-09-01',
    total: 2100.00,
    numeroParcelas: 1,
  },
]

function StatusBadge({ status }: { status: StatusPedido }) {
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

const FILTROS_STATUS = [
  { value: 'todos', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunhos' },
  { value: 'emitido', label: 'Emitidos' },
  { value: 'recebido_parcial', label: 'Rec. Parcial' },
  { value: 'recebido', label: 'Recebidos' },
  { value: 'cancelado', label: 'Cancelados' },
]

export function V2PedidoCompraPage() {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const pedidosFiltrados = PEDIDOS_DEMO.filter((p) => {
    const matchBusca =
      !busca ||
      p.fornecedor.toLowerCase().includes(busca.toLowerCase()) ||
      String(p.numero).includes(busca)
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
    return matchBusca && matchStatus
  })

  const totaisPorStatus = PEDIDOS_DEMO.reduce(
    (acc, p) => {
      if (p.status !== 'cancelado') acc.total += p.total
      acc[p.status] = (acc[p.status] ?? 0) + 1
      return acc
    },
    { total: 0 } as Record<string, number>,
  )

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
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShoppingCart size={22} color="#2563EB" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>Pedidos de Compra</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#6B7280', marginTop: 2 }}>
              {PEDIDOS_DEMO.length} pedidos · Volume ativo: {formatarMoeda(totaisPorStatus.total)}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            background: '#0D6BAF',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Novo Pedido
        </button>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(['rascunho', 'emitido', 'recebido_parcial', 'recebido'] as StatusPedido[]).map((status) => {
          const cfg = STATUS_CONFIG[status]
          const qtd = PEDIDOS_DEMO.filter((p) => p.status === status).length
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

      {/* Barra de busca e filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
          />
          <input
            type="text"
            placeholder="Buscar por fornecedor ou nº do pedido…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: 10,
              border: '1.5px solid #E5E7EB',
              fontSize: 13,
              outline: 'none',
              background: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 14px',
            borderRadius: 10,
            border: '1.5px solid #E5E7EB',
            background: mostrarFiltros ? '#EFF6FF' : '#FFFFFF',
            color: mostrarFiltros ? '#2563EB' : '#374151',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Filter size={14} />
          Filtros
          <ChevronDown size={13} style={{ transform: mostrarFiltros ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* Filtros expandidos */}
      {mostrarFiltros && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {FILTROS_STATUS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroStatus(f.value)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: `1.5px solid ${filtroStatus === f.value ? '#0D6BAF' : '#E5E7EB'}`,
                background: filtroStatus === f.value ? '#0D6BAF' : '#FFFFFF',
                color: filtroStatus === f.value ? '#FFFFFF' : '#374151',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabela de pedidos */}
      {pedidosFiltrados.length === 0 ? (
        <div
          style={{
            padding: '60px 24px',
            textAlign: 'center',
            background: '#FFFFFF',
            borderRadius: 14,
            border: '1.5px solid #E5E7EB',
          }}
        >
          <ShoppingCart size={40} color="#D1D5DB" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#374151' }}>Nenhum pedido encontrado</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9CA3AF' }}>
            Tente ajustar os filtros ou criar um novo pedido.
          </p>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}>
          {/* Header da tabela (desktop) */}
          <div
            className="hidden sm:grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 160px 130px 130px 110px',
              padding: '10px 20px',
              background: '#F9FAFB',
              borderBottom: '1.5px solid #E5E7EB',
            }}
          >
            {['Nº', 'Fornecedor', 'Emissão', 'Prev. Entrega', 'Total', 'Status'].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {h}
              </span>
            ))}
          </div>

          {/* Linhas */}
          {pedidosFiltrados.map((pedido, idx) => (
            <div
              key={pedido.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                padding: '14px 20px',
                borderBottom: idx < pedidosFiltrados.length - 1 ? '1px solid #F3F4F6' : 'none',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Mobile: card vertical */}
              <div className="sm:hidden" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>#{pedido.numero}</span>
                  <StatusBadge status={pedido.status} />
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#374151' }}>{pedido.fornecedor}</p>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    Emissão: {formatarData(pedido.dataEmissao)}
                  </span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    Entrega: {formatarData(pedido.dataPrevistaEntrega)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#111827' }}>
                  {formatarMoeda(pedido.total)}
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>
                    {pedido.numeroParcelas}x
                  </span>
                </p>
              </div>

              {/* Desktop: colunas */}
              <span
                className="hidden sm:block"
                style={{ fontSize: 13, fontWeight: 900, color: '#6B7280', fontFamily: 'monospace' }}
              >
                #{pedido.numero}
              </span>
              <span className="hidden sm:block" style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pedido.fornecedor}
              </span>
              <span className="hidden sm:block" style={{ fontSize: 13, color: '#6B7280' }}>
                {formatarData(pedido.dataEmissao)}
              </span>
              <span className="hidden sm:block" style={{ fontSize: 13, color: '#6B7280' }}>
                {formatarData(pedido.dataPrevistaEntrega)}
              </span>
              <span className="hidden sm:block" style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>
                {formatarMoeda(pedido.total)}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF', marginLeft: 4 }}>
                  {pedido.numeroParcelas}x
                </span>
              </span>
              <div className="hidden sm:flex">
                <StatusBadge status={pedido.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 400 }}>
            <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, color: '#111827' }}>Novo Pedido de Compra</h2>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 24 }}>
              A funcionalidade de criação de pedidos de compra está em desenvolvimento. Em breve você poderá adicionar produtos e gerenciar o estoque.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E5E7EB', color: '#374151', cursor: 'pointer', fontWeight: 600 }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
