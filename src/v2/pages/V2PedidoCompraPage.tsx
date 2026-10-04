import { useState, useEffect } from 'react'
import { ShoppingCart, Plus, Search, Filter, ChevronDown, CheckCircle2, Clock, XCircle, Package } from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData } from '../../modules/lib/datas'
import { listPedidosCompra, savePedidoCompra, PedidoCompra, StatusPedido } from '../services/v2PedidoCompraService'
import { saveContaPagar, StatusConta } from '../services/v2ContasPagarService'
import { listV2Products, V2Product } from '../services/v2ProdutosService'

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
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<V2Product[]>([])

  // Form states
  const [formFornecedor, setFormFornecedor] = useState('')
  const [formProdutoId, setFormProdutoId] = useState('')
  const [formQuantidade, setFormQuantidade] = useState(1)
  const [formParcelas, setFormParcelas] = useState(1)

  useEffect(() => {
    async function load() {
      const p = await listPedidosCompra()
      const prods = await listV2Products()
      setPedidos(p)
      setProdutosDisponiveis(prods)
    }
    load()
  }, [])

  const pedidosFiltrados = pedidos.filter((p) => {
    const matchBusca =
      !busca ||
      p.fornecedor.toLowerCase().includes(busca.toLowerCase()) ||
      String(p.numero).includes(busca)
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
    return matchBusca && matchStatus
  })

  const totaisPorStatus = pedidos.reduce(
    (acc, p) => {
      if (p.status !== 'cancelado') acc.total += p.total
      acc[p.status] = (acc[p.status] ?? 0) + 1
      return acc
    },
    { total: 0 } as Record<string, number>,
  )

  const handleSalvarNovoPedido = async () => {
    if (!formFornecedor || !formProdutoId || formQuantidade <= 0 || formParcelas <= 0) {
      alert('Preencha todos os campos.')
      return
    }

    const produtoSelecionado = produtosDisponiveis.find((p) => p.id === formProdutoId)
    if (!produtoSelecionado) return

    const totalCalculado = produtoSelecionado.cost_price * formQuantidade

    try {
      const novoPedido = await savePedidoCompra({
        fornecedor: formFornecedor,
        status: 'emitido',
        dataEmissao: new Date().toISOString().split('T')[0],
        dataPrevistaEntrega: null,
        total: totalCalculado,
        numeroParcelas: formParcelas,
        itens: [
          {
            produto_id: produtoSelecionado.id,
            produto_nome: produtoSelecionado.name,
            quantidade: formQuantidade,
            preco_unitario: produtoSelecionado.cost_price,
            total: totalCalculado,
          },
        ],
      })

      const parcelasArray = []
      const valorParcela = totalCalculado / formParcelas
      const dataHoje = new Date()
      for (let i = 1; i <= formParcelas; i++) {
        const vencimento = new Date(dataHoje)
        vencimento.setMonth(vencimento.getMonth() + i)
        parcelasArray.push({
          numero: i,
          vencimento: vencimento.toISOString().split('T')[0],
          valor: valorParcela,
          status: 'aberta' as StatusConta,
        })
      }

      await saveContaPagar({
        descricao: `Pedido de Compra #${novoPedido.numero} - ${produtoSelecionado.name}`,
        fornecedor: formFornecedor,
        origem: 'compra',
        categoria: 'Mercadoria',
        total: totalCalculado,
        totalPago: 0,
        status: 'aberta',
        parcelas: parcelasArray,
      })

      const atualizados = await listPedidosCompra()
      setPedidos(atualizados)
      setIsModalOpen(false)
      setFormFornecedor('')
      setFormProdutoId('')
      setFormQuantidade(1)
      setFormParcelas(1)
      alert('Pedido criado e Contas a Pagar gerado com sucesso!')
    } catch (err) {
      alert('Erro ao criar pedido.')
    }
  }


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
              {pedidos.length} pedidos · Volume ativo: {formatarMoeda(totaisPorStatus.total)}
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
          const qtd = pedidos.filter((p) => p.status === status).length
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
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 450 }}>
            <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 18, color: '#111827' }}>Novo Pedido de Compra</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Fornecedor</label>
                <input
                  type="text"
                  value={formFornecedor}
                  onChange={(e) => setFormFornecedor(e.target.value)}
                  placeholder="Nome do fornecedor"
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Produto</label>
                <select
                  value={formProdutoId}
                  onChange={(e) => setFormProdutoId(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, backgroundColor: '#fff' }}
                >
                  <option value="">Selecione um produto</option>
                  {produtosDisponiveis.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({formatarMoeda(p.cost_price)})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={formQuantidade}
                    onChange={(e) => setFormQuantidade(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nº de Parcelas</label>
                  <select
                    value={formParcelas}
                    onChange={(e) => setFormParcelas(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, backgroundColor: '#fff' }}
                  >
                    <option value={1}>À vista (1x)</option>
                    <option value={2}>2x</option>
                    <option value={3}>3x</option>
                    <option value={4}>4x</option>
                    <option value={5}>5x</option>
                    <option value={6}>6x</option>
                  </select>
                </div>
              </div>
              
              {formProdutoId && (
                <div style={{ padding: '12px', background: '#F3F4F6', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#4B5563' }}>Total estimado:</span>
                  <strong style={{ fontSize: 16, color: '#111827' }}>
                    {formatarMoeda((produtosDisponiveis.find(p => p.id === formProdutoId)?.cost_price || 0) * formQuantidade)}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={handleSalvarNovoPedido} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0D6BAF', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                Criar Pedido e Gerar Contas a Pagar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
