import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  MessageCircle,
  Printer,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useSupabase } from '../../hooks/useSupabase'
import { formatBRL } from '../../lib/format'
import { buildWhatsappUrlWithText } from '../../lib/whatsapp'

export type PedidoQuote = {
  id: string
  client_id: string | null
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  source_quote_id: string | null
  converted_order_id: string | null
  status: string
  total_amount: number
  notes: string | null
  discount_total: number | null
  installments_count: number | null
  payment_option?: string | null
  payment_method?: string | null
  down_payment_amount?: number | null
  down_payment_method?: string | null
  freight_amount?: number | null
  other_expenses?: number | null
  client_relative_id?: string | null
  client_accepted_at?: string | null
}

export type QuoteItem = {
  id: string
  sales_order_id: string
  item_description: string
  quantity: number
  unit_price: number
  discount_amount: number
  total_price: number
  variation_code?: string | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  quotes: PedidoQuote[]
  initialQuoteAId?: string | null
  initialQuoteBId?: string | null
  clientsMap: Map<string, string>
  relativesMap: Map<string, { name: string; relationship?: string }>
  onConvertQuoteToOrder?: (quote: PedidoQuote) => Promise<void>
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão de Débito',
  CARTAO_CREDITO: 'Cartão de Crédito',
  BOLETO: 'Boleto',
}

