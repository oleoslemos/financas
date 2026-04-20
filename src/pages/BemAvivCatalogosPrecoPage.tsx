import { useUser } from '@clerk/clerk-react'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'

type Catalog = {
  id: string
  name: string
  description: string | null
  valid_from: string | null
  valid_to: string | null
  is_default: boolean
}

export function BemAvivCatalogosPrecoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Catalog[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_price_catalogs')
      .select('id, name, description, valid_from, valid_to, is_default')
      .eq('user_id', ownerUserId)
      .order('name')
    if (error) alert(error.message)
    setRows((data as Catalog[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const nm = toUpperTrim(name)
    if (!nm) {
      alert('INFORME O NOME DO CATÁLOGO.')
      return
    }
    if (isDefault) {
      await supabase.from('bem_aviv_price_catalogs').update({ is_default: false }).eq('user_id', ownerUserId)
    }
    const { error } = await supabase.from('bem_aviv_price_catalogs').insert({
      user_id: ownerUserId,
      name: nm,
      description: toUpperTrim(description) || null,
      valid_from: null,
      valid_to: null,
      is_default: isDefault,
    })
    if (error) alert(error.message)
    else {
      setName('')
      setDescription('')
      setIsDefault(false)
      await load()
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR ESTE CATÁLOGO E TODOS OS BLOCOS/MATRIZES?')) return
    const { error } = await supabase.from('bem_aviv_price_catalogs').delete().eq('id', id)
    if (error) alert(error.message)
    else await load()
  }

  async function setAsDefault(id: string) {
    if (!supabase || !ownerUserId) return
    await supabase.from('bem_aviv_price_catalogs').update({ is_default: false }).eq('user_id', ownerUserId)
    const { error } = await supabase.from('bem_aviv_price_catalogs').update({ is_default: true }).eq('id', id).eq('user_id', ownerUserId)
    if (error) alert(error.message)
    else await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">GERAL — CATÁLOGOS EM GRADE</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 normal-case">
          Cada catálogo agrupa blocos de preço em matriz (linha × coluna). O Supabase guarda tabelas relacionadas; a matriz é montada na próxima tela ao abrir um bloco.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label>NOME DO CATÁLOGO</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label>DESCRIÇÃO (OPCIONAL)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input id="cat-default" type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          <label htmlFor="cat-default" className="mb-0 font-normal normal-case">
            Definir como catálogo padrão
          </label>
        </div>
        <div className="sm:col-span-2">
          <Button variant="primary">ADICIONAR CATÁLOGO</Button>
        </div>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>NOME</th>
                <th>PADRÃO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/bem-aviv/catalogos-preco/${r.id}`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">
                      {r.name}
                    </Link>
                    {r.description ? <span className="mt-0.5 block text-xs font-normal normal-case text-slate-500">{r.description}</span> : null}
                  </td>
                  <td>{r.is_default ? 'SIM' : '—'}</td>
                  <td className="whitespace-nowrap">
                    {!r.is_default ? (
                      <Button type="button" variant="secondary" className="mr-2" onClick={() => setAsDefault(r.id)}>
                        USAR COMO PADRÃO
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                      <Trash2 size={16} />
                    </Button>
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
