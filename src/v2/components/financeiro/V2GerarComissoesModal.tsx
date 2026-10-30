import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Percent,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Search,
  Check,
  Info,
} from 'lucide-react'
import {
  listPedidosVenda,
  PedidoVenda,
  gerarComissaoPedidoVenda,
  estornarComissaoPedidoVenda,
} from '../../services/v2PedidoVendasService'
import { listContasPagar, ContaPagar } from '../../services/v2ContasPagarService'
import { listRepresentantes, Representante } from '../../services/v2SettingsService'
import { formatarMoeda } from '../../../modules/lib/money'
import { formatarData } from '../../../modules/lib/datas'

interface V2GerarComissoesModalProps {
  isOpen: boolean
  onClose: () => void
  onComissoesAtualizadas: () => Promise<void>
}

interface LinhaComissaoItem {
  pedido: PedidoVenda
  contaReceber: ContaPagar
  valorVenda: number
  valorRecebido: number
  dataBaixa: string
  pagamentoFabricaPadrao: number
  pagamentoFabrica: number
  resultadoLiquido: number
  taxaPercentual: number
  comissaoTotalCalculada: number
  totalJaGerado: number
  saldoRestante: number
  valorGerar: number
  vendedor: string
  vencimento: string
  contasComissaoGeradas: ContaPagar[]
  status: 'pendente' | 'parcial' | 'gerada'
}

