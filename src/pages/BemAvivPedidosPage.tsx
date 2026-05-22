import { useUser } from '@clerk/clerk-react'
import {
  CheckCircle2,
  CircleDollarSign,
  Eye,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
  XCircle,
  TrendingUp,
  Clock,
  Truck,
  Search,
  Sparkles,
  FileText,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { normalizePayload, type OfferProduct } from '../lib/bemAvivOfferProduct'
import { formatBRL } from '../lib/format'

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
  other_expenses?: number | null
}

type ClienteOpt = { id: string; full_name: string }

type OrderItemDetailRow = {
  id: string
  item_description: string
  quantity: number
  unit_price: number
  discount_amount: number
  total_price: number
  created_at: string
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
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

function downVal(r: Pedido) {
  return clampMoney(Number(r.down_payment_amount ?? 0))
}

function displayTotalPedido(r: Pedido) {
  return netTotal(r)
}

function installmentCell(r: Pedido) {
  const net = netTotal(r)
  const inst = Math.min(120, Math.max(1, r.installments_count ?? 1))
  const entrada = downVal(r)
  const financed = clampMoney(net - entrada)
  const each = inst > 0 ? financed / inst : financed
  return `${inst}x de ${formatBRL(each)}`
}

function canEditOrcamento(r: Pedido) {
  return r.document_type === 'ORCAMENTO' && !r.converted_order_id && r.status === 'ABERTO'
}

function canFecharGerarPedido(r: Pedido) {
  return r.document_type === 'ORCAMENTO' && !r.converted_order_id && r.status === 'ABERTO'
}

function canEditPedido(r: Pedido) {
  return r.document_type === 'PEDIDO' && r.status === 'ABERTO'
}

function canCancelPedido(r: Pedido) {
  return r.document_type === 'PEDIDO' && r.status !== 'CANCELADO' && r.status !== 'ENTREGUE'
}

function canConfirmPayment(r: Pedido) {
  return r.document_type === 'PEDIDO' && r.status === 'ABERTO'
}

function canConfirmDelivery(r: Pedido) {
  return r.document_type === 'PEDIDO' && r.status === 'ENTREGA PENDENTE'
}

function canReopenPedido(r: Pedido) {
  const s = r.status
  return (
    r.document_type === 'PEDIDO' &&
    (s === 'ENTREGUE' || s === 'ENTREGA PENDENTE' || s === 'FINALIZADO')
  )
}

function canVerDetalhePedido(r: Pedido) {
  const s = r.status
  return r.document_type === 'PEDIDO' && (s === 'ENTREGUE' || s === 'ENTREGA PENDENTE' || s === 'FINALIZADO')
}

function canExcluirDocumento(r: Pedido) {
  return r.status === 'CANCELADO'
}

function renderStatusBadge(status: string, docType: 'ORCAMENTO' | 'PEDIDO') {
  const s = String(status ?? '').trim().toUpperCase()
  if (docType === 'ORCAMENTO') {
    if (s === 'ABERTO') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-100">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Aberto
        </span>
      )
    }
    if (s === 'FECHADO' || s === 'CONVERTIDO') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Convertido
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {status}
      </span>
    )
  } else {
    if (s === 'ABERTO') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-100">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Aberto
        </span>
      )
    }
    if (s === 'ENTREGA PENDENTE') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Entrega Pendente
        </span>
      )
    }
    if (s === 'ENTREGUE' || s === 'FINALIZADO') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Entregue
        </span>
      )
    }
    if (s === 'CANCELADO') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-100">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Cancelado
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {status}
      </span>
    )
  }
}

const iconBtn =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40'

type PedidosLocationState = {
  bemAvivPedidosClient?: { id: string }
  bemAvivPedidosTab?: 'ORCAMENTO' | 'PEDIDO'
}

