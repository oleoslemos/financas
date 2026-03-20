import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL, parseMoney } from '../lib/format'

type Bank = {
  id: string
  name: string
  bank_name: string | null
  agency_account: string | null
  initial_balance: number
  is_active: boolean
}

export function BankAccounts() {
  const { user } = useUser()
  const supabase = useSupabase()
  const [rows, setRows] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    bank_name: '',
    agency_account: '',
    initial_balance: '0',
    is_active: true,
  })
  const [editing, setEditing] = useState<Bank | null>(null)

  async function load() {
    if (!supabase || !user?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
    setRows((data as Bank[]) ?? [])
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
      name: form.name.trim(),
      bank_name: form.bank_name.trim() || null,
      agency_account: form.agency_account.trim() || null,
      initial_balance: parseMoney(form.initial_balance),
      is_active: form.is_active,
    }
    if (editing) {
      const { error } = await supabase.from('bank_accounts').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setEditing(null)
        resetForm()
        load()
      }
    } else {
      const { error } = await supabase.from('bank_accounts').insert(payload)
      if (error) alert(error.message)
      else {
        resetForm()
        load()
      }
    }
  }

  function resetForm() {
    setForm({ name: '', bank_name: '', agency_account: '', initial_balance: '0', is_active: true })
  }

  function startEdit(b: Bank) {
    setEditing(b)
    setForm({
      name: b.name,
      bank_name: b.bank_name ?? '',
      agency_account: b.agency_account ?? '',
      initial_balance: String(b.initial_balance),
      is_active: b.is_active,
    })
  }

  async function remove(id: string) {
    if (!supabase || !confirm('Excluir esta conta?')) return
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (!supabase) return <p className="text-slate-400">Conectando…</p>

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Contas bancárias</h2>

      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label>Nome da conta</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex.: Conta corrente Nubank"
          />
        </div>
        <div>
          <label>Banco</label>
          <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
        </div>
        <div>
          <label>Agência / conta</label>
          <input value={form.agency_account} onChange={(e) => setForm({ ...form, agency_account: e.target.value })} />
        </div>
        <div>
          <label>Saldo inicial</label>
          <input value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4"
            />
            Ativa
          </label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary">
            {editing ? 'Salvar alterações' : 'Adicionar'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEditing(null)
                resetForm()
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
                <th>Banco</th>
                <th>Agência/conta</th>
                <th>Saldo inicial</th>
                <th>Ativa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.bank_name ?? '—'}</td>
                  <td>{b.agency_account ?? '—'}</td>
                  <td>{formatBRL(Number(b.initial_balance))}</td>
                  <td>{b.is_active ? 'Sim' : 'Não'}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    <button type="button" className="btn-ghost text-sm" onClick={() => startEdit(b)}>
                      Editar
                    </button>
                    <button type="button" className="text-sm text-red-400 hover:underline" onClick={() => remove(b.id)}>
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