export const V2GerarComissoesModal: React.FC<V2GerarComissoesModalProps> = ({
  isOpen,
  onClose,
  onComissoesAtualizadas,
}) => {
  if (!isOpen) return null

  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [carregando, setCarregando] = useState(true)

  const [filtroAba, setFiltroAba] = useState<'pendentes' | 'parciais' | 'geradas' | 'todos'>('pendentes')
  const [filtroMes, setFiltroMes] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null)
  const [erroMsg, setErroMsg] = useState<string | null>(null)

  // Configurações e valores editáveis por linha (pedidoId -> { vendedor, taxa, pagamentoFabrica, valorGerar, vencimento })
  const [configLinhas, setConfigLinhas] = useState<
    Record<
      string,
      {
        vendedor?: string
        taxa?: number
        pagamentoFabrica?: number
        valorGerar?: number
        vencimento?: string
      }
    >
  >({})

  // Seleção em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [gerandoLote, setGerandoLote] = useState(false)

  // Vencimento padrão sugerido: dia 15 do próximo mês
  const vencimentoPadrao = useMemo(() => {
    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = hoje.getMonth() + 1
    const proxMes = mes === 12 ? 1 : mes + 1
    const proxAno = mes === 12 ? ano + 1 : ano
    return `${proxAno}-${String(proxMes).padStart(2, '0')}-15`
  }, [])

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const [listaVendas, listaContas, listaReps] = await Promise.all([
        listPedidosVenda(),
        listContasPagar(),
        listRepresentantes(),
      ])
      setPedidos(listaVendas)
      setContas(listaContas)
      setRepresentantes(listaReps)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregarDados()
  }, [])

  // Meses disponíveis com títulos baixados
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>()
    contas.forEach((c) => {
      if (c.tipo === 'receber' && c.status === 'paga') {
        const dataRef = c.data_baixa || c.parcelas?.[0]?.baixa?.dataBaixa || c.vencimento
        if (dataRef) set.add(dataRef.slice(0, 7))
      }
    })
    return Array.from(set).sort().reverse()
  }, [contas])

  // Montar itens de comissão (Apenas vendas que já foram BAIXADAS/LIQUIDADAS no financeiro)
  const linhasComissao = useMemo<LinhaComissaoItem[]>(() => {
    const repPadrao = representantes.find((r) => r.is_default) || representantes[0]
    const taxaPadrao = repPadrao ? repPadrao.commission_rate || 50 : 50
    const nomePadrao = repPadrao ? repPadrao.name : 'Vendedor Padrão'

    const out: LinhaComissaoItem[] = []

    pedidos.forEach((p) => {
      if (p.status === 'cancelado') return

      // Buscar a conta a receber deste pedido
      const contaReceber = contas.find(
        (c) => c.pedido_id === p.id && c.tipo === 'receber'
      )

      // Regra de Ouro: Só comissiona títulos que JÁ FORAM BAIXADOS no financeiro
      if (!contaReceber || contaReceber.status !== 'paga') {
        return
      }

      const dataBaixa =
        contaReceber.data_baixa ||
        contaReceber.parcelas?.[0]?.baixa?.dataBaixa ||
        p.dataEmissao

      // Filtro de mês (competência = mês da baixa)
      if (filtroMes !== 'todos' && !dataBaixa.startsWith(filtroMes)) {
        return
      }

      // Valores numéricos da regra
      const valorVenda = Number(p.total) || Number(contaReceber.total) || 0
      const valorRecebido = Number(
        (contaReceber as any).valorPago || contaReceber.totalPago || contaReceber.total || valorVenda
      )

      // Pagamento Fábrica padrão (soma do custo de fábrica dos itens)
      let custoFabricaPadrao = 0
      if (p.itens && p.itens.length > 0) {
        p.itens.forEach((it) => {
          if (it.preco_fabrica && it.preco_fabrica > 0) {
            custoFabricaPadrao += it.preco_fabrica * (it.quantidade || 1)
          }
        })
      }
      custoFabricaPadrao = Number(custoFabricaPadrao.toFixed(2))

      const cfg = configLinhas[p.id] || {}
      const vendedor = cfg.vendedor || p.vendedor_nome || nomePadrao
      const taxaPercentual = cfg.taxa != null ? cfg.taxa : (p.comissao_percentual != null ? Number(p.comissao_percentual) : taxaPadrao)
      const pagamentoFabrica = cfg.pagamentoFabrica != null ? cfg.pagamentoFabrica : (p.pagamento_fabrica != null ? Number(p.pagamento_fabrica) : custoFabricaPadrao)

      // Resultado Líquido = Valor Recebido - Pagamento Fábrica
      const resultadoLiquido = Math.max(0, Number((valorRecebido - pagamentoFabrica).toFixed(2)))

      // Comissão Total Calculada = Resultado Líquido * taxa %
      const comissaoTotalCalculada = Number(((resultadoLiquido * taxaPercentual) / 100).toFixed(2))

      // Buscar contas a pagar de comissão já geradas para este pedido
      const contasComissaoGeradas = contas.filter(
        (c) => c.pedido_id === p.id && c.tipo === 'pagar' && c.categoria === 'Comissões'
      )
      const totalJaGerado = Number(
        contasComissaoGeradas.reduce((acc, c) => acc + (Number(c.total) || 0), 0).toFixed(2)
      )

      // Saldo restante
      const saldoRestante = Math.max(0, Number((comissaoTotalCalculada - totalJaGerado).toFixed(2)))

      // Valor padrão a gerar no input
      const valorGerar = cfg.valorGerar != null ? cfg.valorGerar : saldoRestante

      let status: 'pendente' | 'parcial' | 'gerada' = 'pendente'
      if (totalJaGerado >= comissaoTotalCalculada && comissaoTotalCalculada > 0) {
        status = 'gerada'
      } else if (totalJaGerado > 0) {
        status = 'parcial'
      }

      out.push({
        pedido: p,
        contaReceber,
        valorVenda,
        valorRecebido,
        dataBaixa,
        pagamentoFabricaPadrao: custoFabricaPadrao,
        pagamentoFabrica,
        resultadoLiquido,
        taxaPercentual,
        comissaoTotalCalculada,
        totalJaGerado,
        saldoRestante,
        valorGerar,
        vendedor,
        vencimento: cfg.vencimento || vencimentoPadrao,
        contasComissaoGeradas,
        status,
      })
    })

    return out
  }, [pedidos, contas, representantes, filtroMes, configLinhas, vencimentoPadrao])

  // Atualizar campo editável por linha
  const atualizarCampoLinha = (
    pedidoId: string,
    campo: 'vendedor' | 'taxa' | 'pagamentoFabrica' | 'valorGerar' | 'vencimento',
    valor: any
  ) => {
    setConfigLinhas((prev) => ({
      ...prev,
      [pedidoId]: {
        ...(prev[pedidoId] || {}),
        [campo]: valor,
      },
    }))
  }

  // Filtrar itens pela aba e pela busca
  const itensFiltrados = useMemo(() => {
    return linhasComissao.filter((item) => {
      // Aba
      if (filtroAba === 'pendentes' && item.saldoRestante <= 0) return false
      if (filtroAba === 'parciais' && item.status !== 'parcial') return false
      if (filtroAba === 'geradas' && item.status !== 'gerada') return false

      // Busca
      if (busca.trim()) {
        const term = busca.toLowerCase()
        const numMatch = item.pedido.numero.toLowerCase().includes(term)
        const cliMatch = item.pedido.cliente_nome.toLowerCase().includes(term)
        const vendMatch = item.vendedor.toLowerCase().includes(term)
        return numMatch || cliMatch || vendMatch
      }
      return true
    })
  }, [linhasComissao, filtroAba, busca])

  // Contadores
  const contagens = useMemo(() => {
    return {
      pendentes: linhasComissao.filter((i) => i.saldoRestante > 0).length,
      parciais: linhasComissao.filter((i) => i.status === 'parcial').length,
      geradas: linhasComissao.filter((i) => i.status === 'gerada').length,
      todos: linhasComissao.length,
    }
  }, [linhasComissao])

  // Totais do Resumo Superior
  const resumoGeral = useMemo(() => {
    let totalVendas = 0
    let totalRecebido = 0
    let totalFabrica = 0
    let totalLiquido = 0
    let totalComissao = 0
    let totalGerado = 0
    let totalPendente = 0

    linhasComissao.forEach((i) => {
      totalVendas += i.valorVenda
      totalRecebido += i.valorRecebido
      totalFabrica += i.pagamentoFabrica
      totalLiquido += i.resultadoLiquido
      totalComissao += i.comissaoTotalCalculada
      totalGerado += i.totalJaGerado
      totalPendente += i.saldoRestante
    })

    return {
      totalVendas,
      totalRecebido,
      totalFabrica,
      totalLiquido,
      totalComissao,
      totalGerado,
      totalPendente,
    }
  }, [linhasComissao])

  // Gerar comissão individual
  const handleGerarIndividual = async (item: LinhaComissaoItem) => {
    setProcessandoId(item.pedido.id)
    setErroMsg(null)
    setSucessoMsg(null)

    const valorParaGerar = Number(item.valorGerar) || item.saldoRestante

    if (valorParaGerar <= 0) {
      setErroMsg('Informe um valor de comissão a gerar maior que zero.')
      setProcessandoId(null)
      return
    }

    try {
      const res = await gerarComissaoPedidoVenda({
        pedidoId: item.pedido.id,
        vendedorNome: item.vendedor,
        taxaPercentual: item.taxaPercentual,
        valorComissao: valorParaGerar,
        valorRecebido: item.valorRecebido,
        pagamentoFabrica: item.pagamentoFabrica,
        resultadoLiquido: item.resultadoLiquido,
        dataVencimento: item.vencimento,
      })

      if (!res.ok) {
        setErroMsg(res.erro)
        return
      }

      setSucessoMsg(
        `Comissão de ${formatarMoeda(valorParaGerar)} gerada com sucesso para ${item.vendedor} (Pedido #${item.pedido.numero})!`
      )

      // Limpar customização de valorGerar desta linha
      setConfigLinhas((prev) => {
        const copy = { ...prev }
        if (copy[item.pedido.id]) {
          delete copy[item.pedido.id].valorGerar
        }
        return copy
      })

      await carregarDados()
      await onComissoesAtualizadas()
    } catch (e: any) {
      setErroMsg(e?.message || 'Erro ao gerar comissão.')
    } finally {
      setProcessandoId(null)
    }
  }

  // Estornar comissão vinculada
  const handleEstornar = async (pedido: PedidoVenda, contaId?: string) => {
    if (
      !window.confirm(
        `Deseja realmente estornar a comissão do pedido #${pedido.numero}? A conta a pagar correspondente no Financeiro será excluída.`
      )
    ) {
      return
    }

    setProcessandoId(pedido.id)
    setErroMsg(null)
    setSucessoMsg(null)

    try {
      const res = await estornarComissaoPedidoVenda(pedido.id, contaId)
      if (!res.ok) {
        setErroMsg(res.erro)
        return
      }
      setSucessoMsg(`Comissão do pedido #${pedido.numero} estornada com sucesso.`)
      await carregarDados()
      await onComissoesAtualizadas()
    } catch (e: any) {
      setErroMsg(e?.message || 'Erro ao estornar comissão.')
    } finally {
      setProcessandoId(null)
    }
  }

  // Seleção em lote
  const alternarSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alternarTodosVisiveis = () => {
    const pendentesVisiveis = itensFiltrados.filter((i) => i.saldoRestante > 0)
    if (selecionados.size === pendentesVisiveis.length && pendentesVisiveis.length > 0) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(pendentesVisiveis.map((i) => i.pedido.id)))
    }
  }

  // Gerar selecionados em lote
  const handleGerarLote = async () => {
    if (selecionados.size === 0) return
    setGerandoLote(true)
    setErroMsg(null)
    setSucessoMsg(null)

    let geradosCount = 0
    let totalComissao = 0

    try {
      for (const id of Array.from(selecionados)) {
        const item = linhasComissao.find((i) => i.pedido.id === id)
        if (!item || item.saldoRestante <= 0) continue

        const valorParaGerar = Number(item.valorGerar) || item.saldoRestante

        const res = await gerarComissaoPedidoVenda({
          pedidoId: id,
          vendedorNome: item.vendedor,
          taxaPercentual: item.taxaPercentual,
          valorComissao: valorParaGerar,
          valorRecebido: item.valorRecebido,
          pagamentoFabrica: item.pagamentoFabrica,
          resultadoLiquido: item.resultadoLiquido,
          dataVencimento: item.vencimento,
        })

        if (res.ok) {
          geradosCount++
          totalComissao += valorParaGerar
        }
      }

      setSucessoMsg(
        `${geradosCount} comissões geradas com sucesso! Total gerado no Financeiro: ${formatarMoeda(totalComissao)}.`
      )
      setSelecionados(new Set())
      await carregarDados()
      await onComissoesAtualizadas()
    } catch (e: any) {
      setErroMsg(e?.message || 'Erro ao processar lote de comissões.')
    } finally {
      setGerandoLote(false)
    }
  }

  // Totais dos selecionados
  const totaisSelecionados = useMemo(() => {
    let liq = 0
    let com = 0
    selecionados.forEach((id) => {
      const item = linhasComissao.find((i) => i.pedido.id === id)
      if (item) {
        liq += item.resultadoLiquido
        com += Number(item.valorGerar) || item.saldoRestante
      }
    })
    return { liquido: liq, comissao: com, qtd: selecionados.size }
  }, [selecionados, linhasComissao])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div
        className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">
              <Percent size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight leading-snug">
                Gerar Comissões de Vendas
              </h3>
              <p className="text-xs text-slate-500">
                Apenas vendas <strong>baixadas no Financeiro</strong> · Comissão calculada sobre o <strong>Resultado Líquido</strong> (Recebido – Fábrica)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback Messages */}
        {sucessoMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <span>{sucessoMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSucessoMsg(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {erroMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{erroMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErroMsg(null)}
              className="text-red-700 hover:text-red-900"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* 4 Cards Resumo do Período */}
        <div className="px-4 sm:px-6 pt-3 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Valor Recebido (Baixado)
            </span>
            <span className="text-sm sm:text-base font-black text-slate-900 mt-0.5 block">
              {formatarMoeda(resumoGeral.totalRecebido)}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Pagamento Fábrica (Custo)
            </span>
            <span className="text-sm sm:text-base font-black text-red-700 mt-0.5 block">
              {formatarMoeda(resumoGeral.totalFabrica)}
            </span>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Resultado Líquido (Base)
            </span>
            <span className="text-sm sm:text-base font-black text-emerald-900 mt-0.5 block">
              {formatarMoeda(resumoGeral.totalLiquido)}
            </span>
          </div>

          <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block">
              Comissão Total / Pendente
            </span>
            <span className="text-sm sm:text-base font-black text-[#0D6BAF] mt-0.5 block">
              {formatarMoeda(resumoGeral.totalComissao)}{' '}
              <span className="text-[10px] font-normal text-slate-500">
                (Resta {formatarMoeda(resumoGeral.totalPendente)})
              </span>
            </span>
          </div>
        </div>

        {/* Toolbar: Abas, Mês e Busca */}
        <div className="p-4 sm:p-6 pb-3 border-b border-slate-100 space-y-3 bg-white">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            {/* Abas */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setFiltroAba('pendentes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filtroAba === 'pendentes'
                    ? 'bg-[#2D6A4F] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pendentes <span className="opacity-80 font-normal">({contagens.pendentes})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroAba('parciais')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filtroAba === 'parciais'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Parciais <span className="opacity-80 font-normal">({contagens.parciais})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroAba('geradas')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filtroAba === 'geradas'
                    ? 'bg-[#0F3D6E] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Já Geradas <span className="opacity-80 font-normal">({contagens.geradas})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroAba('todos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filtroAba === 'todos'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos <span className="opacity-80 font-normal">({contagens.todos})</span>
              </button>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-lg">
              {/* Filtro Mês Baixa */}
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer shrink-0"
              >
                <option value="todos">Todos os Meses</option>
                {mesesDisponiveis.map((m) => (
                  <option key={m} value={m}>
                    Mês {m.split('-').reverse().join('/')}
                  </option>
                ))}
              </select>

              {/* Busca */}
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar pedido, cliente..."
                  className="w-full bg-white text-xs font-medium text-slate-800 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Comissões com o Cálculo Completo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {carregando ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Carregando pedidos e conferindo liquidações financeiras...
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Nenhuma venda baixada com comissão pendente encontrada para este filtro.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-700 min-w-[960px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {filtroAba === 'pendentes' && (
                        <th className="px-3 py-3 text-center w-8">
                          <input
                            type="checkbox"
                            checked={
                              itensFiltrados.length > 0 &&
                              selecionados.size === itensFiltrados.filter((i) => i.saldoRestante > 0).length
                            }
                            onChange={alternarTodosVisiveis}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="px-3 py-3 text-left">Pedido / Baixa</th>
                      <th className="px-3 py-3 text-left">Cliente</th>
                      <th className="px-3 py-3 text-right">Venda Bruta</th>
                      <th className="px-3 py-3 text-right">Recebido (Caixa)</th>
                      <th className="px-3 py-3 text-right">Pagamento Fábrica</th>
                      <th className="px-3 py-3 text-right bg-emerald-50/40 text-emerald-800">Resultado Líquido</th>
                      <th className="px-3 py-3 text-left">Vendedor</th>
                      <th className="px-2 py-3 text-center w-14">%</th>
                      <th className="px-3 py-3 text-right">Comissão Total</th>
                      <th className="px-3 py-3 text-right">Já Gerado</th>
                      <th className="px-3 py-3 text-center w-36 bg-amber-50/30">Valor a Gerar (R$)</th>
                      <th className="px-3 py-3 text-center w-28">Status / Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itensFiltrados.map((item) => {
                      const estaSelecionado = selecionados.has(item.pedido.id)
                      const isProcessando = processandoId === item.pedido.id

                      return (
                        <tr
                          key={item.pedido.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            estaSelecionado ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          {filtroAba === 'pendentes' && (
                            <td className="px-3 py-3 text-center">
                              {item.saldoRestante > 0 && (
                                <input
                                  type="checkbox"
                                  checked={estaSelecionado}
                                  onChange={() => alternarSelecionado(item.pedido.id)}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              )}
                            </td>
                          )}

                          {/* Pedido / Baixa */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="font-extrabold text-slate-900 block leading-tight">
                              #{item.pedido.numero}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                              Baixado: {formatarData(item.dataBaixa)}
                            </span>
                          </td>

                          {/* Cliente */}
                          <td className="px-3 py-3">
                            <span className="font-bold text-slate-800 block truncate max-w-[140px]" title={item.pedido.cliente_nome}>
                              {item.pedido.cliente_nome}
                            </span>
                          </td>

                          {/* Venda Bruta */}
                          <td className="px-3 py-3 text-right font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                            {formatarMoeda(item.valorVenda)}
                          </td>

                          {/* Valor Recebido */}
                          <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatarMoeda(item.valorRecebido)}
                          </td>

                          {/* Pagamento Fábrica (Editável caso o usuário queira ajustar pontualmente) */}
                          <td className="px-3 py-3 text-right font-medium text-red-700 tabular-nums whitespace-nowrap">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.pagamentoFabrica}
                              onChange={(e) =>
                                atualizarCampoLinha(
                                  item.pedido.id,
                                  'pagamentoFabrica',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              title="Custo dos produtos na fábrica (Pagamento Fábrica)"
                              className="w-20 text-right text-xs font-bold text-red-700 bg-red-50/30 border border-red-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                            />
                          </td>

                          {/* Resultado Líquido (Recebido - Fábrica) */}
                          <td className="px-3 py-3 text-right font-black text-emerald-800 bg-emerald-50/40 tabular-nums whitespace-nowrap">
                            {formatarMoeda(item.resultadoLiquido)}
                          </td>

                          {/* Vendedor */}
                          <td className="px-3 py-3 min-w-[120px]">
                            {item.status === 'gerada' ? (
                              <span className="font-semibold text-slate-700 truncate block text-[11px]">
                                {item.vendedor}
                              </span>
                            ) : (
                              <select
                                value={item.vendedor}
                                onChange={(e) =>
                                  atualizarCampoLinha(item.pedido.id, 'vendedor', e.target.value)
                                }
                                className="w-full text-[11px] bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:ring-1 focus:ring-emerald-500 cursor-pointer truncate"
                              >
                                {representantes.map((rep) => (
                                  <option key={rep.id} value={rep.name}>
                                    {rep.name}
                                  </option>
                                ))}
                                {!representantes.some((r) => r.name === item.vendedor) && (
                                  <option value={item.vendedor}>{item.vendedor}</option>
                                )}
                              </select>
                            )}
                          </td>

                          {/* % Com. */}
                          <td className="px-2 py-3 text-center">
                            {item.status === 'gerada' ? (
                              <span className="font-bold text-slate-700 text-xs">{item.taxaPercentual}%</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={item.taxaPercentual}
                                onChange={(e) =>
                                  atualizarCampoLinha(
                                    item.pedido.id,
                                    'taxa',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-12 text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded px-1 py-0.5 focus:ring-1 focus:ring-emerald-500"
                              />
                            )}
                          </td>

                          {/* Comissão Total Calculada */}
                          <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatarMoeda(item.comissaoTotalCalculada)}
                          </td>

                          {/* Já Gerado */}
                          <td className="px-3 py-3 text-right font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                            {item.totalJaGerado > 0 ? (
                              <span className="text-amber-800 font-bold" title={`${item.contasComissaoGeradas.length} parcela(s) gerada(s)`}>
                                {formatarMoeda(item.totalJaGerado)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Valor a Gerar (INPUT EDITÁVEL: pode ser parcial ou total!) */}
                          <td className="px-3 py-3 text-center bg-amber-50/30 whitespace-nowrap">
                            {item.saldoRestante > 0 ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-[10px] text-slate-400 font-bold">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={item.saldoRestante}
                                  value={item.valorGerar}
                                  onChange={(e) =>
                                    atualizarCampoLinha(
                                      item.pedido.id,
                                      'valorGerar',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 text-right text-xs font-black text-emerald-800 bg-white border border-emerald-300 rounded px-1.5 py-1 focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                                  title={`Pode gerar o valor total (R$ ${item.saldoRestante.toFixed(2)}) ou um valor parcial (ex: R$ 36,00)`}
                                />
                                {item.valorGerar !== item.saldoRestante && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      atualizarCampoLinha(
                                        item.pedido.id,
                                        'valorGerar',
                                        item.saldoRestante
                                      )
                                    }
                                    title="Preencher com o saldo restante total"
                                    className="p-1 text-[10px] text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                                  >
                                    Max
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] font-bold text-emerald-700">Quitada</span>
                            )}
                          </td>

                          {/* Status / Ação */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            {item.status === 'gerada' ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Check size={11} /> 100% Gerada
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleEstornar(item.pedido)}
                                  disabled={isProcessando}
                                  title="Estornar comissões deste pedido"
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleGerarIndividual(item)}
                                  disabled={isProcessando || item.valorGerar <= 0}
                                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer flex items-center gap-1"
                                  title={
                                    item.valorGerar < item.saldoRestante
                                      ? `Gerar parcela de R$ ${item.valorGerar.toFixed(2)} (Ficará restando R$ ${(item.saldoRestante - item.valorGerar).toFixed(2)})`
                                      : `Gerar comissão de R$ ${item.valorGerar.toFixed(2)}`
                                  }
                                >
                                  {isProcessando
                                    ? '...'
                                    : item.valorGerar < item.saldoRestante
                                    ? 'Gerar Parcial'
                                    : 'Gerar'}
                                </button>

                                {item.totalJaGerado > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleEstornar(item.pedido)}
                                    disabled={isProcessando}
                                    title="Estornar parcelas anteriores"
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Ações em Lote */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0">
          <div className="text-xs text-slate-600">
            {selecionados.size > 0 ? (
              <span>
                <strong>{totaisSelecionados.qtd}</strong> selecionados · Base Líquida:{' '}
                <strong>{formatarMoeda(totaisSelecionados.liquido)}</strong> · Total Comissões:{' '}
                <strong className="text-emerald-700">
                  {formatarMoeda(totaisSelecionados.comissao)}
                </strong>
              </span>
            ) : (
              <span className="text-slate-500 text-xs flex items-center gap-1.5">
                <Info size={14} className="text-sky-600" />
                Dica: você pode alterar o <strong>Valor a Gerar</strong> de cada linha para pagamentos parciais (ex: R$ 36,00 de R$ 136,00).
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              Fechar
            </button>

            {filtroAba === 'pendentes' && selecionados.size > 0 && (
              <button
                type="button"
                onClick={handleGerarLote}
                disabled={gerandoLote}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>
                  {gerandoLote ? 'Gerando...' : `Gerar ${selecionados.size} Comissões (${formatarMoeda(totaisSelecionados.comissao)})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
