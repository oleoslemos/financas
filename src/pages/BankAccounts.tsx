import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperOrNull, toUpperTrim } from '../lib/text'

type Bank = {
  id: string
  name: string
  bank_name: string | null
  agency: string | null
  account_number: string | null
  initial_balance: number
  is_active: boolean
}
type PrMovement = {
  bank_account_id: string | null
  amount: number
  kind: 'payable' | 'receivable'
  status: 'open' | 'paid'
}

export function BankAccounts() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [rows, setRows] = useState<Bank[]>([])
  const [movements, setMovements] = useState<PrMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    bank_name: '',
    agency: '',
    account_number: '',
    initial_balance: '0',
    is_active: true,
  })
  const [editing, setEditing] = useState<Bank | null>(null)

  async function load() {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: accounts }, { data: prs }] = await Promise.all([
      supabase.from('bank_accounts').select('*').eq('user_id', ownerUserId).order('name'),
      supabase
        .from('payables_receivables')
        .select('bank_account_id, amount, kind, status')
        .eq('user_id', ownerUserId)
        .eq('status', 'paid'),
    ])
    setRows((accounts as Bank[]) ?? [])
    setMovements((prs as PrMovement[]) ?? [])
    setLoading(false)
  }

  const currentBalanceByBankId = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((bank) => {
      map.set(bank.id, Number(bank.initial_balance ?? 0))
    })
    movements.forEach((movement) => {
      if (!movement.bank_account_id) return
      const current = map.get(movement.bank_account_id) ?? 0
      const delta = movement.kind === 'receivable' ? Number(movement.amount) : -Number(movement.amount)
      map.set(movement.bank_account_id, current + delta)
    })
    return map
  }, [rows, movements])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const payload = {
      user_id: ownerUserId,
      name: toUpperTrim(form.name),
      bank_name: toUpperOrNull(form.bank_name),
      agency: toUpperOrNull(form.agency),
      account_number: toUpperOrNull(form.account_number),
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
    setForm({ name: '', bank_name: '', agency: '', account_number: '', initial_balance: '0', is_active: true })
  }

  function startEdit(b: Bank) {
    setEditing(b)
    setForm({
      name: b.name,
      bank_name: b.bank_name ?? '',
      agency: b.agency ?? '',
      account_number: b.account_number ?? '',
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

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Contas bancárias</h2>

      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 sm:p-4">
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
          <label>Agência</label>
          <input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
        </div>
        <div>
          <label>Número da conta</label>
          <input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
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
                <th>Agência</th>
                <th>Número da conta</th>
                <th>Saldo inicial</th>
                <th>Saldo atual</th>
                <th>Ativa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.bank_name ?? '—'}</td>
                  <td>{b.agency ?? '—'}</td>
                  <td>{b.account_number ?? '—'}</td>
                  <td>{formatBRL(Number(b.initial_balance))}</td>
                  <td>{formatBRL(currentBalanceByBankId.get(b.id) ?? 0)}</td>
                  <td>{b.is_active ? 'Sim' : 'Não'}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                        title="EDITAR"
                        aria-label="EDITAR"
                        onClick={() => startEdit(b)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                        title="EXCLUIR"
                        aria-label="EXCLUIR"
                        onClick={() => remove(b.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
