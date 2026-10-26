import React, { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  MessageCircle,
  Printer,
  Scale,
  Sparkles,
  TrendingDown,
  X,
  Check,
  Package,
} from 'lucide-react'
import { PedidoVenda, PedidoVendaItem } from '../services/v2PedidoVendasService'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData } from '../../modules/lib/datas'
import { buildWhatsappUrlWithText } from '../../lib/whatsapp'
import { formatarNumeroVendaExibicao } from '../pages/V2PedidoVendasPage'

type Props = {
  isOpen: boolean
  onClose: () => void
  propostas: PedidoVenda[]
  selectedIds?: string[]
  initialAId?: string | null
  initialBId?: string | null
  onAprovarProposta?: (id: string, cancelIds?: string[]) => Promise<void>
}

function normalizeKey(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Cores temáticas para cada opção de proposta (até 5 opções)
const OPCAO_TEMAS = [
  {
    nome: 'Opção 1',
    badgeBg: 'bg-indigo-100 text-indigo-700',
    border: 'border-indigo-200',
    headerBg: 'bg-indigo-50/50',
    textColor: 'text-indigo-950',
    btnBg: 'bg-indigo-600 hover:bg-indigo-700',
    columnBg: 'bg-indigo-50/20',
    accentText: 'text-indigo-700',
  },
  {
    nome: 'Opção 2',
    badgeBg: 'bg-purple-100 text-purple-700',
    border: 'border-purple-200',
    headerBg: 'bg-purple-50/50',
    textColor: 'text-purple-950',
    btnBg: 'bg-purple-600 hover:bg-purple-700',
    columnBg: 'bg-purple-50/20',
    accentText: 'text-purple-700',
  },
  {
    nome: 'Opção 3',
    badgeBg: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-50/50',
    textColor: 'text-emerald-950',
    btnBg: 'bg-emerald-600 hover:bg-emerald-700',
    columnBg: 'bg-emerald-50/20',
    accentText: 'text-emerald-700',
  },
  {
    nome: 'Opção 4',
    badgeBg: 'bg-amber-100 text-amber-800',
    border: 'border-amber-200',
    headerBg: 'bg-amber-50/50',
    textColor: 'text-amber-950',
    btnBg: 'bg-amber-600 hover:bg-amber-700',
    columnBg: 'bg-amber-50/20',
    accentText: 'text-amber-800',
  },
  {
    nome: 'Opção 5',
    badgeBg: 'bg-cyan-100 text-cyan-800',
    border: 'border-cyan-200',
    headerBg: 'bg-cyan-50/50',
    textColor: 'text-cyan-950',
    btnBg: 'bg-cyan-600 hover:bg-cyan-700',
    columnBg: 'bg-cyan-50/20',
    accentText: 'text-cyan-800',
  },
]

export function V2OrcamentosComparisonModal({
  isOpen,
  onClose,
  propostas,
  selectedIds,
  initialAId,
  initialBId,
  onAprovarProposta,
}: Props) {
  // Controle de visibilidade dos valores dos itens (por padrão false = ocultar todos os valores unitários e totais dos itens, mantendo somente o valor total do orçamento)
  const [mostrarValoresDosItens, setMostrarValoresDosItens] = useState(false)
  const [copiedNotification, setCopiedNotification] = useState(false)
  const [opcaoAtivaMobile, setOpcaoAtivaMobile] = useState<'todas' | string>('todas')

  // Lista das propostas que estão sendo comparadas (até 5)
  const propostasComparadas = useMemo(() => {
    if (!isOpen) return []

    // 1. Se selectedIds foi fornecido com múltiplos itens (ex: 3, 4 ou 5)
    if (selectedIds && selectedIds.length > 0) {
      const encontradas = selectedIds
        .map((id) => propostas.find((p) => p.id === id))
        .filter((p): p is PedidoVenda => Boolean(p))

      if (encontradas.length > 0) {
        return encontradas.slice(0, 5)
      }
    }

    // 2. Fallback para initialAId e initialBId
    const idsFallback = [initialAId, initialBId].filter(Boolean) as string[]
    if (idsFallback.length > 0) {
      const encontradas = idsFallback
        .map((id) => propostas.find((p) => p.id === id))
        .filter((p): p is PedidoVenda => Boolean(p))
      if (encontradas.length > 0) return encontradas
    }

    // 3. Fallback para as duas primeiras propostas
    return propostas.slice(0, 2)
  }, [isOpen, selectedIds, initialAId, initialBId, propostas])

  // Produtos unificados presentes em todas as propostas comparadas
  const produtosComparados = useMemo(() => {
    const map = new Map<
      string,
      {
        description: string
        itensPorProposta: Record<string, PedidoVendaItem | null>
      }
    >()

    for (const prop of propostasComparadas) {
      if (!prop.itens) continue
      for (const it of prop.itens) {
        const key = normalizeKey(it.produto_nome || it.produto_id)
        if (!map.has(key)) {
          const inicialItens: Record<string, PedidoVendaItem | null> = {}
          for (const p of propostasComparadas) {
            inicialItens[p.id] = null
          }
          map.set(key, {
            description: it.produto_nome,
            itensPorProposta: inicialItens,
          })
        }
        map.get(key)!.itensPorProposta[prop.id] = it
      }
    }

    return Array.from(map.values())
  }, [propostasComparadas])

  // Análise financeira dos totais (menor e maior valor)
  const analiseFinanceira = useMemo(() => {
    if (propostasComparadas.length < 2) return null

    const ordenadasPorValor = [...propostasComparadas].sort((a, b) => (a.total || 0) - (b.total || 0))
    const maisEconomica = ordenadasPorValor[0]
    const maiorValor = ordenadasPorValor[ordenadasPorValor.length - 1]

    const diff = (maiorValor.total || 0) - (maisEconomica.total || 0)
    const percEconomia = maiorValor.total > 0 ? (diff / maiorValor.total) * 100 : 0

    return {
      maisEconomica,
      maiorValor,
      diff,
      percEconomia,
      todasMesmoValor: diff === 0,
    }
  }, [propostasComparadas])

  // Gerar texto formatado do comparativo para WhatsApp e Copiar
  const generateSummaryText = () => {
    if (propostasComparadas.length === 0) return ''

    const clienteNome = propostasComparadas[0].cliente_nome || 'Cliente'
    const blocosPropostas = propostasComparadas
      .map((prop, idx) => {
        const tema = OPCAO_TEMAS[idx] || OPCAO_TEMAS[0]
        const numFormatado = formatarNumeroVendaExibicao(prop.numero)
        const parcelas = Math.max(1, prop.numeroParcelas || 1)
        const valorParcela = prop.total / parcelas
        const payStr = `${prop.formaPagamento || 'Boleto'} (${parcelas}x de ${formatarMoeda(valorParcela)})`

        const linhasItens = (prop.itens || [])
          .map((it) => {
            if (mostrarValoresDosItens) {
              return `  • ${it.quantidade}x ${it.produto_nome} (${formatarMoeda(it.preco_unitario)}/un) = ${formatarMoeda(it.total)}`
            }
            return `  • ${it.quantidade}x ${it.produto_nome}`
          })
          .join('\n')

        let condicoesTexto = ''
        if (prop.totalVista || prop.total5x) {
          condicoesTexto = `\n  💵 À vista: ${formatarMoeda(prop.totalVista ?? prop.total * 0.9)}\n  💳 Até 5x: ${formatarMoeda(prop.total5x ?? prop.total * 0.95)}`
        }

        return `────────────────────────────
*${tema.nome.toUpperCase()} (${numFormatado})*
${linhasItens || '  • Nenhum item detalhado'}
💰 *Valor Total:* ${formatarMoeda(prop.total)}
💳 *Condição:* ${payStr}${condicoesTexto}`
      })
      .join('\n\n')

    let destaqueEconomia = ''
    if (analiseFinanceira) {
      if (analiseFinanceira.todasMesmoValor) {
        destaqueEconomia = '\n⚖️ Todas as opções possuem o mesmo valor total.'
      } else {
        const idxEco = propostasComparadas.findIndex((p) => p.id === analiseFinanceira.maisEconomica.id)
        const nomeEco = OPCAO_TEMAS[idxEco]?.nome || 'A opção selecionada'
        destaqueEconomia = `\n💡 *${nomeEco} (${formatarNumeroVendaExibicao(analiseFinanceira.maisEconomica.numero)})* é a mais econômica, economizando *${formatarMoeda(analiseFinanceira.diff)}* (-${analiseFinanceira.percEconomia.toFixed(1)}%).`
      }
    }

    return `📊 *COMPARATIVO DE ORÇAMENTOS - BEM AVIV*
Olá! Segue o comparativo das opções comerciais preparadas para *${clienteNome}*:

${blocosPropostas}

────────────────────────────${destaqueEconomia}

Estamos à disposição para aprovar sua opção de preferência!`
  }

  const handleCopySummary = async () => {
    const text = generateSummaryText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedNotification(true)
      setTimeout(() => setCopiedNotification(false), 3000)
    } catch {
      alert('Não foi possível copiar o texto automaticamente.')
    }
  }

  const handleOpenWhatsapp = () => {
    const text = generateSummaryText()
    if (!text) return
    const url = buildWhatsappUrlWithText('', text) || `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const handlePrint = () => {
    window.print()
  }

  const handleAprovarOpcao = async (prop: PedidoVenda) => {
    if (!onAprovarProposta) return
    const cancelIds = propostasComparadas
      .filter((p) => p.id !== prop.id && p.status === 'proposta')
      .map((p) => p.id)
    await onAprovarProposta(prop.id, cancelIds)
  }

  if (!isOpen) return null

  // Filtro de exibição para celulares quando o usuário escolhe uma aba específica
  const propostasFiltradasMobile =
    opcaoAtivaMobile === 'todas'
      ? propostasComparadas
      : propostasComparadas.filter((p) => p.id === opcaoAtivaMobile)

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none font-sans">
        {/* ── CABEÇALHO DO MODAL ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 sm:px-6 py-3.5 sm:py-4 gap-3 print:hidden">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-xs shrink-0">
              <Scale size={18} className="sm:hidden" />
              <Scale size={20} className="hidden sm:block" />
            </span>
            <div>
              <h2 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5 sm:gap-2">
                Comparativo de Orçamentos
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-indigo-700">
                  {propostasComparadas.length} Opções
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate max-w-[260px] sm:max-w-none">
                Cliente: <strong className="text-slate-800">{propostasComparadas[0]?.cliente_nome || '—'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-between sm:justify-end">
            {/* Botão de Alternância de Visibilidade dos Valores dos Itens (Oculto por Padrão) */}
            <button
              type="button"
              onClick={() => setMostrarValoresDosItens(!mostrarValoresDosItens)}
              title={
                mostrarValoresDosItens
                  ? 'Valores dos itens visíveis. Clique para ocultar e exibir apenas o total do orçamento.'
                  : 'Valores dos itens ocultos (apenas total visível). Clique para exibir valores detalhados.'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                mostrarValoresDosItens
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mostrarValoresDosItens ? <Eye size={15} /> : <EyeOff size={15} className="text-slate-400" />}
              <span className="hidden sm:inline">
                {mostrarValoresDosItens ? 'Preços dos Itens: Visíveis' : 'Preços dos Itens: Ocultos'}
              </span>
              <span className="inline sm:hidden">
                {mostrarValoresDosItens ? 'Itens: Visíveis' : 'Itens: Ocultos'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer shadow-2xs"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── ÁREA DE CONTEÚDO COM SCROLL RESPONSIVO ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {propostasComparadas.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Scale size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold">Nenhum orçamento selecionado para comparação.</p>
            </div>
          ) : (
            <>
              {/* ── ABAS DE NAVEGAÇÃO RÁPIDA EM CELULARES (SMARTPHONES) ── */}
              {propostasComparadas.length > 1 && (
                <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto pb-1 -mt-2 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setOpcaoAtivaMobile('todas')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      opcaoAtivaMobile === 'todas'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todas ({propostasComparadas.length})
                  </button>
                  {propostasComparadas.map((prop, idx) => {
                    const tema = OPCAO_TEMAS[idx] || OPCAO_TEMAS[0]
                    const isAtiva = opcaoAtivaMobile === prop.id
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        onClick={() => setOpcaoAtivaMobile(prop.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                          isAtiva
                            ? `${tema.btnBg} text-white shadow-xs`
                            : `${tema.badgeBg} hover:opacity-85`
                        }`}
                      >
                        {tema.nome}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── CARDS DAS PROPOSTAS COMPARADAS ── */}
              <div
                className={`grid gap-4 ${
                  propostasComparadas.length === 2
                    ? 'grid-cols-1 md:grid-cols-2'
                    : propostasComparadas.length === 3
                    ? 'grid-cols-1 md:grid-cols-3'
                    : propostasComparadas.length === 4
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
                }`}
              >
                {propostasFiltradasMobile.map((prop) => {
                  const idxOriginal = propostasComparadas.findIndex((p) => p.id === prop.id)
                  const tema = OPCAO_TEMAS[idxOriginal] || OPCAO_TEMAS[0]
                  const parcelas = Math.max(1, prop.numeroParcelas || 1)
                  const valorParcela = prop.total / parcelas
                  const numFormatado = formatarNumeroVendaExibicao(prop.numero)

                  return (
                    <div
                      key={prop.id}
                      className={`relative rounded-3xl border-2 ${tema.border} bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4 transition-all`}
                    >
                      {/* Header do Card */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg ${tema.badgeBg}`}
                          >
                            {tema.nome}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">
                            {formatarData(prop.dataEmissao)}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight tabular-nums">
                            {numFormatado}
                          </h3>
                          <p className="text-xs font-bold text-slate-700 truncate mt-0.5">
                            {prop.cliente_nome}
                          </p>
                          {prop.cliente_cidade && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {prop.cliente_cidade}
                            </p>
                          )}
                        </div>

                        {/* Valor Total Destacado */}
                        <div className="rounded-2xl bg-slate-50 p-3 sm:p-3.5 border border-slate-100 text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Valor Total Oficial
                          </span>
                          <span className={`text-xl sm:text-2xl font-black ${tema.textColor} tabular-nums block mt-0.5`}>
                            {formatarMoeda(prop.total)}
                          </span>
                          <span className="text-[11px] text-slate-500 font-semibold mt-0.5 block truncate">
                            {prop.formaPagamento} ({parcelas}x de {formatarMoeda(valorParcela)})
                          </span>
                        </div>

                        {/* ── ESTRUTURA DA VISUALIZAÇÃO DO PEDIDO DE VENDA: SIMULAÇÃO DAS 3 MODALIDADES ── */}
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 space-y-2 text-xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Condições Comerciais
                          </span>
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex items-center justify-between text-slate-600">
                              <span>1. Sem desconto:</span>
                              <strong className="text-slate-900 font-bold tabular-nums">
                                {formatarMoeda(prop.subtotal || prop.total)}
                              </strong>
                            </div>
                            <div className="flex items-center justify-between text-slate-600">
                              <span>2. Até 5x ({prop.desconto5xPercentual ?? 5}%):</span>
                              <strong className="text-indigo-700 font-black tabular-nums">
                                {formatarMoeda(prop.total5x ?? (prop.subtotal || prop.total) * 0.95)}
                              </strong>
                            </div>
                            <div className="flex items-center justify-between text-slate-600">
                              <span>3. À vista ({prop.descontoVistaPercentual ?? 10}%):</span>
                              <strong className="text-emerald-700 font-black tabular-nums">
                                {formatarMoeda(prop.totalVista ?? (prop.subtotal || prop.total) * 0.9)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Botão de Aprovar Opção */}
                      {onAprovarProposta && (
                        <div className="pt-2 print:hidden">
                          <button
                            type="button"
                            onClick={() => void handleAprovarOpcao(prop)}
                            disabled={prop.status !== 'proposta'}
                            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${tema.btnBg}`}
                          >
                            <CheckCircle2 size={16} />
                            {prop.status === 'proposta'
                              ? `Aprovar ${tema.nome}`
                              : `Status: ${prop.status.toUpperCase()}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── CARD DE ANÁLISE COMPARATIVA DE PREÇO (ECONOMIA) ── */}
              {analiseFinanceira && (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-900 p-4 text-white shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {analiseFinanceira.todasMesmoValor ? (
                          <Scale size={20} />
                        ) : (
                          <TrendingDown size={20} className="text-emerald-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Análise Comparativa de Preço
                        </span>
                        <h4 className="text-xs sm:text-base font-extrabold text-white mt-0.5 leading-snug">
                          {analiseFinanceira.todasMesmoValor
                            ? 'Todas as opções comparadas possuem exatamente o mesmo valor total.'
                            : `${
                                OPCAO_TEMAS[
                                  propostasComparadas.findIndex(
                                    (p) => p.id === analiseFinanceira.maisEconomica.id
                                  )
                                ]?.nome || 'A proposta'
                              } (${formatarNumeroVendaExibicao(
                                analiseFinanceira.maisEconomica.numero
                              )}) é a mais econômica, economizando ${formatarMoeda(
                                analiseFinanceira.diff
                              )} (-${analiseFinanceira.percEconomia.toFixed(1)}%).`}
                        </h4>
                      </div>
                    </div>

                    {!analiseFinanceira.todasMesmoValor && (
                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                        <span className="text-xs font-semibold text-slate-300">Diferença Máxima:</span>
                        <span className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs sm:text-base font-black text-amber-300 tabular-nums border border-slate-700">
                          {formatarMoeda(analiseFinanceira.diff)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── VISUALIZAÇÃO DE PRODUTOS RESPONSIVA ── */}

              {/* 1. VISUALIZAÇÃO EM DISPOSITIVOS MÓVEIS (SMARTPHONES): ESTRUTURA DA VISUALIZAÇÃO DO PEDIDO DE VENDA */}
              <div className="block md:hidden space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-900">
                      Produtos Detalhados
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {produtosComparados.length} {produtosComparados.length === 1 ? 'produto' : 'produtos'}
                  </span>
                </div>

                {propostasFiltradasMobile.map((prop) => {
                  const idxOriginal = propostasComparadas.findIndex((p) => p.id === prop.id)
                  const tema = OPCAO_TEMAS[idxOriginal] || OPCAO_TEMAS[0]

                  return (
                    <div
                      key={prop.id}
                      className={`rounded-2xl border-2 ${tema.border} bg-white overflow-hidden shadow-xs`}
                    >
                      <div className={`px-4 py-2.5 ${tema.headerBg} border-b ${tema.border} flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${tema.badgeBg}`}>
                            {tema.nome}
                          </span>
                          <span className="text-xs font-bold text-slate-900 tabular-nums">
                            {formatarNumeroVendaExibicao(prop.numero)}
                          </span>
                        </div>
                        <span className="text-xs font-black text-slate-900 tabular-nums">
                          {formatarMoeda(prop.total)}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {prop.itens && prop.itens.length > 0 ? (
                          prop.itens.map((it, itIdx) => (
                            <div key={itIdx} className="p-3 text-xs flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800 truncate">{it.produto_nome}</p>
                                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                  <span>Qtd: <strong className="text-slate-700">{it.quantidade} un</strong></span>
                                  {mostrarValoresDosItens && (
                                    <>
                                      <span>·</span>
                                      <span>Unit: <strong className="text-slate-700">{formatarMoeda(it.preco_unitario)}</strong></span>
                                    </>
                                  )}
                                </div>
                              </div>
                              {mostrarValoresDosItens && (
                                <div className="text-right shrink-0">
                                  <span className="font-black text-slate-900 tabular-nums">
                                    {formatarMoeda(it.total)}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-slate-400 text-xs">
                            Nenhum item adicionado a este orçamento.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 2. VISUALIZAÇÃO EM TABLETS E DESKTOPS: TABELA MATRICIAL COMPARATIVA LADO A LADO */}
              <div className="hidden md:block rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Comparativo Detalhado de Produtos Lado a Lado
                    </h4>
                  </div>

                  <span className="text-xs font-semibold text-slate-500">
                    {produtosComparados.length}{' '}
                    {produtosComparados.length === 1 ? 'produto cotado' : 'produtos cotados'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-700 min-w-[650px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <th className="px-4 py-3 text-left font-bold uppercase text-slate-400">
                          Item / Descrição
                        </th>
                        {propostasComparadas.map((prop, idx) => {
                          const tema = OPCAO_TEMAS[idx] || OPCAO_TEMAS[0]
                          return (
                            <th
                              key={prop.id}
                              colSpan={mostrarValoresDosItens ? 3 : 1}
                              className={`px-3 py-2.5 text-center font-bold uppercase ${tema.columnBg} border-l border-slate-200/60`}
                            >
                              <span className={`px-2 py-0.5 rounded ${tema.badgeBg} text-[11px]`}>
                                {tema.nome} ({formatarNumeroVendaExibicao(prop.numero)})
                              </span>
                            </th>
                          )
                        })}
                      </tr>
                      {/* Sub-header de colunas: Qtd | (Preço Unit e Total se visíveis) */}
                      <tr className="border-b border-slate-100 bg-slate-50/30 text-[10px] uppercase text-slate-400">
                        <th className="px-4 py-2 text-left">Produto</th>
                        {propostasComparadas.map((prop) => (
                          <React.Fragment key={prop.id}>
                            <th className="px-2 py-2 text-center border-l border-slate-200/40">Qtd</th>
                            {mostrarValoresDosItens && (
                              <>
                                <th className="px-2 py-2 text-right">Unitário</th>
                                <th className="px-3 py-2 text-right">Total</th>
                              </>
                            )}
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {produtosComparados.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 max-w-xs truncate">
                            <div className="flex items-center gap-1.5">
                              <Package size={13} className="text-slate-400 shrink-0" />
                              <span className="truncate">{row.description}</span>
                            </div>
                          </td>
                          {propostasComparadas.map((prop, pIdx) => {
                            const it = row.itensPorProposta[prop.id]
                            const tema = OPCAO_TEMAS[pIdx] || OPCAO_TEMAS[0]

                            return (
                              <React.Fragment key={prop.id}>
                                <td
                                  className={`px-2 py-3 text-center tabular-nums font-bold ${tema.columnBg} border-l border-slate-200/40`}
                                >
                                  {it ? `${it.quantidade} un` : <span className="text-slate-300">—</span>}
                                </td>
                                {mostrarValoresDosItens && (
                                  <>
                                    <td className={`px-2 py-3 text-right tabular-nums text-slate-600 ${tema.columnBg}`}>
                                      {it ? formatarMoeda(it.preco_unitario) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td
                                      className={`px-3 py-3 text-right tabular-nums font-black text-slate-900 ${tema.columnBg}`}
                                    >
                                      {it ? formatarMoeda(it.total) : <span className="text-slate-300">—</span>}
                                    </td>
                                  </>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                        <td className="px-4 py-3 text-left font-black uppercase text-xs">
                          Total Geral
                        </td>
                        {propostasComparadas.map((prop, pIdx) => {
                          const totalPecas = (prop.itens || []).reduce((acc, it) => acc + (it.quantidade || 0), 0)
                          const tema = OPCAO_TEMAS[pIdx] || OPCAO_TEMAS[0]

                          return (
                            <React.Fragment key={prop.id}>
                              {!mostrarValoresDosItens ? (
                                <td
                                  className={`px-3 py-3 text-center tabular-nums ${tema.columnBg} border-l border-slate-200`}
                                >
                                  <div className="text-[11px] text-slate-500 font-bold">{totalPecas} un</div>
                                  <div className={`text-sm font-black ${tema.textColor}`}>
                                    {formatarMoeda(prop.total)}
                                  </div>
                                </td>
                              ) : (
                                <>
                                  <td
                                    className={`px-2 py-3 text-center tabular-nums font-black ${tema.columnBg} border-l border-slate-200`}
                                  >
                                    {totalPecas} un
                                  </td>
                                  <td className={`px-2 py-3 ${tema.columnBg}`} />
                                  <td
                                    className={`px-3 py-3 text-right tabular-nums text-sm font-black ${tema.textColor} ${tema.columnBg}`}
                                  >
                                    {formatarMoeda(prop.total)}
                                  </td>
                                </>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── RODAPÉ DE AÇÕES DO MODAL ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 sm:px-6 py-3.5 sm:py-4 gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenWhatsapp}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95 cursor-pointer"
            >
              <MessageCircle size={15} /> Enviar no WhatsApp
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            >
              {copiedNotification ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copiedNotification ? 'Copiado!' : 'Copiar Comparativo'}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            >
              <Printer size={15} /> Imprimir
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
