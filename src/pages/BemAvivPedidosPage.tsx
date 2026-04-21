import { useUser } from '@clerk/clerk-react'
import { CheckCircle2, Pencil, Plus, ThumbsDown, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { SearchableSelect } from '../components/ui/SearchableSelect'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'
import { normalizePayload, type OfferProduct, type OfferVariation } from '../lib/bemAvivOfferProduct'

type PaymentOption = 'A_VISTA' | 'A_PRAZO'
type PaymentMethod = 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'BOLETO'

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão débito',
  CARTAO_CREDITO: 'Cartão crédito',
  BOLETO: 'Boleto',
}

type Pedido = {
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
}

type ClienteOpt = { id: string; full_name: string }

type LinhaItem = {
  key: string
  offer_product_id: string
  variation_code: string
  name: string
  unit_price: number
  quantity: number
}

function newLineKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random())
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100))
}

function parsePercent(raw: string) {
  return clampPercent(parseMoney(raw || '0'))
}

function formatMoneyInput(n: number) {
  return clampMoney(n).toFixed(2).replace('.', ',')
}

/** % sobre o bruto para atingir líquido com frete: bruto × (1 − p/100) + frete = líquido */
function percentFromTargetLiquid(gross: number, freight: number, targetLiquid: number, entrada: number) {
  if (gross <= 0) return 0
  const afterDiscount = clampMoney(targetLiquid + entrada - freight)
  const p = (1 - afterDiscount / gross) * 100
  return clampPercent(p)
}

function formatPercentInput(n: number) {
  return clampPercent(n).toFixed(2).replace('.', ',')
}

