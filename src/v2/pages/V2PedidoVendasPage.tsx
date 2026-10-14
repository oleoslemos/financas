import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardList,
  Edit3,
  Search,
  Eye,
  CheckCircle,
  Truck,
  RotateCcw,
  XCircle,
  Plus,
  Scale,
  Printer,
  MessageCircle,
  DollarSign,
  Package,
  Calendar,
  User,
  ShoppingBag,
  CreditCard,
  FileSpreadsheet,
  Trash2,
  X,
  Sparkles,
} from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData, hoje, somarDias } from '../../modules/lib/datas'
import {
  listPedidosVenda,
  savePedidoVenda,
  updatePedidoVenda,
  aprovarPedidoVenda,
  faturarPedidoVenda,
  entregarPedidoVenda,
  cancelarPedidoVenda,
  voltarPedidoVendaStatus,
  PedidoVenda,
  PedidoVendaItem,
  StatusVenda,
  CanalVenda,
} from '../services/v2PedidoVendasService'
import { listV2Products, V2Product } from '../services/v2ProdutosService'
import { listPriceTables, V2PriceTable } from '../services/v2TabelaPrecoService'
import { listContasBancarias, ContaBancaria } from '../services/v2ContasBancariasService'
import { V2OrcamentosComparisonModal } from '../components/V2OrcamentosComparisonModal'
import { buildWhatsappUrlWithText } from '../../lib/whatsapp'

const FORMAS_PAGAMENTO: string[] = [
  'Dinheiro',
  'Pix',
  'Cartão Débito',
  'Cartão Crédito',
  'Boleto',
  'Crediário',
]

const ABAS_STATUS: { value: 'todos' | StatusVenda; label: string }[] = [
  { value: 'todos', label: 'TODOS' },
  { value: 'proposta', label: 'ORÇAMENTOS / PROPOSTAS' },
  { value: 'aprovado', label: 'APROVADOS' },
  { value: 'faturado', label: 'FATURADOS' },
  { value: 'entregue', label: 'ENTREGUES' },
  { value: 'cancelado', label: 'CANCELADOS' },
]

const MESES_LISTA = [
  { num: '01', short: 'JAN' },
  { num: '02', short: 'FEV' },
  { num: '03', short: 'MAR' },
  { num: '04', short: 'ABR' },
  { num: '05', short: 'MAI' },
  { num: '06', short: 'JUN' },
  { num: '07', short: 'JUL' },
  { num: '08', short: 'AGO' },
  { num: '09', short: 'SET' },
  { num: '10', short: 'OUT' },
  { num: '11', short: 'NOV' },
  { num: '12', short: 'DEZ' },
]

