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
  Copy,
  Clock,
  PackageCheck,
} from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData, hoje, somarDias } from '../../modules/lib/datas'
import { supabase } from '../../lib/supabaseClient'
import { useCompany } from '../../context/CompanyContext'
import { getCurrentV2User } from '../services/v2AuthService'
import {
  listPedidosVenda,
  savePedidoVenda,
  updatePedidoVenda,
  aprovarPedidoVenda,
  faturarPedidoVenda,
  entregarPedidoVenda,
  cancelarPedidoVenda,
  voltarPedidoVendaStatus,
  excluirPedidoVenda,
  syncPedidosVendaComSupabase,
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PARA FORMATAÇÃO DO NÚMERO DA VENDA: #YYYYMMSEQ (Ex: #202610001)
// ─────────────────────────────────────────────────────────────────────────────
export function gerarNumeroVenda(pedidosExistentes: PedidoVenda[], dataEmissao: string = hoje()): string {
  const ano = dataEmissao.slice(0, 4) || '2026'
  const mes = dataEmissao.slice(5, 7) || '10'
  const prefixo = `#${ano}${mes}`

  let maiorSeq = 0
  for (const p of pedidosExistentes) {
    if (!p.numero) continue
    const limpo = p.numero.replace(/^#/, '').replace(/^PV-/, '')
    if (limpo.startsWith(`${ano}${mes}`)) {
      const seqParte = limpo.slice(6)
      const num = parseInt(seqParte, 10)
      if (!isNaN(num) && num > maiorSeq) {
        maiorSeq = num
      }
    }
  }

  const seqFormatado = String(maiorSeq + 1).padStart(3, '0')
  return `${prefixo}${seqFormatado}`
}

export function formatarNumeroVendaExibicao(numero: string): string {
  if (!numero) return '#202610001'
  if (numero.startsWith('#')) return numero
  if (numero.startsWith('PV-')) {
    const semPv = numero.replace(/^PV-/, '')
    return `#${semPv}`
  }
  return `#${numero}`
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: CAMPO DE PRODUTO AUTOCOMPLETE / PESQUISÁVEL (IMAGENS 04 & 05)
// ─────────────────────────────────────────────────────────────────────────────
interface ProdutoSearchInputProps {
  item: PedidoVendaItem
  index: number
  produtos: V2Product[]
  formTabelaPrecoNome: string
  getPrecosDoProduto: (prodId: string, tabelaNome?: string) => { precoFabrica: number; precoVenda: number; precoSugestao: number }
  onSelectProduct: (index: number, prodId: string) => void
}

function ProdutoSearchInput({
  item,
  index,
  produtos,
  formTabelaPrecoNome,
  getPrecosDoProduto,
  onSelectProduct,
}: ProdutoSearchInputProps) {
  const [buscaTexto, setBuscaTexto] = useState(item.produto_nome || '')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBuscaTexto(item.produto_nome || '')
  }, [item.produto_nome])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const produtosFiltrados = useMemo(() => {
    if (!buscaTexto.trim()) return produtos.slice(0, 8)
    const termo = buscaTexto.toLowerCase().trim()
    return produtos
      .filter(
        (p) =>
          p.name.toLowerCase().includes(termo) ||
          (p.code_sku && p.code_sku.toLowerCase().includes(termo)) ||
          (p.product_line && p.product_line.toLowerCase().includes(termo))
      )
      .slice(0, 10)
  }, [produtos, buscaTexto])

  return (
    <div className="space-y-1 relative" ref={dropdownRef}>
      <label className="text-[11px] font-bold uppercase text-slate-500 flex items-center justify-between">
        <span>Produto do Catálogo *</span>
        {item.produto_id && (
          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
            ✓ Selecionado
          </span>
        )}
      </label>

      <div className="relative">
        <input
          type="text"
          value={buscaTexto}
          onChange={(e) => {
            setBuscaTexto(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Digite o nome ou SKU para pesquisar..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-8 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 shadow-2xs transition"
        />
        <Search
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1 divide-y divide-slate-100">
          {produtosFiltrados.length > 0 ? (
            produtosFiltrados.map((p) => {
              const precos = getPrecosDoProduto(p.id, formTabelaPrecoNome)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProduct(index, p.id)
                    setBuscaTexto(p.name)
                    setIsOpen(false)
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50/80 transition flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      {p.code_sku && <span className="bg-slate-100 px-1 rounded font-mono">{p.code_sku}</span>}
                      {p.product_line && <span>Linha: {p.product_line}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-indigo-700 block">
                      {formatarMoeda(precos.precoSugestao)}
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium">Sugestão</span>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-4 py-3 text-center text-xs text-slate-400 font-medium">
              Nenhum produto encontrado com este termo.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
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

  // State: Comparison Modal (até 5 pedidos do mesmo cliente)
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false)
  const [selectedPropostaIds, setSelectedPropostaIds] = useState<string[]>([])
  const [compareAId, setCompareAId] = useState<string | null>(null)
  const [compareBId, setCompareBId] = useState<string | null>(null)

  // State: Drawer de Detalhes / Visualização / Ações (ao estilo da V2)
  const [visualizandoPedido, setVisualizandoPedido] = useState<PedidoVenda | null>(null)

  // Contexto da Empresa
  const { activeCompanyId } = useCompany()

  // State: Modal de Confirmação de Entrega & Tarefas no CRM (D+3 e D+10)
  const [isModalEntregaOpen, setIsModalEntregaOpen] = useState(false)
  const [pedidoParaEntrega, setPedidoParaEntrega] = useState<PedidoVenda | null>(null)
  const [dataEntregaEfetiva, setDataEntregaEfetiva] = useState(() => dataHoje)
  const [salvandoEntrega, setSalvandoEntrega] = useState(false)

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
  const [formDataEmissao, setFormDataEmissao] = useState(() => dataHoje)
  const [formDataVencimento, setFormDataVencimento] = useState(() => somarDias(dataHoje, 30))
  const [formFrete, setFormFrete] = useState<number>(0)
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

  const [isSyncing, setIsSyncing] = useState(false)
  const handleSincronizarNuvem = async () => {
    setIsSyncing(true)
    try {
      const res = await syncPedidosVendaComSupabase()
      await loadData()
      if (res.ok) {
        if (res.count > 0) {
          alert(`${res.count} pedido(s) sincronizados com a nuvem com sucesso!`)
        } else {
          alert('Todos os pedidos já estão sincronizados com a nuvem!')
        }
      } else if (res.error) {
        alert('Erro ao sincronizar: ' + res.error)
      }
    } finally {
      setIsSyncing(false)
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
      // Ao selecionar 'todos', não pode mostrar os pedidos cancelados
      if (filtroStatus === 'todos') {
        if (p.status === 'cancelado') return false
      } else if (p.status !== filtroStatus) {
        return false
      }

      if (p.dataEmissao) {
        const anoPed = p.dataEmissao.slice(0, 4)
        const mesPed = p.dataEmissao.slice(5, 7)
        if (Number(anoPed) !== filtroAno) return false
        if (mesPed !== filtroMesNum) return false
      }

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
      // 'todos' não inclui pedidos cancelados
      if (p.status !== 'cancelado') {
        counts.todos = (counts.todos || 0) + 1
      }
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

  // ──────────────────────────────────────────────────────────────────────────
  // COMPARAÇÃO: SELECIONAR ATÉ 5 ORÇAMENTOS DO MESMO CLIENTE (REQUISITO NOVO)
  // ──────────────────────────────────────────────────────────────────────────
  const handleToggleSelectProposta = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const ped = pedidos.find((p) => p.id === id)
    if (!ped) return

    setSelectedPropostaIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }

      // Se já houver propostas selecionadas, verificar se é do mesmo cliente
      if (prev.length > 0) {
        const primeiroSelecionado = pedidos.find((p) => p.id === prev[0])
        const mesmoCliente =
          primeiroSelecionado &&
          (primeiroSelecionado.cliente_id && ped.cliente_id
            ? primeiroSelecionado.cliente_id === ped.cliente_id
            : primeiroSelecionado.cliente_nome.toLowerCase().trim() === ped.cliente_nome.toLowerCase().trim())

        if (!mesmoCliente) {
          alert(
            `Você pode selecionar até 5 orçamentos do mesmo cliente para comparar.\n\nCliente selecionado: ${primeiroSelecionado?.cliente_nome}\nTentativa: ${ped.cliente_nome}`
          )
          return prev
        }

        if (prev.length >= 5) {
          alert('Limite máximo de 5 orçamentos para comparação atingido.')
          return prev
        }
      }

      return [...prev, id]
    })
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

    // Tabela marcada como padrão
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
    setFormDataEmissao(dataHoje)
    setFormDataVencimento(somarDias(dataHoje, 30))
    setFormFrete(0)
    setFormContaEntradaTag(contasBancarias[0]?.nome ? `#${contasBancarias[0].nome}` : '#Inter')
    setFormObservacao('')

    // Descontos padrão
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
    setFormDataEmissao(pedido.dataEmissao || dataHoje)
    setFormDataVencimento(pedido.dataVencimento || somarDias(pedido.dataEmissao || dataHoje, 30))
    setFormFrete(pedido.frete || 0)
    setFormContaEntradaTag(pedido.contaEntradaTag || '')
    setFormObservacao(pedido.observacao || '')

    setFormDesconto5xPercentual(pedido.desconto5xPercentual ?? 5)
    setFormDescontoVistaPercentual(pedido.descontoVistaPercentual ?? 10)
    setFormCondicaoSelecionada(pedido.condicaoSelecionada ?? 'sem_desconto')

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
    setVisualizandoPedido(null)
    setViewMode('formulario')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AÇÃO DUPLICAR PEDIDO / PROPOSTA (REQUISITO IMAGEM 03)
  // ──────────────────────────────────────────────────────────────────────────
  const handleDuplicarPedido = (original: PedidoVenda) => {
    setPedidoEdicao(null) // Cria como novo pedido
    setFormCanal(original.canal)
    setFormClienteId(original.cliente_id)
    setFormClienteNome(original.cliente_nome)
    setClienteBuscaTexto(original.cliente_nome)
    setFormClienteDocumento(original.cliente_documento || '')
    setFormClienteCidade(original.cliente_cidade || '')
    setFormTabelaPrecoNome(original.tabela_preco_nome || tabelasPreco[0]?.name || '')
    setFormDataEntrega(somarDias(dataHoje, 10))
    setFormFormaPagamento(original.formaPagamento)
    setFormNumeroParcelas(original.numeroParcelas || 1)
    setFormDataEmissao(dataHoje)
    setFormDataVencimento(somarDias(dataHoje, 30))
    setFormFrete(original.frete || 0)
    setFormContaEntradaTag(original.contaEntradaTag || '')
    setFormObservacao(
      original.observacao
        ? `[Cópia do orçamento ${formatarNumeroVendaExibicao(original.numero)}] ${original.observacao}`
        : `[Cópia do orçamento ${formatarNumeroVendaExibicao(original.numero)}]`
    )
    setFormDesconto5xPercentual(original.desconto5xPercentual ?? 5)
    setFormDescontoVistaPercentual(original.descontoVistaPercentual ?? 10)
    setFormCondicaoSelecionada(original.condicaoSelecionada ?? 'sem_desconto')
    setFormItens(original.itens.map((it) => ({ ...it })))

    setVisualizandoPedido(null)
    setViewMode('formulario')
  }

  // Ações de fluxo de status
  const handleAprovar = async (id: string) => {
    if (!confirm('Deseja aprovar esta proposta e torná-la um Pedido de Venda oficial?')) return
    const res = await aprovarPedidoVenda(id)
    if (res.ok) {
      await loadData()
      setIsCompareModalOpen(false)
      if (visualizandoPedido && visualizandoPedido.id === id) {
        setVisualizandoPedido((prev) => (prev ? { ...prev, status: 'aprovado' } : null))
      }
    } else {
      alert(res.erro)
    }
  }

  const handleFaturar = async (id: string) => {
    if (!confirm('Deseja faturar esta venda? Isso criará as contas a receber no módulo Financeiro.')) return
    const res = await faturarPedidoVenda(id)
    if (res.ok) {
      await loadData()
      if (visualizandoPedido && visualizandoPedido.id === id) {
        setVisualizandoPedido((prev) => (prev ? { ...prev, status: 'faturado' } : null))
      }
    } else {
      alert(res.erro)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AÇÃO ENTREGAR: PREENCHER DATA E AGENDAR TAREFAS NO CRM PARA D+3 E D+10
  // ──────────────────────────────────────────────────────────────────────────
  const handleAbrirModalEntrega = (pedido: PedidoVenda) => {
    setPedidoParaEntrega(pedido)
    setDataEntregaEfetiva(hoje())
    setIsModalEntregaOpen(true)
  }

  const handleConfirmarEntrega = async () => {
    if (!pedidoParaEntrega) return
    if (!dataEntregaEfetiva) {
      alert('Por favor, informe a data da entrega.')
      return
    }

    setSalvandoEntrega(true)
    try {
      // 1. Atualizar status da venda para 'entregue' e salvar data de entrega
      const res = await entregarPedidoVenda(pedidoParaEntrega.id, dataEntregaEfetiva)
      if (!res.ok) {
        alert(res.erro)
        setSalvandoEntrega(false)
        return
      }

      // 2. Calcular datas D+3 e D+10 a partir da data de entrega
      const dataD3 = somarDias(dataEntregaEfetiva, 3)
      const dataD10 = somarDias(dataEntregaEfetiva, 10)
      const dataD3Iso = `${dataD3}T10:00:00.000Z`
      const dataD10Iso = `${dataD10}T10:00:00.000Z`

      // 3. Roteiro dos produtos conforme pedido
      const nomesProdutos =
        pedidoParaEntrega.itens && pedidoParaEntrega.itens.length > 0
          ? pedidoParaEntrega.itens
              .map((it) => `${it.produto_nome}${it.quantidade > 1 ? ` (${it.quantidade} un)` : ''}`)
              .join(', ')
          : 'Produtos do pedido'

      const currentUser = getCurrentV2User()
      const userName = currentUser?.full_name || currentUser?.username || 'Sistema V2'

      // 4. Localizar ou vincular cliente em bem_aviv_clients
      let clienteId = pedidoParaEntrega.cliente_id
      let clienteObj = clientes.find((c) => c.id === clienteId)

      if (!clienteObj) {
        const nomeBuscado = pedidoParaEntrega.cliente_nome.trim().toLowerCase()
        clienteObj = clientes.find((c) => c.full_name.trim().toLowerCase() === nomeBuscado)
        if (clienteObj) clienteId = clienteObj.id
      }

      if (!clienteObj && supabase) {
        try {
          const { data: found } = await supabase
            .from('bem_aviv_clients')
            .select('*')
            .ilike('full_name', `%${pedidoParaEntrega.cliente_nome.trim()}%`)
            .limit(1)
            .maybeSingle()
          if (found) {
            clienteObj = found as BemAvivClient
            clienteId = found.id
          }
        } catch {}
      }

      // Se ainda não existir no cadastro de clientes, criar para garantir o CRM
      if (!clienteObj) {
        const payloadNovoCli: any = {
          full_name: pedidoParaEntrega.cliente_nome.trim(),
          cpf: pedidoParaEntrega.cliente_documento?.trim() || '',
          address_city: pedidoParaEntrega.cliente_cidade?.trim() || null,
          company_id: activeCompanyId || null,
          client_status: 'CLIENTE - COLCHÃO/DIVERSOS',
          commercial_stage: 'FECHADO DEMAIS PRODUTOS',
          next_followup_at: dataD3Iso,
          next_followup_status: 'PENDENTE',
          next_followup_note: `RESUMO: Pós-venda D+3 (Benefícios)\nQuestionar quais os benefícios que sentiu no uso do produto: ${nomesProdutos} (Venda ${formatarNumeroVendaExibicao(pedidoParaEntrega.numero)})`,
        }
        const created = await createClient(payloadNovoCli)
        if (created.data) {
          clienteObj = created.data
          clienteId = created.data.id
        }
      }

      // 5. Se o cliente estiver cadastrado, registrar as tarefas no CRM
      if (clienteId && supabase) {
        const companyIdFinal = activeCompanyId || clienteObj?.company_id || null

        // 5.1 Atualizar o próximo retorno do cliente para D+3
        await supabase
          .from('bem_aviv_clients')
          .update({
            next_followup_at: dataD3Iso,
            next_followup_status: 'PENDENTE',
            next_followup_note: `RESUMO: Pós-venda D+3 (Benefícios do produto)\nQuestionar quais os benefícios que sentiu no uso do(s) produto(s): ${nomesProdutos} (Venda ${formatarNumeroVendaExibicao(pedidoParaEntrega.numero)})`,
          })
          .eq('id', clienteId)

        // 5.2 Inserir tarefa D+3 na tabela unificada de follow-ups
        await supabase.from('bem_aviv_client_followups').insert({
          company_id: companyIdFinal,
          client_id: clienteId,
          contacted_at: dataD3Iso,
          channel: 'AGENDAMENTO',
          result: 'PENDENTE|Pós-venda D+3: Benefícios do produto',
          notes: `Questionar quais os benefícios que sentiu no uso do produto ou dos produtos conforme pedido: ${nomesProdutos} (Venda ${formatarNumeroVendaExibicao(pedidoParaEntrega.numero)})`,
          created_by_name: userName,
        })

        // 5.3 Inserir tarefa D+10 na tabela unificada de follow-ups
        await supabase.from('bem_aviv_client_followups').insert({
          company_id: companyIdFinal,
          client_id: clienteId,
          contacted_at: dataD10Iso,
          channel: 'AGENDAMENTO',
          result: 'PENDENTE|Pós-venda D+10: Benefícios do produto',
          notes: `Questionar quais os benefícios que sentiu no uso do produto ou dos produtos após 10 dias de uso: ${nomesProdutos} (Venda ${formatarNumeroVendaExibicao(pedidoParaEntrega.numero)})`,
          created_by_name: userName,
        })
      }

      // 6. Atualizar bem_aviv_sales_orders se existir no Supabase
      if (supabase) {
        try {
          await supabase
            .from('bem_aviv_sales_orders')
            .update({
              status: 'ENTREGUE',
              delivered_at: dataEntregaEfetiva,
            })
            .or(`id.eq.${pedidoParaEntrega.id},document_number.eq.${pedidoParaEntrega.numero}`)
        } catch {}
      }

      // Recarregar dados e atualizar visualizador
      await loadData()
      if (visualizandoPedido && visualizandoPedido.id === pedidoParaEntrega.id) {
        setVisualizandoPedido((prev) =>
          prev ? { ...prev, status: 'entregue', dataEntrega: dataEntregaEfetiva } : null
        )
      }

      setIsModalEntregaOpen(false)
      setPedidoParaEntrega(null)
    } catch (err: any) {
      alert(`Erro ao registrar entrega e tarefas do CRM: ${err?.message || err}`)
    } finally {
      setSalvandoEntrega(false)
    }
  }

  const handleCancelar = async (id: string) => {
    if (!confirm('Deseja cancelar esta proposta / venda?')) return
    const res = await cancelarPedidoVenda(id)
    if (res.ok) {
      await loadData()
      if (visualizandoPedido && visualizandoPedido.id === id) {
        setVisualizandoPedido((prev) => (prev ? { ...prev, status: 'cancelado' } : null))
      }
    } else {
      alert(res.erro)
    }
  }

  const handleReabrir = async (id: string) => {
    if (!confirm('Deseja reabrir esta venda para o status Proposta?')) return
    const res = await voltarPedidoVendaStatus(id, 'proposta')
    if (res.ok) {
      await loadData()
      if (visualizandoPedido && visualizandoPedido.id === id) {
        setVisualizandoPedido((prev) => (prev ? { ...prev, status: 'proposta' } : null))
      }
    } else {
      alert(res.erro)
    }
  }

  const handleExcluir = async (id: string) => {
    if (
      !confirm(
        'Tem certeza que deseja excluir definitivamente este pedido cancelado do sistema? Esta ação não pode ser desfeita.'
      )
    ) {
      return
    }
    const res = await excluirPedidoVenda(id)
    if (res.ok) {
      await loadData()
      if (visualizandoPedido && visualizandoPedido.id === id) {
        setVisualizandoPedido(null)
      }
      setSelectedPropostaIds((prev) => prev.filter((item) => item !== id))
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

  const formSubtotal = subtotalForm
  const totalSemDesconto = subtotalForm

  const totalAte5x = useMemo(() => {
    const desc = Math.max(0, Math.min(100, formDesconto5xPercentual))
    return Math.round(totalSemDesconto * (1 - desc / 100) * 100) / 100
  }, [totalSemDesconto, formDesconto5xPercentual])

  const totalVista = useMemo(() => {
    const desc = Math.max(0, Math.min(100, formDescontoVistaPercentual))
    return Math.round(totalSemDesconto * (1 - desc / 100) * 100) / 100
  }, [totalSemDesconto, formDescontoVistaPercentual])

  const totalForm = useMemo(() => {
    if (formCondicaoSelecionada === 'ate_5x') return totalAte5x
    if (formCondicaoSelecionada === 'a_vista') return totalVista
    return formItens.reduce((acc, it) => acc + (it.total || 0), 0)
  }, [formCondicaoSelecionada, totalAte5x, totalVista, formItens])

  const formTotalComFrete = totalForm + formFrete
  const descontoTotalForm = Math.max(0, subtotalForm - totalForm)

  // Salvar Formulário: gera número no formato #YYYYMMSEQ (Ex: #202610001)
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

    const numeroGerado = pedidoEdicao ? pedidoEdicao.numero : gerarNumeroVenda(pedidos, formDataEmissao || dataHoje)

    const payload: Omit<PedidoVenda, 'id' | 'created_at' | 'updated_at'> & { id?: string } = {
      id: pedidoEdicao ? pedidoEdicao.id : undefined,
      numero: numeroGerado,
      canal: formCanal,
      status: statusFinal,
      cliente_id: formClienteId,
      cliente_nome: formClienteNome.trim(),
      cliente_documento: formClienteDocumento.trim() || undefined,
      cliente_cidade: formClienteCidade.trim() || undefined,
      tabela_preco_nome: formTabelaPrecoNome,
      dataEmissao: formDataEmissao,
      dataPrevistaEntrega: formDataEntrega || null,
      dataVencimento: formDataVencimento || null,
      formaPagamento: formFormaPagamento,
      numeroParcelas: (formNumeroParcelas && 1) || 1,
      contaEntradaTag: formContaEntradaTag,
      frete: formFrete,
      observacao: formObservacao.trim() || null,
      subtotal: formSubtotal,
      descontoTotal: descontoTotalForm,
      total: formTotalComFrete,
      desconto5xPercentual: formDesconto5xPercentual,
      total5x: totalAte5x + formFrete,
      descontoVistaPercentual: formDescontoVistaPercentual,
      totalVista: totalVista + formFrete,
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
  // TELA 1: FORMULÁRIO DE NOVO PEDIDO / ORÇAMENTO
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
              {pedidoEdicao ? `Editar Pedido ${formatarNumeroVendaExibicao(pedidoEdicao.numero)}` : 'Novo Pedido de Venda / Orçamento'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Defina os produtos, condições de pagamento e salve como Proposta Comercial (Orçamento) ou Pedido Aprovado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSalvarVenda('proposta')}
              className="flex-1 sm:flex-none rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-xs hover:bg-amber-100 active:scale-95 transition-all text-center cursor-pointer"
            >
              Salvar como Orçamento (Proposta)
            </button>
            <button
              type="button"
              onClick={() => handleSalvarVenda('aprovado')}
              className="flex-1 sm:flex-none rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-slate-800 active:scale-95 transition-all text-center cursor-pointer"
            >
              Salvar como Pedido Aprovado
            </button>
          </div>
        </div>

        {/* Grid de Edição Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

                <button
                  type="button"
                  onClick={handleAbrirCadastroRapidoCliente}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <UserPlus size={14} /> + Cadastrar Novo Cliente
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Autocomplete de Cliente */}
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

                  {isClienteDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1 divide-y divide-slate-100">
                      {clientesFiltrados.length > 0 ? (
                        clientesFiltrados.map((cli) => (
                          <button
                            key={cli.id}
                            type="button"
                            onClick={() => handleSelectCliente(cli)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-sky-50/80 transition flex items-center justify-between cursor-pointer"
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
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 cursor-pointer"
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

            {/* Card 2: Produtos e Itens com Busca Autocomplete (Imagens 04 & 05) */}
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  <Plus size={14} /> Adicionar Produto
                </button>
              </div>

              <div className="space-y-4">
                {formItens.map((item, idx) => {
                  const precoRef = item.preco_unitario || item.preco_tabela || 0
                  const precoVendaMin = item.preco_venda_minimo || 0
                  const maxDescontoValor = Math.max(0, precoRef - precoVendaMin)
                  const maxDescontoPerc = precoRef > 0 ? (maxDescontoValor / precoRef) * 100 : 0
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
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        {/* Campo Produto Autocomplete Pesquisável (Imagem 05) */}
                        <div className="sm:col-span-5">
                          <ProdutoSearchInput
                            item={item}
                            index={idx}
                            produtos={produtosDisponiveis}
                            formTabelaPrecoNome={formTabelaPrecoNome}
                            getPrecosDoProduto={getPrecosDoProduto}
                            onSelectProduct={handleSelectProduct}
                          />
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
                            className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors cursor-pointer"
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

          {/* Coluna 3: Condições de Pagamento e TOTALIZAÇÃO EM 3 VALORES */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CreditCard size={18} className="text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase">
                  3. Condições de Pagamento
                </h3>
              </div>

              <div className="space-y-3">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Data do Pedido</label>
                  <input
                    type="date"
                    value={formDataEmissao}
                    onChange={(e) => setFormDataEmissao(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#0F172A', outline: 'none' }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Forma de Pagamento</label>
                  <select
                    value={formFormaPagamento}
                    onChange={(e) => setFormFormaPagamento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {FORMAS_PAGAMENTO.map((fp) => (
                      <option key={fp} value={fp}>
                        {fp}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Frete (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formFrete}
                    onChange={(e) => setFormFrete(Number(e.target.value) || 0)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#0F172A', outline: 'none' }}
                    placeholder="0,00"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Data de Vencimento</label>
                  <input
                    type="date"
                    value={formDataVencimento}
                    onChange={(e) => setFormDataVencimento(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#0F172A', outline: 'none' }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">Previsão de Entrega</label>
                  <input
                    type="date"
                    value={formDataEntrega}
                    onChange={(e) => setFormDataEntrega(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
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

              {/* SIMULAÇÃO COMERCIAL DOS 3 TOTAIS */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Simulação Comercial dos 3 Totais
                </span>

                {/* 1. Total Sem Desconto */}
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

                {/* 2. Total Até 5x (Padrão 5%, editável) */}
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

                {/* 3. Total À Vista (Padrão 10%, editável) */}
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
                <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                  <span>Subtotal (Itens):</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatarMoeda(subtotalForm)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                  <span>Frete:</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatarMoeda(formFrete)}</span>
                </div>
                {descontoTotalForm > 0 && (
                  <div className="flex justify-between items-center text-xs font-medium text-emerald-600">
                    <span>Desconto Aplicado:</span>
                    <span className="font-bold tabular-nums">-{formatarMoeda(descontoTotalForm)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-1 border-t border-slate-100">
                  <span className="uppercase tracking-wider">TOTAL DO PEDIDO:</span>
                  <span className="text-2xl font-black text-slate-950 tabular-nums">
                    {formatarMoeda(formTotalComFrete)}
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
                  className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-xs hover:bg-amber-100 active:scale-95 transition-all text-center cursor-pointer"
                >
                  Salvar como Orçamento (Proposta)
                </button>
                <button
                  type="button"
                  onClick={() => handleSalvarVenda('aprovado')}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-slate-800 active:scale-95 transition-all text-center cursor-pointer"
                >
                  Salvar como Pedido Aprovado
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Simples de Cadastro Rápido de Cliente */}
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
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
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
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoCliente}
                    className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
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
  // TELA 2: LISTAGEM DE PROPOSTAS & PEDIDOS DE VENDAS
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 font-sans relative">
      {/* ── CABEÇALHO PRINCIPAL DA PÁGINA (Botões de topo removidos conforme Imagem 04) ── */}
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

      {/* ── CARDS DE KPIS RESPONSIVOS ── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1 */}
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

        {/* KPI 2 */}
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

        {/* KPI 3 */}
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

        {/* KPI 4 */}
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
        {/* Abas */}
        <div className="flex gap-4 border-b border-slate-100 pb-3 overflow-x-auto">
          {ABAS_STATUS.map((aba) => {
            const isSelected = filtroStatus === aba.value
            const count = contagemAbas[aba.value] ?? 0

            return (
              <button
                key={aba.value}
                type="button"
                onClick={() => setFiltroStatus(aba.value)}
                className={`inline-flex items-center gap-2 pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>{aba.label}</span>
                {aba.value !== 'cancelado' && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      isSelected ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Filtros */}
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
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer ${
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

          <div className="flex items-center gap-2 w-full lg:max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por cliente, documento ou nº..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs font-medium text-slate-800 outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100 transition-all"
              />
            </div>

            <button
              type="button"
              onClick={handleSincronizarNuvem}
              disabled={isSyncing || loading}
              title="Sincronizar pedidos com a nuvem (Supabase)"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition shrink-0 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <RotateCcw size={14} className={isSyncing || loading ? 'animate-spin text-sky-600' : 'text-slate-500'} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── BARRA FLUTUANTE DE COMPARAÇÃO (ATÉ 5 ORÇAMENTOS DO MESMO CLIENTE) ── */}
      {selectedPropostaIds.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-xs">
              {selectedPropostaIds.length}
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900">
                {selectedPropostaIds.length === 1
                  ? '1 orçamento selecionado (selecione mais para comparar até 5 do mesmo cliente)'
                  : `${selectedPropostaIds.length} orçamentos selecionados para comparar`}
              </p>
              <p className="text-[10px] text-indigo-700 font-medium">
                Cliente:{' '}
                <strong>
                  {pedidos.find((p) => p.id === selectedPropostaIds[0])?.cliente_nome}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedPropostaIds.length < 2}
              onClick={() => handleOpenComparar()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
            >
              <Scale size={15} />
              Comparar Agora
            </button>
            <button
              type="button"
              onClick={() => setSelectedPropostaIds([])}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* ── TABELA DE VENDAS E PROPOSTAS (AÇÕES OCULTADAS NA LINHA - REQUISITO IMAGEM 02) ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Carregando pedidos...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700 min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {/* Ícone da coluna de comparação clicável */}
                  <th className="w-12 px-3 py-3.5 text-center text-xs font-bold tracking-wider text-slate-400 uppercase">
                    <button
                      type="button"
                      disabled={selectedPropostaIds.length < 2}
                      onClick={() => handleOpenComparar()}
                      title={
                        selectedPropostaIds.length >= 2
                          ? `Clique para comparar os ${selectedPropostaIds.length} orçamentos selecionados`
                          : 'Marque até 5 orçamentos do mesmo cliente para comparar'
                      }
                      className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-all ${
                        selectedPropostaIds.length >= 2
                          ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700 cursor-pointer animate-pulse'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Scale size={15} />
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Nº Venda</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Data</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Canal</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Cliente</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3.5 text-left font-bold tracking-wider text-slate-400 uppercase">Pagamento</th>
                  <th className="px-4 py-3.5 text-right font-bold tracking-wider text-slate-400 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidosFiltrados.map((p) => {
                  const isCheckedCompare = selectedPropostaIds.includes(p.id)

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Checkbox Comparar */}
                      <td className="px-3 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isCheckedCompare}
                          onChange={(e) => handleToggleSelectProposta(p.id, e as any)}
                          title="Selecionar para comparar orçamentos do mesmo cliente (até 5)"
                          aria-label={`Selecionar venda ${formatarNumeroVendaExibicao(p.numero)} para comparar`}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Nº Venda Clicável para abrir o Drawer de Detalhes (Imagem 02) */}
                      <td className="px-4 py-4 tabular-nums">
                        <button
                          type="button"
                          onClick={() => setVisualizandoPedido(p)}
                          className="inline-flex items-center gap-1.5 text-sky-700 hover:text-sky-950 font-black hover:underline group cursor-pointer text-left text-xs"
                          title="Clique para abrir detalhes, opções e ações deste pedido"
                        >
                          <Eye size={13} className="text-sky-500 group-hover:scale-110 transition-transform shrink-0" />
                          <span>{formatarNumeroVendaExibicao(p.numero)}</span>
                        </button>
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
                          <span className="font-bold text-slate-900 truncate max-w-[240px]">{p.cliente_nome}</span>
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
                    </tr>
                  )
                })}

                {!loading && pedidosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400">
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

      {/* ── BOTÃO FLUTUANTE "+ NOVA VENDA / PROPOSTA" (FAB - REQUISITO IMAGEM 04) ── */}
      <button
        type="button"
        onClick={handleNovoPedido}
        title="Nova Venda / Proposta"
        aria-label="Adicionar Nova Venda ou Proposta"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0D6BAF] text-white shadow-2xl hover:bg-[#095287] hover:scale-105 active:scale-95 transition-all cursor-pointer ring-4 ring-white/80"
      >
        <Plus size={28} strokeWidth={2.8} />
      </button>

      {/* ── MODAL DE COMPARAÇÃO DE ORÇAMENTOS V2 ── */}
      <V2OrcamentosComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        propostas={pedidos}
        selectedIds={selectedPropostaIds}
        initialAId={compareAId}
        initialBId={compareBId}
        onAprovarProposta={handleAprovar}
      />

      {/* ── DRAWER LATERAL DIREITO DE DETALHES E AÇÕES DA VENDA (AO ESTILO DA V2 - IMAGEM 03) ── */}
      {visualizandoPedido && (
        <>
          {/* Backdrop escuro com clique para fechar */}
          <div
            onClick={() => setVisualizandoPedido(null)}
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
                  <ClipboardList size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight leading-tight">
                    Venda {formatarNumeroVendaExibicao(visualizandoPedido.numero)}
                  </h2>
                  <p className="text-[11px] text-white/70 mt-0.5">
                    Canal: {visualizandoPedido.canal === 'distribuicao' ? 'Distribuição' : 'Representação'} · Emissão:{' '}
                    {formatarData(visualizandoPedido.dataEmissao)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {renderStatusBadge(visualizandoPedido.status)}
                <button
                  type="button"
                  onClick={() => setVisualizandoPedido(null)}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Conteúdo com Scroll Independente */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
              {/* Card Cliente */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Cliente & Entrega
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{visualizandoPedido.cliente_nome}</h3>
                    {visualizandoPedido.cliente_cidade && (
                      <p className="text-slate-500 text-[11px] mt-0.5">{visualizandoPedido.cliente_cidade}</p>
                    )}
                    {visualizandoPedido.cliente_documento && (
                      <p className="text-slate-400 text-[10px] mt-0.5">Doc: {visualizandoPedido.cliente_documento}</p>
                    )}
                  </div>

                  <div className="sm:text-right">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">
                      {visualizandoPedido.status === 'entregue' ? 'Data da Entrega' : 'Previsão Entrega'}
                    </span>
                    <span className="font-bold text-slate-800 text-xs">
                      {visualizandoPedido.status === 'entregue' && visualizandoPedido.dataEntrega
                        ? formatarData(visualizandoPedido.dataEntrega)
                        : visualizandoPedido.dataPrevistaEntrega
                          ? formatarData(visualizandoPedido.dataPrevistaEntrega)
                          : 'Não definida'}
                    </span>
                    {visualizandoPedido.dataVencimento && (
                      <div className="mt-1">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block">
                          Vencimento
                        </span>
                        <span className="font-bold text-slate-800 text-xs">
                          {formatarData(visualizandoPedido.dataVencimento)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabela de Produtos */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-slate-500 block">Produtos da Proposta</span>
                <div className="rounded-2xl border border-slate-200/80 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3.5 py-2.5">Item</th>
                        <th className="px-3 py-2.5 text-center">Qtd</th>
                        <th className="px-3 py-2.5 text-right">Preço Unit.</th>
                        <th className="px-3.5 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visualizandoPedido.itens.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-3.5 py-2.5 font-semibold text-slate-800">{it.produto_nome}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums font-bold">{it.quantidade}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                            {formatarMoeda(it.preco_unitario)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black tabular-nums text-slate-900">
                            {formatarMoeda(it.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      {visualizandoPedido.frete !== undefined && visualizandoPedido.frete > 0 && (
                        <>
                          <tr>
                            <td colSpan={3} className="px-3.5 py-1.5 text-right uppercase text-[11px] text-slate-500">
                              Subtotal Itens:
                            </td>
                            <td className="px-3.5 py-1.5 text-right tabular-nums font-semibold text-slate-800">
                              {formatarMoeda(visualizandoPedido.subtotal)}
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-3.5 py-1.5 text-right uppercase text-[11px] text-slate-500">
                              Frete:
                            </td>
                            <td className="px-3.5 py-1.5 text-right tabular-nums font-semibold text-slate-800">
                              {formatarMoeda(visualizandoPedido.frete)}
                            </td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td colSpan={3} className="px-3.5 py-2.5 text-right uppercase text-xs">
                          Total da Venda:
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-sm font-black text-slate-950">
                          {formatarMoeda(visualizandoPedido.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Box com os 3 Totais Comerciais (Imagem 03) */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-slate-500 block">
                  Simulação Comercial das 3 Modalidades
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-[11px]">
                  <div>
                    <span className="text-slate-400 uppercase font-bold block">1. Total sem Desconto</span>
                    <strong className="text-slate-900 text-sm font-black block mt-0.5">
                      {formatarMoeda(visualizandoPedido.subtotal)}
                    </strong>
                    <span className="text-[10px] text-slate-400">Preço de tabela integral</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase font-bold block">
                      2. Até 5x ({visualizandoPedido.desconto5xPercentual ?? 5}% off)
                    </span>
                    <strong className="text-indigo-900 text-sm font-black block mt-0.5">
                      {formatarMoeda(
                        visualizandoPedido.total5x ??
                          visualizandoPedido.subtotal * (1 - (visualizandoPedido.desconto5xPercentual ?? 5) / 100)
                      )}
                    </strong>
                    <span className="text-[10px] text-indigo-700 font-semibold">
                      5x de{' '}
                      {formatarMoeda(
                        (visualizandoPedido.total5x ??
                          visualizandoPedido.subtotal * (1 - (visualizandoPedido.desconto5xPercentual ?? 5) / 100)) / 5
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase font-bold block">
                      3. À Vista ({visualizandoPedido.descontoVistaPercentual ?? 10}% off)
                    </span>
                    <strong className="text-emerald-900 text-sm font-black block mt-0.5">
                      {formatarMoeda(
                        visualizandoPedido.totalVista ??
                          visualizandoPedido.subtotal * (1 - (visualizandoPedido.descontoVistaPercentual ?? 10) / 100)
                      )}
                    </strong>
                    <span className="text-[10px] text-emerald-700 font-semibold">
                      Economia:{' '}
                      {formatarMoeda(
                        visualizandoPedido.subtotal -
                          (visualizandoPedido.totalVista ?? visualizandoPedido.subtotal * 0.9)
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Observações */}
              {visualizandoPedido.observacao && (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
                  <span className="text-slate-400 font-bold uppercase block mb-1 text-[10px]">Observações / Notas</span>
                  <p className="text-slate-700 whitespace-pre-line text-xs">{visualizandoPedido.observacao}</p>
                </div>
              )}
            </div>

            {/* ── RODAPÉ FIXO DO DRAWER COM TODAS AS AÇÕES (DUPLICAR, CANCELAR, ETC.) ── */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/80 space-y-2.5 shrink-0">
              {/* Linha 1 de Ações: Comunicação & Impressão */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `📋 *PROPOSTA / PEDIDO DE VENDA ${formatarNumeroVendaExibicao(visualizandoPedido.numero)}*
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
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
                >
                  <MessageCircle size={15} /> WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
                >
                  <Printer size={15} /> Imprimir
                </button>

                {/* Duplicar Orçamento / Pedido (Requisito Imagem 03) */}
                <button
                  type="button"
                  onClick={() => handleDuplicarPedido(visualizandoPedido)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-100 transition cursor-pointer"
                  title="Duplicar este orçamento como uma nova proposta"
                >
                  <Copy size={15} /> Duplicar
                </button>
              </div>

              {/* Linha 2 de Ações: Status & Edição */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Editar */}
                {(visualizandoPedido.status === 'proposta' || visualizandoPedido.status === 'aprovado') && (
                  <button
                    type="button"
                    onClick={() => handleEditarPedido(visualizandoPedido)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                  >
                    <Edit3 size={15} className="text-indigo-600" />
                    Editar
                  </button>
                )}

                {/* Aprovar Proposta */}
                {visualizandoPedido.status === 'proposta' && (
                  <button
                    type="button"
                    onClick={() => void handleAprovar(visualizandoPedido.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
                  >
                    <CheckCircle size={15} />
                    Aprovar
                  </button>
                )}

                {/* Faturar */}
                {visualizandoPedido.status === 'aprovado' && (
                  <button
                    type="button"
                    onClick={() => void handleFaturar(visualizandoPedido.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-purple-700 transition cursor-pointer shadow-xs"
                  >
                    <DollarSign size={15} />
                    Faturar
                  </button>
                )}

                {/* Confirmar Entrega */}
                {visualizandoPedido.status === 'faturado' && (
                  <button
                    type="button"
                    onClick={() => handleAbrirModalEntrega(visualizandoPedido)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 transition cursor-pointer shadow-xs"
                  >
                    <Truck size={15} />
                    Entregar
                  </button>
                )}

                {/* Cancelar (Requisito Imagem 03) */}
                {visualizandoPedido.status !== 'cancelado' && visualizandoPedido.status !== 'entregue' && (
                  <button
                    type="button"
                    onClick={() => void handleCancelar(visualizandoPedido.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <XCircle size={15} />
                    Cancelar
                  </button>
                )}

                {/* Reabrir se Cancelado */}
                {visualizandoPedido.status === 'cancelado' && (
                  <button
                    type="button"
                    onClick={() => void handleReabrir(visualizandoPedido.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    Reabrir
                  </button>
                )}

                {/* Excluir Definitivamente se Cancelado */}
                {visualizandoPedido.status === 'cancelado' && (
                  <button
                    type="button"
                    onClick={() => void handleExcluir(visualizandoPedido.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                    title="Excluir este pedido cancelado definitivamente do sistema"
                  >
                    <Trash2 size={15} />
                    Excluir
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setVisualizandoPedido(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL CONFIRMAÇÃO DE ENTREGA & CRIAÇÃO DE TAREFAS NO CRM (D+3 e D+10) */}
      {isModalEntregaOpen && pedidoParaEntrega && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-5">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Truck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Confirmar Entrega do Pedido
                  </h3>
                  <p className="text-xs text-slate-500">
                    Venda <span className="font-semibold text-slate-700">{formatarNumeroVendaExibicao(pedidoParaEntrega.numero)}</span> • {pedidoParaEntrega.cliente_nome}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !salvandoEntrega && setIsModalEntregaOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulário: Data de Entrega */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Dia da Entrega <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={dataEntregaEfetiva}
                onChange={(e) => setDataEntregaEfetiva(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none transition shadow-xs"
              />
              <p className="text-[11px] text-slate-400">
                A data informada será a base para o cálculo dos contatos pós-venda.
              </p>
            </div>

            {/* Box explicativo das tarefas do CRM */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-800">
                <Clock size={15} className="text-blue-600" />
                Tarefas automáticas geradas no CRM:
              </div>

              {/* D+3 */}
              <div className="rounded-lg bg-white p-3 border border-blue-100/70 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    1º Contato: D+3 ({somarDias(dataEntregaEfetiva || hoje(), 3).split('-').reverse().join('/')})
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Pós-venda Inicial
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Questionar quais os benefícios que o cliente já sentiu no uso do produto ou dos produtos.
                </p>
              </div>

              {/* D+10 */}
              <div className="rounded-lg bg-white p-3 border border-blue-100/70 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    2º Contato: D+10 ({somarDias(dataEntregaEfetiva || hoje(), 10).split('-').reverse().join('/')})
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Acompanhamento
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Avaliar adaptação e aprofundar os benefícios percebidos após 10 dias de uso.
                </p>
              </div>

              {/* Produtos envolvidos */}
              {pedidoParaEntrega.itens && pedidoParaEntrega.itens.length > 0 && (
                <div className="pt-1 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">Produtos do pedido: </span>
                  {pedidoParaEntrega.itens.map((it) => it.produto_nome).join(', ')}
                </div>
              )}
            </div>

            {/* Rodapé / Ações */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalEntregaOpen(false)}
                disabled={salvandoEntrega}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmarEntrega()}
                disabled={salvandoEntrega || !dataEntregaEfetiva}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PackageCheck size={16} />
                {salvandoEntrega ? 'Registrando Entrega...' : 'Confirmar Entrega e Agendar CRM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

