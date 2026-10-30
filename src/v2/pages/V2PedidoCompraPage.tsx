import { useState, useEffect, useMemo } from 'react'
import {
  ShoppingCart,
  Edit3,
  RotateCcw,
  Search,
  Eye,
  CheckCircle,
  ArrowRight,
  Tag,
  Package,
  X,
  Clock,
  FileSpreadsheet,
  FileText,
  CreditCard,
  Plus,
  Trash2,
  XCircle,
  Truck,
  PackageCheck,
  Calendar,
} from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData, hoje, somarDias } from '../../modules/lib/datas'
import {
  listPedidosCompra,
  savePedidoCompra,
  updatePedidoCompra,
  emitirPedidoCompra,
  receberPedidoCompraPorItem,
  ajustarQuantidadeItem,
  cancelarPedidoCompra,
  deletePedidoCompra,
  salvarNfFornecedor,
  gerarParcelasCompra,
  PedidoCompra,
  PedidoCompraItem,
  StatusPedido,
  type RecebimentoCompra,
} from '../services/v2PedidoCompraService'
import { listV2Products, V2Product } from '../services/v2ProdutosService'
import { listFornecedores, Fornecedor } from '../services/v2SettingsService'
import { listContasBancarias, ContaBancaria } from '../services/v2ContasBancariasService'

const FORMAS_PAGAMENTO: string[] = [
  'Dinheiro',
  'Pix',
  'Cartão Débito',
  'Cartão Crédito',
  'Boleto',
  'Crediário',
]


const MESES_LISTA = [
  { num: '01', short: 'JAN', full: 'Janeiro' },
  { num: '02', short: 'FEV', full: 'Fevereiro' },
  { num: '03', short: 'MAR', full: 'Março' },
  { num: '04', short: 'ABR', full: 'Abril' },
  { num: '05', short: 'MAI', full: 'Maio' },
  { num: '06', short: 'JUN', full: 'Junho' },
  { num: '07', short: 'JUL', full: 'Julho' },
  { num: '08', short: 'AGO', full: 'Agosto' },
  { num: '09', short: 'SET', full: 'Setembro' },
  { num: '10', short: 'OUT', full: 'Outubro' },
  { num: '11', short: 'NOV', full: 'Novembro' },
  { num: '12', short: 'DEZ', full: 'Dezembro' },
]

