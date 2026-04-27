import { useUser } from '@clerk/clerk-react'
import { Check, ListTodo, LoaderCircle, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type ViewMode = 'LIST' | 'POSTITS'

type NoteItem = {
  id: string
  title: string
  done: boolean
  color: 'yellow' | 'blue' | 'green' | 'pink'
  createdAt: string
}
type NoteRow = {
  id: string
  title: string
  done: boolean
  color: NoteItem['color']
  created_at: string
}

const postitStyleByColor: Record<NoteItem['color'], string> = {
  yellow: 'border-amber-200 bg-amber-50 text-amber-900',
  blue: 'border-sky-200 bg-sky-50 text-sky-900',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  pink: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
}

function nextColor(index: number): NoteItem['color'] {
  const colors: NoteItem['color'][] = ['yellow', 'blue', 'green', 'pink']
  return colors[index % colors.length]
}

export function ProjectNotesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [mode, setMode] = useState<ViewMode>('LIST')
  const [items, setItems] = useState<NoteItem[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const loadNotes = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('project_notes')
      .select('id, title, done, color, created_at')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }
    const mapped = ((data as NoteRow[]) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      done: row.done,
      color: row.color,
      createdAt: row.created_at,
    }))
    setItems(mapped)
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (!supabase || !ownerUserId) return
    const channel = supabase
      .channel(`project-notes-${ownerUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_notes',
          filter: `user_id=eq.${ownerUserId}`,
        },
        () => void loadNotes(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadNotes, ownerUserId, supabase])

  const stats = useMemo(() => {
    const total = items.length
    const done = items.filter((item) => item.done).length
    return { total, done, pending: total - done }
  }, [items])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const title = input.trim()
    if (!title) return
    const { error } = await supabase.from('project_notes').insert({
      user_id: ownerUserId,
      title,
      done: false,
      color: nextColor(items.length),
    })
    if (error) {
      alert(error.message)
      return
    }
    setInput('')
    await loadNotes()
  }

  async function toggleDone(id: string, done: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('project_notes').update({ done: !done }).eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    await loadNotes()
  }

  async function removeItem(id: string) {
    if (!supabase) return
    const { error } = await supabase.from('project_notes').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    await loadNotes()
  }

  async function clearDone() {
    if (!supabase || !ownerUserId) return
    const { error } = await supabase.from('project_notes').delete().eq('user_id', ownerUserId).eq('done', true)
    if (error) {
      alert(error.message)
      return
    }
    await loadNotes()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO AO BANCO…</p>

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projetos</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Bloco de anotações</h2>
        <p className="mt-1 text-sm text-slate-600">Capture rapidamente tarefas e lembretes como checklist ou mural de post-its.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs text-amber-700">Pendentes</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{stats.pending}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs text-emerald-700">Concluídas</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{stats.done}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={addItem} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma tarefa, ideia ou lembrete"
            className="w-full"
          />
          <Button type="submit" variant="primary" className="inline-flex items-center gap-2">
            <Plus size={16} />
            Adicionar
          </Button>
          <Button type="button" variant="ghost" className="inline-flex items-center gap-2" onClick={clearDone}>
            <Trash2 size={16} />
            Limpar concluídas
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={mode === 'LIST' ? 'primary' : 'ghost'}
            className="inline-flex items-center gap-2"
            onClick={() => setMode('LIST')}
          >
            <ListTodo size={16} />
            Lista de tarefas
          </Button>
          <Button
            type="button"
            variant={mode === 'POSTITS' ? 'primary' : 'ghost'}
            className="inline-flex items-center gap-2"
            onClick={() => setMode('POSTITS')}
          >
            <StickyNote size={16} />
            Post-its
          </Button>
        </div>
      </section>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <p className="inline-flex items-center gap-2">
            <LoaderCircle size={14} className="animate-spin" />
            Carregando anotações...
          </p>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma anotação ainda. Adicione sua primeira tarefa para começar.
        </section>
      ) : mode === 'LIST' ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <button
                type="button"
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                  item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent'
                }`}
                onClick={() => void toggleDone(item.id, item.done)}
                aria-label={item.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                title={item.done ? 'Marcar como pendente' : 'Marcar como concluída'}
              >
                <Check size={14} />
              </button>
              <p className={`flex-1 text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.title}</p>
              <Button
                type="button"
                variant="ghost"
                className="inline-flex h-8 w-8 items-center justify-center p-0 text-red-600"
                onClick={() => void removeItem(item.id)}
                aria-label="Excluir anotação"
                title="Excluir anotação"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className={`rounded-xl border p-4 shadow-sm ${postitStyleByColor[item.color]}`}>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                    item.done ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-current/40 text-transparent'
                  }`}
                  onClick={() => void toggleDone(item.id, item.done)}
                  aria-label={item.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                  title={item.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                >
                  <Check size={14} />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  className="inline-flex h-8 w-8 items-center justify-center p-0 text-current/80"
                  onClick={() => void removeItem(item.id)}
                  aria-label="Excluir anotação"
                  title="Excluir anotação"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <p className={`mt-3 text-sm ${item.done ? 'line-through opacity-60' : ''}`}>{item.title}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
