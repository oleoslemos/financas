import { useUser } from '@clerk/clerk-react'
import { BarChart3, Copy, Filter, Save, Search, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
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

function normalizeFilterKey(v: string) {
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

export function BemAvivTabelaPrecoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<PriceTable[]>([])
  const [items, setItems] = useState<PriceTableItem[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [productCompare, setProductCompare] = useState<ProductCompareState>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const it of items) {
      next[it.id] = Number(it.price).toFixed(2).replace('.', ',')
    }
    setPriceDrafts(next)
    setDirtyIds(new Set())
  }, [items])

  const itemMatchesFilter = useCallback(
    (it: PriceTableItem) => {
      const q = normalizeFilterKey(filterQuery)
      if (!q) return true
      const hay = `${it.line_description} ${it.product_id}`
      return normalizeFilterKey(hay).includes(q)
    },
    [filterQuery],
  )

  const filteredItemsCount = useMemo(() => items.filter(itemMatchesFilter).length, [items, itemMatchesFilter])

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

  async function persistOnePrice(it: PriceTableItem, parsed: number) {
    if (!supabase) return
    const { error } = await supabase.from('bem_aviv_price_table_items').update({ price: parsed }).eq('id', it.id)
    if (error) throw new Error(error.message)

    const { error: productErr } = await supabase
      .from('bem_aviv_products')
      .update({ price: parsed })
      .eq('id', it.product_id)
      .eq('price_table_id', it.price_table_id)
    if (productErr) throw new Error(productErr.message)
  }

  async function saveDirtyChanges() {
    if (!supabase || dirtyIds.size === 0) return
    setSaving(true)
    try {
      for (const id of dirtyIds) {
        const it = items.find((i) => i.id === id)
        if (!it) continue
        const parsed = parseMoney(priceDrafts[id] ?? '')
        if (!Number.isFinite(parsed) || parsed <= 0) {
          alert(`VALOR INVÁLIDO NA LINHA: ${it.line_description}`)
          return
        }
        await persistOnePrice(it, parsed)
      }
      setDirtyIds(new Set())
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  function applyMassReajuste() {
    const raw = window.prompt('Percentual de reajuste sobre as linhas visíveis com o filtro atual (ex.: 10 ou -5):', '0')
    if (raw === null) return
    const pct = parseFloat(raw.replace(',', '.'))
    if (!Number.isFinite(pct)) {
      alert('PERCENTUAL INVÁLIDO.')
      return
    }
    const factor = 1 + pct / 100
    setPriceDrafts((prev) => {
      const next = { ...prev }
      for (const it of items) {
        if (!itemMatchesFilter(it)) continue
        const cur = parseMoney(prev[it.id] ?? String(it.price))
        if (!Number.isFinite(cur) || cur <= 0) continue
        const np = Math.max(0.01, Math.round(cur * factor * 100) / 100)
        next[it.id] = np.toFixed(2).replace('.', ',')
      }
      return next
    })
    setDirtyIds((prev) => {
      const s = new Set(prev)
      for (const it of items) {
        if (itemMatchesFilter(it)) s.add(it.id)
      }
      return s
    })
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR TABELA DE PREÇO?')) return
    const { error } = await supabase.from('bem_aviv_price_tables').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  return (
    <div className="normal-case space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Tabela de preço Gold</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Edição rápida estilo planilha. Altere os valores e clique em Salvar. Para matriz do catálogo, use{' '}
            <Link className="font-semibold text-[#185FA5] hover:underline" to="/bem-aviv/tabela-preco-catalogo">
              Tabela de preço (catálogo)
            </Link>
            .
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="relative min-w-[min(100%,18rem)] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar por nome da linha ou ID do produto…"
              className="h-11 border-slate-200 pl-10 pr-3 shadow-sm"
              aria-label="Filtrar linhas"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              <Filter size={14} className="mr-1 inline align-text-bottom text-slate-400" aria-hidden />
              {filteredItemsCount} linha(s) visível(is)
            </span>
            <Button type="button" variant="secondary" className="gap-1.5" onClick={() => applyMassReajuste()}>
              Reajuste em massa (%)
            </Button>
            <Button type="button" variant="primary" className="gap-1.5" disabled={dirtyIds.size === 0 || saving} onClick={() => void saveDirtyChanges()}>
              <Save size={16} aria-hidden />
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </CardContent>
      </Card>

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
          const lines = (itemsByTableId.get(r.id) ?? []).filter(itemMatchesFilter)
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
                <p className="px-3 py-3 text-sm text-slate-500 sm:px-4">
                  {(itemsByTableId.get(r.id) ?? []).length === 0
                    ? 'NENHUMA LINHA (CADASTRE PRODUTOS EM PLATAFORMA DE DESCANSO COM ESTA TABELA).'
                    : 'Nenhuma linha corresponde ao filtro atual.'}
                </p>
              ) : (
                <div className="table-wrap border-0">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUTO / LINHA</th>
                        <th>TIPO</th>
                        <th className="text-right">PREÇO DE VENDA</th>
                        <th className="w-24 text-center">STATUS</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((it) => (
                        <tr key={it.id} className="group transition-colors hover:bg-slate-50/70">
                          <td>
                            <div>
                              <p className="font-medium text-slate-900">{it.line_description}</p>
                              <p className="font-mono text-[11px] text-slate-400">{it.product_id.slice(0, 8)}…</p>
                            </div>
                          </td>
                          <td>
                            <Badge variant="secondary" className="font-normal">
                              Produto
                            </Badge>
                          </td>
                          <td className="text-right">
                            <div className="inline-flex items-center gap-0.5 font-semibold text-[#185FA5]">
                              <span className="text-sm text-slate-500">R$</span>
                              <Input
                                className="h-9 w-[7.5rem] border-transparent bg-transparent px-1.5 text-right text-sm font-bold tabular-nums text-[#185FA5] shadow-none hover:border-slate-200 focus:border-[#185FA5] focus:bg-white"
                                inputMode="decimal"
                                value={priceDrafts[it.id] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setPriceDrafts((p) => ({ ...p, [it.id]: v }))
                                  setDirtyIds((prev) => new Set(prev).add(it.id))
                                }}
                                aria-label={`Preço ${it.line_description}`}
                              />
                            </div>
                          </td>
                          <td className="text-center">
                            <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ativo</Badge>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 opacity-80 shadow-sm hover:bg-slate-50 group-hover:opacity-100"
                              onClick={() => setProductCompare({ productId: it.product_id, lineDescription: it.line_description })}
                              title="Comparar em tabelas"
                              aria-label="Gráfico por produto"
                            >
                              <BarChart3 size={14} strokeWidth={2.2} />
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
