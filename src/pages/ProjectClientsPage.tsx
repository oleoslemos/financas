import { useUser } from '@clerk/clerk-react'
import { LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
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
  panels: string[] | null
  project_description: string | null
}

export function ProjectClientsPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<ProjectClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [panelInput, setPanelInput] = useState('')
  const [panels, setPanels] = useState<string[]>([])

  const loadRows = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('project_clients')
      .select('id, name, project_code, active, notes, panels, project_description')
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

  function resetForm() {
    setEditingId(null)
    setName('')
    setProjectCode('')
    setProjectDescription('')
    setPanelInput('')
    setPanels([])
  }

  function addPanelFromInput() {
    const value = panelInput.trim().toUpperCase()
    if (!value) return
    if (panels.includes(value)) {
      setPanelInput('')
      return
    }
    setPanels((current) => [...current, value])
    setPanelInput('')
  }

  function removePanel(value: string) {
    setPanels((current) => current.filter((panel) => panel !== value))
  }

  async function saveProjectClient(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const safeName = name.trim().toUpperCase()
    if (!safeName) return
    const payload = {
      user_id: ownerUserId,
      name: safeName,
      project_code: projectCode.trim().toUpperCase() || null,
      project_description: projectDescription.trim().toUpperCase() || null,
      notes: projectDescription.trim().toUpperCase() || null,
      panels,
      active: true,
    }
    const { error } = editingId
      ? await supabase.from('project_clients').update(payload).eq('id', editingId)
      : await supabase.from('project_clients').insert(payload)
    if (error) {
      alert(error.message)
      return
    }
    resetForm()
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

  function startEdit(row: ProjectClientRow) {
    setEditingId(row.id)
    setName(row.name ?? '')
    setProjectCode(row.project_code ?? '')
    setProjectDescription(row.project_description ?? row.notes ?? '')
    setPanels((row.panels ?? []).map((panel) => panel.toUpperCase()))
    setPanelInput('')
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Cadastro de Projetos/Clientes</h2>
        <p className="text-sm text-slate-600">Cadastro específico do módulo de projetos (independente da Bem Aviv).</p>
      </header>

      <form onSubmit={saveProjectClient} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">{editingId ? 'Editar cadastro' : 'Novo projeto/cliente'}</h3>
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-3">
            <label>Código</label>
            <input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="EX: PRJ-001" />
          </div>
          <div className="sm:col-span-9">
            <label>Nome cliente</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="sm:col-span-12">
            <label>Painel (pode incluir mais de 1)</label>
            <div className="flex gap-2">
              <input
                value={panelInput}
                onChange={(e) => setPanelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addPanelFromInput()
                  }
                }}
                placeholder="Digite o painel e pressione Enter"
              />
              <Button type="button" variant="ghost" onClick={addPanelFromInput}>
                Adicionar painel
              </Button>
            </div>
            {panels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {panels.map((panel) => (
                  <span key={panel} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {panel}
                    <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700" onClick={() => removePanel(panel)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="sm:col-span-12">
            <label>Descrição projeto</label>
            <textarea rows={2} value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
            <Plus size={16} />
            {editingId ? 'Salvar alterações' : 'Cadastrar'}
          </Button>
          {editingId ? (
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancelar edição
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
                    {row.active ? 'Ativo' : 'Inativo'}
                  </p>
                  {row.panels && row.panels.length > 0 ? (
                    <p className="text-xs text-slate-600">Painéis: {row.panels.join(' • ')}</p>
                  ) : null}
                  {row.project_description || row.notes ? (
                    <p className="text-xs text-slate-600">Descrição: {row.project_description ?? row.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" className="inline-flex h-8 w-8 items-center justify-center p-0" onClick={() => startEdit(row)} title="Editar" aria-label="Editar">
                    <Pencil size={14} />
                  </Button>
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
