import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  User,
  ShoppingBag,
  CreditCard,
  FileSpreadsheet,
  Trash2,
  X,
  UserPlus,
  AlertTriangle,
  Info,
  Calendar,
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
import { fetchClients, createClient, BemAvivClient } from '../services/v2ClientesService'
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
  const [clientes, setClientes] = useState<BemAvivClient[]>([])
  const [loading, setLoading] = useState(true)

  // State: Seleção de Pedido na Lista para a Barra de Ações Rápidas (imagem 02)
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null)

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
  const [formClienteId, setFormClienteId] = useState<string | undefined>(undefined)
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

  // State: 3 Totais com descontos configuráveis
  const [formDesconto5xPercentual, setFormDesconto5xPercentual] = useState<number>(5)
  const [formDescontoVistaPercentual, setFormDescontoVistaPercentual] = useState<number>(10)
  const [formCondicaoSelecionada, setFormCondicaoSelecionada] = useState<'sem_desconto' | 'ate_5x' | 'a_vista'>('sem_desconto')

  // State: Autocomplete Cliente
  const [clienteBuscaTexto, setClienteBuscaTexto] = useState('')
  const [isClienteDropdownOpen, setIsClienteDropdownOpen] = useState(false)
  const clienteDropdownRef = useRef<HTMLDivElement>(null)

  // State: Modal Cadastro Rápido de Cliente
  const [isNovoClienteModalOpen, setIsNovoClienteModalOpen] = useState(false)
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteDataNasc, setNovoClienteDataNasc] = useState('')
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('')
  const [novoClienteCpf, setNovoClienteCpf] = useState('')
  const [novoClienteCidade, setNovoClienteCidade] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)
  const [erroCliente, setErroCliente] = useState<string | null>(null)

  // Carregar dados
  const loadData = async () => {
    setLoading(true)
    try {
      const [p, prods, tbls, ctas, clisRes] = await Promise.all([
        listPedidosVenda(),
        listV2Products(),
        listPriceTables(),
        listContasBancarias(),
        fetchClients(null),
      ])
      setPedidos(p)
      setProdutosDisponiveis(prods.filter((pr) => pr.active))
      setTabelasPreco(tbls.filter((t) => t.active))
      setContasBancarias(ctas.filter((c) => c.ativo))
      if (clisRes.data) {
        setClientes(clisRes.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Fechar dropdown de cliente ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        clienteDropdownRef.current &&
        !clienteDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClienteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Tabela de Preço Ativa no formulário
  const tabelaPrecoAtiva = useMemo(() => {
    if (!formTabelaPrecoNome) return null
    return (
      tabelasPreco.find((t) => t.name === formTabelaPrecoNome) ||
      tabelasPreco.find((t) => t.is_default) ||
      tabelasPreco[0] ||
      null
    )
  }, [tabelasPreco, formTabelaPrecoNome])

  // Pedido selecionado atualmente na lista
  const pedidoSelecionado = useMemo(() => {
    if (!selectedPedidoId) return null
    return pedidos.find((p) => p.id === selectedPedidoId) || null
  }, [pedidos, selectedPedidoId])

  // Propostas disponíveis para comparação
  const propostasDisponiveis = useMemo(() => {
    return pedidos.filter((p) => p.status === 'proposta' || p.status === 'aprovado')
  }, [pedidos])

  // Filtro de clientes para autocomplete
  const clientesFiltrados = useMemo(() => {
    if (!clienteBuscaTexto.trim()) return clientes.slice(0, 8)
    const termo = clienteBuscaTexto.toLowerCase().trim()
    return clientes
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(termo) ||
          (c.cpf && c.cpf.includes(termo)) ||
          (c.address_city && c.address_city.toLowerCase().includes(termo))
      )
      .slice(0, 10)
  }, [clientes, clienteBuscaTexto])

  // Filter and Search logic para a lista de vendas
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

  // Selecionar / Deselecionar proposta para comparar
  const handleToggleSelectProposta = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
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

  // Alternar seleção de linha de pedido para a barra de ações
  const handleSelectPedidoLinha = (id: string) => {
    if (selectedPedidoId === id) {
      setSelectedPedidoId(null)
    } else {
      setSelectedPedidoId(id)
    }
  }

  // Abrir modal de comparação
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

  // Helper para buscar preços da tabela de preços
  const getPrecosDoProduto = (prodId: string, tabelaNome?: string) => {
    const nomeTbl = tabelaNome || formTabelaPrecoNome
    const tbl = tabelasPreco.find((t) => t.name === nomeTbl) || tabelasPreco.find((t) => t.is_default) || tabelasPreco[0]
    const prod = produtosDisponiveis.find((p) => p.id === prodId)

    if (!prod) {
      return { precoFabrica: 0, precoVenda: 0, precoSugestao: 0 }
    }

    const itemTbl = tbl?.items?.find(
      (it) => it.product_id === prod.id || it.sku === prod.code_sku || it.product_name.toLowerCase() === prod.name.toLowerCase()
    )

    if (itemTbl) {
      const precoFabrica = Number(itemTbl.tabela_fabrica) || Number(prod.cost_price) || 0
      const precoVenda = Number(itemTbl.tabela_vendas_sul) || Number(prod.sale_price) || 0
      const precoSugestao = Number(itemTbl.sugestao_vendas) || precoVenda || Number(prod.sale_price) || 0
      return { precoFabrica, precoVenda, precoSugestao }
    }

    return {
      precoFabrica: Number(prod.cost_price) || 0,
      precoVenda: Number(prod.sale_price) || 0,
      precoSugestao: Number(prod.sale_price) || 0,
    }
  }

  // Iniciar formulário de novo pedido / proposta
  const handleNovoPedido = () => {
    setPedidoEdicao(null)
    setFormCanal('distribuicao')

    // 1. Tabela marcada como padrão (conforme requisito)
    const tabelaPadrao =
      tabelasPreco.find((t) => t.is_default && t.active) ||
      tabelasPreco.find((t) => t.is_default) ||
      tabelasPreco[0]

    const nomeTabelaPadrao = tabelaPadrao ? tabelaPadrao.name : 'Tabela Padrão Distribuidor'
    setFormTabelaPrecoNome(nomeTabelaPadrao)

    // Cliente
    setFormClienteId(undefined)
    setFormClienteNome('')
    setFormClienteDocumento('')
    setFormClienteCidade('')
    setClienteBuscaTexto('')

    // Condições
    setFormDataEntrega(somarDias(dataHoje, 10))
    setFormFormaPagamento('Boleto')
    setFormNumeroParcelas(1)
    setFormContaEntradaTag(contasBancarias[0]?.nome ? `#${contasBancarias[0].nome}` : '#Inter')
    setFormObservacao('')

    // Descontos das 3 condições padrão
    setFormDesconto5xPercentual(5)
    setFormDescontoVistaPercentual(10)
    setFormCondicaoSelecionada('sem_desconto')

    // Item inicial vazio
    setFormItens([
      {
        produto_id: '',
        produto_nome: '',
        quantidade: 1,
        preco_tabela: 0,
        preco_unitario: 0,
        preco_fabrica: 0,
        preco_venda_minimo: 0,
        desconto_percentual: 0,
        total: 0,
      },
    ])

    setViewMode('formulario')
  }

  // Iniciar edição de pedido existente
  const handleEditarPedido = (pedido: PedidoVenda) => {
    setPedidoEdicao(pedido)
    setFormCanal(pedido.canal)
    setFormClienteId(pedido.cliente_id)
    setFormClienteNome(pedido.cliente_nome)
    setClienteBuscaTexto(pedido.cliente_nome)
    setFormClienteDocumento(pedido.cliente_documento || '')
    setFormClienteCidade(pedido.cliente_cidade || '')
    setFormTabelaPrecoNome(pedido.tabela_preco_nome || tabelasPreco[0]?.name || '')
    setFormDataEntrega(pedido.dataPrevistaEntrega || somarDias(dataHoje, 10))
    setFormFormaPagamento(pedido.formaPagamento)
    setFormNumeroParcelas(pedido.numeroParcelas || 1)
    setFormContaEntradaTag(pedido.contaEntradaTag || '')
    setFormObservacao(pedido.observacao || '')

    // Carregar descontos
    setFormDesconto5xPercentual(pedido.desconto5xPercentual ?? 5)
    setFormDescontoVistaPercentual(pedido.descontoVistaPercentual ?? 10)
    setFormCondicaoSelecionada(pedido.condicaoSelecionada ?? 'sem_desconto')

    // Carregar itens com cálculo de preços
    const itensCarregados =
      pedido.itens.length > 0
        ? pedido.itens.map((it) => {
            const precos = getPrecosDoProduto(it.produto_id, pedido.tabela_preco_nome)
            return {
              ...it,
              preco_fabrica: it.preco_fabrica ?? precos.precoFabrica,
              preco_venda_minimo: it.preco_venda_minimo ?? precos.precoVenda,
              preco_tabela: it.preco_tabela || precos.precoSugestao,
            }
          })
        : [
            {
              produto_id: '',
              produto_nome: '',
              quantidade: 1,
              preco_tabela: 0,
              preco_unitario: 0,
              preco_fabrica: 0,
              preco_venda_minimo: 0,
              desconto_percentual: 0,
              total: 0,
            },
          ]

    setFormItens(itensCarregados)
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

  // Manipulação de Cliente no Formulário
  const handleSelectCliente = (cliente: BemAvivClient) => {
    setFormClienteId(cliente.id)
    setFormClienteNome(cliente.full_name)
    setClienteBuscaTexto(cliente.full_name)
    setFormClienteDocumento(cliente.cpf || '')
    const cidadeFormatada = [cliente.address_city, cliente.address_state]
      .filter(Boolean)
      .join('/')
    setFormClienteCidade(cidadeFormatada)
    setIsClienteDropdownOpen(false)
  }

  const handleAbrirCadastroRapidoCliente = () => {
    setNovoClienteNome(clienteBuscaTexto.trim())
    setNovoClienteDataNasc('')
    setNovoClienteTelefone('')
    setNovoClienteCpf('')
    setNovoClienteCidade('')
    setErroCliente(null)
    setIsClienteDropdownOpen(false)
    setIsNovoClienteModalOpen(true)
  }

  const handleSalvarNovoClienteRapido = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoClienteNome.trim()) {
      setErroCliente('O nome do cliente é obrigatório.')
      return
    }

    setSalvandoCliente(true)
    setErroCliente(null)

    try {
      const payload: any = {
        full_name: novoClienteNome.trim(),
        birth_date: novoClienteDataNasc || null,
        phone_1: novoClienteTelefone.trim() || null,
        cpf: novoClienteCpf.trim() || '',
        address_city: novoClienteCidade.trim() || null,
        company_id: null,
      }

      const res = await createClient(payload)
      if (res.error) {
        setErroCliente(`Erro ao cadastrar cliente: ${res.error}`)
        return
      }

      if (res.data) {
        setClientes((prev) => [res.data!, ...prev])
        handleSelectCliente(res.data)
        setIsNovoClienteModalOpen(false)
      }
    } catch (err: any) {
      setErroCliente(err.message || 'Erro inesperado ao salvar cliente.')
    } finally {
      setSalvandoCliente(false)
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
        preco_fabrica: 0,
        preco_venda_minimo: 0,
        desconto_percentual: 0,
        total: 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (formItens.length === 1) return
    setFormItens((prev) => prev.filter((_, idx) => idx !== index))
  }

  // Ao selecionar um produto no combobox:
  // Preço unitário inicial DEVE ser a sugestão de vendas!
  const handleSelectProduct = (index: number, produtoId: string) => {
    const prod = produtosDisponiveis.find((p) => p.id === produtoId)
    if (!prod) return

    const { precoFabrica, precoVenda, precoSugestao } = getPrecosDoProduto(produtoId, formTabelaPrecoNome)

    setFormItens((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it
        const precoUnit = precoSugestao || precoVenda || prod.sale_price || 0
        const qtd = it.quantidade || 1
        const total = precoUnit * qtd

        return {
          ...it,
          produto_id: produtoId,
          produto_nome: prod.name,
          preco_tabela: precoSugestao,
          preco_unitario: precoUnit, // Preço Unit. = sugestão de vendas
          preco_fabrica: precoFabrica,
          preco_venda_minimo: precoVenda,
          desconto_percentual: 0,
          total: Math.round(total * 100) / 100,
        }
      })
    )
  }

  // Ao mudar a tabela de preços, atualizar referências nos itens
  const handleChangeTabelaPreco = (novaTabelaNome: string) => {
    setFormTabelaPrecoNome(novaTabelaNome)
    setFormItens((prev) =>
      prev.map((it) => {
        if (!it.produto_id) return it
        const { precoFabrica, precoVenda, precoSugestao } = getPrecosDoProduto(it.produto_id, novaTabelaNome)
        const precoUnit = precoSugestao || precoVenda || it.preco_unitario
        const qtd = it.quantidade || 1
        const desc = it.desconto_percentual || 0
        const total = Math.max(0, qtd * precoUnit * (1 - desc / 100))

        return {
          ...it,
          preco_tabela: precoSugestao,
          preco_unitario: precoUnit,
          preco_fabrica: precoFabrica,
          preco_venda_minimo: precoVenda,
          total: Math.round(total * 100) / 100,
        }
      })
    )
  }

  const handleItemChange = (
    index: number,
    field: 'quantidade' | 'preco_unitario' | 'desconto_percentual',
    value: number
  ) => {
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

  // 1. Valor Total sem desconto
  const totalSemDesconto = subtotalForm

  // 2. Valor Total com pagamento até 5x (desconto padrão 5%, editável)
  const totalAte5x = useMemo(() => {
    const desc = Math.max(0, Math.min(100, formDesconto5xPercentual))
    return Math.round(totalSemDesconto * (1 - desc / 100) * 100) / 100
  }, [totalSemDesconto, formDesconto5xPercentual])

  // 3. Valor Total com pagamento à vista (desconto padrão 10%, editável)
  const totalVista = useMemo(() => {
    const desc = Math.max(0, Math.min(100, formDescontoVistaPercentual))
    return Math.round(totalSemDesconto * (1 - desc / 100) * 100) / 100
  }, [totalSemDesconto, formDescontoVistaPercentual])

  // Total final de acordo com a condição selecionada ou soma dos itens
  const totalForm = useMemo(() => {
    if (formCondicaoSelecionada === 'ate_5x') return totalAte5x
    if (formCondicaoSelecionada === 'a_vista') return totalVista
    // Se sem desconto ou personalizado por item
    return formItens.reduce((acc, it) => acc + (it.total || 0), 0)
  }, [formCondicaoSelecionada, totalAte5x, totalVista, formItens])

  const descontoTotalForm = Math.max(0, subtotalForm - totalForm)

  // Salvar Formulário
  const handleSalvarVenda = async (statusFinal: StatusVenda) => {
    if (!formClienteNome.trim()) {
      alert('Por favor, informe ou selecione o cliente.')
      return
    }

    const itensValidos = formItens.filter((it) => it.produto_id && it.produto_nome)
    if (itensValidos.length === 0) {
      alert('Adicione pelo menos um produto ao pedido.')
      return
    }

    const payload: Omit<PedidoVenda, 'id' | 'created_at' | 'updated_at'> & { id?: string } = {
      id: pedidoEdicao ? pedidoEdicao.id : undefined,
      numero: pedidoEdicao ? pedidoEdicao.numero : `PV-${dataHoje.replace(/-/g, '')}${String(Date.now()).slice(-3)}`,
      canal: formCanal,
      status: statusFinal,
      cliente_id: formClienteId,
      cliente_nome: formClienteNome.trim(),
      cliente_documento: formClienteDocumento.trim() || undefined,
      cliente_cidade: formClienteCidade.trim() || undefined,
      tabela_preco_nome: formTabelaPrecoNome,
      dataEmissao: pedidoEdicao ? pedidoEdicao.dataEmissao : dataHoje,
      dataPrevistaEntrega: formDataEntrega || null,
      formaPagamento: formFormaPagamento,
      numeroParcelas: formNumeroParcelas,
      contaEntradaTag: formContaEntradaTag,
      observacao: formObservacao.trim() || null,
      subtotal: subtotalForm,
      descontoTotal: descontoTotalForm,
      total: totalForm,
      desconto5xPercentual: formDesconto5xPercentual,
      total5x: totalAte5x,
      descontoVistaPercentual: formDescontoVistaPercentual,
      totalVista: totalVista,
      condicaoSelecionada: formCondicaoSelecionada,
      itens: itensValidos,
    }

    if (pedidoEdicao) {
      await updatePedidoVenda({
        ...payload,
        id: pedidoEdicao.id,
        created_at: pedidoEdicao.created_at,
        updated_at: new Date().toISOString(),
      })
    } else {
      await savePedidoVenda(payload)
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

  // ──────────────────────────────────────────────────────────────────────────
  // TELA 1: FORMULÁRIO DE NOVO PEDIDO / ORÇAMENTO (IMAGEM 01)
  // ──────────────────────────────────────────────────────────────────────────
  if (viewMode === 'formulario') {
    return (
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 animate-in fade-in duration-200 font-sans">
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

        {/* Título e Ações Superiores */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {pedidoEdicao ? `Editar Pedido #${pedidoEdicao.numero}` : 'Novo Pedido de Venda / Orçamento'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Defina os produtos, condições de pagamento e salve como Proposta Comercial (Orçamento) ou Pedido Aprovado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSalvarVenda('proposta')}
              className="flex-1 sm:flex-none rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-xs hover:bg-amber-100 active:scale-95 transition-all text-center"
            >
              Salvar como Orçamento (Proposta)
            </button>
            <button
              type="button"
              onClick={() => handleSalvarVenda('aprovado')}
              className="flex-1 sm:flex-none rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-slate-800 active:scale-95 transition-all text-center"
            >
              Salvar como Pedido Aprovado
            </button>
          </div>
        </div>

        {/* Grid de Edição Principal: 2 Colunas para Dados/Itens + 1 Coluna para Condições */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1 & 2: Cliente e Produtos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: Cliente e Canal Comercial */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <User size={18} className="text-sky-600" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase">
                    1. Dados do Cliente e Canal Comercial
                  </h3>
                </div>

                {/* Botão de cadastro rápido de cliente */}
                <button
                  type="button"
                  onClick={handleAbrirCadastroRapidoCliente}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition"
                >
                  <UserPlus size={14} /> + Cadastrar Novo Cliente
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Autocomplete de Cliente com busca rápida */}
                <div className="sm:col-span-2 space-y-1 relative" ref={clienteDropdownRef}>
                  <label className="text-xs font-bold uppercase text-slate-500 flex items-center justify-between">
                    <span>Nome do Cliente *</span>
                    {formClienteId && (
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                        ✓ Cliente Cadastrado
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={clienteBuscaTexto}
                      onChange={(e) => {
                        setClienteBuscaTexto(e.target.value)
                        setFormClienteNome(e.target.value)
                        setFormClienteId(undefined)
                        setIsClienteDropdownOpen(true)
                      }}
                      onFocus={() => setIsClienteDropdownOpen(true)}
                      placeholder="Digite o nome do cliente para pesquisar..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-3.5 pr-8 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                    />
                    <Search
                      size={16}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                  </div>

                  {/* Dropdown de sugestões de cliente */}
                  {isClienteDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1 divide-y divide-slate-100">
                      {clientesFiltrados.length > 0 ? (
                        clientesFiltrados.map((cli) => (
                          <button
                            key={cli.id}
                            type="button"
                            onClick={() => handleSelectCliente(cli)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-sky-50/80 transition flex items-center justify-between"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-900">{cli.full_name}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                                {cli.cpf && <span>CPF: {cli.cpf}</span>}
                                {cli.address_city && (
                                  <span>
                                    • {cli.address_city}
                                    {cli.address_state ? `/${cli.address_state}` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-1 rounded-md">
                              Selecionar
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-center">
                          <p className="text-xs text-slate-500 font-medium">Nenhum cliente encontrado com este nome.</p>
                          <button
                            type="button"
                            onClick={handleAbrirCadastroRapidoCliente}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition"
                          >
                            <UserPlus size={14} /> Cadastrar "{clienteBuscaTexto}" agora
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Canal de Venda */}
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

                {/* CPF / CNPJ */}
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

                {/* Cidade / UF */}
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

                {/* Tabela de Preço com identificação da tabela padrão */}
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500 flex items-center justify-between">
                    <span>Tabela de Preço</span>
                    {tabelaPrecoAtiva?.is_default && (
                      <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-1.5 py-0.5 rounded">
                        ★ Padrão
                      </span>
                    )}
                  </label>
                  <select
                    value={formTabelaPrecoNome}
                    onChange={(e) => handleChangeTabelaPreco(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 cursor-pointer"
                  >
                    {tabelasPreco.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.is_default ? '⭐ ' : ''}{t.name}{t.is_default ? ' (Padrão)' : ''}
                      </option>
                    ))}
                    {tabelasPreco.length === 0 && (
                      <option value="Tabela Padrão">Tabela Padrão</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Card 2: Produtos e Itens com Busca e Informações de Margem */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} className="text-indigo-600" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase">
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

              <div className="space-y-4">
                {formItens.map((item, idx) => {
                  // Margem e desconto máximo permitido
                  const precoRef = item.preco_unitario || item.preco_tabela || 0
                  const precoVendaMin = item.preco_venda_minimo || 0
                  const maxDescontoValor = Math.max(0, precoRef - precoVendaMin)
                  const maxDescontoPerc = precoRef > 0 ? (maxDescontoValor / precoRef) * 100 : 0

                  // Preço praticado efetivo por unidade
                  const precoEfetivoUnitario = precoRef * (1 - (item.desconto_percentual || 0) / 100)
                  const isAbaixoTabelaVenda = precoVendaMin > 0 && precoEfetivoUnitario < precoVendaMin - 0.01

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        isAbaixoTabelaVenda
                          ? 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-200'
                          : 'border-slate-200/90 bg-slate-50/40'
                      }`}
                    >
                      {/* Linha principal: Produto (Select Pesquisável), Qtd, Preço Unitário, Desconto %, Total */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        {/* Seletor com pesquisa de produto */}
                        <div className="sm:col-span-5 space-y-1">
                          <label className="text-[11px] font-bold uppercase text-slate-500">
                            Produto do Catálogo *
                          </label>
                          <select
                            value={item.produto_id}
                            onChange={(e) => handleSelectProduct(idx, e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 shadow-2xs"
                          >
                            <option value="">Pesquise e selecione um produto...</option>
                            {produtosDisponiveis.map((p) => {
                              const precos = getPrecosDoProduto(p.id, formTabelaPrecoNome)
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.name} · Sugestão: {formatarMoeda(precos.precoSugestao)}
                                </option>
                              )
                            })}
                          </select>
                        </div>

                        {/* Quantidade */}
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[11px] font-bold uppercase text-slate-500">Qtd</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantidade', Math.max(1, Number(e.target.value)))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 text-center outline-none focus:border-indigo-500 shadow-2xs"
                          />
                        </div>

                        {/* Preço Unitário (Preço de Sugestão de Vendas) */}
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[11px] font-bold uppercase text-slate-500" title="Preço de sugestão da tabela ativa">
                            Preço Unit. (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.preco_unitario}
                            onChange={(e) =>
                              handleItemChange(idx, 'preco_unitario', Number(e.target.value))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 text-right outline-none focus:border-indigo-500 shadow-2xs"
                          />
                        </div>

                        {/* Total do Item */}
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[11px] font-bold uppercase text-slate-500">Total (R$)</label>
                          <div className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-900 text-right tabular-nums border border-slate-200 shadow-2xs">
                            {formatarMoeda(item.total)}
                          </div>
                        </div>

                        {/* Botão Remover */}
                        <div className="sm:col-span-1 flex justify-center pb-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            disabled={formItens.length === 1}
                            title="Remover produto da proposta"
                            className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Faixa Informativa de Fábrica, Tabela de Venda e Margem Máxima de Desconto */}
                      {item.produto_id && (
                        <div className="rounded-xl bg-white p-3 border border-slate-200/70 text-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 font-medium">
                                Tabela Fábrica: <strong className="text-slate-800 font-bold">{formatarMoeda(item.preco_fabrica || 0)}</strong>
                              </span>
                              <span className="text-slate-300">|</span>
                              <span className="text-slate-500 font-medium">
                                Tabela Venda (Piso): <strong className="text-indigo-900 font-bold">{formatarMoeda(item.preco_venda_minimo || 0)}</strong>
                              </span>
                            </div>

                            <div className="text-slate-500 font-medium">
                              Sugestão de Vendas:{' '}
                              <strong className="text-slate-900 font-bold">{formatarMoeda(item.preco_tabela)}</strong>
                            </div>
                          </div>

                          {/* Informação e controle do desconto permitido */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                              <Info size={14} className="text-sky-600 shrink-0" />
                              <span>
                                Desconto máx. permitido:{' '}
                                <strong className="text-emerald-700 font-black">
                                  {maxDescontoPerc.toFixed(1)}% ({formatarMoeda(maxDescontoValor)})
                                </strong>{' '}
                                para manter valor mínimo de {formatarMoeda(precoVendaMin)}.
                              </span>
                            </div>

                            {/* Desconto Aplicado neste Item */}
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase">
                                Desconto Aplicado:
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={item.desconto_percentual || 0}
                                  onChange={(e) =>
                                    handleItemChange(idx, 'desconto_percentual', Number(e.target.value))
                                  }
                                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-center text-slate-800 outline-none focus:border-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-500">%</span>
                              </div>
                            </div>
                          </div>

                          {/* Alerta de violação da margem mínima */}
                          {isAbaixoTabelaVenda && (
                            <div className="flex items-center gap-2 rounded-lg bg-amber-100/70 border border-amber-300 px-3 py-1.5 text-[11px] font-bold text-amber-900">
                              <AlertTriangle size={14} className="text-amber-700 shrink-0" />
                              <span>
                                Atenção: O preço praticado ({formatarMoeda(precoEfetivoUnitario)}) ficou menor que o valor da tabela de venda ({formatarMoeda(precoVendaMin)})!
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Coluna 3: Condições de Pagamento e TOTALIZAÇÃO EM 3 VALORES (Requisito Especial) */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CreditCard size={18} className="text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase">
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

              {/* ── QUEBRA EM 3 VALORES TOTAIS (REQUISITO ESPECIFICADO) ── */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Simulação Comercial dos 3 Totais
                </span>

                {/* Valor 1: Total Sem Desconto */}
                <div
                  onClick={() => setFormCondicaoSelecionada('sem_desconto')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    formCondicaoSelecionada === 'sem_desconto'
                      ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-200'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">1. Valor Total sem Desconto</span>
                    <span className="text-xs font-black text-slate-900 tabular-nums">
                      {formatarMoeda(totalSemDesconto)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Preço de tabela de vendas integral</p>
                </div>

                {/* Valor 2: Total Até 5x (Padrão 5% com % configurável) */}
                <div
                  onClick={() => setFormCondicaoSelecionada('ate_5x')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    formCondicaoSelecionada === 'ate_5x'
                      ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-200'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">2. Pagamento até 5x</span>
                    <span className="text-sm font-black text-indigo-900 tabular-nums">
                      {formatarMoeda(totalAte5x)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Desconto:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={formDesconto5xPercentual}
                        onChange={(e) => setFormDesconto5xPercentual(Number(e.target.value))}
                        className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-center text-slate-800 outline-none focus:border-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>

                    <span className="text-[11px] font-bold text-indigo-700">
                      5x de {formatarMoeda(totalAte5x / 5)}
                    </span>
                  </div>
                </div>

                {/* Valor 3: Total À Vista (Padrão 10% com % configurável) */}
                <div
                  onClick={() => setFormCondicaoSelecionada('a_vista')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    formCondicaoSelecionada === 'a_vista'
                      ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">3. Pagamento à Vista</span>
                    <span className="text-sm font-black text-emerald-900 tabular-nums">
                      {formatarMoeda(totalVista)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Desconto:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={formDescontoVistaPercentual}
                        onChange={(e) => setFormDescontoVistaPercentual(Number(e.target.value))}
                        className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-center text-slate-800 outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>

                    <span className="text-[11px] font-bold text-emerald-700">
                      Economia: {formatarMoeda(totalSemDesconto - totalVista)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Oficial Selecionado */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-slate-900">
                  <span className="uppercase tracking-wider">TOTAL DO PEDIDO:</span>
                  <span className="text-2xl font-black text-slate-950 tabular-nums">
                    {formatarMoeda(totalForm)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium text-right">
                  {formCondicaoSelecionada === 'sem_desconto' && 'Condição: Preço de Tabela Integral'}
                  {formCondicaoSelecionada === 'ate_5x' && `Condição: Até 5x com ${formDesconto5xPercentual}% off`}
                  {formCondicaoSelecionada === 'a_vista' && `Condição: À vista com ${formDescontoVistaPercentual}% off`}
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => handleSalvarVenda('proposta')}
                  className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-xs hover:bg-amber-100 active:scale-95 transition-all text-center"
                >
                  Salvar como Orçamento (Proposta)
                </button>
                <button
                  type="button"
                  onClick={() => handleSalvarVenda('aprovado')}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-slate-800 active:scale-95 transition-all text-center"
                >
                  Salvar como Pedido Aprovado
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Simples de Cadastro Rápido de Cliente (Nome + Data de Nascimento) */}
        {isNovoClienteModalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus size={18} className="text-sky-600" />
                  <h3 className="text-base font-bold text-slate-900">Cadastro Rápido de Cliente</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNovoClienteModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSalvarNovoClienteRapido} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-600">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={novoClienteNome}
                    onChange={(e) => setNovoClienteNome(e.target.value)}
                    placeholder="Ex: Maria Aparecida Santos"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-1.5">
                    <Calendar size={14} className="text-sky-600" />
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={novoClienteDataNasc}
                    onChange={(e) => setNovoClienteDataNasc(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-sky-500 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-slate-600">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      value={novoClienteTelefone}
                      onChange={(e) => setNovoClienteTelefone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-slate-600">CPF</label>
                    <input
                      type="text"
                      value={novoClienteCpf}
                      onChange={(e) => setNovoClienteCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-600">Cidade / UF</label>
                  <input
                    type="text"
                    value={novoClienteCidade}
                    onChange={(e) => setNovoClienteCidade(e.target.value)}
                    placeholder="Ex: Chapecó/SC"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                  />
                </div>

                {erroCliente && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    {erroCliente}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNovoClienteModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoCliente}
                    className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                  >
                    {salvandoCliente ? 'Cadastrando...' : 'Cadastrar e Selecionar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TELA 2: LISTAGEM DE PROPOSTAS & PEDIDOS DE VENDAS (IMAGEM 02)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 font-sans">
      {/* ── CABEÇALHO PRINCIPAL DA PÁGINA ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 shadow-xs">
              <ClipboardList size={22} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              PROPOSTAS & PEDIDOS DE VENDAS
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
            Gerencie orçamentos e pedidos de vendas por canais de distribuição e representação.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenComparar()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs sm:text-sm font-semibold tracking-wide text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-all shadow-xs active:scale-95"
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
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-xs sm:text-sm font-semibold tracking-wide text-white hover:bg-slate-800 transition-all shadow-xs active:scale-95"
          >
            <Plus size={18} strokeWidth={2.5} />
            NOVA VENDA / PROPOSTA
          </button>
        </div>
      </div>

      {/* ── CARDS DE KPIS RESPONSIVOS ── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Orçado / Propostas */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Em Negociação (Orçamentos)
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <FileSpreadsheet size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
              {formatarMoeda(kpis.orcadoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              {kpis.orcadoCount} {kpis.orcadoCount === 1 ? 'proposta aberta' : 'propostas abertas'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400" />
        </div>

        {/* KPI 2: Aprovados */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pedidos Aprovados
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
              {formatarMoeda(kpis.aprovadoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              {kpis.aprovadoCount} {kpis.aprovadoCount === 1 ? 'pedido pronto' : 'pedidos prontos'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* KPI 3: Faturamento Realizado */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Faturamento Concluído
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
              {formatarMoeda(kpis.faturadoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Integrado com contas a receber
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* KPI 4: Entregas */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Entregas Finalizadas
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Truck size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
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
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-4">
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
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-500 shadow-2xs cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>

            {/* Pílulas de Meses com scroll suave em telas menores */}
            <div className="inline-flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0">
              {MESES_LISTA.map((m) => {
                const isSelected = filtroMesNum === m.num
                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => setFiltroMesNum(m.num)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                      isSelected
                        ? 'bg-sky-700 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m.short}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Campo de Busca de Clientes / Documento / Nº */}
          <div className="relative w-full lg:max-w-xs">
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

      {/* ── BARRA DE AÇÕES RÁPIDAS (HABILITADA AO SELECIONAR UM PEDIDO - REQUISITO IMAGEM 02) ── */}
      {pedidoSelecionado ? (
        <div className="rounded-2xl border border-sky-300 bg-gradient-to-r from-sky-50 via-white to-sky-50/70 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
          {/* Identificação do Pedido Selecionado */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-600 text-white font-black text-xs shadow-xs">
              ✓
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Ações para:</span>
                <span className="text-sm font-black text-slate-900">{pedidoSelecionado.numero}</span>
                {renderStatusBadge(pedidoSelecionado.status)}
              </div>
              <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                Cliente: <strong className="text-slate-900">{pedidoSelecionado.cliente_nome}</strong> · Total:{' '}
                <strong className="text-slate-900 font-black">{formatarMoeda(pedidoSelecionado.total)}</strong>
              </p>
            </div>
          </div>

          {/* Botões de Ação Dinâmicos Conforme o Status */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Visualizar / Espelho / WhatsApp */}
            <button
              type="button"
              onClick={() => setVisualizandoPedido(pedidoSelecionado)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition active:scale-95"
            >
              <Eye size={15} className="text-sky-600" />
              Visualizar
            </button>

            {/* Editar (Orçamento ou Aprovado) */}
            {(pedidoSelecionado.status === 'proposta' || pedidoSelecionado.status === 'aprovado') && (
              <button
                type="button"
                onClick={() => handleEditarPedido(pedidoSelecionado)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition active:scale-95"
              >
                <Edit3 size={15} className="text-indigo-600" />
                Editar Pedido
              </button>
            )}

            {/* Aprovar Proposta */}
            {pedidoSelecionado.status === 'proposta' && (
              <button
                type="button"
                onClick={() => void handleAprovar(pedidoSelecionado.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700 shadow-2xs transition active:scale-95"
              >
                <CheckCircle size={15} />
                Aprovar Pedido
              </button>
            )}

            {/* Faturar Pedido Aprovado */}
            {pedidoSelecionado.status === 'aprovado' && (
              <button
                type="button"
                onClick={() => void handleFaturar(pedidoSelecionado.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-purple-700 shadow-2xs transition active:scale-95"
              >
                <DollarSign size={15} />
                Faturar Venda
              </button>
            )}

            {/* Confirmar Entrega */}
            {pedidoSelecionado.status === 'faturado' && (
              <button
                type="button"
                onClick={() => void handleEntregar(pedidoSelecionado.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 shadow-2xs transition active:scale-95"
              >
                <Truck size={15} />
                Confirmar Entrega
              </button>
            )}

            {/* Cancelar */}
            {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'entregue' && (
              <button
                type="button"
                onClick={() => void handleCancelar(pedidoSelecionado.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition active:scale-95"
              >
                <XCircle size={15} />
                Cancelar
              </button>
            )}

            {/* Reabrir Cancelado */}
            {pedidoSelecionado.status === 'cancelado' && (
              <button
                type="button"
                onClick={() => void handleReabrir(pedidoSelecionado.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition active:scale-95"
              >
                <RotateCcw size={15} />
                Reabrir Proposta
              </button>
            )}

            {/* Desmarcar */}
            <button
              type="button"
              onClick={() => setSelectedPedidoId(null)}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
              title="Desmarcar seleção"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* Barra sutil de instrução quando nenhum pedido está selecionado */
        <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Info size={14} className="text-sky-600" />
            Clique em qualquer pedido na tabela abaixo ou marque a caixa para habilitar as ações rápidas.
          </span>
          {selectedPropostaIds.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenComparar()}
              className="text-xs font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
            >
              <Scale size={13} /> {selectedPropostaIds.length} selecionado(s) para comparar
            </button>
          )}
        </div>
      )}

      {/* ── TABELA DE VENDAS E PROPOSTAS RESPONSIVA ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
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
                  const isCheckedCompare = selectedPropostaIds.includes(p.id)
                  const isSelectedRow = selectedPedidoId === p.id

                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleSelectPedidoLinha(p.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelectedRow
                          ? 'bg-sky-50/80 hover:bg-sky-50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox Comparar */}
                      <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isCheckedCompare}
                          onChange={(e) => handleToggleSelectProposta(p.id, e as any)}
                          title="Selecionar para comparar orçamentos"
                          aria-label={`Selecionar venda ${p.numero} para comparar`}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Nº Venda */}
                      <td className="px-4 py-4 font-bold text-slate-900 tabular-nums">
                        <span className="flex items-center gap-1.5">
                          {isSelectedRow && <span className="h-2 w-2 rounded-full bg-sky-600" />}
                          {p.numero}
                        </span>
                      </td>

                      {/* Data */}
                      <td className="px-4 py-4 font-medium text-slate-500">
                        {formatarData(p.dataEmissao)}
                      </td>

                      {/* Canal */}
                      <td className="px-4 py-4">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                          {p.canal === 'distribuicao' ? 'Distribuição' : 'Representação'}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 truncate max-w-[220px]">{p.cliente_nome}</span>
                          {p.cliente_cidade && (
                            <span className="text-[10px] text-slate-400 truncate">{p.cliente_cidade}</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        {renderStatusBadge(p.status)}
                      </td>

                      {/* Pagamento */}
                      <td className="px-4 py-4 font-medium text-slate-600">
                        <div className="flex flex-col">
                          <span>{p.formaPagamento}</span>
                          <span className="text-[10px] text-slate-400">
                            {p.numeroParcelas > 1 ? `${p.numeroParcelas} parcelas` : 'À vista'}
                          </span>
                        </div>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-4 text-right font-black text-slate-900 tabular-nums">
                        {formatarMoeda(p.total)}
                      </td>

                      {/* Ações Rápidas na Linha */}
                      <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setVisualizandoPedido(p)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Visualizar detalhes do pedido"
                          >
                            <Eye size={15} />
                          </button>

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

                          {p.status === 'proposta' && (
                            <button
                              type="button"
                              onClick={() => void handleAprovar(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Aprovar proposta"
                            >
                              <CheckCircle size={15} />
                            </button>
                          )}

                          {p.status === 'aprovado' && (
                            <button
                              type="button"
                              onClick={() => void handleFaturar(p.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                              title="Faturar pedido"
                            >
                              <DollarSign size={15} />
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
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 sm:px-6 py-4">
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
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
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
                <div className="rounded-xl border border-slate-100 overflow-x-auto">
                  <table className="w-full text-left min-w-[450px]">
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
                        <td colSpan={3} className="px-3 py-2 text-right uppercase">
                          Total do Pedido:
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sm font-black">
                          {formatarMoeda(visualizandoPedido.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Box com os 3 totais na visualização */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50/70 border border-slate-200/80 text-[11px]">
                <div>
                  <span className="text-slate-400 uppercase font-bold block">1. Total sem desconto</span>
                  <strong className="text-slate-900 text-xs font-black">
                    {formatarMoeda(visualizandoPedido.subtotal)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block">
                    2. Até 5x ({visualizandoPedido.desconto5xPercentual ?? 5}% off)
                  </span>
                  <strong className="text-indigo-900 text-xs font-black">
                    {formatarMoeda(
                      visualizandoPedido.total5x ??
                        visualizandoPedido.subtotal * (1 - (visualizandoPedido.desconto5xPercentual ?? 5) / 100)
                    )}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block">
                    3. À Vista ({visualizandoPedido.descontoVistaPercentual ?? 10}% off)
                  </span>
                  <strong className="text-emerald-900 text-xs font-black">
                    {formatarMoeda(
                      visualizandoPedido.totalVista ??
                        visualizandoPedido.subtotal * (1 - (visualizandoPedido.descontoVistaPercentual ?? 10) / 100)
                    )}
                  </strong>
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
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 sm:px-6 py-4 gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const text = `📋 *PROPOSTA / PEDIDO DE VENDA #${visualizandoPedido.numero}*
Cliente: ${visualizandoPedido.cliente_nome}
Total: ${formatarMoeda(visualizandoPedido.total)}
Condição: ${visualizandoPedido.formaPagamento} (${visualizandoPedido.numeroParcelas}x)
Opções de Pagamento:
1. Sem desconto: ${formatarMoeda(visualizandoPedido.subtotal)}
2. Em até 5x: ${formatarMoeda(visualizandoPedido.total5x ?? visualizandoPedido.subtotal * 0.95)}
3. À vista com desconto: ${formatarMoeda(visualizandoPedido.totalVista ?? visualizandoPedido.subtotal * 0.9)}`
                    const url =
                      buildWhatsappUrlWithText('', text) ||
                      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
                    window.open(url, '_blank')
                  }}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-all"
                >
                  <MessageCircle size={15} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-all"
                >
                  <Printer size={15} /> Imprimir
                </button>
              </div>
              <button
                type="button"
                onClick={() => setVisualizandoPedido(null)}
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
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
