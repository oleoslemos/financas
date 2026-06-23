import { useUser } from '@clerk/clerk-react'
import { Check, FileText, Pencil, Plus, Split, Trash2, Undo2, X, Landmark, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { addMonths, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

function alertDbError(message: string) {
  if (/row-level security|permission denied|new row violates/i.test(message)) {
    alert(
      `${message}\n\n` +
        'Se o financeiro é compartilhado entre contas (variável VITE_SHARED_DATA_OWNER_ID), ' +
        'no Supabase é preciso usar as políticas RLS de workspace compartilhado. ' +
        'Aplique a migration `supabase/migrations/20260422160000_ensure_finance_shared_workspace_rls.sql` ' +
        '(ou rode `supabase db push` / migrations pendentes do repositório).',
    )
  } else {
    alert(message)
  }
}

function stripParcelDesc(d: string) {
  return d.replace(/\s*\(PARCELA \d+\/\d+\)\s*$/i, '').trim()
}

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

type Kind = 'payable' | 'receivable' | 'transfer'
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
  destination_bank_account_id: string | null
  family_member_id: string | null
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

function statusQuitadoLabel(kind: Kind) {
  if (kind === 'transfer') return 'CONCLUÍDO'
  return kind === 'receivable' ? 'RECEBIDO' : 'PAGO'
}

function acaoQuitarLabel(kind: Kind) {
  if (kind === 'transfer') return 'CONCLUIR'
  return kind === 'receivable' ? 'RECEBER' : 'PAGAR'
}

export function CashflowPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [formKind, setFormKind] = useState<Kind>('payable')
  const [createOpen, setCreateOpen] = useState(false)
  const [formStatus, setFormStatus] = useState<'open' | 'paid'>('open')

  const [rows, setRows] = useState<Pr[]>([])
  const [invoiceDetailByPayable, setInvoiceDetailByPayable] = useState<Record<string, { cardId: string; invoiceId: string }>>({})
  const [cats, setCats] = useState<{ id: string; name: string; type?: string; parent_id?: string | null }[]>([])
  const [banks, setBanks] = useState<{ id: string; name: string; initial_balance: number | null }[]>([])
  const [familyMembers, setFamilyMembers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<'vista' | 'parcelado'>('vista')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(toISODate(new Date()))
  const [categoryId, setCategoryId] = useState('')
  const [bankId, setBankId] = useState('')
  const [destinationBankId, setDestinationBankId] = useState('')
  const [familyMemberId, setFamilyMemberId] = useState('')
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
  const [filterFamilyMember, setFilterFamilyMember] = useState('')
  const [filterFrom, setFilterFrom] = useState(monthRange.from)
  const [filterTo, setFilterTo] = useState(monthRange.to)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    setLoadError(null)
    const [pRes, cRes, bRes, invRes, famRes] = await Promise.all([
      supabase
        .from('payables_receivables')
        .select('*')
        .eq('user_id', ownerUserId)
        .order('due_date', { ascending: true }),
      supabase.from('categories').select('id, name, type, parent_id').eq('user_id', ownerUserId).order('name'),
      supabase
        .from('bank_accounts')
        .select('id, name, initial_balance')
        .eq('user_id', ownerUserId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('credit_card_invoices').select('id, credit_card_id, payable_id').eq('user_id', ownerUserId).not('payable_id', 'is', null),
      supabase.from('lsh_family_members').select('id, name').eq('user_id', ownerUserId).order('name'),
    ])
    const errs = [pRes.error, cRes.error, bRes.error, invRes.error, famRes.error].filter(Boolean) as { message: string }[]
    if (errs.length) setLoadError(errs.map((e) => e.message).join(' · '))

    const p = pRes.data
    const c = cRes.data
    const b = bRes.data
    const inv = invRes.data
    const fam = famRes.data

    setRows((p as Pr[]) ?? [])
    setCats((c as any[]) ?? [])
    setBanks((b as { id: string; name: string; initial_balance: number | null }[]) ?? [])
    setFamilyMembers((fam as { id: string; name: string }[]) ?? [])
    
    const links = ((inv ?? []) as Array<{ id: string; credit_card_id: string; payable_id: string | null }>).reduce(
      (acc, row) => {
        if (row.payable_id) acc[row.payable_id] = { cardId: row.credit_card_id, invoiceId: row.id }
        return acc
      },
      {} as Record<string, { cardId: string; invoiceId: string }>,
    )
    setInvoiceDetailByPayable(links)
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (filterKind !== 'ALL' && r.kind !== filterKind) return false
        if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
        if (filterFamilyMember && r.family_member_id !== filterFamilyMember) return false
        if (filterBank) {
          // Se for transferência, a conta de origem ou destino deve corresponder ao filtro de conta
          if (r.kind === 'transfer') {
            if (r.bank_account_id !== filterBank && r.destination_bank_account_id !== filterBank) return false
          } else {
            if ((r.bank_account_id || '') !== filterBank) return false
          }
        }
        if (filterFrom && r.due_date < filterFrom) return false
        if (filterTo && r.due_date > filterTo) return false
        return true
      }),
    [rows, filterKind, filterStatus, filterBank, filterFamilyMember, filterFrom, filterTo],
  )

  const currentBalance = useMemo(() => {
    const selectedBankIds = filterBank ? new Set([filterBank]) : new Set(banks.map((bank) => bank.id))
    const openingBalance = banks
      .filter((bank) => selectedBankIds.has(bank.id))
      .reduce((sum, bank) => sum + Number(bank.initial_balance ?? 0), 0)
    
    const settledDelta = rows
      .filter((row) => row.status === 'paid')
      .reduce((sum, row) => {
        let delta = 0
        if (row.kind === 'transfer') {
          if (row.bank_account_id && selectedBankIds.has(row.bank_account_id)) {
            delta -= Number(row.amount)
          }
          if (row.destination_bank_account_id && selectedBankIds.has(row.destination_bank_account_id)) {
            delta += Number(row.amount)
          }
        } else {
          if (row.bank_account_id && selectedBankIds.has(row.bank_account_id)) {
            delta += row.kind === 'receivable' ? Number(row.amount) : -Number(row.amount)
          }
        }
        return sum + delta
      }, 0)
    
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

    if (formKind === 'transfer' && (!bankId || !destinationBankId)) {
      alert('Selecione as contas de origem e destino para a transferência.')
      return
    }
    if (formKind === 'transfer' && bankId === destinationBankId) {
      alert('A conta de destino deve ser diferente da conta de origem.')
      return
    }

    const defaultDesc =
      formKind === 'transfer'
        ? 'TRANSFERÊNCIA BANCÁRIA'
        : formKind === 'payable'
          ? 'CONTA A PAGAR'
          : 'CONTA A RECEBER'
    const baseDesc = toUpperTrim(description) || defaultDesc

    if (editing) {
      const newAmount = parseMoney(amount)
      const newBankId = bankId || null

      if (
        editing.status === 'open' &&
        !editing.installment_group_id &&
        mode === 'parcelado' &&
        formStatus === 'open' &&
        formKind !== 'transfer'
      ) {
        const n = Math.max(1, parseInt(parcelCount, 10) || 1)
        const each = parseMoney(parcelAmount)
        const groupId = crypto.randomUUID()
        const first = new Date(firstDue + 'T12:00:00')
        const { error: delErr } = await supabase.from('payables_receivables').delete().eq('id', editing.id)
        if (delErr) {
          alertDbError(delErr.message)
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
          destination_bank_account_id: null,
          family_member_id: familyMemberId || null,
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_count: n,
        }))
        const { error: insErr } = await supabase.from('payables_receivables').insert(inserts)
        if (insErr) {
          alertDbError(insErr.message)
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
          category_id: formKind === 'transfer' ? null : (categoryId || null),
          bank_account_id: newBankId,
          destination_bank_account_id: formKind === 'transfer' ? (destinationBankId || null) : null,
          family_member_id: familyMemberId || null,
          status: nextStatus,
          paid_at: nextPaidAt,
        })
        .eq('id', editing.id)
      if (error) alertDbError(error.message)
      else {
        setEditing(null)
        clearForm()
        setCreateOpen(false)
        load()
      }
      return
    }

    if (mode === 'vista' || formKind === 'transfer') {
      const { error } = await supabase.from('payables_receivables').insert({
        user_id: ownerUserId,
        kind: formKind,
        description: baseDesc,
        amount: parseMoney(amount),
        due_date: dueDate,
        status: formStatus,
        paid_at: formStatus === 'paid' ? (paidAtEdit || dueDate || toISODate(new Date())) : null,
        category_id: formKind === 'transfer' ? null : (categoryId || null),
        bank_account_id: bankId || null,
        destination_bank_account_id: formKind === 'transfer' ? (destinationBankId || null) : null,
        family_member_id: familyMemberId || null,
        installment_group_id: null,
        installment_number: null,
        installment_count: null,
      })
      if (error) alertDbError(error.message)
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
      destination_bank_account_id: null,
      family_member_id: familyMemberId || null,
      installment_group_id: groupId,
      installment_number: i + 1,
      installment_count: n,
    }))
    const { error } = await supabase.from('payables_receivables').insert(inserts)
    if (error) alertDbError(error.message)
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
    setDestinationBankId('')
    setFamilyMemberId('')
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
    setMode(r.installment_group_id ? 'parcelado' : 'vista')
    setFormKind(r.kind)
    setDescription(stripParcelDesc(r.description))
    setAmount(String(r.amount))
    setDueDate(r.due_date)
    setCategoryId(r.category_id ?? '')
    setBankId(r.bank_account_id ?? '')
    setDestinationBankId(r.destination_bank_account_id ?? '')
    setFamilyMemberId(r.family_member_id ?? '')
    setPaidAtEdit(r.paid_at ?? toISODate(new Date()))
    setFormStatus(r.status)
  }

  type CatHierarchy = typeof cats[number] & { parentName?: string }

  const formattedCatsList = useMemo(() => {
    const parentCats = cats.filter(c => !c.parent_id)
    const result: CatHierarchy[] = []
    
    parentCats.forEach(parent => {
      // Find subcategories
      const subs = cats.filter(c => c.parent_id === parent.id)
      result.push(parent)
      subs.forEach(sub => {
        result.push({ ...sub, parentName: parent.name })
      })
    })

    // Orphan categories
    cats.filter(c => c.parent_id && !parentCats.some(p => p.id === c.parent_id)).forEach(orphan => {
      result.push(orphan)
    })
    
    return result
  }, [cats])

  const formCatsList = useMemo(() => {
    // Only show categories matching formKind (receivable -> income, payable -> expense, neutral for both)
    const expectedType = formKind === 'receivable' ? 'income' : 'expense'
    return formattedCatsList.filter(c => !c.type || c.type === 'neutral' || c.type === expectedType)
  }, [formattedCatsList, formKind])

  async function confirmPay() {
    if (!supabase || !ownerUserId || !payModalRow) return
    const r = payModalRow
    const { error } = await supabase
      .from('payables_receivables')
      .update({ status: 'paid', paid_at: payDateInput })
      .eq('id', r.id)
    if (error) {
      alertDbError(error.message)
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
    if (error) alertDbError(error.message)
    else {
      load()
    }
  }

  async function removeRow(r: Pr) {
    if (!supabase || !confirm('Excluir este lançamento?')) return
    const { error } = await supabase.from('payables_receivables').delete().eq('id', r.id)
    if (error) alertDbError(error.message)
    else load()
  }

  async function deleteOpenGroup(groupId: string) {
    if (!supabase || !confirm('Excluir todas as parcelas EM ABERTO deste grupo? (parcelas pagas permanecem)')) return
    const { error } = await supabase
      .from('payables_receivables')
      .delete()
      .eq('installment_group_id', groupId)
      .eq('status', 'open')
    if (error) alertDbError(error.message)
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
            alertDbError(delErr.message)
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
            destination_bank_account_id: null,
            family_member_id: template.family_member_id,
            installment_group_id: parcelGroupModalId,
            installment_number: i,
            installment_count: newN,
          }
        })
        const { error: insErr } = await supabase.from('payables_receivables').insert(inserts)
        if (insErr) {
          alertDbError(insErr.message)
          return
        }
        await Promise.all(sorted.map((r) => syncRowMeta(r, r.installment_number!, newN)))
      } else {
        await Promise.all(sorted.map((r) => syncRowMeta(r, r.installment_number!, newN)))
      }

      setParcelGroupModalId(null)
      load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar parcelamento'
      alertDbError(msg)
    }
  }

  function openPayModal(r: Pr) {
    setPayModalRow(r)
    setPayDateInput(r.due_date || toISODate(new Date()))
  }

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  const title = 'Movimentos financeiros'
  const editOpen = editing?.status === 'open'
  const editLocksKind = !!editing && !editOpen
  const editLocksMode = formKind === 'transfer' || (!!editing && (!editOpen || !!editing.installment_group_id))
  const editLocksStatus = mode !== 'vista' || formKind === 'transfer' || (!!editing && !editOpen)
  const editParceladoBlockedByPaid =
    !!editing && editOpen && !editing.installment_group_id && formStatus === 'paid'

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950" role="alert">
          <strong className="font-semibold">Erro ao carregar dados.</strong> {loadError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">Controle suas contas a pagar, receber e transferências.</p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="inline-flex items-center gap-2 font-semibold"
          onClick={() => {
            clearForm()
            setEditing(null)
            setCreateOpen(true)
          }}
        >
          <Plus size={18} />
          Novo Movimento
        </Button>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4 backdrop-blur-[2px]"
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
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h3 id="create-movement-title" className="text-lg font-bold text-slate-800">
                {editing ? 'Editar Movimento' : 'Novo Movimento'}
              </h3>
              <Button
                type="button"
                variant="ghost"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar"
                onClick={() => {
                  setCreateOpen(false)
                  setEditing(null)
                  clearForm()
                }}
              >
                <X size={18} />
              </Button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={formKind === 'payable' ? 'primary' : 'secondary'}
                  className={`text-xs font-semibold h-[34px] ${formKind === 'payable' ? '' : 'bg-slate-100 border-none text-slate-600 hover:bg-slate-200'}`}
                  disabled={editLocksKind}
                  onClick={() => {
                    setFormKind('payable')
                    setFormStatus('open')
                  }}
                >
                  DESPESA
                </Button>
                <Button
                  type="button"
                  variant={formKind === 'receivable' ? 'primary' : 'secondary'}
                  className={`text-xs font-semibold h-[34px] ${formKind === 'receivable' ? '' : 'bg-slate-100 border-none text-slate-600 hover:bg-slate-200'}`}
                  disabled={editLocksKind}
                  onClick={() => {
                    setFormKind('receivable')
                    setFormStatus('open')
                  }}
                >
                  RECEITA
                </Button>
                <Button
                  type="button"
                  variant={formKind === 'transfer' ? 'primary' : 'secondary'}
                  className={`text-xs font-semibold h-[34px] ${formKind === 'transfer' ? '' : 'bg-slate-100 border-none text-slate-600 hover:bg-slate-200'}`}
                  disabled={editLocksKind}
                  onClick={() => {
                    setFormKind('transfer')
                    setMode('vista')
                    setFormStatus('paid') // default transfers as concluded/paid
                  }}
                >
                  TRANSFERÊNCIA
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <label className="mb-0 text-xs font-semibold uppercase tracking-wider text-slate-500">STATUS</label>
                  <select
                    className="h-[34px] rounded-xl border border-slate-200 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'open' | 'paid')}
                    disabled={editLocksStatus}
                  >
                    <option value="open">EM ABERTO</option>
                    <option value="paid">{statusQuitadoLabel(formKind)}</option>
                  </select>
                </div>
              </div>

              {formKind !== 'transfer' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={mode === 'vista' ? 'primary' : 'secondary'}
                    className={`text-xs font-semibold h-[30px] px-3.5 ${mode === 'vista' ? '' : 'bg-slate-100 border-none text-slate-600 hover:bg-slate-200'}`}
                    onClick={() => setMode('vista')}
                    disabled={editLocksMode}
                  >
                    À vista
                  </Button>
                  <Button
                    type="button"
                    variant={mode === 'parcelado' ? 'primary' : 'secondary'}
                    className={`text-xs font-semibold h-[30px] px-3.5 ${mode === 'parcelado' ? '' : 'bg-slate-100 border-none text-slate-600 hover:bg-slate-200'}`}
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
                  </Button>
                </div>
              )}

              {editing?.installment_group_id &&
                editing.installment_number != null &&
                editing.installment_count != null && (
                  <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-3.5 py-2 text-xs text-sky-800">
                    Editando apenas a parcela {editing.installment_number} de {editing.installment_count}. Ao salvar,
                    mantém o indicador no nome.
                  </p>
                )}

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {editing?.installment_group_id ? 'Descrição (texto base, sem sufixo de parcela)' : 'Descrição'}
                  </label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={formKind === 'transfer' ? 'Ex.: Resgate aplicação para conta corrente' : 'Ex.: Aluguel residencial'}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                  />
                </div>

                {mode === 'vista' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Valor</label>
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        placeholder="0,00"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Vencimento</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        required
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                      />
                    </div>
                    {formStatus === 'paid' ? (
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {formKind === 'transfer' ? 'DATA DA TRANSFERÊNCIA' : formKind === 'receivable' ? 'DATA DE RECEBIMENTO' : 'DATA DE PAGAMENTO'}
                        </label>
                        <input
                          type="date"
                          value={paidAtEdit || dueDate}
                          onChange={(e) => setPaidAtEdit(e.target.value)}
                          required
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Valor de cada parcela</label>
                      <input
                        value={parcelAmount}
                        onChange={(e) => setParcelAmount(e.target.value)}
                        required
                        placeholder="0,00"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Número de parcelas</label>
                      <input
                        type="number"
                        min={1}
                        value={parcelCount}
                        onChange={(e) => setParcelCount(e.target.value)}
                        required
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">1º vencimento</label>
                      <input
                        type="date"
                        value={firstDue}
                        onChange={(e) => setFirstDue(e.target.value)}
                        required
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                      />
                    </div>
                  </>
                )}

                {formKind !== 'transfer' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Categoria</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                    >
                      <option value="">—</option>
                      {formCatsList.filter(c => !c.parent_id).map((parent) => (
                        <optgroup key={parent.id} label={parent.name}>
                          <option value={parent.id}>{parent.name} (Geral)</option>
                          {formCatsList.filter(c => c.parent_id === parent.id).map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              ↳ {sub.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {formKind === 'transfer' ? 'Conta de Origem' : 'Conta bancária (liquidação)'}
                  </label>
                  <select
                    value={bankId}
                    onChange={(e) => setBankId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                  >
                    <option value="">—</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {formKind === 'transfer' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Conta de Destino
                    </label>
                    <select
                      value={destinationBankId}
                      onChange={(e) => setDestinationBankId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                    >
                      <option value="">—</option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Familiar Responsável
                  </label>
                  <select
                    value={familyMemberId}
                    onChange={(e) => setFamilyMemberId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                  >
                    <option value="">Sem vínculo (Lançamento comum)</option>
                    {familyMembers.map((fm) => (
                      <option key={fm.id} value={fm.id}>
                        {fm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3.5">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-[38px] px-4 font-semibold"
                  onClick={() => {
                    setCreateOpen(false)
                    setEditing(null)
                    clearForm()
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" className="h-[38px] px-5 font-semibold">
                  {editing
                    ? editing.installment_group_id
                      ? 'Salvar esta parcela'
                      : 'Salvar'
                    : 'Adicionar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo Atual</p>
            <p className={`mt-1 text-lg font-bold ${currentBalance < 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {formatBRL(currentBalance)}
            </p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Saldo Previsto</p>
            <p className={`mt-1 text-lg font-bold ${projectedBalance < 0 ? 'text-red-600' : 'text-indigo-800'}`}>
              {formatBRL(projectedBalance)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Receitas Abertas</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{formatBRL(totalReceivable)}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Receitas Quitadas</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{formatBRL(totalReceived)}</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600">Despesas Abertas</p>
            <p className="mt-1 text-lg font-bold text-red-700">{formatBRL(totalPayable)}</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600">Despesas Quitadas</p>
            <p className="mt-1 text-lg font-bold text-red-700">{formatBRL(totalPaid)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 border-t border-slate-100 pt-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Filtrar Conta</label>
            <select
              value={filterBank}
              onChange={(e) => setFilterBank(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
            >
              <option value="">Todas as contas</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Filtrar Tipo</label>
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as 'ALL' | Kind)}
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
            >
              <option value="ALL">Todos os tipos</option>
              <option value="payable">Despesas</option>
              <option value="receivable">Receitas</option>
              <option value="transfer">Transferências</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Filtrar Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'open' | 'paid')}
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
            >
              <option value="ALL">Todos os status</option>
              <option value="open">Em aberto</option>
              <option value="paid">Quitado</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Filtrar Familiar</label>
            <select
              value={filterFamilyMember}
              onChange={(e) => setFilterFamilyMember(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
            >
              <option value="">Todos os familiares</option>
              {familyMembers.map((fm) => (
                <option key={fm.id} value={fm.id}>
                  {fm.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">De</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Até</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">Carregando lançamentos...</p>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <FileText className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="text-sm">Nenhum lançamento financeiro encontrado.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Descrição</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Familiar</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Liquidação</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r) => {
                const cat = cats.find((c) => c.id === r.category_id)
                const categoryLabel = cat
                  ? cat.parent_id
                    ? `${cats.find((p) => p.id === cat.parent_id)?.name} > ${cat.name}`
                    : cat.name
                  : '—'
                const fmName = familyMembers.find((f) => f.id === r.family_member_id)?.name || '—'

                let descRender: React.ReactNode = stripParcelDesc(r.description)
                if (r.kind === 'transfer') {
                  const src = banks.find((b) => b.id === r.bank_account_id)?.name || 'Conta'
                  const dst = banks.find((b) => b.id === r.destination_bank_account_id)?.name || 'Conta'
                  descRender = (
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <Landmark size={14} className="text-slate-400 shrink-0" />
                      {src} ➔ {dst}
                    </span>
                  )
                }

                return (
                  <tr key={r.id} className="hover:bg-slate-50/30">
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          r.kind === 'receivable'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10'
                            : r.kind === 'payable'
                              ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10'
                              : 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/10'
                        }`}
                      >
                        {r.kind === 'receivable' ? 'RECEITA' : r.kind === 'payable' ? 'DESPESA' : 'TRANSF.'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 max-w-[220px] truncate font-medium text-slate-800">
                      {descRender}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs font-medium">
                      {categoryLabel}
                    </td>
                    <td className="px-5 py-3.5">
                      {fmName !== '—' ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          <Users size={12} className="text-slate-400" />
                          {fmName}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-800">
                      {formatBRL(Number(r.amount))}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{r.due_date}</td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">
                      {r.status === 'paid' && r.paid_at ? r.paid_at : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          r.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/15'
                        }`}
                      >
                        {r.status === 'paid' ? statusQuitadoLabel(r.kind) : 'ABERTO'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title={r.status === 'paid' ? 'REABRIR' : acaoQuitarLabel(r.kind)}
                          aria-label={r.status === 'paid' ? 'REABRIR' : acaoQuitarLabel(r.kind)}
                          onClick={() => (r.status === 'paid' ? void reopenPaid(r) : openPayModal(r))}
                        >
                          {r.status === 'paid' ? <Undo2 size={15} /> : <Check size={15} />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="EDITAR"
                          aria-label="EDITAR"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          title="ALTERAR PARCELAS"
                          aria-label="ALTERAR PARCELAS"
                          disabled={!r.installment_group_id}
                          onClick={() => {
                            if (r.installment_group_id) openParcelGroupEdit(r.installment_group_id)
                          }}
                        >
                          <Split size={15} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          title="DETALHAR FATURA"
                          aria-label="DETALHAR FATURA"
                          disabled={!(r.kind === 'payable' && invoiceDetailByPayable[r.id])}
                          onClick={() => {
                            const det = invoiceDetailByPayable[r.id]
                            if (r.kind === 'payable' && det) navigate(`/lsh/cartoes/${det.cardId}/faturas/${det.invoiceId}`)
                          }}
                        >
                          <FileText size={15} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                          title="EXCLUIR"
                          aria-label="EXCLUIR"
                          onClick={() => removeRow(r)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {payModalRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setPayModalRow(null)}
        >
          <div
            role="dialog"
            aria-labelledby="pay-modal-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pay-modal-title" className="text-lg font-bold text-slate-800">
              {payModalRow.kind === 'payable' ? 'Confirmar Pagamento' : payModalRow.kind === 'transfer' ? 'Confirmar Transferência' : 'Confirmar Recebimento'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Selecione a data de liquidação para este lançamento.
            </p>
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Data de Liquidação</label>
              <input
                type="date"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                value={payDateInput}
                onChange={(e) => setPayDateInput(e.target.value)}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3.5">
              <Button type="button" variant="secondary" className="h-[36px] px-4" onClick={() => setPayModalRow(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" className="h-[36px] px-4 font-semibold" onClick={() => void confirmPay()}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {parcelGroupModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setParcelGroupModalId(null)}
        >
          <div
            role="dialog"
            aria-labelledby="parcel-modal-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 id="parcel-modal-title" className="text-lg font-bold text-slate-800">
                Alterar parcelamento
              </h3>
              <button
                type="button"
                className="text-xs font-semibold text-red-500 hover:text-red-600"
                onClick={() => {
                  if (parcelGroupModalId) void deleteOpenGroup(parcelGroupModalId)
                }}
              >
                Excluir em aberto
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              Defina o novo número total de parcelas. Ao reduzir, as parcelas em aberto adicionais serão removidas. Ao aumentar, novas parcelas serão geradas com base na última atual.
            </p>
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Número de parcelas</label>
              <input
                type="number"
                min={1}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                value={parcelNewCount}
                onChange={(e) => setParcelNewCount(e.target.value)}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3.5">
              <Button type="button" variant="secondary" className="h-[36px] px-4" onClick={() => setParcelGroupModalId(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" className="h-[36px] px-4 font-semibold" onClick={() => void applyParcelGroupCount()}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