export function V2PedidoVendasPage() {
  const dataHoje = hoje()

  // State: View Mode ('lista' | 'formulario')
  const [viewMode, setViewMode] = useState<'lista' | 'formulario'>('lista')

  // State: Filter and Search
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusVenda>('todos')
  const [filtroAno, setFiltroAno] = useState<number>(() => Number(dataHoje.slice(0, 4)) || 2026)
  const [filtroMesNum, setFiltroMesNum] = useState<string>(() => dataHoje.slice(5, 7) || '10')

  // State: Data
  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<V2Product[]>([])
  const [tabelasPreco, setTabelasPreco] = useState<V2PriceTable[]>([])
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)

  // State: Comparison Modal
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false)
  const [selectedPropostaIds, setSelectedPropostaIds] = useState<string[]>([])
  const [compareAId, setCompareAId] = useState<string | null>(null)
  const [compareBId, setCompareBId] = useState<string | null>(null)

  // State: Detail / Print / WhatsApp View Modal
  const [visualizandoPedido, setVisualizandoPedido] = useState<PedidoVenda | null>(null)

  // State: Form (Novo / Edição)
  const [pedidoEdicao, setPedidoEdicao] = useState<PedidoVenda | null>(null)
  const [formCanal, setFormCanal] = useState<CanalVenda>('distribuicao')
  const [formClienteNome, setFormClienteNome] = useState('')
  const [formClienteDocumento, setFormClienteDocumento] = useState('')
  const [formClienteCidade, setFormClienteCidade] = useState('')
  const [formTabelaPrecoNome, setFormTabelaPrecoNome] = useState('')
  const [formDataEntrega, setFormDataEntrega] = useState(() => somarDias(dataHoje, 10))
  const [formFormaPagamento, setFormFormaPagamento] = useState('Boleto')
  const [formNumeroParcelas, setFormNumeroParcelas] = useState(1)
  const [formContaEntradaTag, setFormContaEntradaTag] = useState('')
  const [formObservacao, setFormObservacao] = useState('')
  const [formItens, setFormItens] = useState<PedidoVendaItem[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [p, prods, tbls, ctas] = await Promise.all([
        listPedidosVenda(),
        listV2Products(),
        listPriceTables(),
        listContasBancarias(),
      ])
      setPedidos(p)
      setProdutosDisponiveis(prods.filter((pr) => pr.active))
      setTabelasPreco(tbls.filter((t) => t.active))
      setContasBancarias(ctas.filter((c) => c.ativo))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Propostas disponíveis para comparação
  const propostasDisponiveis = useMemo(() => {
    return pedidos.filter((p) => p.status === 'proposta' || p.status === 'aprovado')
  }, [pedidos])

  // Filter and Search logic
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((p) => {
      // Filtro de status
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false

      // Filtro de ano e mês (baseado na data de emissão)
      if (p.dataEmissao) {
        const anoPed = p.dataEmissao.slice(0, 4)
        const mesPed = p.dataEmissao.slice(5, 7)
        if (Number(anoPed) !== filtroAno) return false
        if (mesPed !== filtroMesNum) return false
      }

      // Busca textual
      if (busca.trim()) {
        const q = busca.toLowerCase()
        const matchNum = p.numero.toLowerCase().includes(q)
        const matchCli = p.cliente_nome.toLowerCase().includes(q)
        const matchCid = (p.cliente_cidade || '').toLowerCase().includes(q)
        const matchDoc = (p.cliente_documento || '').toLowerCase().includes(q)
        const matchObs = (p.observacao || '').toLowerCase().includes(q)
        if (!matchNum && !matchCli && !matchCid && !matchDoc && !matchObs) return false
      }

      return true
    })
  }, [pedidos, filtroStatus, filtroAno, filtroMesNum, busca])

  // Contagem para as abas
  const contagemAbas = useMemo(() => {
    const counts: Record<string, number> = {
      todos: 0,
      proposta: 0,
      aprovado: 0,
      faturado: 0,
      entregue: 0,
      cancelado: 0,
    }
    for (const p of pedidos) {
      if (p.dataEmissao) {
        const anoPed = p.dataEmissao.slice(0, 4)
        const mesPed = p.dataEmissao.slice(5, 7)
        if (Number(anoPed) !== filtroAno || mesPed !== filtroMesNum) continue
      }
      counts.todos = (counts.todos || 0) + 1
      if (counts[p.status] !== undefined) {
        counts[p.status] += 1
      }
    }
    return counts
  }, [pedidos, filtroAno, filtroMesNum])

  // Métricas de Indicadores (KPIs)
  const kpis = useMemo(() => {
    let orcadoValor = 0
    let orcadoCount = 0
    let aprovadoValor = 0
    let aprovadoCount = 0
    let faturadoValor = 0
    let entregueCount = 0

    for (const p of pedidos) {
      if (p.dataEmissao) {
        const anoPed = p.dataEmissao.slice(0, 4)
        const mesPed = p.dataEmissao.slice(5, 7)
        if (Number(anoPed) !== filtroAno || mesPed !== filtroMesNum) continue
      }
      if (p.status === 'proposta') {
        orcadoValor += p.total
        orcadoCount++
      } else if (p.status === 'aprovado') {
        aprovadoValor += p.total
        aprovadoCount++
      } else if (p.status === 'faturado') {
        faturadoValor += p.total
      } else if (p.status === 'entregue') {
        faturadoValor += p.total
        entregueCount++
      }
    }

    return {
      orcadoValor,
      orcadoCount,
      aprovadoValor,
      aprovadoCount,
      faturadoValor,
      entregueCount,
    }
  }, [pedidos, filtroAno, filtroMesNum])

  // Toggle selection for comparison
  const handleToggleSelectProposta = (id: string) => {
    setSelectedPropostaIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      if (prev.length >= 2) {
        return [prev[1], id]
      }
      return [...prev, id]
    })
  }

  // Open comparison modal
  const handleOpenComparar = (idA?: string, idB?: string) => {
    if (idA) {
      setCompareAId(idA)
      setCompareBId(idB || (selectedPropostaIds.find((id) => id !== idA) ?? null))
    } else if (selectedPropostaIds.length >= 2) {
      setCompareAId(selectedPropostaIds[0])
      setCompareBId(selectedPropostaIds[1])
    } else if (selectedPropostaIds.length === 1) {
      setCompareAId(selectedPropostaIds[0])
      setCompareBId(null)
    } else {
      setCompareAId(null)
      setCompareBId(null)
    }
    setIsCompareModalOpen(true)
  }

  // Iniciar formulário de novo pedido / proposta
  const handleNovoPedido = () => {
    setPedidoEdicao(null)
    setFormCanal('distribuicao')
    setFormClienteNome('')
    setFormClienteDocumento('')
    setFormClienteCidade('')
    setFormTabelaPrecoNome(tabelasPreco[0]?.name || 'Tabela Padrão Distribuidor')
    setFormDataEntrega(somarDias(dataHoje, 10))
    setFormFormaPagamento('Boleto')
    setFormNumeroParcelas(1)
    setFormContaEntradaTag(contasBancarias[0]?.nome ? `#${contasBancarias[0].nome}` : '#Inter')
    setFormObservacao('')
    setFormItens([
      {
        produto_id: '',
        produto_nome: '',
        quantidade: 1,
        preco_tabela: 0,
        preco_unitario: 0,
        desconto_percentual: 0,
        total: 0,
      },
    ])
    setViewMode('formulario')
  }

  // Iniciar edição
  const handleEditarPedido = (pedido: PedidoVenda) => {
    setPedidoEdicao(pedido)
    setFormCanal(pedido.canal)
    setFormClienteNome(pedido.cliente_nome)
    setFormClienteDocumento(pedido.cliente_documento || '')
    setFormClienteCidade(pedido.cliente_cidade || '')
    setFormTabelaPrecoNome(pedido.tabela_preco_nome || '')
    setFormDataEntrega(pedido.dataPrevistaEntrega || somarDias(dataHoje, 10))
    setFormFormaPagamento(pedido.formaPagamento)
    setFormNumeroParcelas(pedido.numeroParcelas || 1)
    setFormContaEntradaTag(pedido.contaEntradaTag || '')
    setFormObservacao(pedido.observacao || '')
    setFormItens(
      pedido.itens.length > 0
        ? pedido.itens.map((it) => ({ ...it }))
        : [
            {
              produto_id: '',
              produto_nome: '',
              quantidade: 1,
              preco_tabela: 0,
              preco_unitario: 0,
              desconto_percentual: 0,
              total: 0,
            },
          ]
    )
    setViewMode('formulario')
  }

  // Ações de fluxo de status
  const handleAprovar = async (id: string) => {
    if (!confirm('Deseja aprovar esta proposta e torná-la um Pedido de Venda oficial?')) return
    const res = await aprovarPedidoVenda(id)
    if (res.ok) {
      await loadData()
      setIsCompareModalOpen(false)
    } else {
      alert(res.erro)
    }
  }

  const handleFaturar = async (id: string) => {
    if (!confirm('Deseja faturar esta venda? Isso criará as contas a receber no módulo Financeiro.')) return
    const res = await faturarPedidoVenda(id)
    if (res.ok) {
      await loadData()
    } else {
      alert(res.erro)
    }
  }

  const handleEntregar = async (id: string) => {
    if (!confirm('Confirmar entrega desta venda ao cliente?')) return
    const res = await entregarPedidoVenda(id)
    if (res.ok) {
      await loadData()
    } else {
      alert(res.erro)
    }
  }

  const handleCancelar = async (id: string) => {
    if (!confirm('Deseja cancelar esta proposta / venda?')) return
    const res = await cancelarPedidoVenda(id)
    if (res.ok) {
      await loadData()
    } else {
      alert(res.erro)
    }
  }

  const handleReabrir = async (id: string) => {
    if (!confirm('Deseja reabrir esta venda para o status Proposta?')) return
    const res = await voltarPedidoVendaStatus(id, 'proposta')
    if (res.ok) {
      await loadData()
    } else {
      alert(res.erro)
    }
  }

  // Manipulação de Itens no Formulário
  const handleAddItem = () => {
    setFormItens((prev) => [
      ...prev,
      {
        produto_id: '',
        produto_nome: '',
        quantidade: 1,
        preco_tabela: 0,
        preco_unitario: 0,
        desconto_percentual: 0,
        total: 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (formItens.length === 1) return
    setFormItens((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleSelectProduct = (index: number, produtoId: string) => {
    const prod = produtosDisponiveis.find((p) => p.id === produtoId)
    setFormItens((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it
        const preco = prod ? prod.sale_price || 0 : 0
        const total = preco * (it.quantidade || 1)
        return {
          ...it,
          produto_id: produtoId,
          produto_nome: prod ? prod.name : '',
          preco_tabela: preco,
          preco_unitario: preco,
          desconto_percentual: 0,
          total,
        }
      })
    )
  }

  const handleItemChange = (index: number, field: 'quantidade' | 'preco_unitario' | 'desconto_percentual', value: number) => {
    setFormItens((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it
        const atual = { ...it, [field]: value }
        const qtd = atual.quantidade || 1
        const preco = atual.preco_unitario || 0
        const desc = atual.desconto_percentual || 0
        const totalItem = Math.max(0, qtd * preco * (1 - desc / 100))
        return {
          ...atual,
          total: Math.round(totalItem * 100) / 100,
        }
      })
    )
  }

  // Totais do Formulário
  const subtotalForm = useMemo(() => {
    return formItens.reduce((acc, it) => acc + (it.quantidade || 0) * (it.preco_unitario || 0), 0)
  }, [formItens])

  const totalForm = useMemo(() => {
    return formItens.reduce((acc, it) => acc + (it.total || 0), 0)
  }, [formItens])

  const descontoTotalForm = Math.max(0, subtotalForm - totalForm)

  // Salvar Formulário
  const handleSalvarVenda = async (statusFinal: StatusVenda) => {
    if (!formClienteNome.trim()) {
      alert('Informe o nome do cliente.')
      return
    }
    const itensValidos = formItens.filter((it) => it.produto_nome.trim() && it.quantidade > 0)
    if (itensValidos.length === 0) {
      alert('Adicione pelo menos um produto com quantidade maior que zero.')
      return
    }

    if (pedidoEdicao) {
      await updatePedidoVenda({
        ...pedidoEdicao,
        canal: formCanal,
        status: statusFinal,
        cliente_nome: formClienteNome.trim(),
        cliente_documento: formClienteDocumento.trim() || undefined,
        cliente_cidade: formClienteCidade.trim() || undefined,
        tabela_preco_nome: formTabelaPrecoNome,
        dataPrevistaEntrega: formDataEntrega || null,
        formaPagamento: formFormaPagamento,
        numeroParcelas: Math.max(1, formNumeroParcelas),
        contaEntradaTag: formContaEntradaTag,
        observacao: formObservacao.trim() || null,
        subtotal: subtotalForm,
        descontoTotal: descontoTotalForm,
        total: totalForm,
        itens: itensValidos,
      })
    } else {
      await savePedidoVenda({
        canal: formCanal,
        status: statusFinal,
        cliente_nome: formClienteNome.trim(),
        cliente_documento: formClienteDocumento.trim() || undefined,
        cliente_cidade: formClienteCidade.trim() || undefined,
        tabela_preco_nome: formTabelaPrecoNome,
        dataEmissao: dataHoje,
        dataPrevistaEntrega: formDataEntrega || null,
        formaPagamento: formFormaPagamento,
        numeroParcelas: Math.max(1, formNumeroParcelas),
        contaEntradaTag: formContaEntradaTag,
        observacao: formObservacao.trim() || null,
        subtotal: subtotalForm,
        descontoTotal: descontoTotalForm,
        total: totalForm,
        itens: itensValidos,
      })
    }

    await loadData()
    setViewMode('lista')
  }

  // Status Badge Helper
  const renderStatusBadge = (status: StatusVenda) => {
    switch (status) {
      case 'proposta':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Orçamento / Proposta
          </span>
        )
      case 'aprovado':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Aprovado
          </span>
        )
      case 'faturado':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 border border-purple-200">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            Faturado
          </span>
        )
      case 'entregue':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Entregue
          </span>
        )
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Cancelado
          </span>
        )
      default:
        return null
    }
  }

  // Se estiver no modo Formulário:
  if (viewMode === 'formulario') {
    return (
      <div className="space-y-6 pb-12 animate-in fade-in duration-200">
        {/* Voltar */}
        <div>
          <button
            type="button"
            onClick={() => setViewMode('lista')}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 hover:text-sky-900 transition-colors"
          >
            ← Voltar para a lista de vendas
          </button>
        </div>

        {/* Título */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {pedidoEdicao ? `Editar Pedido #${pedidoEdicao.numero}` : 'Novo Pedido de Venda / Orçamento'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Defina os produtos, condições de pagamento e salve como Proposta Comercial (Orçamento) ou Pedido Aprovado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSalvarVenda('proposta')}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-sm hover:bg-amber-100 active:scale-95 transition-all"
            >
              Salvar como Orçamento (Proposta)
            </button>
            <button
              type="button"
              onClick={() => handleSalvarVenda('aprovado')}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all"
            >
              Salvar como Pedido Aprovado
            </button>
          </div>
        </div>

        {/* Grid de Edição */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1 & 2: Cliente e Produtos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: Cliente e Canal */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <User size={18} className="text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  1. Dados do Cliente e Canal Comercial
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Nome do Cliente *</label>
                  <input
                    type="text"
                    value={formClienteNome}
                    onChange={(e) => setFormClienteNome(e.target.value)}
                    placeholder="Ex: Maria Aparecida Santos ou Clínica..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Canal de Venda</label>
                  <select
                    value={formCanal}
                    onChange={(e) => setFormCanal(e.target.value as CanalVenda)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="distribuicao">Distribuição</option>
                    <option value="representacao">Representação</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">CPF / CNPJ</label>
                  <input
                    type="text"
                    value={formClienteDocumento}
                    onChange={(e) => setFormClienteDocumento(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Cidade / UF</label>
                  <input
                    type="text"
                    value={formClienteCidade}
                    onChange={(e) => setFormClienteCidade(e.target.value)}
                    placeholder="Ex: Chapecó/SC"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Tabela de Preço</label>
                  <select
                    value={formTabelaPrecoNome}
                    onChange={(e) => setFormTabelaPrecoNome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  >
                    {tabelasPreco.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                    {tabelasPreco.length === 0 && (
                      <option value="Tabela Padrão">Tabela Padrão</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Card 2: Itens do Pedido */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase">
                    2. Produtos e Itens da Proposta
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={14} /> Adicionar Produto
                </button>
              </div>

              <div className="space-y-3">
                {formItens.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 items-end"
                  >
                    <div className="md:col-span-5 space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400">Produto</label>
                      <select
                        value={item.produto_id}
                        onChange={(e) => handleSelectProduct(idx, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="">Selecione um produto do catálogo...</option>
                        {produtosDisponiveis.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {formatarMoeda(p.sale_price)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400">Qtd</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) => handleItemChange(idx, 'quantidade', Math.max(1, Number(e.target.value)))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 text-center outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400">Preço Unit. (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.preco_unitario}
                        onChange={(e) => handleItemChange(idx, 'preco_unitario', Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 text-right outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400">Total (R$)</label>
                      <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-900 text-right tabular-nums border border-slate-200">
                        {formatarMoeda(item.total)}
                      </div>
                    </div>

                    <div className="md:col-span-1 flex justify-center pb-1">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={formItens.length === 1}
                        title="Remover produto"
                        className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coluna 3: Condições de Pagamento e Resumo */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CreditCard size={18} className="text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  3. Condições de Pagamento
                </h3>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Forma de Pagamento</label>
                  <select
                    value={formFormaPagamento}
                    onChange={(e) => setFormFormaPagamento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500"
                  >
                    {FORMAS_PAGAMENTO.map((fp) => (
                      <option key={fp} value={fp}>
                        {fp}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Nº de Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    value={formNumeroParcelas}
                    onChange={(e) => setFormNumeroParcelas(Math.max(1, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                  />
                  {formNumeroParcelas > 1 && totalForm > 0 && (
                    <span className="text-[11px] text-slate-500 font-semibold block mt-1">
                      {formNumeroParcelas}x de {formatarMoeda(totalForm / formNumeroParcelas)}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Previsão de Entrega</label>
                  <input
                    type="date"
                    value={formDataEntrega}
                    onChange={(e) => setFormDataEntrega(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Observações / Notas</label>
                  <textarea
                    rows={3}
                    value={formObservacao}
                    onChange={(e) => setFormObservacao(e.target.value)}
                    placeholder="Instruções para entrega, observações comerciais..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Resumo Financeiro da Venda */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>Subtotal:</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatarMoeda(subtotalForm)}</span>
                </div>
                {descontoTotalForm > 0 && (
                  <div className="flex justify-between text-xs text-emerald-600 font-semibold">
                    <span>Desconto:</span>
                    <span className="tabular-nums">-{formatarMoeda(descontoTotalForm)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-2 border-t border-dashed border-slate-200">
                  <span className="uppercase tracking-wider">Total Final:</span>
                  <span className="text-xl font-black text-slate-950 tabular-nums">{formatarMoeda(totalForm)}</span>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => handleSalvarVenda('proposta')}
                  className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-sm hover:bg-amber-100 active:scale-95 transition-all text-center"
                >
                  Salvar como Orçamento (Proposta)
                </button>
                <button
                  type="button"
                  onClick={() => handleSalvarVenda('aprovado')}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all text-center"
                >
                  Salvar como Pedido Aprovado
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Modo Lista
  return (
    <div className="space-y-6 pb-16">
      {/* ── CABEÇALHO PRINCIPAL DA PÁGINA ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 shadow-sm">
              <ClipboardList size={22} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              PROPOSTAS & PEDIDOS DE VENDAS
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed">
            Gerencie orçamentos e pedidos de vendas por canais de distribuição e representação.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenComparar()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold tracking-wide text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-all duration-150 shadow-sm hover:scale-[1.02] active:scale-95"
          >
            <Scale size={18} />
            Comparar Orçamentos
            {selectedPropostaIds.length > 0 && (
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                {selectedPropostaIds.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleNovoPedido}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold tracking-wide text-white hover:bg-slate-800 transition-all duration-150 shadow-sm hover:scale-[1.02] active:scale-95"
          >
            <Plus size={18} strokeWidth={2.5} />
            NOVA VENDA / PROPOSTA
          </button>
        </div>
      </div>

      {/* ── CARDS DE KPIS ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Orçado / Propostas */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Em Negociação (Orçamentos)
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <FileSpreadsheet size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {formatarMoeda(kpis.orcadoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              {kpis.orcadoCount} {kpis.orcadoCount === 1 ? 'proposta aberta' : 'propostas abertas'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400" />
        </div>

        {/* KPI 2: Aprovados */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pedidos Aprovados
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {formatarMoeda(kpis.aprovadoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              {kpis.aprovadoCount} {kpis.aprovadoCount === 1 ? 'pedido pronto' : 'pedidos prontos'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* KPI 3: Faturamento Realizado */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Faturamento Concluído
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {formatarMoeda(kpis.faturadoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Integrado com contas a receber
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* KPI 4: Entregas */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Entregas Finalizadas
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Truck size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {kpis.entregueCount}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Entregas com sucesso no período
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500" />
        </div>
      </div>

      {/* ── CARD COM ABAS, SELEÇÃO DE ANO/MÊS E BUSCA ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
        {/* Abas Superiores */}
        <div className="flex gap-4 border-b border-slate-100 pb-3 overflow-x-auto">
          {ABAS_STATUS.map((aba) => {
            const isSelected = filtroStatus === aba.value
            const count = contagemAbas[aba.value] ?? 0

            return (
              <button
                key={aba.value}
                type="button"
                onClick={() => setFiltroStatus(aba.value)}
                className={`inline-flex items-center gap-2 pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
                  isSelected
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>{aba.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    isSelected ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Barra de Filtros: Ano + Meses + Busca */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de Ano */}
            <select
              value={filtroAno}
              onChange={(e) => setFiltroAno(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-500 shadow-sm cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>

            {/* Pílulas de Meses */}
            <div className="inline-flex items-center gap-1 overflow-x-auto">
              {MESES_LISTA.map((m) => {
                const isSelected = filtroMesNum === m.num
                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => setFiltroMesNum(m.num)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-sky-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m.short}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, documento ou nº..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs font-medium text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── TABELA DE VENDAS E PROPOSTAS ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Carregando pedidos...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700 min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="w-10 px-3 py-3.5 text-center text-xs font-bold tracking-wider text-slate-400 uppercase">
                    <span className="sr-only">Comparar</span>
                    <Scale size={14} className="mx-auto text-slate-400" />
                  </th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Nº Venda</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Data</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Canal</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Cliente</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Pagamento</th>
                  <th className="px-4 py-3.5 text-right font-bold tracking-wider text-slate-400 uppercase">Total</th>
                  <th className="px-4 py-3.5 text-right font-bold tracking-wider text-slate-400 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidosFiltrados.map((p) => {
                  const isChecked = selectedPropostaIds.includes(p.id)

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectProposta(p.id)}
                          title="Selecionar para comparar orçamentos"
                          aria-label={`Selecionar venda ${p.numero} para comparar`}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="px-4 py-4 font-bold text-slate-900 tabular-nums">
                        {p.numero}
                      </td>

                      <td className="px-4 py-4 font-medium text-slate-500">
                        {formatarData(p.dataEmissao)}
                      </td>

                      <td className="px-4 py-4">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                          {p.canal === 'distribuicao' ? 'Distribuição' : 'Representação'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 truncate max-w-[200px]">{p.cliente_nome}</span>
                          {p.cliente_cidade && (
                            <span className="text-[10px] text-slate-400 truncate">{p.cliente_cidade}</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {renderStatusBadge(p.status)}
                      </td>

                      <td className="px-4 py-4 font-medium text-slate-600">
                        <div className="flex flex-col">
                          <span>{p.formaPagamento}</span>
                          <span className="text-[10px] text-slate-400">
                            {p.numeroParcelas > 1 ? `${p.numeroParcelas} parcelas` : 'À vista'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right font-black text-slate-900 tabular-nums">
                        {formatarMoeda(p.total)}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Comparar Proposta */}
                          <button
                            type="button"
                            onClick={() => handleOpenComparar(p.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                            title="Comparar com outro orçamento"
                          >
                            <Scale size={15} />
                          </button>

                          {/* Visualizar / Imprimir / WhatsApp */}
                          <button
                            type="button"
                            onClick={() => setVisualizandoPedido(p)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Visualizar detalhes do pedido"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Aprovar Proposta -> Vira Pedido */}
                          {p.status === 'proposta' && (
                            <button
                              type="button"
                              onClick={() => void handleAprovar(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Aprovar proposta e criar pedido oficial"
                            >
                              <CheckCircle size={15} />
                            </button>
                          )}

                          {/* Faturar Pedido Aprovado */}
                          {p.status === 'aprovado' && (
                            <button
                              type="button"
                              onClick={() => void handleFaturar(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                              title="Faturar pedido (gerar contas a receber)"
                            >
                              <DollarSign size={15} />
                            </button>
                          )}

                          {/* Entregar Pedido Faturado */}
                          {p.status === 'faturado' && (
                            <button
                              type="button"
                              onClick={() => void handleEntregar(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Confirmar entrega ao cliente"
                            >
                              <Truck size={15} />
                            </button>
                          )}

                          {/* Editar */}
                          {(p.status === 'proposta' || p.status === 'aprovado') && (
                            <button
                              type="button"
                              onClick={() => handleEditarPedido(p)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                              title="Editar pedido"
                            >
                              <Edit3 size={15} />
                            </button>
                          )}

                          {/* Cancelar */}
                          {p.status !== 'cancelado' && p.status !== 'entregue' && (
                            <button
                              type="button"
                              onClick={() => void handleCancelar(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                              title="Cancelar venda / proposta"
                            >
                              <XCircle size={15} />
                            </button>
                          )}

                          {/* Reabrir Cancelado */}
                          {p.status === 'cancelado' && (
                            <button
                              type="button"
                              onClick={() => void handleReabrir(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                              title="Reabrir como proposta"
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {!loading && pedidosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <ClipboardList size={32} className="text-slate-300" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Nenhum pedido ou proposta encontrada neste filtro.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── BARRA FLUTUANTE DE SELEÇÃO PARA COMPARAÇÃO ── */}
      {selectedPropostaIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs">
              {selectedPropostaIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-800">
              {selectedPropostaIds.length === 1
                ? '1 orçamento selecionado (selecione mais 1 para comparar)'
                : '2 orçamentos selecionados para comparar'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenComparar()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
            >
              <Scale size={15} />
              Comparar Agora
            </button>
            <button
              type="button"
              onClick={() => setSelectedPropostaIds([])}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL DE COMPARAÇÃO DE ORÇAMENTOS V2 ── */}
      <V2OrcamentosComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        propostas={propostasDisponiveis}
        initialAId={compareAId}
        initialBId={compareBId}
        onAprovarProposta={handleAprovar}
      />

      {/* ── MODAL DE DETALHES / VISUALIZAÇÃO / WHATSAPP DO PEDIDO ── */}
      {visualizandoPedido && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-4">
              <div className="flex items-center gap-2">
                <ClipboardList size={20} className="text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Venda #{visualizandoPedido.numero}
                </h3>
                {renderStatusBadge(visualizandoPedido.status)}
              </div>
              <button
                type="button"
                onClick={() => setVisualizandoPedido(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                <div>
                  <span className="text-slate-400 font-semibold uppercase block">Cliente</span>
                  <span className="font-bold text-sm text-slate-900">{visualizandoPedido.cliente_nome}</span>
                  {visualizandoPedido.cliente_cidade && (
                    <span className="text-slate-500 block">{visualizandoPedido.cliente_cidade}</span>
                  )}
                  {visualizandoPedido.cliente_documento && (
                    <span className="text-slate-500 block">Doc: {visualizandoPedido.cliente_documento}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 font-semibold uppercase block">Condição de Pagamento</span>
                  <span className="font-bold text-slate-900">{visualizandoPedido.formaPagamento}</span>
                  <span className="text-slate-500 block">
                    {visualizandoPedido.numeroParcelas > 1
                      ? `${visualizandoPedido.numeroParcelas}x de ${formatarMoeda(
                          visualizandoPedido.total / visualizandoPedido.numeroParcelas
                        )}`
                      : 'À vista'}
                  </span>
                  <span className="text-slate-400 block mt-1">
                    Emissão: {formatarData(visualizandoPedido.dataEmissao)}
                  </span>
                </div>
              </div>

              {/* Tabela de Itens */}
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block mb-2">Produtos da Venda</span>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-center">Qtd</th>
                        <th className="px-3 py-2 text-right">Preço Unit.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visualizandoPedido.itens.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-semibold text-slate-800">{it.produto_nome}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{it.quantidade}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(it.preco_unitario)}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                            {formatarMoeda(it.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-100 font-bold text-slate-900">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right uppercase">Total:</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sm font-black">
                          {formatarMoeda(visualizandoPedido.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {visualizandoPedido.observacao && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <span className="text-slate-400 font-semibold uppercase block mb-1 text-[10px]">Observações</span>
                  <p className="text-slate-700 whitespace-pre-line">{visualizandoPedido.observacao}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `📋 *PEDIDO DE VENDA #${visualizandoPedido.numero}*
Cliente: ${visualizandoPedido.cliente_nome}
Total: ${formatarMoeda(visualizandoPedido.total)}
Condição: ${visualizandoPedido.formaPagamento} (${visualizandoPedido.numeroParcelas}x)`
                    const url =
                      buildWhatsappUrlWithText('', text) ||
                      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
                    window.open(url, '_blank')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
                >
                  <MessageCircle size={15} /> Enviar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
                >
                  <Printer size={15} /> Imprimir
                </button>
              </div>
              <button
                type="button"
                onClick={() => setVisualizandoPedido(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
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