export function V2PedidoCompraPage() {
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

  // State: View Mode ('lista' | 'novo')
  const [viewMode, setViewMode] = useState<'lista' | 'novo'>('lista')

  // State: Filter and Search
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusPedido>('todos')
  const [filtroAno, setFiltroAno] = useState<number>(() => Number(dataHoje.slice(0, 4)) || 2026)
  const [filtroMesNum, setFiltroMesNum] = useState<string>(() => dataHoje.slice(5, 7) || '10')

  // State: Data
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<V2Product[]>([])
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState<Fornecedor[]>([])
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([])

  // State: Formulario Novo / Edição
  const [pedidoEdicao, setPedidoEdicao] = useState<PedidoCompra | null>(null)
  const [isVisualizacao, setIsVisualizacao] = useState(false)
  const [formFornecedor, setFormFornecedor] = useState('')
  const [formItens, setFormItens] = useState<PedidoCompraItem[]>([])
  const [formParcelas, setFormParcelas] = useState(1)
  const [formFormaPagamento, setFormFormaPagamento] = useState('Boleto')
  const [formContaSaidaTag, setFormContaSaidaTag] = useState('')
  const [formDataPedido, setFormDataPedido] = useState(() => dataHoje)
  const [formDataVencimento, setFormDataVencimento] = useState(() => somarDias(dataHoje, 30))
  const [formFrete, setFormFrete] = useState<number>(0)
  const [formDataRecebimentoPrevista, setFormDataRecebimentoPrevista] = useState(() => somarDias(dataHoje, 20))
  const [formJustificativaDataRecebimento, setFormJustificativaDataRecebimento] = useState('')
  const [formObservacao, setFormObservacao] = useState('')

  // State: Recebimento por Item Modal
  const [showRecebimentoModal, setShowRecebimentoModal] = useState(false)
  const [pedidoRecebimento, setPedidoRecebimento] = useState<PedidoCompra | null>(null)
  const [recebimentoItens, setRecebimentoItens] = useState<{ produto_id: string; quantidade_recebida: number }[]>([])
  const [recebimentoJustificativa, setRecebimentoJustificativa] = useState('')

  // State: Drawer de Detalhes / Visualização Lateral
  const [pedidoVisualizando, setPedidoVisualizando] = useState<PedidoCompra | null>(null)

  // State: Modal NF Fornecedor
  const [showNfModal, setShowNfModal] = useState(false)
  const [nfNumero, setNfNumero] = useState('')
  const [nfData, setNfData] = useState(() => dataHoje)
  const [nfChave, setNfChave] = useState('')
  const [salvandoNf, setSalvandoNf] = useState(false)

  // State: Modal Gerar Parcelas
  const [showParcelasModal, setShowParcelasModal] = useState(false)
  const [parcelasForma, setParcelasForma] = useState('Boleto')
  const [parcelasTag, setParcelasTag] = useState('')
  const [parcelasQtd, setParcelasQtd] = useState(1)
  const [parcelasPrimeiroVenc, setParcelasPrimeiroVenc] = useState(() => somarDias(dataHoje, 30))
  const [parcelasLista, setParcelasLista] = useState<{ numero: number; vencimento: string; valor: number }[]>([])
  const [salvandoParcelas, setSalvandoParcelas] = useState(false)

  const loadData = async () => {
    const p = await listPedidosCompra()
    const prods = await listV2Products()
    const forns = await listFornecedores()
    const ctas = await listContasBancarias()
    setPedidos(p)
    setProdutosDisponiveis(prods)
    setFornecedoresCadastrados(forns)
    setContasBancarias(ctas.filter((c) => c.ativo))
  }

  useEffect(() => {
    loadData()
  }, [])

  // Iniciar formulário de novo pedido totalmente limpo para preenchimento pelo usuário
  const handleIniciarNovoPedido = () => {
    setPedidoEdicao(null)
    setIsVisualizacao(false)
    setFormFornecedor('')
    setFormItens([
      {
        produto_id: '',
        produto_nome: '',
        quantidade: 1,
        preco_unitario: 0,
        total: 0,
      },
    ])
    setFormParcelas(1)
    setFormFormaPagamento('Boleto')
    setFormContaSaidaTag('')
    setFormDataPedido(dataHoje)
    setFormDataVencimento(somarDias(dataHoje, 30))
    setFormFrete(0)
    setFormDataRecebimentoPrevista(somarDias(dataHoje, 20))
    setFormJustificativaDataRecebimento('')
    setFormObservacao('')
    setViewMode('novo')
  }

  // Visualizar Pedido (Modo somente leitura para pedidos recebidos)
  const handleVisualizarPedido = (p: PedidoCompra) => {
    setPedidoEdicao(p)
    setIsVisualizacao(true)
    setFormFornecedor(p.fornecedor || '')
    setFormItens(p.itens || [])
    setFormParcelas(1)
    setFormFormaPagamento(p.formaPagamento || 'Boleto')
    setFormContaSaidaTag(p.contaSaidaTag || '')
    setFormDataPedido(p.dataPedido || p.dataEmissao || dataHoje)
    setFormDataVencimento(p.dataVencimento || '')
    setFormFrete(p.frete || 0)
    setFormDataRecebimentoPrevista(p.dataRecebimentoPrevista || p.dataPrevistaEntrega || somarDias(p.dataPedido || dataHoje, 20))
    setFormJustificativaDataRecebimento(p.justificativaDataRecebimento || '')
    setFormObservacao(p.observacao || '')
    setPedidoVisualizando(p)
  }

  const handleEditarPedido = (p: PedidoCompra) => {
    // Se o pedido estiver recebido, abre no modo visualização (não permite edição)
    if (p.status === 'recebido') {
      handleVisualizarPedido(p)
      return
    }
    setPedidoEdicao(p)
    setIsVisualizacao(false)
    setFormFornecedor(p.fornecedor || '')
    setFormItens(
      p.itens && p.itens.length > 0
        ? p.itens
        : [{ produto_id: '', produto_nome: '', quantidade: 1, preco_unitario: 0, total: 0 }]
    )
    setFormParcelas(1)
    setFormFormaPagamento(p.formaPagamento || 'Boleto')
    setFormContaSaidaTag(p.contaSaidaTag || '')
    setFormDataPedido(p.dataPedido || p.dataEmissao || dataHoje)
    setFormDataVencimento(p.dataVencimento || somarDias(p.dataPedido || dataHoje, 30))
    setFormFrete(p.frete || 0)
    setFormDataRecebimentoPrevista(p.dataRecebimentoPrevista || p.dataPrevistaEntrega || somarDias(p.dataPedido || dataHoje, 20))
    setFormJustificativaDataRecebimento(p.justificativaDataRecebimento || '')
    setFormObservacao(p.observacao || '')
    setViewMode('novo')
  }

  // Manipulação de itens
  const handleAdicionarItem = () => {
    const prod = produtosDisponiveis[0]
    setFormItens((prev) => [
      ...prev,
      {
        produto_id: prod ? prod.id : '',
        produto_nome: prod ? prod.name : '',
        quantidade: 1,
        preco_unitario: prod ? prod.cost_price : 0,
        total: prod ? prod.cost_price : 0,
      },
    ])
  }

  const handleRemoverItem = (index: number) => {
    if (formItens.length === 1) {
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

  // Salvar Pedido com status Rascunho (Criado) ou Emitir diretamente
  const handleSalvarPedido = async (emitirAgora: boolean = false) => {
    if (!formFornecedor.trim()) {
      alert('Informe ou selecione o fornecedor.')
      return
    }
    const itensValidos = formItens.filter((it) => it.produto_id && it.quantidade > 0)
    if (itensValidos.length === 0) {
      alert('Selecione pelo menos 1 produto válido no pedido.')
      return
    }

    try {
      if (pedidoEdicao) {
        await updatePedidoCompra({
          ...pedidoEdicao,
          fornecedor: formFornecedor,
          dataPedido: formDataPedido || dataHoje,
          dataVencimento: formDataVencimento || null,
          frete: Number(formFrete) || 0,
          dataRecebimentoPrevista: formDataRecebimentoPrevista || null,
          justificativaDataRecebimento: formJustificativaDataRecebimento || undefined,
          dataPrevistaEntrega: formDataRecebimentoPrevista || null,
          observacao: formObservacao || null,
          total: totalCalculado,
          numeroParcelas: formParcelas,
          formaPagamento: formFormaPagamento,
          contaSaidaTag: formContaSaidaTag,
          itens: itensValidos,
        })
      } else {
        const novo = await savePedidoCompra({
          fornecedor: formFornecedor,
          status: 'rascunho', // Novo pedido nasce sempre como rascunho (Criado)
          dataPedido: formDataPedido || dataHoje,
          dataEmissao: formDataPedido || dataHoje,
          dataVencimento: formDataVencimento || null,
          frete: Number(formFrete) || 0,
          dataRecebimentoPrevista: formDataRecebimentoPrevista || null,
          justificativaDataRecebimento: formJustificativaDataRecebimento || undefined,
          dataPrevistaEntrega: formDataRecebimentoPrevista || null,
          observacao: formObservacao || null,
          total: totalCalculado,
          numeroParcelas: formParcelas,
          formaPagamento: formFormaPagamento,
          contaSaidaTag: formContaSaidaTag,
          itens: itensValidos,
        })

        if (emitirAgora) {
          await emitirPedidoCompra(novo.id)
        }
      }
      await loadData()
      setViewMode('lista')
    } catch {
      alert('Erro ao salvar o pedido.')
    }
  }


  const handleAbrirRecebimento = (p: PedidoCompra) => {
    setPedidoRecebimento(p)
    const itens = (p.itens || []).map((it) => {
      const jaRecebido = it.quantidade_recebida ?? 0
      const pendente = Math.max(0, it.quantidade - jaRecebido)
      return {
        produto_id: it.produto_id,
        quantidade_recebida: pendente,
      }
    })
    setRecebimentoItens(itens)
    setRecebimentoJustificativa('')
    setShowRecebimentoModal(true)
  }

  const handleConfirmarRecebimento = async () => {
    if (!pedidoRecebimento) return
    const totalRecebendo = recebimentoItens.reduce((acc, i) => acc + (Number(i.quantidade_recebida) || 0), 0)
    if (totalRecebendo <= 0) {
      alert('Informe ao menos 1 unidade recebida em pelo menos um item.')
      return
    }

    const res = await receberPedidoCompraPorItem(
      pedidoRecebimento.id,
      recebimentoItens.map((i) => ({
        produto_id: i.produto_id,
        quantidade_recebida: Number(i.quantidade_recebida) || 0,
      })),
      recebimentoJustificativa.trim() || undefined
    )

    if (!res.ok) {
      alert(res.erro)
      return
    }

    setShowRecebimentoModal(false)
    await loadData()

    const atualizados = await listPedidosCompra()
    const pAtualizado = atualizados.find((x) => x.id === pedidoRecebimento.id)
    if (pAtualizado && pedidoVisualizando?.id === pAtualizado.id) {
      setPedidoVisualizando(pAtualizado)
    }
  }

  const handleAjustarQuantidade = async (pedidoId: string, produtoId: string, novaQtd: number) => {
    const p = pedidos.find((item) => item.id === pedidoId)
    const it = p?.itens.find((i) => i.produto_id === produtoId)
    const nome = it?.produto_nome || 'o item'
    if (
      window.confirm(
        `Confirma ajustar a quantidade de "${nome}" para ${novaQtd}? O valor do pedido e da Conta a Pagar serão recalculados com abatimento e o restante será considerado cancelado/não entregue.`
      )
    ) {
      const res = await ajustarQuantidadeItem(pedidoId, produtoId, novaQtd)
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
      const atualizados = await listPedidosCompra()
      const pAtualizado = atualizados.find((x) => x.id === pedidoId)
      if (pAtualizado && pedidoVisualizando?.id === pAtualizado.id) {
        setPedidoVisualizando(pAtualizado)
      }
    }
  }

  // ── Handlers do Modal NF Fornecedor ──
  const handleAbrirNfModal = (p: PedidoCompra) => {
    setNfNumero(p.numeroNf || '')
    setNfData(p.dataNf || dataHoje)
    setNfChave(p.chaveNf || '')
    setShowNfModal(true)
  }

  const handleSalvarNf = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pedidoVisualizando) return
    if (!nfNumero.trim()) {
      alert('Informe o número da Nota Fiscal.')
      return
    }
    setSalvandoNf(true)
    try {
      const res = await salvarNfFornecedor(pedidoVisualizando.id, {
        numeroNf: nfNumero.trim(),
        dataNf: nfData || dataHoje,
        chaveNf: nfChave.trim() || undefined,
      })
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
      const atualizados = await listPedidosCompra()
      const pAtualizado = atualizados.find((x) => x.id === pedidoVisualizando.id)
      if (pAtualizado) {
        setPedidoVisualizando(pAtualizado)
      }
      setShowNfModal(false)
    } catch (err: any) {
      alert('Erro ao salvar NF: ' + (err?.message || err))
    } finally {
      setSalvandoNf(false)
    }
  }

  // ── Handlers do Modal Gerar Parcelas ──
  const recalcularParcelasLista = (total: number, qtd: number, primeiroVenc: string) => {
    const n = Math.max(1, qtd)
    const valorBase = Math.floor((total / n) * 100) / 100
    const diferencaCentavos = Math.round((total - valorBase * n) * 100) / 100

    const lista: { numero: number; vencimento: string; valor: number }[] = []
    for (let i = 0; i < n; i++) {
      const venc = i === 0 ? primeiroVenc : somarDias(primeiroVenc, i * 30)
      const val = i === 0 ? Number((valorBase + diferencaCentavos).toFixed(2)) : valorBase
      lista.push({ numero: i + 1, vencimento: venc, valor: val })
    }
    return lista
  }

  const handleAbrirParcelasModal = (p: PedidoCompra) => {
    const totalComFrete = (p.total || 0) + (p.frete || 0)
    const forma = p.formaPagamento || 'Boleto'
    const tag = p.contaSaidaTag || ''
    const qtd = p.numeroParcelas || 1
    const primeiroVenc = p.dataVencimento || somarDias(dataHoje, 30)

    setParcelasForma(forma)
    setParcelasTag(tag)
    setParcelasQtd(qtd)
    setParcelasPrimeiroVenc(primeiroVenc)
    setParcelasLista(recalcularParcelasLista(totalComFrete, qtd, primeiroVenc))
    setShowParcelasModal(true)
  }

  const handleAlterarQtdParcelas = (novaQtd: number) => {
    setParcelasQtd(novaQtd)
    if (pedidoVisualizando) {
      const totalComFrete = (pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0)
      setParcelasLista(recalcularParcelasLista(totalComFrete, novaQtd, parcelasPrimeiroVenc))
    }
  }

  const handleAlterarPrimeiroVenc = (novoVenc: string) => {
    setParcelasPrimeiroVenc(novoVenc)
    if (pedidoVisualizando) {
      const totalComFrete = (pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0)
      setParcelasLista(recalcularParcelasLista(totalComFrete, parcelasQtd, novoVenc))
    }
  }

  const handleEditarParcelaLinha = (idx: number, campo: 'vencimento' | 'valor', valor: any) => {
    setParcelasLista((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [campo]: valor } : item))
    )
  }

  const handleConfirmarSalvarParcelas = async () => {
    if (!pedidoVisualizando) return
    setSalvandoParcelas(true)
    try {
      const res = await gerarParcelasCompra(pedidoVisualizando.id, {
        formaPagamento: parcelasForma,
        contaSaidaTag: parcelasTag.trim() || undefined,
        parcelas: parcelasLista,
      })
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
      const atualizados = await listPedidosCompra()
      const pAtualizado = atualizados.find((x) => x.id === pedidoVisualizando.id)
      if (pAtualizado) {
        setPedidoVisualizando(pAtualizado)
      }
      setShowParcelasModal(false)
    } catch (err: any) {
      alert('Erro ao gerar parcelas: ' + (err?.message || err))
    } finally {
      setSalvandoParcelas(false)
    }
  }

  // ── Handler Cancelar Pedido ──
  const handleCancelarPedido = async (id: string) => {
    if (!window.confirm('Deseja realmente cancelar este pedido de compra?')) return
    const res = await cancelarPedidoCompra(id)
    if (!res.ok) {
      alert(res.erro)
      return
    }
    await loadData()
    const atualizados = await listPedidosCompra()
    const pAtualizado = atualizados.find((x) => x.id === id)
    if (pAtualizado && pedidoVisualizando?.id === id) {
      setPedidoVisualizando(pAtualizado)
    }
  }

  // ── Handler Excluir Pedido ──
  const handleExcluirPedido = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir definitivamente este pedido de compra? Esta ação não pode ser desfeita.')) return
    const res = await deletePedidoCompra(id)
    if (!res.ok) {
      alert(res.erro)
      return
    }
    await loadData()
    if (pedidoVisualizando?.id === id) {
      setPedidoVisualizando(null)
    }
  }

  // Helper para abrir visualização do pedido
  const handleAbrirVisualizacao = (p: PedidoCompra) => {
    setPedidoVisualizando(p)
  }

  // Helper de Status / Etapa
  const getStatusBadgeInfo = (p: PedidoCompra) => {
    if (p.status === 'cancelado') {
      return {
        label: 'CANCELADO',
        className: 'bg-rose-50 text-rose-700 border-rose-200',
        dotClass: 'bg-rose-500',
      }
    }
    if (p.status === 'recebido') {
      return {
        label: 'RECEBIDO',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
      }
    }
    if (p.status === 'recebido_parcial') {
      return {
        label: 'REC. PARCIAL',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
      }
    }
    if (p.status === 'emitido' || p.numeroNf) {
      return {
        label: 'NF FÁBRICA',
        className: 'bg-sky-50 text-[#0D6BAF] border-sky-200 font-extrabold',
        dotClass: 'bg-[#0D6BAF]',
      }
    }
    return {
      label: 'CRIADO',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
      dotClass: 'bg-slate-400',
    }
  }

  // Filtragem dos pedidos da tela de listagem
  const mesFiltroStr = `${filtroAno}-${filtroMesNum}`
  const pedidosNoMes = useMemo(() => {
    return pedidos.filter((p) => {
      const dataRef = p.dataPedido || p.dataEmissao
      if (!dataRef) return false
      return dataRef.startsWith(mesFiltroStr)
    })
  }, [pedidos, mesFiltroStr])

  const pedidosFiltrados = useMemo(() => {
    return pedidosNoMes.filter((p) => {
      const matchBusca =
        !busca.trim() ||
        p.fornecedor.toLowerCase().includes(busca.toLowerCase()) ||
        String(p.numero).toLowerCase().includes(busca.toLowerCase()) ||
        (p.observacao && p.observacao.toLowerCase().includes(busca.toLowerCase())) ||
        (p.itens && p.itens.some((i) => i.produto_nome.toLowerCase().includes(busca.toLowerCase())))

      const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
      return matchBusca && matchStatus
    })
  }, [pedidosNoMes, busca, filtroStatus])

  // Métricas dos 4 Cards de KPIs estilo Vendas
  const kpis = useMemo(() => {
    let orcadoValor = 0
    let orcadoCount = 0
    let nfFabricaValor = 0
    let nfFabricaCount = 0
    let recebidoValor = 0
    let recebidoCount = 0
    let totalMesValor = 0
    let totalMesCount = 0

    for (const p of pedidosNoMes) {
      const val = (p.total || 0) + (p.frete || 0)
      if (p.status !== 'cancelado') {
        totalMesValor += val
        totalMesCount++
      }

      if (p.status === 'rascunho') {
        orcadoValor += val
        orcadoCount++
      } else if (p.status === 'emitido') {
        nfFabricaValor += val
        nfFabricaCount++
      } else if (p.status === 'recebido' || p.status === 'recebido_parcial') {
        recebidoValor += val
        recebidoCount++
      }
    }

    return {
      orcadoValor,
      orcadoCount,
      nfFabricaValor,
      nfFabricaCount,
      recebidoValor,
      recebidoCount,
      totalMesValor,
      totalMesCount,
    }
  }, [pedidosNoMes])

  // Contagem para as abas de status
  const contagemAbas = useMemo(() => {
    return {
      todos: pedidosNoMes.length,
      rascunho: pedidosNoMes.filter((p) => p.status === 'rascunho').length,
      emitido: pedidosNoMes.filter((p) => p.status === 'emitido').length,
      recebido: pedidosNoMes.filter((p) => p.status === 'recebido' || p.status === 'recebido_parcial').length,
      cancelado: pedidosNoMes.filter((p) => p.status === 'cancelado').length,
    }
  }, [pedidosNoMes])

  // Último pedido do fornecedor selecionado (para banner informativo inteligente)
  const ultimoPedidoDoFornecedor = useMemo(() => {
    if (!formFornecedor) return null
    return pedidos.find((p) => p.fornecedor.toLowerCase() === formFornecedor.toLowerCase())
  }, [pedidos, formFornecedor])

  // Dias até recebimento calculados
  const diasAteRecebimento = useMemo(() => {
    if (!formDataRecebimentoPrevista) return 0
    const diffMs = new Date(formDataRecebimentoPrevista).getTime() - new Date(formDataPedido || dataHoje).getTime()
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
  }, [formDataRecebimentoPrevista, formDataPedido, dataHoje])

  // ──────────────────────────────────────────────────────────────────────────
  // TELA 1: NOVO PEDIDO DE COMPRA (IMAGEM 01)
  // ──────────────────────────────────────────────────────────────────────────
  if (viewMode === 'novo') {
    return (
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 font-sans">
        {/* Voltar para pedidos de compra */}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setViewMode('lista')}
            style={{
              background: 'none',
              border: 'none',
              color: '#0D5BA3',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 0,
            }}
          >
            ← Pedidos de compra
          </button>
        </div>

        {/* Título e Subtítulo + Pill de Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0F2A43' }}>
              {isVisualizacao
                ? `Visualizar Pedido #${pedidoEdicao?.numero}`
                : pedidoEdicao
                ? `Editar Pedido #${pedidoEdicao.numero}`
                : 'Novo pedido de compra'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#475569' }}>
              {isVisualizacao
                ? 'Detalhes do pedido recebido e itens comprados (Modo Somente Leitura).'
                : 'Três passos rápidos: de quem comprar, o que comprar e quando pagar e receber.'}
            </p>
          </div>

          <div
            style={{
              background: isVisualizacao ? '#DCFCE7' : '#E4EEE6',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              color: isVisualizacao ? '#15803D' : '#334155',
            }}
          >
            {isVisualizacao ? '✓ Recebido · Somente Leitura' : 'Rascunho · ainda não salvo'}
          </div>
        </div>

        {/* Grid Principal: 3 Passos à Esquerda + Resumo à Direita */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : 'minmax(0, 1fr) 360px', gap: 24, alignItems: 'flex-start' }}>
          {/* Coluna da Esquerda: Passos 1, 2 e 3 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── PASSO 1: DE QUEM VOCÊ VAI COMPRAR? ── */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                border: '1px solid #D7E4DA',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: '#DCFCE7',
                    color: '#15803D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  ✓
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F2A43' }}>
                  1. De quem você vai comprar?
                </h2>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Fornecedor
                </label>
                <select
                  disabled={isVisualizacao}
                  value={formFornecedor}
                  onChange={(e) => setFormFornecedor(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: 14,
                    color: '#0F2A43',
                    background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: isVisualizacao ? 'default' : 'pointer',
                  }}
                >
                  <option value="">Selecione um fornecedor...</option>
                  {fornecedoresCadastrados.map((f) => (
                    <option key={f.id} value={f.trade_name}>
                      {f.trade_name}
                    </option>
                  ))}
                  {fornecedoresCadastrados.length === 0 && (
                    <option value="SOUZA INDUSTRIA E COMERCIO DE COLCHOES LTDA">
                      SOUZA INDUSTRIA E COMERCIO DE COLCHOES LTDA
                    </option>
                  )}
                </select>
              </div>

              {/* Banner Informativo do Último Pedido (quando fornecedor selecionado) */}
              {ultimoPedidoDoFornecedor && (
                <div
                  style={{
                    marginTop: 16,
                    background: '#F1F7F2',
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: '#334155',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Último pedido a este fornecedor:</span>
                  <strong style={{ color: '#0F2A43' }}>
                    {formatarData(ultimoPedidoDoFornecedor.dataEmissao)} · {formatarMoeda(ultimoPedidoDoFornecedor.total)}
                  </strong>
                  <span
                    style={{
                      background: ultimoPedidoDoFornecedor.status === 'recebido' ? '#DCFCE7' : '#E3EEFA',
                      color: ultimoPedidoDoFornecedor.status === 'recebido' ? '#15803D' : '#0D5BA3',
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                      marginLeft: 'auto',
                    }}
                  >
                    {ultimoPedidoDoFornecedor.status === 'recebido' ? '✓ Recebido' : `● ${ultimoPedidoDoFornecedor.status.toUpperCase()}`}
                  </span>
                </div>
              )}
            </div>

            {/* ── PASSO 2: O QUE VOCÊ VAI COMPRAR? ── */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                border: '1px solid #D7E4DA',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: '#DCFCE7',
                    color: '#15803D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  2
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F2A43' }}>
                  2. O que você vai comprar?
                </h2>
              </div>

              {/* Lista de Itens */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {formItens.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid #D7E4DA',
                      borderRadius: 12,
                      padding: '16px',
                      background: '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.8fr) 85px 130px', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                          Produto
                        </label>
                        <select
                          disabled={isVisualizacao}
                          value={item.produto_id}
                          onChange={(e) => handleItemProdutoChange(idx, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '11px 12px',
                            borderRadius: 10,
                            border: '1px solid #CBD5E1',
                            fontSize: 14,
                            color: '#0F2A43',
                            background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                            outline: 'none',
                            boxSizing: 'border-box',
                            cursor: isVisualizacao ? 'default' : 'pointer',
                          }}
                        >
                          <option value="">Selecione um produto...</option>
                          {produtosDisponiveis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                          Qtd.
                        </label>
                        <input
                          type="number"
                          min="1"
                          disabled={isVisualizacao}
                          value={item.quantidade}
                          onChange={(e) => handleItemQuantidadeChange(idx, Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '11px 12px',
                            borderRadius: 10,
                            border: '1px solid #CBD5E1',
                            fontSize: 14,
                            textAlign: 'center',
                            color: '#0F2A43',
                            background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                          Custo unitário (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={isVisualizacao}
                          value={item.preco_unitario}
                          onChange={(e) => handleItemPrecoChange(idx, Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '11px 12px',
                            borderRadius: 10,
                            border: '1px solid #CBD5E1',
                            fontSize: 14,
                            color: '#0F2A43',
                            background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>

                    {/* Subtotal da linha e botão de exclusão */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: '#0F2A43' }}>
                        {formatarMoeda(item.total)}
                      </span>
                      {!isVisualizacao && formItens.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoverItem(idx)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Botão + Adicionar outro produto */}
              {!isVisualizacao && (
                <button
                  type="button"
                  onClick={handleAdicionarItem}
                  style={{
                    marginTop: 16,
                    padding: '11px 18px',
                    borderRadius: 10,
                    border: '1px dashed #0D5BA3',
                    background: '#FFFFFF',
                    color: '#0D5BA3',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  + Adicionar outro produto
                </button>
              )}
            </div>

            {/* ── PASSO 3: QUANDO VOCÊ PAGA E QUANDO CHEGA? ── */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                border: '1px solid #D7E4DA',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: '#0D5BA3',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  3
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F2A43' }}>
                  3. Pagamento, frete e previsão de recebimento
                </h2>
              </div>

              {/* Linha 1: Forma de Pagamento e Frete (R$) */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Forma de Pagamento
                  </label>
                  <select
                    disabled={isVisualizacao}
                    value={formFormaPagamento}
                    onChange={(e) => setFormFormaPagamento(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#0F2A43',
                      background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                      cursor: isVisualizacao ? 'default' : 'pointer',
                    }}
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Frete (R$) <span style={{ color: '#64748B', fontWeight: 400 }}>(opcional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={isVisualizacao}
                    placeholder="0,00"
                    value={formFrete || ''}
                    onChange={(e) => setFormFrete(Math.max(0, Number(e.target.value)))}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: 14,
                      color: '#0F2A43',
                      background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Linha 2: Data do Pedido e Data de Vencimento */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Data do Pedido
                  </label>
                  <input
                    type="date"
                    disabled={isVisualizacao}
                    value={formDataPedido}
                    onChange={(e) => {
                      const nova = e.target.value
                      setFormDataPedido(nova)
                      if (!formJustificativaDataRecebimento) {
                        setFormDataRecebimentoPrevista(somarDias(nova, 20))
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: 14,
                      color: '#0F2A43',
                      background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 4 }}>
                    Pode ser retroativa
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    disabled={isVisualizacao}
                    value={formDataVencimento}
                    onChange={(e) => setFormDataVencimento(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: 14,
                      color: '#0F2A43',
                      background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 4 }}>
                    Vencimento do pagamento (lançamento único)
                  </span>
                </div>
              </div>

              {/* Linha 3: Conta de Saída (Tag) e Previsão de Recebimento */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    <Tag size={14} color="#0D5BA3" />
                    Conta de Saída (Tag / Origem do recurso)
                  </label>
                  <input
                    type="text"
                    disabled={isVisualizacao}
                    placeholder="Ex: #Inter, #Caixa, #BB, #Nubank"
                    value={formContaSaidaTag}
                    onChange={(e) => setFormContaSaidaTag(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: 14,
                      color: '#0F2A43',
                      background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {/* Tags Rápidas das Contas Cadastradas */}
                  {!isVisualizacao && contasBancarias.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: '#64748B', alignSelf: 'center' }}>Atalhos:</span>
                      {contasBancarias.map((cb) => {
                        const tagNome = `#${cb.nome.replace(/\s+/g, '')}`
                        const isSelecionado = formContaSaidaTag.toLowerCase().includes(cb.nome.toLowerCase()) || formContaSaidaTag === tagNome
                        return (
                          <button
                            key={cb.id}
                            type="button"
                            onClick={() => setFormContaSaidaTag(tagNome)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              border: isSelecionado ? '1px solid #0D5BA3' : '1px solid #CBD5E1',
                              background: isSelecionado ? '#E3EEFA' : '#F8FAFC',
                              color: isSelecionado ? '#0D5BA3' : '#475569',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span>{tagNome}</span>
                            <span style={{ opacity: 0.7 }}>({formatarMoeda(cb.saldoAtual)})</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Previsão de recebimento
                  </label>
                  <input
                    type="date"
                    disabled={isVisualizacao}
                    value={formDataRecebimentoPrevista}
                    onChange={(e) => setFormDataRecebimentoPrevista(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: 14,
                      color: '#0F2A43',
                      background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 4 }}>
                    Padrão: 20 dias corridos a partir do pedido ({diasAteRecebimento} dias)
                  </span>
                </div>
              </div>

              {/* Justificativa caso data de recebimento seja alterada */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Justificativa da data de recebimento <span style={{ color: '#64748B', fontWeight: 400 }}>(opcional)</span>
                </label>
                <input
                  type="text"
                  disabled={isVisualizacao}
                  placeholder="Ex: Fornecedor solicitou prazo adicional de fabricação..."
                  value={formJustificativaDataRecebimento}
                  onChange={(e) => setFormJustificativaDataRecebimento(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: 14,
                    color: '#0F2A43',
                    background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Observação <span style={{ color: '#64748B', fontWeight: 400 }}>(opcional)</span>
                </label>
                <textarea
                  rows={2}
                  readOnly={isVisualizacao}
                  value={formObservacao}
                  onChange={(e) => setFormObservacao(e.target.value)}
                  placeholder="Ex: Instruções de entrega, condições comerciais ou notas fiscais..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: 14,
                    color: '#0F2A43',
                    background: isVisualizacao ? '#F8FAFC' : '#FFFFFF',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: isVisualizacao ? 'none' : 'vertical',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Card Resumo do Pedido */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              border: '1px solid #D7E4DA',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              position: isMobile || isTablet ? 'static' : 'sticky',
              top: 24,
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#0F2A43' }}>
              Resumo do pedido
            </h3>

            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#1E293B', lineHeight: 1.5 }}>
              Você está pedindo <strong>{formItens.filter((i) => i.produto_id).length} item(ns)</strong> à{' '}
              <strong>{formFornecedor ? formFornecedor.split(' ')[0] : '...'}</strong>, pagando com{' '}
              <strong>{formFormaPagamento}</strong>.
            </p>

            <div style={{ borderTop: '1px solid #D7E4DA', borderBottom: '1px solid #D7E4DA', padding: '14px 0', margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {formItens.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#475569' }}>
                    {it.produto_nome ? it.produto_nome.split('[')[0] : 'Produto não selecionado'} × {it.quantidade}
                  </span>
                  <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formatarMoeda(it.total)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, paddingTop: 6, borderTop: '1px dashed #E2E8F0' }}>
                <span style={{ color: '#475569' }}>Subtotal Itens</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formatarMoeda(totalCalculado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>Frete</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formatarMoeda(formFrete || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>Data do Pedido</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formatarData(formDataPedido)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>Vencimento</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formDataVencimento ? formatarData(formDataVencimento) : 'À vista'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>Previsão de Recebimento</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formatarData(formDataRecebimentoPrevista)}</span>
              </div>
              {formContaSaidaTag && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#475569' }}>Conta Saída</span>
                  <span style={{ color: '#0D5BA3', fontWeight: 700 }}>{formContaSaidaTag}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '18px 0' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#334155', display: 'block' }}>Total do pedido</span>
                <span style={{ fontSize: 11, color: '#64748B' }}>(Itens + Frete)</span>
              </div>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#0D5BA3' }}>
                {formatarMoeda(totalCalculado + (Number(formFrete) || 0))}
              </span>
            </div>

            {isVisualizacao ? (
              <div
                style={{
                  background: '#F0FDF4',
                  border: '1.5px solid #BBF7D0',
                  borderRadius: 12,
                  padding: '14px',
                  marginBottom: 12,
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#15803D', fontWeight: 800, fontSize: 14 }}>
                  ✓ Pedido Recebido
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#166534', lineHeight: 1.4 }}>
                  Este pedido já foi recebido e integrado ao estoque físico e financeiro. Para editá-lo, desfaça o recebimento na listagem.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {/* Botão de Salvar Rascunho */}
                <button
                  type="button"
                  onClick={() => handleSalvarPedido(false)}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: 12,
                    background: '#0D5BA3',
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(13, 91, 163, 0.2)',
                  }}
                >
                  {pedidoEdicao ? 'Salvar alterações' : 'Salvar como Rascunho (Criado)'}
                </button>

                {/* Botão Salvar e Emitir Diretamente (se novo) */}
                {!pedidoEdicao && (
                  <button
                    type="button"
                    onClick={() => handleSalvarPedido(true)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 12,
                      background: '#F0FDF4',
                      border: '1.5px solid #15803D',
                      color: '#15803D',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span>Salvar e Emitir Pedido</span>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setViewMode('lista')}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 10,
                background: '#FFFFFF',
                color: '#0F2A43',
                fontSize: 14,
                fontWeight: 700,
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
              }}
            >
              {isVisualizacao ? 'Voltar para lista' : 'Cancelar'}
            </button>

            <p style={{ margin: '14px 0 0', fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
              O ciclo do pedido segue as etapas: <strong>Criado → Emitido → Recebido</strong>, avançadas por você conforme o andamento real.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TELA 2: LISTAGEM DE PEDIDOS DE COMPRA ESTILO PEDIDO DE VENDAS
  // ──────────────────────────────────────────────────────────────────────────
  const somaParcelas = parcelasLista.reduce((acc, it) => acc + (Number(it.valor) || 0), 0)

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 font-sans relative">
      {/* ── CABEÇALHO PRINCIPAL DA PÁGINA (ESTILO VENDAS) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 shadow-xs">
              <ShoppingCart size={22} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              PEDIDOS DE COMPRA
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
            Gerencie pedidos de compras junto aos fornecedores e fábricas por etapas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleIniciarNovoPedido}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D6BAF] hover:bg-[#095287] text-white px-3.5 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
          >
            <Plus size={14} />
            <span>Novo Pedido</span>
          </button>
        </div>
      </div>

      {/* ── CARDS DE KPIS RESPONSIVOS (ESTILO VENDAS) ── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Criados / Em Aberto */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Em Aberto (Criados)
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
              {kpis.orcadoCount} {kpis.orcadoCount === 1 ? 'pedido em rascunho' : 'pedidos em rascunho'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400" />
        </div>

        {/* KPI 2: NF Fábrica */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              NF Fábrica
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
              {formatarMoeda(kpis.nfFabricaValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              {kpis.nfFabricaCount} {kpis.nfFabricaCount === 1 ? 'aguardando entrega' : 'aguardando entrega'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-500" />
        </div>

        {/* KPI 3: Recebidos no Estoque */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recebidos no Estoque
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <PackageCheck size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
              {formatarMoeda(kpis.recebidoValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Entrada no estoque confirmada
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* KPI 4: Total Comprado no Mês */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Comprado no Mês
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Truck size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black tabular-nums text-slate-900">
              {formatarMoeda(kpis.totalMesValor)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              {kpis.totalMesCount} {kpis.totalMesCount === 1 ? 'pedido no período' : 'pedidos no período'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500" />
        </div>
      </div>

      {/* ── CARD COM ABAS, SELEÇÃO DE ANO/MÊS, BUSCA E TABELA (ESTILO VENDAS) ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* Abas de Status */}
        <div className="flex gap-4 border-b border-slate-100 pb-3 overflow-x-auto">
          {[
            { value: 'todos', label: 'TODOS', count: contagemAbas.todos },
            { value: 'rascunho', label: 'CRIADOS / PROPOSTAS', count: contagemAbas.rascunho },
            { value: 'emitido', label: 'NF FÁBRICA', count: contagemAbas.emitido },
            { value: 'recebido', label: 'RECEBIDOS', count: contagemAbas.recebido },
            { value: 'cancelado', label: 'CANCELADOS', count: contagemAbas.cancelado },
          ].map((aba) => {
            const isSelected = filtroStatus === aba.value
            return (
              <button
                key={aba.value}
                type="button"
                onClick={() => setFiltroStatus(aba.value as any)}
                className={`inline-flex items-center gap-2 pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>{aba.label}</span>
                {aba.count > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      isSelected ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {aba.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Filtros de Ano, Mês e Busca */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
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

            <div className="inline-flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0">
              {MESES_LISTA.map((m) => {
                const isSelected = filtroMesNum === m.num
                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => setFiltroMesNum(m.num)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {m.short}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="BUSCAR POR FORNECEDOR, NF OU Nº..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-700 uppercase font-medium outline-none focus:border-sky-500 shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition cursor-pointer shadow-2xs"
              title="Recarregar dados"
            >
              <RotateCcw size={13} className="text-slate-500" />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Tabela de Pedidos de Compra (Semelhante à Tabela de Vendas) */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-700 min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">
                  Nº Compra
                </th>
                <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">
                  Data
                </th>
                <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">
                  Fornecedor
                </th>
                <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">
                  NF Fornecedor
                </th>
                <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">
                  Pagamento
                </th>
                <th className="px-4 py-3.5 text-right font-bold tracking-wider text-slate-400 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                    Nenhum pedido de compra encontrado neste filtro.
                  </td>
                </tr>
              ) : (
                pedidosFiltrados.map((p) => {
                  const statusBadge = getStatusBadgeInfo(p)
                  const dataFormatada = p.dataPedido ? formatarData(p.dataPedido) : p.dataEmissao ? formatarData(p.dataEmissao) : '—'
                  const totalComFrete = (p.total || 0) + (p.frete || 0)

                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleAbrirVisualizacao(p)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {/* Nº Compra Clicável para abrir o Drawer */}
                      <td className="px-4 py-4 tabular-nums">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAbrirVisualizacao(p)
                          }}
                          className="inline-flex items-center gap-1.5 text-sky-700 hover:text-sky-950 font-black hover:underline group cursor-pointer text-left text-xs"
                          title="Clique para abrir detalhes e ações deste pedido"
                        >
                          <Eye size={13} className="text-sky-500 group-hover:scale-110 transition-transform shrink-0" />
                          <span>#{p.numero}</span>
                        </button>
                      </td>

                      {/* Data */}
                      <td className="px-4 py-4 text-slate-600 font-medium whitespace-nowrap">
                        {dataFormatada}
                      </td>

                      {/* Fornecedor */}
                      <td className="px-4 py-4 font-bold text-slate-900">
                        <div className="max-w-[260px] truncate" title={p.fornecedor}>
                          {p.fornecedor}
                        </div>
                        {p.observacao && (
                          <div className="text-[10px] font-normal text-slate-400 truncate max-w-[260px]">
                            {p.observacao}
                          </div>
                        )}
                      </td>

                      {/* Status / Etapa (Criado / NF Fábrica / Recebido / Cancelado) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border ${statusBadge.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`} />
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* NF Fornecedor */}
                      <td className="px-4 py-4 text-slate-600 font-medium whitespace-nowrap">
                        {p.numeroNf ? (
                          <span className="inline-flex items-center gap-1 text-slate-800 font-bold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            <FileText size={12} className="text-slate-500" />
                            NF {p.numeroNf}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Não informada</span>
                        )}
                      </td>

                      {/* Pagamento */}
                      <td className="px-4 py-4 text-slate-600 font-medium whitespace-nowrap">
                        <span className="block font-bold text-slate-800 uppercase text-xs">
                          {p.formaPagamento || 'A DEFINIR'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {p.numeroParcelas && p.numeroParcelas > 1 ? `${p.numeroParcelas}x parcelado` : 'À vista / Parcela única'}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-4 text-right font-black text-slate-900 tabular-nums whitespace-nowrap text-sm">
                        {formatarMoeda(totalComFrete)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BOTÃO FLUTUANTE ADICIONAR (ESTILO VENDAS) ── */}
      <button
        type="button"
        onClick={handleIniciarNovoPedido}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0D6BAF] text-white shadow-xl hover:bg-[#095287] active:scale-95 transition-all cursor-pointer"
        title="Criar novo pedido de compra"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ── DRAWER DE DETALHES E VISUALIZAÇÃO DO PEDIDO (ESTILO VENDAS) ── */}
      {pedidoVisualizando && (
        <>
          {/* Backdrop escuro com clique para fechar */}
          <div
            onClick={() => setPedidoVisualizando(null)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 transition-opacity duration-300"
          />

          {/* Drawer Lateral Deslizante */}
          <div
            className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out font-sans animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-modal="true"
          >
            {/* Header do Drawer */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#0D6BAF] text-white">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <ShoppingCart size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight leading-tight">
                    Pedido de Compra #{pedidoVisualizando.numero}
                  </h2>
                  <p className="text-xs text-sky-100/90 font-medium">
                    {pedidoVisualizando.fornecedor}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPedidoVisualizando(null)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar visualização"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Etapa e Status */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Etapa Atual
                  </span>
                  {(() => {
                    const badge = getStatusBadgeInfo(pedidoVisualizando)
                    return (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${badge.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                        {badge.label}
                      </span>
                    )
                  })()}
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Total do Pedido
                  </span>
                  <span className="text-xl font-black text-[#0D6BAF] tabular-nums">
                    {formatarMoeda((pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0))}
                  </span>
                </div>
              </div>

              {/* Informações Principais (Datas e NF) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Data do Pedido */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Data do Pedido</span>
                  <p className="text-xs font-bold text-slate-800">
                    {pedidoVisualizando.dataPedido
                      ? formatarData(pedidoVisualizando.dataPedido)
                      : pedidoVisualizando.dataEmissao
                      ? formatarData(pedidoVisualizando.dataEmissao)
                      : '—'}
                  </p>
                </div>

                {/* Previsão de Recebimento */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Previsão Recebimento</span>
                  <p className="text-xs font-bold text-slate-800">
                    {pedidoVisualizando.dataRecebimentoPrevista
                      ? formatarData(pedidoVisualizando.dataRecebimentoPrevista)
                      : pedidoVisualizando.dataPrevistaEntrega
                      ? formatarData(pedidoVisualizando.dataPrevistaEntrega)
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Bloco NF Fornecedor */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#0D6BAF]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      NF do Fornecedor / Fábrica
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAbrirNfModal(pedidoVisualizando)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0D6BAF] bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer border border-sky-200"
                  >
                    <span>{pedidoVisualizando.numeroNf ? 'Alterar NF' : '+ Informar NF'}</span>
                  </button>
                </div>

                {pedidoVisualizando.numeroNf ? (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 text-sm">NF nº {pedidoVisualizando.numeroNf}</span>
                      {pedidoVisualizando.dataNf && (
                        <span className="text-slate-500 text-xs block">
                          Emitida em {formatarData(pedidoVisualizando.dataNf)}
                        </span>
                      )}
                    </div>
                    {pedidoVisualizando.chaveNf && (
                      <span className="text-[10px] font-mono text-slate-400 max-w-[200px] truncate" title={pedidoVisualizando.chaveNf}>
                        Chave: {pedidoVisualizando.chaveNf}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="pt-1 text-xs text-slate-400 font-medium">
                    Ainda não foi informada a nota fiscal emitida pela fábrica para este pedido.
                  </p>
                )}
              </div>

              {/* Bloco Condições de Pagamento e Parcelas */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-[#0D6BAF]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Condição de Pagamento & Parcelas
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAbrirParcelasModal(pedidoVisualizando)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0D6BAF] bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer border border-sky-200"
                  >
                    <span>Gerar / Alterar Parcelas</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Forma / Condição</span>
                    <strong className="text-slate-800 block">{pedidoVisualizando.formaPagamento || 'Boleto'}</strong>
                    <span className="text-slate-500 text-[11px]">
                      {pedidoVisualizando.numeroParcelas && pedidoVisualizando.numeroParcelas > 1
                        ? `${pedidoVisualizando.numeroParcelas} parcelas`
                        : '1x (À vista / Parcela única)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Vencimento</span>
                    <strong className="text-slate-800 block">
                      {pedidoVisualizando.dataVencimento ? formatarData(pedidoVisualizando.dataVencimento) : '—'}
                    </strong>
                    {pedidoVisualizando.contaSaidaTag && (
                      <span className="text-[#0D6BAF] font-bold text-[11px] block">
                        {pedidoVisualizando.contaSaidaTag}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Detalhamento Financeiro */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Subtotal dos Itens:</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatarMoeda(pedidoVisualizando.total || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Frete:</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatarMoeda(pedidoVisualizando.frete || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-black text-[#0D6BAF] pt-2 border-t border-slate-200">
                  <span>TOTAL DO PEDIDO:</span>
                  <span className="tabular-nums text-base">
                    {formatarMoeda((pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0))}
                  </span>
                </div>
              </div>

              {/* Itens do Pedido com Barra de Progresso */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-[#0D6BAF]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Itens do Pedido & Entrega ({pedidoVisualizando.itens?.length || 0})
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {pedidoVisualizando.itens?.map((it) => {
                    const jaRecebido = it.quantidade_recebida ?? 0
                    const pct = it.quantidade > 0 ? Math.min(100, Math.round((jaRecebido / it.quantidade) * 100)) : 0
                    const isCompleto = jaRecebido >= it.quantidade

                    return (
                      <div
                        key={it.produto_id}
                        className={`p-3.5 rounded-xl border ${
                          isCompleto ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <strong className="text-xs font-bold text-slate-900 block truncate">
                              {it.produto_nome}
                            </strong>
                            <span className="text-[11px] text-slate-500">
                              {it.quantidade} un × {formatarMoeda(it.preco_unitario)} = {formatarMoeda(it.total)}
                            </span>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${
                              isCompleto
                                ? 'bg-emerald-100 text-emerald-800'
                                : jaRecebido > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isCompleto ? 'Recebido' : jaRecebido > 0 ? 'Parcial' : 'Pendente'}
                          </span>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className={`h-full rounded-full transition-all ${
                                isCompleto ? 'bg-emerald-600' : 'bg-amber-500'
                              }`}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 tabular-nums shrink-0">
                            {jaRecebido} / {it.quantidade} un ({pct}%)
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Histórico de Recebimentos Parciais */}
              {pedidoVisualizando.recebimentos && pedidoVisualizando.recebimentos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-[#0D6BAF]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Histórico de Recebimentos ({pedidoVisualizando.recebimentos.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {pedidoVisualizando.recebimentos.map((rec: RecebimentoCompra, rIdx: number) => (
                      <div key={rIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>Lote #{rIdx + 1}</span>
                          <span>{formatarData(rec.data)}</span>
                        </div>
                        {rec.itens.map((rit, itIdx) => (
                          <div key={itIdx} className="flex justify-between text-slate-600 text-[11px]">
                            <span>• {rit.produto_nome || 'Item'}</span>
                            <span className="font-bold text-emerald-700">+{rit.quantidade_recebida} un</span>
                          </div>
                        ))}
                        {rec.justificativa && (
                          <p className="text-[10px] text-slate-400 italic pt-1">
                            Obs: {rec.justificativa}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── FOOTER DO DRAWER COM AS 5 FUNÇÕES SOLICITADAS ── */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. Editar */}
                <button
                  type="button"
                  onClick={() => {
                    handleEditarPedido(pedidoVisualizando)
                    setPedidoVisualizando(null)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Editar dados e itens do pedido"
                >
                  <Edit3 size={14} className="text-slate-600" />
                  <span>Editar</span>
                </button>

                {/* 2. NF Fornecedor */}
                <button
                  type="button"
                  onClick={() => handleAbrirNfModal(pedidoVisualizando)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Informar ou editar número da Nota Fiscal emitida"
                >
                  <FileText size={14} className="text-[#0D6BAF]" />
                  <span>NF Fornecedor</span>
                </button>

                {/* 3. Gerar Parcelas */}
                <button
                  type="button"
                  onClick={() => handleAbrirParcelasModal(pedidoVisualizando)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Confirmar parcelamento e vencimentos no contas a pagar"
                >
                  <CreditCard size={14} className="text-[#0D6BAF]" />
                  <span>Gerar Parcelas</span>
                </button>

                {/* Ação de Receber no Estoque (quando emitido ou parcial) */}
                {(pedidoVisualizando.status === 'emitido' || pedidoVisualizando.status === 'recebido_parcial') && (
                  <button
                    type="button"
                    onClick={() => {
                      handleAbrirRecebimento(pedidoVisualizando)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    title="Dar entrada física dos itens no estoque"
                  >
                    <Package size={14} />
                    <span>Receber Itens</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* 4. Cancelar */}
                {pedidoVisualizando.status !== 'cancelado' && (
                  <button
                    type="button"
                    onClick={() => handleCancelarPedido(pedidoVisualizando.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold transition-all cursor-pointer"
                    title="Cancelar pedido de compra"
                  >
                    <XCircle size={14} />
                    <span>Cancelar</span>
                  </button>
                )}

                {/* 5. Excluir */}
                <button
                  type="button"
                  onClick={() => handleExcluirPedido(pedidoVisualizando.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all cursor-pointer"
                  title="Excluir pedido definitivamente"
                >
                  <Trash2 size={14} />
                  <span>Excluir</span>
                </button>

                {/* Fechar */}
                <button
                  type="button"
                  onClick={() => setPedidoVisualizando(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL NF FORNECEDOR (INFORMAR NOTA FISCAL EMITIDA PELA FÁBRICA) ── */}
      {showNfModal && pedidoVisualizando && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-[#0D6BAF]" />
                <h3 className="text-base font-bold text-slate-900">
                  Nota Fiscal do Fornecedor
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNfModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Informe a nota fiscal emitida pelo fornecedor para o Pedido #{pedidoVisualizando.numero}.
              Ao informar a nota, o pedido avança para a etapa <strong>NF Fábrica</strong>.
            </p>

            <form onSubmit={handleSalvarNf} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600">
                  Número da Nota Fiscal (NF-e) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 00123456"
                  value={nfNumero}
                  onChange={(e) => setNfNumero(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-1.5">
                  <Calendar size={14} className="text-[#0D6BAF]" />
                  Data de Emissão da NF
                </label>
                <input
                  type="date"
                  value={nfData}
                  onChange={(e) => setNfData(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0D6BAF] cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600">
                  Chave de Acesso / Observação da NF (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Chave de 44 dígitos ou observações"
                  value={nfChave}
                  onChange={(e) => setNfChave(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-mono text-slate-700 outline-none focus:border-[#0D6BAF]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNfModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoNf}
                  className="rounded-xl bg-[#0D6BAF] hover:bg-[#095287] text-white px-5 py-2 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {salvandoNf ? 'Salvando...' : 'Salvar NF Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL GERAR PARCELAS (CONFIRMAR FORMA, VENCIMENTO E Nº PARCELAS) ── */}
      {showParcelasModal && pedidoVisualizando && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard size={20} className="text-[#0D6BAF]" />
                <h3 className="text-base font-bold text-slate-900">
                  Gerar e Confirmar Parcelas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowParcelasModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resumo do Valor */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Total a Parcelar</span>
                <p className="text-lg font-black text-[#0D6BAF] tabular-nums">
                  {formatarMoeda((pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0))}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <span>Itens: {formatarMoeda(pedidoVisualizando.total || 0)}</span>
                {pedidoVisualizando.frete ? <span className="block">+ Frete: {formatarMoeda(pedidoVisualizando.frete)}</span> : null}
              </div>
            </div>

            {/* Configuração */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600">
                  Forma de Pagamento
                </label>
                <select
                  value={parcelasForma}
                  onChange={(e) => setParcelasForma(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#0D6BAF] bg-white cursor-pointer"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600">
                  Conta Saída (Tag)
                </label>
                <input
                  type="text"
                  placeholder="#Inter, #Caixa..."
                  value={parcelasTag}
                  onChange={(e) => setParcelasTag(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0D6BAF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600">
                  Número de Parcelas
                </label>
                <select
                  value={parcelasQtd}
                  onChange={(e) => handleAlterarQtdParcelas(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#0D6BAF] bg-white cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 24].map((n) => (
                    <option key={n} value={n}>
                      {n}x {n === 1 ? '(À vista / Parcela única)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-slate-600">
                  1º Vencimento
                </label>
                <input
                  type="date"
                  value={parcelasPrimeiroVenc}
                  onChange={(e) => handleAlterarPrimeiroVenc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0D6BAF] cursor-pointer"
                />
              </div>
            </div>

            {/* Lista das Parcelas */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold uppercase text-slate-600 block">
                Detalhamento das Parcelas
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {parcelasLista.map((parc, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="w-14 font-bold text-slate-600 shrink-0">
                      {idx + 1}ª ({idx + 1}/{parcelasLista.length})
                    </span>
                    <input
                      type="date"
                      value={parc.vencimento}
                      onChange={(e) => handleEditarParcelaLinha(idx, 'vencimento', e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-[#0D6BAF] cursor-pointer"
                    />
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-slate-400 font-bold">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={parc.valor}
                        onChange={(e) => handleEditarParcelaLinha(idx, 'valor', Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:border-[#0D6BAF]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-slate-100 text-slate-700">
                <span>Soma das parcelas:</span>
                <span className={Math.abs(somaParcelas - ((pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0))) < 0.05 ? 'text-emerald-700 font-black' : 'text-amber-600 font-black'}>
                  {formatarMoeda(somaParcelas)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowParcelasModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvandoParcelas}
                onClick={handleConfirmarSalvarParcelas}
                className="rounded-xl bg-[#0D6BAF] hover:bg-[#095287] text-white px-5 py-2 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {salvandoParcelas ? 'Salvando...' : 'Confirmar e Gerar Parcelas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RECEBIMENTO POR ITEM (DAR ENTRADA FÍSICA NO ESTOQUE) ── */}
      {showRecebimentoModal && pedidoRecebimento && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Package size={20} className="text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Recebimento de Itens no Estoque · Pedido #{pedidoRecebimento.numero}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecebimentoModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Informe a quantidade recebida de cada item para registrar a entrada física no estoque.
            </p>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500 font-bold uppercase text-[10px]">
                    <th className="p-3">Produto</th>
                    <th className="p-3 text-center">Pedido</th>
                    <th className="p-3 text-center">Já Recebido</th>
                    <th className="p-3 text-center">Pendente</th>
                    <th className="p-3 text-center">Receber Agora</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pedidoRecebimento.itens.map((it) => {
                    const jaRecebido = it.quantidade_recebida ?? 0
                    const pendente = Math.max(0, it.quantidade - jaRecebido)
                    const itemRecebendo = recebimentoItens.find((x) => x.produto_id === it.produto_id)
                    const valorRecebendo = itemRecebendo ? itemRecebendo.quantidade_recebida : 0

                    return (
                      <tr key={it.produto_id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <strong className="block text-slate-900">{it.produto_nome}</strong>
                          <span className="text-[11px] text-slate-400">{formatarMoeda(it.preco_unitario)} / un</span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700">{it.quantidade}</td>
                        <td className="p-3 text-center font-bold text-emerald-700">{jaRecebido}</td>
                        <td className="p-3 text-center font-bold text-amber-700">{pendente}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max={pendente}
                            disabled={pendente === 0}
                            value={valorRecebendo}
                            onChange={(e) => {
                              const val = Math.min(pendente, Math.max(0, Number(e.target.value)))
                              setRecebimentoItens((prev) =>
                                prev.map((ri) => (ri.produto_id === it.produto_id ? { ...ri, quantidade_recebida: val } : ri))
                              )
                            }}
                            className="w-20 rounded-lg border border-[#0D6BAF] px-2 py-1 text-center text-xs font-bold text-slate-900 outline-none focus:ring-1 focus:ring-[#0D6BAF] disabled:bg-slate-100"
                          />
                        </td>
                        <td className="p-3 text-right">
                          {pendente > 0 && jaRecebido > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAjustarQuantidade(pedidoRecebimento.id, it.produto_id, jaRecebido)}
                              className="px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-bold hover:bg-amber-100 cursor-pointer"
                              title="Encerrar item na quantidade já recebida"
                            >
                              Encerrar em {jaRecebido}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-slate-600">
                Observação do Recebimento (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Entregue via transportadora XPTO, NF informada..."
                value={recebimentoJustificativa}
                onChange={(e) => setRecebimentoJustificativa(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-[#0D6BAF]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRecebimentoModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarRecebimento}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <CheckCircle size={15} />
                <span>Confirmar Entrada no Estoque</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
