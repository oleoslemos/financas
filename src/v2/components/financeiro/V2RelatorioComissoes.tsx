import React, { useState, useEffect, useMemo } from 'react'
import {
  Calendar,
  Download,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  listPedidosVenda,
  PedidoVenda,
  calcularValorLiquidoPedido,
} from '../../services/v2PedidoVendasService'
import { listContasPagar, ContaPagar } from '../../services/v2ContasPagarService'
import { listRepresentantes, Representante } from '../../services/v2SettingsService'
import { formatarMoeda } from '../../../modules/lib/money'
import { formatarData } from '../../../modules/lib/datas'

const MESES_NOMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

interface MesComissaoLinha {
  ano: number
  mes: number // 1 a 12
  rotulo: string
  qtdPedidos: number
  faturamentoLiquido: number
  totalComissao: number
  comissaoPaga: number
  comissaoPendente: number
  pedidos: {
    pedido: PedidoVenda
    valorLiquido: number
    valorComissao: number
    taxaPercentual: number
    vendedor: string
    statusConta?: string
  }[]
}

export const V2RelatorioComissoes: React.FC = () => {
  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [anoFiltro, setAnoFiltro] = useState<number>(() => new Date().getFullYear())
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('todos')
  const [mesExpandido, setMesExpandido] = useState<string | null>(null)

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const [vendas, contasFin, reps] = await Promise.all([
        listPedidosVenda(),
        listContasPagar(),
        listRepresentantes(),
      ])
      setPedidos(vendas)
      setContas(contasFin)
      setRepresentantes(reps)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregarDados()
  }, [])

  // Anos disponíveis
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>()
    const anoAtual = new Date().getFullYear()
    anos.add(anoAtual)
    pedidos.forEach((p) => {
      if (p.dataEmissao) {
        const ano = parseInt(p.dataEmissao.split('-')[0], 10)
        if (!isNaN(ano)) anos.add(ano)
      }
    })
    return Array.from(anos).sort((a, b) => b - a)
  }, [pedidos])

  // Agrupamento mês a mês
  const dadosMesAMes = useMemo(() => {
    const mapa = new Map<string, MesComissaoLinha>()

    // Inicializar os 12 meses do ano selecionado
    for (let m = 1; m <= 12; m++) {
      const chave = `${anoFiltro}-${String(m).padStart(2, '0')}`
      mapa.set(chave, {
        ano: anoFiltro,
        mes: m,
        rotulo: `${MESES_NOMES[m - 1]} / ${anoFiltro}`,
        qtdPedidos: 0,
        faturamentoLiquido: 0,
        totalComissao: 0,
        comissaoPaga: 0,
        comissaoPendente: 0,
        pedidos: [],
      })
    }

    pedidos.forEach((p) => {
      if (p.status === 'cancelado') return
      if (!p.dataEmissao) return

      const [anoStr, mesStr] = p.dataEmissao.split('-')
      const ano = parseInt(anoStr, 10)
      const mes = parseInt(mesStr, 10)

      if (ano !== anoFiltro) return

      const vendedor = p.vendedor_nome || 'Vendedor Padrão'
      if (vendedorFiltro !== 'todos' && vendedor !== vendedorFiltro) return

      const chave = `${ano}-${String(mes).padStart(2, '0')}`
      const linha = mapa.get(chave)
      if (!linha) return

      const valorLiquido = calcularValorLiquidoPedido(p)
      const taxa = p.comissao_percentual != null ? Number(p.comissao_percentual) : 5
      const valorComissao =
        p.comissao_valor != null ? Number(p.comissao_valor) : Number(((valorLiquido * taxa) / 100).toFixed(2))

      // Procurar conta a pagar vinculada
      const conta = contas.find(
        (c) => c.pedido_id === p.id && c.tipo === 'pagar' && c.categoria === 'Comissões'
      )

      const statusConta = conta ? conta.status : p.comissao_gerada ? 'aberta' : 'pendente_geracao'
      const isPaga = statusConta === 'paga'

      linha.qtdPedidos += 1
      linha.faturamentoLiquido += valorLiquido
      linha.totalComissao += valorComissao

      if (isPaga) {
        linha.comissaoPaga += valorComissao
      } else {
        linha.comissaoPendente += valorComissao
      }

      linha.pedidos.push({
        pedido: p,
        valorLiquido,
        valorComissao,
        taxaPercentual: taxa,
        vendedor,
        statusConta,
      })
    })

    return Array.from(mapa.values())
  }, [pedidos, contas, anoFiltro, vendedorFiltro])

  // Totais Gerais do Período
  const totaisGerais = useMemo(() => {
    let fatLiq = 0
    let totalCom = 0
    let paga = 0
    let pendente = 0
    let qtd = 0

    dadosMesAMes.forEach((linha) => {
      fatLiq += linha.faturamentoLiquido
      totalCom += linha.totalComissao
      paga += linha.comissaoPaga
      pendente += linha.comissaoPendente
      qtd += linha.qtdPedidos
    })

    const taxaMedia = fatLiq > 0 ? (totalCom / fatLiq) * 100 : 0

    return {
      faturamentoLiquido: fatLiq,
      totalComissao: totalCom,
      comissaoPaga: paga,
      comissaoPendente: pendente,
      qtdPedidos: qtd,
      taxaMedia,
    }
  }, [dadosMesAMes])

  // Exportar para XLSX
  const exportarExcel = () => {
    const linhasExport: Record<string, any>[] = []

    dadosMesAMes.forEach((m) => {
      if (m.qtdPedidos > 0) {
        linhasExport.push({
          Competência: m.rotulo,
          'Qtd Pedidos': m.qtdPedidos,
          'Faturamento Líquido (R$)': m.faturamentoLiquido.toFixed(2),
          'Comissão Total (R$)': m.totalComissao.toFixed(2),
          'Comissão Paga (R$)': m.comissaoPaga.toFixed(2),
          'Comissão Pendente (R$)': m.comissaoPendente.toFixed(2),
        })
      }
    })

    if (linhasExport.length === 0) {
      alert('Nenhum dado para exportar no período selecionado.')
      return
    }

    const ws = XLSX.utils.json_to_sheet(linhasExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comissões')
    XLSX.writeFile(wb, `Relatorio_Comissoes_${anoFiltro}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* ── BARRA SUPERIOR: FILTROS E EXPORTAÇÃO ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Relatório de Comissões Mês a Mês
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento mensal detalhado de vendas líquidas e comissões calculadas e pagas
            </p>
          </div>

          <button
            type="button"
            onClick={exportarExcel}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Download size={14} /> Exportar Excel
          </button>
        </div>

        {/* Linha de Filtros */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Seletor de Ano */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <Calendar size={14} className="text-slate-400" /> Ano:
            </span>
            <select
              value={anoFiltro}
              onChange={(e) => setAnoFiltro(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
            >
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Vendedor */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <User size={14} className="text-slate-400" /> Representante:
            </span>
            <select
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
            >
              <option value="todos">Todos os Representantes</option>
              {representantes.map((rep) => (
                <option key={rep.id} value={rep.name}>
                  {rep.name} ({rep.commission_rate}%)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 4 CARDS DE KPIS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento Líquido */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Faturamento Líquido
          </span>
          <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
            {formatarMoeda(totaisGerais.faturamentoLiquido)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {totaisGerais.qtdPedidos} pedidos no período
          </span>
        </div>

        {/* Total de Comissões */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Comissões Calculadas
          </span>
          <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block">
            {formatarMoeda(totaisGerais.totalComissao)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Taxa média: {totaisGerais.taxaMedia.toFixed(1)}%
          </span>
        </div>

        {/* Comissões Pagas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Comissões Pagas
          </span>
          <span className="text-xl sm:text-2xl font-black text-[#2D6A4F] mt-1 block">
            {formatarMoeda(totaisGerais.comissaoPaga)}
          </span>
          <span className="text-[10px] text-emerald-600 block mt-0.5 font-semibold">
            Liquidadas no financeiro
          </span>
        </div>

        {/* Comissões Pendentes */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Comissões Pendentes
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-700 mt-1 block">
            {formatarMoeda(totaisGerais.comissaoPendente)}
          </span>
          <span className="text-[10px] text-amber-600 block mt-0.5 font-semibold">
            A pagar / abertas
          </span>
        </div>
      </div>

      {/* ── TABELA MÊS A MÊS ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
            Demonstrativo Mensal ({anoFiltro})
          </h3>
          <span className="text-xs text-slate-400">Clique no mês para detalhar os pedidos</span>
        </div>

        {carregando ? (
          <div className="text-center py-12 text-slate-400 text-xs">Carregando relatório...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700 min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5 text-left">Mês / Competência</th>
                  <th className="px-4 py-3.5 text-center">Pedidos</th>
                  <th className="px-5 py-3.5 text-right">Faturamento Líquido</th>
                  <th className="px-5 py-3.5 text-right">Total Comissão</th>
                  <th className="px-5 py-3.5 text-right text-emerald-700">Comissão Paga</th>
                  <th className="px-5 py-3.5 text-right text-amber-700">Pendente</th>
                  <th className="px-4 py-3.5 text-center w-24">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dadosMesAMes.map((m) => {
                  const chaveMes = `${m.ano}-${String(m.mes).padStart(2, '0')}`
                  const isExpandido = mesExpandido === chaveMes
                  const temDados = m.qtdPedidos > 0

                  return (
                    <React.Fragment key={chaveMes}>
                      <tr
                        onClick={() => temDados && setMesExpandido(isExpandido ? null : chaveMes)}
                        className={`transition-colors ${
                          temDados
                            ? 'hover:bg-slate-50/80 cursor-pointer'
                            : 'opacity-50 bg-slate-50/30'
                        } ${isExpandido ? 'bg-slate-50 font-semibold' : ''}`}
                      >
                        {/* Mês */}
                        <td className="px-5 py-3.5">
                          <span className="font-extrabold text-slate-900 block">{m.rotulo}</span>
                        </td>

                        {/* Qtd Pedidos */}
                        <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                          {m.qtdPedidos}
                        </td>

                        {/* Faturamento Líquido */}
                        <td className="px-5 py-3.5 text-right font-black text-slate-900 tabular-nums">
                          {formatarMoeda(m.faturamentoLiquido)}
                        </td>

                        {/* Total Comissão */}
                        <td className="px-5 py-3.5 text-right font-black text-emerald-700 tabular-nums">
                          {formatarMoeda(m.totalComissao)}
                        </td>

                        {/* Paga */}
                        <td className="px-5 py-3.5 text-right font-bold text-emerald-800 tabular-nums">
                          {formatarMoeda(m.comissaoPaga)}
                        </td>

                        {/* Pendente */}
                        <td className="px-5 py-3.5 text-right font-bold text-amber-700 tabular-nums">
                          {formatarMoeda(m.comissaoPendente)}
                        </td>

                        {/* Botão Expandir */}
                        <td className="px-4 py-3.5 text-center">
                          {temDados ? (
                            <button
                              type="button"
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                            >
                              {isExpandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Linha Expandida com os Pedidos */}
                      {isExpandido && m.pedidos.length > 0 && (
                        <tr className="bg-slate-50/90 border-y border-slate-200/80">
                          <td colSpan={7} className="p-4 sm:p-5">
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-700">
                                <span>Pedidos de Venda em {m.rotulo} ({m.pedidos.length})</span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                  Base de comissão: Subtotal dos itens menos descontos (exclui frete)
                                </span>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/40">
                                    <th className="px-3 py-2 text-left">Pedido</th>
                                    <th className="px-3 py-2 text-left">Data</th>
                                    <th className="px-3 py-2 text-left">Cliente</th>
                                    <th className="px-3 py-2 text-left">Vendedor</th>
                                    <th className="px-3 py-2 text-right">Valor Líquido</th>
                                    <th className="px-3 py-2 text-center">% Com.</th>
                                    <th className="px-3 py-2 text-right">Comissão (R$)</th>
                                    <th className="px-3 py-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {m.pedidos.map((item) => (
                                    <tr key={item.pedido.id} className="hover:bg-slate-50/60">
                                      <td className="px-3 py-2 font-bold text-slate-900">
                                        {item.pedido.numero}
                                      </td>
                                      <td className="px-3 py-2 text-slate-500">
                                        {formatarData(item.pedido.dataEmissao)}
                                      </td>
                                      <td className="px-3 py-2 font-medium text-slate-800 truncate max-w-[180px]">
                                        {item.pedido.cliente_nome}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600">
                                        {item.vendedor}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">
                                        {formatarMoeda(item.valorLiquido)}
                                      </td>
                                      <td className="px-3 py-2 text-center font-bold text-slate-600">
                                        {item.taxaPercentual}%
                                      </td>
                                      <td className="px-3 py-2 text-right font-black text-emerald-700 tabular-nums">
                                        {formatarMoeda(item.valorComissao)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            item.statusConta === 'paga'
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : item.statusConta === 'aberta'
                                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {item.statusConta === 'paga'
                                            ? 'Paga'
                                            : item.statusConta === 'aberta'
                                            ? 'A Pagar'
                                            : 'Não gerada'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
