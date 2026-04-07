import { useUser } from '@clerk/clerk-react'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { toUpperTrim } from '../lib/text'

type PriceTable = { id: string; name: string; description: string | null }

export function BemAvivTabelaPrecoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [rows, setRows] = useState<PriceTable[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function load() {
    if (!supabase || !ownerUserId) return
    const { data } = await supabase.from('bem_aviv_price_tables').select('id, name, description').eq('user_id', ownerUserId).order('name')
    setRows((data as PriceTable[]) ?? [])
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
      <div className="table-wrap">
        <table>
          <thead><tr><th>NOME</th><th>DESCRIÇÃO</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.description || '—'}</td>
                <td className="whitespace-nowrap">
                  <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
