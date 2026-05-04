import { useUser } from '@clerk/clerk-react'
import { BarChart3, Copy, Pencil, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { FormDialog } from '../components/ui/FormDialog'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type PriceTable = { id: string; name: string; description: string | null; is_default?: boolean | null }

type PriceTableItem = {
  id: string
  price_table_id: string
  product_id: string
  line_description: string
  price: number
}

type ProductCompareState = { productId: string; lineDescription: string } | null

function nextCopyName(baseName: string, existingNames: string[]) {
  const used = new Set(existingNames)
  const normalized = `${baseName} CÓPIA`
  if (!used.has(normalized)) return normalized
  let n = 2
  while (used.has(`${baseName} CÓPIA ${n}`)) n += 1
  return `${baseName} CÓPIA ${n}`
}

export function BemAvivTabelaPrecoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<PriceTable[]>([])
  const [items, setItems] = useState<PriceTableItem[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [productCompare, setProductCompare] = useState<ProductCompareState>(null)
  const [singlePriceEdit, setSinglePriceEdit] = useState<PriceTableItem | null>(null)
  const [singlePriceDraft, setSinglePriceDraft] = useState('')

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

  const productCompareSeries = useMemo(() => {
    if (!productCompare) return []
    const byTableAndProduct = new Map<string, number>()
    for (const it of items) {
      byTableAndProduct.set(`${it.price_table_id}:${it.product_id}`, Number(it.price))
    }
    const series = rows
      .map((table) => {
        const key = `${table.id}:${productCompare.productId}`
        const value = byTableAndProduct.get(key)
        return { tableName: table.name, price: value ?? null }
      })
      .filter((r) => r.price != null) as Array<{ tableName: string; price: number }>

    series.sort((a, b) => a.price - b.price)
    return series
  }, [productCompare, rows, items])

  const productCompareMax = useMemo(() => {
    const max = productCompareSeries.reduce((acc, r) => Math.max(acc, r.price), 0)
    return max > 0 ? max : 1
  }, [productCompareSeries])

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    const [{ data, error }, { data: itemRows, error: itemError }] = await Promise.all([
      supabase.from('bem_aviv_price_tables').select('id, name, description, is_default').eq('user_id', ownerUserId).order('name'),
      supabase.from('bem_aviv_price_table_items').select('id, price_table_id, product_id, line_description, price').eq('user_id', ownerUserId),
    ])
    if (error) {
      alert(error.message)
      return
    }
    if (itemError) {
      alert(itemError.message)
      return
    }
    setRows((data as PriceTable[]) ?? [])
    setItems((itemRows as PriceTableItem[]) ?? [])
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const normalizedName = toUpperTrim(name)
    const normalizedDesc = toUpperTrim(description) || null

    const { data: inserted, error } = await supabase
      .from('bem_aviv_price_tables')
      .insert({
        user_id: ownerUserId,
        name: normalizedName,
        description: normalizedDesc,
      })
      .select('id')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    void inserted

    setName('')
    setDescription('')
    load()
  }

  async function duplicateTable(tableId: string) {
    if (!supabase || !ownerUserId) return
    const source = rows.find((r) => r.id === tableId)
    if (!source) return
    const cloneName = nextCopyName(source.name, rows.map((r) => r.name))
    const { data: inserted, error } = await supabase
      .from('bem_aviv_price_tables')
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
        product_id: it.product_id,
        line_description: it.line_description,
        price: it.price,
      }))
      const { error: copyErr } = await supabase.from('bem_aviv_price_table_items').insert(payload)
      if (copyErr) {
        alert(copyErr.message)
        return
      }
    }
    await load()
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
    const { error } = await supabase.from('bem_aviv_price_table_items').update({ price: parsed }).eq('id', it.id)
    if (error) {
      alert(error.message)
      return
    }

    const { error: productErr } = await supabase
      .from('bem_aviv_products')
      .update({ price: parsed })
      .eq('id', it.product_id)
      .eq('price_table_id', it.price_table_id)
    if (productErr) {
      alert(productErr.message)
      return
    }

    setSinglePriceEdit(null)
    await load()
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR TABELA DE PREÇO?')) return
    const { error } = await supabase.from('bem_aviv_price_tables').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">GERAL — TABELA DE PREÇO GOLD</h2>
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div>
          <label>NOME</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>DESCRIÇÃO</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary">
            ADICIONAR
          </Button>
        </div>
      </form>

      <div className="space-y-8">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">NENHUMA TABELA CADASTRADA.</p>
        ) : null}
        {rows.map((r) => {
          const lines = itemsByTableId.get(r.id) ?? []
          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  </div>
                  <p className="text-xs text-slate-500">{r.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
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
                <p className="px-3 py-3 text-sm text-slate-500 sm:px-4">NENHUMA LINHA (CADASTRE PRODUTOS EM PLATAFORMA DE DESCANSO COM ESTA TABELA).</p>
              ) : (
                <div className="table-wrap border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>LINHA + MODELO + DIMENSÕES</th>
                        <th>VALOR</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((it) => (
                        <tr key={it.id}>
                          <td>{it.line_description}</td>
                          <td className="tabular-nums">
                            <div className="flex items-center justify-between gap-2">
                              <span>{formatBRL(Number(it.price))}</span>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                onClick={() => openSinglePriceEdit(it)}
                                title="EDITAR PREÇO"
                                aria-label="Editar preço"
                              >
                                <Pencil size={13} strokeWidth={2.2} />
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                              onClick={() => setProductCompare({ productId: it.product_id, lineDescription: it.line_description })}
                              title="GRÁFICO POR PRODUTO"
                              aria-label="Gráfico por produto"
                            >
                              <BarChart3 size={13} strokeWidth={2.2} />
                            </button>
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
        open={Boolean(singlePriceEdit)}
        title="Editar valor (Gold)"
        description={singlePriceEdit?.line_description}
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
          <label htmlFor="gold-item-price">Valor (ex.: 11741,31)</label>
          <input
            id="gold-item-price"
            inputMode="decimal"
            value={singlePriceDraft}
            onChange={(e) => setSinglePriceDraft(e.target.value)}
            autoComplete="off"
          />
        </div>
      </FormDialog>

      {productCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">GRÁFICO POR PRODUTO</p>
                <p className="text-xs text-slate-500">{productCompare.lineDescription}</p>
              </div>
              <Button type="button" variant="secondary" className="inline-flex items-center gap-1" onClick={() => setProductCompare(null)}>
                <X size={14} />
                FECHAR
              </Button>
            </div>
            {productCompareSeries.length === 0 ? (
              <p className="text-sm text-slate-500">ESTE PRODUTO NÃO POSSUI VALORES NAS TABELAS CADASTRADAS.</p>
            ) : (
              <div className="space-y-2">
                {productCompareSeries.map((row) => {
                  const width = Math.max(4, (row.price / productCompareMax) * 100)
                  return (
                    <div key={row.tableName} className="rounded-lg border border-slate-200 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-700">{row.tableName}</p>
                        <span className="text-xs font-semibold text-slate-900">{formatBRL(row.price)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-slate-100">
                        <div className="h-2 rounded bg-sky-500/80" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
