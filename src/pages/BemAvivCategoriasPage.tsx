import { useUser } from '@clerk/clerk-react'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'

type Cat = { id: string; name: string }

export function BemAvivCategoriasPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Cat[]>([])
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    const { data } = await supabase.from('bem_aviv_categories').select('id, name').eq('user_id', ownerUserId).order('name')
    setRows((data as Cat[]) ?? [])
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const { error } = await supabase.from('bem_aviv_categories').insert({ user_id: ownerUserId, name: toUpperTrim(name) })
    if (error) alert(error.message)
    else {
      setName('')
      load()
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR CATEGORIA?')) return
    const { error } = await supabase.from('bem_aviv_categories').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">GERAL — CATEGORIAS</h2>
      <form onSubmit={submit} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button variant="primary">ADICIONAR</Button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>NOME</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="whitespace-nowrap">
                  <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                    <Trash2 size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
