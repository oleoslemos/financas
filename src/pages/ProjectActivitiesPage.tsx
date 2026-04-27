import { useUser } from '@clerk/clerk-react'
import { CheckCircle2, CircleDashed, LoaderCircle, RotateCcw, Search } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'
type TaskRow = {
  id: string
  title: string
  details: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  project_client_id: string | null
  project_client?: { name: string | null; project_code: string | null } | null
  created_at: string
}
type ProjectClientOption = {
  id: string
  name: string
  project_code: string | null
  active: boolean
}

const statusLabel: Record<TaskStatus, string> = {
  TODO: 'PENDENTE',
  IN_PROGRESS: 'EM ANDAMENTO',
  DONE: 'CONCLUÍDA',
}

export function ProjectActivitiesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL')
  const [projectClients, setProjectClients] = useState<ProjectClientOption[]>([])

  const loadTasks = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('lsh_tasks')
      .select('id, title, details, status, priority, due_date, project_client_id, created_at, project_client:project_client_id(name, project_code)')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    setRows((data as TaskRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const loadProjectClients = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    const { data, error } = await supabase
      .from('project_clients')
      .select('id, name, project_code, active')
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

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toUpperCase()
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      if (!q) return true
      return (row.title ?? '').toUpperCase().includes(q) || (row.details ?? '').toUpperCase().includes(q)
    })
  }, [deferredQuery, rows, statusFilter])

  async function setStatus(id: string, status: TaskStatus) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ status }).eq('id', id)
    if (error) alert(error.message)
    else await loadTasks()
  }

  async function setProjectClient(taskId: string, value: string) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ project_client_id: value || null }).eq('id', taskId)
    if (error) alert(error.message)
    else await loadTasks()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Tarefas e atividades</h2>
        <p className="text-sm text-slate-600">Acompanhamento operacional das entregas do projeto.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="relative mb-0 block">
            <span className="sr-only">Buscar atividades</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="pl-9" placeholder="Buscar por título ou descrição" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TaskStatus)}>
            <option value="ALL">TODOS OS STATUS</option>
            <option value="TODO">PENDENTE</option>
            <option value="IN_PROGRESS">EM ANDAMENTO</option>
            <option value="DONE">CONCLUÍDA</option>
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 text-slate-500">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando atividades...
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma atividade encontrada para o filtro atual.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {statusLabel[task.status]} • PRIORIDADE {task.priority} {task.due_date ? `• PRAZO ${task.due_date}` : ''}
                  </p>
                  {task.project_client?.name ? (
                    <p className="text-xs text-emerald-700">
                      Projeto/Cliente: {task.project_client.name}
                      {task.project_client.project_code ? ` (${task.project_client.project_code})` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <select value={task.project_client_id ?? ''} onChange={(e) => void setProjectClient(task.id, e.target.value)} className="h-9 text-xs">
                    <option value="">SEM VÍNCULO</option>
                    {projectClients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.project_code ? `(${item.project_code})` : ''}
                      </option>
                    ))}
                  </select>
                  {task.status === 'TODO' ? (
                    <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => void setStatus(task.id, 'IN_PROGRESS')} title="Iniciar">
                      <CircleDashed size={16} />
                    </Button>
                  ) : null}
                  {task.status === 'IN_PROGRESS' ? (
                    <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => void setStatus(task.id, 'DONE')} title="Concluir">
                      <CheckCircle2 size={16} />
                    </Button>
                  ) : null}
                  {task.status === 'DONE' ? (
                    <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => void setStatus(task.id, 'TODO')} title="Reabrir">
                      <RotateCcw size={16} />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
