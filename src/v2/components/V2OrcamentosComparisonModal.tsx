import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  MessageCircle,
  Printer,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { PedidoVenda, PedidoVendaItem } from '../services/v2PedidoVendasService'
import { formatarMoeda } from '../../modules/lib/money'
import { formatarData } from '../../modules/lib/datas'
import { buildWhatsappUrlWithText } from '../../lib/whatsapp'

type Props = {
  isOpen: boolean
  onClose: () => void
  propostas: PedidoVenda[]
  initialAId?: string | null
  initialBId?: string | null
  onAprovarProposta?: (id: string) => Promise<void>
}

function normalizeKey(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function V2OrcamentosComparisonModal({
  isOpen,
  onClose,
  propostas,
  initialAId,
  initialBId,
  onAprovarProposta,
}: Props) {
  const [selectedAId, setSelectedAId] = useState<string>('')
  const [selectedBId, setSelectedBId] = useState<string>('')
  const [copiedNotification, setCopiedNotification] = useState(false)

  // Initialize selected IDs when modal opens
  useEffect(() => {
    if (!isOpen) return
    let idA = initialAId || ''
    let idB = initialBId || ''

    if (!idA && propostas.length > 0) {
      idA = propostas[0].id
    }
    if (!idB && propostas.length > 1) {
      idB = propostas.find((p) => p.id !== idA)?.id || propostas[1].id
    }

    setSelectedAId(idA)
    setSelectedBId(idB)
  }, [isOpen, initialAId, initialBId, propostas])

  const propA = useMemo(() => propostas.find((p) => p.id === selectedAId) ?? null, [propostas, selectedAId])
  const propB = useMemo(() => propostas.find((p) => p.id === selectedBId) ?? null, [propostas, selectedBId])

  const handleSwap = () => {
    const temp = selectedAId
    setSelectedAId(selectedBId)
    setSelectedBId(temp)
  }

  // Combine items from both quotes
  const comparisonItems = useMemo(() => {
    const map = new Map<
      string,
      {
        description: string
        itemA: PedidoVendaItem | null
        itemB: PedidoVendaItem | null
      }
    >()

    if (propA?.itens) {
      for (const it of propA.itens) {
        const key = normalizeKey(it.produto_nome || it.produto_id)
        map.set(key, {
          description: it.produto_nome,
          itemA: it,
          itemB: null,
        })
      }
    }

    if (propB?.itens) {
      for (const it of propB.itens) {
        const key = normalizeKey(it.produto_nome || it.produto_id)
        const existing = map.get(key)
        if (existing) {
          existing.itemB = it
        } else {
          map.set(key, {
            description: it.produto_nome,
            itemA: null,
            itemB: it,
          })
        }
      }
    }

    return Array.from(map.values())
  }, [propA, propB])

  // Financial calculations
  const totalA = propA ? Number(propA.total || 0) : 0
  const totalB = propB ? Number(propB.total || 0) : 0
  const diffVal = totalB - totalA
  const absDiff = Math.abs(diffVal)
  const percentDiff = totalA > 0 ? (absDiff / totalA) * 100 : 0

  const parcelasA = propA ? Math.max(1, propA.numeroParcelas || 1) : 1
  const parcelasB = propB ? Math.max(1, propB.numeroParcelas || 1) : 1

  const valorParcelaA = totalA > 0 ? totalA / parcelasA : 0
  const valorParcelaB = totalB > 0 ? totalB / parcelasB : 0

  // Format summary text for WhatsApp / Clipboard
  const generateSummaryText = () => {
    if (!propA || !propB) return ''

    const clientName = propA.cliente_nome || propB.cliente_nome || 'Cliente'
    const docA = propA.numero || 'Opção 1'
    const docB = propB.numero || 'Opção 2'

    let diffText = ''
    if (absDiff === 0) {
      diffText = '⚖️ Ambas as opções possuem o mesmo valor total.'
    } else if (diffVal > 0) {
      diffText = `💡 *${docA}* é *${formatarMoeda(absDiff)}* (${percentDiff.toFixed(1)}%) mais econômico que o ${docB}.`
    } else {
      diffText = `💡 *${docB}* é *${formatarMoeda(absDiff)}* (${percentDiff.toFixed(1)}%) mais econômico que o ${docA}.`
    }

    const payA = `${propA.formaPagamento || 'Boleto'} (${parcelasA}x de ${formatarMoeda(valorParcelaA)})`
    const payB = `${propB.formaPagamento || 'Boleto'} (${parcelasB}x de ${formatarMoeda(valorParcelaB)})`

    const linesA = (propA.itens || [])
      .map((it) => `  • ${it.quantidade}x ${it.produto_nome} - ${formatarMoeda(it.total)}`)
      .join('\n')
    const linesB = (propB.itens || [])
      .map((it) => `  • ${it.quantidade}x ${it.produto_nome} - ${formatarMoeda(it.total)}`)
      .join('\n')

    return `📊 *COMPARATIVO DE ORÇAMENTOS - BEM AVIV*
Olá! Segue o comparativo das opções comerciais preparadas para *${clientName}*:

────────────────────────────
*OPÇÃO 1 (${docA})*
${linesA || '  • Nenhum item detalhado'}
💰 *Valor Total:* ${formatarMoeda(totalA)}
💳 *Pagamento:* ${payA}

────────────────────────────
*OPÇÃO 2 (${docB})*
${linesB || '  • Nenhum item detalhado'}
💰 *Valor Total:* ${formatarMoeda(totalB)}
💳 *Pagamento:* ${payB}

────────────────────────────
${diffText}

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

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v2-comparison-modal-title"
    >
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col rounded-3xl border border-slate-200/80 bg-white shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm">
              <Scale size={20} />
            </span>
            <div>
              <h2 id="v2-comparison-modal-title" className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Comparativo de Orçamentos / Propostas
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  V2 Lado a Lado
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Analise e compare opções de propostas comerciais para o seu cliente antes do fechamento.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95 shadow-sm"
            onClick={onClose}
            aria-label="Fechar comparador"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Top Selectors Bar */}
          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 print:hidden">
            {/* Select A */}
            <div className="md:col-span-5 space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                Orçamento 1 (Base / Esquerda)
              </label>
              <select
                value={selectedAId}
                onChange={(e) => setSelectedAId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
              >
                <option value="">Selecione o 1º orçamento...</option>
                {propostas.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.id === selectedBId}>
                    {p.numero} · {p.cliente_nome} · {formatarMoeda(p.total)} ({p.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Swap Button */}
            <div className="md:col-span-1 flex justify-center py-1 md:py-0">
              <button
                type="button"
                onClick={handleSwap}
                disabled={!selectedAId || !selectedBId}
                title="Inverter lados da comparação"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 active:scale-95 disabled:opacity-40"
              >
                <ArrowLeftRight size={18} />
              </button>
            </div>

            {/* Select B */}
            <div className="md:col-span-5 space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                Orçamento 2 (Comparativo / Direita)
              </label>
              <select
                value={selectedBId}
                onChange={(e) => setSelectedBId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all shadow-sm"
              >
                <option value="">Selecione o 2º orçamento...</option>
                {propostas.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.id === selectedAId}>
                    {p.numero} · {p.cliente_nome} · {formatarMoeda(p.total)} ({p.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!propA || !propB ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl p-8">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 mb-3">
                <Scale size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-800">Selecione dois orçamentos para comparar</h3>
              <p className="text-sm text-slate-500 max-w-md mt-1">
                Escolha os orçamentos nos seletores acima para visualizar a comparação lado a lado de produtos, condições de pagamento e diferenças financeiras.
              </p>
            </div>
          ) : (
            <>
              {/* Header Cards Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card Orçamento A */}
                <div className="relative rounded-2xl border-2 border-indigo-100 bg-gradient-to-b from-indigo-50/40 via-white to-white p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                          Opção 1
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {formatarData(propA.dataEmissao)}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {propA.canal === 'distribuicao' ? 'Distribuição' : 'Representação'}
                        </span>
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                        {propA.numero}
                      </h3>
                      <p className="text-sm font-semibold text-slate-700 truncate max-w-xs mt-0.5">
                        {propA.cliente_nome}
                      </p>
                      {propA.cliente_cidade && (
                        <p className="text-xs text-slate-500">
                          Cidade: <strong className="font-semibold text-slate-700">{propA.cliente_cidade}</strong>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Valor Total</span>
                      <span className="text-2xl font-black text-indigo-950 tabular-nums">
                        {formatarMoeda(totalA)}
                      </span>
                    </div>
                  </div>

                  {/* Conditions & Details */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Forma de Pagamento</span>
                      <span className="font-bold text-slate-800">
                        {propA.formaPagamento || 'Boleto'}
                      </span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        {propA.tabela_preco_nome || 'Tabela Padrão'}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Parcelamento</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {parcelasA}x de {formatarMoeda(valorParcelaA)}
                      </span>
                      {propA.descontoTotal > 0 && (
                        <span className="text-emerald-600 block text-[11px] font-semibold mt-0.5">
                          Desconto: {formatarMoeda(propA.descontoTotal)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action button: Aprovar */}
                  {onAprovarProposta && (
                    <div className="pt-1 print:hidden">
                      <button
                        type="button"
                        onClick={() => void onAprovarProposta(propA.id)}
                        disabled={propA.status !== 'proposta'}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-40"
                      >
                        <CheckCircle2 size={16} />
                        {propA.status === 'proposta' ? 'Aprovar Opção 1 e Gerar Pedido de Venda' : `Status: ${propA.status.toUpperCase()}`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Orçamento B */}
                <div className="relative rounded-2xl border-2 border-purple-100 bg-gradient-to-b from-purple-50/40 via-white to-white p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-md">
                          Opção 2
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {formatarData(propB.dataEmissao)}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {propB.canal === 'distribuicao' ? 'Distribuição' : 'Representação'}
                        </span>
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                        {propB.numero}
                      </h3>
                      <p className="text-sm font-semibold text-slate-700 truncate max-w-xs mt-0.5">
                        {propB.cliente_nome}
                      </p>
                      {propB.cliente_cidade && (
                        <p className="text-xs text-slate-500">
                          Cidade: <strong className="font-semibold text-slate-700">{propB.cliente_cidade}</strong>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Valor Total</span>
                      <span className="text-2xl font-black text-purple-950 tabular-nums">
                        {formatarMoeda(totalB)}
                      </span>
                    </div>
                  </div>

                  {/* Conditions & Details */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Forma de Pagamento</span>
                      <span className="font-bold text-slate-800">
                        {propB.formaPagamento || 'Boleto'}
                      </span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        {propB.tabela_preco_nome || 'Tabela Padrão'}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Parcelamento</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {parcelasB}x de {formatarMoeda(valorParcelaB)}
                      </span>
                      {propB.descontoTotal > 0 && (
                        <span className="text-emerald-600 block text-[11px] font-semibold mt-0.5">
                          Desconto: {formatarMoeda(propB.descontoTotal)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action button: Aprovar */}
                  {onAprovarProposta && (
                    <div className="pt-1 print:hidden">
                      <button
                        type="button"
                        onClick={() => void onAprovarProposta(propB.id)}
                        disabled={propB.status !== 'proposta'}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-purple-700 active:scale-95 disabled:opacity-40"
                      >
                        <CheckCircle2 size={16} />
                        {propB.status === 'proposta' ? 'Aprovar Opção 2 e Gerar Pedido de Venda' : `Status: ${propB.status.toUpperCase()}`}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Difference Banner */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-900 p-4 text-white shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                        absDiff === 0
                          ? 'bg-slate-800 text-slate-300'
                          : diffVal > 0
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}
                    >
                      {absDiff === 0 ? (
                        <Scale size={20} />
                      ) : diffVal > 0 ? (
                        <TrendingDown size={20} className="text-emerald-400" />
                      ) : (
                        <TrendingUp size={20} className="text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Análise Comparativa de Preço (V2)
                      </span>
                      <h4 className="text-base font-extrabold text-white mt-0.5">
                        {absDiff === 0
                          ? 'Ambas as opções de orçamentos possuem o mesmo valor total'
                          : diffVal > 0
                          ? `Opção 1 é mais econômica em ${formatarMoeda(absDiff)} (-${percentDiff.toFixed(1)}%)`
                          : `Opção 2 é mais econômica em ${formatarMoeda(absDiff)} (-${percentDiff.toFixed(1)}%)`}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:self-center">
                    <span className="text-xs font-semibold text-slate-300">Diferença:</span>
                    <span className="rounded-xl bg-slate-800 px-3.5 py-1.5 text-base font-black text-amber-300 tabular-nums border border-slate-700">
                      {formatarMoeda(absDiff)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Products Detailed Comparison Table */}
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden space-y-0">
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Comparativo de Itens e Produtos
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {comparisonItems.length} {comparisonItems.length === 1 ? 'produto único' : 'produtos comparados'}
                  </span>
                </div>

                {comparisonItems.length === 0 ? (
                  <div className="py-10 text-center text-xs font-semibold text-slate-400">
                    Nenhum item adicionado nos orçamentos selecionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-700">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="px-4 py-3 text-left font-bold uppercase text-slate-400">Item / Descrição</th>
                          <th className="px-3 py-3 text-center font-bold uppercase text-indigo-700 bg-indigo-50/40">
                            Qtd (Opção 1)
                          </th>
                          <th className="px-3 py-3 text-right font-bold uppercase text-indigo-700 bg-indigo-50/40">
                            Total (Opção 1)
                          </th>
                          <th className="px-3 py-3 text-center font-bold uppercase text-purple-700 bg-purple-50/40">
                            Qtd (Opção 2)
                          </th>
                          <th className="px-3 py-3 text-right font-bold uppercase text-purple-700 bg-purple-50/40">
                            Total (Opção 2)
                          </th>
                          <th className="px-4 py-3 text-center font-bold uppercase text-slate-400">Diferença / Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparisonItems.map((row, idx) => {
                          const hasA = !!row.itemA
                          const hasB = !!row.itemB
                          const valA = row.itemA ? Number(row.itemA.total) : 0
                          const valB = row.itemB ? Number(row.itemB.total) : 0
                          const diffItem = valB - valA

                          let badge = null
                          if (hasA && hasB) {
                            if (valA === valB && row.itemA?.quantidade === row.itemB?.quantidade) {
                              badge = (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  Idêntico
                                </span>
                              )
                            } else {
                              badge = (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                  Variação de {formatarMoeda(Math.abs(diffItem))}
                                </span>
                              )
                            }
                          } else if (hasA && !hasB) {
                            badge = (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                                Apenas na Opção 1
                              </span>
                            )
                          } else {
                            badge = (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                Apenas na Opção 2
                              </span>
                            )
                          }

                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {row.description}
                              </td>
                              <td className="px-3 py-3 text-center font-medium tabular-nums bg-indigo-50/20">
                                {row.itemA ? `${row.itemA.quantidade} un` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums bg-indigo-50/20">
                                {row.itemA ? formatarMoeda(valA) : '—'}
                              </td>
                              <td className="px-3 py-3 text-center font-medium tabular-nums bg-purple-50/20">
                                {row.itemB ? `${row.itemB.quantidade} un` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums bg-purple-50/20">
                                {row.itemB ? formatarMoeda(valB) : '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {badge}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-bold text-slate-900">
                          <td className="px-4 py-3 text-left font-black uppercase text-xs">Totalizador</td>
                          <td className="px-3 py-3 text-center tabular-nums bg-indigo-50/40">
                            {(propA.itens || []).reduce((acc, it) => acc + (it.quantidade || 0), 0)} un
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-sm font-black text-indigo-900 bg-indigo-50/40">
                            {formatarMoeda(totalA)}
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums bg-purple-50/40">
                            {(propB.itens || []).reduce((acc, it) => acc + (it.quantidade || 0), 0)} un
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-sm font-black text-purple-900 bg-purple-50/40">
                            {formatarMoeda(totalB)}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-slate-500 font-medium">
                            Diferença: {formatarMoeda(absDiff)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes Comparison (if any) */}
              {(propA.observacao || propB.observacao) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Observações (Opção 1)
                    </span>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {propA.observacao || 'Nenhuma observação registrada.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Observações (Opção 2)
                    </span>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {propB.observacao || 'Nenhuma observação registrada.'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              disabled={!propA || !propB}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40"
            >
              <Copy size={16} />
              {copiedNotification ? 'Copiado para Área de Transferência!' : 'Copiar Comparativo'}
            </button>
            <button
              type="button"
              onClick={handleOpenWhatsapp}
              disabled={!propA || !propB}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
            >
              <MessageCircle size={16} />
              Enviar no WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!propA || !propB}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40"
            >
              <Printer size={16} />
              Imprimir
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
