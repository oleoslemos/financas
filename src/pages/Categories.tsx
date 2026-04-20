import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'

type Cat = { id: string; name: string; type: 'income' | 'expense' | 'neutral' }

const types: { v: Cat['type']; l: string }[] = [
  { v: 'expense', l: 'Despesa' },
  { v: 'income', l: 'Receita' },
  { v: 'neutral', l: 'Neutro' },
]

export function Categories() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [type, setType] = useState<Cat['type']>('expense')
  const [editing, setEditing] = useState<Cat | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').eq('user_id', ownerUserId).order('name')
    setRows((data as Cat[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const n = toUpperTrim(name)
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
      const { error } = await supabase.from('categories').insert({ user_id: ownerUserId, name: n, type })
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

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Categorias</h2>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
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
        <Button type="submit" variant="primary">
          {editing ? 'Salvar' : 'Adicionar'}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEditing(null)
              setName('')
            }}
          >
            Cancelar
          </Button>
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
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-9 w-9 items-center justify-center p-0"
                        title="EDITAR"
                        aria-label="EDITAR"
                        onClick={() => {
                          setEditing(c)
                          setName(c.name)
                          setType(c.type)
                        }}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                        title="EXCLUIR"
                        aria-label="EXCLUIR"
                        onClick={() => remove(c.id)}
                      >
                        <Trash2 size={16} />
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
