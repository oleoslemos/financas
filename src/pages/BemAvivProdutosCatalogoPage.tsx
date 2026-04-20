import { useUser } from '@clerk/clerk-react'
import { Copy, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseDigitsCentsToNumber, numberToCentsDigits } from '../lib/format'
import { normalizePayload, type OfferPayload, type OfferProduct, type OfferVariation } from '../lib/bemAvivOfferProduct'
import { toUpperTrim } from '../lib/text'

type PriceTable = { id: string; name: string; is_default: boolean }

type VariationFormRow = { dimensions: string; priceDigits: string }

function emptyVariationRow(): VariationFormRow {
  return { dimensions: '', priceDigits: '' }
}

function autoVariationCode(index: number) {
  return String(index + 1).padStart(2, '0')
}

function formatPriceMaskFromDigits(digits: string) {
  if (!digits) return ''
  return parseDigitsCentsToNumber(digits).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function isMissingOfferProductsTable(message: string) {
  const m = message.toLowerCase()
  return (
    m.includes('bem_aviv_offer_products') &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find') || m.includes('relation'))
  )
}

function catalogErrorMessage(message: string) {
  if (isMissingOfferProductsTable(message)) {
    return (
      'A tabela bem_aviv_offer_products ainda não existe neste projeto Supabase (migration não aplicada). ' +
      'No repositório, rode: npx supabase db push — ou aplique o SQL da migration 20260421120000_bem_aviv_offer_products no painel do Supabase (SQL Editor).'
    )
  }
  return message
}

export function BemAvivProdutosCatalogoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<OfferProduct[]>([])
  const [priceTables, setPriceTables] = useState<PriceTable[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<OfferProduct | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [productLine, setProductLine] = useState('')
  const [productType, setProductType] = useState('')
  const [pricingMode, setPricingMode] = useState<'UNICO' | 'GRADE'>('UNICO')
  const [priceTableId, setPriceTableId] = useState('')
  const [varRows, setVarRows] = useState([emptyVariationRow()])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gradePreview, setGradePreview] = useState<OfferProduct | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    setLoadError(null)
    const [{ data, error }, { data: tables, error: tableError }] = await Promise.all([
      supabase
        .from('bem_aviv_offer_products')
        .select('id, name, category, product_line, product_type, pricing_mode, price_table_id, payload')
        .eq('user_id', ownerUserId)
        .order('name'),
      supabase.from('bem_aviv_offer_price_tables').select('id, name, is_default').eq('user_id', ownerUserId).order('name'),
    ])
    if (error || tableError) {
      setLoadError(catalogErrorMessage((error ?? tableError)?.message ?? 'Erro ao carregar produtos.'))
      setRows([])
      setPriceTables([])
    } else {
      setRows(((data ?? []) as OfferProduct[]).map((r) => ({ ...r, payload: normalizePayload(r.payload) })))
      setPriceTables((tables as PriceTable[]) ?? [])
    }
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  function closeForm() {
    setEditing(null)
    setShowForm(false)
    setName('')
    setCategory('')
    setProductLine('')
    setProductType('')
    setPricingMode('UNICO')
    setPriceTableId('')
    setVarRows([emptyVariationRow()])
  }

  function openNew() {
    closeForm()
    const defaultTable = priceTables.find((t) => t.is_default)
    setPriceTableId(defaultTable?.id ?? '')
    setShowForm(true)
  }

  function openEdit(r: OfferProduct) {
    setEditing(r)
    setName(r.name)
    setCategory(r.category ?? '')
    setProductLine(r.product_line ?? '')
    setProductType(r.product_type ?? '')
    setPricingMode(r.pricing_mode === 'GRADE' ? 'GRADE' : 'UNICO')
    setPriceTableId(r.price_table_id ?? '')
    const vars = normalizePayload(r.payload).variations ?? []
    setVarRows(
      vars.length ? vars.map((v) => ({ dimensions: v.dimensions, priceDigits: numberToCentsDigits(Number(v.price)) })) : [emptyVariationRow()],
    )
    setShowForm(true)
  }

  function duplicateFrom(r: OfferProduct) {
    setEditing(null)
    setName(`${r.name} (CÓPIA)`)
    setCategory(r.category ?? '')
    setProductLine(r.product_line ?? '')
    setProductType(r.product_type ?? '')
    setPricingMode(r.pricing_mode === 'GRADE' ? 'GRADE' : 'UNICO')
    setPriceTableId(r.price_table_id ?? '')
    const vars = normalizePayload(r.payload).variations ?? []
    setVarRows(
      vars.length ? vars.map((v) => ({ dimensions: v.dimensions, priceDigits: numberToCentsDigits(Number(v.price)) })) : [emptyVariationRow()],
    )
    setShowForm(true)
  }

  function buildPayloadFromForm(): OfferPayload {
    const sourceRows = pricingMode === 'UNICO' ? [varRows[0] ?? emptyVariationRow()] : varRows
    const variations: OfferVariation[] = []
    sourceRows.forEach((row, i) => {
      const code = autoVariationCode(i)
      const dimensions = row.dimensions.trim()
      const price = parseDigitsCentsToNumber(row.priceDigits || '0')
      if (price <= 0) return
      variations.push({ code, dimensions: dimensions ? toUpperTrim(dimensions) : '', price })
    })
    return { variations }
  }

  async function syncPriceTableItems(productId: string, tableId: string, productName: string, payload: OfferPayload) {
    if (!supabase || !ownerUserId || !tableId) return
    const vars = payload.variations ?? []
    if (vars.length === 0) return

    const { data: existingRows } = await supabase
      .from('bem_aviv_offer_price_table_items')
      .select('id, variation_code')
      .eq('price_table_id', tableId)
      .eq('offer_product_id', productId)
    const existing = new Map(((existingRows as Array<{ id: string; variation_code: string }>) ?? []).map((r) => [r.variation_code, r.id]))

    for (const variation of vars) {
      const lineDescription = `${toUpperTrim(productName)}${variation.dimensions ? ` - ${toUpperTrim(variation.dimensions)}` : ''}`
      const updatePayload = {
        line_description: lineDescription,
        price: variation.price,
      }
      const existingId = existing.get(variation.code)
      if (existingId) {
        const { error } = await supabase.from('bem_aviv_offer_price_table_items').update(updatePayload).eq('id', existingId)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('bem_aviv_offer_price_table_items').insert({
          user_id: ownerUserId,
          price_table_id: tableId,
          offer_product_id: productId,
          variation_code: variation.code,
          line_description: lineDescription,
          price: variation.price,
        })
        if (error) throw new Error(error.message)
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const nm = toUpperTrim(name)
    if (!nm) {
      alert('INFORME O NOME DO PRODUTO.')
      return
    }

    const payload = buildPayloadFromForm()
    if (!payload.variations?.length) {
      alert('INCLUA AO MENOS UMA VARIAÇÃO COM PREÇO VÁLIDO.')
      return
    }

    const row = {
      user_id: ownerUserId,
      name: nm,
      category: toUpperTrim(category) || null,
      product_line: toUpperTrim(productLine) || null,
      product_type: toUpperTrim(productType) || null,
      pricing_mode: pricingMode,
      price_table_id: priceTableId || null,
      payload,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editing) {
        const { error } = await supabase.from('bem_aviv_offer_products').update(row).eq('id', editing.id)
        if (error) {
          alert(catalogErrorMessage(error.message))
          return
        }
        await syncPriceTableItems(editing.id, priceTableId, nm, payload)
      } else {
        const { data: inserted, error } = await supabase.from('bem_aviv_offer_products').insert(row).select('id').single()
        if (error) {
          alert(catalogErrorMessage(error.message))
          return
        }
        await syncPriceTableItems((inserted as { id: string }).id, priceTableId, nm, payload)
      }
      closeForm()
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ERRO AO SINCRONIZAR TABELA DE PREÇO.')
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR ESTE PRODUTO DO CATÁLOGO?')) return
    const { error } = await supabase.from('bem_aviv_offer_products').delete().eq('id', id)
    if (error) alert(catalogErrorMessage(error.message))
    else {
      if (editing?.id === id) closeForm()
      await load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">CADASTRO — PRODUTOS (CATÁLOGO)</h2>
          <p className="mt-1 max-w-2xl text-sm font-normal normal-case text-slate-600">
            Produto único é o padrão e você pode alternar para grade. A nova tabela de preço é sincronizada automaticamente no cadastro.
          </p>
          {loadError ? (
            <div
              role="alert"
              className="mt-3 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-normal normal-case text-amber-950"
            >
              {loadError}
            </div>
          ) : null}
        </div>
        <Button type="button" variant="primary" className="inline-flex items-center gap-2" onClick={openNew}>
          <Plus size={16} />
          ADICIONAR PRODUTO
        </Button>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:p-4">
            <form onSubmit={submit} className="grid gap-3 rounded-xl sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{editing ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</h3>
                <Button type="button" variant="secondary" className="inline-flex items-center gap-1" onClick={closeForm}>
                  <X size={14} />
                  FECHAR
                </Button>
              </div>
              <div className="sm:col-span-2">
                <label>NOME</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="EX.: LUNAR" />
              </div>
              <div>
                <label>CATEGORIA</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="EX.: COLCHÃO" />
              </div>
              <div>
                <label>LINHA</label>
                <input value={productLine} onChange={(e) => setProductLine(e.target.value)} placeholder="EX.: RELEX" />
              </div>
              <div>
                <label>TIPO / TAMANHO BASE</label>
                <input value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="EX.: SOLTEIRO" />
              </div>
              <div>
                <label>MODO DO PRODUTO</label>
                <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as 'UNICO' | 'GRADE')}>
                  <option value="UNICO">PRODUTO ÚNICO</option>
                  <option value="GRADE">PRODUTO GRADE</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label>TABELA DE PREÇO (NOVA)</label>
                <select value={priceTableId} onChange={(e) => setPriceTableId(e.target.value)}>
                  <option value="">— SEM TABELA —</option>
                  {priceTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.is_default ? ' (PADRÃO)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {pricingMode === 'GRADE' ? (
                <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">VARIAÇÕES (CÓD. AUTO + DIMENSÕES + PREÇO)</span>
                    <Button type="button" variant="secondary" onClick={() => setVarRows((v) => [...v, emptyVariationRow()])}>
                      + LINHA
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {varRows.map((row, idx) => (
                      <div key={idx} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                        <div className="sm:col-span-2">
                          <label className="text-xs">CÓD. (AUTO)</label>
                          <div className="flex h-[38px] items-center rounded border border-slate-200 bg-slate-100 px-2 font-mono text-sm font-semibold text-slate-700">
                            {autoVariationCode(idx)}
                          </div>
                        </div>
                        <div className="sm:col-span-5">
                          <label className="text-xs">DIMENSÕES</label>
                          <input
                            value={row.dimensions}
                            onChange={(e) => setVarRows((r) => r.map((x, i) => (i === idx ? { ...x, dimensions: e.target.value } : x)))}
                            placeholder="0,80 x 1,88 x 26"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-xs">PREÇO (R$)</label>
                          <input
                            inputMode="decimal"
                            value={formatPriceMaskFromDigits(row.priceDigits)}
                            onChange={(e) =>
                              setVarRows((r) => r.map((x, i) => (i === idx ? { ...x, priceDigits: e.target.value.replace(/\D/g, '') } : x)))
                            }
                            placeholder="2.300,00"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-red-600"
                            disabled={varRows.length <= 1}
                            onClick={() => setVarRows((r) => r.filter((_, i) => i !== idx))}
                          >
                            REMOVER
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">PRODUTO ÚNICO</p>
                  <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-2">
                      <label className="text-xs">CÓD. (AUTO)</label>
                      <div className="flex h-[38px] items-center rounded border border-slate-200 bg-slate-100 px-2 font-mono text-sm font-semibold text-slate-700">
                        01
                      </div>
                    </div>
                    <div className="sm:col-span-6">
                      <label className="text-xs">DESCRIÇÃO / DIMENSÕES (OPCIONAL)</label>
                      <input
                        value={varRows[0]?.dimensions ?? ''}
                        onChange={(e) => setVarRows([{ dimensions: e.target.value, priceDigits: varRows[0]?.priceDigits ?? '' }])}
                        placeholder="EX.: PADRÃO"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-xs">PREÇO (R$)</label>
                      <input
                        inputMode="decimal"
                        value={formatPriceMaskFromDigits(varRows[0]?.priceDigits ?? '')}
                        onChange={(e) => setVarRows([{ dimensions: varRows[0]?.dimensions ?? '', priceDigits: e.target.value.replace(/\D/g, '') }])}
                        placeholder="2.300,00"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Button type="submit" variant="primary">
                  {editing ? 'SALVAR ALTERAÇÕES' : 'ADICIONAR PRODUTO'}
                </Button>
                <Button type="button" variant="secondary" onClick={closeForm}>
                  CANCELAR
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {gradePreview ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 sm:items-center">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">GRADE — {gradePreview.name}</h3>
                <p className="text-xs text-slate-500">{gradePreview.payload.variations?.length ?? 0} variações</p>
              </div>
              <Button type="button" variant="secondary" className="inline-flex items-center gap-1" onClick={() => setGradePreview(null)}>
                <X size={14} />
                FECHAR
              </Button>
            </div>

            <div className="table-wrap border-0">
              <table>
                <thead>
                  <tr>
                    <th>CÓDIGO</th>
                    <th>DIMENSÕES</th>
                    <th>PREÇO</th>
                  </tr>
                </thead>
                <tbody>
                  {(gradePreview.payload.variations ?? []).map((variation) => (
                    <tr key={variation.code}>
                      <td>{variation.code}</td>
                      <td>{variation.dimensions || '—'}</td>
                      <td>{formatBRL(Number(variation.price))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>NOME</th>
                <th>CATEGORIA</th>
                <th>LINHA</th>
                <th>TIPO</th>
                <th>MODO</th>
                <th>VARIAÇÕES</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.pricing_mode === 'GRADE' ? (
                      <button
                        type="button"
                        className="font-medium text-emerald-800 underline-offset-2 hover:underline"
                        onClick={() => setGradePreview(r)}
                        title="VER GRADE"
                      >
                        {r.name}
                      </button>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td>{r.category || '—'}</td>
                  <td>{r.product_line || '—'}</td>
                  <td>{r.product_type || '—'}</td>
                  <td>{r.pricing_mode === 'GRADE' ? 'GRADE' : 'ÚNICO'}</td>
                  <td>{r.payload.variations?.length ?? 0}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {r.pricing_mode === 'GRADE' ? (
                        <Button type="button" variant="secondary" className="inline-flex h-8 w-8 items-center justify-center p-0" onClick={() => setGradePreview(r)} title="VER GRADE">
                          <Eye size={14} />
                        </Button>
                      ) : null}
                      <Button type="button" variant="secondary" className="inline-flex h-8 w-8 items-center justify-center p-0" onClick={() => openEdit(r)} title="EDITAR">
                        <Pencil size={14} />
                      </Button>
                      <Button type="button" variant="secondary" className="inline-flex h-8 w-8 items-center justify-center p-0" onClick={() => duplicateFrom(r)} title="CLONAR">
                        <Copy size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="inline-flex h-8 w-8 items-center justify-center p-0 text-red-700"
                        onClick={() => remove(r.id)}
                        title="EXCLUIR"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
