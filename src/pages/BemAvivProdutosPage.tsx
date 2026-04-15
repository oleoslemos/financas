import { useUser } from '@clerk/clerk-react'
import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL, formatBRLFromCentsDigits, numberToCentsDigits, parseDigitsCentsToNumber, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

const COMFORT_PLATFORM_CATEGORY = 'PLATAFORMA DE DESCANSO'

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

function rowIsComfort(r: Produto) {
  return r.category === COMFORT_PLATFORM_CATEGORY
}

function rowNameModel(r: Produto) {
  return rowIsComfort(r) ? r.model || r.name : r.name
}

function rowDimsDisplay(r: Produto) {
  return rowIsComfort(r) && r.dim_width_cm != null && r.dim_length_cm != null && r.dim_height_cm != null
    ? formatComfortDims(Number(r.dim_width_cm), Number(r.dim_length_cm), Number(r.dim_height_cm))
    : '—'
}

function rowLineDisplay(r: Produto) {
  return rowIsComfort(r) ? r.product_line || '' : ''
}

/** Chave para ordenar por dimensão física (largura, comprimento, altura em cm). */
function rowDimSortKey(r: Produto): [number, number, number] | null {
  if (!rowIsComfort(r)) return null
  if (r.dim_width_cm == null || r.dim_length_cm == null || r.dim_height_cm == null) return null
  return [Number(r.dim_width_cm), Number(r.dim_length_cm), Number(r.dim_height_cm)]
}

