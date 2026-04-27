import { useUser } from '@clerk/clerk-react'
import { CalendarRange, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { toISODate } from '../lib/dates'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
type TaskRow = {
  id: string
  title: string
  status: TaskStatus
  due_date: string | null
}

function addDays(base: Date, days: number) {
  const copy = new Date(base)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function ProjectSprintsPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)

  const today = useMemo(() => new Date(), [])
  const sprint1Start = toISODate(today)
  const sprint1End = toISODate(addDays(today, 13))
  const sprint2Start = toISODate(addDays(today, 14))
  const sprint2End = toISODate(addDays(today, 27))

  const loadTasks = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('lsh_tasks')
      .select('id, title, status, due_date')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    setRows((data as TaskRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const sprint1 = useMemo(
    () => rows.filter((task) => task.due_date && task.due_date >= sprint1Start && task.due_date <= sprint1End),
    [rows, sprint1End, sprint1Start],
  )
  const sprint2 = useMemo(
    () => rows.filter((task) => task.due_date && task.due_date >= sprint2Start && task.due_date <= sprint2End),
    [rows, sprint2End, sprint2Start],
  )
  const noSprint = useMemo(() => rows.filter((task) => !task.due_date), [rows])

  async function planForSprint(taskId: string, targetEndDate: string) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ due_date: targetEndDate }).eq('id', taskId)
    if (error) alert(error.message)
    else await loadTasks()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Sprints e execução</h2>
        <p className="text-sm text-slate-600">Planejamento simplificado por janela de 2 sprints (14 dias cada).</p>
      </header>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <p className="inline-flex items-center gap-2">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando planejamento...
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarRange size={14} />
              Sprint atual ({sprint1Start} a {sprint1End})
            </p>
            <div className="space-y-2">
              {sprint1.length === 0 ? <p className="text-xs text-slate-500">Sem tarefas nesta sprint.</p> : sprint1.map((task) => <p key={task.id} className="rounded-lg border border-slate-200 p-2 text-sm text-slate-800">{task.title}</p>)}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarRange size={14} />
              Próxima sprint ({sprint2Start} a {sprint2End})
            </p>
            <div className="space-y-2">
              {sprint2.length === 0 ? <p className="text-xs text-slate-500">Sem tarefas nesta sprint.</p> : sprint2.map((task) => <p key={task.id} className="rounded-lg border border-slate-200 p-2 text-sm text-slate-800">{task.title}</p>)}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-slate-800">Sem sprint (sem prazo)</p>
            <div className="space-y-2">
              {noSprint.length === 0 ? (
                <p className="text-xs text-slate-500">Sem itens pendentes de planejamento.</p>
              ) : (
                noSprint.map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="text-sm text-slate-800">{task.title}</p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void planForSprint(task.id, sprint1End)}>
                        Sprint atual
                      </Button>
                      <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void planForSprint(task.id, sprint2End)}>
                        Próxima sprint
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      )}
    </div>
  )
}