export function BemAvivPedidosPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const location = useLocation()
  const navigate = useNavigate()
  const { activeCompanyId, loading: companyCtxLoading, error: companyCtxError } = useCompany()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Pedido[]>([])
  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [typeTab, setTypeTab] = useState<'ORCAMENTO' | 'PEDIDO'>('PEDIDO')
  const [clientTableFilterId, setClientTableFilterId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'ABERTO' | 'ENTREGA PENDENTE' | 'ENTREGUE' | 'CANCELADO'
  >('TODOS')
  const [sortBy, setSortBy] = useState<'DATA' | 'DOCUMENTO' | 'CLIENTE' | 'STATUS' | 'VALOR'>('DATA')
  const [sortDir, setSortDir] = useState<'DESC' | 'ASC'>('DESC')
  const [detailModalPedido, setDetailModalPedido] = useState<Pedido | null>(null)
  const [detailModalItems, setDetailModalItems] = useState<OrderItemDetailRow[]>([])
  const [detailModalLoading, setDetailModalLoading] = useState(false)

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) m.set(c.id, c.full_name)
    return m
  }, [clients])

  const dataLoadBanner = useMemo(
    () => [companyCtxError, queryError].filter(Boolean).join(' · '),
    [companyCtxError, queryError],
  )

  const { filteredRows, countOrcamento, countPedido } = useMemo(() => {
    let o = 0
    let p = 0
    for (const r of rows) {
      const dt = String(r.document_type ?? '')
        .trim()
        .toUpperCase()
      if (dt === 'ORCAMENTO') o += 1
      else if (dt === 'PEDIDO') p += 1
    }
    let list = rows.filter(
      (r) =>
        String(r.document_type ?? '')
          .trim()
          .toUpperCase() === typeTab,
    )
    if (clientTableFilterId) {
      list = list.filter((r) => r.client_id === clientTableFilterId)
    }
    const q = search.trim().toUpperCase()
    if (q) {
      list = list.filter((r) => {
        const doc = (r.document_number ?? '').toUpperCase()
        const st = (r.status ?? '').toUpperCase()
        const dt = (r.order_date ?? '').toUpperCase()
        const client = r.client_id ? (clientNameById.get(r.client_id) ?? '').toUpperCase() : ''
        return doc.includes(q) || st.includes(q) || dt.includes(q) || client.includes(q)
      })
    }
    if (statusFilter !== 'TODOS') {
      list = list.filter((r) => (r.status ?? '').toUpperCase() === statusFilter)
    }
    const mul = sortDir === 'ASC' ? 1 : -1
    list = [...list].sort((a, b) => {
      if (sortBy === 'DOCUMENTO') return (a.document_number ?? '').localeCompare(b.document_number ?? '', 'pt-BR') * mul
      if (sortBy === 'CLIENTE') {
        const ca = a.client_id ? clientNameById.get(a.client_id) ?? '' : ''
        const cb = b.client_id ? clientNameById.get(b.client_id) ?? '' : ''
        return ca.localeCompare(cb, 'pt-BR') * mul
      }
      if (sortBy === 'STATUS') return (a.status ?? '').localeCompare(b.status ?? '', 'pt-BR') * mul
      if (sortBy === 'VALOR') return (netTotal(a) - netTotal(b)) * mul
      return (a.order_date ?? '').localeCompare(b.order_date ?? '', 'pt-BR') * mul
    })
    return { filteredRows: list, countOrcamento: o, countPedido: p }
  }, [rows, typeTab, clientTableFilterId, search, statusFilter, sortBy, sortDir, clientNameById])

  // KPIs dinâmicos para a aba selecionada
  const kpis = useMemo(() => {
    let totalCount = 0
    let totalValue = 0
    let openCount = 0
    let openValue = 0
    let pendingCount = 0
    let pendingValue = 0
    let completedCount = 0
    let completedValue = 0
    let convertedCount = 0
    let convertedValue = 0

    const currentRows = rows.filter(
      (r) =>
        String(r.document_type ?? '')
          .trim()
          .toUpperCase() === typeTab,
    )

    for (const r of currentRows) {
      const val = displayTotalPedido(r)
      totalCount++
      totalValue += val

      const status = String(r.status ?? '').trim().toUpperCase()
      const isConverted = !!r.converted_order_id || status === 'FECHADO'

      if (typeTab === 'ORCAMENTO') {
        if (isConverted) {
          convertedCount++
          convertedValue += val
        } else if (status === 'ABERTO') {
          openCount++
          openValue += val
        }
      } else {
        if (status === 'ABERTO') {
          openCount++
          openValue += val
        } else if (status === 'ENTREGA PENDENTE') {
          pendingCount++
          pendingValue += val
        } else if (status === 'ENTREGUE' || status === 'FINALIZADO') {
          completedCount++
          completedValue += val
        }
      }
    }

    return {
      totalCount,
      totalValue,
      openCount,
      openValue,
      pendingCount,
      pendingValue,
      completedCount,
      completedValue,
      convertedCount,
      convertedValue,
    }
  }, [rows, typeTab])

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    if (companyCtxLoading) {
      setLoading(true)
      return
    }
    if (!activeCompanyId) {
      setQueryError(null)
      setRows([])
      setClients([])
      setLoading(false)
      return
    }
    setLoading(true)
    setQueryError(null)
    const [ordersRes, clientsRes] = await Promise.all([
      supabase
        .from('bem_aviv_sales_orders')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('order_date', { ascending: false }),
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name')
        .eq('company_id', activeCompanyId)
        .order('full_name'),
    ])
    const ordersErr = ordersRes.error?.message
    const clientsErr = clientsRes.error?.message
    if (ordersErr || clientsErr) {
      setQueryError([ordersErr, clientsErr].filter(Boolean).join(' · '))
      setRows([])
      setClients([])
    } else {
      setRows(((ordersRes.data ?? []) as Pedido[]) ?? [])
      setClients(((clientsRes.data ?? []) as ClienteOpt[]) ?? [])
    }
    setLoading(false)
  }, [supabase, activeCompanyId, companyCtxLoading])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const st = location.state as PedidosLocationState | null
    if (!st) return
    const tab = st?.bemAvivPedidosTab
    const id = st?.bemAvivPedidosClient?.id
    if (tab) setTypeTab(tab)
    if (id) setClientTableFilterId(id)
    navigate('.', { replace: true, state: {} })
  }, [location.state, navigate])

  async function closeQuoteAndCreateOrder(quote: Pedido) {
    if (!supabase || !ownerUserId || !activeCompanyId) return
    if (quote.document_type !== 'ORCAMENTO') return
    if (quote.converted_order_id) {
      alert('ESTE ORÇAMENTO JÁ FOI CONVERTIDO EM PEDIDO.')
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
    const otherExp = quote.other_expenses != null ? Number(quote.other_expenses) : 0

    const { data: inserted, error: insertError } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        user_id: ownerUserId,
        company_id: activeCompanyId,
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
        other_expenses: otherExp > 0 ? otherExp : null,
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
      const initialOfferIds = Array.from(new Set(items.map((it) => it.offer_product_id).filter((id): id is string => !!id)))
      const offerById = new Map<string, OfferProduct>()
      if (initialOfferIds.length > 0) {
        const { data: baseOffers, error: offersErr } = await supabase
          .from('bem_aviv_offer_products')
          .select('id, name, pricing_mode, payload')
          .eq('user_id', ownerUserId)
          .in('id', initialOfferIds)
        if (offersErr) {
          alert(offersErr.message)
          return
        }
        for (const o of (baseOffers ?? []) as OfferProduct[]) {
          offerById.set(o.id, { ...o, payload: normalizePayload(o.payload) })
        }
      }

      const missingComponentIds = new Set<string>()
      for (const it of items) {
        if (!it.offer_product_id) continue
        const parent = offerById.get(it.offer_product_id)
        if (!parent || parent.pricing_mode !== 'KIT') continue
        const kitLines = normalizePayload(parent.payload).kit_lines ?? []
        for (const kl of kitLines) {
          if (!offerById.has(kl.offer_product_id)) missingComponentIds.add(kl.offer_product_id)
        }
      }
      if (missingComponentIds.size > 0) {
        const { data: compOffers, error: compErr } = await supabase
          .from('bem_aviv_offer_products')
          .select('id, name, pricing_mode, payload')
          .eq('user_id', ownerUserId)
          .in('id', Array.from(missingComponentIds))
        if (compErr) {
          alert(compErr.message)
          return
        }
        for (const row of (compOffers ?? []) as OfferProduct[]) {
          offerById.set(row.id, { ...row, payload: normalizePayload(row.payload) })
        }
      }

      const copyRows: Array<{
        user_id: string
        sales_order_id: string
        product_id: string | null
        catalog_price_cell_id: string | null
        offer_product_id: string | null
        variation_code: string | null
        item_description: string
        quantity: number
        unit_price: number
        discount_amount: number
        total_price: number
      }> = []

      for (const it of items) {
        if (!it.offer_product_id) {
          copyRows.push({
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
          })
          continue
        }

        const offer = offerById.get(it.offer_product_id)
        if (!offer || offer.pricing_mode !== 'KIT') {
          copyRows.push({
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
          })
          continue
        }

        const kitLines = normalizePayload(offer.payload).kit_lines ?? []
        if (kitLines.length === 0) {
          alert(`KIT SEM COMPONENTES NO CATÁLOGO: ${offer.name}`)
          return
        }

        for (const kl of kitLines) {
          const component = offerById.get(kl.offer_product_id)
          const vars = normalizePayload(component?.payload ?? {}).variations ?? []
          const v = vars.find((x) => x.code === kl.variation_code)
          if (!component || !v || !Number.isFinite(v.price) || v.price <= 0) {
            alert(`KIT INVÁLIDO AO CONVERTER: ${offer.name}. Verifique os itens do kit no catálogo.`)
            return
          }
          const qty = Math.max(1, Number(it.quantity) || 1) * Math.max(1, Number(kl.quantity) || 1)
          const dimPart = v.dimensions ? ` — ${v.dimensions}` : ''
          copyRows.push({
            user_id: ownerUserId,
            sales_order_id: newOrder.id,
            product_id: null,
            catalog_price_cell_id: null,
            offer_product_id: component.id,
            variation_code: v.code,
            item_description: `${component.name} [${v.code}]${dimPart} — parte do kit «${offer.name}»`,
            quantity: qty,
            unit_price: v.price,
            discount_amount: 0,
            total_price: clampMoney(qty * v.price),
          })
        }
      }

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
      .eq('company_id', activeCompanyId)

    if (updError) {
      alert(updError.message)
      return
    }

    alert(`PEDIDO ${newOrder.document_number ?? ''} CRIADO COM SUCESSO.`)
    await load()
  }

  async function updateOrderStatus(order: Pedido, nextStatus: string, confirmMessage: string) {
    if (!supabase || !ownerUserId || !activeCompanyId) return
    if (!confirm(confirmMessage)) return

    const { error } = await supabase
      .from('bem_aviv_sales_orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('company_id', activeCompanyId)

    if (error) {
      alert(error.message)
      return
    }

    await load()
  }

  function closePedidoDetailModal() {
    setDetailModalPedido(null)
    setDetailModalItems([])
    setDetailModalLoading(false)
  }

  async function openPedidoDetailModal(pedido: Pedido) {
    if (!supabase || !ownerUserId || !canVerDetalhePedido(pedido)) return
    setDetailModalPedido(pedido)
    setDetailModalItems([])
    setDetailModalLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_sales_order_items')
      .select('id, item_description, quantity, unit_price, discount_amount, total_price, created_at')
      .eq('sales_order_id', pedido.id)
    if (error) {
      alert(error.message)
      setDetailModalLoading(false)
      return
    }
    const rows = ((data ?? []) as OrderItemDetailRow[]).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    setDetailModalItems(rows)
    setDetailModalLoading(false)
  }

  async function deleteDocumento(order: Pedido) {
    if (!supabase || !ownerUserId || !activeCompanyId) return
    if (!canExcluirDocumento(order)) return
    if (
      !confirm(
        `EXCLUIR DEFINITIVAMENTE ${order.document_number ?? 'ESTE DOCUMENTO'}?\n\nOs itens ligados também serão removidos. Esta ação não pode ser desfeita.`,
      )
    ) {
      return
    }
    const quoteIdToReopen =
      order.document_type === 'PEDIDO' && order.source_quote_id ? order.source_quote_id : null

    const { error } = await supabase
      .from('bem_aviv_sales_orders')
      .delete()
      .eq('id', order.id)
      .eq('company_id', activeCompanyId)
    if (error) {
      alert(error.message)
      return
    }

    if (quoteIdToReopen) {
      const { error: reopenErr } = await supabase
        .from('bem_aviv_sales_orders')
        .update({ status: 'ABERTO' })
        .eq('id', quoteIdToReopen)
        .eq('company_id', activeCompanyId)
        .eq('document_type', 'ORCAMENTO')

      if (reopenErr) {
        alert(
          `O pedido foi excluído, mas o orçamento de origem não pôde ser reaberto automaticamente: ${reopenErr.message}\n\nAtualize o status do orçamento manualmente, se necessário.`,
        )
      }
    }

    await load()
  }

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">
              <Sparkles size={18} />
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">PEDIDOS DE VENDAS</h2>
          </div>
          <p className="mt-1 text-sm font-normal text-slate-500 normal-case leading-relaxed">
            Gerencie orçamentos e vendas vinculados ao cadastro do{' '}
            <strong className="font-semibold text-slate-700">Catálogo de Produtos</strong>.{' '}
            <Link className="font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-4 decoration-emerald-200 transition-colors" to="/bem-aviv/produtos-catalogo">
              Abrir catálogo de produtos
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/bem-aviv/pedidos/novo"
            state={{ document_type: typeTab }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold tracking-wide text-white hover:bg-slate-800 transition-all duration-150 shadow-sm hover:scale-[1.02] active:scale-95"
          >
            <Plus size={18} strokeWidth={2.5} />
            {typeTab === 'PEDIDO' ? 'ADICIONAR PEDIDO' : 'ADICIONAR ORÇAMENTO'}
          </Link>
        </div>
      </div>

      {dataLoadBanner && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
          role="alert"
        >
          <span className="font-medium">{dataLoadBanner}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-900 hover:bg-amber-100 transition-all shadow-sm"
            onClick={() => void load()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* KPI Dashboard Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Faturamento/Total */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {typeTab === 'ORCAMENTO' ? 'Total Orçado' : 'Faturamento Geral'}
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {formatBRL(kpis.totalValue)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium normal-case">
              {kpis.totalCount} {kpis.totalCount === 1 ? 'documento' : 'documentos'} registrados
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100" />
        </div>

        {/* KPI 2: Abertos */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {typeTab === 'ORCAMENTO' ? 'Em Negociação' : 'Aguardando Pagamento'}
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {formatBRL(kpis.openValue)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium normal-case">
              {kpis.openCount} no status <span className="font-semibold text-blue-600">ABERTO</span>
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-400" />
        </div>

        {/* KPI 3: Entregas Pendentes ou Convertidos */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {typeTab === 'ORCAMENTO' ? 'Convertidos em Pedido' : 'Envios Pendentes'}
            </span>
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${typeTab === 'ORCAMENTO' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {typeTab === 'ORCAMENTO' ? <PackageCheck size={16} /> : <Truck size={16} />}
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {typeTab === 'ORCAMENTO' ? formatBRL(kpis.convertedValue) : formatBRL(kpis.pendingValue)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium normal-case">
              {typeTab === 'ORCAMENTO' ? (
                <>
                  {kpis.convertedCount} fechados e <span className="font-semibold text-emerald-600">gerados</span>
                </>
              ) : (
                <>
                  {kpis.pendingCount} com envio <span className="font-semibold text-amber-600">pendente</span>
                </>
              )}
            </p>
          </div>
          <div className={`absolute bottom-0 left-0 right-0 h-1 ${typeTab === 'ORCAMENTO' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        </div>

        {/* KPI 4: Entregues / Concluídos */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {typeTab === 'ORCAMENTO' ? 'Taxa de Conversão' : 'Entregues'}
            </span>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold tabular-nums text-slate-900">
              {typeTab === 'ORCAMENTO' ? (
                kpis.totalCount > 0 ? `${Math.round((kpis.convertedCount / kpis.totalCount) * 100)}%` : '0%'
              ) : (
                formatBRL(kpis.completedValue)
              )}
            </h3>
            <p className="mt-1 text-xs text-slate-500 font-medium normal-case">
              {typeTab === 'ORCAMENTO' ? (
                <>De {kpis.totalCount} propostas criadas</>
              ) : (
                <><span className="font-semibold text-emerald-600">Entregues com sucesso</span></>
              )}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist" aria-label="Filtrar por tipo de documento">
        <button
          type="button"
          role="tab"
          aria-selected={typeTab === 'ORCAMENTO'}
          className={`flex items-center gap-2 rounded-t-xl border border-b-0 px-5 py-3 text-sm font-semibold tracking-wide transition-all duration-150 ${
            typeTab === 'ORCAMENTO'
              ? 'border-slate-200 bg-white text-slate-950 shadow-[0_2px_0_0_#fff] translate-y-[1px]'
              : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
          onClick={() => setTypeTab('ORCAMENTO')}
        >
          Orçamentos
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold transition-all ${
            typeTab === 'ORCAMENTO' ? 'bg-slate-100 text-slate-900' : 'bg-slate-100 text-slate-500'
          }`}>
            {countOrcamento}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={typeTab === 'PEDIDO'}
          className={`flex items-center gap-2 rounded-t-xl border border-b-0 px-5 py-3 text-sm font-semibold tracking-wide transition-all duration-150 ${
            typeTab === 'PEDIDO'
              ? 'border-slate-200 bg-white text-slate-950 shadow-[0_2px_0_0_#fff] translate-y-[1px]'
              : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
          onClick={() => setTypeTab('PEDIDO')}
        >
          Pedidos
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold transition-all ${
            typeTab === 'PEDIDO' ? 'bg-slate-100 text-slate-900' : 'bg-slate-100 text-slate-500'
          }`}>
            {countPedido}
          </span>
        </button>
      </div>

      {clientTableFilterId && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-800 shadow-sm"
          role="status"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            <span>
              Exibindo apenas documentos do cliente{' '}
              <strong className="font-semibold text-slate-900">
                {clientNameById.get(clientTableFilterId) ?? 'este cliente'}
              </strong>
            </span>
          </div>
          <button
            type="button"
            className="text-sm font-bold text-sky-700 hover:text-sky-800 hover:underline transition-colors"
            onClick={() => setClientTableFilterId(null)}
          >
            Mostrar todos
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por documento, cliente, status ou data..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-sm uppercase placeholder-slate-400 outline-none focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100 transition-all"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:w-auto md:flex md:items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100 transition-all cursor-pointer"
          >
            <option value="TODOS">Status: Todos</option>
            <option value="ABERTO">Aberto</option>
            <option value="ENTREGA PENDENTE">Entrega pendente</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100 transition-all cursor-pointer"
          >
            <option value="DATA">Ordenar: Data</option>
            <option value="DOCUMENTO">Nº Documento</option>
            <option value="CLIENTE">Cliente</option>
            <option value="STATUS">Status</option>
            <option value="VALOR">Valor</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as typeof sortDir)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100 transition-all cursor-pointer"
          >
            <option value="DESC">Decrescente (Z-A)</option>
            <option value="ASC">Crescente (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Grid List Table */}
      <div className="table-wrap rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
            <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">Carregando registros...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-slate-700">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase">Nº Documento</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase">Data</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase">Cliente</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase text-right">Valor Total</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase text-right">Entrada</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase text-right">Parcelas (Valor)</th>
                  <th className="px-4 py-3.5 text-xs font-bold tracking-wider text-slate-400 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r) => {
                  const downMethod = parsePaymentMethod(r.down_payment_method ?? r.payment_method)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors duration-150">
                      <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-900 tabular-nums">
                        {r.document_number || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500 font-medium">
                        {r.order_date ? r.order_date.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className="max-w-[15rem] truncate px-4 py-4 text-sm font-semibold text-slate-800" title={r.client_id ? clientNameById.get(r.client_id) : undefined}>
                        {r.client_id ? clientNameById.get(r.client_id) ?? '—' : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {renderStatusBadge(r.status, r.document_type)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatBRL(displayTotalPedido(r))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-sm">
                        {downVal(r) > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-800">{formatBRL(downVal(r))}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{PAYMENT_METHOD_LABEL[downMethod]}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-xs font-semibold tabular-nums text-slate-600 sm:text-sm">
                        {installmentCell(r)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canEditOrcamento(r) && (
                            <button
                              type="button"
                              className={iconBtn}
                              title="Editar orçamento"
                              aria-label="Editar orçamento"
                              onClick={() => navigate(`/bem-aviv/pedidos/editar/${r.id}`)}
                            >
                              <Pencil size={16} className="text-slate-500" />
                            </button>
                          )}
                          {canFecharGerarPedido(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-emerald-100 text-emerald-700 hover:bg-emerald-50`}
                              title="Fechar e gerar pedido"
                              aria-label="Fechar e gerar pedido"
                              disabled={!!r.converted_order_id}
                              onClick={() => void closeQuoteAndCreateOrder(r)}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          {canEditPedido(r) && (
                            <button
                              type="button"
                              className={iconBtn}
                              title="Alterar pedido"
                              aria-label="Alterar pedido"
                              onClick={() => navigate(`/bem-aviv/pedidos/editar/${r.id}`)}
                            >
                              <Pencil size={16} className="text-slate-500" />
                            </button>
                          )}
                          {canConfirmPayment(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-emerald-100 text-emerald-700 hover:bg-emerald-50`}
                              title="Confirmar pagamento"
                              aria-label="Confirmar pagamento"
                              onClick={() =>
                                void updateOrderStatus(
                                  r,
                                  'ENTREGA PENDENTE',
                                  `CONFIRMAR PAGAMENTO DO PEDIDO ${r.document_number ?? ''}? O STATUS SERÁ ENTREGA PENDENTE ATÉ CONFIRMAR A ENTREGA.`,
                                )
                              }
                            >
                              <CircleDollarSign size={16} />
                            </button>
                          )}
                          {canConfirmDelivery(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-blue-100 text-blue-700 hover:bg-blue-50`}
                              title="Confirmar entrega"
                              aria-label="Confirmar entrega"
                              onClick={() =>
                                void updateOrderStatus(
                                  r,
                                  'ENTREGUE',
                                  `CONFIRMAR ENTREGA DO PEDIDO ${r.document_number ?? ''}?`,
                                )
                              }
                            >
                              <PackageCheck size={16} />
                            </button>
                          )}
                          {canVerDetalhePedido(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-sky-100 text-sky-700 hover:bg-sky-50`}
                              title="Ver detalhes do pedido"
                              aria-label="Ver detalhes do pedido"
                              onClick={() => void openPedidoDetailModal(r)}
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          {canReopenPedido(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-amber-100 text-amber-700 hover:bg-amber-50`}
                              title="Reabrir pedido"
                              aria-label="Reabrir pedido"
                              onClick={() =>
                                void updateOrderStatus(
                                  r,
                                  'ABERTO',
                                  `REABRIR O PEDIDO ${r.document_number ?? ''}? O STATUS VOLTARÁ PARA ABERTO.`,
                                )
                              }
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                          {canExcluirDocumento(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-red-100 text-red-600 hover:bg-red-50`}
                              title="Excluir documento"
                              aria-label="Excluir documento"
                              onClick={() => void deleteDocumento(r)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          {canCancelPedido(r) && (
                            <button
                              type="button"
                              className={`${iconBtn} border-red-100 text-red-600 hover:bg-red-50`}
                              title="Cancelar pedido"
                              aria-label="Cancelar pedido"
                              onClick={() =>
                                void updateOrderStatus(
                                  r,
                                  'CANCELADO',
                                  `CONFIRMAR CANCELAMENTO DO PEDIDO ${r.document_number ?? ''}?`,
                                )
                              }
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText size={32} className="text-slate-300" />
                        <p className="text-sm font-semibold text-slate-500 uppercase">
                          {typeTab === 'ORCAMENTO'
                            ? 'Nenhum orçamento nesta lista.'
                            : 'Nenhum pedido nesta lista.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modern Two-Column Detail Modal */}
      {detailModalPedido && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pedido-detail-modal-title"
        >
          <div className="flex max-h-[min(94dvh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all sm:rounded-3xl">
            {/* Modal Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 id="pedido-detail-modal-title" className="text-lg font-bold text-slate-900 uppercase">
                    Detalhes do Documento
                  </h3>
                  <span className="font-semibold text-xs text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">
                    {detailModalPedido.document_type}
                  </span>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-700 tabular-nums">
                  Nº {detailModalPedido.document_number ?? '—'}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95 shadow-sm"
                onClick={closePedidoDetailModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body with 2-Column layout on desktop */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Column 1: Financial & Payment summary (Left, spans 1 column) */}
                <div className="space-y-4 md:col-span-1">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm space-y-3.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Resumo Financeiro</h4>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-slate-500">Subtotal</span>
                        <span className="tabular-nums font-semibold text-slate-800">
                          {formatBRL(netTotal(detailModalPedido) + Number(detailModalPedido.discount_total ?? 0) - Number(detailModalPedido.freight_amount ?? 0) - Number(detailModalPedido.other_expenses ?? 0))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-emerald-600">
                        <span>Desconto</span>
                        <span className="tabular-nums font-semibold">
                          - {formatBRL(Number(detailModalPedido.discount_total ?? 0))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Frete</span>
                        <span className="tabular-nums font-semibold">
                          + {formatBRL(Number(detailModalPedido.freight_amount ?? 0))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Outras despesas</span>
                        <span className="tabular-nums font-semibold">
                          + {formatBRL(Number(detailModalPedido.other_expenses ?? 0))}
                        </span>
                      </div>
                      
                      <hr className="border-slate-200/80 my-2" />
                      
                      <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                        <span>Total Líquido</span>
                        <span className="tabular-nums text-lg text-emerald-700">
                          {formatBRL(netTotal(detailModalPedido))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Informações de Pagamento</h4>
                    
                    <div className="space-y-2 text-xs font-medium text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Forma e Meio</span>
                        <span className="text-slate-800 font-semibold">
                          {parsePaymentOption(detailModalPedido.payment_option) === 'A_PRAZO' ? 'À Prazo' : 'À Vista'} ·{' '}
                          {PAYMENT_METHOD_LABEL[parsePaymentMethod(detailModalPedido.payment_method)]}
                        </span>
                      </div>
                      {downVal(detailModalPedido) > 0 && (
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Entrada no Ato</span>
                          <span className="text-slate-800 font-semibold tabular-nums">
                            {formatBRL(downVal(detailModalPedido))}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase">Condições</span>
                        <span className="text-slate-800 font-semibold tabular-nums">
                          {installmentCell(detailModalPedido)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Dados do Registro</h4>
                    <div className="text-xs font-medium text-slate-600 space-y-1">
                      <p><span className="text-slate-400">Cliente:</span> <span className="font-semibold text-slate-800">{detailModalPedido.client_id ? clientNameById.get(detailModalPedido.client_id) ?? '—' : '—'}</span></p>
                      <p><span className="text-slate-400">Data de emissão:</span> <span className="font-semibold text-slate-800 tabular-nums">{detailModalPedido.order_date ? detailModalPedido.order_date.split('-').reverse().join('/') : '—'}</span></p>
                      <p><span className="text-slate-400">Status atual:</span> <span className="font-semibold text-slate-800">{detailModalPedido.status}</span></p>
                    </div>
                  </div>
                </div>

                {/* Column 2: Items table list (Right, spans 2 columns on desktop) */}
                <div className="space-y-4 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <span>Itens do Documento</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                        {detailModalItems.length}
                      </span>
                    </h4>
                  </div>

                  {detailModalLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 rounded-2xl border border-slate-100 bg-slate-50/50">
                      <div className="h-6 w-6 animate-spin rounded-full border-3 border-slate-200 border-t-emerald-600" />
                      <p className="text-xs font-semibold text-slate-400 uppercase">Carregando itens...</p>
                    </div>
                  ) : detailModalItems.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400 rounded-2xl border border-slate-100 bg-slate-50/50 uppercase font-medium">Nenhum item vinculado.</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                              <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-400">Descrição do Produto</th>
                              <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-400 text-center w-16">Qtd</th>
                              <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-400 text-right w-24">Preço un.</th>
                              <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-400 text-right w-28">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detailModalItems.map((it) => (
                              <tr key={it.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-800 leading-normal">{it.item_description}</td>
                                <td className="px-4 py-3 text-center font-bold text-slate-800 tabular-nums">{it.quantity}</td>
                                <td className="px-4 py-3 text-right font-medium text-slate-500 tabular-nums">{formatBRL(it.unit_price)}</td>
                                <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                  {formatBRL(it.total_price)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {detailModalPedido.notes && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Observações / Notas</h4>
                      <p className="whitespace-pre-wrap text-xs font-medium text-slate-600 leading-relaxed uppercase">{detailModalPedido.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                  onClick={closePedidoDetailModal}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
