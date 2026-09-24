import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { CheckSquare, Plus } from 'lucide-react'

type Task = {
  id: string
  title: string
  due_date: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
}

export function V2TasksPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTasks = async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('lsh_tasks').select('*').eq('user_id', ownerUserId).order('due_date', { ascending: true })
    setTasks((data as Task[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [supabase, ownerUserId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !ownerUserId || !newTitle) return
    setSaving(true)

    try {
      const { error } = await supabase.from('lsh_tasks').insert({
        user_id: ownerUserId,
        title: newTitle,
        priority: 'MEDIUM',
        status: 'TODO',
      })

      if (error) throw error
      setNewTitle('')
      fetchTasks()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (task: Task) => {
    if (!supabase) return
    const nextStatus = task.status === 'DONE' ? 'TODO' : 'DONE'
    const { error } = await supabase.from('lsh_tasks').update({ status: nextStatus }).eq('id', task.id)
    if (!error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              MÓDULO V2
            </span>
            <span className="text-xs text-slate-400">· Tarefas & Atividades</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Gerenciador de Tarefas</h2>
        </div>
      </div>

      <form onSubmit={handleCreate} className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 flex gap-3">
        <input
          type="text"
          required
          placeholder="Descrição da nova tarefa..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>{saving ? 'Criando...' : 'Criar Tarefa'}</span>
        </button>
      </form>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Carregando tarefas...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs">Nenhuma tarefa cadastrada.</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isDone = task.status === 'DONE'
            return (
              <div
                key={task.id}
                className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleStatus(task)}
                    className={`p-1.5 rounded-lg border transition ${
                      isDone ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <CheckSquare className="h-4 w-4" />
                  </button>
                  <span className={`font-bold ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>{task.title}</span>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    isDone
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}
                >
                  {isDone ? 'Concluída' : 'Pendente'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
