import { useUser } from '@clerk/clerk-react'
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Home,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { SearchableSelect } from '../components/ui/SearchableSelect'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { normalizePayload, type OfferProduct, type OfferVariation } from '../lib/bemAvivOfferProduct'
import { type PedidosListFilters } from '../lib/bemAvivPedidosFilters'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { cn } from '../lib/cn'
import { resolveDataOwnerId } from '../lib/dataOwner'
import {
  formatBRL,
  formatBRLFromCentsDigits,
  formatPercentFromDigits,
  handleCentsMaskKeyDown,
  numberToCentsDigits,
  onlyDigits,
  parseDigitsCentsToNumber,
  parseMoney,
} from '../lib/format'
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

type OfferPriceTableRow = { id: string; name: string; is_default: boolean }

type OfferPriceTableItemRow = {
  price_table_id: string
  offer_product_id: string
  variation_code: string
  price: number
}

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

function moneyDigitsFromNumber(n: number) {
  return numberToCentsDigits(clampMoney(n))
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

/** Preço da linha na tabela selecionada; se não houver linha na tabela, usa o valor base do catálogo. */
function resolveTableUnitPrice(
  tableId: string,
  productId: string,
  variationCode: string,
  fallback: number,
  lookup: Map<string, number>,
): number {
  const k = `${tableId}:${productId}:${variationCode}`
  const p = lookup.get(k)
  if (p != null && Number.isFinite(p) && p > 0) return p
  return fallback
}

function inferPriceTableForOrderItems(
  tables: OfferPriceTableRow[],
  productIdsByTable: Map<string, Set<string>>,
  productIds: string[],
): string | null {
  if (tables.length === 0) return null
  const uniq = [...new Set(productIds)]
  if (uniq.length === 0) return tables.find((t) => t.is_default)?.id ?? tables[0]?.id ?? null

  const matching: string[] = []
  for (const t of tables) {
    const set = productIdsByTable.get(t.id)
    if (!set) continue
    if (uniq.every((id) => set.has(id))) matching.push(t.id)
  }
  if (matching.length === 1) return matching[0]
  if (matching.length > 1) {
    const def = tables.find((t) => t.is_default && matching.includes(t.id))
    if (def) return def.id
    return matching[0]
  }
  return tables.find((t) => t.is_default)?.id ?? tables[0]?.id ?? null
}

function clampOrderDiscountPercent(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(-999, Math.min(100, Math.round(n * 1e6) / 1e6))
}

/** Percentual mascarado (dígitos) ou texto legado ao carregar documentos antigos. */
function parseOrderDiscountPercent(raw: string) {
  const digits = onlyDigits(raw ?? '')
  if (digits) return clampOrderDiscountPercent(parseDigitsCentsToNumber(digits))
  const cleaned = (raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/%/g, '')
    .trim()
  return clampOrderDiscountPercent(parseMoney(cleaned === '' ? '0' : cleaned))
}

type NovoPedidoNavState = {
  document_type?: 'ORCAMENTO' | 'PEDIDO'
  bemAvivPedidosReturnFilters?: PedidosListFilters
}

function pedidosListReturnState(
  documentType: 'ORCAMENTO' | 'PEDIDO',
  locationState: unknown,
): { bemAvivPedidosTab: 'ORCAMENTO' | 'PEDIDO'; bemAvivPedidosFilters?: PedidosListFilters } {
  const st = locationState as NovoPedidoNavState | null
  return {
    bemAvivPedidosTab: documentType,
    bemAvivPedidosFilters: st?.bemAvivPedidosReturnFilters,
  }
}

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
  other_expenses?: number | null
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
  return numberToCentsDigits(clampOrderDiscountPercent(n))
}

type OrderStep = 'dados' | 'produtos' | 'pagamento' | 'revisao'

interface LocalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onValueChange: (val: string) => void
}

function LocalInput({ value, onValueChange, className, ...props }: LocalInputProps) {
  const [localVal, setLocalVal] = useState(value)

  useEffect(() => {
    setLocalVal(value)
  }, [value])

  const handleBlur = () => {
    if (localVal !== value) {
      onValueChange(localVal)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
    props.onKeyDown?.(e)
  }

  return (
    <input
      {...props}
      className={className}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
}

function MoneyMaskedInput({ value, onValueChange, className, ...props }: LocalInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleCentsMaskKeyDown(e, value, onValueChange)
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
    props.onKeyDown?.(e)
  }

  return (
    <input
      {...props}
      className={className}
      inputMode="numeric"
      placeholder="R$ 0,00"
      value={formatBRLFromCentsDigits(value)}
      onChange={(e) => {
        const next = onlyDigits(e.target.value)
        if (next !== value) onValueChange(next)
      }}
      onKeyDown={handleKeyDown}
    />
  )
}

function PercentMaskedInput({ value, onValueChange, className, ...props }: LocalInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleCentsMaskKeyDown(e, value, onValueChange)
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
    props.onKeyDown?.(e)
  }

  return (
    <input
      {...props}
      className={className}
      inputMode="numeric"
      placeholder="0,00%"
      value={formatPercentFromDigits(value)}
      onChange={(e) => {
        const next = onlyDigits(e.target.value)
        if (next !== value) onValueChange(next)
      }}
      onKeyDown={handleKeyDown}
    />
  )
}

interface OrderItemRowProps {
  item: LinhaItem
  rowNet: number
  netPrice: number
  hasDiscountOrDownPayment: boolean
  onRemove: () => void
  onUpdateQty: (qty: number) => void
  onUpdateUnitPrice: (price: number) => void
}

