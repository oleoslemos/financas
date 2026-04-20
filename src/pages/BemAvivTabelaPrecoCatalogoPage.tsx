import { useUser } from '@clerk/clerk-react'
import { Copy, Pencil, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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

    setName('')
    setDescription('')
    setIsDefault(false)
    await load()
  }

  async function setAsDefault(id: string) {
    if (!supabase || !ownerUserId) return
    await supabase.from('bem_aviv_offer_price_tables').update({ is_default: false }).eq('user_id', ownerUserId)
    const { error } = await supabase.from('bem_aviv_offer_price_tables').update({ is_default: true }).eq('id', id).eq('user_id', ownerUserId)
    if (error) alert(error.message)
    else await load()
  }

  async function editTable(row: PriceTable) {
    if (!supabase) return
    const newName = prompt('NOVO NOME:', row.name)
    if (newName == null) return
    const normalized = toUpperTrim(newName)
    if (!normalized) {
      alert('NOME INVÁLIDO.')
      return
    }
    const newDesc = prompt('NOVA DESCRIÇÃO:', row.description ?? '')
    if (newDesc == null) return
    const { error } = await supabase.from('bem_aviv_offer_price_tables').update({ name: normalized, description: toUpperTrim(newDesc) || null }).eq('id', row.id)
    if (error) alert(error.message)
    else await load()
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

  async function editItemPrice(it: PriceTableItem) {
    if (!supabase) return
    const typed = prompt('NOVO VALOR (EX: 11741,31):', String(Number(it.price).toFixed(2)).replace('.', ','))
    if (typed == null) return
    const parsed = parseMoney(typed)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('VALOR INVÁLIDO.')
      return
    }
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">GERAL — TABELA DE PREÇO (CATÁLOGO)</h2>

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div>
          <label>NOME</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>DESCRIÇÃO</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input id="table-default-catalog" type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          <label htmlFor="table-default-catalog" className="mb-0 font-normal normal-case">
            Definir como tabela padrão (novos produtos)
          </label>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary">
            ADICIONAR TABELA
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
                    {r.is_default ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
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
                  <Button type="button" variant="ghost" className="inline-flex h-9 w-9 shrink-0 items-center justify-center p-0" onClick={() => editTable(r)} title="EDITAR TABELA">
                    <Pencil size={16} />
                  </Button>
                  <Button type="button" variant="ghost" className="inline-flex h-9 w-9 shrink-0 items-center justify-center p-0" onClick={() => duplicateTable(r.id)} title="CLONAR TABELA">
                    <Copy size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center p-0 text-red-600"
                    onClick={() => remove(r.id)}
                    title="EXCLUIR TABELA"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
              {lines.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500 sm:px-4">NENHUMA LINHA NESTA TABELA. CADASTRE/EDITE PRODUTOS PARA POPULAR OS PREÇOS.</p>
              ) : (
                <div className="table-wrap border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUTO / VARIAÇÃO</th>
                        <th>VALOR</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((it) => (
                        <tr key={it.id}>
                          <td>{it.line_description}</td>
                          <td>{formatBRL(Number(it.price))}</td>
                          <td className="whitespace-nowrap text-right">
                            <Button type="button" variant="secondary" className="inline-flex h-8 items-center gap-1 px-2 text-xs" onClick={() => editItemPrice(it)}>
                              <Pencil size={13} />
                              Editar preço
                            </Button>
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
    </div>
  )
}
