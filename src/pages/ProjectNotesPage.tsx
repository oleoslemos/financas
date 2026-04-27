import { Check, ListTodo, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'

type ViewMode = 'LIST' | 'POSTITS'

type NoteItem = {
  id: string
  title: string
  done: boolean
  color: 'yellow' | 'blue' | 'green' | 'pink'
  createdAt: string
}

const STORAGE_KEY = 'projects-notes-board-v1'

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
  const [mode, setMode] = useState<ViewMode>('LIST')
  const [items, setItems] = useState<NoteItem[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as NoteItem[]
      if (Array.isArray(parsed)) setItems(parsed)
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const stats = useMemo(() => {
    const total = items.length
    const done = items.filter((item) => item.done).length
    return { total, done, pending: total - done }
  }, [items])

  function addItem(e: React.FormEvent) {
    e.preventDefault()
    const title = input.trim()
    if (!title) return
    setItems((current) => [
      {
        id: window.crypto.randomUUID(),
        title,
        done: false,
        color: nextColor(current.length),
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])
    setInput('')
  }

  function toggleDone(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  function clearDone() {
    setItems((current) => current.filter((item) => !item.done))
  }

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

      {items.length === 0 ? (
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
                onClick={() => toggleDone(item.id)}
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
                onClick={() => removeItem(item.id)}
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
                  onClick={() => toggleDone(item.id)}
                  aria-label={item.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                  title={item.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                >
                  <Check size={14} />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  className="inline-flex h-8 w-8 items-center justify-center p-0 text-current/80"
                  onClick={() => removeItem(item.id)}
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
