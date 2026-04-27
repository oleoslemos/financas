import { useUser } from '@clerk/clerk-react'
import { CalendarDays, LoaderCircle, MoveRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  project_client?: { name: string | null; project_code: string | null } | null
  created_at: string
}

const statusColumns: Array<{ key: TaskStatus; title: string }> = [
  { key: 'TODO', title: 'A Fazer' },
  { key: 'IN_PROGRESS', title: 'Em andamento' },
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

  const loadTasks = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('lsh_tasks')
      .select('id, title, details, status, priority, due_date, created_at, project_client:project_client_id(name, project_code)')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    setRows((data as TaskRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  async function moveTask(id: string, status: TaskStatus) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ status }).eq('id', id)
    if (error) alert(error.message)
    else await loadTasks()
  }

  const grouped = useMemo(
    () => ({
      TODO: rows.filter((r) => r.status === 'TODO'),
      IN_PROGRESS: rows.filter((r) => r.status === 'IN_PROGRESS'),
      DONE: rows.filter((r) => r.status === 'DONE'),
    }),
    [rows],
  )

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Quadro Kanban</h2>
        <p className="text-sm text-slate-600">Fluxo visual de tarefas e atividades em colunas.</p>
      </header>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <p className="inline-flex items-center gap-2">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando quadro...
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          {statusColumns.map((column) => (
            <article key={column.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{column.title}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{grouped[column.key].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[column.key].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">Sem itens nesta coluna.</p>
                ) : (
                  grouped[column.key].map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                      {task.details ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.details}</p> : null}
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
    </div>
  )
}
