import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Percent,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Search,
  Check,
} from 'lucide-react'
import {
  listPedidosVenda,
  PedidoVenda,
  calcularValorLiquidoPedido,
  gerarComissaoPedidoVenda,
  estornarComissaoPedidoVenda,
} from '../../services/v2PedidoVendasService'
import { listRepresentantes, Representante } from '../../services/v2SettingsService'
import { formatarMoeda } from '../../../modules/lib/money'
import { formatarData } from '../../../modules/lib/datas'

interface V2GerarComissoesModalProps {
  isOpen: boolean
  onClose: () => void
  onComissoesAtualizadas: () => Promise<void>
}

export const V2GerarComissoesModal: React.FC<V2GerarComissoesModalProps> = ({
  isOpen,
  onClose,
  onComissoesAtualizadas,
}) => {
  if (!isOpen) return null

  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroAba, setFiltroAba] = useState<'pendentes' | 'geradas' | 'todos'>('pendentes')
  const [busca, setBusca] = useState('')
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null)
  const [erroMsg, setErroMsg] = useState<string | null>(null)

  // Configurações personalizáveis por linha (pedidoId -> { vendedor, taxa, vencimento })
  const [configLinhas, setConfigLinhas] = useState<
    Record<string, { vendedor: string; taxa: number; vencimento: string }>
  >({})

  // Selecionados para lote
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
      const [listaVendas, listaReps] = await Promise.all([
        listPedidosVenda(),
        listRepresentantes(),
      ])
      setPedidos(listaVendas)
      setRepresentantes(listaReps)

      // Inicializar configurações padrão para os pedidos
      const configs: Record<string, { vendedor: string; taxa: number; vencimento: string }> = {}
      const repPadrao = listaReps.find((r) => r.is_default) || listaReps[0]
      const taxaPadrao = repPadrao ? repPadrao.commission_rate || 5 : 5
      const nomePadrao = repPadrao ? repPadrao.name : 'Vendedor Padrão'

      listaVendas.forEach((p) => {
        const taxa = p.comissao_percentual != null ? Number(p.comissao_percentual) : taxaPadrao
        const vendedor = p.vendedor_nome || nomePadrao
        configs[p.id] = {
          vendedor,
          taxa,
          vencimento: vencimentoPadrao,
        }
      })
      setConfigLinhas(configs)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregarDados()
  }, [])

  const atualizarConfigLinha = (
    pedidoId: string,
    campo: 'vendedor' | 'taxa' | 'vencimento',
    valor: any
  ) => {
    setConfigLinhas((prev) => ({
      ...prev,
      [pedidoId]: {
        ...(prev[pedidoId] || {
          vendedor: representantes[0]?.name || 'Vendedor',
          taxa: 5,
          vencimento: vencimentoPadrao,
        }),
        [campo]: valor,
      },
    }))
  }

  // Filtragem dos pedidos
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((p) => {
      // Ignorar cancelados
      if (p.status === 'cancelado') return false

      // Filtro de aba
      if (filtroAba === 'pendentes' && p.comissao_gerada) return false
      if (filtroAba === 'geradas' && !p.comissao_gerada) return false

      // Busca
      if (busca.trim()) {
        const term = busca.toLowerCase()
        const numMatch = p.numero.toLowerCase().includes(term)
        const clienteMatch = p.cliente_nome.toLowerCase().includes(term)
        const vendMatch = (p.vendedor_nome || '').toLowerCase().includes(term)
        return numMatch || clienteMatch || vendMatch
      }
      return true
    })
  }, [pedidos, filtroAba, busca])

  // Contadores das abas
  const contagens = useMemo(() => {
    const validos = pedidos.filter((p) => p.status !== 'cancelado')
    return {
      pendentes: validos.filter((p) => !p.comissao_gerada).length,
      geradas: validos.filter((p) => Boolean(p.comissao_gerada)).length,
      todos: validos.length,
    }
  }, [pedidos])

  // Gerar comissão individual
  const handleGerarIndividual = async (pedido: PedidoVenda) => {
    setProcessandoId(pedido.id)
    setErroMsg(null)
    setSucessoMsg(null)

    const cfg = configLinhas[pedido.id] || {
      vendedor: representantes[0]?.name || 'Vendedor',
      taxa: 5,
      vencimento: vencimentoPadrao,
    }

    try {
      const res = await gerarComissaoPedidoVenda({
        pedidoId: pedido.id,
        vendedorNome: cfg.vendedor,
        taxaPercentual: cfg.taxa,
        dataVencimento: cfg.vencimento,
      })

      if (!res.ok) {
        setErroMsg(res.erro)
        return
      }

      setSucessoMsg(
        `Comissão de ${formatarMoeda(res.valorComissao)} gerada com sucesso para ${cfg.vendedor} (Pedido ${pedido.numero})!`
      )
      await carregarDados()
      await onComissoesAtualizadas()
    } catch (e: any) {
      setErroMsg(e?.message || 'Erro ao gerar comissão.')
    } finally {
      setProcessandoId(null)
    }
  }

  // Estornar comissão
  const handleEstornar = async (pedido: PedidoVenda) => {
    if (
      !window.confirm(
        `Deseja realmente estornar a comissão do pedido ${pedido.numero}? A conta a pagar vinculada será excluída.`
      )
    ) {
      return
    }

    setProcessandoId(pedido.id)
    setErroMsg(null)
    setSucessoMsg(null)

    try {
      const res = await estornarComissaoPedidoVenda(pedido.id)
      if (!res.ok) {
        setErroMsg(res.erro)
        return
      }
      setSucessoMsg(`Comissão do pedido ${pedido.numero} estornada com sucesso.`)
      await carregarDados()
      await onComissoesAtualizadas()
    } catch (e: any) {
      setErroMsg(e?.message || 'Erro ao estornar comissão.')
    } finally {
      setProcessandoId(null)
    }
  }

  // Alternar seleção em lote
  const alternarSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alternarTodosVisiveis = () => {
    const pendentesVisiveis = pedidosFiltrados.filter((p) => !p.comissao_gerada)
    if (selecionados.size === pendentesVisiveis.length && pendentesVisiveis.length > 0) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(pendentesVisiveis.map((p) => p.id)))
    }
  }

  // Gerar comissões selecionadas em lote
  const handleGerarLote = async () => {
    if (selecionados.size === 0) return
    setGerandoLote(true)
    setErroMsg(null)
    setSucessoMsg(null)

    let geradosCount = 0
    let totalComissao = 0

    try {
      for (const id of Array.from(selecionados)) {
        const ped = pedidos.find((p) => p.id === id)
        if (!ped || ped.comissao_gerada) continue

        const cfg = configLinhas[id] || {
          vendedor: representantes[0]?.name || 'Vendedor',
          taxa: 5,
          vencimento: vencimentoPadrao,
        }

        const res = await gerarComissaoPedidoVenda({
          pedidoId: id,
          vendedorNome: cfg.vendedor,
          taxaPercentual: cfg.taxa,
          dataVencimento: cfg.vencimento,
        })

        if (res.ok) {
          geradosCount++
          totalComissao += res.valorComissao
        }
      }

      setSucessoMsg(
        `${geradosCount} comissões geradas com sucesso! Total no Financeiro: ${formatarMoeda(totalComissao)}.`
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
      const ped = pedidos.find((p) => p.id === id)
      if (ped) {
        const vl = calcularValorLiquidoPedido(ped)
        const taxa = configLinhas[id]?.taxa ?? 5
        liq += vl
        com += (vl * taxa) / 100
      }
    })
    return { liquido: liq, comissao: com, qtd: selecionados.size }
  }, [selecionados, pedidos, configLinhas])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div
        className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Percent size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-900 tracking-tight">
                Gerar Comissões de Vendas
              </h3>
              <p className="text-xs text-slate-500">
                Calcule e gere os títulos a pagar de comissão com base no <strong>valor líquido</strong> dos pedidos
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
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-emerald-800">
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
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-red-800">
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

        {/* Toolbar: Filtros e Busca */}
        <div className="p-5 pb-3 border-b border-slate-100 space-y-3 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Abas */}
            <div className="flex items-center bg-slate-200/60 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setFiltroAba('pendentes')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroAba === 'pendentes'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pendentes <span className="opacity-80 font-normal">({contagens.pendentes})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroAba('geradas')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroAba === 'geradas'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Já Geradas <span className="opacity-80 font-normal">({contagens.geradas})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroAba('todos')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroAba === 'todos'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos <span className="opacity-80 font-normal">({contagens.todos})</span>
              </button>
            </div>

            {/* Busca */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pedido, cliente ou vendedor..."
                className="w-full bg-white text-xs font-medium text-slate-800 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Tabela de Pedidos */}
        <div className="flex-1 overflow-y-auto p-5">
          {carregando ? (
            <div className="text-center py-12 text-slate-400 text-xs">Carregando pedidos de venda...</div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Nenhum pedido encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-700 min-w-[760px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {filtroAba === 'pendentes' && (
                        <th className="px-3 py-3 text-center w-10">
                          <input
                            type="checkbox"
                            checked={
                              pedidosFiltrados.length > 0 &&
                              selecionados.size === pedidosFiltrados.filter((p) => !p.comissao_gerada).length
                            }
                            onChange={alternarTodosVisiveis}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left">Pedido / Emissão</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-right">Valor Líquido</th>
                      <th className="px-4 py-3 text-left">Vendedor / Representante</th>
                      <th className="px-3 py-3 text-center w-20">% Com.</th>
                      <th className="px-4 py-3 text-right">Comissão (R$)</th>
                      <th className="px-4 py-3 text-center">Status / Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pedidosFiltrados.map((p) => {
                      const valorLiquido = calcularValorLiquidoPedido(p)
                      const cfg = configLinhas[p.id] || {
                        vendedor: representantes[0]?.name || 'Vendedor',
                        taxa: 5,
                        vencimento: vencimentoPadrao,
                      }
                      const valorComissaoCalculada = Number(
                        ((valorLiquido * (cfg.taxa || 0)) / 100).toFixed(2)
                      )
                      const estaSelecionado = selecionados.has(p.id)
                      const isProcessando = processandoId === p.id

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            estaSelecionado ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          {filtroAba === 'pendentes' && (
                            <td className="px-3 py-3 text-center">
                              {!p.comissao_gerada && (
                                <input
                                  type="checkbox"
                                  checked={estaSelecionado}
                                  onChange={() => alternarSelecionado(p.id)}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              )}
                            </td>
                          )}

                          {/* Pedido / Emissão */}
                          <td className="px-4 py-3">
                            <span className="font-extrabold text-slate-900 block">{p.numero}</span>
                            <span className="text-[10px] text-slate-400">
                              {formatarData(p.dataEmissao)} · {p.status.toUpperCase()}
                            </span>
                          </td>

                          {/* Cliente */}
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-800 block truncate max-w-[200px]">
                              {p.cliente_nome}
                            </span>
                            {p.cliente_cidade && (
                              <span className="text-[10px] text-slate-400 truncate block">
                                {p.cliente_cidade}
                              </span>
                            )}
                          </td>

                          {/* Valor Líquido */}
                          <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">
                            {formatarMoeda(valorLiquido)}
                            {p.frete && p.frete > 0 ? (
                              <span className="block text-[10px] font-normal text-slate-400">
                                Frete de {formatarMoeda(p.frete)} excluído
                              </span>
                            ) : null}
                          </td>

                          {/* Vendedor / Representante */}
                          <td className="px-4 py-3">
                            {p.comissao_gerada ? (
                              <span className="font-semibold text-slate-700">
                                {p.vendedor_nome || cfg.vendedor}
                              </span>
                            ) : (
                              <select
                                value={cfg.vendedor}
                                onChange={(e) =>
                                  atualizarConfigLinha(p.id, 'vendedor', e.target.value)
                                }
                                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                              >
                                {representantes.map((rep) => (
                                  <option key={rep.id} value={rep.name}>
                                    {rep.name} ({rep.commission_rate}%)
                                  </option>
                                ))}
                                {!representantes.some((r) => r.name === cfg.vendedor) && (
                                  <option value={cfg.vendedor}>{cfg.vendedor}</option>
                                )}
                              </select>
                            )}
                          </td>

                          {/* % Comissão */}
                          <td className="px-3 py-3 text-center">
                            {p.comissao_gerada ? (
                              <span className="font-bold text-slate-700">
                                {p.comissao_percentual || cfg.taxa}%
                              </span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={cfg.taxa}
                                onChange={(e) =>
                                  atualizarConfigLinha(
                                    p.id,
                                    'taxa',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-16 text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:ring-1 focus:ring-emerald-500"
                              />
                            )}
                          </td>

                          {/* Valor da Comissão */}
                          <td className="px-4 py-3 text-right font-black text-emerald-700 tabular-nums">
                            {formatarMoeda(
                              p.comissao_gerada && p.comissao_valor != null
                                ? p.comissao_valor
                                : valorComissaoCalculada
                            )}
                          </td>

                          {/* Status / Ação */}
                          <td className="px-4 py-3 text-center">
                            {p.comissao_gerada ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Check size={12} /> Gerada
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleEstornar(p)}
                                  disabled={isProcessando}
                                  title="Estornar comissão"
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <RotateCcw size={13} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleGerarIndividual(p)}
                                disabled={isProcessando}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                              >
                                {isProcessando ? 'Gerando...' : 'Gerar'}
                              </button>
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
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0">
          <div className="text-xs text-slate-600">
            {selecionados.size > 0 ? (
              <span>
                <strong>{totaisSelecionados.qtd}</strong> pedidos selecionados · Valor Líquido:{' '}
                <strong>{formatarMoeda(totaisSelecionados.liquido)}</strong> · Total Comissão:{' '}
                <strong className="text-emerald-700">
                  {formatarMoeda(totaisSelecionados.comissao)}
                </strong>
              </span>
            ) : (
              <span className="text-slate-400">
                Selecione os pedidos pendentes para gerar comissões em lote.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              Fechar
            </button>
            {selecionados.size > 0 && (
              <button
                type="button"
                onClick={handleGerarLote}
                disabled={gerandoLote}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                {gerandoLote ? (
                  'Processando...'
                ) : (
                  <>
                    <Check size={15} /> Gerar {selecionados.size} Comissões
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
