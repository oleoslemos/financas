import { useUser } from '@clerk/clerk-react'
import { LoaderCircle, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type AssigneeRow = {
  id: string
  name: string
  email: string | null
  active: boolean
}

export function ProjectAssigneesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<AssigneeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const loadRows = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('project_assignees')
      .select('id, name, email, active')
      .eq('user_id', ownerUserId)
      .order('active', { ascending: false })
      .order('name', { ascending: true })
    if (error) alert(error.message)
    setRows((data as AssigneeRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  function resetForm() {
    setEditingId(null)
    setName('')
    setEmail('')
  }

  async function saveAssignee(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const payload = {
      user_id: ownerUserId,
      name: name.trim().toUpperCase(),
      email: email.trim().toLowerCase() || null,
      active: true,
    }
    if (!payload.name) return
    const { error } = editingId
      ? await supabase.from('project_assignees').update(payload).eq('id', editingId)
      : await supabase.from('project_assignees').insert(payload)
    if (error) {
      alert(error.message)
      return
    }
    resetForm()
    await loadRows()
  }

  async function setActive(id: string, active: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('project_assignees').update({ active }).eq('id', id)
    if (error) alert(error.message)
    else await loadRows()
  }

  async function removeRow(id: string) {
    if (!supabase || !confirm('Excluir responsável?')) return
    const { error } = await supabase.from('project_assignees').delete().eq('id', id)
    if (error) alert(error.message)
    else await loadRows()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Cadastro de Responsáveis</h2>
        <p className="text-sm text-slate-600">Defina os responsáveis que podem ser vinculados às tarefas do projeto.</p>
      </header>

      <form onSubmit={saveAssignee} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">{editingId ? 'Editar responsável' : 'Novo responsável'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label>E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
            <Plus size={16} />
            {editingId ? 'Salvar' : 'Cadastrar'}
          </Button>
          {editingId ? (
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 text-slate-500">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando...
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum responsável cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.email || 'Sem e-mail'} • {row.active ? 'Ativo' : 'Inativo'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white p-0 text-slate-700 hover:bg-slate-100" onClick={() => { setEditingId(row.id); setName(row.name); setEmail(row.email ?? '') }}>
                    <Pencil size={14} />
                  </Button>
                  <Button type="button" variant="ghost" className="inline-flex h-8 items-center gap-1 border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-100" onClick={() => void setActive(row.id, !row.active)}>
                    <Power size={13} />
                    {row.active ? 'Inativar' : 'Reativar'}
                  </Button>
                  <Button type="button" variant="ghost" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 bg-white p-0 text-red-600 hover:bg-red-50" onClick={() => void removeRow(row.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
