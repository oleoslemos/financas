import { useState, useEffect } from 'react'
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  ChevronDown,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  Edit3,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Calendar,
} from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData } from '../../modules/lib/datas'
import {
  listPedidosCompra,
  savePedidoCompra,
  updatePedidoCompra,
  receberPedidoCompra,
  desfazerRecebimentoPedidoCompra,
  deletePedidoCompra,
  PedidoCompra,
  StatusPedido,
} from '../services/v2PedidoCompraService'
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
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.emitido
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
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<V2Product[]>([])

  // Modal States
  const [isModalCreateOpen, setIsModalCreateOpen] = useState(false)
  const [pedidoEdicao, setPedidoEdicao] = useState<PedidoCompra | null>(null)
  
  // Alert/Confirm Modal State
  const [mensagemErro, setMensagemErro] = useState<string | null>(null)

  // Form states (Novo/Edição)
  const [formFornecedor, setFormFornecedor] = useState('')
  const [formProdutoId, setFormProdutoId] = useState('')
  const [formQuantidade, setFormQuantidade] = useState(1)
  const [formParcelas, setFormParcelas] = useState(1)
  const [formDataEntrega, setFormDataEntrega] = useState('')

  const loadData = async () => {
    const p = await listPedidosCompra()
    const prods = await listV2Products()
    setPedidos(p)
    setProdutosDisponiveis(prods)
  }

  useEffect(() => {
    loadData()
  }, [])

  const abrirModalCriar = () => {
    setPedidoEdicao(null)
    setFormFornecedor('')
    setFormProdutoId(produtosDisponiveis[0]?.id || '')
    setFormQuantidade(1)
    setFormParcelas(1)
    setFormDataEntrega('')
    setIsModalCreateOpen(true)
  }

  const abrirModalEditar = (pedido: PedidoCompra) => {
    setPedidoEdicao(pedido)
    setFormFornecedor(pedido.fornecedor)
    setFormProdutoId(pedido.itens[0]?.produto_id || '')
    setFormQuantidade(pedido.itens[0]?.quantidade || 1)
    setFormParcelas(pedido.numeroParcelas || 1)
    setFormDataEntrega(pedido.dataPrevistaEntrega || '')
    setIsModalCreateOpen(true)
  }

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

  const handleSalvarPedido = async () => {
    if (!formFornecedor.trim() || !formProdutoId || formQuantidade <= 0 || formParcelas <= 0) {
      alert('Preencha todos os campos obrigatórios.')
      return
    }

    const produtoSelecionado = produtosDisponiveis.find((p) => p.id === formProdutoId)
    if (!produtoSelecionado) return

    const totalCalculado = produtoSelecionado.cost_price * formQuantidade

    try {
      if (pedidoEdicao) {
        // EDIÇÃO
        const pedidoAtualizado: PedidoCompra = {
          ...pedidoEdicao,
          fornecedor: formFornecedor,
          dataPrevistaEntrega: formDataEntrega || null,
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
        }
        await updatePedidoCompra(pedidoAtualizado)
      } else {
        // CRIAÇÃO
        const novoPedido = await savePedidoCompra({
          fornecedor: formFornecedor,
          status: 'emitido',
          dataEmissao: new Date().toISOString().split('T')[0],
          dataPrevistaEntrega: formDataEntrega || null,
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

        // Gerar parcelas do Contas a Pagar
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
          pedido_id: novoPedido.id,
          descricao: `Pedido de Compra #${novoPedido.numero} - ${produtoSelecionado.name}`,
          fornecedor: formFornecedor,
          origem: 'compra',
          categoria: 'Mercadoria',
          total: totalCalculado,
          totalPago: 0,
          status: 'aberta',
          parcelas: parcelasArray,
        })
      }

      await loadData()
      setIsModalCreateOpen(false)
    } catch (err) {
      alert('Erro ao salvar pedido.')
    }
  }

  const handleReceberPedido = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Deseja dar entrada no estoque para o Pedido #${pedido.numero}?`)) {
      return
    }
    const res = await receberPedidoCompra(pedido.id)
    if (!res.ok) {
      setMensagemErro(res.erro)
      return
    }
    await loadData()
  }

  const handleDesfazerRecebimento = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Confirma desfazer o recebimento do Pedido #${pedido.numero}? O estoque será ajustado.`)) {
      return
    }
    const res = await desfazerRecebimentoPedidoCompra(pedido.id)
    if (!res.ok) {
      setMensagemErro(res.erro)
      return
    }
    await loadData()
  }

  const handleExcluirPedido = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Tem certeza que deseja excluir o Pedido #${pedido.numero}? esta ação não poderá ser desfeita.`)) {
      return
    }
    const res = await deletePedidoCompra(pedido.id)
    if (!res.ok) {
      setMensagemErro(res.erro)
      return
    }
    await loadData()
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1150, margin: '0 auto' }}>
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
          onClick={abrirModalCriar}
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

      {/* Tabela de pedidos - UMA ÚNICA LINHA POR PEDIDO */}
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
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 800 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1.5px solid #E5E7EB' }}>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '80px' }}>
                  Nº
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Fornecedor
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '110px' }}>
                  Emissão
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '120px' }}>
                  Prev. Entrega
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '130px' }}>
                  Total
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '130px' }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '160px', textAlign: 'right' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.map((pedido, idx) => (
                <tr
                  key={pedido.id}
                  style={{
                    borderBottom: idx < pedidosFiltrados.length - 1 ? '1px solid #F3F4F6' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Nº */}
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 900, color: '#6B7280', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    #{pedido.numero}
                  </td>

                  {/* Fornecedor */}
                  <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                    {pedido.fornecedor}
                    {pedido.itens && pedido.itens.length > 0 && (
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#9CA3AF', marginTop: 2 }}>
                        {pedido.itens[0].produto_nome} ({pedido.itens[0].quantidade}x)
                      </span>
                    )}
                  </td>

                  {/* Emissão */}
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
                    {formatarData(pedido.dataEmissao)}
                  </td>

                  {/* Prev. Entrega */}
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
                    {formatarData(pedido.dataPrevistaEntrega)}
                  </td>

                  {/* Total */}
                  <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap' }}>
                    {formatarMoeda(pedido.total)}
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', marginLeft: 4 }}>
                      {pedido.numeroParcelas || 1}x
                    </span>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                    <StatusBadge status={pedido.status} />
                  </td>

                  {/* Ações */}
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      {/* Editar */}
                      <button
                        onClick={() => abrirModalEditar(pedido)}
                        title="Editar pedido"
                        style={{
                          padding: '6px',
                          borderRadius: 6,
                          border: '1px solid #E5E7EB',
                          background: '#FFFFFF',
                          color: '#374151',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Edit3 size={14} />
                      </button>

                      {/* Receber / Desfazer Recebimento */}
                      {(pedido.status === 'emitido' || pedido.status === 'recebido_parcial') && (
                        <button
                          onClick={() => handleReceberPedido(pedido)}
                          title="Receber (Dar entrada no estoque)"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #16A34A',
                            background: '#F0FDF4',
                            color: '#16A34A',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Package size={13} />
                          Receber
                        </button>
                      )}

                      {pedido.status === 'recebido' && (
                        <button
                          onClick={() => handleDesfazerRecebimento(pedido)}
                          title="Desfazer recebimento (Estornar estoque)"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #D97706',
                            background: '#FFFBEB',
                            color: '#D97706',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <RotateCcw size={13} />
                          Desfazer
                        </button>
                      )}

                      {/* Excluir */}
                      <button
                        onClick={() => handleExcluirPedido(pedido)}
                        title="Excluir pedido"
                        style={{
                          padding: '6px',
                          borderRadius: 6,
                          border: '1px solid #FECACA',
                          background: '#FEF2F2',
                          color: '#DC2626',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Criar / Editar Pedido */}
      {isModalCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 18, fontWeight: 800, color: '#111827' }}>
              {pedidoEdicao ? `Editar Pedido #${pedidoEdicao.numero}` : 'Novo Pedido de Compra'}
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Fornecedor *</label>
                <input
                  type="text"
                  value={formFornecedor}
                  onChange={(e) => setFormFornecedor(e.target.value)}
                  placeholder="Nome do fornecedor"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #D1D5DB', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Produto *</label>
                <select
                  value={formProdutoId}
                  onChange={(e) => setFormProdutoId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #D1D5DB', fontSize: 14, backgroundColor: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="">Selecione um produto</option>
                  {produtosDisponiveis.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({formatarMoeda(p.cost_price)})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Quantidade *</label>
                  <input
                    type="number"
                    min="1"
                    value={formQuantidade}
                    onChange={(e) => setFormQuantidade(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #D1D5DB', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Nº de Parcelas *</label>
                  <select
                    value={formParcelas}
                    onChange={(e) => setFormParcelas(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #D1D5DB', fontSize: 14, backgroundColor: '#fff', boxSizing: 'border-box' }}
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

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Previsão de Entrega</label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                  <input
                    type="date"
                    value={formDataEntrega}
                    onChange={(e) => setFormDataEntrega(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1.5px solid #D1D5DB', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              
              {formProdutoId && (
                <div style={{ padding: '12px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#4B5563', fontWeight: 600 }}>Total Estimado:</span>
                  <strong style={{ fontSize: 16, color: '#111827', fontWeight: 900 }}>
                    {formatarMoeda((produtosDisponiveis.find((p) => p.id === formProdutoId)?.cost_price || 0) * formQuantidade)}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setIsModalCreateOpen(false)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarPedido}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0D6BAF', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                {pedidoEdicao ? 'Salvar Alterações' : 'Criar Pedido e Gerar Financeiro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alerta de Erro de Validação (Consumo de Estoque / Baixa no Financeiro) */}
      {mensagemErro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 14, width: '100%', maxWidth: 440, borderLeft: '6px solid #DC2626', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={22} color="#DC2626" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991B1B' }}>Operação Não Permitida</h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                  {mensagemErro}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMensagemErro(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