function OrderItemRow({
  item,
  rowNet,
  netPrice,
  hasDiscountOrDownPayment,
  onRemove,
  onUpdateQty,
  onUpdateUnitPrice,
}: OrderItemRowProps) {
  const [localQty, setLocalQty] = useState(String(item.quantity))
  const [localPriceDigits, setLocalPriceDigits] = useState(moneyDigitsFromNumber(item.unit_price))

  useEffect(() => {
    setLocalQty(String(item.quantity))
  }, [item.quantity])

  useEffect(() => {
    setLocalPriceDigits(moneyDigitsFromNumber(item.unit_price))
  }, [item.unit_price])

  const handleQtyBlur = () => {
    const qty = Math.max(1, parseInt(localQty.replace(/\D/g, ''), 10) || 1)
    onUpdateQty(qty)
    setLocalQty(String(qty))
  }

  const handlePriceBlur = () => {
    const u = clampMoney(parseDigitsCentsToNumber(localPriceDigits))
    if (!Number.isFinite(u) || u <= 0) {
      setLocalPriceDigits(moneyDigitsFromNumber(item.unit_price))
      return
    }
    onUpdateUnitPrice(u)
    setLocalPriceDigits(moneyDigitsFromNumber(u))
  }

  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleCentsMaskKeyDown(e, localPriceDigits, setLocalPriceDigits)
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  return (
    <div className="np-item-row" role="row">
      <div>
        <div className="np-item-name">{item.name}</div>
        <div className="np-item-var">
          {item.kind === 'KIT' ? 'Kit' : 'Catálogo'}
          {hasDiscountOrDownPayment
            ? ` · Bruto ${formatBRL(rowNet)} · Líquido ${formatBRL(netPrice)}`
            : ''}
        </div>
      </div>
      <input
        className="np-input"
        inputMode="numeric"
        value={localQty}
        onChange={(e) => setLocalQty(e.target.value)}
        onBlur={handleQtyBlur}
        onKeyDown={handleKeyDown}
        aria-label={`Quantidade ${item.name}`}
      />
      <input
        className="np-input np-price"
        inputMode="numeric"
        placeholder="R$ 0,00"
        value={formatBRLFromCentsDigits(localPriceDigits)}
        onChange={(e) => {
          const next = onlyDigits(e.target.value)
          if (next !== localPriceDigits) setLocalPriceDigits(next)
        }}
        onBlur={handlePriceBlur}
        onKeyDown={handlePriceKeyDown}
        aria-label={`Preço unitário ${item.name}`}
      />
      <span className="np-cell-r tabular-nums">{formatBRL(netPrice)}</span>
      <button
        type="button"
        className="np-btn-remove"
        aria-label="Remover"
        onClick={onRemove}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </div>
  )
}


interface ProductSelectorProps {
  catalogForTable: OfferProduct[]
  selectedPriceTableId: string
  priceLookup: Map<string, number>
  onAdd: (product: OfferProduct, variationCode: string, qty: number) => void
}

