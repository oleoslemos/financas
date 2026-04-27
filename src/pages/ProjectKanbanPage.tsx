import { useUser } from '@clerk/clerk-react'
import { ArrowRight, CalendarDays, ClipboardList, Eye, EyeOff, LoaderCircle, Pencil, Trash2, X } from 'lucide-react'
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
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [panelFilter, setPanelFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL')
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
  const [editingWorklogId, setEditingWorklogId] = useState<string | null>(null)

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

  const allPanels = useMemo(() => {
    const unique = new Set<string>()
    projectClients.forEach((client) => {
      ;(client.panels ?? []).forEach((panelName) => unique.add(panelName))
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [projectClients])

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

  const filteredRows = useMemo(() => {
    const safeSearch = search.trim().toUpperCase()
    return rows.filter((task) => {
      const matchSearch =
        !safeSearch ||
        task.title.toUpperCase().includes(safeSearch) ||
        (task.details ?? '').toUpperCase().includes(safeSearch) ||
        (task.project_client?.name ?? '').toUpperCase().includes(safeSearch) ||
        (task.project_client?.project_code ?? '').toUpperCase().includes(safeSearch) ||
        (task.assignee?.name ?? '').toUpperCase().includes(safeSearch)
      const matchProject = !projectFilter || task.project_client_id === projectFilter
      const matchPanel = !panelFilter || task.panel === panelFilter
      const matchAssignee = !assigneeFilter || task.assignee_id === assigneeFilter
      const matchPriority = priorityFilter === 'ALL' || task.priority === priorityFilter
      return matchSearch && matchProject && matchPanel && matchAssignee && matchPriority
    })
  }, [assigneeFilter, panelFilter, priorityFilter, projectFilter, rows, search])

  const grouped = useMemo(
    () => ({
      BACKLOG: filteredRows.filter((r) => r.status === 'BACKLOG'),
      TODO: filteredRows.filter((r) => r.status === 'TODO'),
      IN_PROGRESS: filteredRows.filter((r) => r.status === 'IN_PROGRESS'),
      REVIEW: filteredRows.filter((r) => r.status === 'REVIEW'),
      DONE: filteredRows.filter((r) => r.status === 'DONE'),
    }),
    [filteredRows],
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

  function startEditWorklog(worklog: WorklogRow) {
    setEditingWorklogId(worklog.id)
    setWorklogDescription(worklog.description)
    setWorklogDuration(worklog.duration_hhmm)
  }

  async function saveWorklogEdits(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !editingWorklogId) return
    const safeDescription = worklogDescription.trim().toUpperCase()
    const safeDuration = worklogDuration.trim()
    if (!safeDescription) return
    if (!/^\d{2}:[0-5]\d$/.test(safeDuration)) {
      alert('Tempo inválido. Use o formato hh:mm, por exemplo 01:30.')
      return
    }
    const { error } = await supabase
      .from('project_task_worklogs')
      .update({ description: safeDescription, duration_hhmm: safeDuration })
      .eq('id', editingWorklogId)
    if (error) {
      alert(error.message)
      return
    }
    setEditingWorklogId(null)
    setWorklogDescription('')
    setWorklogDuration('00:30')
    await loadTasks()
  }

  async function deleteWorklog(worklogId: string) {
    if (!supabase || !confirm('Excluir este registro?')) return
    const { error } = await supabase.from('project_task_worklogs').delete().eq('id', worklogId)
    if (error) {
      alert(error.message)
      return
    }
    if (editingWorklogId === worklogId) {
      setEditingWorklogId(null)
      setWorklogDescription('')
      setWorklogDuration('00:30')
    }
    await loadTasks()
  }

  async function deleteTask(taskId: string) {
    if (!supabase || !confirm('Excluir tarefa? Esta ação remove também os registros da atividade.')) return
    const { error } = await supabase.from('project_tasks').delete().eq('id', taskId)
    if (error) {
      alert(error.message)
      return
    }
    if (editTaskId === taskId) {
      setEditTaskId(null)
    }
    if (worklogTaskId === taskId) {
      setWorklogTaskId(null)
    }
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
        <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar título, descrição, projeto..."
            className="lg:col-span-2"
          />
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">Projeto (todos)</option>
            {projectClients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.project_code ? `${item.project_code} - ` : ''}
                {item.name}
              </option>
            ))}
          </select>
          <select value={panelFilter} onChange={(e) => setPanelFilter(e.target.value)}>
            <option value="">Painel (todos)</option>
            {allPanels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">Responsável (todos)</option>
            {assignees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | TaskPriority)} className="flex-1">
              <option value="ALL">Prioridade (todas)</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('')
                setProjectFilter('')
                setPanelFilter('')
                setAssigneeFilter('')
                setPriorityFilter('ALL')
              }}
            >
              Limpar
            </Button>
          </div>
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
                      {task.project_client?.name || task.panel ? (
                        <p className="text-xs font-semibold text-emerald-700">
                          {task.project_client?.project_code ? `${task.project_client.project_code} - ` : ''}
                          {task.project_client?.name ?? 'SEM PROJETO'}
                          {task.panel ? (
                            <span className="ml-1 inline-flex items-center gap-1">
                              [PAINEL <ArrowRight size={12} /> {task.panel}]
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                      {task.details ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.details}</p> : null}
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
                          className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white p-0 text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 xl:w-auto xl:px-3"
                          onClick={() => setWorklogTaskId(task.id)}
                          title="Registrar atividade"
                        >
                          <ClipboardList size={16} />
                          <span className="hidden text-xs font-medium xl:inline">Atividade</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white p-0 text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 xl:w-auto xl:px-3"
                          onClick={() => startEditTask(task)}
                          title="Editar tarefa"
                        >
                          <Pencil size={16} />
                          <span className="hidden text-xs font-medium xl:inline">Editar</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full border border-red-200 bg-white p-0 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 xl:w-auto xl:px-3"
                          onClick={() => void deleteTask(task.id)}
                          title="Excluir tarefa"
                        >
                          <Trash2 size={16} />
                          <span className="hidden text-xs font-medium xl:inline">Excluir</span>
                        </Button>
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
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setWorklogTaskId(null)
                  setEditingWorklogId(null)
                  setWorklogDescription('')
                  setWorklogDuration('00:30')
                }}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={editingWorklogId ? saveWorklogEdits : addWorklog} className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
              <div>
                <label>O que foi realizado</label>
                <input value={worklogDescription} onChange={(e) => setWorklogDescription(e.target.value)} required />
              </div>
              <div>
                <label>Tempo (hh:mm)</label>
                <input value={worklogDuration} onChange={(e) => setWorklogDuration(e.target.value)} placeholder="01:30" />
              </div>
              <div className="self-end flex gap-2">
                <Button type="submit" variant="primary">{editingWorklogId ? 'Salvar edição' : 'Salvar'}</Button>
                {editingWorklogId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingWorklogId(null)
                      setWorklogDescription('')
                      setWorklogDuration('00:30')
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
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
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white p-0 text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                        onClick={() => startEditWorklog(row)}
                        title="Editar registro"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white p-0 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        onClick={() => void deleteWorklog(row.id)}
                        title="Excluir registro"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
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
                <Button type="button" variant="danger" onClick={() => { if (editTaskId) void deleteTask(editTaskId) }}>Excluir tarefa</Button>
                <Button type="button" variant="ghost" onClick={() => setEditTaskId(null)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
