import { useUser } from '@clerk/clerk-react'
import { Box, ChevronLeft, CircleDollarSign, ClipboardList, List, Package, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { SearchableSelect } from '../components/ui/SearchableSelect'
import { useSupabase } from '../hooks/useSupabase'
import { normalizePayload, type OfferProduct, type OfferVariation } from '../lib/bemAvivOfferProduct'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type PaymentOption = 'A_VISTA' | 'A_PRAZO'
type PaymentMethod = 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'BOLETO'

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão débito',
  CARTAO_CREDITO: 'Cartão crédito',
  BOLETO: 'Boleto',
}

type ClienteOpt = { id: string; full_name: string }

type LinhaItem = {
  key: string
  kind: 'PRODUCT' | 'KIT'
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

function roundMoneySigned(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function formatMoneyInput(n: number) {
  return clampMoney(n).toFixed(2).replace('.', ',')
}

function splitSignedAmountProportionally(baseValues: number[], totalToSplit: number) {
  if (baseValues.length === 0) return [] as number[]
  const baseSum = baseValues.reduce((acc, v) => acc + Math.max(0, v), 0)
  if (baseSum <= 0) return baseValues.map(() => 0)
  const rounded = baseValues.map((v) => roundMoneySigned((Math.max(0, v) / baseSum) * totalToSplit))
  const diff = roundMoneySigned(totalToSplit - rounded.reduce((acc, v) => acc + v, 0))
  if (Math.abs(diff) >= 0.01) {
    const last = rounded.length - 1
    rounded[last] = roundMoneySigned(rounded[last] + diff)
  }
  return rounded
}

function normalizeTextKey(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function clampOrderDiscountPercent(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(-999, Math.min(100, Math.round(n * 1e6) / 1e6))
}

/** Percentual no campo livre: aceita `10`, `10,5`, `10 %`, valores gerados com vírgula decimal. */
function parseOrderDiscountPercent(raw: string) {
  const cleaned = (raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/%/g, '')
    .trim()
  return clampOrderDiscountPercent(parseMoney(cleaned === '' ? '0' : cleaned))
}

type NovoPedidoNavState = { document_type?: 'ORCAMENTO' | 'PEDIDO' }

type SalesOrderHeaderRow = {
  id: string
  client_id: string | null
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
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

function parsePaymentOptionNav(v: string | null | undefined): PaymentOption {
  return v === 'A_PRAZO' ? 'A_PRAZO' : 'A_VISTA'
}

function parsePaymentMethodNav(v: string | null | undefined): PaymentMethod {
  const u = (v ?? 'DINHEIRO').toUpperCase()
  if (u === 'PIX') return 'PIX'
  if (u === 'CARTAO_DEBITO') return 'CARTAO_DEBITO'
  if (u === 'CARTAO_CREDITO') return 'CARTAO_CREDITO'
  if (u === 'BOLETO') return 'BOLETO'
  return 'DINHEIRO'
}

function canEditSalesDocument(o: Pick<SalesOrderHeaderRow, 'document_type' | 'status' | 'converted_order_id'>): boolean {
  if (o.document_type === 'ORCAMENTO' && !o.converted_order_id && o.status === 'ABERTO') return true
  if (o.document_type === 'PEDIDO' && o.status === 'ABERTO') return true
  return false
}

function formatDiscountPercentInput(n: number) {
  return clampOrderDiscountPercent(n).toFixed(6).replace('.', ',')
}

export function BemAvivNovoPedidoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const navigate = useNavigate()
  const location = useLocation()
  const { orderId: editOrderId } = useParams<{ orderId: string }>()
  const isEditMode = Boolean(editOrderId)
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const submitLockRef = useRef(false)

  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [offerProducts, setOfferProducts] = useState<OfferProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [orderBootstrapping, setOrderBootstrapping] = useState(isEditMode)
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null)
  const [loadedDocumentLabel, setLoadedDocumentLabel] = useState<string | null>(null)

  const [form, setForm] = useState(() => {
    const st = location.state as NovoPedidoNavState | null
    const document_type: 'ORCAMENTO' | 'PEDIDO' =
      isEditMode ? 'ORCAMENTO' : st?.document_type === 'PEDIDO' ? 'PEDIDO' : 'ORCAMENTO'
    return {
      client_id: '',
      order_date: new Date().toISOString().slice(0, 10),
      document_type,
      status: 'ABERTO',
      discount_percent: '',
      installments_count: '1',
      notes: '',
      payment_option: 'A_VISTA' as PaymentOption,
      payment_method: 'DINHEIRO' as PaymentMethod,
      down_payment: '',
      down_payment_method: 'DINHEIRO' as PaymentMethod,
      freight_amount: '',
    }
  })

  const [draftProductName, setDraftProductName] = useState('')
  const [draftProductType, setDraftProductType] = useState('')
  const [draftVariationCode, setDraftVariationCode] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [productQuery, setProductQuery] = useState('')
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)

  const [lineItems, setLineItems] = useState<LinhaItem[]>([])
  const [unitPriceStrByKey, setUnitPriceStrByKey] = useState<Record<string, string>>({})
  const [liquidTotalDraft, setLiquidTotalDraft] = useState('')

  useEffect(() => {
    setUnitPriceStrByKey((prev) => {
      const next: Record<string, string> = { ...prev }
      for (const l of lineItems) {
        if (next[l.key] === undefined) next[l.key] = formatMoneyInput(l.unit_price)
      }
      for (const k of Object.keys(next)) {
        if (!lineItems.some((li) => li.key === k)) delete next[k]
      }
      return next
    })
  }, [lineItems])

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: cl }, { data: offers }] = await Promise.all([
      supabase.from('bem_aviv_clients').select('id, full_name').eq('user_id', ownerUserId).order('full_name'),
      supabase
        .from('bem_aviv_offer_products')
        .select('id, name, category, product_line, product_type, pricing_mode, payload')
        .eq('user_id', ownerUserId)
        .order('name'),
    ])
    setClients((cl as ClienteOpt[]) ?? [])
    setOfferProducts(((offers ?? []) as OfferProduct[]).map((r) => ({ ...r, payload: normalizePayload(r.payload) })))
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!editOrderId || !supabase || !ownerUserId) {
      setOrderBootstrapping(false)
      return
    }
    if (loading) return

    let cancelled = false
    void (async () => {
      setOrderLoadError(null)
      setOrderBootstrapping(true)
      setLoadedDocumentLabel(null)

      const { data: order, error: oErr } = await supabase
        .from('bem_aviv_sales_orders')
        .select(
          'id, client_id, order_date, document_type, document_number, converted_order_id, status, total_amount, notes, discount_total, installments_count, payment_option, payment_method, down_payment_amount, down_payment_method, freight_amount',
        )
        .eq('id', editOrderId)
        .eq('user_id', ownerUserId)
        .maybeSingle()

      if (cancelled) return
      if (oErr || !order) {
        setOrderLoadError(oErr?.message ?? 'Documento não encontrado.')
        setOrderBootstrapping(false)
        return
      }

      const quote = order as SalesOrderHeaderRow
      if (!canEditSalesDocument(quote)) {
        setOrderLoadError('Este documento não pode ser editado (fechado, entregue ou já convertido).')
        setOrderBootstrapping(false)
        return
      }

      const { data: its, error: iErr } = await supabase
        .from('bem_aviv_sales_order_items')
        .select('offer_product_id, variation_code, item_description, quantity, unit_price, discount_amount, total_price')
        .eq('sales_order_id', editOrderId)

      if (cancelled) return
      if (iErr) {
        setOrderLoadError(iErr.message)
        setOrderBootstrapping(false)
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
        setOrderLoadError(
          'Este documento tem itens antigos sem vínculo ao catálogo. A edição por esta tela não está disponível.',
        )
        setOrderBootstrapping(false)
        return
      }

      const mapped: LinhaItem[] = items.map((it) => {
        const qty = Number(it.quantity)
        const unit = Number(it.unit_price)
        return {
          key: newLineKey(),
          kind: 'PRODUCT',
          offer_product_id: it.offer_product_id!,
          variation_code: it.variation_code!,
          name: it.item_description,
          unit_price: unit,
          quantity: qty,
        }
      })

      const totalGrossFromItems = mapped.reduce((acc, it) => acc + it.quantity * it.unit_price, 0)
      const quoteDiscountAmount = Number(quote.discount_total ?? 0)
      const discountBase = mapped.length > 0 ? totalGrossFromItems : 0
      const discountPercent =
        discountBase > 0 ? clampOrderDiscountPercent((quoteDiscountAmount / discountBase) * 100) : 0

      setForm({
        client_id: quote.client_id ?? '',
        order_date: quote.order_date,
        document_type: quote.document_type,
        status: quote.status,
        discount_percent: discountPercent !== 0 ? formatDiscountPercentInput(discountPercent) : '',
        installments_count: String(quote.installments_count ?? 1),
        notes: quote.notes ?? '',
        payment_option: parsePaymentOptionNav(quote.payment_option),
        payment_method: parsePaymentMethodNav(quote.payment_method),
        down_payment:
          quote.down_payment_amount != null && Number(quote.down_payment_amount) > 0
            ? String(Number(quote.down_payment_amount)).replace('.', ',')
            : '',
        down_payment_method: parsePaymentMethodNav(quote.down_payment_method ?? quote.payment_method),
        freight_amount:
          quote.freight_amount != null && Number(quote.freight_amount) > 0
            ? String(Number(quote.freight_amount)).replace('.', ',')
            : '',
      })
      setLineItems(mapped)
      setLoadedDocumentLabel(quote.document_number ?? quote.id)
      setOrderBootstrapping(false)
    })()

    return () => {
      cancelled = true
    }
  }, [editOrderId, supabase, ownerUserId, loading])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!comboRef.current?.contains(e.target as Node)) setComboOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

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

  const productSuggestions = useMemo(() => {
    const q = normalizeTextKey(productQuery)
    if (!q) return uniqueProductNames.slice(0, 12)
    return uniqueProductNames.filter((n) => normalizeTextKey(n).includes(q)).slice(0, 12)
  }, [productQuery, uniqueProductNames])

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

  const sumLinesNet = useMemo(
    () => lineItems.reduce((acc, l) => acc + l.quantity * l.unit_price, 0),
    [lineItems],
  )

  const installmentsNum = useMemo(
    () => Math.min(120, Math.max(1, parseInt(form.installments_count.replace(/\D/g, ''), 10) || 1)),
    [form.installments_count],
  )

  const downPaymentNum = useMemo(() => clampMoney(parseMoney(form.down_payment || '0')), [form.down_payment])
  const freightAmountNum = useMemo(() => clampMoney(parseMoney(form.freight_amount || '0')), [form.freight_amount])
  const linesGrossTotal = sumLinesNet
  const downPaymentApplied = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0

  const orderDiscount = useMemo(() => {
    const base = lineItems.length > 0 ? linesGrossTotal : 0
    const p = parseOrderDiscountPercent(form.discount_percent)
    return roundMoneySigned((base * p) / 100)
  }, [lineItems.length, linesGrossTotal, form.discount_percent])

  const previewOrderTotal = useMemo(() => {
    if (lineItems.length === 0) return null
    const net = clampMoney(sumLinesNet - orderDiscount + freightAmountNum)
    return clampMoney(net - downPaymentApplied)
  }, [lineItems.length, sumLinesNet, orderDiscount, freightAmountNum, downPaymentApplied])

  const lineNetByKey = useMemo(() => {
    const map: Record<string, number> = {}
    if (lineItems.length === 0 || sumLinesNet <= 0) return map
    const baseTotals = lineItems.map((l) => clampMoney(l.quantity * l.unit_price))
    const orderAbatement = roundMoneySigned(orderDiscount + downPaymentApplied)
    const rowAbatements = splitSignedAmountProportionally(baseTotals, orderAbatement)
    lineItems.forEach((l, idx) => {
      map[l.key] = clampMoney(baseTotals[idx] - rowAbatements[idx])
    })
    return map
  }, [lineItems, sumLinesNet, orderDiscount, downPaymentApplied])

  const lineOrderDiscountByKey = useMemo(() => {
    const map: Record<string, number> = {}
    if (lineItems.length === 0 || sumLinesNet <= 0 || orderDiscount === 0) return map
    const baseTotals = lineItems.map((l) => clampMoney(l.quantity * l.unit_price))
    const rowDiscounts = splitSignedAmountProportionally(baseTotals, roundMoneySigned(orderDiscount))
    lineItems.forEach((l, idx) => {
      map[l.key] = rowDiscounts[idx]
    })
    return map
  }, [lineItems, sumLinesNet, orderDiscount])

  useEffect(() => {
    if (lineItems.length === 0) {
      setLiquidTotalDraft('')
      return
    }
    const p = parseOrderDiscountPercent(form.discount_percent)
    const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
    const net = clampMoney(sumLinesNet - (sumLinesNet * p) / 100 + freightAmountNum - entrada)
    setLiquidTotalDraft(formatMoneyInput(net))
  }, [lineItems.length, sumLinesNet, freightAmountNum, form.payment_option, downPaymentNum, form.discount_percent])

  function applyLiquidRawToDiscount(raw: string) {
    if (lineItems.length === 0 || sumLinesNet <= 0) return
    const targetLiquid = clampMoney(parseMoney(raw))
    if (targetLiquid < 0) return
    const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
    const discOrderExact = roundMoneySigned(sumLinesNet + freightAmountNum - entrada - targetLiquid)
    if (discOrderExact > sumLinesNet + 0.000_001) return
    const p = sumLinesNet > 0 ? (discOrderExact / sumLinesNet) * 100 : 0
    setForm((f) => ({ ...f, discount_percent: clampOrderDiscountPercent(p).toFixed(6).replace('.', ',') }))
    setLiquidTotalDraft(formatMoneyInput(targetLiquid))
  }

  function addLineFromDraft() {
    const p = selectedOffer
    if (!p) {
      alert('SELECIONE PRODUTO E TIPO DO CATÁLOGO.')
      return
    }
    const qty = Math.max(1, parseInt(draftQty.replace(/\D/g, ''), 10) || 1)

    if (p.pricing_mode === 'KIT') {
      const payload = normalizePayload(p.payload)
      const kitLines = payload.kit_lines ?? []
      if (kitLines.length === 0) {
        alert('ESTE KIT NÃO TEM ITENS VÁLIDOS NO CADASTRO.')
        return
      }
      const vars = payload.variations ?? []
      const v = vars.find((x) => x.code === draftVariationCode)
      if (vars.length > 0 && !v) {
        alert('SELECIONE A VARIAÇÃO (CÓDIGO / DIMENSÕES).')
        return
      }
      if (vars.length === 0) {
        alert('ESTE KIT NÃO TEM PREÇO VÁLIDO CADASTRADO.')
        return
      }
      const kitUnit = Number(v!.price)
      if (!Number.isFinite(kitUnit) || kitUnit <= 0) {
        alert('PREÇO DO KIT INVÁLIDO.')
        return
      }

      // Em ORÇAMENTO, mostrar o KIT como item único para facilitar simulações ao cliente.
      if (form.document_type === 'ORCAMENTO') {
        const dimPart = v!.dimensions ? ` — ${v!.dimensions}` : ''
        const descName = `${p.name} [${v!.code}]${dimPart}`
        setLineItems((prev) => [
          ...prev,
          {
            key: newLineKey(),
            kind: 'KIT',
            offer_product_id: p.id,
            variation_code: v!.code,
            name: descName,
            unit_price: kitUnit,
            quantity: qty,
          },
        ])
        setDraftProductName('')
        setDraftProductType('')
        setDraftVariationCode('')
        setDraftQty('1')
        setProductQuery('')
        return
      }

      const byId = new Map(offerProducts.map((x) => [x.id, x]))
      const exploded: LinhaItem[] = []
      for (const kl of kitLines) {
        const comp = byId.get(kl.offer_product_id)
        const vars = normalizePayload(comp?.payload ?? {}).variations ?? []
        const v = vars.find((x) => x.code === kl.variation_code)
        if (!comp || !v || !Number.isFinite(v.price) || v.price <= 0) {
          alert(
            `KIT COM ITEM INVÁLIDO (${comp?.name ?? 'PRODUTO REMOVIDO'}). ABRA O CADASTRO DO KIT EM PRODUTOS (CATÁLOGO) E CORRIJA.`,
          )
          return
        }
        const lineQty = kl.quantity * qty
        const dimPart = v.dimensions ? ` — ${v.dimensions}` : ''
        const descName = `${comp.name} [${v.code}]${dimPart} — parte do kit «${p.name}» (kit ×${qty})`
        exploded.push({
          key: newLineKey(),
          kind: 'PRODUCT',
          offer_product_id: comp.id,
          variation_code: v.code,
          name: descName,
          unit_price: v.price,
          quantity: lineQty,
        })
      }
      setLineItems((prev) => [...prev, ...exploded])
      setDraftProductName('')
      setDraftProductType('')
      setDraftVariationCode('')
      setDraftQty('1')
      setProductQuery('')
      return
    }

    const vars = normalizePayload(p.payload).variations ?? []
    const v = vars.find((x) => x.code === draftVariationCode)
    if (vars.length > 0 && !v) {
      alert('SELECIONE A VARIAÇÃO (CÓDIGO / DIMENSÕES).')
      return
    }
    if (vars.length === 0) {
      alert('ESTE PRODUTO NÃO TEM VARIAÇÕES CADASTRADAS.')
      return
    }
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
        kind: 'PRODUCT',
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
    setProductQuery('')
  }

  function removeLine(key: string) {
    setLineItems((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLineQty(key: string, qtyStr: string) {
    const qty = Math.max(1, parseInt(qtyStr.replace(/\D/g, ''), 10) || 1)
    setLineItems((prev) => prev.map((l) => (l.key !== key ? l : { ...l, quantity: qty })))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    if (submitLockRef.current) return
    if (lineItems.length === 0) {
      alert('ADICIONE PELO MENOS UM ITEM OU USE A LISTAGEM DE PEDIDOS PARA VALOR MANUAL.')
      return
    }
    submitLockRef.current = true
    try {
      const entrada = form.payment_option === 'A_PRAZO' ? downPaymentNum : 0
      const discOrder = roundMoneySigned(orderDiscount)
      const inst = installmentsNum
      const totalInsert = clampMoney(sumLinesNet - discOrder + freightAmountNum)

      const netCheck = roundMoneySigned(sumLinesNet - discOrder + freightAmountNum - entrada)
      if (netCheck < -0.005) {
        alert('DESCONTO NO PEDIDO É MAIOR QUE A SOMA DOS ITENS + FRETE.')
        return
      }
      const totalBruto = linesGrossTotal + freightAmountNum
      if (form.payment_option === 'A_PRAZO' && entrada > totalBruto) {
        alert('ENTRADA NÃO PODE SER MAIOR QUE O VALOR A PRAZO (BRUTO).')
        return
      }

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

      if (editOrderId) {
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
          down_payment_method: headerPayload.down_payment_method,
          freight_amount: headerPayload.freight_amount,
          total_amount: totalInsert,
        }

        const { error: delErr } = await supabase.from('bem_aviv_sales_order_items').delete().eq('sales_order_id', editOrderId)
        if (delErr) {
          alert(delErr.message)
          return
        }

        const { error: updErr } = await supabase
          .from('bem_aviv_sales_orders')
          .update(cleanUpdate)
          .eq('id', editOrderId)
          .eq('user_id', ownerUserId)

        if (updErr) {
          alert(updErr.message)
          return
        }

        const rowsToInsert = lineItems.map((l) => ({
          user_id: ownerUserId,
          sales_order_id: editOrderId,
          product_id: null,
          catalog_price_cell_id: null,
          offer_product_id: l.offer_product_id,
          variation_code: l.variation_code,
          item_description: toUpperTrim(l.name),
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: roundMoneySigned(lineOrderDiscountByKey[l.key] ?? 0),
          total_price: clampMoney(clampMoney(l.quantity * l.unit_price) - roundMoneySigned(lineOrderDiscountByKey[l.key] ?? 0)),
        }))

        const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
        if (itemsErr) {
          alert(itemsErr.message)
          return
        }

        navigate('/bem-aviv/pedidos')
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

      const rowsToInsert = lineItems.map((l) => ({
        user_id: ownerUserId,
        sales_order_id: orderId,
        product_id: null,
        catalog_price_cell_id: null,
        offer_product_id: l.offer_product_id,
        variation_code: l.variation_code,
        item_description: toUpperTrim(l.name),
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: roundMoneySigned(lineOrderDiscountByKey[l.key] ?? 0),
        total_price: clampMoney(clampMoney(l.quantity * l.unit_price) - roundMoneySigned(lineOrderDiscountByKey[l.key] ?? 0)),
      }))

      const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
      if (itemsErr) {
        alert(itemsErr.message)
        return
      }

      navigate('/bem-aviv/pedidos')
    } finally {
      submitLockRef.current = false
    }
  }

  const discountDisplay = orderDiscount
  const checklist = useMemo(
    () => ({
      hasClient: Boolean(form.client_id),
      hasItems: lineItems.length > 0,
      hasOrderDate: Boolean(form.order_date),
      hasValidInstallments: installmentsNum >= 1,
      hasValidDownPayment:
        form.payment_option !== 'A_PRAZO' || downPaymentApplied <= clampMoney(sumLinesNet - orderDiscount + freightAmountNum),
    }),
    [
      form.client_id,
      lineItems.length,
      form.order_date,
      installmentsNum,
      form.payment_option,
      downPaymentApplied,
      sumLinesNet,
      orderDiscount,
      freightAmountNum,
    ],
  )
  const checklistOk = Object.values(checklist).every(Boolean)

  return (
    <div className="normal-case">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/bem-aviv/pedidos"
            title="Voltar para lista"
            aria-label="Voltar para lista"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-[#185FA5] shadow-sm transition-colors hover:bg-slate-50"
          >
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {isEditMode ? 'Editar orçamento / pedido' : 'Novo pedido'}
            </h1>
            {isEditMode && loadedDocumentLabel ? (
              <p className="mt-0.5 text-sm text-slate-500">{loadedDocumentLabel}</p>
            ) : null}
          </div>
        </div>
      </div>

      {!supabase || !ownerUserId ? (
        <p className="text-sm text-slate-600">Conectando…</p>
      ) : loading || orderBootstrapping ? (
        <p className="text-sm text-slate-500">{orderBootstrapping ? 'Carregando documento…' : 'Carregando catálogo…'}</p>
      ) : orderLoadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{orderLoadError}</div>
      ) : (
        <form onSubmit={submit}>
          <div className="bem-aviv-novo-pedido grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="space-y-6 lg:col-span-5">
              <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <CardTitle className="flex items-center gap-2 font-hub text-lg font-bold text-slate-900">
                    <ClipboardList size={22} className="text-[#185FA5]" aria-hidden />
                    Dados do pedido
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Cliente</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-base"
                      value={form.client_id}
                      onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    >
                      <option value="">— Selecione —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Data</label>
                      <Input
                        type="date"
                        value={form.order_date}
                        onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                        required
                        className="mt-1 h-12"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Tipo</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 text-base"
                        value={form.document_type}
                        onChange={(e) => setForm({ ...form, document_type: e.target.value as 'ORCAMENTO' | 'PEDIDO' })}
                      >
                        <option value="ORCAMENTO">Orçamento</option>
                        <option value="PEDIDO">Pedido</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Observações</label>
                    <Input className="mt-1 h-12" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-hub text-base font-semibold text-slate-800">
                    <Search size={20} className="text-[#185FA5]" aria-hidden />
                    Adicionar produtos ou kits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div ref={comboRef} className="relative flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-slate-400" size={18} />
                      <Input
                        value={productQuery}
                        onChange={(e) => {
                          setProductQuery(e.target.value)
                          setComboOpen(true)
                        }}
                        onFocus={() => setComboOpen(true)}
                        placeholder="Busque por nome, linha ou tipo…"
                        className="h-12 border-slate-200 pl-10 pr-3 shadow-sm focus-visible:ring-2 focus-visible:ring-[#185FA5]/30"
                        autoComplete="off"
                      />
                      {comboOpen && productSuggestions.length > 0 ? (
                        <ul
                          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                          role="listbox"
                        >
                          {productSuggestions.map((name) => (
                            <li key={name}>
                              <button
                                type="button"
                                className="w-full px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                                onClick={() => {
                                  setDraftProductName(name)
                                  setProductQuery(name)
                                  setComboOpen(false)
                                }}
                              >
                                {name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      className="h-12 shrink-0 px-6 sm:px-8"
                      onClick={() => {
                        if (!draftProductName) {
                          alert('SELECIONE UM PRODUTO NA LISTA DE SUGESTÕES.')
                          return
                        }
                        addLineFromDraft()
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Produto</label>
                      <SearchableSelect
                        value={draftProductName}
                        onChange={(v) => {
                          setDraftProductName(v)
                          setProductQuery(v)
                        }}
                        options={productSelectOptions}
                        placeholder="— Catálogo —"
                        aria-label="Produto"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Tipo</label>
                      <SearchableSelect
                        value={draftProductType}
                        onChange={setDraftProductType}
                        options={typeSelectOptions}
                        placeholder="—"
                        disabled={!draftProductName}
                        aria-label="Tipo"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Variação</label>
                      <SearchableSelect
                        value={draftVariationCode}
                        onChange={setDraftVariationCode}
                        options={variationSelectOptions}
                        placeholder={variationOptions.length === 0 ? '—' : '—'}
                        disabled={!selectedOffer || variationOptions.length === 0}
                        aria-label="Variação"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-24">
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Qtd</label>
                      <Input
                        inputMode="numeric"
                        value={draftQty}
                        onChange={(e) => setDraftQty(e.target.value)}
                        className="h-11 text-center"
                      />
                    </div>
                    <Button type="button" variant="secondary" className="h-11" onClick={addLineFromDraft}>
                      Incluir linha
                    </Button>
                  </div>

                  <p className="text-sm italic text-slate-500">
                    Dica: produtos em modo kit (cadastrados em Produtos — catálogo) ao incluir no pedido geram uma linha por item do
                    catálogo, com quantidade = (qtd do kit) × (qtd de cada item no kit).
                  </p>

                  {offerProducts.length === 0 ? (
                    <p className="text-sm text-amber-800">
                      Nenhum produto no catálogo.{' '}
                      <Link className="font-medium underline" to="/bem-aviv/produtos-catalogo">
                        Cadastre em Produtos (catálogo)
                      </Link>
                      .
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-hub text-base font-semibold text-slate-800">
                    <CircleDollarSign size={20} className="text-[#185FA5]" aria-hidden />
                    Informações pagamento desconto e frete
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div>
                    <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Pagamento</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 text-base"
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
                    <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Meio</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 text-base"
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
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Entrada (R$)</label>
                      <Input
                        className="mt-1 h-12"
                        value={form.down_payment}
                        onChange={(e) => setForm({ ...form, down_payment: e.target.value })}
                        inputMode="decimal"
                        title="Entrada paga no ato. Reduz o saldo final."
                      />
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Parcelas</label>
                      <Input
                        className="mt-1 h-12"
                        inputMode="numeric"
                        min={1}
                        value={form.installments_count}
                        onChange={(e) => setForm({ ...form, installments_count: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Frete</label>
                      <Input
                        className="mt-1 h-12"
                        value={form.freight_amount}
                        onChange={(e) => setForm({ ...form, freight_amount: e.target.value })}
                        inputMode="decimal"
                        title="Frete somado ao total do pedido."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Desconto no pedido (%)</label>
                    <Input
                      className="mt-1 h-12"
                      value={form.discount_percent}
                      onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                      inputMode="decimal"
                      title="Desconto aplicado proporcionalmente nos itens."
                    />
                  </div>

                  {lineItems.length > 0 ? (
                    <div>
                      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Valor líquido (ajuste fino)</label>
                      <Input
                        className="mt-1 h-12"
                        value={liquidTotalDraft}
                        onChange={(e) => setLiquidTotalDraft(e.target.value)}
                        onBlur={(e) => applyLiquidRawToDiscount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            applyLiquidRawToDiscount((e.target as HTMLInputElement).value)
                          }
                        }}
                        inputMode="decimal"
                        title="Ajuste fino do total líquido (recalcula desconto automaticamente)."
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <CardTitle className="flex items-center gap-2 font-hub text-lg font-bold text-slate-900">
                    <ShoppingCart size={22} className="text-[#185FA5]" aria-hidden />
                    Totais e finalização
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2 text-base">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal (itens)</span>
                      <span className="tabular-nums">{formatBRL(linesGrossTotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Descontos</span>
                      <span className="tabular-nums text-emerald-600">− {formatBRL(discountDisplay)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Frete</span>
                      <span className="tabular-nums">{formatBRL(freightAmountNum)}</span>
                    </div>
                    <div className="flex items-end justify-between border-t border-slate-100 pt-3">
                      <span className="text-sm font-medium text-slate-900">Total</span>
                      <span className="text-2xl font-black tabular-nums text-[#185FA5]">
                        {lineItems.length > 0 ? formatBRL(clampMoney(sumLinesNet - orderDiscount + freightAmountNum)) : '—'}
                      </span>
                    </div>
                    {previewOrderTotal != null && installmentsNum > 1 ? (
                      <p className="text-sm text-slate-600">
                        {installmentsNum}x de {formatBRL(previewOrderTotal / installmentsNum)}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p className="mb-2 font-semibold uppercase tracking-wide text-slate-700">Checklist pré-finalização</p>
                      <div className="grid gap-1">
                        <p>{checklist.hasClient ? 'OK' : 'Pendente'} Cliente selecionado</p>
                        <p>{checklist.hasItems ? 'OK' : 'Pendente'} Itens adicionados</p>
                        <p>{checklist.hasOrderDate ? 'OK' : 'Pendente'} Data do pedido</p>
                        <p>{checklist.hasValidInstallments ? 'OK' : 'Pendente'} Parcelas válidas</p>
                        <p>{checklist.hasValidDownPayment ? 'OK' : 'Pendente'} Entrada compatível com o total</p>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full text-base font-bold shadow-md shadow-sky-100"
                      disabled={!checklistOk}
                    >
                      {isEditMode
                        ? 'Salvar alterações'
                        : `Finalizar ${form.document_type === 'ORCAMENTO' ? 'orçamento' : 'pedido'}`}
                    </Button>
                    <Button type="button" variant="secondary" className="h-11 w-full text-base" disabled>
                      Gerar PDF (em breve)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-7">
              <Card className="sticky top-6 border-0 shadow-lg ring-1 ring-slate-100/90">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <CardTitle className="flex items-center gap-2 font-hub text-lg font-bold text-slate-900">
                    <List size={22} className="text-[#185FA5]" aria-hidden />
                    Itens do pedido
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Preço unitário editável após incluir a linha.</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-base">
                      <thead className="border-b border-slate-100 bg-slate-50">
                        <tr>
                          <th className="p-4 text-left text-sm font-semibold uppercase tracking-wide text-slate-600">Item</th>
                          <th className="w-24 p-4 text-center text-sm font-semibold uppercase tracking-wide text-slate-600">Qtd</th>
                          <th className="w-36 p-4 text-sm font-semibold uppercase tracking-wide text-slate-600">Preço un.</th>
                          <th className="p-4 text-sm font-semibold uppercase tracking-wide text-slate-600">Total</th>
                          <th className="w-14 p-4" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lineItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-10 text-center text-base text-slate-600">
                              Nenhum item ainda. Use a coluna à esquerda para buscar e incluir produtos ou kits.
                            </td>
                          </tr>
                        ) : (
                          lineItems.map((l) => {
                            const rowNet = clampMoney(l.quantity * l.unit_price)
                            return (
                              <tr key={l.key} className="transition-colors hover:bg-slate-50/60">
                                <td className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                                        l.kind === 'KIT' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-[#185FA5]'
                                      }`}
                                    >
                                      {l.kind === 'KIT' ? <Package size={20} /> : <Box size={20} />}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-base font-semibold text-slate-900">{l.name}</p>
                                        {l.kind === 'KIT' ? (
                                          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-sm text-indigo-800">
                                            KIT
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <p className="text-sm text-slate-500">{l.kind === 'KIT' ? 'Kit composto' : 'Catálogo oferta'}</p>
                                      {(lineOrderDiscountByKey[l.key] ?? 0) > 0 || downPaymentApplied > 0 ? (
                                        <p className="text-xs text-slate-400">
                                          Bruto {formatBRL(rowNet)} · Abat. {formatBRL(rowNet - (lineNetByKey[l.key] ?? rowNet))} · Líquido{' '}
                                          {formatBRL(lineNetByKey[l.key] ?? rowNet)}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4 text-center">
                                  <Input
                                    className="mx-auto h-10 w-16 border-slate-200 text-center text-base"
                                    inputMode="numeric"
                                    value={String(l.quantity)}
                                    onChange={(e) => updateLineQty(l.key, e.target.value)}
                                  />
                                </td>
                                <td className="p-4">
                                  <Input
                                    className="h-10 min-w-[8rem] border-slate-200 text-right text-base font-semibold tabular-nums text-slate-900"
                                    inputMode="decimal"
                                    value={unitPriceStrByKey[l.key] ?? formatMoneyInput(l.unit_price)}
                                    onChange={(e) => setUnitPriceStrByKey((p) => ({ ...p, [l.key]: e.target.value }))}
                                    onBlur={() => {
                                      const raw = unitPriceStrByKey[l.key] ?? formatMoneyInput(l.unit_price)
                                      const u = clampMoney(parseMoney(raw))
                                      if (!Number.isFinite(u) || u <= 0) {
                                        setUnitPriceStrByKey((p) => ({ ...p, [l.key]: formatMoneyInput(l.unit_price) }))
                                        return
                                      }
                                      setLineItems((prev) => prev.map((x) => (x.key === l.key ? { ...x, unit_price: u } : x)))
                                      setUnitPriceStrByKey((p) => ({ ...p, [l.key]: formatMoneyInput(u) }))
                                    }}
                                    aria-label={`Preço unitário ${l.name}`}
                                  />
                                </td>
                                <td className="p-4 text-base font-semibold tabular-nums text-slate-900">
                                  {formatBRL(lineNetByKey[l.key] ?? rowNet)}
                                </td>
                                <td className="p-4 text-right">
                                  <button
                                    type="button"
                                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    aria-label="Remover"
                                    onClick={() => removeLine(l.key)}
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