function normalizeTextKey(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function parsePaymentOption(v: string | null | undefined): PaymentOption {
  return v === 'A_PRAZO' ? 'A_PRAZO' : 'A_VISTA'
}

function parsePaymentMethod(v: string | null | undefined): PaymentMethod {
  const u = (v ?? 'DINHEIRO').toUpperCase()
  if (u === 'PIX') return 'PIX'
  if (u === 'CARTAO_DEBITO') return 'CARTAO_DEBITO'
  if (u === 'CARTAO_CREDITO') return 'CARTAO_CREDITO'
  if (u === 'BOLETO') return 'BOLETO'
  return 'DINHEIRO'
}

function netTotal(r: Pedido) {
  return clampMoney(Number(r.total_amount))
}

function grossTotal(r: Pedido) {
  return clampMoney(netTotal(r) + Number(r.discount_total ?? 0))
}

function downVal(r: Pedido) {
  return clampMoney(Number(r.down_payment_amount ?? 0))
}

/** Total líquido do pedido/orçamento (já com desconto aplicado). */
function displayValorAvista(r: Pedido) {
  return netTotal(r)
}

/** Valor financiado (total − entrada) quando a prazo. */
function displayValorPrazo(r: Pedido) {
  const opt = parsePaymentOption(r.payment_option)
  if (opt !== 'A_PRAZO') return null
  return grossTotal(r)
}

function installmentCell(r: Pedido) {
  const net = netTotal(r)
  const inst = Math.min(120, Math.max(1, r.installments_count ?? 1))
  const opt = parsePaymentOption(r.payment_option)
  const entrada = downVal(r)
  if (opt === 'A_VISTA') {
    const each = inst > 0 ? net / inst : net
    return `${inst}x ${formatBRL(each)}`
  }
  const financed = clampMoney(grossTotal(r) - entrada)
  const each = inst > 0 ? financed / inst : financed
  return `${inst}x ${formatBRL(each)}`
}

function canEditOrcamento(r: Pedido) {
  return r.document_type === 'ORCAMENTO' && !r.converted_order_id && r.status === 'ABERTO'
}

function canMarcarPerdido(r: Pedido) {
  return r.document_type === 'ORCAMENTO' && !r.converted_order_id && r.status === 'ABERTO'
}

function canFecharGerarPedido(r: Pedido) {
  return r.document_type === 'ORCAMENTO' && !r.converted_order_id && r.status === 'ABERTO'
}

const iconBtn =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40'

export function BemAvivPedidosPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Pedido[]>([])
  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [offerProducts, setOfferProducts] = useState<OfferProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

  const [form, setForm] = useState({
    client_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    document_type: 'ORCAMENTO' as 'ORCAMENTO' | 'PEDIDO',
    status: 'ABERTO',
    total_amount: '',
    discount_percent: '',
    installments_count: '1',
    notes: '',
    payment_option: 'A_VISTA' as PaymentOption,
    payment_method: 'DINHEIRO' as PaymentMethod,
    down_payment: '',
    down_payment_method: 'DINHEIRO' as PaymentMethod,
    freight_amount: '',
  })
  const [draftProductName, setDraftProductName] = useState('')
  const [draftProductType, setDraftProductType] = useState('')
  const [draftVariationCode, setDraftVariationCode] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [lineItems, setLineItems] = useState<LinhaItem[]>([])
  const [liquidTotalDraft, setLiquidTotalDraft] = useState('')

  const uniqueProductNames = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const p of offerProducts) {
      const name = (p.name ?? '').trim()
      if (!name) continue
      const key = normalizeTextKey(name)
      if (!byKey.has(key)) byKey.set(key, name)
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  }, [offerProducts])

  const productTypeOptions = useMemo(() => {
    if (!draftProductName) return [] as string[]
    const types = new Set<string>()
    const selectedNameKey = normalizeTextKey(draftProductName)
    for (const p of offerProducts) {
      if (normalizeTextKey(p.name) !== selectedNameKey) continue
      types.add((p.product_type ?? '').trim() || '—')
    }
    return [...types].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  }, [offerProducts, draftProductName])

  const selectedOffer = useMemo(
    () =>
      offerProducts.find((p) => {
        if (normalizeTextKey(p.name) !== normalizeTextKey(draftProductName)) return false
        const t = (p.product_type ?? '').trim() || '—'
        return t === draftProductType
      }) ?? null,
    [draftProductName, draftProductType, offerProducts],
  )

  const variationOptions = useMemo(() => {
    if (!selectedOffer) return [] as OfferVariation[]
    return normalizePayload(selectedOffer.payload).variations ?? []
  }, [selectedOffer])

  const productSelectOptions = useMemo(
    () => uniqueProductNames.map((name) => ({ value: name, label: name })),
    [uniqueProductNames],
  )
  const typeSelectOptions = useMemo(
    () => productTypeOptions.map((t) => ({ value: t, label: t })),
    [productTypeOptions],
  )
  const variationSelectOptions = useMemo(
    () =>
      variationOptions.map((v) => ({
        value: v.code,
        label: `[${v.code}] ${v.dimensions || '—'} — ${formatBRL(v.price)}`,
      })),
    [variationOptions],
  )

  useEffect(() => {
    setDraftProductType('')
    setDraftVariationCode('')
  }, [draftProductName])

  useEffect(() => {
    setDraftVariationCode('')
  }, [draftProductType])

  useEffect(() => {
    if (variationOptions.length === 1) {
      setDraftVariationCode(variationOptions[0].code)
    }
  }, [variationOptions])

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: orders }, { data: cl }, { data: offers }] = await Promise.all([
      supabase.from('bem_aviv_sales_orders').select('*').eq('user_id', ownerUserId).order('order_date', { ascending: false }),
      supabase.from('bem_aviv_clients').select('id, full_name').eq('user_id', ownerUserId).order('full_name'),
      supabase
        .from('bem_aviv_offer_products')
        .select('id, name, category, product_line, product_type, payload')
        .eq('user_id', ownerUserId)
        .order('name'),
    ])
    setRows((orders as Pedido[]) ?? [])
    setClients((cl as ClienteOpt[]) ?? [])
    setOfferProducts(((offers ?? []) as OfferProduct[]).map((r) => ({ ...r, payload: normalizePayload(r.payload) })))
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const sumLinesNet = useMemo(
    () => lineItems.reduce((acc, l) => acc + l.quantity * l.unit_price, 0),
    [lineItems],
  )

  const orderDiscountPercent = useMemo(() => parsePercent(form.discount_percent), [form.discount_percent])

  const installmentsNum = useMemo(
    () => Math.min(120, Math.max(1, parseInt(form.installments_count.replace(/\D/g, ''), 10) || 1)),
    [form.installments_count],
  )

  const downPaymentNum = useMemo(() => clampMoney(parseMoney(form.down_payment || '0')), [form.down_payment])
  const freightAmountNum = useMemo(() => clampMoney(parseMoney(form.freight_amount || '0')), [form.freight_amount])

  const linesGrossTotal = useMemo(() => lineItems.reduce((acc, l) => acc + l.quantity * l.unit_price, 0), [lineItems])

  const orderDiscount = useMemo(() => {
    const base = lineItems.length > 0 ? linesGrossTotal : parseMoney(form.total_amount || '0')
    return clampMoney((base * orderDiscountPercent) / 100)
  }, [lineItems.length, linesGrossTotal, form.total_amount, orderDiscountPercent])

  const previewOrderTotal = useMemo(() => {
    if (lineItems.length === 0) return null
    const net = clampMoney(sumLinesNet - orderDiscount + freightAmountNum)
    const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
    return clampMoney(net - entrada)
  }, [lineItems.length, sumLinesNet, orderDiscount, freightAmountNum, form.payment_option, downPaymentNum])

  const previewInstallment = useMemo(() => {
    if (previewOrderTotal == null || installmentsNum <= 0) return null
    return previewOrderTotal / installmentsNum
  }, [previewOrderTotal, installmentsNum])

  const manualNetTotal = useMemo(() => {
    if (lineItems.length > 0) return null
    return clampMoney(parseMoney(form.total_amount || '0') - orderDiscount + freightAmountNum)
  }, [lineItems.length, form.total_amount, orderDiscount, freightAmountNum])

  const applyLiquidRawToDiscount = useCallback(
    (raw: string) => {
      if (lineItems.length === 0 || sumLinesNet <= 0) return
      const target = parseMoney(raw)
      const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
      const pct = percentFromTargetLiquid(sumLinesNet, freightAmountNum, target, entrada)
      const pctStr = formatPercentInput(pct)
      const net = clampMoney(sumLinesNet - (sumLinesNet * parsePercent(pctStr)) / 100 + freightAmountNum - entrada)
      setForm((f) => ({ ...f, discount_percent: pctStr }))
      setLiquidTotalDraft(formatMoneyInput(net))
    },
    [lineItems.length, sumLinesNet, freightAmountNum, form.payment_option, downPaymentNum],
  )

  /** Sincroniza o líquido exibido com o % quando mudam itens ou frete (não depende de discount_percent para não resetar durante digitação no líquido). */
  useEffect(() => {
    if (lineItems.length === 0) {
      setLiquidTotalDraft('')
      return
    }
    const p = parsePercent(form.discount_percent)
    const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
    const net = clampMoney(sumLinesNet - (sumLinesNet * p) / 100 + freightAmountNum - entrada)
    setLiquidTotalDraft(formatMoneyInput(net))
    // form.discount_percent omitido de deps de propósito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems.length, sumLinesNet, freightAmountNum, form.payment_option, downPaymentNum])

  function resetFormForNew() {
    setForm({
      client_id: '',
      order_date: new Date().toISOString().slice(0, 10),
      document_type: 'ORCAMENTO',
      status: 'ABERTO',
      total_amount: '',
      discount_percent: '',
      installments_count: '1',
      notes: '',
      payment_option: 'A_VISTA',
      payment_method: 'DINHEIRO',
      down_payment: '',
      down_payment_method: 'DINHEIRO',
      freight_amount: '',
    })
    setLineItems([])
    setDraftProductName('')
    setDraftProductType('')
    setDraftVariationCode('')
    setDraftQty('1')
    setEditingOrderId(null)
    setLiquidTotalDraft('')
  }

  function openModalNew() {
    resetFormForNew()
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    resetFormForNew()
  }

  async function openModalEdit(quote: Pedido) {
    if (!supabase || !canEditOrcamento(quote)) return
    const { data: its, error } = await supabase
      .from('bem_aviv_sales_order_items')
      .select(
        'offer_product_id, variation_code, item_description, quantity, unit_price, discount_amount, total_price',
      )
      .eq('sales_order_id', quote.id)

    if (error) {
      alert(error.message)
      return
    }

    const items = (its ?? []) as Array<{
      offer_product_id: string | null
      variation_code: string | null
      item_description: string
      quantity: number
      unit_price: number
      discount_amount: number | null
      total_price: number
    }>

    if (items.length > 0 && items.some((it) => !it.offer_product_id || !it.variation_code)) {
      alert('ESTE ORÇAMENTO TEM ITENS ANTIGOS SEM CATÁLOGO. NÃO É POSSÍVEL EDITAR POR ESTA TELA.')
      return
    }

    const mapped: LinhaItem[] = items.map((it) => {
      const qty = Number(it.quantity)
      const unit = Number(it.unit_price)
      return {
        key: newLineKey(),
        offer_product_id: it.offer_product_id!,
        variation_code: it.variation_code!,
        name: it.item_description,
        unit_price: unit,
        quantity: qty,
      }
    })

    const totalGrossFromItems = mapped.reduce((acc, it) => acc + it.quantity * it.unit_price, 0)
    const quoteDiscountAmount = Number(quote.discount_total ?? 0)
    const manualGross = mapped.length === 0 ? clampMoney(Number(quote.total_amount) + quoteDiscountAmount) : 0
    const discountBase = mapped.length > 0 ? totalGrossFromItems : manualGross
    const discountPercent = discountBase > 0 ? clampPercent((quoteDiscountAmount / discountBase) * 100) : 0

    setEditingOrderId(quote.id)
    setForm({
      client_id: quote.client_id ?? '',
      order_date: quote.order_date,
      document_type: quote.document_type,
      status: quote.status,
      total_amount: mapped.length === 0 ? String(Number(quote.total_amount)).replace('.', ',') : '',
      discount_percent: discountPercent > 0 ? String(discountPercent).replace('.', ',') : '',
      installments_count: String(quote.installments_count ?? 1),
      notes: quote.notes ?? '',
      payment_option: parsePaymentOption(quote.payment_option),
      payment_method: parsePaymentMethod(quote.payment_method),
      down_payment:
        quote.down_payment_amount != null && Number(quote.down_payment_amount) > 0
          ? String(Number(quote.down_payment_amount)).replace('.', ',')
          : '',
      down_payment_method: parsePaymentMethod(quote.down_payment_method ?? quote.payment_method),
      freight_amount: quote.freight_amount != null && Number(quote.freight_amount) > 0 ? String(Number(quote.freight_amount)).replace('.', ',') : '',
    })
    setLineItems(mapped)
    setDraftProductName('')
    setDraftProductType('')
    setDraftVariationCode('')
    setDraftQty('1')
    setModalOpen(true)
  }

  function addLineFromDraft() {
    const p = selectedOffer
    if (!p) {
      alert('SELECIONE PRODUTO E TIPO DO CATÁLOGO.')
      return
    }
    const vars = normalizePayload(p.payload).variations ?? []
    const v = vars.find((x) => x.code === draftVariationCode)
    if (vars.length > 0 && !v) {
      alert('SELECIONE A VARIAÇÃO (CÓDIGO / DIMENSÕES).')
      return
    }
    if (vars.length === 0) {
      alert('ESTE PRODUTO NÃO TEM VARIAÇÕES CADASTRADAS. EDITE O CADASTRO EM PRODUTOS (CATÁLOGO).')
      return
    }
    const qty = Math.max(1, parseInt(draftQty.replace(/\D/g, ''), 10) || 1)
    const unit = Number(v!.price)
    if (!Number.isFinite(unit) || unit <= 0) {
      alert('PREÇO DA VARIAÇÃO INVÁLIDO.')
      return
    }
    const dimPart = v!.dimensions ? ` — ${v!.dimensions}` : ''
    const descName = `${p.name} [${v!.code}]${dimPart}`
    setLineItems((prev) => [
      ...prev,
      {
        key: newLineKey(),
        offer_product_id: p.id,
        variation_code: v!.code,
        name: descName,
        unit_price: unit,
        quantity: qty,
      },
    ])
    setDraftProductName('')
    setDraftProductType('')
    setDraftVariationCode('')
    setDraftQty('1')
  }

  function removeLine(key: string) {
    setLineItems((prev) => {
      const next = prev.filter((l) => l.key !== key)
      if (prev.length > 0 && next.length === 0) {
        // Quando todos os itens forem removidos, volta para estado zerado do total manual.
        setForm((f) => ({
          ...f,
          total_amount: '0',
          discount_percent: '0',
          freight_amount: '0',
        }))
        setLiquidTotalDraft('')
      }
      return next
    })
  }

  function updateLineQty(key: string, qtyStr: string) {
    const qty = Math.max(1, parseInt(qtyStr.replace(/\D/g, ''), 10) || 1)
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        return { ...l, quantity: qty }
      }),
    )
  }

  async function markLost(quote: Pedido) {
    if (!supabase || !canMarcarPerdido(quote)) return
    if (!confirm(`MARCAR O ORÇAMENTO ${quote.document_number ?? ''} COMO PERDIDO?`)) return
    const { error } = await supabase.from('bem_aviv_sales_orders').update({ status: 'PERDIDO' }).eq('id', quote.id)
    if (error) {
      alert(error.message)
      return
    }
    await load()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return

    const hasLines = lineItems.length > 0
    const manualGross = parseMoney(form.total_amount || '0')
    const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
    let discOrder = orderDiscount
    if (hasLines && sumLinesNet > 0) {
      const pctStr = formatPercentInput(percentFromTargetLiquid(sumLinesNet, freightAmountNum, parseMoney(liquidTotalDraft), entrada))
      discOrder = clampMoney((sumLinesNet * parsePercent(pctStr)) / 100)
      const netCanon = clampMoney(sumLinesNet - discOrder + freightAmountNum - entrada)
      setForm((f) => ({ ...f, discount_percent: pctStr }))
      setLiquidTotalDraft(formatMoneyInput(netCanon))
    }
    const inst = installmentsNum
    const totalBruto = (hasLines ? linesGrossTotal : manualGross) + freightAmountNum

    if (form.payment_option === 'A_PRAZO' && entrada < 0) {
      alert('VALOR DE ENTRADA INVÁLIDO.')
      return
    }

    if (hasLines) {
      const net = clampMoney(sumLinesNet - discOrder + freightAmountNum)
      if (net < 0) {
        alert('DESCONTO NO PEDIDO É MAIOR QUE A SOMA DOS ITENS + FRETE.')
        return
      }
      if (form.payment_option === 'A_PRAZO' && entrada > totalBruto) {
        alert('ENTRADA NÃO PODE SER MAIOR QUE O VALOR A PRAZO (BRUTO).')
        return
      }
    } else {
      if (!form.total_amount.trim()) {
        alert('INFORME O VALOR TOTAL OU ADICIONE ITENS.')
        return
      }
      if (clampMoney(manualGross - discOrder + freightAmountNum) < 0) {
        alert('DESCONTO NO PEDIDO NÃO PODE SER MAIOR QUE O VALOR INFORMADO + FRETE.')
        return
      }
      if (form.payment_option === 'A_PRAZO' && entrada > totalBruto) {
        alert('ENTRADA NÃO PODE SER MAIOR QUE O VALOR A PRAZO (BRUTO).')
        return
      }
    }

    const totalInsert = hasLines ? clampMoney(sumLinesNet - discOrder + freightAmountNum) : clampMoney(manualGross - discOrder + freightAmountNum)

    const headerPayload = {
      user_id: ownerUserId,
      client_id: form.client_id || null,
      order_date: form.order_date,
      document_type: form.document_type,
      status: toUpperTrim(form.status),
      discount_total: discOrder,
      installments_count: inst,
      notes: toUpperTrim(form.notes) || null,
      payment_option: form.payment_option,
      payment_method: form.payment_method,
      down_payment_amount: form.payment_option === 'A_PRAZO' && entrada > 0 ? entrada : null,
      down_payment_method: form.payment_option === 'A_PRAZO' ? form.down_payment_method : null,
      freight_amount: freightAmountNum,
    }

    if (editingOrderId) {
      const cleanUpdate = {
        client_id: headerPayload.client_id,
        order_date: headerPayload.order_date,
        document_type: headerPayload.document_type,
        status: headerPayload.status,
        discount_total: headerPayload.discount_total,
        installments_count: headerPayload.installments_count,
        notes: headerPayload.notes,
        payment_option: headerPayload.payment_option,
        payment_method: headerPayload.payment_method,
        down_payment_amount: headerPayload.down_payment_amount,
        freight_amount: headerPayload.freight_amount,
      }

      const { error: delErr } = await supabase.from('bem_aviv_sales_order_items').delete().eq('sales_order_id', editingOrderId)
      if (delErr) {
        alert(delErr.message)
        return
      }

      if (hasLines) {
        const { error: updErr } = await supabase
          .from('bem_aviv_sales_orders')
          .update(cleanUpdate)
          .eq('id', editingOrderId)
          .eq('user_id', ownerUserId)
        if (updErr) {
          alert(updErr.message)
          return
        }

        const rowsToInsert = lineItems.map((l) => {
          return {
            user_id: ownerUserId,
            sales_order_id: editingOrderId,
            product_id: null,
            catalog_price_cell_id: null,
            offer_product_id: l.offer_product_id,
            variation_code: l.variation_code,
            item_description: toUpperTrim(l.name),
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_amount: 0,
            total_price: clampMoney(l.quantity * l.unit_price),
          }
        })
        const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
        if (itemsErr) {
          alert(itemsErr.message)
          return
        }
      } else {
        const { error: updErr } = await supabase
          .from('bem_aviv_sales_orders')
          .update({
            ...cleanUpdate,
            total_amount: totalInsert,
          })
          .eq('id', editingOrderId)
          .eq('user_id', ownerUserId)
        if (updErr) {
          alert(updErr.message)
          return
        }
      }

      closeModal()
      await load()
      return
    }

    const { data: inserted, error } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        ...headerPayload,
        total_amount: totalInsert,
      })
      .select('id')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    const orderId = (inserted as { id: string }).id

    if (hasLines) {
      const rowsToInsert = lineItems.map((l) => {
        return {
          user_id: ownerUserId,
          sales_order_id: orderId,
          product_id: null,
          catalog_price_cell_id: null,
          offer_product_id: l.offer_product_id,
          variation_code: l.variation_code,
          item_description: toUpperTrim(l.name),
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: 0,
          total_price: clampMoney(l.quantity * l.unit_price),
        }
      })
      const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
      if (itemsErr) {
        alert(itemsErr.message)
        return
      }
    }

    closeModal()
    await load()
  }

  async function closeQuoteAndCreateOrder(quote: Pedido) {
    if (!supabase || !ownerUserId) return
    if (quote.document_type !== 'ORCAMENTO') return
    if (quote.converted_order_id) {
      alert('ESTE ORÇAMENTO JÁ FOI CONVERTIDO EM PEDIDO.')
      return
    }
    if (quote.status === 'PERDIDO') {
      alert('ORÇAMENTO PERDIDO NÃO PODE SER CONVERTIDO.')
      return
    }
    if (!confirm(`FECHAR O ORÇAMENTO ${quote.document_number ?? ''} E CRIAR UM PEDIDO?`)) return

    const { data: quoteItems, error: qiErr } = await supabase
      .from('bem_aviv_sales_order_items')
      .select(
        'product_id, catalog_price_cell_id, offer_product_id, variation_code, item_description, quantity, unit_price, discount_amount, total_price',
      )
      .eq('sales_order_id', quote.id)

    if (qiErr) {
      alert(qiErr.message)
      return
    }

    const disc = quote.discount_total != null ? Number(quote.discount_total) : 0
    const inst = quote.installments_count != null ? Number(quote.installments_count) : 1
    const payOpt = parsePaymentOption(quote.payment_option)
    const payMeth = parsePaymentMethod(quote.payment_method)
    const downMethod = parsePaymentMethod(quote.down_payment_method ?? quote.payment_method)
    const down = quote.down_payment_amount != null ? Number(quote.down_payment_amount) : null
    const freight = quote.freight_amount != null ? Number(quote.freight_amount) : 0

    const { data: inserted, error: insertError } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        user_id: ownerUserId,
        client_id: quote.client_id,
        order_date: new Date().toISOString().slice(0, 10),
        document_type: 'PEDIDO',
        status: 'ABERTO',
        total_amount: quote.total_amount,
        discount_total: disc,
        installments_count: Math.min(120, Math.max(1, inst)),
        notes: quote.notes ? `${quote.notes} | GERADO A PARTIR DE ${quote.document_number ?? 'ORÇAMENTO'}` : `GERADO A PARTIR DE ${quote.document_number ?? 'ORÇAMENTO'}`,
        source_quote_id: quote.id,
        payment_option: payOpt,
        payment_method: payMeth,
        down_payment_amount: payOpt === 'A_PRAZO' ? down : null,
        down_payment_method: payOpt === 'A_PRAZO' ? downMethod : null,
        freight_amount: freight,
      })
      .select('id, document_number')
      .single()

    if (insertError) {
      alert(insertError.message)
      return
    }

    const newOrder = inserted as { id: string; document_number: string | null }

    const items = (quoteItems ?? []) as Array<{
      product_id: string | null
      catalog_price_cell_id: string | null
      offer_product_id: string | null
      variation_code: string | null
      item_description: string
      quantity: number
      unit_price: number
      discount_amount: number
      total_price: number
    }>

    if (items.length > 0) {
      const copyRows = items.map((it) => ({
        user_id: ownerUserId,
        sales_order_id: newOrder.id,
        product_id: it.product_id,
        catalog_price_cell_id: it.catalog_price_cell_id,
        offer_product_id: it.offer_product_id,
        variation_code: it.variation_code ?? null,
        item_description: it.item_description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount ?? 0,
        total_price: it.total_price,
      }))
      const { error: copyErr } = await supabase.from('bem_aviv_sales_order_items').insert(copyRows)
      if (copyErr) {
        alert(copyErr.message)
        return
      }
    }

    const { error: updError } = await supabase
      .from('bem_aviv_sales_orders')
      .update({
        status: 'FECHADO',
        converted_order_id: newOrder.id,
      })
      .eq('id', quote.id)

    if (updError) {
      alert(updError.message)
      return
    }

    alert(`PEDIDO ${newOrder.document_number ?? ''} CRIADO COM SUCESSO.`)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">PEDIDOS DE VENDAS</h2>
          <p className="mt-1 max-w-2xl text-sm font-normal normal-case text-slate-600">
            Itens usam o cadastro <strong>Produtos (catálogo)</strong>. Tipo padrão: <strong>orçamento</strong>.{' '}
            <Link className="font-medium text-emerald-800 underline-offset-2 hover:underline" to="/bem-aviv/produtos-catalogo">
              Abrir cadastro de produtos
            </Link>
          </p>
        </div>
        <Button type="button" variant="primary" className="inline-flex items-center gap-2" onClick={openModalNew}>
          <Plus size={18} aria-hidden />
          ADICIONAR PEDIDO
        </Button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table className="text-sm">
            <thead>
              <tr>
                <th>Nº DOCUMENTO</th>
                <th>TIPO</th>
                <th>DATA</th>
                <th>STATUS</th>
                <th className="text-right">À VISTA (C/ DESC.)</th>
                <th className="text-right">À PRAZO</th>
                <th className="text-right">ENTRADA</th>
                <th className="text-right">PARCELAS (VALOR)</th>
                <th className="text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const prazo = displayValorPrazo(r)
                const downMethod = parsePaymentMethod(r.down_payment_method ?? r.payment_method)
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-medium">{r.document_number || '—'}</td>
                    <td>{r.document_type}</td>
                    <td className="whitespace-nowrap">{r.order_date}</td>
                    <td>{r.status}</td>
                    <td className="text-right whitespace-nowrap">{formatBRL(displayValorAvista(r))}</td>
                    <td className="text-right whitespace-nowrap">{prazo != null ? formatBRL(prazo) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      {parsePaymentOption(r.payment_option) === 'A_PRAZO' ? (
                        <span className="inline-flex flex-col items-end">
                          <span>{formatBRL(downVal(r))}</span>
                          <span className="text-[11px] text-slate-500">{PAYMENT_METHOD_LABEL[downMethod]}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap text-xs sm:text-sm">{installmentCell(r)}</td>
                    <td className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {canEditOrcamento(r) ? (
                          <button
                            type="button"
                            className={iconBtn}
                            title="Editar orçamento"
                            aria-label="Editar orçamento"
                            onClick={() => void openModalEdit(r)}
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                        ) : null}
                        {canMarcarPerdido(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} text-amber-800 border-amber-200 hover:bg-amber-50`}
                            title="Marcar como perdido"
                            aria-label="Marcar como perdido"
                            onClick={() => void markLost(r)}
                          >
                            <ThumbsDown size={16} aria-hidden />
                          </button>
                        ) : null}
                        {canFecharGerarPedido(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} text-emerald-800 border-emerald-200 hover:bg-emerald-50`}
                            title="Fechar e gerar pedido"
                            aria-label="Fechar e gerar pedido"
                            disabled={!!r.converted_order_id}
                            onClick={() => void closeQuoteAndCreateOrder(r)}
                          >
                            <CheckCircle2 size={16} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 py-6 sm:p-4 sm:py-8"
          role="presentation"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-labelledby="pedido-modal-title"
            className="relative w-full max-w-6xl rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={`${iconBtn} absolute right-3 top-3 border-0 shadow-none`}
              aria-label="Fechar"
              onClick={closeModal}
            >
              <X size={18} aria-hidden />
            </button>
            <h3 id="pedido-modal-title" className="pr-10 text-lg font-semibold text-slate-900">
              {editingOrderId ? 'EDITAR ORÇAMENTO / PEDIDO' : 'NOVO ORÇAMENTO / PEDIDO'}
            </h3>

            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label>CLIENTE</label>
                <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>DATA</label>
                <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} required />
              </div>
              <div>
                <label>TIPO</label>
                <select
                  value={form.document_type}
                  onChange={(e) => setForm({ ...form, document_type: e.target.value as 'ORCAMENTO' | 'PEDIDO' })}
                >
                  <option value="ORCAMENTO">ORÇAMENTO</option>
                  <option value="PEDIDO">PEDIDO</option>
                </select>
              </div>
              <div>
                <label>STATUS</label>
                <input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} required />
              </div>
              <div>
                <label>OPÇÃO DE PAGAMENTO</label>
                <select
                  value={form.payment_option}
                  onChange={(e) => {
                    const v = e.target.value as PaymentOption
                    setForm({ ...form, payment_option: v, down_payment: v === 'A_VISTA' ? '' : form.down_payment })
                  }}
                >
                  <option value="A_VISTA">À vista</option>
                  <option value="A_PRAZO">À prazo</option>
                </select>
              </div>
              <div>
                <label>TIPO DE PAGAMENTO</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                >
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
                    <option key={k} value={k}>
                      {PAYMENT_METHOD_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              {form.payment_option === 'A_PRAZO' ? (
                <div>
                  <label>VALOR ENTRADA (R$)</label>
                  <input
                    value={form.down_payment}
                    onChange={(e) => setForm({ ...form, down_payment: e.target.value })}
                    placeholder="0"
                    inputMode="decimal"
                  />
                </div>
              ) : null}
              {form.payment_option === 'A_PRAZO' ? (
                <div>
                  <label>FORMA DE PAGAMENTO DA ENTRADA</label>
                  <select
                    value={form.down_payment_method}
                    onChange={(e) => setForm({ ...form, down_payment_method: e.target.value as PaymentMethod })}
                  >
                    {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
                      <option key={k} value={k}>
                        {PAYMENT_METHOD_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label>DESCONTO NO PEDIDO (%)</label>
                <input
                  value={form.discount_percent}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm({ ...form, discount_percent: v })
                    if (lineItems.length > 0) {
                      const p = parsePercent(v)
                      const net = clampMoney(sumLinesNet - (sumLinesNet * p) / 100 + freightAmountNum)
                      setLiquidTotalDraft(formatMoneyInput(net))
                    }
                  }}
                  placeholder="0"
                  inputMode="decimal"
                />
                <p className="mt-1 text-xs font-normal normal-case text-slate-600">
                  Valor do desconto (sobre o bruto): {formatBRL(orderDiscount)}
                  {lineItems.length > 0 ? (
                    <span className="block text-slate-500">
                      No campo líquido, use Enter ou clique fora para recalcular este % (duas casas decimais).
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                <label>PARCELAS</label>
                <input
                  inputMode="numeric"
                  min={1}
                  max={120}
                  value={form.installments_count}
                  onChange={(e) => setForm({ ...form, installments_count: e.target.value })}
                />
                {previewInstallment != null && previewOrderTotal != null && installmentsNum > 1 ? (
                  <p className="mt-1 text-xs font-normal normal-case text-slate-600">
                    Prévia: {installmentsNum}x de {formatBRL(previewInstallment)} (total {formatBRL(previewOrderTotal)})
                  </p>
                ) : null}
                {lineItems.length === 0 && manualNetTotal != null && installmentsNum > 1 && form.total_amount.trim() ? (
                  <p className="mt-1 text-xs font-normal normal-case text-slate-600">
                    Prévia: {installmentsNum}x de {formatBRL(manualNetTotal / installmentsNum)} (líquido {formatBRL(manualNetTotal)})
                  </p>
                ) : null}
              </div>
              <div>
                <label>FRETE (R$)</label>
                <input
                  value={form.freight_amount}
                  onChange={(e) => setForm({ ...form, freight_amount: e.target.value })}
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              {lineItems.length > 0 ? (
                <>
                  <div>
                    <label>VALOR TOTAL (BRUTO DOS ITENS)</label>
                    <input value={formatBRL(linesGrossTotal)} readOnly />
                  </div>
                  <div>
                    <label>VALOR LÍQUIDO (COM FRETE)</label>
                    <input
                      value={liquidTotalDraft}
                      onChange={(e) => setLiquidTotalDraft(e.target.value)}
                      onBlur={(e) => applyLiquidRawToDiscount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          applyLiquidRawToDiscount((e.target as HTMLInputElement).value)
                        }
                      }}
                      placeholder="0,00"
                      inputMode="decimal"
                    />
                    <p className="mt-1 text-xs font-normal normal-case text-slate-600">
                      Total líquido (bruto com desconto + frete{form.payment_option === 'A_PRAZO' ? ' − entrada' : ''}). Digite o valor e pressione <strong>Enter</strong> ou
                      clique fora do campo para recalcular o desconto (%) com duas casas decimais — evita recalcular a
                      cada tecla (ex.: 130,00).
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label>VALOR TOTAL</label>
                  <input
                    value={form.total_amount}
                    onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-3">
                <label>OBSERVAÇÕES</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h4 className="mb-2 text-sm font-semibold text-slate-800">ITENS (CATÁLOGO)</h4>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <label>PRODUTO</label>
                    <SearchableSelect
                      value={draftProductName}
                      onChange={setDraftProductName}
                      options={productSelectOptions}
                      placeholder="— DIGITE OU SELECIONE —"
                      aria-label="Produto do catálogo"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label>TIPO</label>
                    <SearchableSelect
                      value={draftProductType}
                      onChange={setDraftProductType}
                      options={typeSelectOptions}
                      placeholder="— DIGITE OU SELECIONE —"
                      disabled={!draftProductName}
                      aria-label="Tipo do produto"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label>VARIAÇÃO (CÓDIGO / DIMENSÕES)</label>
                    <SearchableSelect
                      value={draftVariationCode}
                      onChange={setDraftVariationCode}
                      options={variationSelectOptions}
                      placeholder={variationOptions.length === 0 ? '— SEM VARIAÇÕES —' : '— DIGITE OU SELECIONE —'}
                      disabled={!selectedOffer || variationOptions.length === 0}
                      aria-label="Variação do produto"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label>QTD</label>
                    <input inputMode="numeric" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <Button type="button" variant="secondary" onClick={addLineFromDraft}>
                      ADICIONAR ITEM
                    </Button>
                  </div>
                </div>
                {offerProducts.length === 0 && (
                  <p className="mt-2 text-sm text-amber-800">
                    NENHUM PRODUTO NO CATÁLOGO.{' '}
                    <Link className="font-medium underline" to="/bem-aviv/produtos-catalogo">
                      Cadastre em Produtos (catálogo)
                    </Link>
                    .
                  </p>
                )}
                {lineItems.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left">DESCRIÇÃO</th>
                          <th className="text-right">UNIT.</th>
                          <th className="text-right">QTD</th>
                          <th className="text-right">LÍQUIDO</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((l) => {
                          const net = clampMoney(l.quantity * l.unit_price)
                          return (
                            <tr key={l.key}>
                              <td className="max-w-[18rem] whitespace-normal">{l.name}</td>
                              <td className="text-right">{formatBRL(l.unit_price)}</td>
                              <td className="text-right">
                                <input
                                  className="w-16 text-right"
                                  inputMode="numeric"
                                  value={String(l.quantity)}
                                  onChange={(e) => updateLineQty(l.key, e.target.value)}
                                />
                              </td>
                              <td className="text-right">{formatBRL(net)}</td>
                              <td>
                                <button
                                  type="button"
                                  className={`${iconBtn} h-8 w-8 border-red-200 text-red-600 hover:bg-red-50`}
                                  title="Remover item"
                                  aria-label="Remover item"
                                  onClick={() => removeLine(l.key)}
                                >
                                  <Trash2 size={14} aria-hidden />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                <Button type="submit" variant="primary">
                  {editingOrderId ? 'SALVAR ALTERAÇÕES' : form.document_type === 'ORCAMENTO' ? 'ADICIONAR ORÇAMENTO' : 'ADICIONAR PEDIDO'}
                </Button>
                <Button type="button" variant="secondary" onClick={closeModal}>
                  CANCELAR
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