function compareDimKeys(a: [number, number, number] | null, b: [number, number, number] | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
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
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [rows, setRows] = useState<Produto[]>([])
  const [priceTables, setPriceTables] = useState<PriceTableOpt[]>([])
  const [editing, setEditing] = useState<Produto | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('TODOS')
  const [form, setForm] = useState(emptyForm)
  const [duplicateBase, setDuplicateBase] = useState<DuplicateValidationBase | null>(null)
  const [filterNameModel, setFilterNameModel] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [filterDimension, setFilterDimension] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [dimSort, setDimSort] = useState<'none' | 'asc' | 'desc'>('none')
  const formRef = useRef<HTMLFormElement>(null)

  const isComfort = form.category === COMFORT_PLATFORM_CATEGORY

  async function load() {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: products }, { data: tables }] = await Promise.all([
      supabase.from('bem_aviv_products').select('*').eq('user_id', ownerUserId).order('name'),
      supabase.from('bem_aviv_price_tables').select('id, name').eq('user_id', ownerUserId).order('name'),
    ])
    setRows((products as Produto[]) ?? [])
    setPriceTables((tables as PriceTableOpt[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  useEffect(() => {
    if (location.pathname.includes('/plataforma-de-descanso')) setFilterCategory('PLATAFORMA DE DESCANSO')
    else if (location.pathname.includes('/cabeceiras')) setFilterCategory('CABECEIRAS')
    else if (location.pathname.includes('/bases-camas')) setFilterCategory('BASES / CAMAS')
    else if (location.pathname.includes('/acessorios')) setFilterCategory('ACESSÓRIOS')
    else setFilterCategory('TODOS')
  }, [location.pathname])

  const tableNameById = useMemo(() => Object.fromEntries(priceTables.map((t) => [t.id, t.name])), [priceTables])

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
    if (dimSort === 'none') return filtered
    const arr = [...filtered]
    const dir = dimSort === 'asc' ? 1 : -1
    arr.sort((r1, r2) => {
      const cmp = compareDimKeys(rowDimSortKey(r1), rowDimSortKey(r2)) * dir
      if (cmp !== 0) return cmp
      return rowNameModel(r1).localeCompare(rowNameModel(r2), 'pt-BR')
    })
    return arr
  }, [filtered, dimSort])

  function cycleDimSort() {
    setDimSort((s) => (s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none'))
  }

  async function syncPriceTableItem(args: {
    productId: string
    priceTableId: string
    lineDescription: string
    price: number
  }) {
    if (!supabase || !ownerUserId) return
    const { data: existing } = await supabase
      .from('bem_aviv_price_table_items')
      .select('id, price_table_id')
      .eq('product_id', args.productId)
      .maybeSingle()

    const row = existing as PriceTableItemRow | null

    if (row && row.price_table_id === args.priceTableId) {
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

    if (row) {
      const { error: delErr } = await supabase.from('bem_aviv_price_table_items').delete().eq('id', row.id)
      if (delErr) throw new Error(delErr.message)
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
      const currentWidth = isComfort ? parseInt(form.dim_width_cm, 10) : null
      const currentLength = isComfort ? parseInt(form.dim_length_cm, 10) : null
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

        const wasComfort = editing.category === COMFORT_PLATFORM_CATEGORY
        if (wasComfort && !isComfort) {
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

      if (isComfort) {
        const w = Number(payload.dim_width_cm)
        const len = Number(payload.dim_length_cm)
        const h = Number(payload.dim_height_cm)
        const lineDescription = buildComfortPriceLineDescription(
          String(payload.product_line),
          String(payload.model),
          w,
          len,
          h,
        )
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
    const lineOk =
      r.product_line && comfortProductLines.includes(r.product_line as (typeof comfortProductLines)[number])
        ? r.product_line
        : comfortProductLines[0]
    setForm({
      category: r.category,
      name: r.name,
      description: r.description ?? '',
      price: !comfort && r.price != null ? String(r.price) : '',
      product_line: lineOk,
      model: comfort ? (r.model ?? r.name) : '',
      dim_width_cm: r.dim_width_cm != null ? String(r.dim_width_cm) : '',
      dim_length_cm: r.dim_length_cm != null ? String(r.dim_length_cm) : '',
      dim_height_cm: r.dim_height_cm != null ? String(r.dim_height_cm) : '',
      comfortPriceDigits: comfort && r.price != null ? numberToCentsDigits(Number(r.price)) : '',
      price_table_id: r.price_table_id ?? '',
    })
    scrollFormIntoViewSoon()
  }

  function startDuplicate(r: Produto) {
    setShowForm(true)
    setEditing(null)
    const comfort = r.category === COMFORT_PLATFORM_CATEGORY
    const lineOk =
      r.product_line && comfortProductLines.includes(r.product_line as (typeof comfortProductLines)[number])
        ? r.product_line
        : comfortProductLines[0]
    setForm({
      category: r.category,
      name: r.name,
      description: r.description ?? '',
      price: !comfort && r.price != null ? String(r.price) : '',
      product_line: lineOk,
      model: comfort ? (r.model ?? r.name) : '',
      dim_width_cm: r.dim_width_cm != null ? String(r.dim_width_cm) : '',
      dim_length_cm: r.dim_length_cm != null ? String(r.dim_length_cm) : '',
      dim_height_cm: r.dim_height_cm != null ? String(r.dim_height_cm) : '',
      comfortPriceDigits: comfort && r.price != null ? numberToCentsDigits(Number(r.price)) : '',
      price_table_id: r.price_table_id ?? '',
    })
    setDuplicateBase({
      sourceId: r.id,
      sourceNameOrModel: toUpperTrim(comfort ? (r.model ?? r.name) : r.name),
      sourceWidth: r.dim_width_cm != null ? Number(r.dim_width_cm) : null,
      sourceLength: r.dim_length_cm != null ? Number(r.dim_length_cm) : null,
      sourceHeight: r.dim_height_cm != null ? Number(r.dim_height_cm) : null,
    })
    scrollFormIntoViewSoon()
  }

  function openAddProductForm() {
    setEditing(null)
    setDuplicateBase(null)
    setForm(emptyForm())
    setShowForm(true)
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.setTimeout(() => {
        formRef.current?.querySelector<HTMLElement>('select, input')?.focus()
      }, 350)
    })
  }

  function closeProductForm() {
    setEditing(null)
    setDuplicateBase(null)
    setForm(emptyForm())
    setShowForm(false)
  }

  function scrollFormIntoViewSoon() {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-2xl font-semibold">PRODUTOS GERAL</h2>
          <div className="flex flex-wrap gap-2">
            <button className={`btn ${filterCategory === 'TODOS' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCategory('TODOS')} type="button">
              TODOS
            </button>
            {productCategories.map((c) => (
              <button key={c} className={`btn ${filterCategory === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCategory(c)} type="button">
                {c}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary shrink-0 self-start sm:self-auto" type="button" onClick={openAddProductForm}>
          ADICIONAR PRODUTO
        </button>
      </div>

      {showForm && (
      <form ref={formRef} onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-12 sm:gap-4">
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
              <label>DESCRIÇÃO (OPCIONAL)</label>
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
              <label>DESCRIÇÃO</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </>
        )}

        <div className="sm:col-span-12 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit">
            {editing ? 'SALVAR' : duplicateBase ? 'SALVAR DUPLICADO' : 'ADICIONAR'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={closeProductForm}>
            CANCELAR
          </button>
        </div>
      </form>
      )}

      {showForm && priceTables.length === 0 && isComfort && (
        <p className="text-sm text-amber-800">CADASTRE PELO MENOS UMA TABELA DE PREÇO EM GERAL → TABELA DE PREÇO.</p>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-12">
        <div className="sm:col-span-3">
          <label>FILTRAR LINHA</label>
          <input
            type="search"
            placeholder="FILTRAR"
            value={filterLine}
            onChange={(e) => setFilterLine(e.target.value)}
            aria-label="Filtrar por linha"
          />
        </div>
        <div className="sm:col-span-3">
          <label>FILTRAR NOME / MODELO</label>
          <input
            type="search"
            placeholder="FILTRAR"
            value={filterNameModel}
            onChange={(e) => setFilterNameModel(e.target.value)}
            aria-label="Filtrar por nome ou modelo"
          />
        </div>
        <div className="sm:col-span-3">
          <label>FILTRAR DIMENSÃO</label>
          <input
            type="search"
            placeholder="FILTRAR"
            value={filterDimension}
            onChange={(e) => setFilterDimension(e.target.value)}
            aria-label="Filtrar por dimensão"
          />
        </div>
        <div className="sm:col-span-3">
          <label>FILTRAR TABELA</label>
          <input
            type="search"
            placeholder="FILTRAR"
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            aria-label="Filtrar por tabela de preço"
          />
        </div>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>CATEGORIA</th>
                <th>LINHA</th>
                <th>NOME / MODELO</th>
                <th>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left font-medium text-slate-700 hover:bg-slate-200/80"
                    onClick={cycleDimSort}
                    aria-label="Ordenar por dimensão"
                  >
                    DIMENSÃO
                    {dimSort === 'asc' ? <ArrowUp size={14} className="shrink-0 text-sky-700" aria-hidden /> : null}
                    {dimSort === 'desc' ? <ArrowDown size={14} className="shrink-0 text-sky-700" aria-hidden /> : null}
                  </button>
                </th>
                <th>TABELA</th>
                <th>PREÇO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplayed.map((r) => {
                const comfortRow = rowIsComfort(r)
                const dims = rowDimsDisplay(r)
                return (
                  <tr key={r.id}>
                    <td>{r.category}</td>
                    <td>{comfortRow ? r.product_line || '—' : '—'}</td>
                    <td>{rowNameModel(r)}</td>
                    <td>{dims}</td>
                    <td>{r.price_table_id ? tableNameById[r.price_table_id] ?? '—' : '—'}</td>
                    <td>{r.price == null ? '—' : formatBRL(Number(r.price))}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => startEdit(r)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => startDuplicate(r)}>
                          <Copy size={16} />
                        </button>
                        <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                          <Trash2 size={16} />
                        </button>
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
