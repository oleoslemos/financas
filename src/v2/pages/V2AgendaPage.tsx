import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { CheckCircle2, CalendarDays, Plus } from 'lucide-react'

type CalendarEvent = {
  id: string
  summary: string
  details: string | null
  location: string | null
  start_at: string
  end_at: string
  status: string
}

type Task = {
  id: string
  title: string
  due_date: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
}

export function V2AgendaPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !ownerUserId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      const [eventsResp, tasksResp] = await Promise.all([
        supabase
          .from('lsh_calendar_events')
          .select('*')
          .eq('user_id', ownerUserId)
          .gte('start_at', startOfDay.toISOString())
          .lte('start_at', endOfDay.toISOString())
          .neq('status', 'cancelled')
          .order('start_at', { ascending: true }),
        supabase
          .from('lsh_tasks')
          .select('*')
          .eq('user_id', ownerUserId)
          .in('status', ['TODO', 'IN_PROGRESS'])
          .order('due_date', { ascending: true }),
      ])

      if (cancelled) return
      setEvents((eventsResp.data as CalendarEvent[]) ?? [])
      setTasks((tasksResp.data as Task[]) ?? [])
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, ownerUserId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              MÓDULO V2
            </span>
            <span className="text-xs text-slate-400">· Compromissos & Agenda</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Agenda Integrada</h2>
        </div>

        <a
          href="https://calendar.google.com/calendar/u/0/r/eventedit"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 text-white text-xs font-bold shadow-lg"
        >
          <Plus className="h-4 w-4" />
          <span>Cadastrar no Google Agenda</span>
        </a>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Carregando agenda...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Calendar Events */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <CalendarDays className="h-5 w-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Compromissos de Hoje</h3>
            </div>

            {events.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Nenhum evento agendado para hoje.</p>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-1">
                    <p className="font-bold text-white">{ev.summary}</p>
                    <p className="text-slate-400 font-mono">
                      {new Date(ev.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {new Date(ev.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {ev.details && <p className="text-slate-400 text-[11px] pt-1">{ev.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Tasks */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <CheckCircle2 className="h-5 w-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Tarefas Em Aberto</h3>
            </div>

            {tasks.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Nenhuma tarefa pendente.</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((tk) => (
                  <div key={tk.id} className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">{tk.title}</p>
                      <p className="text-slate-400 font-mono text-[10px]">Prazo: {tk.due_date || 'Sem prazo'}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {tk.status === 'IN_PROGRESS' ? 'Em Andamento' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
