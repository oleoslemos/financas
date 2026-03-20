import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperOrNull, toUpperTrim } from '../lib/text'

type Card = {
  id: string
  name: string
  brand: string | null
  closing_day: number
  due_day: number
  limit_amount: number | null
}

export function CreditCardsPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const [rows, setRows] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    brand: '',
    closing_day: '10',
    due_day: '17',
    limit_amount: '',
  })
  const [editing, setEditing] = useState<Card | null>(null)

  async function load() {
    if (!supabase || !user?.id) return
    setLoading(true)
    const { data } = await supabase.from('credit_cards').select('*').eq('user_id', user.id).order('name')
    setRows((data as Card[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user?.id) return
    const payload = {
      user_id: user.id,
      name: toUpperTrim(form.name),
      brand: toUpperOrNull(form.brand),
      closing_day: Math.min(31, Math.max(1, parseInt(form.closing_day, 10) || 1)),
      due_day: Math.min(31, Math.max(1, parseInt(form.due_day, 10) || 1)),
      limit_amount: form.limit_amount ? parseMoney(form.limit_amount) : null,
    }
    if (editing) {
      const { error } = await supabase.from('credit_cards').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setEditing(null)
        reset()
        load()
      }
    } else {
      const { error } = await supabase.from('credit_cards').insert(payload)
      if (error) alert(error.message)
      else {
        reset()
        load()
      }
    }
  }

  function reset() {
    setForm({ name: '', brand: '', closing_day: '10', due_day: '17', limit_amount: '' })
  }

  async function remove(id: string) {
    if (!supabase || !confirm('Excluir cartão e faturas?')) return
    const { error } = await supabase.from('credit_cards').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  function startEdit(c: Card) {
    setEditing(c)
    setForm({
      name: c.name,
      brand: c.brand ?? '',
      closing_day: String(c.closing_day),
      due_day: String(c.due_day),
      limit_amount: c.limit_amount != null ? String(c.limit_amount) : '',
    })
  }

  if (!supabase) return <p className="text-slate-400">Conectando…</p>

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Cartões de crédito</h2>

      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:grid-cols-2">
        <div>
          <label>Nome</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label>Bandeira</label>
          <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </div>
        <div>
          <label>Dia fechamento</label>
          <input
            type="number"
            min={1}
            max={31}
            value={form.closing_day}
            onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
          />
        </div>
        <div>
          <label>Dia vencimento</label>
          <input
            type="number"
            min={1}
            max={31}
            value={form.due_day}
            onChange={(e) => setForm({ ...form, due_day: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label>Limite (opcional)</label>
          <input value={form.limit_amount} onChange={(e) => setForm({ ...form, limit_amount: e.target.value })} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary">
            {editing ? 'Salvar' : 'Adicionar'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEditing(null)
                reset()
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">Carregando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Fechamento / Venc.</th>
                <th>Limite</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    {c.closing_day} / {c.due_day}
                  </td>
                  <td>{c.limit_amount != null ? formatBRL(Number(c.limit_amount)) : '—'}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    <Link to={`/cartoes/${c.id}`} className="text-sky-400 hover:underline">
                      Faturas
                    </Link>
                    <button type="button" className="btn-ghost text-sm" onClick={() => startEdit(c)}>
                      Editar
                    </button>
                    <button type="button" className="text-sm text-red-400 hover:underline" onClick={() => remove(c.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
