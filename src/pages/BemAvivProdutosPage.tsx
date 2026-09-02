import { useUser } from '@clerk/clerk-react'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useLocation } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { useSessionState } from '../hooks/useSessionState'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, formatBRLFromCentsDigits, numberToCentsDigits, parseDigitsCentsToNumber, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

const COMFORT_PLATFORM_CATEGORY = 'PLATAFORMA DE DESCANSO'
const BASE_BED_CATEGORY = 'BASES / CAMAS'
const HEADBOARD_CATEGORY = 'CABECEIRAS'
const ACCESSORY_CATEGORY = 'ACESSÓRIOS'

const comfortProductLines = ['SUPER PREMIUM', 'PREMIUM'] as const

type Produto = {
  id: string
  category: string
  name: string
  description: string | null
  price: number | null
  product_line: string | null
  model: string | null
  dim_width_cm: number | null
  dim_length_cm: number | null
  dim_height_cm: number | null
  price_table_id: string | null
}

type PriceTableOpt = { id: string; name: string }

type PriceTableItemRow = { id: string; product_id: string; price_table_id: string }
type DuplicateValidationBase = {
  sourceId: string
  sourceNameOrModel: string
  sourceWidth: number | null
  sourceLength: number | null
  sourceHeight: number | null
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

function formatTwoDecimalsFromDigits(digits: string) {
  if (!digits) return ''
  const n = Number(digits) / 100
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMetersMaskFromCmDigits(digits: string) {
  const base = formatTwoDecimalsFromDigits(digits)
  return base ? `${base}m` : ''
}

function formatCentimetersMaskFromCmDigits(digits: string) {
  const base = formatTwoDecimalsFromDigits(digits)
  return base ? `${base}cm` : ''
}

function formatComfortDims(wCm: number, lCm: number, hCm: number) {
  return `${formatMetersMaskFromCmDigits(String(wCm))} x ${formatMetersMaskFromCmDigits(String(lCm))} x ${formatCentimetersMaskFromCmDigits(String(hCm))}`
}

function formatDimsByCategory(category: string, wCm: number | null, lCm: number | null, hCm: number | null) {
  if (category === COMFORT_PLATFORM_CATEGORY && wCm != null && lCm != null && hCm != null) {
    return formatComfortDims(wCm, lCm, hCm)
  }
  if (category === BASE_BED_CATEGORY && wCm != null && lCm != null) {
    return `${formatMetersMaskFromCmDigits(String(wCm))} x ${formatMetersMaskFromCmDigits(String(lCm))}`
  }
  if (category === HEADBOARD_CATEGORY && wCm != null) {
    return formatMetersMaskFromCmDigits(String(wCm))
  }
  return '—'
}

function rowIsComfort(r: Produto) {
  return r.category === COMFORT_PLATFORM_CATEGORY
}

function rowNameModel(r: Produto) {
  return rowIsComfort(r) ? r.model || r.name : r.name
}

function rowDimsDisplay(r: Produto) {
  const w = r.dim_width_cm != null ? Number(r.dim_width_cm) : null
  const l = r.dim_length_cm != null ? Number(r.dim_length_cm) : null
  const h = r.dim_height_cm != null ? Number(r.dim_height_cm) : null
  return formatDimsByCategory(r.category, w, l, h)
}

function rowLineDisplay(r: Produto) {
  return rowIsComfort(r) ? r.product_line || '' : ''
}

function rowComplementDisplay(r: Produto) {
  const d = r.description?.trim()
  return d ? d : '—'
}

/** Agrupa variantes iguais (caixa, espaços, unicode) nos valores sugeridos dos filtros. */
function addUniqueFilterOption(map: Map<string, string>, raw: string) {
  const trimmed = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (!trimmed) return
  const key = trimmed.toLocaleLowerCase('pt-BR')
  if (map.has(key)) return
  map.set(key, toUpperTrim(trimmed))
}

/** Chave para ordenar por dimensão física (largura, comprimento, altura em cm). */
function rowDimSortKey(r: Produto): [number, number, number] | null {
  const w = r.dim_width_cm != null ? Number(r.dim_width_cm) : null
  const l = r.dim_length_cm != null ? Number(r.dim_length_cm) : null
  const h = r.dim_height_cm != null ? Number(r.dim_height_cm) : null
  if (r.category === COMFORT_PLATFORM_CATEGORY && w != null && l != null && h != null) return [w, l, h]
  if (r.category === BASE_BED_CATEGORY && w != null && l != null) return [w, l, Number.NEGATIVE_INFINITY]
  if (r.category === HEADBOARD_CATEGORY && w != null) return [w, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  return null
}

function compareDimKeys(a: [number, number, number] | null, b: [number, number, number] | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

/** LINHA asc: vazio por último para agrupar produtos com linha definida. */
function compareLineAsc(a: string, b: string): number {
  const ae = !a.trim()
  const be = !b.trim()
  if (ae && be) return 0
  if (ae) return 1
  if (be) return -1
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

const productCategories = [
  'PLATAFORMA DE DESCANSO',
  'CABECEIRAS',
  'BASES / CAMAS',
  'ACESSÓRIOS',
] as const

function buildComfortPriceLineDescription(
  line: string,
  model: string,
  w: number,
  l: number,
  h: number,
): string {
  return `${toUpperTrim(line)} ${toUpperTrim(model)} ${formatComfortDims(w, l, h).toUpperCase()}`
}

function buildSizedPriceLineDescription(args: { category: string; name: string; widthCm: number | null; lengthCm: number | null; heightCm: number | null }) {
  const dims = formatDimsByCategory(args.category, args.widthCm, args.lengthCm, args.heightCm)
  const dimsPart = dims === '—' ? '' : ` ${dims.toUpperCase()}`
  return `${toUpperTrim(args.name)}${dimsPart}`
}

function emptyForm() {
  return {
    category: productCategories[0] as string,
    name: '',
    description: '',
    price: '',
    product_line: comfortProductLines[0] as string,
    model: '',
    dim_width_cm: '',
    dim_length_cm: '',
    dim_height_cm: '',
    comfortPriceDigits: '',
    price_table_id: '',
  }
}

export function BemAvivProdutosPage() {
  const { user } = useUser()
  const location = useLocation()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Produto[]>([])
  const [priceTables, setPriceTables] = useState<PriceTableOpt[]>([])
  const [editing, setEditing] = useState<Produto | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useSessionState<string>('produtos:filterCategory', 'TODOS')
  const [form, setForm] = useState(emptyForm)
  const [duplicateBase, setDuplicateBase] = useState<DuplicateValidationBase | null>(null)
  const [filterNameModel, setFilterNameModel] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [filterDimension, setFilterDimension] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [showForm, setShowForm] = useSessionState<boolean>('produtos:showForm', false)
  const formRef = useRef<HTMLFormElement>(null)

  const isComfort = form.category === COMFORT_PLATFORM_CATEGORY
  const isBaseBed = form.category === BASE_BED_CATEGORY
  const isHeadboard = form.category === HEADBOARD_CATEGORY
  const isAccessory = form.category === ACCESSORY_CATEGORY
  const needsStructuredPrice = isComfort || isBaseBed || isHeadboard || isAccessory

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: products }, { data: tables }] = await Promise.all([
      supabase.from('bem_aviv_products').select('*').eq('user_id', ownerUserId).order('name'),
      supabase.from('bem_aviv_price_tables').select('id, name').eq('user_id', ownerUserId).order('name'),
    ])
    setRows((products as Produto[]) ?? [])
    setPriceTables((tables as PriceTableOpt[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (location.pathname.includes('/plataforma-de-descanso')) setFilterCategory('PLATAFORMA DE DESCANSO')
    else if (location.pathname.includes('/cabeceiras')) setFilterCategory('CABECEIRAS')
    else if (location.pathname.includes('/bases-camas')) setFilterCategory('BASES / CAMAS')
    else if (location.pathname.includes('/acessorios')) setFilterCategory('ACESSÓRIOS')
    else setFilterCategory('TODOS')
  }, [location.pathname])

  const tableNameById = useMemo(() => Object.fromEntries(priceTables.map((t) => [t.id, t.name])), [priceTables])

  const rowsForFilterOptions = useMemo(
    () => rows.filter((r) => (filterCategory === 'TODOS' ? true : r.category === filterCategory)),
    [rows, filterCategory],
  )

  const { filterLineOptions, filterNameModelOptions, filterDimensionOptions, filterTableOptions } = useMemo(() => {
    const lines = new Map<string, string>()
    const names = new Map<string, string>()
    const dimsByCm = new Map<string, string>()
    const tables = new Map<string, string>()
    for (const r of rowsForFilterOptions) {
      addUniqueFilterOption(lines, rowLineDisplay(r))
      addUniqueFilterOption(names, rowNameModel(r))
      const dimLabel = rowDimsDisplay(r)
      if (dimLabel !== '—') addUniqueFilterOption(dimsByCm, dimLabel)
      const tbl = r.price_table_id ? tableNameById[r.price_table_id] ?? '' : ''
      addUniqueFilterOption(tables, tbl)
    }
    const sortPt = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    return {
      filterLineOptions: [...lines.values()].sort(sortPt),
      filterNameModelOptions: [...names.values()].sort(sortPt),
      filterDimensionOptions: [...dimsByCm.values()].sort(sortPt),
      filterTableOptions: [...tables.values()].sort(sortPt),
    }
  }, [rowsForFilterOptions, tableNameById])

  const filtered = useMemo(() => {
    const qName = filterNameModel.trim().toLowerCase()
    const qLine = filterLine.trim().toLowerCase()
    const qDim = filterDimension.trim().toLowerCase()
    const qTable = filterTable.trim().toLowerCase()

    return rows.filter((r) => {
      if (filterCategory !== 'TODOS' && r.category !== filterCategory) return false

      const nameModel = rowNameModel(r).toLowerCase()
      const line = rowLineDisplay(r).toLowerCase()
      const dims = rowDimsDisplay(r).toLowerCase()
      const tableLabel = (r.price_table_id ? tableNameById[r.price_table_id] ?? '' : '').toLowerCase()

      if (qName && !nameModel.includes(qName)) return false
      if (qLine && !line.includes(qLine)) return false
      if (qDim && !dims.includes(qDim)) return false
      if (qTable && !tableLabel.includes(qTable)) return false
      return true
    })
  }, [rows, filterCategory, filterNameModel, filterLine, filterDimension, filterTable, tableNameById])

  const sortedDisplayed = useMemo(() => {
    const arr = [...filtered]
    arr.sort((r1, r2) => {
      let cmp = compareDimKeys(rowDimSortKey(r1), rowDimSortKey(r2))
      if (cmp !== 0) return cmp
      const p1 = r1.price == null ? Number.POSITIVE_INFINITY : Number(r1.price)
      const p2 = r2.price == null ? Number.POSITIVE_INFINITY : Number(r2.price)
      cmp = p1 - p2
      if (cmp !== 0) return cmp
      cmp = rowNameModel(r1).localeCompare(rowNameModel(r2), 'pt-BR', { sensitivity: 'base' })
      if (cmp !== 0) return cmp
      cmp = compareLineAsc(rowLineDisplay(r1), rowLineDisplay(r2))
      if (cmp !== 0) return cmp
      return r1.id.localeCompare(r2.id)
    })
    return arr
  }, [filtered])

  async function syncPriceTableItem(args: {
    productId: string
    priceTableId: string
    lineDescription: string
    price: number
  }) {
    if (!supabase || !ownerUserId) return
    const { data: existing } = await supabase
      .from('bem_aviv_price_table_items')
      .select('id')
      .eq('price_table_id', args.priceTableId)
      .eq('product_id', args.productId)
      .maybeSingle()

    const row = existing as PriceTableItemRow | null

    if (row) {
      const { error } = await supabase
        .from('bem_aviv_price_table_items')
        .update({
          line_description: args.lineDescription,
          price: args.price,
        })
        .eq('id', row.id)
      if (error) throw new Error(error.message)
      return
    }

    const { error: insErr } = await supabase.from('bem_aviv_price_table_items').insert({
      user_id: ownerUserId,
      price_table_id: args.priceTableId,
      product_id: args.productId,
      line_description: args.lineDescription,
      price: args.price,
    })
    if (insErr) throw new Error(insErr.message)
  }

  async function removePriceTableItemForProduct(productId: string) {
    if (!supabase) return
    await supabase.from('bem_aviv_price_table_items').delete().eq('product_id', productId)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return

    let payload: Record<string, unknown>

    if (isComfort) {
      const w = parseInt(form.dim_width_cm, 10)
      const len = parseInt(form.dim_length_cm, 10)
      const h = parseInt(form.dim_height_cm, 10)
      if (!toUpperTrim(form.model)) {
        alert('INFORME O MODELO.')
        return
      }
      if (!Number.isFinite(w) || !Number.isFinite(len) || !Number.isFinite(h) || w <= 0 || len <= 0 || h <= 0) {
        alert('INFORME DIMENSÕES VÁLIDAS (CM).')
        return
      }
      if (!form.price_table_id) {
        alert('SELECIONE A TABELA DE PREÇO.')
        return
      }
      const priceNum = parseDigitsCentsToNumber(form.comfortPriceDigits)
      if (priceNum <= 0) {
        alert('INFORME O VALOR.')
        return
      }
      const modelUpper = toUpperTrim(form.model)
      payload = {
        user_id: ownerUserId,
        category: toUpperTrim(form.category),
        name: modelUpper,
        description: toUpperTrim(form.description) || null,
        price: priceNum,
        product_line: toUpperTrim(form.product_line),
        model: modelUpper,
        dim_width_cm: w,
        dim_length_cm: len,
        dim_height_cm: h,
        price_table_id: form.price_table_id,
      }
    } else if (isBaseBed) {
      const w = parseInt(form.dim_width_cm, 10)
      const len = parseInt(form.dim_length_cm, 10)
      if (!toUpperTrim(form.name)) {
        alert('INFORME O NOME DO PRODUTO.')
        return
      }
      if (!Number.isFinite(w) || !Number.isFinite(len) || w <= 0 || len <= 0) {
        alert('INFORME LARGURA E COMPRIMENTO VÁLIDOS (CM).')
        return
      }
      if (!form.price_table_id) {
        alert('SELECIONE A TABELA DE PREÇO.')
        return
      }
      const priceNum = parseDigitsCentsToNumber(form.comfortPriceDigits)
      if (priceNum <= 0) {
        alert('INFORME O VALOR.')
        return
      }
      payload = {
        user_id: ownerUserId,
        category: toUpperTrim(form.category),
        name: toUpperTrim(form.name),
        description: toUpperTrim(form.description) || null,
        price: priceNum,
        product_line: null,
        model: null,
        dim_width_cm: w,
        dim_length_cm: len,
        dim_height_cm: null,
        price_table_id: form.price_table_id,
      }
    } else if (isHeadboard) {
      const w = parseInt(form.dim_width_cm, 10)
      if (!toUpperTrim(form.name)) {
        alert('INFORME O NOME DO PRODUTO.')
        return
      }
      if (!Number.isFinite(w) || w <= 0) {
        alert('INFORME LARGURA VÁLIDA (CM).')
        return
      }
      if (!form.price_table_id) {
        alert('SELECIONE A TABELA DE PREÇO.')
        return
      }
      const priceNum = parseDigitsCentsToNumber(form.comfortPriceDigits)
      if (priceNum <= 0) {
        alert('INFORME O VALOR.')
        return
      }
      payload = {
        user_id: ownerUserId,
        category: toUpperTrim(form.category),
        name: toUpperTrim(form.name),
        description: toUpperTrim(form.description) || null,
        price: priceNum,
        product_line: null,
        model: null,
        dim_width_cm: w,
        dim_length_cm: null,
        dim_height_cm: null,
        price_table_id: form.price_table_id,
      }
    } else if (isAccessory) {
      if (!toUpperTrim(form.name)) {
        alert('INFORME O NOME DO PRODUTO.')
        return
      }
      if (!form.price_table_id) {
        alert('SELECIONE A TABELA DE PREÇO.')
        return
      }
      const priceNum = parseDigitsCentsToNumber(form.comfortPriceDigits)
      if (priceNum <= 0) {
        alert('INFORME O VALOR.')
        return
      }
      payload = {
        user_id: ownerUserId,
        category: toUpperTrim(form.category),
        name: toUpperTrim(form.name),
        description: toUpperTrim(form.description) || null,
        price: priceNum,
        product_line: null,
        model: null,
        dim_width_cm: null,
        dim_length_cm: null,
        dim_height_cm: null,
        price_table_id: form.price_table_id,
      }
    } else {
      payload = {
        user_id: ownerUserId,
        category: toUpperTrim(form.category),
        name: toUpperTrim(form.name),
        description: toUpperTrim(form.description) || null,
        price: form.price ? parseMoney(form.price) : null,
        product_line: null,
        model: null,
        dim_width_cm: null,
        dim_length_cm: null,
        dim_height_cm: null,
        price_table_id: null,
      }
      if (!toUpperTrim(form.name)) {
        alert('INFORME O NOME DO PRODUTO.')
        return
      }
    }

    if (duplicateBase) {
      const currentNameOrModel = toUpperTrim(isComfort ? form.model : form.name)
      const currentWidth = needsStructuredPrice ? parseInt(form.dim_width_cm, 10) : null
      const currentLength = isComfort || isBaseBed ? parseInt(form.dim_length_cm, 10) : null
      const currentHeight = isComfort ? parseInt(form.dim_height_cm, 10) : null

      const unchanged =
        duplicateBase.sourceNameOrModel === currentNameOrModel &&
        duplicateBase.sourceWidth === (Number.isFinite(currentWidth) ? currentWidth : null) &&
        duplicateBase.sourceLength === (Number.isFinite(currentLength) ? currentLength : null) &&
        duplicateBase.sourceHeight === (Number.isFinite(currentHeight) ? currentHeight : null)

      if (unchanged) {
        alert('AO DUPLICAR, ALTERE NOME/MODELO, LARGURA, COMPRIMENTO OU ALTURA ANTES DE SALVAR.')
        return
      }
    }

    try {
      let productId: string

      if (editing) {
        const { error } = await supabase.from('bem_aviv_products').update(payload).eq('id', editing.id)
        if (error) {
          alert(error.message)
          return
        }
        productId = editing.id

        const wasStructured =
          editing.category === COMFORT_PLATFORM_CATEGORY ||
          editing.category === BASE_BED_CATEGORY ||
          editing.category === HEADBOARD_CATEGORY ||
          editing.category === ACCESSORY_CATEGORY
        if (wasStructured && !needsStructuredPrice) {
          await removePriceTableItemForProduct(productId)
        }
      } else {
        const { data: inserted, error } = await supabase.from('bem_aviv_products').insert(payload).select('id').single()
        if (error) {
          alert(error.message)
          return
        }
        productId = (inserted as { id: string }).id
      }

      if (needsStructuredPrice) {
        let lineDescription = ''
        if (isComfort) {
          const w = Number(payload.dim_width_cm)
          const len = Number(payload.dim_length_cm)
          const h = Number(payload.dim_height_cm)
          lineDescription = buildComfortPriceLineDescription(
            String(payload.product_line),
            String(payload.model),
            w,
            len,
            h,
          )
        } else {
          lineDescription = buildSizedPriceLineDescription({
            category: String(payload.category),
            name: String(payload.name),
            widthCm: payload.dim_width_cm == null ? null : Number(payload.dim_width_cm),
            lengthCm: payload.dim_length_cm == null ? null : Number(payload.dim_length_cm),
            heightCm: payload.dim_height_cm == null ? null : Number(payload.dim_height_cm),
          })
        }
        await syncPriceTableItem({
          productId,
          priceTableId: form.price_table_id,
          lineDescription,
          price: Number(payload.price),
        })
      }

      setEditing(null)
      setDuplicateBase(null)
      setForm(emptyForm())
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ERRO AO SINCRONIZAR TABELA DE PREÇO.')
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR PRODUTO?')) return
    const { error } = await supabase.from('bem_aviv_products').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  function startEdit(r: Produto) {
    setShowForm(true)
    setEditing(r)
    setDuplicateBase(null)
    const comfort = r.category === COMFORT_PLATFORM_CATEGORY
    const structured =
      r.category === COMFORT_PLATFORM_CATEGORY ||
      r.category === BASE_BED_CATEGORY ||
      r.category === HEADBOARD_CATEGORY ||
      r.category === ACCESSORY_CATEGORY
    const lineOk =
      r.product_line && comfortProductLines.includes(r.product_line as (typeof comfortProductLines)[number])
        ? r.product_line
        : comfortProductLines[0]
    setForm({
      category: r.category,
      name: r.name,
      description: r.description ?? '',
      price: !structured && r.price != null ? String(r.price) : '',
      product_line: lineOk,
      model: comfort ? (r.model ?? r.name) : '',
      dim_width_cm: r.dim_width_cm != null ? String(r.dim_width_cm) : '',
      dim_length_cm: r.dim_length_cm != null ? String(r.dim_length_cm) : '',
      dim_height_cm: r.dim_height_cm != null ? String(r.dim_height_cm) : '',
      comfortPriceDigits: structured && r.price != null ? numberToCentsDigits(Number(r.price)) : '',
      price_table_id: r.price_table_id ?? '',
    })
  }

  function startDuplicate(r: Produto) {
    setShowForm(true)
    setEditing(null)
    const comfort = r.category === COMFORT_PLATFORM_CATEGORY
    const structured =
      r.category === COMFORT_PLATFORM_CATEGORY ||
      r.category === BASE_BED_CATEGORY ||
      r.category === HEADBOARD_CATEGORY ||
      r.category === ACCESSORY_CATEGORY
    const lineOk =
      r.product_line && comfortProductLines.includes(r.product_line as (typeof comfortProductLines)[number])
        ? r.product_line
        : comfortProductLines[0]
    setForm({
      category: r.category,
      name: r.name,
      description: r.description ?? '',
      price: !structured && r.price != null ? String(r.price) : '',
      product_line: lineOk,
      model: comfort ? (r.model ?? r.name) : '',
      dim_width_cm: r.dim_width_cm != null ? String(r.dim_width_cm) : '',
      dim_length_cm: r.dim_length_cm != null ? String(r.dim_length_cm) : '',
      dim_height_cm: r.dim_height_cm != null ? String(r.dim_height_cm) : '',
      comfortPriceDigits: structured && r.price != null ? numberToCentsDigits(Number(r.price)) : '',
      price_table_id: r.price_table_id ?? '',
    })
    setDuplicateBase({
      sourceId: r.id,
      sourceNameOrModel: toUpperTrim(comfort ? (r.model ?? r.name) : r.name),
      sourceWidth: r.dim_width_cm != null ? Number(r.dim_width_cm) : null,
      sourceLength: r.dim_length_cm != null ? Number(r.dim_length_cm) : null,
      sourceHeight: r.dim_height_cm != null ? Number(r.dim_height_cm) : null,
    })
  }

  function openAddProductForm() {
    setEditing(null)
    setDuplicateBase(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  function closeProductForm() {
    setEditing(null)
    setDuplicateBase(null)
    setForm(emptyForm())
    setShowForm(false)
  }

  useEffect(() => {
    if (!showForm) return
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('select, input')?.focus()
    }, 20)
  }, [showForm])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-2xl font-semibold">PRODUTOS GERAL</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant={filterCategory === 'TODOS' ? 'primary' : 'secondary'} onClick={() => setFilterCategory('TODOS')} type="button">
              TODOS
            </Button>
            {productCategories.map((c) => (
              <Button key={c} variant={filterCategory === c ? 'primary' : 'secondary'} onClick={() => setFilterCategory(c)} type="button">
                {c}
              </Button>
            ))}
          </div>
        </div>
        <Button variant="primary" className="shrink-0 self-start sm:self-auto" type="button" onClick={openAddProductForm}>
          ADICIONAR PRODUTO
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:p-4">
            <form ref={formRef} onSubmit={submit} className="grid gap-3 sm:grid-cols-12 sm:gap-4">
              <div className="sm:col-span-12 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  {editing ? 'EDITAR PRODUTO' : duplicateBase ? 'DUPLICAR PRODUTO' : 'ADICIONAR PRODUTO'}
                </h3>
                <Button variant="secondary" type="button" onClick={closeProductForm}>
                  FECHAR
                </Button>
              </div>

              <div className="sm:col-span-4">
                <label>CATEGORIA</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {productCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {isComfort ? (
                <>
                  <div className="sm:col-span-4">
                    <label>LINHA</label>
                    <select value={form.product_line} onChange={(e) => setForm({ ...form, product_line: e.target.value })}>
                      {comfortProductLines.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label>TABELA DE PREÇO</label>
                    <select
                      required
                      value={form.price_table_id}
                      onChange={(e) => setForm({ ...form, price_table_id: e.target.value })}
                    >
                      <option value="">— SELECIONE —</option>
                      {priceTables.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label>LARGURA</label>
                    <input
                      inputMode="numeric"
                      required
                      placeholder="0,78m"
                      value={formatMetersMaskFromCmDigits(form.dim_width_cm)}
                      onChange={(e) => setForm({ ...form, dim_width_cm: onlyDigits(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label>COMPRIMENTO</label>
                    <input
                      inputMode="numeric"
                      required
                      placeholder="1,88m"
                      value={formatMetersMaskFromCmDigits(form.dim_length_cm)}
                      onChange={(e) => setForm({ ...form, dim_length_cm: onlyDigits(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label>ALTURA</label>
                    <input
                      inputMode="numeric"
                      required
                      placeholder="0,41cm"
                      value={formatCentimetersMaskFromCmDigits(form.dim_height_cm)}
                      onChange={(e) => setForm({ ...form, dim_height_cm: onlyDigits(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label>VALOR</label>
                    <input
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      required
                      value={formatBRLFromCentsDigits(form.comfortPriceDigits)}
                      onChange={(e) => setForm({ ...form, comfortPriceDigits: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div className="sm:col-span-6">
                    <label>MODELO</label>
                    <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                  </div>
                  <div className="sm:col-span-6">
                    <label>COMPLEMENTO</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </>
              ) : isBaseBed ? (
                <>
                  <div className="sm:col-span-4">
                    <label>TABELA DE PREÇO</label>
                    <select
                      required
                      value={form.price_table_id}
                      onChange={(e) => setForm({ ...form, price_table_id: e.target.value })}
                    >
                      <option value="">— SELECIONE —</option>
                      {priceTables.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label>LARGURA</label>
                    <input
                      inputMode="numeric"
                      required
                      placeholder="1,28m"
                      value={formatMetersMaskFromCmDigits(form.dim_width_cm)}
                      onChange={(e) => setForm({ ...form, dim_width_cm: onlyDigits(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label>COMPRIMENTO</label>
                    <input
                      inputMode="numeric"
                      required
                      placeholder="1,88m"
                      value={formatMetersMaskFromCmDigits(form.dim_length_cm)}
                      onChange={(e) => setForm({ ...form, dim_length_cm: onlyDigits(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label>VALOR</label>
                    <input
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      required
                      value={formatBRLFromCentsDigits(form.comfortPriceDigits)}
                      onChange={(e) => setForm({ ...form, comfortPriceDigits: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label>NOME DO PRODUTO</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-12">
                    <label>COMPLEMENTO</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </>
              ) : isHeadboard ? (
                <>
                  <div className="sm:col-span-4">
                    <label>TABELA DE PREÇO</label>
                    <select
                      required
                      value={form.price_table_id}
                      onChange={(e) => setForm({ ...form, price_table_id: e.target.value })}
                    >
                      <option value="">— SELECIONE —</option>
                      {priceTables.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label>LARGURA</label>
                    <input
                      inputMode="numeric"
                      required
                      placeholder="1,28m"
                      value={formatMetersMaskFromCmDigits(form.dim_width_cm)}
                      onChange={(e) => setForm({ ...form, dim_width_cm: onlyDigits(e.target.value) })}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label>VALOR</label>
                    <input
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      required
                      value={formatBRLFromCentsDigits(form.comfortPriceDigits)}
                      onChange={(e) => setForm({ ...form, comfortPriceDigits: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div className="sm:col-span-12">
                    <label>NOME DO PRODUTO</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-12">
                    <label>COMPLEMENTO</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </>
              ) : isAccessory ? (
                <>
                  <div className="sm:col-span-4">
                    <label>TABELA DE PREÇO</label>
                    <select
                      required
                      value={form.price_table_id}
                      onChange={(e) => setForm({ ...form, price_table_id: e.target.value })}
                    >
                      <option value="">— SELECIONE —</option>
                      {priceTables.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label>VALOR</label>
                    <input
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      required
                      value={formatBRLFromCentsDigits(form.comfortPriceDigits)}
                      onChange={(e) => setForm({ ...form, comfortPriceDigits: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div className="sm:col-span-12">
                    <label>NOME DO PRODUTO</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-12">
                    <label>COMPLEMENTO</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </>
              ) : (
                <>
                  <div className="sm:col-span-4">
                    <label>PREÇO</label>
                    <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  </div>
                  <div className="sm:col-span-8">
                    <label>NOME DO PRODUTO</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-12">
                    <label>COMPLEMENTO</label>
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </>
              )}

              {priceTables.length === 0 && needsStructuredPrice && (
                <p className="sm:col-span-12 text-sm text-amber-800">CADASTRE PELO MENOS UMA TABELA DE PREÇO EM GERAL → TABELA DE PREÇO GOLD.</p>
              )}

              <div className="sm:col-span-12 flex flex-wrap gap-2">
                <Button variant="primary" type="submit">
                  {editing ? 'SALVAR' : duplicateBase ? 'SALVAR DUPLICADO' : 'ADICIONAR'}
                </Button>
                <Button variant="secondary" type="button" onClick={closeProductForm}>
                  CANCELAR
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-12">
        <div className="sm:col-span-3">
          <label htmlFor="bem-aviv-filter-line">FILTRAR LINHA</label>
          <input
            id="bem-aviv-filter-line"
            type="text"
            list={filterLine.trim() ? 'bem-aviv-filter-line-dl' : undefined}
            placeholder="DIGITE OU SELECIONE"
            value={filterLine}
            onChange={(e) => setFilterLine(e.target.value)}
            autoComplete="off"
            aria-label="Filtrar por linha"
          />
          <datalist id="bem-aviv-filter-line-dl">
            {filterLineOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="bem-aviv-filter-name">FILTRAR NOME / MODELO</label>
          <input
            id="bem-aviv-filter-name"
            type="text"
            list={filterNameModel.trim() ? 'bem-aviv-filter-name-dl' : undefined}
            placeholder="DIGITE OU SELECIONE"
            value={filterNameModel}
            onChange={(e) => setFilterNameModel(e.target.value)}
            autoComplete="off"
            aria-label="Filtrar por nome ou modelo"
          />
          <datalist id="bem-aviv-filter-name-dl">
            {filterNameModelOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="bem-aviv-filter-dim">FILTRAR DIMENSÃO</label>
          <input
            id="bem-aviv-filter-dim"
            type="text"
            list={filterDimension.trim() ? 'bem-aviv-filter-dim-dl' : undefined}
            placeholder="DIGITE OU SELECIONE"
            value={filterDimension}
            onChange={(e) => setFilterDimension(e.target.value)}
            autoComplete="off"
            aria-label="Filtrar por dimensão"
          />
          <datalist id="bem-aviv-filter-dim-dl">
            {filterDimensionOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="bem-aviv-filter-table">FILTRAR TABELA</label>
          <input
            id="bem-aviv-filter-table"
            type="text"
            list={filterTable.trim() ? 'bem-aviv-filter-table-dl' : undefined}
            placeholder="DIGITE OU SELECIONE"
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            autoComplete="off"
            aria-label="Filtrar por tabela de preço"
          />
          <datalist id="bem-aviv-filter-table-dl">
            {filterTableOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>NOME / MODELO</th>
                <th>COMPLEMENTO</th>
                <th>DIMENSÃO</th>
                <th>TABELA</th>
                <th>PREÇO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplayed.map((r) => {
                const dims = rowDimsDisplay(r)
                return (
                  <tr key={r.id}>
                    <td>{rowNameModel(r)}</td>
                    <td>{rowComplementDisplay(r)}</td>
                    <td>{dims}</td>
                    <td>{r.price_table_id ? tableNameById[r.price_table_id] ?? '—' : '—'}</td>
                    <td>{r.price == null ? '—' : formatBRL(Number(r.price))}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          className="inline-flex h-8 items-center gap-1 px-2 text-xs text-slate-700"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil size={13} />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="inline-flex h-8 items-center gap-1 px-2 text-xs text-slate-700"
                          onClick={() => startDuplicate(r)}
                        >
                          <Copy size={13} />
                          Duplicar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="inline-flex h-8 items-center gap-1 px-2 text-xs text-red-700"
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 size={13} />
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
