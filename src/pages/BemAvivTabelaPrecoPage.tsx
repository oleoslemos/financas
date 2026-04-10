import { useUser } from '@clerk/clerk-react'
import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type PriceTable = { id: string; name: string; description: string | null }

type PriceTableItem = {
  id: string
  price_table_id: string
  line_description: string
  price: number
}

export function BemAvivTabelaPrecoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [rows, setRows] = useState<PriceTable[]>([])
  const [items, setItems] = useState<PriceTableItem[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

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

  async function load() {
    if (!supabase || !ownerUserId) return
    const [{ data }, { data: itemRows }] = await Promise.all([
      supabase.from('bem_aviv_price_tables').select('id, name, description').eq('user_id', ownerUserId).order('name'),
      supabase.from('bem_aviv_price_table_items').select('id, price_table_id, line_description, price').eq('user_id', ownerUserId),
    ])
    setRows((data as PriceTable[]) ?? [])
    setItems((itemRows as PriceTableItem[]) ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const { error } = await supabase.from('bem_aviv_price_tables').insert({
      user_id: ownerUserId,
      name: toUpperTrim(name),
      description: toUpperTrim(description) || null,
    })
    if (error) alert(error.message)
    else {
      setName('')
      setDescription('')
      load()
    }
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
        <div className="sm:col-span-2"><button className="btn btn-primary">ADICIONAR</button></div>
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
                  <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.description || '—'}</p>
                </div>
                <button type="button" className="btn-ghost inline-flex h-9 w-9 shrink-0 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)} title="EXCLUIR TABELA">
                  <Trash2 size={16} />
                </button>
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
                          <td className="tabular-nums">{formatBRL(Number(it.price))}</td>
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
