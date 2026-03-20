import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'

type Cat = { id: string; name: string; type: 'income' | 'expense' | 'neutral' }

const types: { v: Cat['type']; l: string }[] = [
  { v: 'expense', l: 'Despesa' },
  { v: 'income', l: 'Receita' },
  { v: 'neutral', l: 'Neutro' },
]

export function Categories() {
  const { user } = useUser()
  const supabase = useSupabase()
  const [rows, setRows] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [type, setType] = useState<Cat['type']>('expense')
  const [editing, setEditing] = useState<Cat | null>(null)

  async function load() {
    if (!supabase || !user?.id) return
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name')
    setRows((data as Cat[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user?.id) return
    const n = name.trim()
    if (!n) return
    if (editing) {
      const { error } = await supabase.from('categories').update({ name: n, type }).eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setEditing(null)
        setName('')
        load()
      }
    } else {
      const { error } = await supabase.from('categories').insert({ user_id: user.id, name: n, type })
      if (error) alert(error.message)
      else {
        setName('')
        load()
      }
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('Excluir categoria?')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (!supabase) return <p className="text-slate-400">Conectando…</p>

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Categorias</h2>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="min-w-[200px] flex-1">
          <label>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Alimentação" required />
        </div>
        <div className="w-40">
          <label>Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value as Cat['type'])}>
            {types.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          {editing ? 'Salvar' : 'Adicionar'}
        </button>
        {editing && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setEditing(null)
              setName('')
            }}
          >
            Cancelar
          </button>
        )}
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">Carregando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{types.find((t) => t.v === c.type)?.l}</td>
                  <td className="space-x-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      onClick={() => {
                        setEditing(c)
                        setName(c.name)
                        setType(c.type)
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className="text-sm text-red-400 hover:underline" onClick={() => remove(c.id)}>
                      Excluir
                    </button>
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
