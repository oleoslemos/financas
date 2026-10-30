import React, { useState, useEffect, useMemo } from 'react'
import {
  Calendar,
  Download,
  User,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Clock,
  Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { listPedidosVenda, PedidoVenda } from '../../services/v2PedidoVendasService'
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

interface PedidoComissaoDetalhe {
  pedido: PedidoVenda
  contaReceber: ContaPagar
  dataBaixa: string
  valorVenda: number
  valorRecebido: number
  pagamentoFabrica: number
  resultadoLiquido: number
  taxaPercentual: number
  valorComissaoTotal: number
  totalJaGerado: number
  comissaoPaga: number
  saldoRestante: number
  vendedor: string
  statusContaComissao: 'paga' | 'parcial' | 'aberta' | 'pendente_geracao'
}

interface MesComissaoLinha {
  ano: number
  mes: number // 1 a 12
  rotulo: string
  qtdPedidos: number
  totalVendas: number
  totalRecebido: number
  totalPagamentoFabrica: number
  resultadoLiquido: number
  totalComissao: number
  comissaoPaga: number
  comissaoPendente: number
  pedidos: PedidoComissaoDetalhe[]
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

  // Anos disponíveis com base nas baixas dos títulos
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>()
    const anoAtual = new Date().getFullYear()
    anos.add(anoAtual)

    contas.forEach((c) => {
      if (c.tipo === 'receber' && c.status === 'paga') {
        const dataRef = c.data_baixa || c.parcelas?.[0]?.baixa?.dataBaixa || c.vencimento
        if (dataRef) {
          const ano = parseInt(dataRef.split('-')[0], 10)
          if (!isNaN(ano)) anos.add(ano)
        }
      }
    })

    return Array.from(anos).sort((a, b) => b - a)
  }, [contas])

  // Agrupamento mês a mês baseado estritamente na data de baixa dos títulos recebidos
  const dadosMesAMes = useMemo(() => {
    const repPadrao = representantes.find((r) => r.is_default) || representantes[0]
    const taxaPadrao = repPadrao ? repPadrao.commission_rate || 50 : 50
    const nomePadrao = repPadrao ? repPadrao.name : 'Vendedor Padrão'

    const mapa = new Map<string, MesComissaoLinha>()

    // Inicializar os 12 meses do ano selecionado
    for (let m = 1; m <= 12; m++) {
      const chave = `${anoFiltro}-${String(m).padStart(2, '0')}`
      mapa.set(chave, {
        ano: anoFiltro,
        mes: m,
        rotulo: `${MESES_NOMES[m - 1]} / ${anoFiltro}`,
        qtdPedidos: 0,
        totalVendas: 0,
        totalRecebido: 0,
        totalPagamentoFabrica: 0,
        resultadoLiquido: 0,
        totalComissao: 0,
        comissaoPaga: 0,
        comissaoPendente: 0,
        pedidos: [],
      })
    }

    pedidos.forEach((p) => {
      if (p.status === 'cancelado') return

      // Localizar o título a receber deste pedido
      const contaReceber = contas.find(
        (c) => c.pedido_id === p.id && c.tipo === 'receber'
      )

      // Regra: Somente títulos que já foram BAIXADOS no financeiro entram na comissão do mês
      if (!contaReceber || contaReceber.status !== 'paga') return

      // Data de competência = Data da baixa da conta a receber
      const dataBaixa =
        contaReceber.data_baixa ||
        contaReceber.parcelas?.[0]?.baixa?.dataBaixa ||
        p.dataEmissao

      if (!dataBaixa) return

      const [anoStr, mesStr] = dataBaixa.split('-')
      const ano = parseInt(anoStr, 10)
      const mes = parseInt(mesStr, 10)

      if (ano !== anoFiltro) return

      const vendedor = p.vendedor_nome || nomePadrao
      if (vendedorFiltro !== 'todos' && vendedor !== vendedorFiltro) return

      const chave = `${ano}-${String(mes).padStart(2, '0')}`
      const linha = mapa.get(chave)
      if (!linha) return

      // Cálculos da fórmula solicitada pelo usuário:
      // Venda, Valor Recebido, Pagamento Fábrica, Resultado Líquido, Comissão %
      const valorVenda = Number(p.total) || Number(contaReceber.total) || 0
      const valorRecebido = Number(
        (contaReceber as any).valorPago || contaReceber.totalPago || contaReceber.total || valorVenda
      )

      let custoFabricaPadrao = 0
      if (p.itens && p.itens.length > 0) {
        p.itens.forEach((it) => {
          if (it.preco_fabrica && it.preco_fabrica > 0) {
            custoFabricaPadrao += it.preco_fabrica * (it.quantidade || 1)
          }
        })
      }
      custoFabricaPadrao = Number(custoFabricaPadrao.toFixed(2))

      const taxa = p.comissao_percentual != null ? Number(p.comissao_percentual) : taxaPadrao
      const pagamentoFabrica =
        p.pagamento_fabrica != null ? Number(p.pagamento_fabrica) : custoFabricaPadrao

      // Resultado Líquido = Valor Recebido - Pagamento Fábrica
      const resultadoLiquido = Math.max(0, Number((valorRecebido - pagamentoFabrica).toFixed(2)))

      // Comissão Total = Resultado Líquido * taxa %
      const valorComissaoTotal =
        p.comissao_valor_total != null
          ? Number(p.comissao_valor_total)
          : Number(((resultadoLiquido * taxa) / 100).toFixed(2))

      // Buscar contas a pagar de comissão já geradas
      const contasComissao = contas.filter(
        (c) => c.pedido_id === p.id && c.tipo === 'pagar' && c.categoria === 'Comissões'
      )

      const totalJaGerado = Number(
        contasComissao.reduce((acc, c) => acc + (Number(c.total) || 0), 0).toFixed(2)
      )

      const comissaoPaga = Number(
        contasComissao
          .filter((c) => c.status === 'paga')
          .reduce((acc, c) => acc + (Number((c as any).valorPago || c.totalPago || c.total) || 0), 0)
          .toFixed(2)
      )

      const saldoRestante = Math.max(0, Number((valorComissaoTotal - totalJaGerado).toFixed(2)))

      // Status do comissionamento deste pedido
      let statusContaComissao: 'paga' | 'parcial' | 'aberta' | 'pendente_geracao' = 'pendente_geracao'
      if (contasComissao.length > 0) {
        if (comissaoPaga >= valorComissaoTotal && valorComissaoTotal > 0) {
          statusContaComissao = 'paga'
        } else if (totalJaGerado > 0 && totalJaGerado < valorComissaoTotal) {
          statusContaComissao = 'parcial'
        } else {
          statusContaComissao = 'aberta'
        }
      }

      const pendenteLinha = Math.max(0, Number((valorComissaoTotal - comissaoPaga).toFixed(2)))

      // Acumular no mês
      linha.qtdPedidos += 1
      linha.totalVendas += valorVenda
      linha.totalRecebido += valorRecebido
      linha.totalPagamentoFabrica += pagamentoFabrica
      linha.resultadoLiquido += resultadoLiquido
      linha.totalComissao += valorComissaoTotal
      linha.comissaoPaga += comissaoPaga
      linha.comissaoPendente += pendenteLinha

      linha.pedidos.push({
        pedido: p,
        contaReceber,
        dataBaixa,
        valorVenda,
        valorRecebido,
        pagamentoFabrica,
        resultadoLiquido,
        taxaPercentual: taxa,
        valorComissaoTotal,
        totalJaGerado,
        comissaoPaga,
        saldoRestante,
        vendedor,
        statusContaComissao,
      })
    })

    return Array.from(mapa.values())
  }, [pedidos, contas, anoFiltro, vendedorFiltro, representantes])

  // Totais Gerais do Período
  const totaisGerais = useMemo(() => {
    let vendas = 0
    let recebido = 0
    let fabrica = 0
    let resLiq = 0
    let totalCom = 0
    let paga = 0
    let pendente = 0
    let qtd = 0

    dadosMesAMes.forEach((linha) => {
      vendas += linha.totalVendas
      recebido += linha.totalRecebido
      fabrica += linha.totalPagamentoFabrica
      resLiq += linha.resultadoLiquido
      totalCom += linha.totalComissao
      paga += linha.comissaoPaga
      pendente += linha.comissaoPendente
      qtd += linha.qtdPedidos
    })

    const margemMedia = recebido > 0 ? (resLiq / recebido) * 100 : 0
    const taxaMedia = resLiq > 0 ? (totalCom / resLiq) * 100 : 0

    return {
      totalVendas: vendas,
      totalRecebido: recebido,
      totalPagamentoFabrica: fabrica,
      resultadoLiquido: resLiq,
      totalComissao: totalCom,
      comissaoPaga: paga,
      comissaoPendente: pendente,
      qtdPedidos: qtd,
      margemMedia,
      taxaMedia,
    }
  }, [dadosMesAMes])

  // Exportar para XLSX
  const exportarExcel = () => {
    const linhasExport: Record<string, any>[] = []

    dadosMesAMes.forEach((m) => {
      if (m.qtdPedidos > 0) {
        linhasExport.push({
          'Competência (Baixa)': m.rotulo,
          'Qtd Pedidos Baixados': m.qtdPedidos,
          'Vendas Brutas (R$)': m.totalVendas.toFixed(2),
          'Valor Recebido (R$)': m.totalRecebido.toFixed(2),
          'Pagamento Fábrica (R$)': m.totalPagamentoFabrica.toFixed(2),
          'Resultado Líquido (R$)': m.resultadoLiquido.toFixed(2),
          'Comissão Total (R$)': m.totalComissao.toFixed(2),
          'Comissão Paga (R$)': m.comissaoPaga.toFixed(2),
          'Comissão Pendente (R$)': m.comissaoPendente.toFixed(2),
        })
      }
    })

    if (linhasExport.length === 0) {
      alert('Nenhum título baixado para exportar no período selecionado.')
      return
    }

    const ws = XLSX.utils.json_to_sheet(linhasExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comissões')
    XLSX.writeFile(wb, `Relatorio_Comissoes_Liquidas_${anoFiltro}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* ── BARRA SUPERIOR: FILTROS E EXPORTAÇÃO ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              Relatório de Comissões sobre Resultado Líquido
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Exibindo apenas vendas com <strong>títulos já baixados no mês</strong>. Cálculo: <em>(Recebido − Custo Fábrica) × % Comissão</em>
            </p>
          </div>

          <button
            type="button"
            onClick={exportarExcel}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Download size={14} /> Exportar Excel
          </button>
        </div>

        {/* Linha de Filtros */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Seletor de Ano */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <Calendar size={14} className="text-slate-400" /> Ano da Baixa:
            </span>
            <select
              value={anoFiltro}
              onChange={(e) => setAnoFiltro(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer text-xs"
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
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer text-xs"
            >
              <option value="todos">Todos os Representantes</option>
              {representantes.map((rep) => (
                <option key={rep.id} value={rep.name}>
                  {rep.name} ({rep.commission_rate}%)
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
            <Info size={13} className="text-slate-400" />
            <span>Base de comissão: Recebido em caixa menos Custo Fábrica</span>
          </div>
        </div>
      </div>

      {/* ── 4 CARDS DE KPIS REFINADOS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Recebido em Caixa */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Recebido (Caixa)
            </span>
            <DollarSign size={16} className="text-blue-500" />
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
            {formatarMoeda(totaisGerais.totalRecebido)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
            {totaisGerais.qtdPedidos} pedidos baixados · Venda: {formatarMoeda(totaisGerais.totalVendas)}
          </span>
        </div>

        {/* Resultado Líquido */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Resultado Líquido
            </span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
            {formatarMoeda(totaisGerais.resultadoLiquido)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
            Fábrica: {formatarMoeda(totaisGerais.totalPagamentoFabrica)} · Margem: {totaisGerais.margemMedia.toFixed(1)}%
          </span>
        </div>

        {/* Comissões Calculadas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Comissões Calculadas
            </span>
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {totaisGerais.taxaMedia.toFixed(0)}%
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block">
            {formatarMoeda(totaisGerais.totalComissao)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Total previsto sobre o líquido
          </span>
        </div>

        {/* Comissões Pagas / Pendentes */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Pagas vs. Pendentes
            </span>
            <CheckCircle size={16} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg sm:text-xl font-black text-emerald-800">
              {formatarMoeda(totaisGerais.comissaoPaga)}
            </span>
            <span className="text-xs font-bold text-amber-700">
              / {formatarMoeda(totaisGerais.comissaoPendente)}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Pagas no financeiro / A pagar
          </span>
        </div>
      </div>

      {/* ── TABELA MÊS A MÊS ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
            Demonstrativo Mensal por Data da Baixa ({anoFiltro})
          </h3>
          <span className="text-xs text-slate-400">Clique na linha do mês para detalhar os pedidos</span>
        </div>

        {carregando ? (
          <div className="text-center py-12 text-slate-400 text-xs">Carregando relatório de comissões...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700 min-w-[950px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5 text-left">Mês / Competência</th>
                  <th className="px-3 py-3.5 text-center">Pedidos Baixados</th>
                  <th className="px-4 py-3.5 text-right">Venda Bruta</th>
                  <th className="px-4 py-3.5 text-right text-blue-900">Valor Recebido</th>
                  <th className="px-4 py-3.5 text-right text-rose-800">Pagto Fábrica</th>
                  <th className="px-4 py-3.5 text-right text-slate-900">Resultado Líquido</th>
                  <th className="px-4 py-3.5 text-right text-emerald-700">Comissão Total</th>
                  <th className="px-4 py-3.5 text-right text-emerald-800">Paga</th>
                  <th className="px-4 py-3.5 text-right text-amber-700">Pendente</th>
                  <th className="px-3 py-3.5 text-center w-20">Detalhes</th>
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
                            : 'opacity-40 bg-slate-50/20'
                        } ${isExpandido ? 'bg-slate-50 font-semibold' : ''}`}
                      >
                        {/* Mês */}
                        <td className="px-5 py-3.5">
                          <span className="font-extrabold text-slate-900 block">{m.rotulo}</span>
                        </td>

                        {/* Qtd Pedidos */}
                        <td className="px-3 py-3.5 text-center font-bold text-slate-700">
                          {m.qtdPedidos}
                        </td>

                        {/* Venda Bruta */}
                        <td className="px-4 py-3.5 text-right font-medium text-slate-600 tabular-nums">
                          {formatarMoeda(m.totalVendas)}
                        </td>

                        {/* Recebido */}
                        <td className="px-4 py-3.5 text-right font-bold text-blue-900 tabular-nums">
                          {formatarMoeda(m.totalRecebido)}
                        </td>

                        {/* Pagamento Fábrica */}
                        <td className="px-4 py-3.5 text-right font-bold text-rose-700 tabular-nums">
                          {formatarMoeda(m.totalPagamentoFabrica)}
                        </td>

                        {/* Resultado Líquido */}
                        <td className="px-4 py-3.5 text-right font-black text-slate-900 tabular-nums">
                          {formatarMoeda(m.resultadoLiquido)}
                        </td>

                        {/* Total Comissão */}
                        <td className="px-4 py-3.5 text-right font-black text-emerald-700 tabular-nums">
                          {formatarMoeda(m.totalComissao)}
                        </td>

                        {/* Paga */}
                        <td className="px-4 py-3.5 text-right font-bold text-emerald-800 tabular-nums">
                          {formatarMoeda(m.comissaoPaga)}
                        </td>

                        {/* Pendente */}
                        <td className="px-4 py-3.5 text-right font-bold text-amber-700 tabular-nums">
                          {formatarMoeda(m.comissaoPendente)}
                        </td>

                        {/* Botão Expandir */}
                        <td className="px-3 py-3.5 text-center">
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
                          <td colSpan={10} className="p-3 sm:p-5">
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-bold text-slate-700">
                                <span>Vendas Baixadas em {m.rotulo} ({m.pedidos.length})</span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                  Fórmula: <strong>Resultado Líquido</strong> = Recebido Caixa − Custo Fábrica · <strong>Comissão</strong> = Líquido × %
                                </span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs min-w-[900px]">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/40">
                                      <th className="px-3 py-2 text-left">Pedido / Baixa</th>
                                      <th className="px-3 py-2 text-left">Cliente</th>
                                      <th className="px-3 py-2 text-left">Vendedor</th>
                                      <th className="px-3 py-2 text-right">Venda Bruta</th>
                                      <th className="px-3 py-2 text-right text-blue-900">Recebido</th>
                                      <th className="px-3 py-2 text-right text-rose-700">Custo Fábrica</th>
                                      <th className="px-3 py-2 text-right text-slate-900">Líquido</th>
                                      <th className="px-3 py-2 text-center">% Com.</th>
                                      <th className="px-3 py-2 text-right text-emerald-700">Comissão</th>
                                      <th className="px-3 py-2 text-right text-emerald-800">Já Gerado</th>
                                      <th className="px-3 py-2 text-right text-amber-700">A Pagar</th>
                                      <th className="px-3 py-2 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {m.pedidos.map((item) => (
                                      <tr key={item.pedido.id} className="hover:bg-slate-50/60">
                                        {/* Pedido e Baixa */}
                                        <td className="px-3 py-2">
                                          <div className="font-extrabold text-slate-900">
                                            #{item.pedido.numero}
                                          </div>
                                          <div className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                                            <Clock size={10} /> Baixa: {formatarData(item.dataBaixa)}
                                          </div>
                                        </td>

                                        {/* Cliente */}
                                        <td className="px-3 py-2 font-medium text-slate-800 truncate max-w-[160px]">
                                          {item.pedido.cliente_nome}
                                        </td>

                                        {/* Vendedor */}
                                        <td className="px-3 py-2 text-slate-600 font-medium">
                                          {item.vendedor}
                                        </td>

                                        {/* Venda Bruta */}
                                        <td className="px-3 py-2 text-right font-medium text-slate-500 tabular-nums">
                                          {formatarMoeda(item.valorVenda)}
                                        </td>

                                        {/* Recebido */}
                                        <td className="px-3 py-2 text-right font-bold text-blue-900 tabular-nums">
                                          {formatarMoeda(item.valorRecebido)}
                                        </td>

                                        {/* Custo Fábrica */}
                                        <td className="px-3 py-2 text-right font-bold text-rose-700 tabular-nums">
                                          {formatarMoeda(item.pagamentoFabrica)}
                                        </td>

                                        {/* Líquido */}
                                        <td className="px-3 py-2 text-right font-black text-slate-900 tabular-nums bg-slate-50/50">
                                          {formatarMoeda(item.resultadoLiquido)}
                                        </td>

                                        {/* % Com */}
                                        <td className="px-3 py-2 text-center font-bold text-slate-600">
                                          {item.taxaPercentual}%
                                        </td>

                                        {/* Comissão Total */}
                                        <td className="px-3 py-2 text-right font-black text-emerald-700 tabular-nums bg-emerald-50/30">
                                          {formatarMoeda(item.valorComissaoTotal)}
                                        </td>

                                        {/* Já Gerado */}
                                        <td className="px-3 py-2 text-right font-bold text-emerald-800 tabular-nums">
                                          {formatarMoeda(item.totalJaGerado)}
                                        </td>

                                        {/* Saldo Restante */}
                                        <td className="px-3 py-2 text-right font-bold text-amber-700 tabular-nums">
                                          {formatarMoeda(item.saldoRestante)}
                                        </td>

                                        {/* Status */}
                                        <td className="px-3 py-2 text-center">
                                          <span
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                              item.statusContaComissao === 'paga'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : item.statusContaComissao === 'parcial'
                                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                : item.statusContaComissao === 'aberta'
                                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                : 'bg-slate-100 text-slate-600'
                                            }`}
                                          >
                                            {item.statusContaComissao === 'paga'
                                              ? 'Paga'
                                              : item.statusContaComissao === 'parcial'
                                              ? 'Parcial'
                                              : item.statusContaComissao === 'aberta'
                                              ? 'Gerada (Aberta)'
                                              : 'Pendente Geração'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
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
