import { useUser } from '@clerk/clerk-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { addMonths, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'

type Kind = 'payable' | 'receivable'
type Pr = {
  id: string
  description: string
  amount: number
  due_date: string
  status: 'open' | 'paid'
  kind: Kind
  category_id: string | null
  bank_account_id: string | null
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

export function CashflowPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('aba') === 'receber' ? 'receber' : 'pagar') as 'pagar' | 'receber'
  const kind: Kind = tab === 'pagar' ? 'payable' : 'receivable'

  const [rows, setRows] = useState<Pr[]>([])
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<'vista' | 'parcelado'>('vista')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(toISODate(new Date()))
  const [categoryId, setCategoryId] = useState('')
  const [bankId, setBankId] = useState('')
  const [parcelAmount, setParcelAmount] = useState('')
  const [parcelCount, setParcelCount] = useState('12')
  const [firstDue, setFirstDue] = useState(toISODate(new Date()))

  const [editing, setEditing] = useState<Pr | null>(null)

  function setTab(t: 'pagar' | 'receber') {
    params.set('aba', t)
    setParams(params, { replace: true })
  }

  async function load() {
    if (!supabase || !user?.id) return
    setLoading(true)
    const [{ data: p }, { data: c }, { data: b }] = await Promise.all([
      supabase
        .from('payables_receivables')
        .select('*')
        .eq('user_id', user.id)
        .eq('kind', kind)
        .order('due_date', { ascending: true }),
      supabase.from('categories').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('bank_accounts').select('id, name').eq('user_id', user.id).eq('is_active', true).order('name'),
    ])
    setRows((p as Pr[]) ?? [])
    setCats((c as { id: string; name: string }[]) ?? [])
    setBanks((b as { id: string; name: string }[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id, kind])

  const filteredRows = useMemo(() => rows, [rows])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user?.id) return
    const baseDesc = description.trim() || (kind === 'payable' ? 'Conta a pagar' : 'Conta a receber')

    if (editing) {
      const { error } = await supabase
        .from('payables_receivables')
        .update({
          description: baseDesc,
          amount: parseMoney(amount),
          due_date: dueDate,
          category_id: categoryId || null,
          bank_account_id: bankId || null,
        })
        .eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setEditing(null)
        clearForm()
        load()
      }
      return
    }

    if (mode === 'vista') {
      const { error } = await supabase.from('payables_receivables').insert({
        user_id: user.id,
        kind,
        description: baseDesc,
        amount: parseMoney(amount),
        due_date: dueDate,
        status: 'open',
        category_id: categoryId || null,
        bank_account_id: bankId || null,
        installment_group_id: null,
        installment_number: null,
        installment_count: null,
      })
      if (error) alert(error.message)
      else {
        clearForm()
        load()
      }
      return
    }

    const n = Math.max(1, parseInt(parcelCount, 10) || 1)
    const each = parseMoney(parcelAmount)
    const groupId = crypto.randomUUID()
    const first = new Date(firstDue + 'T12:00:00')
    const inserts = Array.from({ length: n }, (_, i) => ({
      user_id: user.id,
      kind,
      description: `${baseDesc} (parcela ${i + 1}/${n})`,
      amount: each,
      due_date: toISODate(addMonths(first, i)),
      status: 'open' as const,
      category_id: categoryId || null,
      bank_account_id: bankId || null,
      installment_group_id: groupId,
      installment_number: i + 1,
      installment_count: n,
    }))
    const { error } = await supabase.from('payables_receivables').insert(inserts)
    if (error) alert(error.message)
    else {
      clearForm()
      load()
    }
  }

  function clearForm() {
    setDescription('')
    setAmount('')
    setDueDate(toISODate(new Date()))
    setCategoryId('')
    setBankId('')
    setParcelAmount('')
    setParcelCount('12')
    setFirstDue(toISODate(new Date()))
    setMode('vista')
  }

  function startEdit(r: Pr) {
    setEditing(r)
    setMode('vista')
    setDescription(r.description.replace(/\s*\(parcela \d+\/\d+\)\s*$/, ''))
    setAmount(String(r.amount))
    setDueDate(r.due_date)
    setCategoryId(r.category_id ?? '')
    setBankId(r.bank_account_id ?? '')
  }

  async function togglePaid(r: Pr) {
    if (!supabase) return
    const next = r.status === 'paid' ? 'open' : 'paid'
    const { error } = await supabase.from('payables_receivables').update({ status: next }).eq('id', r.id)
    if (error) alert(error.message)
    else load()
  }

  async function removeRow(r: Pr) {
    if (!supabase || !confirm('Excluir este lançamento?')) return
    const { error } = await supabase.from('payables_receivables').delete().eq('id', r.id)
    if (error) alert(error.message)
    else load()
  }

  async function deleteOpenGroup(groupId: string) {
    if (!supabase || !confirm('Excluir todas as parcelas EM ABERTO deste grupo? (parcelas pagas permanecem)')) return
    const { error } = await supabase
      .from('payables_receivables')
      .delete()
      .eq('installment_group_id', groupId)
      .eq('status', 'open')
    if (error) alert(error.message)
    else load()
  }

  if (!supabase) return <p className="text-slate-400">Conectando…</p>

  const title = tab === 'pagar' ? 'Contas a pagar' : 'Contas a receber'

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">{title}</h2>

      <div className="flex gap-2">
        <button
          type="button"
          className={`btn ${tab === 'pagar' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('pagar')}
        >
          A pagar
        </button>
        <button
          type="button"
          className={`btn ${tab === 'receber' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('receber')}
        >
          A receber
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn text-sm ${mode === 'vista' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('vista')}
            disabled={!!editing}
          >
            À vista
          </button>
          <button
            type="button"
            className={`btn text-sm ${mode === 'parcelado' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('parcelado')}
            disabled={!!editing}
          >
            Parcelado
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label>Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {mode === 'vista' ? (
            <>
              <div>
                <label>Valor</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} required={!editing} />
              </div>
              <div>
                <label>Vencimento</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </div>
            </>
          ) : (
            <>
              <div>
                <label>Valor de cada parcela</label>
                <input value={parcelAmount} onChange={(e) => setParcelAmount(e.target.value)} required />
              </div>
              <div>
                <label>Número de parcelas</label>
                <input
                  type="number"
                  min={1}
                  value={parcelCount}
                  onChange={(e) => setParcelCount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>1º vencimento</label>
                <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} required />
              </div>
            </>
          )}
          <div>
            <label>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Conta bancária (liquidação)</label>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">—</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary">
            {editing ? 'Salvar' : 'Adicionar'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEditing(null)
                clearForm()
              }}
            >
              Cancelar edição
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
                <th>Descrição</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Parcela</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td>{formatBRL(Number(r.amount))}</td>
                  <td>{r.due_date}</td>
                  <td>
                    {r.installment_group_id
                      ? `${r.installment_number ?? '?'}/${r.installment_count ?? '?'}`
                      : '—'}
                  </td>
                  <td>{r.status === 'paid' ? 'Pago' : 'Aberto'}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    <button type="button" className="btn-ghost text-sm" onClick={() => togglePaid(r)}>
                      {r.status === 'paid' ? 'Reabrir' : 'Pagar'}
                    </button>
                    <button type="button" className="btn-ghost text-sm" onClick={() => startEdit(r)}>
                      Editar
                    </button>
                    <button type="button" className="text-sm text-red-400 hover:underline" onClick={() => removeRow(r)}>
                      Excluir
                    </button>
                    {r.installment_group_id && (
                      <button
                        type="button"
                        className="text-xs text-amber-400 hover:underline"
                        onClick={() => deleteOpenGroup(r.installment_group_id!)}
                      >
                        Limpar abertas do grupo
                      </button>
                    )}
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
