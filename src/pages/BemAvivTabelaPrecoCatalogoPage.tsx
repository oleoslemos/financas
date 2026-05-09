import { useUser } from '@clerk/clerk-react'
import { Copy, Eye, Pencil, Plus, RefreshCw, Star, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { FormDialog } from '../components/ui/FormDialog'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseMoney } from '../lib/format'
import { normalizePayload, type OfferProduct } from '../lib/bemAvivOfferProduct'
import { toUpperTrim } from '../lib/text'

type PriceTable = { id: string; name: string; description: string | null; is_default: boolean }
type PriceTableItem = {
  id: string
  price_table_id: string
  offer_product_id: string
  variation_code: string
  line_description: string
  price: number
}

type GradeModalState = {
  tableId: string
  productId: string
  productName: string
  items: PriceTableItem[]
  editable: boolean
} | null

type ProductCopyModalState = {
  sourceTableId: string
  sourceTableName: string
  productId: string
  productName: string
  items: PriceTableItem[]
} | null

function normalizeSearchText(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function nextCopyName(baseName: string, existingNames: string[]) {
  const used = new Set(existingNames)
  const normalized = `${baseName} CÓPIA`
  if (!used.has(normalized)) return normalized
  let n = 2
  while (used.has(`${baseName} CÓPIA ${n}`)) n += 1
  return `${baseName} CÓPIA ${n}`
}

export function BemAvivTabelaPrecoCatalogoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<PriceTable[]>([])
  const [items, setItems] = useState<PriceTableItem[]>([])
  const [products, setProducts] = useState<OfferProduct[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [gradeModal, setGradeModal] = useState<GradeModalState>(null)
  const [gradePriceDraft, setGradePriceDraft] = useState<Record<string, string>>({})
  const [tableEdit, setTableEdit] = useState<PriceTable | null>(null)
  const [tableEditName, setTableEditName] = useState('')
  const [tableEditDesc, setTableEditDesc] = useState('')
  const [singlePriceEdit, setSinglePriceEdit] = useState<PriceTableItem | null>(null)
  const [singlePriceDraft, setSinglePriceDraft] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [productCopyModal, setProductCopyModal] = useState<ProductCopyModalState>(null)
  const [copyTargetTableId, setCopyTargetTableId] = useState('')
  const [addTableModalOpen, setAddTableModalOpen] = useState(false)

  const itemsByTableId = useMemo(() => {
    const m = new Map<string, PriceTableItem[]>()
    for (const it of items) {
      const list = m.get(it.price_table_id) ?? []
      list.push(it)
      m.set(it.price_table_id, list)
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.line_description.localeCompare(b.line_description, 'pt-BR'))
    }
    return m
  }, [items])

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    const [{ data, error }, { data: itemRows, error: itemError }, { data: productRows, error: productError }] = await Promise.all([
      supabase.from('bem_aviv_offer_price_tables').select('id, name, description, is_default').eq('user_id', ownerUserId).order('name'),
      supabase
        .from('bem_aviv_offer_price_table_items')
        .select('id, price_table_id, offer_product_id, variation_code, line_description, price')
        .eq('user_id', ownerUserId),
      supabase
        .from('bem_aviv_offer_products')
        .select('id, name, category, product_line, product_type, pricing_mode, price_table_id, payload')
        .eq('user_id', ownerUserId),
    ])
    if (error || itemError || productError) {
      alert((error ?? itemError ?? productError)?.message)
      return
    }
    setRows((data as PriceTable[]) ?? [])
    setItems((itemRows as PriceTableItem[]) ?? [])
    setProducts(((productRows ?? []) as OfferProduct[]).map((r) => ({ ...r, payload: normalizePayload(r.payload) })))
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  function resetNewTableForm() {
    setName('')
    setDescription('')
    setIsDefault(false)
  }

  async function saveNewTable() {
    if (!supabase || !ownerUserId) return
    const normalizedName = toUpperTrim(name)
    if (!normalizedName) {
      alert('INFORME O NOME.')
      return
    }

    if (isDefault) {
      await supabase.from('bem_aviv_offer_price_tables').update({ is_default: false }).eq('user_id', ownerUserId)
    }

    const { error } = await supabase.from('bem_aviv_offer_price_tables').insert({
      user_id: ownerUserId,
      name: normalizedName,
      description: toUpperTrim(description) || null,
      is_default: isDefault,
    })
    if (error) {
      alert(error.message)
      return
    }

    resetNewTableForm()
    setAddTableModalOpen(false)
    await load()
  }

  async function setAsDefault(id: string) {
    if (!supabase || !ownerUserId) return
    await supabase.from('bem_aviv_offer_price_tables').update({ is_default: false }).eq('user_id', ownerUserId)
    const { error } = await supabase.from('bem_aviv_offer_price_tables').update({ is_default: true }).eq('id', id).eq('user_id', ownerUserId)
    if (error) alert(error.message)
    else await load()
  }

  function openTableEdit(row: PriceTable) {
    setTableEdit(row)
    setTableEditName(row.name)
    setTableEditDesc(row.description ?? '')
  }

  async function saveTableEdit() {
    if (!supabase || !tableEdit) return
    const normalized = toUpperTrim(tableEditName)
    if (!normalized) {
      alert('NOME INVÁLIDO.')
      return
    }
    const { error } = await supabase
      .from('bem_aviv_offer_price_tables')
      .update({ name: normalized, description: toUpperTrim(tableEditDesc) || null })
      .eq('id', tableEdit.id)
    if (error) alert(error.message)
    else {
      setTableEdit(null)
      await load()
    }
  }

  async function duplicateTable(tableId: string) {
    if (!supabase || !ownerUserId) return
    const source = rows.find((r) => r.id === tableId)
    if (!source) return
    const cloneName = nextCopyName(source.name, rows.map((r) => r.name))
    const { data: inserted, error } = await supabase
      .from('bem_aviv_offer_price_tables')
      .insert({
        user_id: ownerUserId,
        name: cloneName,
        description: source.description,
      })
      .select('id')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    const newId = (inserted as { id: string }).id
    const sourceItems = itemsByTableId.get(tableId) ?? []
    if (sourceItems.length) {
      const payload = sourceItems.map((it) => ({
        user_id: ownerUserId,
        price_table_id: newId,
        offer_product_id: it.offer_product_id,
        variation_code: it.variation_code,
        line_description: it.line_description,
        price: it.price,
      }))
      const { error: copyErr } = await supabase.from('bem_aviv_offer_price_table_items').insert(payload)
      if (copyErr) {
        alert(copyErr.message)
        return
      }
    }
    await load()
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR TABELA DE PREÇO?')) return
    const { error } = await supabase.from('bem_aviv_offer_price_tables').delete().eq('id', id)
    if (error) alert(error.message)
    else await load()
  }

  function openSinglePriceEdit(it: PriceTableItem) {
    setSinglePriceEdit(it)
    setSinglePriceDraft(String(Number(it.price).toFixed(2)).replace('.', ','))
  }

  async function saveSinglePriceEdit() {
    if (!supabase || !singlePriceEdit) return
    const parsed = parseMoney(singlePriceDraft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('VALOR INVÁLIDO.')
      return
    }
    const it = singlePriceEdit
    const { error } = await supabase.from('bem_aviv_offer_price_table_items').update({ price: parsed }).eq('id', it.id)
    if (error) {
      alert(error.message)
      return
    }

    const product = products.find((p) => p.id === it.offer_product_id)
    if (product && product.price_table_id === it.price_table_id) {
      const payload = normalizePayload(product.payload)
      const variations = payload.variations ?? []
      const nextVars = variations.map((v) => (v.code === it.variation_code ? { ...v, price: parsed } : v))
      const { error: productError } = await supabase
        .from('bem_aviv_offer_products')
        .update({ payload: { variations: nextVars }, updated_at: new Date().toISOString() })
        .eq('id', product.id)
      if (productError) {
        alert(productError.message)
        return
      }
    }
    setSinglePriceEdit(null)
    await load()
  }

  function openGradeModal(tableId: string, productId: string, editable: boolean) {
    const tableItems = itemsByTableId.get(tableId) ?? []
    const gradeItems = tableItems
      .filter((it) => it.offer_product_id === productId)
      .sort((a, b) => a.variation_code.localeCompare(b.variation_code, 'pt-BR'))
    if (gradeItems.length === 0) return
    const product = productsById.get(productId)
    setGradePriceDraft(Object.fromEntries(gradeItems.map((it) => [it.id, String(it.price).replace('.', ',')])))
    setGradeModal({
      tableId,
      productId,
      productName: product?.name ?? gradeItems[0].line_description,
      items: gradeItems,
      editable,
    })
  }

  async function saveGradePrices() {
    if (!supabase || !gradeModal) return
    for (const item of gradeModal.items) {
      const typed = gradePriceDraft[item.id] ?? ''
      const parsed = parseMoney(typed)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        alert(`VALOR INVÁLIDO PARA ${item.variation_code}.`)
        return
      }
      const { error } = await supabase.from('bem_aviv_offer_price_table_items').update({ price: parsed }).eq('id', item.id)
      if (error) {
        alert(error.message)
        return
      }
    }

    const product = productsById.get(gradeModal.productId)
    if (product && product.price_table_id === gradeModal.tableId) {
      const byVarCode = new Map(
        gradeModal.items.map((it) => [it.variation_code, parseMoney(gradePriceDraft[it.id] ?? String(it.price).replace('.', ','))]),
      )
      const vars = normalizePayload(product.payload).variations ?? []
      const nextVars = vars.map((v) => (byVarCode.has(v.code) ? { ...v, price: byVarCode.get(v.code)! } : v))
      const { error: productError } = await supabase
        .from('bem_aviv_offer_products')
        .update({ payload: { variations: nextVars }, updated_at: new Date().toISOString() })
        .eq('id', product.id)
      if (productError) {
        alert(productError.message)
        return
      }
    }

    setGradeModal(null)
    await load()
  }

  async function removeProductFromGradeTable() {
    if (!supabase || !gradeModal || !ownerUserId) return
    if (
      !confirm(
        'REMOVER ESTE PRODUTO DESTA TABELA DE VENDAS?\n\nTodas as variações desta tabela serão excluídas. O cadastro do produto no catálogo permanece; apenas o vínculo de preços nesta tabela é removido.',
      )
    ) {
      return
    }
    const { error } = await supabase
      .from('bem_aviv_offer_price_table_items')
      .delete()
      .eq('price_table_id', gradeModal.tableId)
      .eq('offer_product_id', gradeModal.productId)
      .eq('user_id', ownerUserId)
    if (error) {
      alert(error.message)
      return
    }
    const product = productsById.get(gradeModal.productId)
    if (product?.price_table_id === gradeModal.tableId) {
      const { error: pErr } = await supabase
        .from('bem_aviv_offer_products')
        .update({ price_table_id: null, updated_at: new Date().toISOString() })
        .eq('id', gradeModal.productId)
        .eq('user_id', ownerUserId)
      if (pErr) {
        alert(pErr.message)
        return
      }
    }
    setGradeModal(null)
    setGradePriceDraft({})
    await load()
  }

  async function applyTableToAllProducts(tableId: string) {
    if (!supabase || !ownerUserId) return
    if (!confirm('VINCULAR ESTA TABELA COMO PADRÃO EM TODOS OS PRODUTOS DO CATÁLOGO?')) return

    const { error } = await supabase.from('bem_aviv_offer_products').update({ price_table_id: tableId }).eq('user_id', ownerUserId)
    if (error) {
      alert(error.message)
      return
    }

    const tableItems = itemsByTableId.get(tableId) ?? []
    const byProductAndVariation = new Map(tableItems.map((it) => [`${it.offer_product_id}:${it.variation_code}`, Number(it.price)]))
    for (const product of products) {
      const vars = normalizePayload(product.payload).variations ?? []
      const nextVars = vars.map((v) => {
        const fromTable = byProductAndVariation.get(`${product.id}:${v.code}`)
        return fromTable != null ? { ...v, price: fromTable } : v
      })
      const changed = nextVars.some((v, i) => v.price !== vars[i]?.price)
      if (!changed) continue
      await supabase
        .from('bem_aviv_offer_products')
        .update({ payload: { variations: nextVars }, updated_at: new Date().toISOString() })
        .eq('id', product.id)
    }

    await load()
  }

  function openProductCopyModal(args: {
    sourceTableId: string
    sourceTableName: string
    productId: string
    productName: string
    items: PriceTableItem[]
  }) {
    setProductCopyModal({
      sourceTableId: args.sourceTableId,
      sourceTableName: args.sourceTableName,
      productId: args.productId,
      productName: args.productName,
      items: args.items,
    })
    setCopyTargetTableId('')
  }

  async function confirmCopyProductToTable() {
    if (!supabase || !ownerUserId || !productCopyModal) return
    if (!copyTargetTableId) {
      alert('SELECIONE A TABELA DE DESTINO.')
      return
    }
    if (copyTargetTableId === productCopyModal.sourceTableId) {
      alert('SELECIONE UMA TABELA DIFERENTE DA ORIGEM.')
      return
    }

    const existingMap = new Map<string, string>()
    const { data: existingRows, error: existingErr } = await supabase
      .from('bem_aviv_offer_price_table_items')
      .select('id, variation_code')
      .eq('user_id', ownerUserId)
      .eq('price_table_id', copyTargetTableId)
      .eq('offer_product_id', productCopyModal.productId)

    if (existingErr) {
      alert(existingErr.message)
      return
    }
    for (const row of (existingRows as Array<{ id: string; variation_code: string }>) ?? []) {
      existingMap.set(row.variation_code, row.id)
    }

    for (const sourceItem of productCopyModal.items) {
      const existingId = existingMap.get(sourceItem.variation_code)
      if (existingId) {
        const { error } = await supabase
          .from('bem_aviv_offer_price_table_items')
          .update({
            line_description: sourceItem.line_description,
            price: sourceItem.price,
          })
          .eq('id', existingId)
        if (error) {
          alert(error.message)
          return
        }
      } else {
        const { error } = await supabase.from('bem_aviv_offer_price_table_items').insert({
          user_id: ownerUserId,
          price_table_id: copyTargetTableId,
          offer_product_id: productCopyModal.productId,
          variation_code: sourceItem.variation_code,
          line_description: sourceItem.line_description,
          price: sourceItem.price,
        })
        if (error) {
          alert(error.message)
          return
        }
      }
    }

    setProductCopyModal(null)
    setCopyTargetTableId('')
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold">TABELA DE VENDAS</h2>
        <Button
          type="button"
          variant="primary"
          className="inline-flex items-center gap-2"
          onClick={() => {
            resetNewTableForm()
            setAddTableModalOpen(true)
          }}
        >
          <Plus size={18} aria-hidden />
          Nova tabela
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label htmlFor="catalog-product-filter">PESQUISAR PRODUTO</label>
        <input
          id="catalog-product-filter"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          placeholder="Digite nome do produto (com ou sem acento)"
          autoComplete="off"
        />
      </div>

      <div className="space-y-8">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">NENHUMA TABELA CADASTRADA.</p>
        ) : null}
        {rows.map((r) => {
          const lines = itemsByTableId.get(r.id) ?? []
          const groupedRows = (() => {
            const map = new Map<string, PriceTableItem[]>()
            for (const it of lines) {
              const group = map.get(it.offer_product_id) ?? []
              group.push(it)
              map.set(it.offer_product_id, group)
            }
            return [...map.entries()].map(([productId, productItems]) => {
              const product = productsById.get(productId)
              const isGrade = product?.pricing_mode === 'GRADE' || productItems.length > 1
              const sorted = [...productItems].sort((a, b) => a.variation_code.localeCompare(b.variation_code, 'pt-BR'))
              return { productId, product, isGrade, items: sorted }
            })
          })()
          const filterKey = normalizeSearchText(productFilter)
          const filteredGroupedRows = filterKey
            ? groupedRows.filter((row) => {
                const productName = row.product?.name ?? row.items[0]?.line_description ?? ''
                return normalizeSearchText(productName).includes(filterKey)
              })
            : groupedRows
          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                    {r.is_default ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-900">
                        <Star size={12} />
                        PADRÃO
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">{r.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!r.is_default ? (
                    <Button type="button" variant="secondary" className="inline-flex items-center gap-1" onClick={() => setAsDefault(r.id)}>
                      <Star size={14} />
                      PADRÃO
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" className="inline-flex items-center gap-1" onClick={() => applyTableToAllProducts(r.id)}>
                    <RefreshCw size={14} />
                    ATUALIZAR TODOS PRODUTOS
                  </Button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                    onClick={() => openTableEdit(r)}
                    title="EDITAR TABELA"
                    aria-label="Editar tabela"
                  >
                    <Pencil size={15} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                    onClick={() => duplicateTable(r.id)}
                    title="CLONAR TABELA"
                    aria-label="Clonar tabela"
                  >
                    <Copy size={15} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 shadow-sm hover:bg-red-50"
                    onClick={() => remove(r.id)}
                    title="EXCLUIR TABELA"
                    aria-label="Excluir tabela"
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
              {lines.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500 sm:px-4">NENHUMA LINHA NESTA TABELA. CADASTRE/EDITE PRODUTOS PARA POPULAR OS PREÇOS.</p>
              ) : filteredGroupedRows.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500 sm:px-4">NENHUM PRODUTO CORRESPONDE AO FILTRO.</p>
              ) : (
                <div className="table-wrap border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUTO</th>
                        <th>VALOR</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGroupedRows.map((row) => (
                        <tr key={`${r.id}:${row.productId}`}>
                          <td>
                            {row.product?.name ?? row.items[0]?.line_description}
                            {row.isGrade ? (
                              <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-700">
                                GRADE ({row.items.length})
                              </span>
                            ) : null}
                          </td>
                          <td>{row.isGrade ? `${row.items.length} variações` : formatBRL(Number(row.items[0]?.price ?? 0))}</td>
                          <td className="whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              {row.isGrade ? (
                                <>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                    title="COPIAR PRODUTO PARA OUTRA TABELA"
                                    aria-label="Copiar produto para outra tabela"
                                    onClick={() =>
                                      openProductCopyModal({
                                        sourceTableId: r.id,
                                        sourceTableName: r.name,
                                        productId: row.productId,
                                        productName: row.product?.name ?? row.items[0]?.line_description ?? 'PRODUTO',
                                        items: row.items,
                                      })
                                    }
                                  >
                                    <Copy size={14} strokeWidth={2.2} />
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                    title="VER GRADE E VALORES"
                                    aria-label="Ver grade e valores"
                                    onClick={() => openGradeModal(r.id, row.productId, false)}
                                  >
                                    <Eye size={14} strokeWidth={2.2} />
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                    title="EDITAR VALORES DA GRADE"
                                    aria-label="Editar valores da grade"
                                    onClick={() => openGradeModal(r.id, row.productId, true)}
                                  >
                                    <Pencil size={14} strokeWidth={2.2} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                    title="COPIAR PRODUTO PARA OUTRA TABELA"
                                    aria-label="Copiar produto para outra tabela"
                                    onClick={() =>
                                      openProductCopyModal({
                                        sourceTableId: r.id,
                                        sourceTableName: r.name,
                                        productId: row.productId,
                                        productName: row.product?.name ?? row.items[0]?.line_description ?? 'PRODUTO',
                                        items: row.items,
                                      })
                                    }
                                  >
                                    <Copy size={14} strokeWidth={2.2} />
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                    title="EDITAR VALOR"
                                    aria-label="Editar valor"
                                    onClick={() => openSinglePriceEdit(row.items[0])}
                                  >
                                    <Pencil size={14} strokeWidth={2.2} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <FormDialog
        open={addTableModalOpen}
        title="Nova tabela de preço"
        description="Nome e descrição serão gravados em maiúsculas (regra do cadastro)."
        onClose={() => {
          setAddTableModalOpen(false)
          resetNewTableForm()
        }}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAddTableModalOpen(false)
                resetNewTableForm()
              }}
            >
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={() => void saveNewTable()}>
              Adicionar tabela
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="catalog-new-table-name">Nome</label>
            <input
              id="catalog-new-table-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="catalog-new-table-desc">Descrição</label>
            <input id="catalog-new-table-desc" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
          </div>
          <div className="sm:col-span-2 flex items-start gap-2">
            <input
              id="catalog-new-table-default"
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="catalog-new-table-default" className="mb-0 font-normal normal-case leading-snug">
              Definir como tabela padrão (novos produtos)
            </label>
          </div>
        </div>
      </FormDialog>

      <FormDialog
        open={Boolean(tableEdit)}
        title="Editar tabela de preço"
        description="Nome e descrição ficam em maiúsculas ao salvar (regra do cadastro)."
        onClose={() => setTableEdit(null)}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setTableEdit(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={() => void saveTableEdit()}>
              Salvar
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="catalog-table-name">Nome</label>
          <input
            id="catalog-table-name"
            value={tableEditName}
            onChange={(e) => setTableEditName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="catalog-table-desc">Descrição</label>
          <input id="catalog-table-desc" value={tableEditDesc} onChange={(e) => setTableEditDesc(e.target.value)} autoComplete="off" />
        </div>
      </FormDialog>

      <FormDialog
        open={Boolean(singlePriceEdit)}
        title="Editar valor"
        description={singlePriceEdit ? `${singlePriceEdit.line_description} (${singlePriceEdit.variation_code})` : undefined}
        onClose={() => setSinglePriceEdit(null)}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setSinglePriceEdit(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={() => void saveSinglePriceEdit()}>
              Salvar
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="catalog-item-price">Valor (use vírgula para centavos, ex.: 11741,31)</label>
          <input
            id="catalog-item-price"
            inputMode="decimal"
            value={singlePriceDraft}
            onChange={(e) => setSinglePriceDraft(e.target.value)}
            autoComplete="off"
          />
        </div>
      </FormDialog>

      <FormDialog
        open={Boolean(productCopyModal)}
        title="Copiar produto para outra tabela"
        description={
          productCopyModal
            ? `${productCopyModal.productName} — origem: ${productCopyModal.sourceTableName}`
            : undefined
        }
        onClose={() => {
          setProductCopyModal(null)
          setCopyTargetTableId('')
        }}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setProductCopyModal(null)
                setCopyTargetTableId('')
              }}
            >
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={() => void confirmCopyProductToTable()}>
              Copiar
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="copy-target-table">Tabela de destino</label>
          <select id="copy-target-table" value={copyTargetTableId} onChange={(e) => setCopyTargetTableId(e.target.value)}>
            <option value="">— Selecione —</option>
            {rows
              .filter((t) => t.id !== productCopyModal?.sourceTableId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
      </FormDialog>

      {gradeModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 sm:items-center">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{gradeModal.productName}</h3>
                <p className="text-xs text-slate-500">{gradeModal.editable ? 'EDIÇÃO DE VALORES DA GRADE' : 'VISUALIZAÇÃO DA GRADE'}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                onClick={() => setGradeModal(null)}
                title="Fechar grade"
                aria-label="Fechar grade"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            </div>

            <div className="table-wrap border-0">
              <table>
                <thead>
                  <tr>
                    <th>CÓD.</th>
                    <th>DESCRIÇÃO</th>
                    <th>VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeModal.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.variation_code}</td>
                      <td>{it.line_description}</td>
                      <td>
                        {gradeModal.editable ? (
                          <input
                            inputMode="decimal"
                            value={gradePriceDraft[it.id] ?? ''}
                            onChange={(e) => setGradePriceDraft((prev) => ({ ...prev, [it.id]: e.target.value }))}
                          />
                        ) : (
                          formatBRL(Number(it.price))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {gradeModal.editable ? (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" onClick={() => setGradeModal(null)}>
                  CANCELAR
                </Button>
                <Button type="button" variant="primary" onClick={() => void saveGradePrices()}>
                  SALVAR
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="inline-flex items-center gap-1.5"
                  onClick={() => void removeProductFromGradeTable()}
                >
                  <Trash2 size={16} aria-hidden />
                  Excluir
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
