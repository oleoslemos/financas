import { useUser } from '@clerk/clerk-react'
import { CheckCircle2, CircleDashed, LoaderCircle, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toISODate } from '../lib/dates'
import { toUpperTrim } from '../lib/text'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

type TaskRow = {
  id: string
  title: string
  details: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  source: 'LOCAL' | 'GOOGLE_TASKS' | 'LARK_TASK'
  google_sync_enabled: boolean
  google_external_id: string | null
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

const priorityLabel: Record<TaskPriority, string> = {
  LOW: 'BAIXA',
  MEDIUM: 'MÉDIA',
  HIGH: 'ALTA',
}

export function TasksPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [dueDate, setDueDate] = useState(toISODate(new Date()))
  const [mirrorGoogle, setMirrorGoogle] = useState(true)
  const [projectClientId, setProjectClientId] = useState('')
  const [projectClients, setProjectClients] = useState<ProjectClientOption[]>([])

  const loadTasks = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('lsh_tasks')
      .select('id, title, details, status, priority, due_date, source, google_sync_enabled, google_external_id, project_client_id, created_at, project_client:project_client_id(name, project_code)')
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
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
      if (!q) return true
      const normalizedTitle = (r.title ?? '').toUpperCase()
      const normalizedDetails = (r.details ?? '').toUpperCase()
      return normalizedTitle.includes(q) || normalizedDetails.includes(q)
    })
  }, [rows, statusFilter, deferredQuery])

  const kpi = useMemo(() => {
    return {
      total: rows.length,
      todo: rows.filter((r) => r.status === 'TODO').length,
      inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
      done: rows.filter((r) => r.status === 'DONE').length,
    }
  }, [rows])

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const safeTitle = toUpperTrim(title)
    if (!safeTitle) return
    const { error } = await supabase.from('lsh_tasks').insert({
      user_id: ownerUserId,
      title: safeTitle,
      details: toUpperTrim(details) || null,
      priority,
      status: 'TODO',
      due_date: dueDate || null,
      source: 'LOCAL',
      google_sync_enabled: mirrorGoogle,
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
    setMirrorGoogle(true)
    setProjectClientId('')
    await loadTasks()
  }

  async function setGoogleMirror(id: string, enabled: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ google_sync_enabled: enabled }).eq('id', id)
    if (error) alert(error.message)
    else await loadTasks()
  }

  async function setStatus(id: string, status: TaskStatus) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ status }).eq('id', id)
    if (error) alert(error.message)
    else await loadTasks()
  }

  async function removeTask(id: string) {
    if (!supabase || !confirm('Excluir tarefa?')) return
    const { error } = await supabase.from('lsh_tasks').delete().eq('id', id)
    if (error) alert(error.message)
    else await loadTasks()
  }

  async function setProjectClient(taskId: string, value: string) {
    if (!supabase) return
    const { error } = await supabase
      .from('lsh_tasks')
      .update({ project_client_id: value || null })
      .eq('id', taskId)
    if (error) alert(error.message)
    else await loadTasks()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">TAREFAS</h2>
        <p className="text-xs text-slate-600">CADASTRO E ACOMPANHAMENTO DE EXECUÇÃO</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">TOTAL</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{kpi.total}</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs text-amber-700">PENDENTES</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{kpi.todo}</p>
        </article>
        <article className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <p className="text-xs text-sky-700">EM ANDAMENTO</p>
          <p className="mt-1 text-2xl font-semibold text-sky-900">{kpi.inProgress}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs text-emerald-700">CONCLUÍDAS</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{kpi.done}</p>
        </article>
      </section>

      <form
        id="nova-tarefa"
        onSubmit={createTask}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-slate-800">NOVA TAREFA</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <label>Descrição</label>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} />
          </div>
          <div>
            <label>Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="LOW">BAIXA</option>
              <option value="MEDIUM">MÉDIA</option>
              <option value="HIGH">ALTA</option>
            </select>
          </div>
          <div>
            <label>Prazo</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label>Projeto/Cliente</label>
            <select value={projectClientId} onChange={(e) => setProjectClientId(e.target.value)}>
              <option value="">SEM VÍNCULO</option>
              {projectClients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.project_code ? `(${item.project_code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              id="mirror-google"
              type="checkbox"
              checked={mirrorGoogle}
              onChange={(e) => setMirrorGoogle(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="mirror-google" className="mb-0 cursor-pointer text-sm text-slate-700">
              Espelhar no Google Tasks (título, prazo, status e trecho da descrição — a descrição completa fica no sistema)
            </label>
          </div>
        </div>
        <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
          <Plus size={16} />
          ADICIONAR TAREFA
        </Button>
      </form>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="relative mb-0 block">
            <span className="sr-only">Buscar tarefas</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="pl-9"
              placeholder="BUSCAR POR TÍTULO OU DESCRIÇÃO"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TaskStatus)}>
            <option value="ALL">TODOS OS STATUS</option>
            <option value="TODO">PENDENTE</option>
            <option value="IN_PROGRESS">EM ANDAMENTO</option>
            <option value="DONE">CONCLUÍDA</option>
          </select>
        </div>

        <div className="table-wrap">
          {loading ? (
            <p className="flex items-center gap-2 p-4 text-slate-500">
              <LoaderCircle size={14} className="animate-spin" />
              CARREGANDO TAREFAS...
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">NENHUMA TAREFA ENCONTRADA PARA O FILTRO ATUAL.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>TÍTULO</th>
                  <th>PRIORIDADE</th>
                  <th>PRAZO</th>
                  <th>STATUS</th>
                  <th>PROJETO/CLIENTE</th>
                  <th>GOOGLE</th>
                  <th className="text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <div className="max-w-[360px]">
                        <p className="truncate font-semibold text-slate-900">{task.title}</p>
                        {task.details ? <p className="truncate text-xs text-slate-500">{task.details}</p> : null}
                      </div>
                    </td>
                    <td>{priorityLabel[task.priority]}</td>
                    <td>{task.due_date || '—'}</td>
                    <td>{statusLabel[task.status]}</td>
                    <td>
                      <select
                        value={task.project_client_id ?? ''}
                        onChange={(e) => void setProjectClient(task.id, e.target.value)}
                        className="max-w-[220px]"
                      >
                        <option value="">SEM VÍNCULO</option>
                        {projectClients.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} {item.project_code ? `(${item.project_code})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {task.source === 'LOCAL' ? (
                        <label className="mb-0 flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={task.google_sync_enabled}
                            onChange={(e) => void setGoogleMirror(task.id, e.target.checked)}
                            className="h-3.5 w-3.5"
                          />
                          {task.google_external_id ? 'Espelho' : 'Off'}
                        </label>
                      ) : task.source === 'GOOGLE_TASKS' ? (
                        <span className="text-xs text-slate-500">Importada</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {task.status === 'TODO' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="inline-flex h-9 w-9 items-center justify-center p-0"
                            aria-label="INICIAR"
                            title="INICIAR"
                            onClick={() => void setStatus(task.id, 'IN_PROGRESS')}
                          >
                            <CircleDashed size={16} />
                          </Button>
                        ) : null}
                        {task.status === 'IN_PROGRESS' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="inline-flex h-9 w-9 items-center justify-center p-0"
                            aria-label="CONCLUIR"
                            title="CONCLUIR"
                            onClick={() => void setStatus(task.id, 'DONE')}
                          >
                            <CheckCircle2 size={16} />
                          </Button>
                        ) : null}
                        {task.status === 'DONE' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="inline-flex h-9 w-9 items-center justify-center p-0"
                            aria-label="REABRIR"
                            title="REABRIR"
                            onClick={() => void setStatus(task.id, 'TODO')}
                          >
                            <RotateCcw size={16} />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                          aria-label="EXCLUIR"
                          title="EXCLUIR"
                          onClick={() => void removeTask(task.id)}
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
      </section>
    </div>
  )
}
