import { useUser } from '@clerk/clerk-react'
import { BarChart3, Copy, Pencil, Star, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
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

type CompareRow = {
  productId: string
  lineDescription: string
  basePrice: number
  targetPrice: number
  deltaAbs: number
  deltaPct: number
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
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [rows, setRows] = useState<PriceTable[]>([])
  const [items, setItems] = useState<PriceTableItem[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [makeDefaultOnCreate, setMakeDefaultOnCreate] = useState(false)
  const [compareBaseId, setCompareBaseId] = useState('')
  const [compareTargetId, setCompareTargetId] = useState('')
  const [showCompare, setShowCompare] = useState(false)

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

  const compareRows = useMemo(() => {
    if (!compareBaseId || !compareTargetId || compareBaseId === compareTargetId) return [] as CompareRow[]
    const baseMap = new Map<string, PriceTableItem>()
    for (const it of itemsByTableId.get(compareBaseId) ?? []) baseMap.set(it.product_id, it)
    const targetMap = new Map<string, PriceTableItem>()
    for (const it of itemsByTableId.get(compareTargetId) ?? []) targetMap.set(it.product_id, it)
    const ids = [...new Set([...baseMap.keys(), ...targetMap.keys()])]
    const out: CompareRow[] = []
    for (const productId of ids) {
      const base = baseMap.get(productId)
      const target = targetMap.get(productId)
      if (!base || !target) continue
      const basePrice = Number(base.price)
      const targetPrice = Number(target.price)
      const deltaAbs = targetPrice - basePrice
      const deltaPct = basePrice === 0 ? 0 : (deltaAbs / basePrice) * 100
      out.push({
        productId,
        lineDescription: target.line_description || base.line_description,
        basePrice,
        targetPrice,
        deltaAbs,
        deltaPct,
      })
    }
    out.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    return out
  }, [compareBaseId, compareTargetId, itemsByTableId])

  const compareMaxAbsPct = useMemo(() => {
    const max = compareRows.reduce((acc, r) => Math.max(acc, Math.abs(r.deltaPct)), 0)
    return max > 0 ? max : 1
  }, [compareRows])

  async function load() {
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
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  useEffect(() => {
    if (!rows.length) {
      setCompareBaseId('')
      setCompareTargetId('')
      return
    }
    if (!compareBaseId || !rows.some((r) => r.id === compareBaseId)) setCompareBaseId(rows[0].id)
    if (!compareTargetId || !rows.some((r) => r.id === compareTargetId)) setCompareTargetId(rows[Math.min(1, rows.length - 1)].id)
  }, [rows, compareBaseId, compareTargetId])

  async function setDefaultTable(tableId: string) {
    if (!supabase || !ownerUserId) return
    const { error: clearErr } = await supabase.from('bem_aviv_price_tables').update({ is_default: false }).eq('user_id', ownerUserId)
    if (clearErr) {
      alert(clearErr.message)
      return
    }
    const { error: setErr } = await supabase
      .from('bem_aviv_price_tables')
      .update({ is_default: true })
      .eq('user_id', ownerUserId)
      .eq('id', tableId)
    if (setErr) alert(setErr.message)
    else load()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const normalizedName = toUpperTrim(name)
    const normalizedDesc = toUpperTrim(description) || null

    let createdId = ''
    const { data: inserted, error } = await supabase
      .from('bem_aviv_price_tables')
      .insert({
        user_id: ownerUserId,
        name: normalizedName,
        description: normalizedDesc,
        is_default: false,
      })
      .select('id')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    createdId = (inserted as { id: string }).id

    if (makeDefaultOnCreate && createdId) await setDefaultTable(createdId)

    setName('')
    setDescription('')
    setMakeDefaultOnCreate(false)
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
        is_default: false,
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

  async function editItemPrice(it: PriceTableItem) {
    if (!supabase) return
    const typed = prompt('NOVO VALOR (EX: 11741,31):', String(Number(it.price).toFixed(2)).replace('.', ','))
    if (typed == null) return
    const parsed = parseMoney(typed)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('VALOR INVÁLIDO.')
      return
    }

    const { error } = await supabase.from('bem_aviv_price_table_items').update({ price: parsed }).eq('id', it.id)
    if (error) {
      alert(error.message)
      return
    }

    // Reflete no cadastro do produto quando o produto está vinculado a esta tabela.
    const { error: productErr } = await supabase
      .from('bem_aviv_products')
      .update({ price: parsed })
      .eq('id', it.product_id)
      .eq('price_table_id', it.price_table_id)
    if (productErr) {
      alert(productErr.message)
      return
    }

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
      <h2 className="text-2xl font-semibold">GERAL — TABELA DE PREÇO</h2>
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
          <label className="mb-0 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={makeDefaultOnCreate} onChange={(e) => setMakeDefaultOnCreate(e.target.checked)} />
            DEFINIR COMO PADRÃO
          </label>
          <button className="btn btn-primary">ADICIONAR</button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">COMPARAR ALTERAÇÕES DE PREÇO ENTRE TABELAS</p>
          <button type="button" className="btn btn-secondary inline-flex items-center gap-2" onClick={() => setShowCompare((v) => !v)}>
            {showCompare ? <X size={16} /> : <BarChart3 size={16} />}
            {showCompare ? 'FECHAR GRÁFICO' : 'VER GRÁFICO'}
          </button>
        </div>
        {showCompare && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>TABELA BASE</label>
                <select value={compareBaseId} onChange={(e) => setCompareBaseId(e.target.value)}>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>TABELA COMPARADA</label>
                <select value={compareTargetId} onChange={(e) => setCompareTargetId(e.target.value)}>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {compareBaseId === compareTargetId ? (
              <p className="text-sm text-slate-500">SELECIONE TABELAS DIFERENTES PARA COMPARAR.</p>
            ) : compareRows.length === 0 ? (
              <p className="text-sm text-slate-500">SEM ITENS COMPATÍVEIS ENTRE AS DUAS TABELAS.</p>
            ) : (
              <div className="space-y-2">
                {compareRows.slice(0, 30).map((r) => {
                  const pctAbs = Math.abs(r.deltaPct)
                  const width = Math.max(4, (pctAbs / compareMaxAbsPct) * 100)
                  const up = r.deltaAbs >= 0
                  return (
                    <div key={r.productId} className="rounded-lg border border-slate-200 p-2">
                      <p className="truncate text-xs text-slate-700">{r.lineDescription}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-slate-100">
                          <div
                            className={`h-2 rounded ${up ? 'bg-red-500/80' : 'bg-emerald-500/80'}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold ${up ? 'text-red-700' : 'text-emerald-700'}`}>
                          {r.deltaPct >= 0 ? '+' : ''}
                          {r.deltaPct.toFixed(2)}%
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatBRL(r.basePrice)} → {formatBRL(r.targetPrice)} ({r.deltaAbs >= 0 ? '+' : ''}
                        {formatBRL(Math.abs(r.deltaAbs))})
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

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
                    {r.is_default ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">PADRÃO</span> : null}
                  </div>
                  <p className="text-xs text-slate-500">{r.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!r.is_default ? (
                    <button type="button" className="btn-ghost inline-flex h-9 w-9 shrink-0 items-center justify-center p-0 text-amber-700" onClick={() => setDefaultTable(r.id)} title="DEFINIR COMO PADRÃO">
                      <Star size={16} />
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost inline-flex h-9 w-9 shrink-0 items-center justify-center p-0" onClick={() => duplicateTable(r.id)} title="DUPLICAR TABELA">
                    <Copy size={16} />
                  </button>
                  <button type="button" className="btn-ghost inline-flex h-9 w-9 shrink-0 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)} title="EXCLUIR TABELA">
                    <Trash2 size={16} />
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
                                className="btn-ghost inline-flex h-7 w-7 items-center justify-center p-0"
                                onClick={() => editItemPrice(it)}
                                title="EDITAR PREÇO"
                              >
                                <Pencil size={14} />
                              </button>
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
    </div>
  )
}
