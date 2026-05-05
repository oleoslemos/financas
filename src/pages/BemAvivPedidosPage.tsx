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
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
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

function isPendingDelivery(r: Pedido) {
  return r.document_type === 'PEDIDO' && r.status === 'FINALIZADO'
}

function canConfirmDelivery(r: Pedido) {
  return r.document_type === 'PEDIDO' && r.status === 'FINALIZADO'
}

function canReopenPedido(r: Pedido) {
  return r.document_type === 'PEDIDO' && (r.status === 'FINALIZADO' || r.status === 'ENTREGUE')
}

/** Detalhe do pedido após pagamento confirmado ou entrega. */
function canVerDetalhePedido(r: Pedido) {
  return r.document_type === 'PEDIDO' && (r.status === 'FINALIZADO' || r.status === 'ENTREGUE')
}

/** Exclusão definitiva somente após cancelamento explícito. */
function canExcluirDocumento(r: Pedido) {
  return r.status === 'CANCELADO'
}

const iconBtn =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40'

type PedidosLocationState = {
  bemAvivPedidosClient?: { id: string }
}

export function BemAvivPedidosPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const location = useLocation()
  const navigate = useNavigate()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Pedido[]>([])
  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [kitStats, setKitStats] = useState({
    quotesWithKit: 0,
    convertedFromKitQuotes: 0,
    openKitQuotes: 0,
    conversionRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [typeTab, setTypeTab] = useState<'ORCAMENTO' | 'PEDIDO'>('PEDIDO')
  const [clientTableFilterId, setClientTableFilterId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ABERTO' | 'FINALIZADO' | 'ENTREGUE' | 'CANCELADO'>('TODOS')
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

  const { filteredRows, countOrcamento, countPedido } = useMemo(() => {
    let o = 0
    let p = 0
    for (const r of rows) {
      if (r.document_type === 'ORCAMENTO') o += 1
      else if (r.document_type === 'PEDIDO') p += 1
    }
    let list = rows.filter((r) => r.document_type === typeTab)
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

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: orders }, { data: cl }, { data: offerProducts }] = await Promise.all([
      supabase.from('bem_aviv_sales_orders').select('*').eq('user_id', ownerUserId).order('order_date', { ascending: false }),
      supabase.from('bem_aviv_clients').select('id, full_name').eq('user_id', ownerUserId).order('full_name'),
      supabase.from('bem_aviv_offer_products').select('id, pricing_mode').eq('user_id', ownerUserId).eq('pricing_mode', 'KIT'),
    ])
    const ordersList = (orders as Pedido[]) ?? []
    setRows(ordersList)
    setClients((cl as ClienteOpt[]) ?? [])

    const kitOfferIds = new Set(((offerProducts ?? []) as Array<{ id: string; pricing_mode: string }>).map((r) => r.id))
    if (kitOfferIds.size > 0 && ordersList.length > 0) {
      const quoteMap = new Map(ordersList.filter((o) => o.document_type === 'ORCAMENTO').map((o) => [o.id, o]))
      const quoteIds = Array.from(quoteMap.keys())
      const quoteIdsWithKit = new Set<string>()
      const CHUNK = 200
      for (let i = 0; i < quoteIds.length; i += CHUNK) {
        const chunk = quoteIds.slice(i, i + CHUNK)
        const { data: items } = await supabase
          .from('bem_aviv_sales_order_items')
          .select('sales_order_id, offer_product_id')
          .in('sales_order_id', chunk)
        for (const it of (items ?? []) as Array<{ sales_order_id: string; offer_product_id: string | null }>) {
          if (it.offer_product_id && kitOfferIds.has(it.offer_product_id)) quoteIdsWithKit.add(it.sales_order_id)
        }
      }
      const quotesWithKit = quoteIdsWithKit.size
      let convertedFromKitQuotes = 0
      let openKitQuotes = 0
      for (const qid of quoteIdsWithKit) {
        const q = quoteMap.get(qid)
        if (!q) continue
        if (q.converted_order_id) convertedFromKitQuotes += 1
        if ((q.status ?? '').toUpperCase() === 'ABERTO') openKitQuotes += 1
      }
      setKitStats({
        quotesWithKit,
        convertedFromKitQuotes,
        openKitQuotes,
        conversionRate: quotesWithKit > 0 ? (convertedFromKitQuotes / quotesWithKit) * 100 : 0,
      })
    } else {
      setKitStats({ quotesWithKit: 0, convertedFromKitQuotes: 0, openKitQuotes: 0, conversionRate: 0 })
    }
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const st = location.state as PedidosLocationState | null
    const id = st?.bemAvivPedidosClient?.id
    if (!id) return
    setClientTableFilterId(id)
    navigate('.', { replace: true, state: {} })
  }, [location.state, navigate])

  async function closeQuoteAndCreateOrder(quote: Pedido) {
    if (!supabase || !ownerUserId) return
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

      // Se houver kits, carregar também os componentes para explosão na conversão para pedido.
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

    if (updError) {
      alert(updError.message)
      return
    }

    alert(`PEDIDO ${newOrder.document_number ?? ''} CRIADO COM SUCESSO.`)
    await load()
  }

  async function updateOrderStatus(order: Pedido, nextStatus: string, confirmMessage: string) {
    if (!supabase || !ownerUserId) return
    if (!confirm(confirmMessage)) return

    const { error } = await supabase
      .from('bem_aviv_sales_orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('user_id', ownerUserId)

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
      .eq('user_id', ownerUserId)
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
    if (!supabase || !ownerUserId) return
    if (!canExcluirDocumento(order)) return
    if (
      !confirm(
        `EXCLUIR DEFINITIVAMENTE ${order.document_number ?? 'ESTE DOCUMENTO'}?\n\nOs itens ligados também serão removidos. Esta ação não pode ser desfeita.`,
      )
    ) {
      return
    }
    const { error } = await supabase.from('bem_aviv_sales_orders').delete().eq('id', order.id).eq('user_id', ownerUserId)
    if (error) {
      alert(error.message)
      return
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/bem-aviv/pedidos/novo"
            state={{ document_type: typeTab }}
            className="btn btn-primary inline-flex items-center gap-2 font-medium normal-case"
          >
            <Plus size={18} aria-hidden />
            {typeTab === 'PEDIDO' ? 'ADICIONAR PEDIDO' : 'ADICIONAR ORÇAMENTO'}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist" aria-label="Filtrar por tipo de documento">
        <button
          type="button"
          role="tab"
          aria-selected={typeTab === 'ORCAMENTO'}
          className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
            typeTab === 'ORCAMENTO'
              ? 'border-slate-200 bg-white text-emerald-900 shadow-[0_-1px_0_0_white]'
              : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => setTypeTab('ORCAMENTO')}
        >
          Orçamentos
          <span className="ml-1.5 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-700">{countOrcamento}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={typeTab === 'PEDIDO'}
          className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
            typeTab === 'PEDIDO'
              ? 'border-slate-200 bg-white text-emerald-900 shadow-[0_-1px_0_0_white]'
              : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => setTypeTab('PEDIDO')}
        >
          Pedidos
          <span className="ml-1.5 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-700">{countPedido}</span>
        </button>
      </div>

      {clientTableFilterId ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-slate-800"
          role="status"
        >
          <span>
            Exibindo apenas orçamentos e pedidos de{' '}
            <strong className="font-semibold text-slate-900">
              {clientNameById.get(clientTableFilterId) ?? 'este cliente'}
            </strong>
            .
          </span>
          <button
            type="button"
            className="shrink-0 font-medium text-[#185FA5] underline-offset-2 hover:underline"
            onClick={() => setClientTableFilterId(null)}
          >
            Mostrar todos
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orçamentos com kit</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{kitStats.quotesWithKit}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Convertidos em pedido</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{kitStats.convertedFromKitQuotes}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Taxa de conversão (kits)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{kitStats.conversionRate.toFixed(1)}%</p>
          <p className="text-xs text-slate-500">Em aberto: {kitStats.openKitQuotes}</p>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por documento, cliente, status ou data"
          className="rounded-md border border-slate-300 px-2 py-2 text-sm sm:col-span-2"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="TODOS">Status: todos</option>
          <option value="ABERTO">Aberto</option>
          <option value="FINALIZADO">Finalizado</option>
          <option value="ENTREGUE">Entregue</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="DATA">Ordenar: data</option>
            <option value="DOCUMENTO">Documento</option>
            <option value="CLIENTE">Cliente</option>
            <option value="STATUS">Status</option>
            <option value="VALOR">Valor</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as typeof sortDir)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="DESC">Desc</option>
            <option value="ASC">Asc</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table className="text-sm">
            <thead>
              <tr>
                <th>Nº DOCUMENTO</th>
                <th>DATA</th>
                <th>CLIENTE</th>
                <th>STATUS</th>
                <th>PENDENTE DE ENTREGA</th>
                <th className="text-right">À VISTA (C/ DESC.)</th>
                <th className="text-right">À PRAZO</th>
                <th className="text-right">ENTRADA</th>
                <th className="text-right">PARCELAS (VALOR)</th>
                <th className="text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const prazo = displayValorPrazo(r)
                const downMethod = parsePaymentMethod(r.down_payment_method ?? r.payment_method)
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-medium">{r.document_number || '—'}</td>
                    <td className="whitespace-nowrap">{r.order_date}</td>
                    <td className="max-w-[14rem] truncate" title={r.client_id ? clientNameById.get(r.client_id) : undefined}>
                      {r.client_id ? clientNameById.get(r.client_id) ?? '—' : '—'}
                    </td>
                    <td>{r.status}</td>
                    <td>{isPendingDelivery(r) ? 'SIM' : '—'}</td>
                    <td className="text-right whitespace-nowrap">{formatBRL(displayValorAvista(r))}</td>
                    <td className="text-right whitespace-nowrap">{prazo != null ? formatBRL(prazo) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      {parsePaymentOption(r.payment_option) === 'A_PRAZO' ? (
                        <span className="inline-flex flex-col items-end">
                          <span>{formatBRL(downVal(r))}</span>
                          <span className="text-[9px] text-slate-500">{PAYMENT_METHOD_LABEL[downMethod]}</span>
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
                            onClick={() => navigate(`/bem-aviv/pedidos/editar/${r.id}`)}
                          >
                            <Pencil size={18} aria-hidden />
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
                            <CheckCircle2 size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canEditPedido(r) ? (
                          <button
                            type="button"
                            className={iconBtn}
                            title="Alterar pedido"
                            aria-label="Alterar pedido"
                            onClick={() => navigate(`/bem-aviv/pedidos/editar/${r.id}`)}
                          >
                            <Pencil size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canCancelPedido(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} border-red-200 text-red-700 hover:bg-red-50`}
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
                            <XCircle size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canConfirmPayment(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}
                            title="Confirmar pagamento"
                            aria-label="Confirmar pagamento"
                            onClick={() =>
                              void updateOrderStatus(
                                r,
                                'FINALIZADO',
                                `CONFIRMAR PAGAMENTO DO PEDIDO ${r.document_number ?? ''}? O STATUS SERÁ FINALIZADO.`,
                              )
                            }
                          >
                            <CircleDollarSign size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canConfirmDelivery(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} border-blue-200 text-blue-700 hover:bg-blue-50`}
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
                            <PackageCheck size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canVerDetalhePedido(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} border-sky-200 text-[#185FA5] hover:bg-sky-50`}
                            title="Ver detalhes do pedido"
                            aria-label="Ver detalhes do pedido"
                            onClick={() => void openPedidoDetailModal(r)}
                          >
                            <Eye size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canReopenPedido(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} border-amber-200 text-amber-700 hover:bg-amber-50`}
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
                            <RotateCcw size={18} aria-hidden />
                          </button>
                        ) : null}
                        {canExcluirDocumento(r) ? (
                          <button
                            type="button"
                            className={`${iconBtn} border-red-200 text-red-700 hover:bg-red-50`}
                            title="Excluir documento"
                            aria-label="Excluir documento"
                            onClick={() => void deleteDocumento(r)}
                          >
                            <Trash2 size={18} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    {typeTab === 'ORCAMENTO'
                      ? 'Nenhum orçamento nesta lista.'
                      : 'Nenhum pedido nesta lista.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {detailModalPedido ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pedido-detail-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePedidoDetailModal()
          }}
        >
          <div
            className="flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 id="pedido-detail-modal-title" className="font-hub text-lg font-semibold text-slate-900 normal-case">
                  Detalhe do pedido
                </h3>
                <p className="mt-0.5 text-sm font-medium text-slate-800">{detailModalPedido.document_number ?? '—'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {detailModalPedido.client_id ? clientNameById.get(detailModalPedido.client_id) ?? '—' : '—'} · Data{' '}
                  {detailModalPedido.order_date} · {detailModalPedido.status}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                onClick={closePedidoDetailModal}
                aria-label="Fechar"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
              <dl className="grid gap-2 border-b border-slate-100 pb-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total líquido</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{formatBRL(netTotal(detailModalPedido))}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Desconto no pedido</dt>
                  <dd className="tabular-nums text-slate-800">{formatBRL(Number(detailModalPedido.discount_total ?? 0))}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Frete</dt>
                  <dd className="tabular-nums text-slate-800">{formatBRL(Number(detailModalPedido.freight_amount ?? 0))}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamento</dt>
                  <dd className="text-slate-800">
                    {parsePaymentOption(detailModalPedido.payment_option) === 'A_PRAZO' ? 'À prazo' : 'À vista'} ·{' '}
                    {PAYMENT_METHOD_LABEL[parsePaymentMethod(detailModalPedido.payment_method)]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parcelas</dt>
                  <dd className="text-slate-800">{detailModalPedido.installments_count ?? 1}x</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parcelas (valor)</dt>
                  <dd className="text-xs text-slate-700">{installmentCell(detailModalPedido)}</dd>
                </div>
              </dl>

              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Itens</p>
              {detailModalLoading ? (
                <p className="mt-2 text-sm text-slate-500">Carregando itens…</p>
              ) : detailModalItems.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nenhum item neste pedido.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2">Descrição</th>
                        <th className="px-3 py-2 text-center">Qtd</th>
                        <th className="px-3 py-2 text-right">Preço un.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailModalItems.map((it) => (
                        <tr key={it.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-slate-800">{it.item_description}</td>
                          <td className="px-3 py-2 text-center tabular-nums text-slate-800">{it.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-800">{formatBRL(it.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                            {formatBRL(it.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailModalPedido.notes ? (
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{detailModalPedido.notes}</p>
                </div>
              ) : null}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={closePedidoDetailModal}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
