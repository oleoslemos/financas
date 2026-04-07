import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type Produto = {
  id: string
  category: string
  name: string
  description: string | null
  price: number | null
}

const productCategories = [
  'PLATAFORMA DE DESCANSO',
  'CABECEIRAS',
  'BASES / CAMAS',
  'ACESSÓRIOS',
] as const

export function BemAvivProdutosPage() {
  const { user } = useUser()
  const location = useLocation()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [rows, setRows] = useState<Produto[]>([])
  const [editing, setEditing] = useState<Produto | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('TODOS')
  const [form, setForm] = useState({
    category: productCategories[0] as string,
    name: '',
    description: '',
    price: '',
  })

  async function load() {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('bem_aviv_products').select('*').eq('user_id', ownerUserId).order('name')
    setRows((data as Produto[]) ?? [])
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

  const filtered = useMemo(
    () => rows.filter((r) => (filterCategory === 'TODOS' ? true : r.category === filterCategory)),
    [rows, filterCategory],
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const payload = {
      user_id: ownerUserId,
      category: toUpperTrim(form.category),
      name: toUpperTrim(form.name),
      description: toUpperTrim(form.description) || null,
      price: form.price ? parseMoney(form.price) : null,
    }
    if (editing) {
      const { error } = await supabase.from('bem_aviv_products').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.from('bem_aviv_products').insert(payload)
      if (error) alert(error.message)
    }
    setEditing(null)
    setForm({ category: productCategories[0], name: '', description: '', price: '' })
    await load()
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR PRODUTO?')) return
    const { error } = await supabase.from('bem_aviv_products').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  return (
    <div className="space-y-6">
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

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div>
          <label>CATEGORIA</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {productCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label>PREÇO</label>
          <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label>NOME DO PRODUTO</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label>DESCRIÇÃO</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex gap-2">
          <button className="btn btn-primary" type="submit">{editing ? 'SALVAR' : 'ADICIONAR'}</button>
          {editing && <button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>CANCELAR</button>}
        </div>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>CATEGORIA</th>
                <th>NOME</th>
                <th>PREÇO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.category}</td>
                  <td>{r.name}</td>
                  <td>{r.price == null ? '—' : formatBRL(Number(r.price))}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => {
                        setEditing(r)
                        setForm({ category: r.category, name: r.name, description: r.description ?? '', price: r.price != null ? String(r.price) : '' })
                      }}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                        <Trash2 size={16} />
                      </button>
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
