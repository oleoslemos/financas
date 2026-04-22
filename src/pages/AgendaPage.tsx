import { useAuth, useUser } from '@clerk/clerk-react'
import { CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'

type CalendarEventRow = {
  id: string
  summary: string
  details: string | null
  location: string | null
  start_at: string
  end_at: string
  status: string
}

type PendingTaskRow = {
  id: string
  title: string
  due_date: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
}

const priorityLabel: Record<PendingTaskRow['priority'], string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AgendaPage() {
  const { user } = useUser()
  const { getToken } = useAuth()
  const supabase = useSupabase()
  const currentUserId = user?.id ?? null
  const ownerUserId = resolveDataOwnerId(currentUserId)

  const [events, setEvents] = useState<CalendarEventRow[]>([])
  const [tasks, setTasks] = useState<PendingTaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const syncEndpoint = import.meta.env.VITE_SYNC_TASKS_WEBHOOK_URL?.trim() || '/api/sync-tasks'

  const loadAgenda = useCallback(async () => {
    if (!supabase || !ownerUserId || !currentUserId) return
    setLoading(true)

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const [eventsResp, tasksResp] = await Promise.all([
      supabase
        .from('lsh_calendar_events')
        .select('id, summary, details, location, start_at, end_at, status')
        .eq('user_id', ownerUserId)
        .gte('start_at', startOfDay.toISOString())
        .lte('start_at', endOfDay.toISOString())
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true }),
      supabase
        .from('lsh_tasks')
        .select('id, title, due_date, priority, status')
        .eq('user_id', ownerUserId)
        .in('status', ['TODO', 'IN_PROGRESS'])
        .order('due_date', { ascending: true, nullsFirst: false }),
    ])

    if (eventsResp.error) alert(eventsResp.error.message)
    if (tasksResp.error) alert(tasksResp.error.message)

    setEvents((eventsResp.data as CalendarEventRow[]) ?? [])
    setTasks((tasksResp.data as PendingTaskRow[]) ?? [])
    setLoading(false)
  }, [supabase, ownerUserId, currentUserId])

  async function requestSyncNow() {
    if (!syncEndpoint) return
    try {
      setSyncing(true)
      setSyncMessage(null)
      const sessionToken = await getToken()
      if (!sessionToken) {
        throw new Error('Sessão inválida. Faça login novamente.')
      }
      const response = await fetch(syncEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          source: 'agenda-page',
          userId: ownerUserId,
          integrationUserId: ownerUserId,
          taskOwnerUserId: ownerUserId,
        }),
      })
      const text = await response.text()
      const payload = text ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return { raw: text }
        }
      })() : null
      if (!response.ok) {
        const msg = payload?.error ? String(payload.error) : `Falha HTTP ${response.status}`
        throw new Error(msg)
      }
      await loadAgenda()
      const synced = Number(payload?.calendar?.synced ?? 0)
      const skipped = Boolean(payload?.calendar?.skipped)
      const reason = payload?.calendar?.reason ? String(payload.calendar.reason) : ''
      if (skipped) {
        setSyncMessage(`Sincronização concluída com pendência: ${reason || 'Google Calendar não configurado para este usuário.'}`)
      } else {
        setSyncMessage(`Sincronização concluída com sucesso. Eventos processados: ${synced}.`)
      }
    } catch (err) {
      setSyncMessage(`Erro ao sincronizar: ${String((err as Error)?.message || err)}`)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    void loadAgenda()
  }, [loadAgenda])

  const kpis = useMemo(
    () => ({
      totalEventosHoje: events.length,
      pendentes: tasks.filter((t) => t.status === 'TODO').length,
      emAndamento: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    }),
    [events, tasks],
  )

  if (!supabase) return <p className="text-slate-600">Conectando ao banco...</p>

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">AGENDA</h2>
            <p className="text-xs text-slate-600">RESUMO UNIFICADO: AGENDA + TAREFAS NÃO CONCLUÍDAS</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://calendar.google.com/calendar/u/0/r/eventedit"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <CalendarPlus size={14} />
              CADASTRAR AGENDA
            </a>
            <a
              href="/api/auth/signin/google?callbackUrl=/agenda"
              className="btn-ghost inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <CalendarPlus size={14} />
              CONECTAR GOOGLE
            </a>
            <Link to="/lsh/tarefas#nova-tarefa" className="btn-ghost inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
              <Plus size={14} />
              CADASTRAR TAREFA
            </Link>
            <Button
              type="button"
              onClick={() => void requestSyncNow()}
              disabled={syncing}
              variant="primary"
              className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {syncing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              SINCRONIZAR AGORA
            </Button>
          </div>
        </div>
        {syncMessage ? <p className="mt-2 text-xs text-slate-600">{syncMessage}</p> : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <p className="text-xs text-indigo-700">COMPROMISSOS DE HOJE</p>
          <p className="mt-1 text-2xl font-semibold text-indigo-900">{kpis.totalEventosHoje}</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs text-amber-700">TAREFAS PENDENTES</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{kpis.pendentes}</p>
        </article>
        <article className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <p className="text-xs text-sky-700">TAREFAS EM ANDAMENTO</p>
          <p className="mt-1 text-2xl font-semibold text-sky-900">{kpis.emAndamento}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CalendarDays size={16} className="text-indigo-600" />
            AGENDA
          </h3>
          {loading ? (
            <p className="flex items-center gap-2 p-2 text-slate-500">
              <LoaderCircle size={14} className="animate-spin" />
              CARREGANDO AGENDA...
            </p>
          ) : events.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              Nenhum compromisso encontrado para hoje.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <article key={event.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <p className="font-semibold text-slate-800">{event.summary}</p>
                  <p className="text-xs text-slate-600">
                    {formatDateTime(event.start_at)} - {formatDateTime(event.end_at)}
                    {event.location ? ` • ${event.location}` : ''}
                  </p>
                  {event.details ? <p className="mt-1 text-xs text-slate-500">{event.details}</p> : null}
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CheckCircle2 size={16} className="text-amber-600" />
            TAREFAS
          </h3>
          {loading ? (
            <p className="flex items-center gap-2 p-2 text-slate-500">
              <LoaderCircle size={14} className="animate-spin" />
              CARREGANDO TAREFAS...
            </p>
          ) : tasks.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              Não existem tarefas em aberto.
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <article key={task.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-600">
                      Prioridade: {priorityLabel[task.priority]}
                      {task.due_date ? ` • Prazo: ${task.due_date}` : ''}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                    <CalendarClock size={12} />
                    {task.status === 'IN_PROGRESS' ? 'Em andamento' : 'Pendente'}
                  </span>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
