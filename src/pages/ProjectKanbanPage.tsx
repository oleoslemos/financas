import { useUser } from '@clerk/clerk-react'
import { CalendarDays, Eye, EyeOff, LoaderCircle, MoveRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

type TaskRow = {
  id: string
  title: string
  details: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  panel: string | null
  project_client_id: string | null
  estimated_time_hhmm: string | null
  assignee_id: string | null
  assignee?: { name: string | null } | null
  project_client?: { name: string | null; project_code: string | null } | null
  created_at: string
}
type TaskRowRaw = Omit<TaskRow, 'project_client' | 'assignee'> & {
  project_client?: { name: string | null; project_code: string | null } | Array<{ name: string | null; project_code: string | null }> | null
  assignee?: { name: string | null } | Array<{ name: string | null }> | null
}
type ProjectClientOption = {
  id: string
  name: string
  project_code: string | null
  active: boolean
  panels: string[] | null
}
type AssigneeOption = {
  id: string
  name: string
  active: boolean
}
type WorklogRow = {
  id: string
  task_id: string
  description: string
  duration_hhmm: string
  created_at: string
}

const statusColumns: Array<{ key: TaskStatus; title: string }> = [
  { key: 'BACKLOG', title: 'Backlog' },
  { key: 'TODO', title: 'A Fazer' },
  { key: 'IN_PROGRESS', title: 'Em andamento' },
  { key: 'REVIEW', title: 'Revisão' },
  { key: 'DONE', title: 'Concluído' },
]

const priorityLabel: Record<TaskPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
}

