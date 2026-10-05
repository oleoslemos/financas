import { useState, useEffect } from 'react'
import {
  ShoppingCart,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  Edit3,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Calendar,
  Info,
} from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData, hoje, somarDias, compararDatas } from '../../modules/lib/datas'
import {
  listPedidosCompra,
  savePedidoCompra,
  updatePedidoCompra,
  emitirPedidoCompra,
  receberPedidoCompra,
  voltarPedidoParaAberto,
  cancelarPedidoCompra,
  deletePedidoCompra,
  PedidoCompra,
  PedidoCompraItem,
  StatusPedido,
} from '../services/v2PedidoCompraService'
import { listV2Products, V2Product } from '../services/v2ProdutosService'
import { listFornecedores, Fornecedor } from '../services/v2SettingsService'

const STATUS_CONFIG: Record<
  StatusPedido,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  rascunho: {
    label: 'Aberto',
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

const ABAS_STATUS: { value: 'todos' | StatusPedido; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'rascunho', label: 'Abertos' },
  { value: 'emitido', label: 'Emitidos' },
  { value: 'recebido_parcial', label: 'Rec. Parcial' },
  { value: 'recebido', label: 'Recebidos' },
  { value: 'cancelado', label: 'Cancelados' },
]

// Helper function for 10 previous + 2 next months dropdown options
function gerarOpcoesMeses(dataHoje: string) {
  const [anoAtual, mesAtual] = dataHoje.split('-').map(Number)
  const opcoes = []
  for (let delta = -10; delta <= 2; delta++) {
    const total = anoAtual * 12 + (mesAtual - 1) + delta
    const ano = Math.floor(total / 12)
    const mes = (total % 12) + 1
    const value = `${ano}-${String(mes).padStart(2, '0')}`
    const data = new Date(Date.UTC(ano, mes - 1, 1))
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(data)
      .replace(' de ', ' / ')
    opcoes.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opcoes
}

function mesAdjacente(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + delta
  const novoAno = Math.floor(total / 12)
  const novoMes = (total % 12) + 1
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`
}

function estaEmAberto(status: StatusPedido): boolean {
  return status === 'rascunho' || status === 'emitido' || status === 'recebido_parcial'
}

function dentroDoPeriodo(
  p: PedidoCompra,
  periodo: 'mes' | 'ultimos_90_dias' | 'ano' | 'todo',
  mes: string,
  campo: 'emissao' | 'previsaoEntrega',
  dataHoje: string
): boolean {
  if (periodo === 'todo') return true
  const data = campo === 'emissao' ? p.dataEmissao : p.dataPrevistaEntrega
  if (!data) return false
  switch (periodo) {
    case 'mes':
      return data.slice(0, 7) === mes
    case 'ano':
      return data.slice(0, 4) === dataHoje.slice(0, 4)
    case 'ultimos_90_dias':
      return data >= somarDias(dataHoje, -90) && data <= dataHoje
    default:
      return true
  }
}

function estaAtrasado(pedido: PedidoCompra, dataHoje: string): boolean {
  if (pedido.status !== 'emitido' && pedido.status !== 'recebido_parcial') return false
  if (!pedido.dataPrevistaEntrega) return false
  return compararDatas(pedido.dataPrevistaEntrega, dataHoje) < 0
}

function diasDeAtraso(pedido: PedidoCompra, dataHoje: string): number {
  if (!estaAtrasado(pedido, dataHoje) || !pedido.dataPrevistaEntrega) return 0
  const ms = Date.parse(`${dataHoje}T00:00:00Z`) - Date.parse(`${pedido.dataPrevistaEntrega}T00:00:00Z`)
  return Math.max(1, Math.round(ms / 86_400_000))
}

function avisoDeCusto(custoDigitado: number, custoCatalogo: number | undefined) {
  if (!custoCatalogo || custoCatalogo <= 0 || !custoDigitado || custoDigitado <= 0) return null
  const variacao = ((custoDigitado - custoCatalogo) / custoCatalogo) * 100
  if (Math.abs(variacao) <= 20) return null
  const arredondada = Math.round(Math.abs(variacao))
  return {
    arredondada,
    acima: variacao > 0,
    mensagem: `Custo ${arredondada}% ${variacao > 0 ? 'acima' : 'abaixo'} do cadastrado (${formatarMoeda(custoCatalogo)})`,
  }
}

function podeEditarCampo(
  status: StatusPedido | undefined,
  campo: 'fornecedor' | 'itens' | 'parcelas' | 'previsao' | 'observacao'
): boolean {
  if (!status || status === 'rascunho') return true
  if (status === 'emitido' || status === 'recebido_parcial') {
    return campo === 'previsao' || campo === 'observacao'
  }
  if (status === 'recebido') {
    return campo === 'observacao'
  }
  return false // cancelado
}

export function V2PedidoCompraPage() {
  const dataHoje = hoje()
  const opcoesMeses = gerarOpcoesMeses(dataHoje)

  // State: Filter and Search
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusPedido>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<'mes' | 'ultimos_90_dias' | 'ano' | 'todo'>('mes')
  const [filtroMes, setFiltroMes] = useState<string>(dataHoje.slice(0, 7))
  const [filtroCampo, setFiltroCampo] = useState<'emissao' | 'previsaoEntrega'>('emissao')

  // State: Data
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<V2Product[]>([])
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState<Fornecedor[]>([])

  // Modal States
  const [isModalCreateOpen, setIsModalCreateOpen] = useState(false)
  const [pedidoEdicao, setPedidoEdicao] = useState<PedidoCompra | null>(null)
  
  // Alert/Confirm Modal State
  const [mensagemErro, setMensagemErro] = useState<string | null>(null)

  // Form states (Novo/Edição)
  const [formFornecedor, setFormFornecedor] = useState('')
  const [formItens, setFormItens] = useState<PedidoCompraItem[]>([])
  const [formParcelas, setFormParcelas] = useState(1)
  const [formDataEntrega, setFormDataEntrega] = useState('')
  const [formObservacao, setFormObservacao] = useState('')

  const loadData = async () => {
    const p = await listPedidosCompra()
    const prods = await listV2Products()
    const forns = await listFornecedores()
    setPedidos(p)
    setProdutosDisponiveis(prods)
    setFornecedoresCadastrados(forns)
  }

  useEffect(() => {
    loadData()
  }, [])

  const abrirModalCriar = () => {
    setPedidoEdicao(null)
    setFormFornecedor('')
    const prodPadrao = produtosDisponiveis[0]
    setFormItens(
      prodPadrao
        ? [
            {
              produto_id: prodPadrao.id,
              produto_nome: prodPadrao.name,
              quantidade: 1,
              preco_unitario: prodPadrao.cost_price,
              total: prodPadrao.cost_price,
            },
          ]
        : []
    )
    setFormParcelas(1)
    setFormDataEntrega('')
    setFormObservacao('')
    setIsModalCreateOpen(true)
  }

  const abrirModalEditar = (pedido: PedidoCompra) => {
    setPedidoEdicao(pedido)
    setFormFornecedor(pedido.fornecedor)
    setFormItens(pedido.itens ? pedido.itens.map((i) => ({ ...i })) : [])
    setFormParcelas(pedido.numeroParcelas || 1)
    setFormDataEntrega(pedido.dataPrevistaEntrega || '')
    setFormObservacao(pedido.observacao || '')
    setIsModalCreateOpen(true)
  }

  const handleAdicionarItem = () => {
    const prodPadrao = produtosDisponiveis[0]
    if (!prodPadrao) {
      alert('Nenhum produto cadastrado.')
      return
    }
    setFormItens((prev) => [
      ...prev,
      {
        produto_id: prodPadrao.id,
        produto_nome: prodPadrao.name,
        quantidade: 1,
        preco_unitario: prodPadrao.cost_price,
        total: prodPadrao.cost_price,
      },
    ])
  }

  const handleRemoverItem = (index: number) => {
    if (formItens.length <= 1) {
      alert('O pedido deve conter pelo menos 1 produto.')
      return
    }
    setFormItens((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleItemProdutoChange = (index: number, produtoId: string) => {
    const prod = produtosDisponiveis.find((p) => p.id === produtoId)
    if (!prod) return
    setFormItens((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        const preco = prod.cost_price
        const qtd = item.quantidade || 1
        return {
          ...item,
          produto_id: prod.id,
          produto_nome: prod.name,
          preco_unitario: preco,
          total: preco * qtd,
        }
      })
    )
  }

  const handleItemQuantidadeChange = (index: number, quantidade: number) => {
    const qtd = Math.max(1, quantidade)
    setFormItens((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        return {
          ...item,
          quantidade: qtd,
          total: (item.preco_unitario || 0) * qtd,
        }
      })
    )
  }

  const handleItemPrecoChange = (index: number, preco: number) => {
    const p = Math.max(0, preco)
    setFormItens((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        return {
          ...item,
          preco_unitario: p,
          total: p * (item.quantidade || 1),
        }
      })
    )
  }

  const totalCalculado = formItens.reduce((acc, item) => acc + (item.total || 0), 0)

  // Search matching helper
  const matchSearch = (p: PedidoCompra, term: string): boolean => {
    if (!term.trim()) return true
    const q = term.trim().toLowerCase()
    return (
      p.fornecedor.toLowerCase().includes(q) ||
      String(p.numero).toLowerCase().includes(q) ||
      (p.observacao ? p.observacao.toLowerCase().includes(q) : false) ||
      (p.itens ? p.itens.some((i) => i.produto_nome.toLowerCase().includes(q)) : false)
    )
  }

  // 1. Pedidos que correspondem à busca
  const pedidosNaBusca = pedidos.filter((p) => matchSearch(p, busca))

  // 2. Pedidos no período + Pedidos em aberto (nunca somem!)
  const pedidosNoPeriodoEOuAbertos = pedidosNaBusca.filter((p) => {
    const dentro = dentroDoPeriodo(p, filtroPeriodo, filtroMes, filtroCampo, dataHoje)
    const aberto = estaEmAberto(p.status)
    return dentro || aberto
  })

  // Estatísticas para aviso do período
  const ocultosForaPeriodo = pedidosNaBusca.filter(
    (p) => !dentroDoPeriodo(p, filtroPeriodo, filtroMes, filtroCampo, dataHoje) && !estaEmAberto(p.status)
  ).length
  const abertosForaPeriodo = pedidosNaBusca.filter(
    (p) => !dentroDoPeriodo(p, filtroPeriodo, filtroMes, filtroCampo, dataHoje) && estaEmAberto(p.status)
  ).length

  // Contadores das Abas
  const contagemAbas = {
    todos: pedidosNoPeriodoEOuAbertos.length,
    rascunho: pedidosNoPeriodoEOuAbertos.filter((p) => p.status === 'rascunho').length,
    emitido: pedidosNoPeriodoEOuAbertos.filter((p) => p.status === 'emitido').length,
    recebido_parcial: pedidosNoPeriodoEOuAbertos.filter((p) => p.status === 'recebido_parcial').length,
    recebido: pedidosNoPeriodoEOuAbertos.filter((p) => p.status === 'recebido').length,
    cancelado: pedidosNoPeriodoEOuAbertos.filter((p) => p.status === 'cancelado').length,
  }

  // 3. Pedidos finais a exibir (filtrados pela aba selecionada)
  const pedidosExibidos = pedidosNoPeriodoEOuAbertos.filter((p) => {
    return filtroStatus === 'todos' || p.status === filtroStatus
  })

  // Verifica se há filtros ativos diferentes do padrão
  const temFiltrosAtivos =
    busca.trim() !== '' ||
    filtroStatus !== 'todos' ||
    filtroPeriodo !== 'mes' ||
    filtroMes !== dataHoje.slice(0, 7) ||
    filtroCampo !== 'emissao'

  const handleLimparFiltros = () => {
    setBusca('')
    setFiltroStatus('todos')
    setFiltroPeriodo('mes')
    setFiltroMes(dataHoje.slice(0, 7))
    setFiltroCampo('emissao')
  }

  const handleSalvarPedido = async () => {
    if (!formFornecedor.trim()) {
      alert('Informe o fornecedor.')
      return
    }
    if (formItens.length === 0) {
      alert('Adicione pelo menos 1 produto ao pedido.')
      return
    }
    if (formItens.some((i) => !i.produto_id || i.quantidade <= 0)) {
      alert('Verifique os produtos e quantidades selecionadas.')
      return
    }
    if (formParcelas <= 0) {
      alert('Selecione o número de parcelas.')
      return
    }

    try {
      if (pedidoEdicao) {
        // EDIÇÃO
        const pedidoAtualizado: PedidoCompra = {
          ...pedidoEdicao,
          fornecedor: formFornecedor,
          dataPrevistaEntrega: formDataEntrega || null,
          observacao: formObservacao || null,
          total: totalCalculado,
          numeroParcelas: formParcelas,
          itens: formItens,
        }
        await updatePedidoCompra(pedidoAtualizado)
      } else {
        // CRIAÇÃO (Novo Pedido nasce em Aberto / Rascunho)
        await savePedidoCompra({
          fornecedor: formFornecedor,
          status: 'rascunho',
          dataEmissao: new Date().toISOString().split('T')[0],
          dataPrevistaEntrega: formDataEntrega || null,
          observacao: formObservacao || null,
          total: totalCalculado,
          numeroParcelas: formParcelas,
          itens: formItens,
        })
      }

      await loadData()
      setIsModalCreateOpen(false)
    } catch (err) {
      alert('Erro ao salvar pedido.')
    }
  }

  const handleEmitirPedido = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Confirma emitir o Pedido #${pedido.numero}? Isso gerará o lançamento no Contas a Pagar.`)) {
      return
    }
    const res = await emitirPedidoCompra(pedido.id)
    if (!res.ok) {
      setMensagemErro(res.erro)
      return
    }
    await loadData()
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

  const handleVoltarParaAberto = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Confirma retornar o Pedido #${pedido.numero} para o status Aberto/Rascunho?`)) {
      return
    }
    const res = await voltarPedidoParaAberto(pedido.id)
    if (!res.ok) {
      setMensagemErro(res.erro)
      return
    }
    await loadData()
  }

  const handleCancelarPedido = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Confirma cancelar o Pedido #${pedido.numero}?`)) {
      return
    }
    const res = await cancelarPedidoCompra(pedido.id)
    if (!res.ok) {
      setMensagemErro(res.erro)
      return
    }
    await loadData()
  }

  const handleExcluirPedido = async (pedido: PedidoCompra) => {
    if (!window.confirm(`Tem certeza que deseja excluir o Pedido #${pedido.numero}? Esta ação não pode ser desfeita.`)) {
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
    <div style={{ padding: '24px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
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

      {/* ABAS DE STATUS COM CONTADORES DE BADGE */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '2px solid #E5E7EB',
          marginBottom: 16,
          overflowX: 'auto',
          paddingBottom: 2,
        }}
      >
        {ABAS_STATUS.map((aba) => {
          const selecionada = filtroStatus === aba.value
          const count = contagemAbas[aba.value]
          return (
            <button
              key={aba.value}
              onClick={() => setFiltroStatus(aba.value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                border: 'none',
                borderBottom: selecionada ? '2.5px solid #0D6BAF' : '2.5px solid transparent',
                background: 'transparent',
                color: selecionada ? '#0D6BAF' : '#6B7280',
                fontSize: 13,
                fontWeight: selecionada ? 800 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                marginBottom: '-2px',
              }}
            >
              {aba.label}
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 700,
                  background: selecionada ? '#EFF6FF' : '#F3F4F6',
                  color: selecionada ? '#0D6BAF' : '#6B7280',
                  border: `1px solid ${selecionada ? '#BFDBFE' : '#E5E7EB'}`,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* BARRA DE FILTROS E BUSCA EM UMA ÚNICA LINHA */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Campo de Busca */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
          />
          <input
            type="text"
            placeholder="Buscar por fornecedor, produto, nº ou observação..."
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

        {/* Tipo de Período */}
        <select
          value={filtroPeriodo}
          onChange={(e) => setFiltroPeriodo(e.target.value as any)}
          style={{
            padding: '9px 12px',
            borderRadius: 10,
            border: '1.5px solid #E5E7EB',
            background: '#FFFFFF',
            fontSize: 13,
            fontWeight: 700,
            color: '#374151',
            cursor: 'pointer',
            outline: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <option value="mes">Mês</option>
          <option value="ultimos_90_dias">Últimos 90 dias</option>
          <option value="ano">Este ano</option>
          <option value="todo">Todo o período</option>
        </select>

        {/* Controles do Mês (Setas Visíveis + Dropdown de 13 Meses) */}
        {filtroPeriodo === 'mes' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <button
              type="button"
              title="Mês anterior"
              onClick={() => setFiltroMes(mesAdjacente(filtroMes, -1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                color: '#0F172A',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={18} strokeWidth={2.5} color="#0F172A" />
            </button>

            <select
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid #CBD5E1',
                background: '#FFFFFF',
                fontSize: 13,
                fontWeight: 700,
                color: '#0D6BAF',
                cursor: 'pointer',
                outline: 'none',
                minWidth: 160,
              }}
            >
              {opcoesMeses.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              title="Próximo mês"
              onClick={() => setFiltroMes(mesAdjacente(filtroMes, 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                color: '#0F172A',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ChevronRight size={18} strokeWidth={2.5} color="#0F172A" />
            </button>
          </div>
        )}

        {/* Data de Referência do Filtro */}
        <select
          value={filtroCampo}
          onChange={(e) => setFiltroCampo(e.target.value as any)}
          style={{
            padding: '9px 12px',
            borderRadius: 10,
            border: '1.5px solid #E5E7EB',
            background: '#FFFFFF',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            cursor: 'pointer',
            outline: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <option value="emissao">Por Emissão</option>
          <option value="previsaoEntrega">Por Prev. Entrega</option>
        </select>

        {/* Botão Limpar Filtros */}
        {temFiltrosAtivos && (
          <button
            onClick={handleLimparFiltros}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: '#DC2626',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
              whiteSpace: 'nowrap',
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* AVISO DE PEDIDOS FORA DO PERÍODO */}
      {(abertosForaPeriodo > 0 || ocultosForaPeriodo > 0) && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 10,
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: '#1E40AF',
          }}
        >
          <Info size={16} color="#2563EB" style={{ flexShrink: 0 }} />
          <div>
            {abertosForaPeriodo > 0 && (
              <span>
                <strong>{abertosForaPeriodo}</strong> {abertosForaPeriodo === 1 ? 'pedido em aberto de outro período aparece mesmo assim.' : 'pedidos em aberto de outros períodos aparecem mesmo assim.'}{' '}
              </span>
            )}
            {ocultosForaPeriodo > 0 && (
              <span>
                {ocultosForaPeriodo} {ocultosForaPeriodo === 1 ? 'pedido encerrado fora do período está oculto.' : 'pedidos encerrados fora do período estão ocultos.'}{' '}
              </span>
            )}
            {filtroPeriodo !== 'todo' && (
              <button
                onClick={() => setFiltroPeriodo('todo')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#1D4ED8',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  marginLeft: 4,
                }}
              >
                Ver todo o período
              </button>
            )}
          </div>
        </div>
      )}

      {/* TABELA DE PEDIDOS DE COMPRA */}
      {pedidosExibidos.length === 0 ? (
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
            Tente ajustar a busca, alterar o período ou criar um novo pedido.
          </p>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 820 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1.5px solid #E5E7EB' }}>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '130px' }}>
                  Nº
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Fornecedor
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '100px' }}>
                  Emissão
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '140px' }}>
                  Prev. Entrega
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '120px' }}>
                  Total
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '120px' }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '160px', textAlign: 'right' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {pedidosExibidos.map((pedido, idx) => {
                const atrasado = estaAtrasado(pedido, dataHoje)
                const diasAtraso = atrasado ? diasDeAtraso(pedido, dataHoje) : 0

                return (
                  <tr
                    key={pedido.id}
                    style={{
                      borderBottom: idx < pedidosExibidos.length - 1 ? '1px solid #F3F4F6' : 'none',
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
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>
                      {pedido.fornecedor}
                      {pedido.observacao && (
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B7280', marginTop: 2 }}>
                          {pedido.observacao}
                        </span>
                      )}
                    </td>

                    {/* Emissão */}
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {formatarData(pedido.dataEmissao)}
                    </td>

                    {/* Prev. Entrega com Alerta de Atraso */}
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {formatarData(pedido.dataPrevistaEntrega)}
                      {atrasado && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            marginLeft: 6,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#FEF2F2',
                            color: '#DC2626',
                            fontSize: 11,
                            fontWeight: 800,
                            border: '1px solid #FECACA',
                          }}
                          title={`Entrega prevista para ${formatarData(pedido.dataPrevistaEntrega)}`}
                        >
                          <AlertTriangle size={11} />
                          {diasAtraso}d atrasado
                        </span>
                      )}
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

                    {/* Ações com ícones e regras de negócio */}
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

                        {/* RASCUNHO / ABERTO: Emitir pedido */}
                        {pedido.status === 'rascunho' && (
                          <button
                            onClick={() => handleEmitirPedido(pedido)}
                            title="Emitir pedido (Gerar financeiro)"
                            style={{
                              padding: '6px',
                              borderRadius: 6,
                              border: '1px solid #2563EB',
                              background: '#EFF6FF',
                              color: '#2563EB',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Package size={14} />
                          </button>
                        )}

                        {/* EMITIDO ou REC. PARCIAL: Receber no estoque */}
                        {(pedido.status === 'emitido' || pedido.status === 'recebido_parcial') && (
                          <button
                            onClick={() => handleReceberPedido(pedido)}
                            title="Receber (Dar entrada no estoque)"
                            style={{
                              padding: '6px',
                              borderRadius: 6,
                              border: '1px solid #16A34A',
                              background: '#F0FDF4',
                              color: '#16A34A',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Package size={14} />
                          </button>
                        )}

                        {/* VOLTAR PARA ABERTO (Para pedidos emitidos, recebidos ou cancelados) */}
                        {(pedido.status === 'emitido' || pedido.status === 'recebido' || pedido.status === 'recebido_parcial' || pedido.status === 'cancelado') && (
                          <button
                            onClick={() => handleVoltarParaAberto(pedido)}
                            title="Voltar para Aberto (Rascunho)"
                            style={{
                              padding: '6px',
                              borderRadius: 6,
                              border: '1px solid #D97706',
                              background: '#FFFBEB',
                              color: '#D97706',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}

                        {/* CANCELAR PEDIDO (Quando emitido ou recebido) */}
                        {(pedido.status === 'emitido' || pedido.status === 'rascunho') && (
                          <button
                            onClick={() => handleCancelarPedido(pedido)}
                            title="Cancelar pedido"
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
                            <XCircle size={14} />
                          </button>
                        )}

                        {/* EXCLUIR SOMENTE QUANDO ESTIVER ABERTO (RASCUNHO) */}
                        {pedido.status === 'rascunho' && (
                          <button
                            onClick={() => handleExcluirPedido(pedido)}
                            title="Excluir pedido definitivamente"
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
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL CRIAR / EDITAR PEDIDO */}
      {isModalCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 800, color: '#111827' }}>
              {pedidoEdicao ? `Editar Pedido #${pedidoEdicao.numero}` : 'Novo Pedido de Compra'}
            </h2>

            {/* Aviso de Edição Restrita caso o pedido já esteja emitido / recebido */}
            {pedidoEdicao && !podeEditarCampo(pedidoEdicao.status, 'itens') && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                {pedidoEdicao.status === 'recebido'
                  ? 'Pedido recebido: apenas a observação pode ser alterada.'
                  : 'Pedido emitido: itens e valores financeiros estão travados. Você pode alterar a previsão de entrega e a observação.'}
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4, marginBottom: 20 }}>
              {/* Fornecedor */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Fornecedor *</label>
                <input
                  type="text"
                  list="fornecedores-list"
                  value={formFornecedor}
                  onChange={(e) => setFormFornecedor(e.target.value)}
                  disabled={!podeEditarCampo(pedidoEdicao?.status, 'fornecedor')}
                  placeholder="Digite ou selecione o fornecedor (Nome Fantasia)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1.5px solid #D1D5DB',
                    fontSize: 14,
                    boxSizing: 'border-box',
                    background: podeEditarCampo(pedidoEdicao?.status, 'fornecedor') ? '#FFFFFF' : '#F3F4F6',
                  }}
                />
                <datalist id="fornecedores-list">
                  {fornecedoresCadastrados.map((f) => (
                    <option key={f.id} value={f.trade_name}>
                      {f.legal_name ? `${f.trade_name} (${f.legal_name})` : f.trade_name}
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Lista de Produtos / Itens */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Produtos do Pedido *</label>
                  {podeEditarCampo(pedidoEdicao?.status, 'itens') && (
                    <button
                      type="button"
                      onClick={handleAdicionarItem}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 10px',
                        borderRadius: 6,
                        background: '#EFF6FF',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} /> Adicionar Item
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {formItens.map((item, idx) => {
                    const prodCadastrado = produtosDisponiveis.find((p) => p.id === item.produto_id)
                    const avisoCustoItem = avisoDeCusto(item.preco_unitario, prodCadastrado?.cost_price)

                    return (
                      <div
                        key={idx}
                        style={{
                          background: '#F9FAFB',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #E5E7EB',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 75px 95px 95px 32px',
                            gap: 8,
                            alignItems: 'center',
                          }}
                        >
                          {/* Seleção do Produto */}
                          <div>
                            <select
                              value={item.produto_id}
                              disabled={!podeEditarCampo(pedidoEdicao?.status, 'itens')}
                              onChange={(e) => handleItemProdutoChange(idx, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px 8px',
                                borderRadius: 6,
                                border: '1px solid #D1D5DB',
                                fontSize: 13,
                                backgroundColor: podeEditarCampo(pedidoEdicao?.status, 'itens') ? '#fff' : '#F3F4F6',
                                boxSizing: 'border-box',
                              }}
                            >
                              <option value="">Selecione um produto</option>
                              {produtosDisponiveis.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantidade */}
                          <div>
                            <input
                              type="number"
                              min="1"
                              value={item.quantidade}
                              disabled={!podeEditarCampo(pedidoEdicao?.status, 'itens')}
                              onChange={(e) => handleItemQuantidadeChange(idx, Number(e.target.value))}
                              placeholder="Qtd"
                              style={{
                                width: '100%',
                                padding: '8px 6px',
                                borderRadius: 6,
                                border: '1px solid #D1D5DB',
                                fontSize: 13,
                                boxSizing: 'border-box',
                                textAlign: 'center',
                                background: podeEditarCampo(pedidoEdicao?.status, 'itens') ? '#fff' : '#F3F4F6',
                              }}
                            />
                          </div>

                          {/* Preço Unitário */}
                          <div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.preco_unitario}
                              disabled={!podeEditarCampo(pedidoEdicao?.status, 'itens')}
                              onChange={(e) => handleItemPrecoChange(idx, Number(e.target.value))}
                              placeholder="Preço Unit."
                              style={{
                                width: '100%',
                                padding: '8px 6px',
                                borderRadius: 6,
                                border: '1px solid #D1D5DB',
                                fontSize: 13,
                                boxSizing: 'border-box',
                                textAlign: 'right',
                                background: podeEditarCampo(pedidoEdicao?.status, 'itens') ? '#fff' : '#F3F4F6',
                              }}
                            />
                          </div>

                          {/* Subtotal */}
                          <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
                            {formatarMoeda(item.total)}
                          </div>

                          {/* Botão Remover */}
                          <div>
                            <button
                              type="button"
                              onClick={() => handleRemoverItem(idx)}
                              disabled={!podeEditarCampo(pedidoEdicao?.status, 'itens') || formItens.length <= 1}
                              title="Remover item"
                              style={{
                                padding: '6px',
                                borderRadius: 6,
                                border: formItens.length <= 1 || !podeEditarCampo(pedidoEdicao?.status, 'itens') ? '1px solid #E5E7EB' : '1px solid #FECACA',
                                background: formItens.length <= 1 || !podeEditarCampo(pedidoEdicao?.status, 'itens') ? '#F3F4F6' : '#FEF2F2',
                                color: formItens.length <= 1 || !podeEditarCampo(pedidoEdicao?.status, 'itens') ? '#9CA3AF' : '#DC2626',
                                cursor: formItens.length <= 1 || !podeEditarCampo(pedidoEdicao?.status, 'itens') ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <XCircle size={14} />
                            </button>
                          </div>
                        </div>

                        {/* AVISO DE VARIAÇÃO DE CUSTO (> 20%) */}
                        {avisoCustoItem && (
                          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={12} color="#D97706" />
                            {avisoCustoItem.mensagem}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Parcelas e Previsão */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Nº de Parcelas *</label>
                  <select
                    value={formParcelas}
                    disabled={!podeEditarCampo(pedidoEdicao?.status, 'parcelas')}
                    onChange={(e) => setFormParcelas(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #D1D5DB',
                      fontSize: 14,
                      backgroundColor: podeEditarCampo(pedidoEdicao?.status, 'parcelas') ? '#fff' : '#F3F4F6',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value={1}>À vista (1x)</option>
                    <option value={2}>2x</option>
                    <option value={3}>3x</option>
                    <option value={4}>4x</option>
                    <option value={5}>5x</option>
                    <option value={6}>6x</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Previsão de Entrega</label>
                  <div style={{ position: 'relative' }}>
                    <Calendar size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                    <input
                      type="date"
                      value={formDataEntrega}
                      disabled={!podeEditarCampo(pedidoEdicao?.status, 'previsao')}
                      onChange={(e) => setFormDataEntrega(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        borderRadius: 8,
                        border: '1.5px solid #D1D5DB',
                        fontSize: 14,
                        boxSizing: 'border-box',
                        background: podeEditarCampo(pedidoEdicao?.status, 'previsao') ? '#FFFFFF' : '#F3F4F6',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Observação */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Observação</label>
                <textarea
                  value={formObservacao}
                  disabled={!podeEditarCampo(pedidoEdicao?.status, 'observacao')}
                  onChange={(e) => setFormObservacao(e.target.value)}
                  placeholder="Observações do pedido..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1.5px solid #D1D5DB',
                    fontSize: 14,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    background: podeEditarCampo(pedidoEdicao?.status, 'observacao') ? '#FFFFFF' : '#F3F4F6',
                  }}
                />
              </div>
              
              {/* Total Estimado Card */}
              <div style={{ padding: '12px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#4B5563', fontWeight: 600 }}>
                  Total Estimado ({formItens.length} {formItens.length === 1 ? 'item' : 'itens'}):
                </span>
                <strong style={{ fontSize: 16, color: '#111827', fontWeight: 900 }}>
                  {formatarMoeda(totalCalculado)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
              <button
                onClick={() => setIsModalCreateOpen(false)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              {podeEditarCampo(pedidoEdicao?.status, 'observacao') && (
                <button
                  onClick={handleSalvarPedido}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0D6BAF', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  {pedidoEdicao ? 'Salvar Alterações' : 'Salvar Pedido (Aberto)'}
                </button>
              )}
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
