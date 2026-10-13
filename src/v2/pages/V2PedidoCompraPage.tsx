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
} from 'lucide-react'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData, hoje, somarDias } from '../../modules/lib/datas'
import {
  listPedidosCompra,
  savePedidoCompra,
  updatePedidoCompra,
  emitirPedidoCompra,
  receberPedidoCompra,
  desfazerRecebimentoPedidoCompra,
  voltarPedidoParaAberto,
  PedidoCompra,
  PedidoCompraItem,
  StatusPedido,
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
  const [formDataEntrega, setFormDataEntrega] = useState(() => somarDias(dataHoje, 11))
  const [formObservacao, setFormObservacao] = useState('')

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
    setFormDataEntrega(somarDias(dataHoje, 11))
    setFormObservacao('')
    setViewMode('novo')
  }

  // Visualizar Pedido (Modo somente leitura para pedidos recebidos)
  const handleVisualizarPedido = (p: PedidoCompra) => {
    setPedidoEdicao(p)
    setIsVisualizacao(true)
    setFormFornecedor(p.fornecedor || '')
    setFormItens(p.itens || [])
    setFormParcelas(p.numeroParcelas || 1)
    setFormFormaPagamento(p.formaPagamento || 'Boleto')
    setFormContaSaidaTag(p.contaSaidaTag || '')
    setFormDataEntrega(p.dataPrevistaEntrega || somarDias(dataHoje, 11))
    setFormObservacao(p.observacao || '')
    setViewMode('novo')
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
    setFormParcelas(p.numeroParcelas || 1)
    setFormFormaPagamento(p.formaPagamento || 'Boleto')
    setFormContaSaidaTag(p.contaSaidaTag || '')
    setFormDataEntrega(p.dataPrevistaEntrega || somarDias(dataHoje, 11))
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
          dataPrevistaEntrega: formDataEntrega || null,
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
          dataEmissao: dataHoje,
          dataPrevistaEntrega: formDataEntrega || null,
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
    }
  }

  const handleAvançarParaRecebido = async (pedido: PedidoCompra) => {
    if (window.confirm(`Confirma o recebimento físico do Pedido #${pedido.numero}? Os itens entrarão no estoque.`)) {
      const res = await receberPedidoCompra(pedido.id)
      if (!res.ok) {
        alert(res.erro)
        return
      }
      await loadData()
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
    }
  }

  // Filtragem dos pedidos da tela de listagem
  const mesFiltroStr = `${filtroAno}-${filtroMesNum}`
  const pedidosNoMes = useMemo(() => {
    return pedidos.filter((p) => {
      if (!p.dataEmissao) return false
      return p.dataEmissao.startsWith(mesFiltroStr)
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
    return pedidosNoMes.reduce((acc, p) => acc + (p.total || 0), 0)
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

  // Dias até entrega calculados
  const diasAteEntrega = useMemo(() => {
    if (!formDataEntrega) return 0
    const diffMs = new Date(formDataEntrega).getTime() - new Date(dataHoje).getTime()
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
  }, [formDataEntrega, dataHoje])

  // ──────────────────────────────────────────────────────────────────────────
  // TELA 1: NOVO PEDIDO DE COMPRA (IMAGEM 01)
  // ──────────────────────────────────────────────────────────────────────────
  if (viewMode === 'novo') {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1180, margin: '0 auto', fontFamily: 'inherit' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 24, alignItems: 'flex-start' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) 85px 130px', gap: 12 }}>
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
                  3. Como você paga e de qual conta sai?
                </h2>
              </div>

              {/* Linha 1: Forma de Pagamento e Condição / Parcelas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
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
                    Condição / Parcelas
                  </label>
                  <select
                    disabled={isVisualizacao}
                    value={formParcelas}
                    onChange={(e) => setFormParcelas(Number(e.target.value))}
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
                    <option value={1}>À vista (1x)</option>
                    <option value={2}>2x Parcelado</option>
                    <option value={3}>3x Parcelado</option>
                    <option value={4}>4x Parcelado</option>
                    <option value={6}>6x Parcelado</option>
                    <option value={10}>10x Parcelado</option>
                    <option value={12}>12x Parcelado</option>
                  </select>
                </div>
              </div>

              {/* Linha 2: Conta de Saída (Tag) e Previsão de Entrega */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
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
                    Previsão de entrega
                  </label>
                  <input
                    type="date"
                    disabled={isVisualizacao}
                    value={formDataEntrega}
                    onChange={(e) => setFormDataEntrega(e.target.value)}
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
                    Daqui a {diasAteEntrega} dias
                  </span>
                </div>
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
              position: 'sticky',
              top: 24,
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#0F2A43' }}>
              Resumo do pedido
            </h3>

            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#1E293B', lineHeight: 1.5 }}>
              Você está pedindo <strong>{formItens.filter((i) => i.produto_id).length} item(ns)</strong> à{' '}
              <strong>{formFornecedor ? formFornecedor.split(' ')[0] : '...'}</strong>, pagando{' '}
              <strong>{formFormaPagamento} ({formParcelas === 1 ? 'à vista' : `${formParcelas}x`})</strong>.
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                <span style={{ color: '#475569' }}>Pagamento</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>
                  {formFormaPagamento} · {formParcelas === 1 ? '1x à vista' : `${formParcelas}x`}
                </span>
              </div>
              {formContaSaidaTag && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#475569' }}>Conta Saída</span>
                  <span style={{ color: '#0D5BA3', fontWeight: 700 }}>{formContaSaidaTag}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#475569' }}>Entrega prevista</span>
                <span style={{ color: '#0F2A43', fontWeight: 600 }}>{formatarData(formDataEntrega)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '18px 0' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>Total estimado</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#0D5BA3' }}>{formatarMoeda(totalCalculado)}</span>
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
    <div style={{ padding: '24px 32px', maxWidth: 1180, margin: '0 auto', fontFamily: 'inherit' }}>
      {/* ── HEADER SUPERIOR ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
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
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0F2A43' }}>
            Pedidos de compra
          </h1>
        </div>

        <button
          onClick={handleIniciarNovoPedido}
          style={{
            display: 'flex',
            alignItems: 'center',
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
          padding: '24px 28px',
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
                const isRecebido = pedido.status === 'recebido'

                return (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(280px, 1.8fr) 110px 140px 140px auto',
                        gap: 16,
                        alignItems: 'center',
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
                              padding: '1px 6px',
                              borderRadius: 6,
                              background:
                                pedido.status === 'recebido'
                                  ? '#DCFCE7'
                                  : pedido.status === 'emitido'
                                  ? '#E3EEFA'
                                  : '#F1F5F9',
                              color:
                                pedido.status === 'recebido'
                                  ? '#15803D'
                                  : pedido.status === 'emitido'
                                  ? '#0D5BA3'
                                  : '#475569',
                              textTransform: 'uppercase',
                            }}
                          >
                            {pedido.status === 'rascunho' ? 'RASCUNHO' : pedido.status}
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
                      </div>

                      {/* 2. Emissão */}
                      <div>
                        <span style={{ fontSize: 13, color: '#475569', display: 'block' }}>Emissão</span>
                        <strong style={{ fontSize: 14, color: '#0F2A43', display: 'block', marginTop: 2 }}>
                          {formatarData(pedido.dataEmissao)}
                        </strong>
                      </div>

                      {/* 3. Previsão de Entrega */}
                      <div>
                        <span style={{ fontSize: 13, color: '#475569', display: 'block' }}>Previsão entrega</span>
                        <strong style={{ fontSize: 14, color: '#0F2A43', display: 'block', marginTop: 2 }}>
                          {formatarData(pedido.dataPrevistaEntrega)}
                        </strong>
                      </div>

                      {/* 4. Total */}
                      <div>
                        <span style={{ fontSize: 13, color: '#475569', display: 'block' }}>Total</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                          <strong style={{ fontSize: 17, color: '#0F2A43' }}>
                            {formatarMoeda(pedido.total)}
                          </strong>
                          <span style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>
                            {pedido.numeroParcelas || 1}x
                          </span>
                        </div>
                      </div>

                      {/* 5. Pipeline de Status Visual (Criado -> Emitido -> Recebido) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        {/* Etapa 1: Criado */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
                            background: isRecebido ? '#15803D' : '#CBD5E1',
                          }}
                        />

                        {/* Etapa 3: Recebido */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              background: isRecebido ? '#15803D' : '#E2E8F0',
                              color: isRecebido ? '#fff' : '#64748B',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isRecebido ? '✓' : '3'}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isRecebido ? '#15803D' : '#64748B' }}>
                            Recebido
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ações da Linha: Botões de transição e edição/visualização */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingBottom: 16, borderBottom: '1px solid #EDF2F7' }}>
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
                            onClick={() => handleAvançarParaRecebido(pedido)}
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
                            <CheckCircle size={14} />
                            <span>Receber Pedido (Dar Entrada Estoque)</span>
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

                      {/* Se Recebido */}
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

                          {/* Visualizar: obrigatório, não pode editar quando recebido */}
                          <button
                            onClick={() => handleVisualizarPedido(pedido)}
                            title="Visualizar detalhes do pedido (somente leitura)"
                            style={{
                              padding: '7px 14px',
                              borderRadius: 8,
                              border: '1.5px solid #0D5BA3',
                              background: '#EFF6FF',
                              color: '#0D5BA3',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Eye size={15} />
                            <span>Visualizar Pedido</span>
                          </button>

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
    </div>
  )
}
