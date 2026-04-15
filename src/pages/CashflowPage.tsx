import { useUser } from '@clerk/clerk-react'
import { Check, FileText, Pencil, Plus, Split, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { addMonths, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

function stripParcelDesc(d: string) {
  return d.replace(/\s*\(PARCELA \d+\/\d+\)\s*$/i, '').trim()
}

/** Descrição persistida ao editar: mantém sufixo da parcela quando for lançamento parcelado. */
function descriptionForEditedRow(edit: Pr, baseDesc: string) {
  if (
    edit.installment_group_id &&
    edit.installment_number != null &&
    edit.installment_count != null
  ) {
    return `${baseDesc} (PARCELA ${edit.installment_number}/${edit.installment_count})`
  }
  return baseDesc
}

function currentMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toISODate(first), to: toISODate(last) }
}

type Kind = 'payable' | 'receivable'
type Pr = {
  id: string
  description: string
  amount: number
  due_date: string
  status: 'open' | 'paid'
  paid_at: string | null
  kind: Kind
  category_id: string | null
  bank_account_id: string | null
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

function statusQuitadoLabel(kind: Kind) {
  return kind === 'receivable' ? 'RECEBIDO' : 'PAGO'
}

/** Rótulo do botão de quitar título em aberto. */
function acaoQuitarLabel(kind: Kind) {
  return kind === 'receivable' ? 'RECEBER' : 'PAGAR'
}

export function CashflowPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)
  const [formKind, setFormKind] = useState<Kind>('payable')
  const [createOpen, setCreateOpen] = useState(false)
  const [formStatus, setFormStatus] = useState<'open' | 'paid'>('open')

  const [rows, setRows] = useState<Pr[]>([])
  const [invoiceDetailByPayable, setInvoiceDetailByPayable] = useState<Record<string, { cardId: string; invoiceId: string }>>({})
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [banks, setBanks] = useState<{ id: string; name: string; initial_balance: number | null }[]>([])
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

  const [parcelGroupModalId, setParcelGroupModalId] = useState<string | null>(null)
  const [parcelNewCount, setParcelNewCount] = useState('')

  const [payModalRow, setPayModalRow] = useState<Pr | null>(null)
  const [payDateInput, setPayDateInput] = useState(toISODate(new Date()))
  const [paidAtEdit, setPaidAtEdit] = useState('')

  const monthRange = currentMonthRange()
  const [filterKind, setFilterKind] = useState<'ALL' | Kind>('ALL')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'open' | 'paid'>('open')
  const [filterBank, setFilterBank] = useState('')
  const [filterFrom, setFilterFrom] = useState(monthRange.from)
  const [filterTo, setFilterTo] = useState(monthRange.to)

  async function load() {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: p }, { data: c }, { data: b }, { data: inv }] = await Promise.all([
      supabase
        .from('payables_receivables')
        .select('*')
        .eq('user_id', ownerUserId)
        .order('due_date', { ascending: true }),
      supabase.from('categories').select('id, name').eq('user_id', ownerUserId).order('name'),
      supabase
        .from('bank_accounts')
        .select('id, name, initial_balance')
        .eq('user_id', ownerUserId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('credit_card_invoices').select('id, credit_card_id, payable_id').eq('user_id', ownerUserId).not('payable_id', 'is', null),
    ])
    setRows((p as Pr[]) ?? [])
    setCats((c as { id: string; name: string }[]) ?? [])
    setBanks((b as { id: string; name: string; initial_balance: number | null }[]) ?? [])
    const links = ((inv ?? []) as Array<{ id: string; credit_card_id: string; payable_id: string | null }>).reduce(
      (acc, row) => {
        if (row.payable_id) acc[row.payable_id] = { cardId: row.credit_card_id, invoiceId: row.id }
        return acc
      },
      {} as Record<string, { cardId: string; invoiceId: string }>,
    )
    setInvoiceDetailByPayable(links)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (filterKind !== 'ALL' && r.kind !== filterKind) return false
        if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
        if (filterBank && (r.bank_account_id || '') !== filterBank) return false
        if (filterFrom && r.due_date < filterFrom) return false
        if (filterTo && r.due_date > filterTo) return false
        return true
      }),
    [rows, filterKind, filterStatus, filterBank, filterFrom, filterTo],
  )
  const currentBalance = useMemo(() => {
    const selectedBankIds = filterBank ? new Set([filterBank]) : new Set(banks.map((bank) => bank.id))
    const openingBalance = banks
      .filter((bank) => selectedBankIds.has(bank.id))
      .reduce((sum, bank) => sum + Number(bank.initial_balance ?? 0), 0)
    const settledDelta = rows
      .filter((row) => row.status === 'paid' && !!row.bank_account_id && selectedBankIds.has(row.bank_account_id))
      .reduce((sum, row) => sum + (row.kind === 'receivable' ? Number(row.amount) : -Number(row.amount)), 0)
    return openingBalance + settledDelta
  }, [banks, filterBank, rows])
  const totalReceivable = useMemo(
    () =>
      filteredRows
        .filter((r) => r.kind === 'receivable' && r.status === 'open')
        .reduce((sum, r) => sum + Number(r.amount), 0),
    [filteredRows],
  )
  const totalReceived = useMemo(
    () =>
      filteredRows
        .filter((r) => r.kind === 'receivable' && r.status === 'paid')
        .reduce((sum, r) => sum + Number(r.amount), 0),
    [filteredRows],
  )
  const totalPayable = useMemo(
    () =>
      filteredRows
        .filter((r) => r.kind === 'payable' && r.status === 'open')
        .reduce((sum, r) => sum + Number(r.amount), 0),
    [filteredRows],
  )
  const totalPaid = useMemo(
    () =>
      filteredRows
        .filter((r) => r.kind === 'payable' && r.status === 'paid')
        .reduce((sum, r) => sum + Number(r.amount), 0),
    [filteredRows],
  )
  const projectedBalance = useMemo(
    () => currentBalance + totalReceivable - totalPayable,
    [currentBalance, totalReceivable, totalPayable],
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const baseDesc = toUpperTrim(description) || (formKind === 'payable' ? 'CONTA A PAGAR' : 'CONTA A RECEBER')

    if (editing) {
      const newAmount = parseMoney(amount)
      const newBankId = bankId || null

      // À vista aberto → parcelado: remove o lançamento único e recria o grupo.
      if (
        editing.status === 'open' &&
        !editing.installment_group_id &&
        mode === 'parcelado' &&
        formStatus === 'open'
      ) {
        const n = Math.max(1, parseInt(parcelCount, 10) || 1)
        const each = parseMoney(parcelAmount)
        const groupId = crypto.randomUUID()
        const first = new Date(firstDue + 'T12:00:00')
        const { error: delErr } = await supabase.from('payables_receivables').delete().eq('id', editing.id)
        if (delErr) {
          alert(delErr.message)
          return
        }
        const inserts = Array.from({ length: n }, (_, i) => ({
          user_id: ownerUserId,
          kind: formKind,
          description: `${baseDesc} (PARCELA ${i + 1}/${n})`,
          amount: each,
          due_date: toISODate(addMonths(first, i)),
          status: 'open' as const,
          category_id: categoryId || null,
          bank_account_id: newBankId,
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_count: n,
        }))
        const { error: insErr } = await supabase.from('payables_receivables').insert(inserts)
        if (insErr) {
          alert(insErr.message)
          return
        }
        setEditing(null)
        clearForm()
        setCreateOpen(false)
        load()
        return
      }

      const nextStatus = mode === 'vista' ? formStatus : editing.status
      const nextPaidAt =
        nextStatus === 'paid'
          ? paidAtEdit || dueDate || editing.paid_at || toISODate(new Date())
          : null

      const { error } = await supabase
        .from('payables_receivables')
        .update({
          kind: formKind,
          description: descriptionForEditedRow(editing, baseDesc),
          amount: newAmount,
          due_date: dueDate,
          category_id: categoryId || null,
          bank_account_id: newBankId,
          status: nextStatus,
          paid_at: nextPaidAt,
        })
        .eq('id', editing.id)
      if (error) alert(error.message)
      else {
        // O saldo atual é derivado dos lançamentos quitados; não mutamos saldo da conta aqui.
        setEditing(null)
        clearForm()
        load()
      }
      return
    }

    if (mode === 'vista') {
      const { error } = await supabase.from('payables_receivables').insert({
        user_id: ownerUserId,
        kind: formKind,
        description: baseDesc,
        amount: parseMoney(amount),
        due_date: dueDate,
        status: formStatus,
        paid_at: formStatus === 'paid' ? (paidAtEdit || dueDate || toISODate(new Date())) : null,
        category_id: categoryId || null,
        bank_account_id: bankId || null,
        installment_group_id: null,
        installment_number: null,
        installment_count: null,
      })
      if (error) alert(error.message)
      else {
        clearForm()
        setCreateOpen(false)
        load()
      }
      return
    }

    const n = Math.max(1, parseInt(parcelCount, 10) || 1)
    const each = parseMoney(parcelAmount)
    const groupId = crypto.randomUUID()
    const first = new Date(firstDue + 'T12:00:00')
    const inserts = Array.from({ length: n }, (_, i) => ({
      user_id: ownerUserId,
      kind: formKind,
      description: `${baseDesc} (PARCELA ${i + 1}/${n})`,
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
      setCreateOpen(false)
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
    setFormKind('payable')
    setPaidAtEdit('')
    setFormStatus('open')
  }

  function startEdit(r: Pr) {
    setEditing(r)
    setCreateOpen(true)
    setMode('vista')
    setFormKind(r.kind)
    setDescription(stripParcelDesc(r.description))
    setAmount(String(r.amount))
    setDueDate(r.due_date)
    setCategoryId(r.category_id ?? '')
    setBankId(r.bank_account_id ?? '')
    setPaidAtEdit(r.paid_at ?? toISODate(new Date()))
    setFormStatus(r.status)
  }

  function openPayModal(r: Pr) {
    setPayModalRow(r)
    setPayDateInput(r.due_date || toISODate(new Date()))
  }

  async function confirmPay() {
    if (!supabase || !ownerUserId || !payModalRow) return
    const r = payModalRow
    const { error } = await supabase
      .from('payables_receivables')
      .update({ status: 'paid', paid_at: payDateInput })
      .eq('id', r.id)
    if (error) {
      alert(error.message)
      return
    }
    setPayModalRow(null)
    load()
  }

  async function reopenPaid(r: Pr) {
    if (!supabase || !ownerUserId) return
    const { error } = await supabase
      .from('payables_receivables')
      .update({ status: 'open', paid_at: null })
      .eq('id', r.id)
    if (error) alert(error.message)
    else {
      load()
    }
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

  function openParcelGroupEdit(groupId: string) {
    const grp = rows.filter((r) => r.installment_group_id === groupId)
    const sorted = [...grp].sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
    const hi = sorted[sorted.length - 1]?.installment_number ?? sorted.length
    const meta = sorted[0]?.installment_count ?? hi
    setParcelNewCount(String(Math.max(hi, meta)))
    setParcelGroupModalId(groupId)
  }

  async function applyParcelGroupCount() {
    if (!supabase || !ownerUserId || !parcelGroupModalId) return
    const newN = Math.max(1, parseInt(parcelNewCount, 10) || 1)
    const groupRows = rows.filter((r) => r.installment_group_id === parcelGroupModalId)
    const sorted = [...groupRows].sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
    if (sorted.length === 0) {
      setParcelGroupModalId(null)
      return
    }

    const baseDesc =
      stripParcelDesc(sorted[0].description) ||
      (sorted[0].kind === 'payable' ? 'CONTA A PAGAR' : 'CONTA A RECEBER')
    const hi = sorted[sorted.length - 1].installment_number ?? sorted.length

    async function syncRowMeta(row: Pr, num: number, total: number) {
      const desc = `${baseDesc} (PARCELA ${num}/${total})`
      const { error } = await supabase!
        .from('payables_receivables')
        .update({ installment_count: total, description: desc })
        .eq('id', row.id)
      if (error) throw new Error(error.message)
    }

    try {
      if (newN < hi) {
        const toRemove = sorted.filter((r) => (r.installment_number ?? 0) > newN)
        const blocked = toRemove.find((r) => r.status === 'paid')
        if (blocked) {
          alert(
            'Não é possível reduzir para ' +
              newN +
              ': há parcela(s) pagas com número acima desse. Reabra a parcela ou ajuste para um valor que não remova parcelas pagas.',
          )
          return
        }
        if (toRemove.length > 0) {
          const { error: delErr } = await supabase
            .from('payables_receivables')
            .delete()
            .in(
              'id',
              toRemove.map((r) => r.id),
            )
          if (delErr) {
            alert(delErr.message)
            return
          }
        }
        const kept = sorted.filter((r) => (r.installment_number ?? 0) <= newN)
        await Promise.all(kept.map((r) => syncRowMeta(r, r.installment_number!, newN)))
      } else if (newN > hi) {
        const template = sorted[0]
        const lastDueRow = sorted[sorted.length - 1]
        const lastDate = new Date(lastDueRow.due_date + 'T12:00:00')
        const inserts = Array.from({ length: newN - hi }, (_, k) => {
          const i = hi + 1 + k
          return {
            user_id: ownerUserId,
            kind: template.kind,
            description: `${baseDesc} (PARCELA ${i}/${newN})`,
            amount: template.amount,
            due_date: toISODate(addMonths(lastDate, k + 1)),
            status: 'open' as const,
            category_id: template.category_id,
            bank_account_id: template.bank_account_id,
            installment_group_id: parcelGroupModalId,
            installment_number: i,
            installment_count: newN,
          }
        })
        const { error: insErr } = await supabase.from('payables_receivables').insert(inserts)
        if (insErr) {
          alert(insErr.message)
          return
        }
        await Promise.all(sorted.map((r) => syncRowMeta(r, r.installment_number!, newN)))
      } else {
        await Promise.all(sorted.map((r) => syncRowMeta(r, r.installment_number!, newN)))
      }

      setParcelGroupModalId(null)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar parcelamento')
    }
  }

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  const title = 'Movimentos financeiros'
  const editOpen = editing?.status === 'open'
  const editLocksKind = !!editing && !editOpen
  const editLocksMode = !!editing && (!editOpen || !!editing.installment_group_id)
  const editLocksStatus = mode !== 'vista' || (!!editing && !editOpen)
  const editParceladoBlockedByPaid =
    !!editing && editOpen && !editing.installment_group_id && formStatus === 'paid'

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <button
          type="button"
          className="btn btn-primary inline-flex items-center gap-2"
          onClick={() => {
            clearForm()
            setEditing(null)
            setCreateOpen(true)
          }}
        >
          <Plus size={16} />
          ADICIONAR MOVIMENTO
        </button>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4"
          role="presentation"
          onClick={() => {
            setCreateOpen(false)
            setEditing(null)
            clearForm()
          }}
        >
          <div
            role="dialog"
            aria-labelledby="create-movement-title"
            className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id="create-movement-title" className="text-lg font-medium text-slate-900">
                {editing ? 'Editar movimento' : 'Novo movimento'}
              </h3>
              <button
                type="button"
                className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                aria-label="Fechar"
                onClick={() => {
                  setCreateOpen(false)
                  setEditing(null)
                  clearForm()
                }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn text-sm ${formKind === 'payable' ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={editLocksKind}
                  onClick={() => setFormKind('payable')}
                >
                  CONTA A PAGAR
                </button>
                <button
                  type="button"
                  className={`btn text-sm ${formKind === 'receivable' ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={editLocksKind}
                  onClick={() => setFormKind('receivable')}
                >
                  CONTA A RECEBER
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <label className="mb-0 text-xs text-slate-600">STATUS</label>
                  <select
                    className="h-9"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'open' | 'paid')}
                    disabled={editLocksStatus}
                    title={
                      mode !== 'vista'
                        ? 'Status manual somente em lançamento à vista.'
                        : editLocksStatus && editing
                          ? 'Só é possível alterar o status enquanto o lançamento está em aberto.'
                          : undefined
                    }
                  >
                    <option value="open">ABERTO</option>
                    <option value="paid">{statusQuitadoLabel(formKind)}</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn text-sm ${mode === 'vista' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setMode('vista')}
                  disabled={editLocksMode}
                >
                  À vista
                </button>
                <button
                  type="button"
                  className={`btn text-sm ${mode === 'parcelado' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setMode('parcelado')
                    if (editing && editing.status === 'open' && !editing.installment_group_id) {
                      setParcelAmount(amount)
                      setParcelCount('12')
                      setFirstDue(dueDate)
                    }
                  }}
                  disabled={editLocksMode || editParceladoBlockedByPaid}
                >
                  Parcelado
                </button>
              </div>

              {editing?.installment_group_id &&
                editing.installment_number != null &&
                editing.installment_count != null && (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    Editando apenas a parcela {editing.installment_number} de {editing.installment_count}. Ao salvar,
                    mantém <span className="font-mono text-sky-800">(PARCELA {editing.installment_number}/{editing.installment_count})</span>.
                  </p>
                )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label>
                    {editing?.installment_group_id ? 'Descrição (texto base, sem número da parcela)' : 'Descrição'}
                  </label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                {mode === 'vista' ? (
                  <>
                    <div>
                      <label>Valor</label>
                      <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
                    </div>
                    <div>
                      <label>Vencimento</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                    </div>
                    {formStatus === 'paid' ? (
                      <div>
                        <label>{formKind === 'receivable' ? 'DATA DE RECEBIMENTO' : 'DATA DE PAGAMENTO'}</label>
                        <input type="date" value={paidAtEdit || dueDate} onChange={(e) => setPaidAtEdit(e.target.value)} required />
                      </div>
                    ) : null}
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

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCreateOpen(false)
                    setEditing(null)
                    clearForm()
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editing
                    ? editing.installment_group_id
                      ? 'Salvar esta parcela'
                      : 'Salvar'
                    : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Saldo atual</p>
            <p className={`mt-1 text-lg font-semibold ${currentBalance < 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {formatBRL(currentBalance)}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-xs uppercase tracking-wide text-indigo-700">Saldo previsto</p>
            <p className={`mt-1 text-lg font-semibold ${projectedBalance < 0 ? 'text-red-600' : 'text-indigo-800'}`}>
              {formatBRL(projectedBalance)}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">A receber</p>
            <p className="mt-1 text-lg font-semibold text-emerald-800">{formatBRL(totalReceivable)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Recebido</p>
            <p className="mt-1 text-lg font-semibold text-emerald-800">{formatBRL(totalReceived)}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs uppercase tracking-wide text-rose-700">A pagar</p>
            <p className="mt-1 text-lg font-semibold text-rose-800">{formatBRL(totalPayable)}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-rose-700">Pago</p>
            <p className="mt-1 text-lg font-semibold text-rose-800">{formatBRL(totalPaid)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label>Conta bancária</label>
            <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)}>
              <option value="">Todas</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Tipo</label>
            <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as 'ALL' | Kind)}>
              <option value="ALL">Todos</option>
              <option value="payable">A pagar</option>
              <option value="receivable">A receber</option>
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'open' | 'paid')}>
              <option value="ALL">Todos</option>
              <option value="open">Aberto</option>
              <option value="paid">Quitado</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label>De</label>
              <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div>
              <label>Até</label>
              <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">Carregando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Quitação</th>
                <th>Parcela</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.kind === 'payable' ? 'CONTAS A PAGAR' : 'CONTAS A RECEBER'}</td>
                  <td className="max-w-[260px] truncate">{stripParcelDesc(r.description)}</td>
                  <td>{formatBRL(Number(r.amount))}</td>
                  <td>{r.due_date}</td>
                  <td>{r.status === 'paid' && r.paid_at ? r.paid_at : '—'}</td>
                  <td>
                    {r.installment_group_id
                      ? `${r.installment_number ?? '?'}/${r.installment_count ?? '?'}`
                      : r.kind === 'payable' && invoiceDetailByPayable[r.id]
                        ? '1/1'
                        : '—'}
                  </td>
                  <td>{r.status === 'paid' ? statusQuitadoLabel(r.kind) : 'ABERTO'}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                      title={r.status === 'paid' ? 'REABRIR' : acaoQuitarLabel(r.kind)}
                      aria-label={r.status === 'paid' ? 'REABRIR' : acaoQuitarLabel(r.kind)}
                      onClick={() => (r.status === 'paid' ? void reopenPaid(r) : openPayModal(r))}
                    >
                      {r.status === 'paid' ? <Undo2 size={16} /> : <Check size={16} />}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                      title="EDITAR"
                      aria-label="EDITAR"
                      onClick={() => startEdit(r)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 disabled:cursor-not-allowed disabled:opacity-40"
                      title="ALTERAR PARCELAS"
                      aria-label="ALTERAR PARCELAS"
                      disabled={!r.installment_group_id}
                      onClick={() => {
                        if (r.installment_group_id) openParcelGroupEdit(r.installment_group_id)
                      }}
                    >
                      <Split size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 disabled:cursor-not-allowed disabled:opacity-40"
                      title="DETALHAR FATURA"
                      aria-label="DETALHAR FATURA"
                      disabled={!(r.kind === 'payable' && invoiceDetailByPayable[r.id])}
                      onClick={() => {
                        const det = invoiceDetailByPayable[r.id]
                        if (r.kind === 'payable' && det) navigate(`/lsh/cartoes/${det.cardId}/faturas/${det.invoiceId}`)
                      }}
                    >
                      <FileText size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600"
                      title="EXCLUIR"
                      aria-label="EXCLUIR"
                      onClick={() => removeRow(r)}
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

      {payModalRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4"
          role="presentation"
          onClick={() => setPayModalRow(null)}
        >
          <div
            role="dialog"
            aria-labelledby="pay-modal-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pay-modal-title" className="text-lg font-medium text-slate-900">
              {payModalRow.kind === 'payable' ? 'CONFIRMAR PAGAMENTO' : 'CONFIRMAR RECEBIMENTO'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {payModalRow.kind === 'payable' ? 'INFORME A DATA DO PAGAMENTO.' : 'INFORME A DATA DO RECEBIMENTO.'}
            </p>
            <div className="mt-4">
              <label className="text-sm text-slate-700">
                {payModalRow.kind === 'payable' ? 'DATA DO PAGAMENTO' : 'DATA DO RECEBIMENTO'}
              </label>
              <input
                type="date"
                className="mt-1 w-full"
                value={payDateInput}
                onChange={(e) => setPayDateInput(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setPayModalRow(null)}>
                CANCELAR
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirmPay()}>
                {payModalRow.kind === 'payable' ? 'CONFIRMAR PAGAMENTO' : 'CONFIRMAR RECEBIMENTO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {parcelGroupModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4"
          role="presentation"
          onClick={() => setParcelGroupModalId(null)}
        >
          <div
            role="dialog"
            aria-labelledby="parcel-modal-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="parcel-modal-title" className="text-lg font-medium text-slate-900">
              Alterar parcelamento
            </h3>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="text-xs text-amber-700 hover:underline"
                onClick={() => {
                  if (parcelGroupModalId) void deleteOpenGroup(parcelGroupModalId)
                }}
              >
                Excluir parcelas em aberto do grupo
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Defina o novo número total de parcelas (ex.: de 12 para 10). Ao{' '}
              <span className="text-slate-800">diminuir</span>, as parcelas removidas são as de número maior —
              apenas se estiverem <span className="text-slate-800">em aberto</span>. Parcelas pagas não podem ser
              removidas assim. Ao <span className="text-slate-800">aumentar</span>, novas parcelas usam o mesmo valor,
              categoria, conta e vencimentos mensais a partir da última parcela atual.
            </p>
            <div className="mt-4">
              <label className="text-sm text-slate-700">Número de parcelas</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full"
                value={parcelNewCount}
                onChange={(e) => setParcelNewCount(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setParcelGroupModalId(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void applyParcelGroupCount()}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
