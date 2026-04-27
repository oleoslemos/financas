import { useUser } from '@clerk/clerk-react'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type ProjectClientRow = {
  id: string
  name: string
  project_code: string | null
  active: boolean
  notes: string | null
}

export function ProjectClientsPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<ProjectClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [notes, setNotes] = useState('')

  const loadRows = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('project_clients')
      .select('id, name, project_code, active, notes')
      .eq('user_id', ownerUserId)
      .order('active', { ascending: false })
      .order('name', { ascending: true })
    if (error) alert(error.message)
    setRows((data as ProjectClientRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  async function createProjectClient(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const safeName = name.trim().toUpperCase()
    if (!safeName) return
    const { error } = await supabase.from('project_clients').insert({
      user_id: ownerUserId,
      name: safeName,
      project_code: projectCode.trim().toUpperCase() || null,
      notes: notes.trim() || null,
      active: true,
    })
    if (error) {
      alert(error.message)
      return
    }
    setName('')
    setProjectCode('')
    setNotes('')
    await loadRows()
  }

  async function setActive(id: string, active: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('project_clients').update({ active }).eq('id', id)
    if (error) alert(error.message)
    else await loadRows()
  }

  async function removeRow(id: string) {
    if (!supabase || !confirm('Excluir projeto/cliente?')) return
    const { error } = await supabase.from('project_clients').delete().eq('id', id)
    if (error) alert(error.message)
    else await loadRows()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Cadastro de Projetos/Clientes</h2>
        <p className="text-sm text-slate-600">Cadastro específico do módulo de projetos (independente da Bem Aviv).</p>
      </header>

      <form onSubmit={createProjectClient} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Novo projeto/cliente</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label>Código (opcional)</label>
            <input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="EX: PRJ-001" />
          </div>
          <div className="sm:col-span-2">
            <label>Observações</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
          <Plus size={16} />
          Cadastrar
        </Button>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 text-slate-500">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando...
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum cadastro encontrado.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {row.name} {row.project_code ? `(${row.project_code})` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.active ? 'Ativo' : 'Inativo'} {row.notes ? `• ${row.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void setActive(row.id, !row.active)}>
                    {row.active ? 'Inativar' : 'Reativar'}
                  </Button>
                  <Button type="button" variant="ghost" className="inline-flex h-8 w-8 items-center justify-center p-0 text-red-600" onClick={() => void removeRow(row.id)}>
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