function normalizeKey(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function OrcamentosComparisonModal({
  isOpen,
  onClose,
  quotes,
  initialQuoteAId,
  initialQuoteBId,
  clientsMap,
  relativesMap,
  onConvertQuoteToOrder,
}: Props) {
  const supabase = useSupabase()

  // Selected quotes IDs
  const [selectedAId, setSelectedAId] = useState<string>('')
  const [selectedBId, setSelectedBId] = useState<string>('')

  // Loaded items
  const [itemsA, setItemsA] = useState<QuoteItem[]>([])
  const [itemsB, setItemsB] = useState<QuoteItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [copiedNotification, setCopiedNotification] = useState(false)

  // Client phone for WhatsApp
  const [clientPhone, setClientPhone] = useState<string | null>(null)

  // Initialize selected IDs when modal opens
  useEffect(() => {
    if (!isOpen) return
    const onlyQuotes = quotes.filter((q) => q.document_type === 'ORCAMENTO')

    let idA = initialQuoteAId || ''
    let idB = initialQuoteBId || ''

    if (!idA && onlyQuotes.length > 0) {
      idA = onlyQuotes[0].id
    }
    if (!idB && onlyQuotes.length > 1) {
      idB = onlyQuotes.find((q) => q.id !== idA)?.id || onlyQuotes[1].id
    }

    setSelectedAId(idA)
    setSelectedBId(idB)
  }, [isOpen, initialQuoteAId, initialQuoteBId, quotes])

  const quoteA = useMemo(() => quotes.find((q) => q.id === selectedAId) ?? null, [quotes, selectedAId])
  const quoteB = useMemo(() => quotes.find((q) => q.id === selectedBId) ?? null, [quotes, selectedBId])

  // Fetch client phone for WhatsApp contact
  useEffect(() => {
    const targetClientId = quoteA?.client_id || quoteB?.client_id
    if (!targetClientId || !supabase) {
      setClientPhone(null)
      return
    }

    let active = true
    void (async () => {
      const { data } = await supabase
        .from('bem_aviv_clients')
        .select('phone_1, phone_2')
        .eq('id', targetClientId)
        .maybeSingle()

      if (!active) return
      if (data) {
        setClientPhone(data.phone_1 || data.phone_2 || null)
      } else {
        setClientPhone(null)
      }
    })()

    return () => {
      active = false
    }
  }, [quoteA?.client_id, quoteB?.client_id, supabase])

  // Fetch items for quoteA and quoteB
  useEffect(() => {
    if (!isOpen || !supabase) return
    if (!selectedAId && !selectedBId) {
      setItemsA([])
      setItemsB([])
      return
    }

    let active = true
    setLoadingItems(true)

    void (async () => {
      const idsToFetch = [selectedAId, selectedBId].filter(Boolean)
      const { data, error } = await supabase
        .from('bem_aviv_sales_order_items')
        .select('id, sales_order_id, item_description, quantity, unit_price, discount_amount, total_price, variation_code')
        .in('sales_order_id', idsToFetch)

      if (!active) return
      setLoadingItems(false)

      if (!error && data) {
        const rows = data as QuoteItem[]
        setItemsA(rows.filter((it) => it.sales_order_id === selectedAId))
        setItemsB(rows.filter((it) => it.sales_order_id === selectedBId))
      } else {
        setItemsA([])
        setItemsB([])
      }
    })()

    return () => {
      active = false
    }
  }, [isOpen, selectedAId, selectedBId, supabase])

  // Invert quotes positions
  const handleSwap = () => {
    const temp = selectedAId
    setSelectedAId(selectedBId)
    setSelectedBId(temp)
  }

  // Combined Items comparison
  const comparisonItems = useMemo(() => {
    const map = new Map<
      string,
      {
        description: string
        itemA: QuoteItem | null
        itemB: QuoteItem | null
      }
    >()

    for (const item of itemsA) {
      const key = normalizeKey(item.item_description)
      map.set(key, {
        description: item.item_description,
        itemA: item,
        itemB: null,
      })
    }

    for (const item of itemsB) {
      const key = normalizeKey(item.item_description)
      const existing = map.get(key)
      if (existing) {
        existing.itemB = item
      } else {
        map.set(key, {
          description: item.item_description,
          itemA: null,
          itemB: item,
        })
      }
    }

    return Array.from(map.values())
  }, [itemsA, itemsB])

  // Financial calculations
  const totalA = quoteA ? Number(quoteA.total_amount || 0) : 0
  const totalB = quoteB ? Number(quoteB.total_amount || 0) : 0
  const diffVal = totalB - totalA
  const absDiff = Math.abs(diffVal)
  const percentDiff = totalA > 0 ? (absDiff / totalA) * 100 : 0

  const downA = quoteA ? Number(quoteA.down_payment_amount || 0) : 0
  const downB = quoteB ? Number(quoteB.down_payment_amount || 0) : 0

  const instCountA = quoteA ? Math.max(1, quoteA.installments_count || 1) : 1
  const instCountB = quoteB ? Math.max(1, quoteB.installments_count || 1) : 1

  const instValA = totalA > downA && instCountA > 0 ? (totalA - downA) / instCountA : 0
  const instValB = totalB > downB && instCountB > 0 ? (totalB - downB) / instCountB : 0

  // Format summary for WhatsApp / Clipboard
  const generateSummaryText = () => {
    if (!quoteA || !quoteB) return ''

    const clientNameA = quoteA.client_id ? clientsMap.get(quoteA.client_id) ?? 'Cliente' : 'Cliente'
    const docA = quoteA.document_number || 'Orçamento A'
    const docB = quoteB.document_number || 'Orçamento B'

    let diffText = ''
    if (absDiff === 0) {
      diffText = '⚖️ Ambos os orçamentos possuem o mesmo valor total.'
    } else if (diffVal > 0) {
      diffText = `💡 *Orçamento A* é *${formatBRL(absDiff)}* (${percentDiff.toFixed(1)}%) mais econômico que o Orçamento B.`
    } else {
      diffText = `💡 *Orçamento B* é *${formatBRL(absDiff)}* (${percentDiff.toFixed(1)}%) mais econômico que o Orçamento A.`
    }

    const payOptionA = quoteA.payment_option === 'A_PRAZO'
      ? `A Prazo (Entrada: ${downA > 0 ? formatBRL(downA) : 'Sem entrada'} + ${instCountA}x de ${formatBRL(instValA)})`
      : `À Vista (${PAYMENT_METHOD_LABEL[quoteA.payment_method || ''] || 'PIX/Dinheiro'})`

    const payOptionB = quoteB.payment_option === 'A_PRAZO'
      ? `A Prazo (Entrada: ${downB > 0 ? formatBRL(downB) : 'Sem entrada'} + ${instCountB}x de ${formatBRL(instValB)})`
      : `À Vista (${PAYMENT_METHOD_LABEL[quoteB.payment_method || ''] || 'PIX/Dinheiro'})`

    const linesA = itemsA.map((it) => `  • ${it.quantity}x ${it.item_description} - ${formatBRL(it.total_price)}`).join('\n')
    const linesB = itemsB.map((it) => `  • ${it.quantity}x ${it.item_description} - ${formatBRL(it.total_price)}`).join('\n')

    return `📊 *COMPARATIVO DE ORÇAMENTOS*
Olá! Segue o comparativo das opções preparadas para ${clientNameA}:

────────────────────────────
*OPÇÃO 1: ${docA}*
${linesA || '  • Nenhum item detalhado'}
💰 *Valor Total:* ${formatBRL(totalA)}
💳 *Condição:* ${payOptionA}

────────────────────────────
*OPÇÃO 2: ${docB}*
${linesB || '  • Nenhum item detalhado'}
💰 *Valor Total:* ${formatBRL(totalB)}
💳 *Condição:* ${payOptionB}

────────────────────────────
${diffText}

Estamos à disposição para tirar qualquer dúvida e formalizar seu pedido!`
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
    const url = buildWhatsappUrlWithText(clientPhone, text) || `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
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
      aria-labelledby="comparison-modal-title"
    >
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col rounded-3xl border border-slate-200/80 bg-white shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm">
              <Scale size={20} />
            </span>
            <div>
              <h2 id="comparison-modal-title" className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Comparativo de Orçamentos
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  Lado a Lado
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Analise diferenças de produtos, valores e condições de pagamento entre duas propostas.
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
                {quotes
                  .filter((q) => q.document_type === 'ORCAMENTO')
                  .map((q) => {
                    const clientName = q.client_id ? clientsMap.get(q.client_id) ?? 'Sem cliente' : 'Sem cliente'
                    return (
                      <option key={q.id} value={q.id} disabled={q.id === selectedBId}>
                        {q.document_number || 'Sem nº'} · {clientName} · {formatBRL(q.total_amount)}
                      </option>
                    )
                  })}
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
                {quotes
                  .filter((q) => q.document_type === 'ORCAMENTO')
                  .map((q) => {
                    const clientName = q.client_id ? clientsMap.get(q.client_id) ?? 'Sem cliente' : 'Sem cliente'
                    return (
                      <option key={q.id} value={q.id} disabled={q.id === selectedAId}>
                        {q.document_number || 'Sem nº'} · {clientName} · {formatBRL(q.total_amount)}
                      </option>
                    )
                  })}
              </select>
            </div>
          </div>

          {!quoteA || !quoteB ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl p-8">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 mb-3">
                <FileSpreadsheet size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-800">Selecione dois orçamentos para comparar</h3>
              <p className="text-sm text-slate-500 max-w-md mt-1">
                Escolha os orçamentos nos seletores acima para visualizar a comparação lado a lado de produtos, totais, parcelas e diferenças de preço.
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
                          {quoteA.order_date ? quoteA.order_date.split('-').reverse().join('/') : ''}
                        </span>
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                        {quoteA.document_number || 'Sem nº'}
                      </h3>
                      <p className="text-sm font-semibold text-slate-700 truncate max-w-xs mt-0.5">
                        {quoteA.client_id ? clientsMap.get(quoteA.client_id) ?? 'Cliente não identificado' : 'Cliente não identificado'}
                      </p>
                      {quoteA.client_relative_id && relativesMap.has(quoteA.client_relative_id) && (
                        <p className="text-xs text-slate-500">
                          Beneficiário: <strong className="font-semibold text-slate-700">{relativesMap.get(quoteA.client_relative_id)?.name}</strong>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Valor Total</span>
                      <span className="text-2xl font-black text-indigo-950 tabular-nums">
                        {formatBRL(totalA)}
                      </span>
                    </div>
                  </div>

                  {/* Conditions & Details */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Condição de Pagamento</span>
                      <span className="font-bold text-slate-800">
                        {quoteA.payment_option === 'A_PRAZO' ? 'A Prazo' : 'À Vista'}
                      </span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        {quoteA.payment_method ? PAYMENT_METHOD_LABEL[quoteA.payment_method] || quoteA.payment_method : '—'}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Parcelamento</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {quoteA.payment_option === 'A_PRAZO'
                          ? `${instCountA}x de ${formatBRL(instValA)}`
                          : '1x (À vista)'}
                      </span>
                      {downA > 0 && (
                        <span className="text-emerald-600 block text-[11px] font-semibold mt-0.5">
                          Entrada: {formatBRL(downA)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action button: Close quote and create order */}
                  {onConvertQuoteToOrder && (
                    <div className="pt-1 print:hidden">
                      <button
                        type="button"
                        onClick={() => void onConvertQuoteToOrder(quoteA)}
                        disabled={!!quoteA.converted_order_id}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-40"
                      >
                        <CheckCircle2 size={16} />
                        {quoteA.converted_order_id ? 'Já convertido em Pedido' : 'Aprovar Opção 1 e Gerar Pedido'}
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
                          {quoteB.order_date ? quoteB.order_date.split('-').reverse().join('/') : ''}
                        </span>
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
                        {quoteB.document_number || 'Sem nº'}
                      </h3>
                      <p className="text-sm font-semibold text-slate-700 truncate max-w-xs mt-0.5">
                        {quoteB.client_id ? clientsMap.get(quoteB.client_id) ?? 'Cliente não identificado' : 'Cliente não identificado'}
                      </p>
                      {quoteB.client_relative_id && relativesMap.has(quoteB.client_relative_id) && (
                        <p className="text-xs text-slate-500">
                          Beneficiário: <strong className="font-semibold text-slate-700">{relativesMap.get(quoteB.client_relative_id)?.name}</strong>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Valor Total</span>
                      <span className="text-2xl font-black text-purple-950 tabular-nums">
                        {formatBRL(totalB)}
                      </span>
                    </div>
                  </div>

                  {/* Conditions & Details */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Condição de Pagamento</span>
                      <span className="font-bold text-slate-800">
                        {quoteB.payment_option === 'A_PRAZO' ? 'A Prazo' : 'À Vista'}
                      </span>
                      <span className="text-slate-500 block text-[11px] mt-0.5">
                        {quoteB.payment_method ? PAYMENT_METHOD_LABEL[quoteB.payment_method] || quoteB.payment_method : '—'}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-slate-400 font-medium block">Parcelamento</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {quoteB.payment_option === 'A_PRAZO'
                          ? `${instCountB}x de ${formatBRL(instValB)}`
                          : '1x (À vista)'}
                      </span>
                      {downB > 0 && (
                        <span className="text-emerald-600 block text-[11px] font-semibold mt-0.5">
                          Entrada: {formatBRL(downB)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action button: Close quote and create order */}
                  {onConvertQuoteToOrder && (
                    <div className="pt-1 print:hidden">
                      <button
                        type="button"
                        onClick={() => void onConvertQuoteToOrder(quoteB)}
                        disabled={!!quoteB.converted_order_id}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-purple-700 active:scale-95 disabled:opacity-40"
                      >
                        <CheckCircle2 size={16} />
                        {quoteB.converted_order_id ? 'Já convertido em Pedido' : 'Aprovar Opção 2 e Gerar Pedido'}
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
                        Análise Comparativa de Preço
                      </span>
                      <h4 className="text-base font-extrabold text-white mt-0.5">
                        {absDiff === 0
                          ? 'Ambos os orçamentos possuem exatamente o mesmo valor total'
                          : diffVal > 0
                          ? `Opção 1 é mais econômica em ${formatBRL(absDiff)} (-${percentDiff.toFixed(1)}%)`
                          : `Opção 2 é mais econômica em ${formatBRL(absDiff)} (-${percentDiff.toFixed(1)}%)`}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:self-center">
                    <span className="text-xs font-semibold text-slate-300">Diferença:</span>
                    <span className="rounded-xl bg-slate-800 px-3.5 py-1.5 text-base font-black text-amber-300 tabular-nums border border-slate-700">
                      {formatBRL(absDiff)}
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
                    {comparisonItems.length} {comparisonItems.length === 1 ? 'produto único' : 'produtos mapeados'}
                  </span>
                </div>

                {loadingItems ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    <span className="text-xs font-semibold">Carregando itens dos orçamentos...</span>
                  </div>
                ) : comparisonItems.length === 0 ? (
                  <div className="py-10 text-center text-xs font-semibold text-slate-400">
                    Nenhum item cadastrado nos orçamentos selecionados.
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
                          const valA = row.itemA ? Number(row.itemA.total_price) : 0
                          const valB = row.itemB ? Number(row.itemB.total_price) : 0
                          const diffItem = valB - valA

                          let badge = null
                          if (hasA && hasB) {
                            if (valA === valB && row.itemA?.quantity === row.itemB?.quantity) {
                              badge = (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  Idêntico
                                </span>
                              )
                            } else {
                              badge = (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                  Variação de {formatBRL(Math.abs(diffItem))}
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
                                {row.itemA ? `${row.itemA.quantity} un` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums bg-indigo-50/20">
                                {row.itemA ? formatBRL(valA) : '—'}
                              </td>
                              <td className="px-3 py-3 text-center font-medium tabular-nums bg-purple-50/20">
                                {row.itemB ? `${row.itemB.quantity} un` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums bg-purple-50/20">
                                {row.itemB ? formatBRL(valB) : '—'}
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
                            {itemsA.reduce((acc, it) => acc + (it.quantity || 0), 0)} un
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-sm font-black text-indigo-900 bg-indigo-50/40">
                            {formatBRL(totalA)}
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums bg-purple-50/40">
                            {itemsB.reduce((acc, it) => acc + (it.quantity || 0), 0)} un
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-sm font-black text-purple-900 bg-purple-50/40">
                            {formatBRL(totalB)}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-slate-500 font-medium">
                            Diferença: {formatBRL(absDiff)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes Comparison (if any) */}
              {(quoteA.notes || quoteB.notes) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Observações (Opção 1)
                    </span>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {quoteA.notes || 'Nenhuma observação registrada.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Observações (Opção 2)
                    </span>
                    <p className="text-xs text-slate-700 whitespace-pre-line">
                      {quoteB.notes || 'Nenhuma observação registrada.'}
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
              disabled={!quoteA || !quoteB}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40"
            >
              <Copy size={16} />
              {copiedNotification ? 'Copiado para Área de Transferência!' : 'Copiar Texto Comparativo'}
            </button>
            <button
              type="button"
              onClick={handleOpenWhatsapp}
              disabled={!quoteA || !quoteB}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
            >
              <MessageCircle size={16} />
              Enviar no WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!quoteA || !quoteB}
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
