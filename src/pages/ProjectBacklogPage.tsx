import { useUser } from '@clerk/clerk-react'
import { LoaderCircle, Plus } from 'lucide-react'
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

const priorityRank: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export function ProjectBacklogPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [dueDate, setDueDate] = useState(toISODate(new Date()))
  const [projectClientId, setProjectClientId] = useState('')
  const [projectClients, setProjectClients] = useState<ProjectClientOption[]>([])

  const loadBacklog = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('lsh_tasks')
      .select('id, title, details, priority, due_date, project_client_id, created_at, project_client:project_client_id(name, project_code)')
      .eq('user_id', ownerUserId)
      .eq('status', 'TODO')
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    setRows((data as TaskRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadBacklog()
  }, [loadBacklog])

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

  const ordered = useMemo(
    () => [...rows].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]),
    [rows],
  )

  async function createBacklogItem(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const safeTitle = toUpperTrim(title)
    if (!safeTitle) return
    const { error } = await supabase.from('lsh_tasks').insert({
      user_id: ownerUserId,
      title: safeTitle,
      details: toUpperTrim(details) || null,
      priority,
      due_date: dueDate || null,
      status: 'TODO',
      source: 'LOCAL',
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
    await loadBacklog()
  }

  async function sendToExecution(id: string) {
    if (!supabase) return
    const { error } = await supabase.from('lsh_tasks').update({ status: 'IN_PROGRESS' }).eq('id', id)
    if (error) alert(error.message)
    else await loadBacklog()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">Backlog e priorização</h2>
        <p className="text-sm text-slate-600">Organize demandas antes de enviar para execução.</p>
      </header>

      <form onSubmit={createBacklogItem} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Novo item do backlog</h3>
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
        <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
          <Plus size={16} />
          Adicionar no backlog
        </Button>
      </form>

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
    </div>
  )
}