export function ProjectKanbanPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [hideBacklogColumn, setHideBacklogColumn] = useState(true)
  const [hideDoneColumn, setHideDoneColumn] = useState(true)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('01:00')
  const [projectClientId, setProjectClientId] = useState('')
  const [panel, setPanel] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [projectClients, setProjectClients] = useState<ProjectClientOption[]>([])
  const [assignees, setAssignees] = useState<AssigneeOption[]>([])
  const [worklogsByTask, setWorklogsByTask] = useState<Record<string, WorklogRow[]>>({})
  const [worklogTaskId, setWorklogTaskId] = useState<string | null>(null)
  const [worklogDescription, setWorklogDescription] = useState('')
  const [worklogDuration, setWorklogDuration] = useState('00:30')

  const loadTasks = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('project_tasks')
      .select('id, title, details, status, priority, due_date, panel, project_client_id, estimated_time_hhmm, assignee_id, created_at, project_client:project_client_id(name, project_code), assignee:assignee_id(name)')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    const mapped = ((data as TaskRowRaw[]) ?? []).map((row) => ({
      ...row,
      project_client: Array.isArray(row.project_client) ? (row.project_client[0] ?? null) : (row.project_client ?? null),
      assignee: Array.isArray(row.assignee) ? (row.assignee[0] ?? null) : (row.assignee ?? null),
    }))
    setRows(mapped)
    const taskIds = mapped.map((row) => row.id)
    if (taskIds.length > 0) {
      await loadWorklogs(taskIds)
    } else {
      setWorklogsByTask({})
    }
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

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

  const loadAssignees = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    const { data, error } = await supabase
      .from('project_assignees')
      .select('id, name, active')
      .eq('user_id', ownerUserId)
      .eq('active', true)
      .order('name', { ascending: true })
    if (error) {
      alert(error.message)
      return
    }
    setAssignees((data as AssigneeOption[]) ?? [])
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadProjectClients()
    void loadAssignees()
  }, [loadAssignees, loadProjectClients])

  const availablePanels = useMemo(() => {
    const selected = projectClients.find((item) => item.id === projectClientId)
    return selected?.panels ?? []
  }, [projectClientId, projectClients])

  async function moveTask(id: string, status: TaskStatus) {
    if (!supabase) return
    const { error } = await supabase.from('project_tasks').update({ status }).eq('id', id)
    if (error) alert(error.message)
    else await loadTasks()
  }

  async function handleDrop(status: TaskStatus) {
    if (!dragTaskId) return
    const current = rows.find((task) => task.id === dragTaskId)
    if (!current || current.status === status) {
      setDragTaskId(null)
      setDragOverStatus(null)
      return
    }
    await moveTask(dragTaskId, status)
    setDragTaskId(null)
    setDragOverStatus(null)
  }

  const grouped = useMemo(
    () => ({
      BACKLOG: rows.filter((r) => r.status === 'BACKLOG'),
      TODO: rows.filter((r) => r.status === 'TODO'),
      IN_PROGRESS: rows.filter((r) => r.status === 'IN_PROGRESS'),
      REVIEW: rows.filter((r) => r.status === 'REVIEW'),
      DONE: rows.filter((r) => r.status === 'DONE'),
    }),
    [rows],
  )

  const visibleColumns = useMemo(
    () => statusColumns.filter((column) => !(hideDoneColumn && column.key === 'DONE') && !(hideBacklogColumn && column.key === 'BACKLOG')),
    [hideDoneColumn, hideBacklogColumn],
  )

  async function createTodoTask(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const safeTitle = title.trim().toUpperCase()
    if (!safeTitle) return
    if (estimatedTime && !/^\d{2}:[0-5]\d$/.test(estimatedTime)) {
      alert('Tempo estimado inválido. Use hh:mm (ex.: 01:30).')
      return
    }
    const { error } = await supabase.from('project_tasks').insert({
      user_id: ownerUserId,
      title: safeTitle,
      details: details.trim().toUpperCase() || null,
      priority,
      due_date: dueDate || null,
      panel: panel || null,
      estimated_time_hhmm: estimatedTime || null,
      status: 'TODO',
      project_client_id: projectClientId || null,
      assignee_id: assigneeId || null,
    })
    if (error) {
      alert(error.message)
      return
    }
    setTitle('')
    setDetails('')
    setPriority('MEDIUM')
    setDueDate('')
    setEstimatedTime('01:00')
    setProjectClientId('')
    setPanel('')
    setAssigneeId('')
    setModalOpen(false)
    await loadTasks()
  }

  async function loadWorklogs(taskIds: string[]) {
    if (!supabase || !ownerUserId || taskIds.length === 0) return
    const { data, error } = await supabase
      .from('project_task_worklogs')
      .select('id, task_id, description, duration_hhmm, created_at')
      .eq('user_id', ownerUserId)
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
    if (error) {
      alert(error.message)
      return
    }
    const grouped: Record<string, WorklogRow[]> = {}
    ;((data as WorklogRow[]) ?? []).forEach((row) => {
      if (!grouped[row.task_id]) grouped[row.task_id] = []
      grouped[row.task_id].push(row)
    })
    setWorklogsByTask(grouped)
  }

  function startEditTask(task: TaskRow) {
    setEditTaskId(task.id)
    setTitle(task.title ?? '')
    setDetails(task.details ?? '')
    setPriority(task.priority)
    setDueDate(task.due_date ?? '')
    setEstimatedTime(task.estimated_time_hhmm ?? '01:00')
    setProjectClientId(task.project_client_id ?? '')
    setPanel(task.panel ?? '')
    setAssigneeId(task.assignee_id ?? '')
  }

  async function saveTaskEdits(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !editTaskId) return
    const safeTitle = title.trim().toUpperCase()
    if (!safeTitle) return
    if (estimatedTime && !/^\d{2}:[0-5]\d$/.test(estimatedTime)) {
      alert('Tempo estimado inválido. Use hh:mm (ex.: 01:30).')
      return
    }
    const { error } = await supabase
      .from('project_tasks')
      .update({
        title: safeTitle,
        details: details.trim().toUpperCase() || null,
        priority,
        due_date: dueDate || null,
        panel: panel || null,
        estimated_time_hhmm: estimatedTime || null,
        project_client_id: projectClientId || null,
        assignee_id: assigneeId || null,
      })
      .eq('id', editTaskId)
    if (error) {
      alert(error.message)
      return
    }
    setEditTaskId(null)
    await loadTasks()
  }

  async function concludeEditingTask() {
    if (!editTaskId) return
    await moveTask(editTaskId, 'DONE')
    setEditTaskId(null)
  }

  function sumDurations(logs: WorklogRow[]) {
    const totalMinutes = logs.reduce((acc, row) => {
      const [h, m] = row.duration_hhmm.split(':').map((v) => Number(v))
      return acc + h * 60 + m
    }, 0)
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }

  async function addWorklog(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !worklogTaskId) return
    const safeDescription = worklogDescription.trim().toUpperCase()
    const safeDuration = worklogDuration.trim()
    if (!safeDescription) return
    if (!/^\d{2}:[0-5]\d$/.test(safeDuration)) {
      alert('Tempo inválido. Use o formato hh:mm, por exemplo 01:30.')
      return
    }
    const { error } = await supabase.from('project_task_worklogs').insert({
      user_id: ownerUserId,
      task_id: worklogTaskId,
      description: safeDescription,
      duration_hhmm: safeDuration,
    })
    if (error) {
      alert(error.message)
      return
    }
    setWorklogDescription('')
    setWorklogDuration('00:30')
    await loadTasks()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Quadro Kanban</h2>
        <p className="text-sm text-slate-600">Fluxo visual de tarefas e atividades em colunas.</p>
        <div className="mt-3">
          <Button type="button" variant="primary" className="mr-2 inline-flex items-center gap-2" onClick={() => setModalOpen(true)}>
            Adicionar tarefa em A Fazer
          </Button>
          <Button type="button" variant="ghost" className="mr-2 inline-flex items-center gap-2" onClick={() => setHideBacklogColumn((current) => !current)}>
            {hideBacklogColumn ? <Eye size={15} /> : <EyeOff size={15} />}
            {hideBacklogColumn ? 'Mostrar coluna Backlog' : 'Ocultar coluna Backlog'}
          </Button>
          <Button type="button" variant="ghost" className="inline-flex items-center gap-2" onClick={() => setHideDoneColumn((current) => !current)}>
            {hideDoneColumn ? <Eye size={15} /> : <EyeOff size={15} />}
            {hideDoneColumn ? 'Mostrar coluna Concluído' : 'Ocultar coluna Concluído'}
          </Button>
        </div>
      </header>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <p className="inline-flex items-center gap-2">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando quadro...
          </p>
        </section>
      ) : (
        <section className={`grid gap-4 ${visibleColumns.length === 3 ? 'lg:grid-cols-3' : visibleColumns.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
          {visibleColumns.map((column) => (
            <article
              key={column.key}
              className={`rounded-2xl border bg-white p-3 shadow-sm transition-colors ${
                dragOverStatus === column.key ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverStatus(column.key)
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                setDragOverStatus(column.key)
              }}
              onDragLeave={() => {
                setDragOverStatus((current) => (current === column.key ? null : current))
              }}
              onDrop={(e) => {
                e.preventDefault()
                void handleDrop(column.key)
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{column.title}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{grouped[column.key].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[column.key].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">Sem itens nesta coluna.</p>
                ) : (
                  grouped[column.key].map((task) => (
                    <div
                      key={task.id}
                      className={`rounded-xl border p-3 ${
                        dragTaskId === task.id ? 'cursor-grabbing border-emerald-400 bg-emerald-50/50' : 'cursor-grab border-slate-200'
                      }`}
                      draggable
                      onDragStart={() => {
                        setDragTaskId(task.id)
                      }}
                      onDragEnd={() => {
                        setDragTaskId(null)
                        setDragOverStatus(null)
                      }}
                    >
                      <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                      {task.details ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.details}</p> : null}
                      {task.panel ? <p className="mt-1 text-xs text-slate-600">Painel: {task.panel}</p> : null}
                      {task.estimated_time_hhmm ? <p className="mt-1 text-xs text-slate-600">Tempo estimado: {task.estimated_time_hhmm}</p> : null}
                      {task.assignee?.name ? <p className="mt-1 text-xs text-slate-600">Responsável: {task.assignee.name}</p> : null}
                      {worklogsByTask[task.id]?.length ? (
                        <button type="button" className="mt-1 text-left text-xs text-indigo-700 hover:underline" onClick={() => setWorklogTaskId(task.id)}>
                          Registros: {worklogsByTask[task.id].length} • Tempo total: {sumDurations(worklogsByTask[task.id])}
                        </button>
                      ) : (
                        <button type="button" className="mt-1 text-left text-xs text-slate-400 hover:text-slate-600 hover:underline" onClick={() => setWorklogTaskId(task.id)}>
                          Sem registros de execução
                        </button>
                      )}
                      {task.project_client?.name ? (
                        <p className="mt-1 text-xs text-emerald-700">
                          {task.project_client.name}
                          {task.project_client.project_code ? ` (${task.project_client.project_code})` : ''}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>Prioridade: {priorityLabel[task.priority]}</span>
                        {task.due_date ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={12} />
                            {task.due_date}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => setWorklogTaskId(task.id)}
                        >
                          Registrar atividade
                        </Button>
                        <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => startEditTask(task)}>
                          Editar tarefa
                        </Button>
                        {task.status !== 'TODO' ? (
                          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void moveTask(task.id, 'TODO')}>
                            <MoveRight size={13} />
                            A Fazer
                          </Button>
                        ) : null}
                        {task.status !== 'IN_PROGRESS' ? (
                          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void moveTask(task.id, 'IN_PROGRESS')}>
                            <MoveRight size={13} />
                            Em andamento
                          </Button>
                        ) : null}
                        {task.status !== 'REVIEW' ? (
                          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void moveTask(task.id, 'REVIEW')}>
                            <MoveRight size={13} />
                            Revisão
                          </Button>
                        ) : null}
                        {task.status !== 'DONE' ? (
                          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void moveTask(task.id, 'DONE')}>
                            <MoveRight size={13} />
                            Concluir
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Adicionar tarefa em A Fazer</h3>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100" onClick={() => setModalOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <form onSubmit={createTodoTask} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label>Projeto</label>
                <select value={projectClientId} onChange={(e) => { setProjectClientId(e.target.value); setPanel('') }} required>
                  <option value="">SELECIONE</option>
                  {projectClients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.project_code ? `${item.project_code} - ` : ''}{item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Painel</label>
                <select value={panel} onChange={(e) => setPanel(e.target.value)}>
                  <option value="">SELECIONE</option>
                  {availablePanels.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Responsável</label>
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">SELECIONE</option>
                  {assignees.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Prazo</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label>Prioridade</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                  <option value="HIGH">ALTA</option>
                  <option value="MEDIUM">MÉDIA</option>
                  <option value="LOW">BAIXA</option>
                </select>
              </div>
              <div>
                <label>Tempo estimado (hh:mm)</label>
                <input value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} placeholder="01:30" />
              </div>
              <div className="sm:col-span-2">
                <label>Título</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label>Descrição</label>
                <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <Button type="submit" variant="primary">Adicionar</Button>
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {worklogTaskId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Registro de execução da atividade</h3>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100" onClick={() => setWorklogTaskId(null)}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={addWorklog} className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
              <div>
                <label>O que foi realizado</label>
                <input value={worklogDescription} onChange={(e) => setWorklogDescription(e.target.value)} required />
              </div>
              <div>
                <label>Tempo (hh:mm)</label>
                <input value={worklogDuration} onChange={(e) => setWorklogDuration(e.target.value)} placeholder="01:30" />
              </div>
              <div className="self-end">
                <Button type="submit" variant="primary">Salvar</Button>
              </div>
            </form>

            <div className="mt-4 max-h-64 space-y-2 overflow-auto rounded-lg border border-slate-200 p-3">
              {(worklogsByTask[worklogTaskId] ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum registro para esta atividade.</p>
              ) : (
                (worklogsByTask[worklogTaskId] ?? []).map((row) => (
                  <div key={row.id} className="rounded-md border border-slate-200 p-2">
                    <p className="text-sm font-medium text-slate-900">{row.description}</p>
                    <p className="text-xs text-slate-500">Tempo: {row.duration_hhmm}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editTaskId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Editar tarefa</h3>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100" onClick={() => setEditTaskId(null)}>
                <X size={14} />
              </button>
            </div>
            <form onSubmit={saveTaskEdits} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label>Projeto</label>
                <select value={projectClientId} onChange={(e) => { setProjectClientId(e.target.value); setPanel('') }}>
                  <option value="">SELECIONE</option>
                  {projectClients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.project_code ? `${item.project_code} - ` : ''}{item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Painel</label>
                <select value={panel} onChange={(e) => setPanel(e.target.value)}>
                  <option value="">SELECIONE</option>
                  {availablePanels.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Responsável</label>
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">SELECIONE</option>
                  {assignees.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Prazo</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label>Prioridade</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                  <option value="HIGH">ALTA</option>
                  <option value="MEDIUM">MÉDIA</option>
                  <option value="LOW">BAIXA</option>
                </select>
              </div>
              <div>
                <label>Tempo estimado (hh:mm)</label>
                <input value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} placeholder="01:30" />
              </div>
              <div className="sm:col-span-2">
                <label>Título</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label>Descrição</label>
                <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <Button type="submit" variant="primary">Salvar edição</Button>
                <Button type="button" variant="secondary" onClick={() => void concludeEditingTask()}>Concluir</Button>
                <Button type="button" variant="ghost" onClick={() => setEditTaskId(null)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