function ProductSelector({
  catalogForTable,
  selectedPriceTableId,
  priceLookup,
  onAdd,
}: ProductSelectorProps) {
  const [draftProductName, setDraftProductName] = useState('')
  const [draftProductType, setDraftProductType] = useState('')
  const [draftVariationCode, setDraftVariationCode] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [productQuery, setProductQuery] = useState('')
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!comboRef.current?.contains(e.target as Node)) setComboOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const prevPriceTableRef = useRef(selectedPriceTableId)
  useEffect(() => {
    if (prevPriceTableRef.current !== selectedPriceTableId) {
      prevPriceTableRef.current = selectedPriceTableId
      setDraftProductName('')
      setDraftProductType('')
      setDraftVariationCode('')
      setProductQuery('')
      setDraftQty('1')
    }
  }, [selectedPriceTableId])

  const uniqueProductNames = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const p of catalogForTable) {
      const name = (p.name ?? '').trim()
      if (!name) continue
      const key = normalizeTextKey(name)
      if (!byKey.has(key)) byKey.set(key, name)
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  }, [catalogForTable])

  const productSuggestions = useMemo(() => {
    const q = normalizeTextKey(productQuery)
    if (!q) return uniqueProductNames.slice(0, 12)
    return uniqueProductNames.filter((n) => normalizeTextKey(n).includes(q)).slice(0, 12)
  }, [productQuery, uniqueProductNames])

  const productTypeOptions = useMemo(() => {
    if (!draftProductName) return [] as string[]
    const types = new Set<string>()
    const selectedNameKey = normalizeTextKey(draftProductName)
    for (const p of catalogForTable) {
      if (normalizeTextKey(p.name) !== selectedNameKey) continue
      types.add((p.product_type ?? '').trim() || '—')
    }
    return [...types].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  }, [catalogForTable, draftProductName])

  const selectedOffer = useMemo(
    () =>
      catalogForTable.find((p) => {
        if (normalizeTextKey(p.name) !== normalizeTextKey(draftProductName)) return false
        const t = (p.product_type ?? '').trim() || '—'
        return t === draftProductType
      }) ?? null,
    [draftProductName, draftProductType, catalogForTable],
  )

  const variationOptions = useMemo(() => {
    if (!selectedOffer || !selectedPriceTableId) return [] as OfferVariation[]
    const vars = normalizePayload(selectedOffer.payload).variations ?? []
    return vars.map((v) => ({
      ...v,
      price: resolveTableUnitPrice(selectedPriceTableId, selectedOffer.id, v.code, v.price, priceLookup),
    }))
  }, [selectedOffer, selectedPriceTableId, priceLookup])

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
    if (productTypeOptions.length === 1) {
      setDraftProductType(productTypeOptions[0])
    }
  }, [productTypeOptions])

  useEffect(() => {
    setDraftVariationCode('')
  }, [draftProductType])

  useEffect(() => {
    if (variationOptions.length === 1) {
      setDraftVariationCode(variationOptions[0].code)
    }
  }, [variationOptions])

  const handleAdd = () => {
    if (!selectedPriceTableId) {
      alert('SELECIONE UMA TABELA DE PREÇO.')
      return
    }
    const p = selectedOffer
    if (!p) {
      alert('SELECIONE PRODUTO E TIPO DO CATÁLOGO.')
      return
    }
    const qty = Math.max(1, parseInt(draftQty.replace(/\D/g, ''), 10) || 1)
    const vars = variationOptions
    const v = vars.find((x) => x.code === draftVariationCode)
    if (vars.length > 0 && !v) {
      alert('SELECIONE A VARIAÇÃO (CÓDIGO / DIMENSÕES).')
      return
    }
    onAdd(p, draftVariationCode, qty)
    setDraftProductName('')
    setDraftProductType('')
    setDraftVariationCode('')
    setDraftQty('1')
    setProductQuery('')
  }

  return (
    <>
      <div ref={comboRef} className="np-search-wrap">
        <div className="np-search-inner">
          <Search size={14} aria-hidden />
          <input
            type="text"
            className="np-input"
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value)
              setComboOpen(true)
            }}
            onFocus={() => setComboOpen(true)}
            placeholder="Buscar por nome, linha ou tipo…"
            autoComplete="off"
            disabled={!selectedPriceTableId || catalogForTable.length === 0}
            aria-label="Buscar produto"
          />
          {comboOpen && productSuggestions.length > 0 ? (
            <ul
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--np-border)] bg-white py-1 shadow-lg"
              role="listbox"
            >
              {productSuggestions.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--np-bg)]"
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
        <button type="button" className="np-btn-primary shrink-0" onClick={handleAdd}>
          <Plus size={14} aria-hidden />
          Adicionar
        </button>
      </div>

      <div className="np-row-4">
        <div className="np-field np-searchable">
          <label className="np-label">Produto</label>
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
        <div className="np-field np-searchable">
          <label className="np-label">Tipo</label>
          <SearchableSelect
            value={draftProductType}
            onChange={setDraftProductType}
            options={typeSelectOptions}
            placeholder="—"
            disabled={!draftProductName}
            aria-label="Tipo"
          />
        </div>
        <div className="np-field np-searchable">
          <label className="np-label">Variação</label>
          <SearchableSelect
            value={draftVariationCode}
            onChange={setDraftVariationCode}
            options={variationSelectOptions}
            placeholder="—"
            disabled={!selectedOffer || variationOptions.length === 0}
            aria-label="Variação"
          />
        </div>
        <div className="np-field">
          <label className="np-label">Quantidade</label>
          <div className="np-qty-wrap">
            <button
              type="button"
              aria-label="Diminuir"
              onClick={() =>
                setDraftQty(String(Math.max(1, (parseInt(draftQty, 10) || 1) - 1)))
              }
            >
              <Minus size={14} aria-hidden />
            </button>
            <input
              inputMode="numeric"
              value={draftQty}
              onChange={(e) => setDraftQty(e.target.value)}
              aria-label="Quantidade"
            />
            <button
              type="button"
              aria-label="Aumentar"
              onClick={() =>
                setDraftQty(String(Math.max(1, (parseInt(draftQty, 10) || 1) + 1)))
              }
            >
              <Plus size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function BemAvivNovoPedidoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const navigate = useNavigate()
  const location = useLocation()
  const { activeCompanyId, activeCompany } = useCompany()
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
  const [deletingDocument, setDeletingDocument] = useState(false)

  const [priceTables, setPriceTables] = useState<OfferPriceTableRow[]>([])
  const [tableItems, setTableItems] = useState<OfferPriceTableItemRow[]>([])
  const [selectedPriceTableId, setSelectedPriceTableId] = useState('')
  const editTableInferredRef = useRef(false)

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
      other_expenses: '',
    }
  })

  const [lineItems, setLineItems] = useState<LinhaItem[]>([])
  const [liquidTotalDigits, setLiquidTotalDigits] = useState('')
  const [discountFixedAmount, setDiscountFixedAmount] = useState<number | null>(null)

  const pedidosReturnLinkState = useMemo(
    () => pedidosListReturnState(form.document_type, location.state),
    [form.document_type, location.state],
  )

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId || !activeCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: cl }, { data: offers }, { data: tbls }] = await Promise.all([
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name')
        .eq('company_id', activeCompanyId)
        .order('full_name'),
      supabase
        .from('bem_aviv_offer_products')
        .select('id, name, category, product_line, product_type, pricing_mode, price_table_id, payload')
        .eq('user_id', ownerUserId)
        .order('name'),
      supabase.from('bem_aviv_offer_price_tables').select('id, name, is_default').eq('user_id', ownerUserId).order('name'),
    ])

    const tablesList = ((tbls ?? []) as OfferPriceTableRow[]) ?? []
    setPriceTables(tablesList)

    const tableIds = tablesList.map((t) => t.id)
    let tiRows: OfferPriceTableItemRow[] = []
    if (tableIds.length > 0) {
      const { data: ti } = await supabase
        .from('bem_aviv_offer_price_table_items')
        .select('price_table_id, offer_product_id, variation_code, price')
        .in('price_table_id', tableIds)
      tiRows =
        ((ti ?? []) as Array<{
          price_table_id: string
          offer_product_id: string
          variation_code: string
          price: number | string
        }>).map((r) => ({
          price_table_id: r.price_table_id,
          offer_product_id: r.offer_product_id,
          variation_code: r.variation_code,
          price: Number(r.price),
        })) ?? []
    }
    setTableItems(tiRows)

    const defaultTableId = tablesList.find((t) => t.is_default)?.id ?? tablesList[0]?.id ?? ''
    setSelectedPriceTableId(defaultTableId)

    setClients((cl as ClienteOpt[]) ?? [])
    setOfferProducts(((offers ?? []) as OfferProduct[]).map((r) => ({ ...r, payload: normalizePayload(r.payload) })))
    setLoading(false)
  }, [ownerUserId, supabase, activeCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    editTableInferredRef.current = false
  }, [editOrderId])

  const productIdsByTable = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const it of tableItems) {
      if (!m.has(it.price_table_id)) m.set(it.price_table_id, new Set())
      m.get(it.price_table_id)!.add(it.offer_product_id)
    }
    return m
  }, [tableItems])

  const priceLookup = useMemo(() => {
    const mm = new Map<string, number>()
    for (const it of tableItems) {
      mm.set(`${it.price_table_id}:${it.offer_product_id}:${it.variation_code}`, Number(it.price))
    }
    return mm
  }, [tableItems])

  const catalogForTable = useMemo(() => {
    if (!selectedPriceTableId) return [] as OfferProduct[]
    const allowed = productIdsByTable.get(selectedPriceTableId)
    if (!allowed || allowed.size === 0) return [] as OfferProduct[]
    return offerProducts.filter((p) => allowed.has(p.id))
  }, [offerProducts, productIdsByTable, selectedPriceTableId])

  useEffect(() => {
    if (!isEditMode || orderBootstrapping || lineItems.length === 0 || priceTables.length === 0) return
    if (editTableInferredRef.current) return
    const ids = [...new Set(lineItems.map((l) => l.offer_product_id))]
    const inferred = inferPriceTableForOrderItems(priceTables, productIdsByTable, ids)
    editTableInferredRef.current = true
    if (inferred) setSelectedPriceTableId(inferred)
  }, [isEditMode, orderBootstrapping, lineItems, priceTables, productIdsByTable])

  useEffect(() => {
    if (!editOrderId || !supabase || !ownerUserId || !activeCompanyId) {
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
          'id, client_id, order_date, document_type, document_number, converted_order_id, status, total_amount, notes, discount_total, installments_count, payment_option, payment_method, down_payment_amount, down_payment_method, freight_amount, other_expenses',
        )
        .eq('id', editOrderId)
        .eq('company_id', activeCompanyId)
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
            ? moneyDigitsFromNumber(Number(quote.down_payment_amount))
            : '',
        down_payment_method: parsePaymentMethodNav(quote.down_payment_method ?? quote.payment_method),
        freight_amount:
          quote.freight_amount != null && Number(quote.freight_amount) > 0
            ? moneyDigitsFromNumber(Number(quote.freight_amount))
            : '',
        other_expenses:
          quote.other_expenses != null && Number(quote.other_expenses) > 0
            ? moneyDigitsFromNumber(Number(quote.other_expenses))
            : '',
      })
      setLineItems(mapped)
      setDiscountFixedAmount(quoteDiscountAmount > 0 ? quoteDiscountAmount : null)
      setLoadedDocumentLabel(quote.document_number ?? quote.id)
      setOrderBootstrapping(false)
    })()

    return () => {
      cancelled = true
    }
  }, [editOrderId, supabase, ownerUserId, loading, activeCompanyId])

  const sumLinesNet = useMemo(
    () => lineItems.reduce((acc, l) => acc + l.quantity * l.unit_price, 0),
    [lineItems],
  )

  const installmentsNum = useMemo(
    () => Math.min(120, Math.max(1, parseInt(form.installments_count.replace(/\D/g, ''), 10) || 1)),
    [form.installments_count],
  )

  const downPaymentNum = useMemo(
    () => clampMoney(parseDigitsCentsToNumber(form.down_payment || '')),
    [form.down_payment],
  )
  const freightAmountNum = useMemo(
    () => clampMoney(parseDigitsCentsToNumber(form.freight_amount || '')),
    [form.freight_amount],
  )
  const otherExpensesNum = useMemo(
    () => clampMoney(parseDigitsCentsToNumber(form.other_expenses || '')),
    [form.other_expenses],
  )
  const linesGrossTotal = sumLinesNet
  const downPaymentApplied = downPaymentNum

  const orderDiscount = useMemo(() => {
    if (discountFixedAmount !== null) return discountFixedAmount
    const base = lineItems.length > 0 ? linesGrossTotal : 0
    const p = parseOrderDiscountPercent(form.discount_percent)
    return roundMoneySigned((base * p) / 100)
  }, [lineItems.length, linesGrossTotal, form.discount_percent, discountFixedAmount])

  const previewOrderTotal = useMemo(() => {
    if (lineItems.length === 0) return null
    const net = clampMoney(sumLinesNet - orderDiscount + freightAmountNum + otherExpensesNum)
    return clampMoney(net - downPaymentApplied)
  }, [lineItems.length, sumLinesNet, orderDiscount, freightAmountNum, otherExpensesNum, downPaymentApplied])

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
      setLiquidTotalDigits('')
      return
    }
    const entrada = downPaymentNum
    const net = clampMoney(sumLinesNet - orderDiscount + freightAmountNum + otherExpensesNum - entrada)
    setLiquidTotalDigits(moneyDigitsFromNumber(net))
  }, [
    lineItems.length,
    sumLinesNet,
    freightAmountNum,
    otherExpensesNum,
    downPaymentNum,
    orderDiscount,
  ])

  const applyLiquidRawToDiscount = useCallback((raw: string) => {
    if (lineItems.length === 0 || sumLinesNet <= 0) return
    const targetLiquid = clampMoney(parseDigitsCentsToNumber(raw))
    if (targetLiquid < 0) return
    const G = sumLinesNet
    const F = freightAmountNum
    const O = otherExpensesNum
    const entrada = downPaymentNum
    const discNeeded = roundMoneySigned(G + F + O - entrada - targetLiquid)
    if (discNeeded > G + 0.000_001) {
      alert('Valor líquido alvo é inválido para os itens e encargos atuais.')
      return
    }
    if (discNeeded >= -0.000_001) {
      const p = G > 0 ? (discNeeded / G) * 100 : 0
      setDiscountFixedAmount(discNeeded)
      setForm((f) => ({
        ...f,
        discount_percent: formatDiscountPercentInput(p),
      }))
      setLiquidTotalDigits(moneyDigitsFromNumber(targetLiquid))
      return
    }
    const newOther = roundMoneySigned(targetLiquid - G - F + entrada)
    if (newOther < -0.000_001) {
      alert('Não foi possível ajustar com outras despesas e desconto zerado.')
      return
    }
    setDiscountFixedAmount(null)
    setForm((f) => ({
      ...f,
      discount_percent: '',
      other_expenses: newOther > 0 ? moneyDigitsFromNumber(newOther) : '',
    }))
    setLiquidTotalDigits(moneyDigitsFromNumber(targetLiquid))
  }, [lineItems.length, sumLinesNet, freightAmountNum, otherExpensesNum, downPaymentNum, setDiscountFixedAmount])

  const handleAddProductLine = useCallback((p: OfferProduct, variationCode: string, qty: number) => {
    const vars = normalizePayload(p.payload).variations ?? []
    const v = vars.find((x) => x.code === variationCode)
    if (!v) return

    const unit = resolveTableUnitPrice(selectedPriceTableId, p.id, variationCode, v.price, priceLookup)
    if (!Number.isFinite(unit) || unit <= 0) {
      alert('PREÇO INVÁLIDO NO CATÁLOGO.')
      return
    }

    if (p.pricing_mode === 'KIT') {
      const payload = normalizePayload(p.payload)
      const kitLines = payload.kit_lines ?? []
      if (kitLines.length === 0) {
        alert('ESTE KIT NÃO TEM ITENS VÁLIDOS NO CADASTRO.')
        return
      }

      if (form.document_type === 'ORCAMENTO') {
        const dimPart = v.dimensions ? ` — ${v.dimensions}` : ''
        const descName = `${p.name} [${v.code}]${dimPart}`
        setLineItems((prev) => [
          ...prev,
          {
            key: newLineKey(),
            kind: 'KIT',
            offer_product_id: p.id,
            variation_code: v.code,
            name: descName,
            unit_price: unit,
            quantity: qty,
          },
        ])
        setDiscountFixedAmount(null)
        return
      }

      const byId = new Map(catalogForTable.map((x) => [x.id, x]))
      const exploded: LinhaItem[] = []
      for (const kl of kitLines) {
        const comp = byId.get(kl.offer_product_id)
        const varsComp = normalizePayload(comp?.payload ?? {}).variations ?? []
        const vRaw = varsComp.find((x) => x.code === kl.variation_code)
        if (!comp || !vRaw) {
          alert(
            `KIT COM ITEM INVÁLIDO (${comp?.name ?? 'PRODUTO REMOVIDO'}). VERIFIQUE SE O COMPONENTE ESTÁ NESTA TABELA DE PREÇO OU AJUSTE O CADASTRO DO KIT.`,
          )
          return
        }
        const compUnit = resolveTableUnitPrice(selectedPriceTableId, comp.id, kl.variation_code, vRaw.price, priceLookup)
        if (!Number.isFinite(compUnit) || compUnit <= 0) {
          alert(
            `KIT COM ITEM INVÁLIDO (${comp?.name ?? 'PRODUTO REMOVIDO'}). ABRA O CADASTRO DO KIT EM PRODUTOS (CATÁLOGO) E CORRIJA.`,
          )
          return
        }
        const lineQty = kl.quantity * qty
        const dimPart = vRaw.dimensions ? ` — ${vRaw.dimensions}` : ''
        const descName = `${comp.name} [${vRaw.code}]${dimPart} — parte do kit «${p.name}» (kit ×${qty})`
        exploded.push({
          key: newLineKey(),
          kind: 'PRODUCT',
          offer_product_id: comp.id,
          variation_code: vRaw.code,
          name: descName,
          unit_price: compUnit,
          quantity: lineQty,
        })
      }
      setLineItems((prev) => [...prev, ...exploded])
      setDiscountFixedAmount(null)
      return
    }

    const dimPart = v.dimensions ? ` — ${v.dimensions}` : ''
    const descName = `${p.name} [${v.code}]${dimPart}`
    setLineItems((prev) => [
      ...prev,
      {
        key: newLineKey(),
        kind: 'PRODUCT',
        offer_product_id: p.id,
        variation_code: v.code,
        name: descName,
        unit_price: unit,
        quantity: qty,
      },
    ])
    setDiscountFixedAmount(null)
  }, [selectedPriceTableId, priceLookup, form.document_type, catalogForTable, setDiscountFixedAmount])

  const removeLine = useCallback((key: string) => {
    setLineItems((prev) => prev.filter((l) => l.key !== key))
    setDiscountFixedAmount(null)
  }, [setDiscountFixedAmount])

  const handleUpdateLineQty = useCallback((key: string, qty: number) => {
    setLineItems((prev) => prev.map((l) => (l.key !== key ? l : { ...l, quantity: qty })))
    setDiscountFixedAmount(null)
  }, [setDiscountFixedAmount])

  const handleUpdateLineUnitPrice = useCallback((key: string, price: number) => {
    setLineItems((prev) => prev.map((l) => (l.key !== key ? l : { ...l, unit_price: price })))
    setDiscountFixedAmount(null)
  }, [setDiscountFixedAmount])

  async function deleteCurrentDocument() {
    if (!supabase || !ownerUserId || !activeCompanyId || !editOrderId || !isEditMode || deletingDocument) return
    if (
      !confirm(
        `EXCLUIR DEFINITIVAMENTE ${loadedDocumentLabel ?? 'ESTE DOCUMENTO'}?\n\nOs itens vinculados também serão removidos. Esta ação não pode ser desfeita.`,
      )
    ) {
      return
    }
    setDeletingDocument(true)
    const { error } = await supabase
      .from('bem_aviv_sales_orders')
      .delete()
      .eq('id', editOrderId)
      .eq('company_id', activeCompanyId)
    setDeletingDocument(false)
    if (error) {
      alert(error.message)
      return
    }
    navigate('/bem-aviv/pedidos', { state: pedidosReturnLinkState })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !activeCompanyId) return
    if (submitLockRef.current) return
    if (lineItems.length === 0) {
      alert('ADICIONE PELO MENOS UM ITEM OU USE A LISTAGEM DE PEDIDOS PARA VALOR MANUAL.')
      return
    }
    submitLockRef.current = true
    try {
      const entrada = downPaymentNum
      const discOrder = roundMoneySigned(orderDiscount)
      const inst = installmentsNum
      const totalInsert = clampMoney(sumLinesNet - discOrder + freightAmountNum + otherExpensesNum)

      const netCheck = roundMoneySigned(sumLinesNet - discOrder + freightAmountNum + otherExpensesNum - entrada)
      if (netCheck < -0.005) {
        alert('DESCONTO NO PEDIDO É MAIOR QUE A SOMA DOS ITENS + FRETE + OUTRAS DESPESAS.')
        return
      }
      const totalBruto = linesGrossTotal + freightAmountNum + otherExpensesNum
      if (entrada > totalBruto + 0.000_001) {
        alert('ENTRADA NÃO PODE SER MAIOR QUE O TOTAL DO PEDIDO (ITENS + FRETE + OUTRAS DESPESAS APÓS DESCONTOS).')
        return
      }

      const headerPayload = {
        user_id: ownerUserId,
        company_id: activeCompanyId,
        client_id: form.client_id || null,
        order_date: form.order_date,
        document_type: form.document_type,
        status: toUpperTrim(form.status),
        discount_total: discOrder,
        installments_count: inst,
        notes: toUpperTrim(form.notes) || null,
        payment_option: form.payment_option,
        payment_method: form.payment_method,
        down_payment_amount: entrada > 0 ? entrada : null,
        down_payment_method: entrada > 0 ? form.down_payment_method : null,
        freight_amount: freightAmountNum,
        other_expenses: otherExpensesNum > 0 ? otherExpensesNum : null,
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
          other_expenses: headerPayload.other_expenses,
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
          .eq('company_id', activeCompanyId)

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
          total_price: clampMoney(l.quantity * l.unit_price),
        }))

        const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
        if (itemsErr) {
          alert(itemsErr.message)
          return
        }

        navigate('/bem-aviv/pedidos', { state: pedidosReturnLinkState })
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
        total_price: clampMoney(l.quantity * l.unit_price),
      }))

      const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
      if (itemsErr) {
        alert(itemsErr.message)
        return
      }

      navigate('/bem-aviv/pedidos', { state: pedidosReturnLinkState })
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
        downPaymentApplied <= clampMoney(sumLinesNet - orderDiscount + freightAmountNum + otherExpensesNum),
    }),
    [
      form.client_id,
      lineItems.length,
      form.order_date,
      installmentsNum,
      downPaymentApplied,
      sumLinesNet,
      orderDiscount,
      freightAmountNum,
      otherExpensesNum,
    ],
  )
  const checklistOk = Object.values(checklist).every(Boolean)

  const [activeStep, setActiveStep] = useState<OrderStep>('produtos')
  const stepDadosDone = checklist.hasClient && checklist.hasOrderDate
  const stepProdutosDone = checklist.hasItems
  const stepPagamentoDone = checklist.hasValidInstallments && checklist.hasValidDownPayment
  const companyBadge = activeCompany?.trade_name ?? 'Bem Aviv'

  function scrollToStep(step: OrderStep) {
    setActiveStep(step)
    const id =
      step === 'dados' ? 'np-sec-dados' : step === 'produtos' ? 'np-sec-produtos' : step === 'pagamento' ? 'np-sec-pagamento' : 'np-sec-revisao'
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function tabClass(step: OrderStep, done: boolean) {
    if (activeStep === step) return 'np-tab active'
    if (done) return 'np-tab done'
    return 'np-tab'
  }

  return (
    <div className="bem-aviv-novo-pedido bem-aviv-novo-pedido-shell normal-case">
      {!supabase || !ownerUserId ? (
        <p className="col-span-full p-6 text-sm text-slate-600">Conectando…</p>
      ) : loading || orderBootstrapping ? (
        <p className="col-span-full p-6 text-sm text-slate-500">
          {orderBootstrapping ? 'Carregando documento…' : 'Carregando catálogo…'}
        </p>
      ) : orderLoadError ? (
        <div className="col-span-full m-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {orderLoadError}
        </div>
      ) : (
        <form onSubmit={submit} className="contents">
          <header className="np-topbar">
            <Link to="/bem-aviv/pedidos" state={pedidosReturnLinkState} className="np-back-btn" title="Voltar" aria-label="Voltar">
              <ChevronLeft size={16} aria-hidden />
            </Link>
            <span className="np-page-title">{isEditMode ? 'Editar pedido' : 'Novo pedido'}</span>
            {isEditMode && loadedDocumentLabel ? (
              <span className="text-xs text-[var(--np-faint)]">({loadedDocumentLabel})</span>
            ) : null}
            <span className="np-badge">
              <Home size={10} aria-hidden />
              {companyBadge}
            </span>
            <nav className="np-breadcrumb" aria-label="Navegação">
              <span>Hub</span>
              <ChevronRight size={10} aria-hidden />
              <Link to="/bem-aviv/pedidos" state={pedidosReturnLinkState} className="hover:text-[var(--np-text)]">
                Pedidos e orçamentos
              </Link>
              <ChevronRight size={10} aria-hidden />
              <span className="current">{isEditMode ? 'Editar' : 'Novo'}</span>
            </nav>
            {isEditMode ? (
              <button
                type="button"
                onClick={() => void deleteCurrentDocument()}
                disabled={deletingDocument}
                className="ml-2 text-xs text-[var(--np-faint)] hover:text-red-600 disabled:opacity-50"
                title="Excluir documento"
              >
                <Trash2 size={13} className="inline" /> {deletingDocument ? 'Excluindo…' : 'Excluir'}
              </button>
            ) : null}
          </header>

          <nav className="np-progress" aria-label="Progresso do pedido">
            <button type="button" className={tabClass('dados', stepDadosDone)} onClick={() => scrollToStep('dados')}>
              <span className="np-tab-num">{stepDadosDone ? <Check size={10} strokeWidth={3} /> : '1'}</span>
              Dados gerais
            </button>
            <button type="button" className={tabClass('produtos', stepProdutosDone)} onClick={() => scrollToStep('produtos')}>
              <span className="np-tab-num">{stepProdutosDone ? <Check size={10} strokeWidth={3} /> : '2'}</span>
              Produtos
            </button>
            <button type="button" className={tabClass('pagamento', stepPagamentoDone)} onClick={() => scrollToStep('pagamento')}>
              <span className="np-tab-num">{stepPagamentoDone ? <Check size={10} strokeWidth={3} /> : '3'}</span>
              Pagamento
            </button>
            <button type="button" className={tabClass('revisao', checklistOk)} onClick={() => scrollToStep('revisao')}>
              <span className="np-tab-num">{checklistOk ? <Check size={10} strokeWidth={3} /> : '4'}</span>
              Revisão
            </button>
          </nav>

          <main className="np-main">
            <section id="np-sec-dados" className="np-section" aria-labelledby="np-lbl-dados">
              <div className="np-section-header">
                <div className="np-section-icon np-icon-blue">
                  <ClipboardList size={15} aria-hidden />
                </div>
                <span className="np-section-label" id="np-lbl-dados">
                  Dados do pedido
                </span>
                <span className="np-section-sub">Obrigatório</span>
              </div>
              <div className="np-section-body">
                <div className="np-field">
                  <label className="np-label" htmlFor="np-cliente">
                    Cliente <span className="np-req">*</span>
                  </label>
                  <select
                    id="np-cliente"
                    className="np-select"
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  >
                    <option value="">— Selecione um cliente —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="np-row-cols-3">
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-data">
                      Data <span className="np-req">*</span>
                    </label>
                    <input
                      id="np-data"
                      type="date"
                      className="np-input"
                      value={form.order_date}
                      onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-tipo">
                      Tipo
                    </label>
                    <select
                      id="np-tipo"
                      className="np-select"
                      value={form.document_type}
                      onChange={(e) => setForm({ ...form, document_type: e.target.value as 'ORCAMENTO' | 'PEDIDO' })}
                    >
                      <option value="PEDIDO">Pedido</option>
                      <option value="ORCAMENTO">Orçamento</option>
                    </select>
                  </div>
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-obs">
                      Observações
                    </label>
                    <LocalInput
                      id="np-obs"
                      type="text"
                      className="np-input"
                      value={form.notes}
                      onValueChange={(val) => setForm((f) => ({ ...f, notes: val }))}
                      placeholder="Ex.: entrega expressa"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section id="np-sec-produtos" className="np-section" aria-labelledby="np-lbl-produtos">
              <div className="np-section-header">
                <div className="np-section-icon np-icon-green">
                  <Package size={15} aria-hidden />
                </div>
                <span className="np-section-label" id="np-lbl-produtos">
                  Produtos e kits
                </span>
                <span className="np-section-sub">
                  {lineItems.length} {lineItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <div className="np-section-body">
                <div className="np-field">
                  <label className="np-label" htmlFor="np-tabela">
                    Tabela de preço
                  </label>
                  <select
                    id="np-tabela"
                    className="np-select"
                    value={selectedPriceTableId}
                    onChange={(e) => setSelectedPriceTableId(e.target.value)}
                    disabled={priceTables.length === 0}
                  >
                    {priceTables.length === 0 ? (
                      <option value="">— Nenhuma tabela —</option>
                    ) : (
                      priceTables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.is_default ? ' (padrão)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <ProductSelector
                  catalogForTable={catalogForTable}
                  selectedPriceTableId={selectedPriceTableId}
                  priceLookup={priceLookup}
                  onAdd={handleAddProductLine}
                />

                <p className="np-hint">
                  Produtos em modo <strong>kit</strong> geram uma linha por item do catálogo, com quantidade = (qtd do kit) × (qtd de
                  cada item no kit).
                </p>

                {offerProducts.length === 0 ? (
                  <p className="text-xs text-amber-800">
                    Nenhum produto no catálogo.{' '}
                    <Link className="font-medium underline" to="/bem-aviv/produtos-catalogo">
                      Cadastre em Produtos (catálogo)
                    </Link>
                    .
                  </p>
                ) : catalogForTable.length === 0 && selectedPriceTableId ? (
                  <p className="text-xs text-amber-800">
                    Nenhum produto vinculado a esta tabela.{' '}
                    <Link className="font-medium underline" to="/bem-aviv/tabela-preco-catalogo">
                      Tabela de vendas
                    </Link>
                    .
                  </p>
                ) : null}

                <div className="np-items-wrap">
                  <div className="np-items-head" role="row">
                    <span>Item</span>
                    <span>Qtd</span>
                    <span>Preço un.</span>
                    <span>Total</span>
                    <span />
                  </div>
                  {lineItems.length === 0 ? (
                    <div className="np-empty-items">Nenhum item ainda — busque e adicione produtos acima</div>
                  ) : (
                    lineItems.map((l) => {
                      const rowNet = clampMoney(l.quantity * l.unit_price)
                      const netPrice = lineNetByKey[l.key] ?? rowNet
                      const hasDiscountOrDownPayment = (lineOrderDiscountByKey[l.key] ?? 0) > 0 || downPaymentApplied > 0
                      return (
                        <OrderItemRow
                          key={l.key}
                          item={l}
                          rowNet={rowNet}
                          netPrice={netPrice}
                          hasDiscountOrDownPayment={hasDiscountOrDownPayment}
                          onRemove={() => removeLine(l.key)}
                          onUpdateQty={(qty) => handleUpdateLineQty(l.key, qty)}
                          onUpdateUnitPrice={(price) => handleUpdateLineUnitPrice(l.key, price)}
                        />
                      )
                    })
                  )}
                </div>
              </div>
            </section>

            <section id="np-sec-pagamento" className="np-section" aria-labelledby="np-lbl-pag">
              <div className="np-section-header">
                <div className="np-section-icon np-icon-purple">
                  <CircleDollarSign size={15} aria-hidden />
                </div>
                <span className="np-section-label" id="np-lbl-pag">
                  Pagamento e frete
                </span>
              </div>
              <div className="np-section-body">
                <div className="np-field">
                  <span className="np-label">Forma de pagamento</span>
                  <div className="np-pay-opts" role="group" aria-label="Forma de pagamento">
                    <button
                      type="button"
                      className={cn('np-pay-opt', form.payment_option === 'A_VISTA' && 'sel')}
                      onClick={() => setForm((f) => ({ ...f, payment_option: 'A_VISTA' }))}
                    >
                      <Banknote size={20} aria-hidden />
                      <span>À vista</span>
                    </button>
                    <button
                      type="button"
                      className={cn('np-pay-opt', form.payment_option === 'A_PRAZO' && 'sel')}
                      onClick={() => setForm((f) => ({ ...f, payment_option: 'A_PRAZO' }))}
                    >
                      <CreditCard size={20} aria-hidden />
                      <span>À prazo</span>
                    </button>
                  </div>
                </div>

                <div className="np-row-3">
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-meio">
                      Meio
                    </label>
                    <select
                      id="np-meio"
                      className="np-select"
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
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-parcelas">
                      Parcelas
                    </label>
                    <LocalInput
                      id="np-parcelas"
                      className="np-input"
                      inputMode="numeric"
                      min={1}
                      value={form.installments_count}
                      onValueChange={(val) => setForm((f) => ({ ...f, installments_count: val }))}
                    />
                  </div>
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-frete">
                      Frete (R$)
                    </label>
                    <MoneyMaskedInput
                      id="np-frete"
                      className="np-input"
                      value={form.freight_amount}
                      onValueChange={(val) => {
                        setForm((f) => ({ ...f, freight_amount: val }))
                        setDiscountFixedAmount(null)
                      }}
                    />
                  </div>
                </div>

                <div className="np-row-2">
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-entrada">
                      Entrada (R$)
                    </label>
                    <MoneyMaskedInput
                      id="np-entrada"
                      className="np-input"
                      value={form.down_payment}
                      onValueChange={(val) => {
                        setForm((f) => ({ ...f, down_payment: val }))
                        setDiscountFixedAmount(null)
                      }}
                    />
                  </div>
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-meio-entrada">
                      Meio da entrada
                    </label>
                    <select
                      id="np-meio-entrada"
                      className="np-select"
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
                </div>

                <div className="np-divider" />

                <div className="np-row-2">
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-despesas">
                      Outras despesas (R$)
                    </label>
                    <MoneyMaskedInput
                      id="np-despesas"
                      className="np-input"
                      value={form.other_expenses}
                      onValueChange={(val) => {
                        setForm((f) => ({ ...f, other_expenses: val }))
                        setDiscountFixedAmount(null)
                      }}
                    />
                  </div>
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-desconto">
                      Desconto no pedido (%)
                    </label>
                    <PercentMaskedInput
                      id="np-desconto"
                      className="np-input"
                      value={form.discount_percent}
                      onValueChange={(val) => {
                        setForm((f) => ({ ...f, discount_percent: val }))
                        setDiscountFixedAmount(null)
                      }}
                    />
                  </div>
                </div>

                {lineItems.length > 0 ? (
                  <div className="np-field">
                    <label className="np-label" htmlFor="np-liquido">
                      Valor líquido (ajuste fino)
                    </label>
                    <MoneyMaskedInput
                      id="np-liquido"
                      className="np-input"
                      value={liquidTotalDigits}
                      onValueChange={applyLiquidRawToDiscount}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          </main>

          <aside id="np-sec-revisao" className="np-sidebar" aria-label="Resumo do pedido">
            <div className="np-sidebar-head">
              <ClipboardList size={15} aria-hidden />
              Resumo do pedido
            </div>
            <div className="np-sidebar-body">
              <div className="np-sum-lines">
                <div className="np-sum-line">
                  <span className="lbl">Subtotal (itens)</span>
                  <span className="val tabular-nums">{formatBRL(linesGrossTotal)}</span>
                </div>
                <div className="np-sum-line disc">
                  <span className="lbl">Desconto</span>
                  <span className="val tabular-nums">− {formatBRL(discountDisplay)}</span>
                </div>
                {downPaymentApplied > 0 ? (
                  <div className="np-sum-line disc">
                    <span className="lbl">Entrada</span>
                    <span className="val tabular-nums">− {formatBRL(downPaymentApplied)}</span>
                  </div>
                ) : null}
                <div className="np-sum-line">
                  <span className="lbl">Frete</span>
                  <span className="val tabular-nums">{formatBRL(freightAmountNum)}</span>
                </div>
                <div className="np-sum-line">
                  <span className="lbl">Outras despesas</span>
                  <span className="val tabular-nums">{formatBRL(otherExpensesNum)}</span>
                </div>
                <div className="np-sum-total">
                  <span className="lbl">Total</span>
                  <span className="val tabular-nums">
                    {lineItems.length > 0
                      ? formatBRL(
                          clampMoney(
                            sumLinesNet - orderDiscount + freightAmountNum + otherExpensesNum - downPaymentApplied,
                          ),
                        )
                      : '—'}
                  </span>
                </div>
                {previewOrderTotal != null && installmentsNum > 1 ? (
                  <p className="text-xs text-[var(--np-muted)]">
                    {installmentsNum}x de {formatBRL(previewOrderTotal / installmentsNum)}
                  </p>
                ) : null}
              </div>

              <div className="np-checklist-section">
                <div className="np-checklist-label">Checklist pré-finalização</div>
                <div className="np-checklist-box">
                  <div className={cn('np-cl-item', checklist.hasClient && 'ok')}>
                    {checklist.hasClient ? <Check size={15} /> : <Circle size={15} />}
                    Cliente selecionado
                  </div>
                  <div className={cn('np-cl-item', checklist.hasItems && 'ok')}>
                    {checklist.hasItems ? <Check size={15} /> : <Circle size={15} />}
                    Itens adicionados
                  </div>
                  <div className={cn('np-cl-item', checklist.hasOrderDate && 'ok')}>
                    {checklist.hasOrderDate ? <Check size={15} /> : <Circle size={15} />}
                    Data do pedido
                  </div>
                  <div className={cn('np-cl-item', checklist.hasValidInstallments && 'ok')}>
                    {checklist.hasValidInstallments ? <Check size={15} /> : <Circle size={15} />}
                    Parcelas válidas
                  </div>
                  <div className={cn('np-cl-item', checklist.hasValidDownPayment && 'ok')}>
                    {checklist.hasValidDownPayment ? <Check size={15} /> : <Circle size={15} />}
                    Entrada compatível
                  </div>
                </div>

                <button type="submit" className="np-btn-fin" disabled={!checklistOk}>
                  <Check size={15} aria-hidden />
                  {isEditMode
                    ? 'Salvar alterações'
                    : `Finalizar ${form.document_type === 'ORCAMENTO' ? 'orçamento' : 'pedido'}`}
                </button>
                <button type="button" className="np-btn-pdf" disabled>
                  Gerar PDF (em breve)
                </button>
              </div>
            </div>
          </aside>
        </form>
      )}
    </div>
  )
}
