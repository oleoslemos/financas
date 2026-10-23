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
  desfazerRecebimentoPedidoCompra,
  voltarPedidoParaAberto,
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

const ABAS_STATUS: { value: 'todos' | StatusPedido; label: string }[] = [
  { value: 'todos', label: 'TODOS' },
  { value: 'rascunho', label: 'ABERTOS' },
  { value: 'emitido', label: 'EMITIDOS' },
  { value: 'recebido_parcial', label: 'REC. PARCIAL' },
  { value: 'recebido', label: 'RECEBIDOS' },
  { value: 'cancelado', label: 'CANCELADOS' },
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

  // Ações de transição de etapas pelo usuário
  const handleAvançarParaEmitido = async (pedido: PedidoCompra) => {
    if (window.confirm(`Confirma emitir o Pedido #${pedido.numero}? Ele será integrado ao Contas a Pagar.`)) {
      const res = await emitirPedidoCompra(pedido.id)
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
      const atualizados = await listPedidosCompra()
      const pAtualizado = atualizados.find((x) => x.id === pedido.id)
      if (pAtualizado && pedidoVisualizando?.id === pAtualizado.id) {
        setPedidoVisualizando(pAtualizado)
      }
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

  const handleDesfazerRecebimento = async (pedido: PedidoCompra) => {
    if (window.confirm(`Deseja desfazer o recebimento do Pedido #${pedido.numero}? O estoque lançado será estornado e o pedido voltará para Emitido.`)) {
      const res = await desfazerRecebimentoPedidoCompra(pedido.id)
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
      const atualizados = await listPedidosCompra()
      const pAtualizado = atualizados.find((x) => x.id === pedido.id)
      if (pAtualizado && pedidoVisualizando?.id === pAtualizado.id) {
        setPedidoVisualizando(pAtualizado)
      }
    }
  }

  const handleVoltarParaAberto = async (pedido: PedidoCompra) => {
    if (window.confirm(`Confirma retornar o Pedido #${pedido.numero} para Aberto / Rascunho?`)) {
      const res = await voltarPedidoParaAberto(pedido.id)
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
      const atualizados = await listPedidosCompra()
      const pAtualizado = atualizados.find((x) => x.id === pedido.id)
      if (pAtualizado && pedidoVisualizando?.id === pAtualizado.id) {
        setPedidoVisualizando(pAtualizado)
      }
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

  // Métricas do Card Superior da Imagem 02
  const totalCompradoNoMes = useMemo(() => {
    return pedidosNoMes.reduce((acc, p) => acc + (p.total || 0) + (p.frete || 0), 0)
  }, [pedidosNoMes])

  const aguardandoEntrega = useMemo(() => {
    return pedidosNoMes.filter((p) => p.status === 'emitido' || p.status === 'rascunho' || p.status === 'recebido_parcial').length
  }, [pedidosNoMes])

  // Contagem para as abas
  const contagemAbas = useMemo(() => {
    return {
      todos: pedidosNoMes.length,
      rascunho: pedidosNoMes.filter((p) => p.status === 'rascunho').length,
      emitido: pedidosNoMes.filter((p) => p.status === 'emitido').length,
      recebido_parcial: pedidosNoMes.filter((p) => p.status === 'recebido_parcial').length,
      recebido: pedidosNoMes.filter((p) => p.status === 'recebido').length,
      cancelado: pedidosNoMes.filter((p) => p.status === 'cancelado').length,
    }
  }, [pedidosNoMes])

  // Nome do mês atual por extenso para a frase
  const nomeMesExtenso = MESES_LISTA.find((m) => m.num === filtroMesNum)?.full.toLowerCase() || 'outubro'

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
  // TELA 2: LISTAGEM DE PEDIDOS DE COMPRA (IMAGEM 02)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 font-sans">
      {/* ── HEADER SUPERIOR ── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 14 : 0, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#E3EEFA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShoppingCart size={22} color="#0D5BA3" />
          </div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: '#0F2A43' }}>
            Pedidos de compra
          </h1>
        </div>

        <button
          onClick={handleIniciarNovoPedido}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 22px',
            borderRadius: 12,
            background: '#0D5BA3',
            color: '#FFFFFF',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(13, 91, 163, 0.25)',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          + NOVO PEDIDO
        </button>
      </div>

      {/* ── CARD RESUMO DO MÊS (BANNER) ── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #D7E4DA',
          padding: isMobile ? '16px 18px' : '24px 28px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#DCFCE7',
              color: '#15803D',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            ✓ Tudo em dia · nada pendente de entrega
          </div>

          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0F2A43', lineHeight: 1.35 }}>
            Em {nomeMesExtenso} você fez {pedidosNoMes.length} pedido{pedidosNoMes.length === 1 ? '' : 's'} de compra, somando {formatarMoeda(totalCompradoNoMes)}, e já recebeu tudo.
          </h2>

          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#475569' }}>
            Quando precisar repor algo, é só criar um novo pedido.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div
            style={{
              background: '#F1F7F2',
              borderRadius: 12,
              padding: '16px 20px',
              minWidth: 160,
            }}
          >
            <span style={{ fontSize: 13, color: '#475569', display: 'block', marginBottom: 6 }}>
              Comprado no mês
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#0F2A43' }}>
              {formatarMoeda(totalCompradoNoMes)}
            </span>
          </div>

          <div
            style={{
              background: '#F1F7F2',
              borderRadius: 12,
              padding: '16px 20px',
              minWidth: 160,
            }}
          >
            <span style={{ fontSize: 13, color: '#475569', display: 'block', marginBottom: 6 }}>
              Aguardando entrega
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#15803D' }}>
              {aguardandoEntrega}
            </span>
          </div>
        </div>
      </div>

      {/* ── CARD COM ABAS, SELETOR DE ANO/MÊS E BUSCA ── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #D7E4DA',
          padding: '16px 20px',
          marginBottom: 20,
        }}
      >
        {/* Abas Superiores */}
        <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #D7E4DA', paddingBottom: 12, overflowX: 'auto' }}>
          {ABAS_STATUS.map((aba) => {
            const isSelected = filtroStatus === aba.value
            const count = contagemAbas[aba.value]

            return (
              <button
                key={aba.value}
                onClick={() => setFiltroStatus(aba.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 0',
                  fontSize: 12,
                  fontWeight: 700,
                  color: isSelected ? '#0D5BA3' : '#475569',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderBottom: isSelected ? '2px solid #0D5BA3' : '2px solid transparent',
                  marginBottom: -13,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{aba.label}</span>
                <span
                  style={{
                    background: isSelected ? '#E3EEFA' : '#E4EEE6',
                    color: isSelected ? '#0D5BA3' : '#475569',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 10,
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Linha de Filtros: Ano + Pílulas de Meses + Input de Busca */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Seletor de Ano com Dropdown */}
            <select
              value={filtroAno}
              onChange={(e) => setFiltroAno(Number(e.target.value))}
              style={{
                padding: '8px 14px',
                borderRadius: 22,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                fontWeight: 700,
                color: '#0F2A43',
                background: '#FFFFFF',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {[2024, 2025, 2026, 2027].map((ano) => (
                <option key={ano} value={ano}>
                  {ano} ▾
                </option>
              ))}
            </select>

            {/* Pílulas de Meses (JAN a DEZ) */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
              {MESES_LISTA.map((m) => {
                const isSelected = filtroMesNum === m.num

                return (
                  <button
                    key={m.num}
                    onClick={() => setFiltroMesNum(m.num)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 20,
                      border: 'none',
                      background: isSelected ? '#0D5BA3' : 'transparent',
                      color: isSelected ? '#FFFFFF' : '#334155',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {m.short}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Campo de Busca */}
          <div style={{ position: 'relative', width: 280 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Buscar no extrato/pedidos..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── CARD DO PEDIDO COM STATUS PIPELINE (CONFORME IMAGEM 02) ── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #D7E4DA',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {pedidosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748B' }}>
            Nenhum pedido de compra encontrado para este filtro.
          </div>
        ) : (
          pedidosFiltrados.map((pedido) => (
            <div key={pedido.id} style={{ marginBottom: 16 }}>
              {(() => {
                const isCriado = pedido.status !== 'cancelado'
                const isEmitido = pedido.status === 'emitido' || pedido.status === 'recebido' || pedido.status === 'recebido_parcial'
                const isRecebidoParcial = pedido.status === 'recebido_parcial'
                const isRecebido = pedido.status === 'recebido'

                const totalItensSolicitados = pedido.itens ? pedido.itens.reduce((acc, it) => acc + (it.quantidade || 0), 0) : 0
                const totalItensRecebidos = pedido.itens ? pedido.itens.reduce((acc, it) => acc + (it.quantidade_recebida || 0), 0) : 0
                const pctRecebido = totalItensSolicitados > 0 ? Math.min(100, Math.round((totalItensRecebidos / totalItensSolicitados) * 100)) : 0

                return (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile
                          ? '1fr'
                          : isTablet
                          ? 'minmax(200px, 1.4fr) 100px 120px 110px'
                          : 'minmax(280px, 1.8fr) 110px 140px 140px auto',
                        gap: isMobile ? 12 : 16,
                        alignItems: isMobile ? 'flex-start' : 'center',
                        paddingBottom: 14,
                      }}
                    >
                      {/* 1. Número, Fornecedor e Badges de Pagamento / Conta */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#475569' }}>
                            #{pedido.numero}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background:
                                pedido.status === 'recebido'
                                  ? '#DCFCE7'
                                  : pedido.status === 'recebido_parcial'
                                  ? '#FEF3C7'
                                  : pedido.status === 'emitido'
                                  ? '#E3EEFA'
                                  : '#F1F5F9',
                              color:
                                pedido.status === 'recebido'
                                  ? '#15803D'
                                  : pedido.status === 'recebido_parcial'
                                  ? '#B45309'
                                  : pedido.status === 'emitido'
                                  ? '#0D5BA3'
                                  : '#475569',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {pedido.status === 'rascunho'
                              ? 'RASCUNHO'
                              : pedido.status === 'recebido_parcial'
                              ? 'PARCIAL'
                              : pedido.status}
                          </span>
                        </div>

                        <strong style={{ fontSize: 15, color: '#0F2A43', display: 'block', lineHeight: 1.3 }}>
                          {pedido.fornecedor}
                        </strong>

                        {pedido.observacao && (
                          <span style={{ fontSize: 13, color: '#475569', display: 'block', marginTop: 3 }}>
                            {pedido.observacao}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 8,
                              background: '#E3EEFA',
                              color: '#0D5BA3',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            💳 {pedido.formaPagamento || 'Boleto'}
                          </span>
                          {pedido.contaSaidaTag && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 8,
                                background: '#FEF3C7',
                                color: '#92400E',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              🏷️ {pedido.contaSaidaTag}
                            </span>
                          )}
                        </div>

                        {/* Barra de Progresso de Itens Recebidos */}
                        {(pedido.status === 'emitido' || pedido.status === 'recebido_parcial' || pedido.status === 'recebido') && totalItensSolicitados > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 320 }}>
                            <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${pctRecebido}%`,
                                  height: '100%',
                                  background:
                                    pedido.status === 'recebido'
                                      ? '#15803D'
                                      : pedido.status === 'recebido_parcial'
                                      ? '#F59E0B'
                                      : '#0D5BA3',
                                  borderRadius: 3,
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: pedido.status === 'recebido_parcial' ? '#B45309' : '#475569',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {totalItensRecebidos}/{totalItensSolicitados} un ({pctRecebido}%)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 2. Emissão / Pedido */}
                      <div>
                        <span style={{ fontSize: 13, color: '#475569', display: 'block' }}>Data Pedido</span>
                        <strong style={{ fontSize: 14, color: '#0F2A43', display: 'block', marginTop: 2 }}>
                          {formatarData(pedido.dataPedido || pedido.dataEmissao)}
                        </strong>
                      </div>

                      {/* 3. Previsão de Recebimento */}
                      <div>
                        <span style={{ fontSize: 13, color: '#475569', display: 'block' }}>Prev. Recebimento</span>
                        <strong style={{ fontSize: 14, color: '#0F2A43', display: 'block', marginTop: 2 }}>
                          {formatarData(pedido.dataRecebimentoPrevista || pedido.dataPrevistaEntrega)}
                        </strong>
                        {pedido.dataVencimento && (
                          <span style={{ fontSize: 11, color: '#64748B', display: 'block', marginTop: 2 }}>
                            Venc: {formatarData(pedido.dataVencimento)}
                          </span>
                        )}
                      </div>

                      {/* 4. Total */}
                      <div>
                        <span style={{ fontSize: 13, color: '#475569', display: 'block' }}>Total</span>
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
                          <strong style={{ fontSize: 17, color: '#0F2A43' }}>
                            {formatarMoeda((pedido.total || 0) + (pedido.frete || 0))}
                          </strong>
                          {Boolean(pedido.frete && pedido.frete > 0) && (
                            <span style={{ fontSize: 11, color: '#64748B' }}>
                              (+ {formatarMoeda(pedido.frete ?? 0)} frete)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 5. Pipeline de Status Visual (Criado -> Emitido -> Recebido) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
                        {/* Etapa 1: Criado */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              background: isCriado ? '#15803D' : '#CBD5E1',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ✓
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isCriado ? '#15803D' : '#64748B' }}>
                            Criado
                          </span>
                        </div>

                        <div
                          style={{
                            width: 14,
                            height: 2,
                            background: isEmitido ? '#15803D' : '#CBD5E1',
                          }}
                        />

                        {/* Etapa 2: Emitido */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              background: isEmitido ? '#15803D' : '#E2E8F0',
                              color: isEmitido ? '#fff' : '#64748B',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isEmitido ? '✓' : '2'}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isEmitido ? '#15803D' : '#64748B' }}>
                            Emitido
                          </span>
                        </div>

                        <div
                          style={{
                            width: 14,
                            height: 2,
                            background: isRecebido ? '#15803D' : isRecebidoParcial ? '#F59E0B' : '#CBD5E1',
                          }}
                        />

                        {/* Etapa 3: Recebido / Parcial */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              background: isRecebido ? '#15803D' : isRecebidoParcial ? '#F59E0B' : '#E2E8F0',
                              color: isRecebido || isRecebidoParcial ? '#fff' : '#64748B',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isRecebido ? '✓' : isRecebidoParcial ? '½' : '3'}
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: isRecebido ? '#15803D' : isRecebidoParcial ? '#B45309' : '#64748B',
                            }}
                          >
                            {isRecebidoParcial ? 'Parcial' : 'Recebido'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ações da Linha: Botões de transição e edição/visualização */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingBottom: 16, borderBottom: '1px solid #EDF2F7', flexWrap: 'wrap' }}>
                      {/* Botão Detalhes (Drawer) */}
                      <button
                        onClick={() => setPedidoVisualizando(pedido)}
                        title="Abrir painel lateral de detalhes"
                        style={{
                          padding: '7px 13px',
                          borderRadius: 8,
                          border: '1.5px solid #0D5BA3',
                          background: '#EFF6FF',
                          color: '#0D5BA3',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Eye size={14} />
                        <span>Detalhes</span>
                      </button>

                      {/* Se Rascunho (Criado) */}
                      {pedido.status === 'rascunho' && (
                        <>
                          <button
                            onClick={() => handleAvançarParaEmitido(pedido)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#0D5BA3',
                              color: '#FFFFFF',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span>Emitir Pedido</span>
                            <ArrowRight size={14} />
                          </button>

                          <button
                            onClick={() => handleEditarPedido(pedido)}
                            title="Editar pedido"
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#0D5BA3',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Edit3 size={14} />
                            <span>Editar</span>
                          </button>
                        </>
                      )}

                      {/* Se Emitido */}
                      {pedido.status === 'emitido' && (
                        <>
                          <button
                            onClick={() => handleAbrirRecebimento(pedido)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#15803D',
                              color: '#FFFFFF',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Package size={14} />
                            <span>Receber Itens</span>
                          </button>

                          <button
                            onClick={() => handleEditarPedido(pedido)}
                            title="Editar pedido emitido"
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#0D5BA3',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Edit3 size={14} />
                            <span>Editar</span>
                          </button>

                          <button
                            onClick={() => handleVoltarParaAberto(pedido)}
                            title="Retornar para rascunho"
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #F0B45C',
                              background: '#FFF4E0',
                              color: '#B45309',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <RotateCcw size={14} />
                            <span>Voltar p/ Aberto</span>
                          </button>
                        </>
                      )}

                      {/* Se Recebido Parcial */}
                      {pedido.status === 'recebido_parcial' && (
                        <>
                          <button
                            onClick={() => handleAbrirRecebimento(pedido)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#D97706',
                              color: '#FFFFFF',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Package size={14} />
                            <span>Receber Mais</span>
                          </button>

                          <button
                            onClick={() => handleDesfazerRecebimento(pedido)}
                            title="Desfazer recebimentos e estornar entradas no estoque"
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#B45309',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <RotateCcw size={13} />
                            <span>Desfazer Recebimentos</span>
                          </button>
                        </>
                      )}

                      {/* Se Recebido Total */}
                      {pedido.status === 'recebido' && (
                        <>
                          <span
                            style={{
                              background: '#DCFCE7',
                              color: '#15803D',
                              padding: '6px 12px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <CheckCircle size={15} />
                            Recebido no Estoque
                          </span>

                          {/* Desfazer recebimento: estorna estoque e volta para emitido */}
                          <button
                            onClick={() => handleDesfazerRecebimento(pedido)}
                            title="Desfazer recebimento e estornar entrada no estoque"
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#B45309',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <RotateCcw size={13} />
                            <span>Desfazer Recebimento</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          ))
        )}

        {/* Rodapé do Card */}
        <div style={{ borderTop: '1px solid #D7E4DA', paddingTop: 16, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#475569' }}>
            Não há outros pedidos em {nomeMesExtenso}.
          </span>

          <button
            onClick={handleIniciarNovoPedido}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px dashed #0D5BA3',
              background: '#FFFFFF',
              color: '#0D5BA3',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Criar novo pedido
          </button>
        </div>
      </div>

      {/* ── MODAL: RECEBER ITENS DO PEDIDO ── */}
      {showRecebimentoModal && pedidoRecebimento && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              maxWidth: 680,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#F8FAFC',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={20} color="#0D5BA3" />
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F2A43' }}>
                    Recebimento de Itens — Pedido #{pedidoRecebimento.numero}
                  </h3>
                </div>
                <span style={{ fontSize: 13, color: '#64748B', display: 'block', marginTop: 4 }}>
                  Fornecedor: <strong>{pedidoRecebimento.fornecedor}</strong>
                </span>
              </div>
              <button
                onClick={() => setShowRecebimentoModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 8,
                  color: '#64748B',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                Informe a quantidade entregue fisicamente para cada item. Se o fornecedor não for mais entregar a quantidade restante de algum item, você pode ajustar a quantidade final do pedido para encerrá-lo com abatimento do valor a pagar.
              </p>

              {/* Tabela de Itens */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#334155' }}>Produto</th>
                      <th style={{ padding: '10px 10px', fontWeight: 700, color: '#334155', textAlign: 'center' }}>Pedido</th>
                      <th style={{ padding: '10px 10px', fontWeight: 700, color: '#334155', textAlign: 'center' }}>Já Recebido</th>
                      <th style={{ padding: '10px 10px', fontWeight: 700, color: '#334155', textAlign: 'center' }}>Pendente</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, color: '#0D5BA3', textAlign: 'center' }}>Receber Agora</th>
                      <th style={{ padding: '10px 10px', fontWeight: 700, color: '#334155', textAlign: 'right' }}>Ajustar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidoRecebimento.itens.map((it) => {
                      const jaRecebido = it.quantidade_recebida ?? 0
                      const pendente = Math.max(0, it.quantidade - jaRecebido)
                      const itemRecebendo = recebimentoItens.find((x) => x.produto_id === it.produto_id)
                      const valorRecebendo = itemRecebendo ? itemRecebendo.quantidade_recebida : 0

                      return (
                        <tr key={it.produto_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <strong style={{ display: 'block', color: '#0F2A43' }}>{it.produto_nome}</strong>
                            <span style={{ fontSize: 11, color: '#64748B' }}>{formatarMoeda(it.preco_unitario)} / un</span>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 600 }}>{it.quantidade}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: jaRecebido > 0 ? '#15803D' : '#64748B', fontWeight: 600 }}>
                            {jaRecebido}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: pendente > 0 ? '#D97706' : '#64748B', fontWeight: 700 }}>
                            {pendente}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
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
                              style={{
                                width: 75,
                                padding: '6px 8px',
                                borderRadius: 8,
                                border: '1.5px solid #0D5BA3',
                                textAlign: 'center',
                                fontWeight: 700,
                                fontSize: 14,
                                color: '#0F2A43',
                                background: pendente === 0 ? '#F1F5F9' : '#FFFFFF',
                              }}
                            />
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                            {pendente > 0 && jaRecebido > 0 && (
                              <button
                                type="button"
                                title="Encerrar item com a quantidade já recebida e abater o restante"
                                onClick={() => handleAjustarQuantidade(pedidoRecebimento.id, it.produto_id, jaRecebido)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: '1px solid #CBD5E1',
                                  background: '#F8FAFC',
                                  color: '#B45309',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
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

              {/* Justificativa / Observação do Recebimento */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Observação / Justificativa deste recebimento <span style={{ color: '#64748B', fontWeight: 400 }}>(opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Entregue via transportadora XPTO, NF 123456..."
                  value={recebimentoJustificativa}
                  onChange={(e) => setRecebimentoJustificativa(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    color: '#0F2A43',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 12,
                background: '#F8FAFC',
              }}
            >
              <button
                type="button"
                onClick={() => setShowRecebimentoModal(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarRecebimento}
                style={{
                  padding: '10px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#15803D',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)',
                }}
              >
                <CheckCircle size={16} />
                <span>Confirmar Entrada no Estoque</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DRAWER DE DETALHES DO PEDIDO (LATERAL) ── */}
      {pedidoVisualizando && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 998,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setPedidoVisualizando(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 540,
              height: '100%',
              background: '#FFFFFF',
              boxShadow: '-4px 0 30px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#F8FAFC',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F2A43' }}>
                    Pedido #{pedidoVisualizando.numero}
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background:
                        pedidoVisualizando.status === 'recebido'
                          ? '#DCFCE7'
                          : pedidoVisualizando.status === 'recebido_parcial'
                          ? '#FEF3C7'
                          : pedidoVisualizando.status === 'emitido'
                          ? '#E3EEFA'
                          : '#F1F5F9',
                      color:
                        pedidoVisualizando.status === 'recebido'
                          ? '#15803D'
                          : pedidoVisualizando.status === 'recebido_parcial'
                          ? '#B45309'
                          : pedidoVisualizando.status === 'emitido'
                          ? '#0D5BA3'
                          : '#475569',
                      textTransform: 'uppercase',
                    }}
                  >
                    {pedidoVisualizando.status === 'rascunho'
                      ? 'RASCUNHO'
                      : pedidoVisualizando.status === 'recebido_parcial'
                      ? 'PARCIAL'
                      : pedidoVisualizando.status}
                  </span>
                </div>
                <strong style={{ fontSize: 15, color: '#334155', display: 'block', marginTop: 4 }}>
                  {pedidoVisualizando.fornecedor}
                </strong>
              </div>

              <button
                onClick={() => setPedidoVisualizando(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 8,
                  color: '#64748B',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {/* Card Resumo Financeiro & Prazos */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Data do Pedido</span>
                    <strong style={{ fontSize: 13, color: '#0F2A43' }}>
                      {formatarData(pedidoVisualizando.dataPedido || pedidoVisualizando.dataEmissao)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Vencimento</span>
                    <strong style={{ fontSize: 13, color: '#0F2A43' }}>
                      {pedidoVisualizando.dataVencimento ? formatarData(pedidoVisualizando.dataVencimento) : 'À vista'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Previsão de Recebimento</span>
                    <strong style={{ fontSize: 13, color: '#0F2A43' }}>
                      {formatarData(pedidoVisualizando.dataRecebimentoPrevista || pedidoVisualizando.dataPrevistaEntrega)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Forma de Pagamento</span>
                    <strong style={{ fontSize: 13, color: '#0F2A43' }}>
                      {pedidoVisualizando.formaPagamento || 'Boleto'}
                    </strong>
                  </div>
                </div>

                {pedidoVisualizando.justificativaDataRecebimento && (
                  <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Justificativa do Prazo:</span>
                    <span style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>
                      "{pedidoVisualizando.justificativaDataRecebimento}"
                    </span>
                  </div>
                )}

                {pedidoVisualizando.contaSaidaTag && (
                  <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Conta Saída:</span>
                    <strong style={{ fontSize: 12, color: '#0D5BA3' }}>{pedidoVisualizando.contaSaidaTag}</strong>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 10, marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 4 }}>
                    <span>Subtotal dos itens:</span>
                    <span>{formatarMoeda(pedidoVisualizando.total || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 4 }}>
                    <span>Frete:</span>
                    <span>{formatarMoeda(pedidoVisualizando.frete || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: '#0D5BA3', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #CBD5E1' }}>
                    <span>Total do Pedido:</span>
                    <span>{formatarMoeda((pedidoVisualizando.total || 0) + (pedidoVisualizando.frete || 0))}</span>
                  </div>
                </div>
              </div>

              {/* Seção Itens com Barra de Progresso */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0F2A43', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={16} color="#0D5BA3" />
                  <span>Itens do Pedido & Status de Entrega</span>
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pedidoVisualizando.itens.map((it) => {
                    const jaRecebido = it.quantidade_recebida ?? 0
                    const pendente = Math.max(0, it.quantidade - jaRecebido)
                    const pct = it.quantidade > 0 ? Math.min(100, Math.round((jaRecebido / it.quantidade) * 100)) : 0
                    const isCompleto = jaRecebido >= it.quantidade

                    return (
                      <div
                        key={it.produto_id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: 10,
                          padding: '12px 14px',
                          background: isCompleto ? '#F0FDF4' : '#FFFFFF',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <strong style={{ fontSize: 14, color: '#0F2A43', display: 'block' }}>{it.produto_nome}</strong>
                            <span style={{ fontSize: 12, color: '#64748B' }}>
                              {it.quantidade} un × {formatarMoeda(it.preco_unitario)} = {formatarMoeda(it.total)}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: isCompleto ? '#DCFCE7' : jaRecebido > 0 ? '#FEF3C7' : '#F1F5F9',
                              color: isCompleto ? '#15803D' : jaRecebido > 0 ? '#B45309' : '#64748B',
                            }}
                          >
                            {isCompleto ? 'Completo' : jaRecebido > 0 ? 'Parcial' : 'Pendente'}
                          </span>
                        </div>

                        {/* Barra de Progresso */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: isCompleto ? '#15803D' : '#F59E0B',
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                            {jaRecebido} / {it.quantidade} un ({pct}%)
                          </span>
                        </div>

                        {/* Botão para ajustar item se ainda pendente */}
                        {pendente > 0 && jaRecebido > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => handleAjustarQuantidade(pedidoVisualizando.id, it.produto_id, jaRecebido)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#B45309',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Encerrar item em {jaRecebido} un
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Seção Histórico de Recebimentos */}
              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0F2A43', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={16} color="#0D5BA3" />
                  <span>Histórico de Recebimentos</span>
                </h4>

                {pedidoVisualizando.recebimentos && pedidoVisualizando.recebimentos.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pedidoVisualizando.recebimentos.map((rec: RecebimentoCompra, rIdx: number) => (
                      <div
                        key={rIdx}
                        style={{
                          borderLeft: '3px solid #15803D',
                          background: '#F8FAFC',
                          borderRadius: '0 8px 8px 0',
                          padding: '10px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0F2A43' }}>
                            {formatarData(rec.data)}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748B' }}>Lote #{rIdx + 1}</span>
                        </div>

                        {rec.itens.map((rit, itIdx) => {
                          const prod = pedidoVisualizando.itens.find((x) => x.produto_id === rit.produto_id)
                          return (
                            <div key={itIdx} style={{ fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                              <span>• {prod?.produto_nome || 'Item'}</span>
                              <strong>+{rit.quantidade_recebida} un</strong>
                            </div>
                          )
                        })}

                        {rec.justificativa && (
                          <div style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic', marginTop: 4 }}>
                            Obs: {rec.justificativa}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: 10, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                    Nenhum recebimento registrado ainda.
                  </div>
                )}
              </div>
            </div>

            {/* Footer Ações do Drawer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                gap: 10,
                background: '#F8FAFC',
                flexWrap: 'wrap',
              }}
            >
              {(pedidoVisualizando.status === 'emitido' || pedidoVisualizando.status === 'recebido_parcial') && (
                <button
                  type="button"
                  onClick={() => {
                    handleAbrirRecebimento(pedidoVisualizando)
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#15803D',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Package size={15} />
                  <span>{pedidoVisualizando.status === 'recebido_parcial' ? 'Receber Mais Itens' : 'Receber Itens'}</span>
                </button>
              )}

              {(pedidoVisualizando.status === 'recebido' || pedidoVisualizando.status === 'recebido_parcial') && (
                <button
                  type="button"
                  onClick={() => handleDesfazerRecebimento(pedidoVisualizando)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#B45309',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Desfazer</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPedidoVisualizando(null)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
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
