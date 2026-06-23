import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'

type FamilyMember = {
  id: string
  name: string
  created_at: string
}

export function FamilyMembersPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<FamilyMember | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase
      .from('lsh_family_members')
      .select('*')
      .eq('user_id', ownerUserId)
      .order('name')
    setRows((data as FamilyMember[]) ?? [])
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
      const { error } = await supabase
        .from('lsh_family_members')
        .update({ name: n })
        .eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setEditing(null)
        setName('')
        load()
      }
    } else {
      const { error } = await supabase
        .from('lsh_family_members')
        .insert({ user_id: ownerUserId, name: n })
      if (error) alert(error.message)
      else {
        setName('')
        load()
      }
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('Deseja realmente excluir este membro da família? Isso removerá o vínculo das despesas associadas.')) return
    const { error } = await supabase.from('lsh_family_members').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Users className="text-[#185FA5]" size={28} />
          Membros da Família
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre os membros da sua família/casa para classificar e analisar quem realizou cada despesa no fluxo de caixa e cartões.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="min-w-[240px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nome do Membro
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: João da Silva"
            required
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="h-[38px] px-5 font-semibold">
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              className="h-[38px] px-4"
              onClick={() => {
                setEditing(null)
                setName('')
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">Carregando membros da família...</p>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Users className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="text-sm">Nenhum membro da família cadastrado ainda.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3.5">Nome</th>
                <th className="px-6 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-800">{row.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        title="EDITAR"
                        aria-label="EDITAR"
                        onClick={() => {
                          setEditing(row)
                          setName(row.name)
                        }}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                        title="EXCLUIR"
                        aria-label="EXCLUIR"
                        onClick={() => remove(row.id)}
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
