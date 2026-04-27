import { useUser } from '@clerk/clerk-react'
import { LoaderCircle, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { toISODate } from '../lib/dates'
import { toUpperTrim } from '../lib/text'

type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'
type TaskRow = {
  id: string
  title: string
  details: string | null
  priority: TaskPriority
  due_date: string | null
  panel: string | null
  project_client_id: string | null
  project_client?: { name: string | null; project_code: string | null } | null
  created_at: string
}
type TaskRowRaw = Omit<TaskRow, 'project_client'> & {
  project_client?: { name: string | null; project_code: string | null } | Array<{ name: string | null; project_code: string | null }> | null
}

type ProjectClientOption = {
  id: string
  name: string
  project_code: string | null
  active: boolean
  panels: string[] | null
}

const priorityRank: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export function ProjectBacklogPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [dueDate, setDueDate] = useState(toISODate(new Date()))
  const [projectClientId, setProjectClientId] = useState('')
  const [panel, setPanel] = useState('')
  const [projectClients, setProjectClients] = useState<ProjectClientOption[]>([])
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [panelFilter, setPanelFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL')

  const loadBacklog = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('project_tasks')
      .select('id, title, details, priority, due_date, panel, project_client_id, created_at, project_client:project_client_id(name, project_code)')
      .eq('user_id', ownerUserId)
      .eq('status', 'TODO')
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    const mapped = ((data as TaskRowRaw[]) ?? []).map((row) => ({
      ...row,
      project_client: Array.isArray(row.project_client) ? (row.project_client[0] ?? null) : (row.project_client ?? null),
    }))
    setRows(mapped)
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadBacklog()
  }, [loadBacklog])

  const loadProjectClients = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    const { data, error } = await supabase
      .from('project_clients')
      .select('id, name, project_code, active, panels')
      .eq('user_id', ownerUserId)
      .eq('active', true)
      .order('name', { ascending: true })
    if (error) {
      alert(error.message)
      return
    }
    setProjectClients((data as ProjectClientOption[]) ?? [])
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadProjectClients()
  }, [loadProjectClients])

  const availablePanels = useMemo(() => {
    const selected = projectClients.find((item) => item.id === projectClientId)
    return selected?.panels ?? []
  }, [projectClientId, projectClients])

  const panelFilters = useMemo(() => {
    const all = new Set<string>()
    rows.forEach((row) => {
      if (row.panel) all.add(row.panel)
    })
    return [...all]
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return rows.filter((row) => {
      if (projectFilter && row.project_client_id !== projectFilter) return false
      if (panelFilter && (row.panel ?? '') !== panelFilter) return false
      if (priorityFilter !== 'ALL' && row.priority !== priorityFilter) return false
      if (!q) return true
      return (row.title ?? '').toUpperCase().includes(q) || (row.details ?? '').toUpperCase().includes(q)
    })
  }, [rows, query, projectFilter, panelFilter, priorityFilter])

  const ordered = useMemo(
    () => [...filtered].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]),
    [filtered],
  )

  async function createBacklogItem(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const safeTitle = toUpperTrim(title)
    if (!safeTitle) return
    const { error } = await supabase.from('project_tasks').insert({
      user_id: ownerUserId,
      title: safeTitle,
      details: toUpperTrim(details) || null,
      priority,
      due_date: dueDate || null,
      panel: toUpperTrim(panel) || null,
      status: 'TODO',
      project_client_id: projectClientId || null,
    })
    if (error) {
      alert(error.message)
      return
    }
    setTitle('')
    setDetails('')
    setPriority('MEDIUM')
    setDueDate(toISODate(new Date()))
    setProjectClientId('')
    setPanel('')
    setModalOpen(false)
    await loadBacklog()
  }

  async function sendToExecution(id: string) {
    if (!supabase) return
    const { error } = await supabase.from('project_tasks').update({ status: 'IN_PROGRESS' }).eq('id', id)
    if (error) alert(error.message)
    else await loadBacklog()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Backlog e priorização</h2>
        <p className="text-sm text-slate-600">Organize demandas antes de enviar para execução.</p>
        <div className="mt-3">
          <Button type="button" variant="primary" className="inline-flex items-center gap-2" onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            Novo item do backlog
          </Button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Filtros</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label>Buscar</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título ou descrição" />
          </div>
          <div>
            <label>Projeto</label>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">TODOS</option>
              {projectClients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.project_code ? `${item.project_code} - ` : ''}
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Painel</label>
            <select value={panelFilter} onChange={(e) => setPanelFilter(e.target.value)}>
              <option value="">TODOS</option>
              {panelFilters.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Prioridade</label>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | TaskPriority)}>
              <option value="ALL">TODAS</option>
              <option value="HIGH">ALTA</option>
              <option value="MEDIUM">MÉDIA</option>
              <option value="LOW">BAIXA</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 text-slate-500">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando backlog...
          </p>
        ) : ordered.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum item pendente no backlog.</p>
        ) : (
          <div className="space-y-2">
            {ordered.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    Prioridade: {task.priority} {task.due_date ? `• Prazo: ${task.due_date}` : ''}
                  </p>
                  {task.panel ? <p className="text-xs text-slate-600">Painel: {task.panel}</p> : null}
                  {task.project_client?.name ? (
                    <p className="text-xs text-emerald-700">
                      Projeto/Cliente: {task.project_client.name}
                      {task.project_client.project_code ? ` (${task.project_client.project_code})` : ''}
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void sendToExecution(task.id)}>
                  Enviar para execução
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Novo cadastro de backlog</h3>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100" onClick={() => setModalOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <form onSubmit={createBacklogItem} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label>Projeto</label>
                  <select
                    value={projectClientId}
                    onChange={(e) => {
                      setProjectClientId(e.target.value)
                      setPanel('')
                    }}
                    required
                  >
                    <option value="">SELECIONE</option>
                    {projectClients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.project_code ? `${item.project_code} - ` : ''}
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Painel</label>
                  <select value={panel} onChange={(e) => setPanel(e.target.value)}>
                    <option value="">SELECIONE</option>
                    {availablePanels.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Prazo</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label>Título</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="sm:col-span-2">
                  <label>Descrição</label>
                  <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
                </div>
                <div>
                  <label>Prioridade</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                    <option value="HIGH">ALTA</option>
                    <option value="MEDIUM">MÉDIA</option>
                    <option value="LOW">BAIXA</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  Adicionar no backlog
                </Button>
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
