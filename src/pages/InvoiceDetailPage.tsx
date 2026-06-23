import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2, Users, ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Link, useParams } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { monthLabel, parseISODate, toISODate } from '../lib/dates'
import { formatBRL, parseMoney } from '../lib/format'
import {
  CREDIT_CARD_INVOICE_CATEGORY_NAME,
  ensureCreditCardExpenseCategory,
} from '../lib/creditCardCategory'
import { addMonthsToDueDate, addMonthsToReferenceMonth, splitTotalAcrossInstallments } from '../lib/invoiceInstallments'
import { ensureInvoicePayableLinked, syncLinkedPayable } from '../lib/invoicePayableSync'
import { toUpperTrim } from '../lib/text'

type Inv = {
  id: string
  credit_card_id: string
  reference_month: string
  due_date: string
  status: string
  payable_id: string | null
}

type Item = {
  id: string
  occurred_on: string
  description: string
  amount: number
  category_id: string | null
  family_member_id: string | null
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

type ItemAmountMode = 'total' | 'per_installment'

type InvoiceNavRow = { id: string; competenciaKey: string }

function refMonthDisplay(iso: string) {
  return iso.slice(0, 7)
}

export function InvoiceDetailPage() {
  const { cardId, invoiceId } = useParams<{ cardId: string; invoiceId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  
  const [cardName, setCardName] = useState('')
  const [limitAmount, setLimitAmount] = useState<number | null>(null)
  const [inv, setInv] = useState<Inv | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [familyMembers, setFamilyMembers] = useState<{ id: string; name: string }[]>([])
  const [payableStatus, setPayableStatus] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [invoiceNav, setInvoiceNav] = useState<{ prev: InvoiceNavRow[]; next: InvoiceNavRow[] }>({
    prev: [],
    next: [],
  })
  const [loading, setLoading] = useState(true)
  const [warnPaid, setWarnPaid] = useState(false)

  const [ccCategoryId, setCcCategoryId] = useState<string | null>(null)

  const [itemForm, setItemForm] = useState({
    occurred_on: toISODate(new Date()),
    description: '',
    amount: '',
    category_id: '',
    family_member_id: '',
    parcel_count: '1',
    amount_mode: 'total' as ItemAmountMode,
  })
  const [editingItem, setEditingItem] = useState<Item | null>(null)

  const handleDescriptionChange = (desc: string) => {
    const nextForm = { ...itemForm, description: desc }
    if (desc && desc.trim().length >= 3) {
      const match = items.find(
        (it) =>
          it.description &&
          it.description.toLowerCase().includes(desc.toLowerCase())
      )
      if (match) {
        if (match.category_id) nextForm.category_id = match.category_id
        if (match.family_member_id) nextForm.family_member_id = match.family_member_id
      }
    }
    setItemForm(nextForm)
  }

  function statusPt(s: string | null) {
    if (!s) return '—'
    if (s === 'open') return 'ABERTO'
    if (s === 'paid') return 'PAGO'
    return s.toUpperCase()
  }

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId || !invoiceId || !cardId) return
    setLoading(true)
    const ccCat = await ensureCreditCardExpenseCategory(supabase, ownerUserId)
    setCcCategoryId(ccCat)
    
    const [{ data: c }, { data: i }, { data: it }, { data: cat }, { data: fams }] = await Promise.all([
      supabase.from('credit_cards').select('name, limit_amount').eq('id', cardId).eq('user_id', ownerUserId).single(),
      supabase.from('credit_card_invoices').select('*').eq('id', invoiceId).eq('user_id', ownerUserId).single(),
      supabase.from('credit_card_invoice_items').select('*').eq('invoice_id', invoiceId).order('occurred_on'),
      supabase.from('categories').select('id, name').eq('user_id', ownerUserId).order('name'),
      supabase.from('lsh_family_members').select('id, name').eq('user_id', ownerUserId).order('name'),
    ])

    const cardNm = (c as { name: string; limit_amount: number | null } | null)?.name ?? ''
    const cardLimit = (c as { name: string; limit_amount: number | null } | null)?.limit_amount ?? null
    setCardName(cardNm)
    setLimitAmount(cardLimit)
    
    let invoice = i as Inv | null
    setItems((it as Item[]) ?? [])
    setCats((cat as { id: string; name: string }[]) ?? [])
    setFamilyMembers((fams as { id: string; name: string }[]) ?? [])

    if (invoice) {
      setDueDate(invoice.due_date)
      if (ownerUserId) {
        const linked = await ensureInvoicePayableLinked(supabase, {
          userId: ownerUserId,
          invoiceId: invoice.id,
          dueDate: invoice.due_date,
          referenceMonth: invoice.reference_month,
          payableId: invoice.payable_id,
          cardName: cardNm,
          categoryId: ccCat,
        })
        if (!invoice.payable_id && linked) invoice = { ...invoice, payable_id: linked }
      }
      if (invoice.payable_id) {
        const { data: p } = await supabase
          .from('payables_receivables')
          .select('status')
          .eq('id', invoice.payable_id)
          .maybeSingle()
        setPayableStatus((p as { status: string } | null)?.status ?? null)
      } else {
        setPayableStatus(null)
      }
      if (invoice.payable_id && ccCat) {
        const r = await syncLinkedPayable(supabase, {
          invoiceId,
          payableId: invoice.payable_id,
          dueDate: invoice.due_date,
          cardName: cardNm,
          referenceMonthLabel: monthLabel(parseISODate(invoice.reference_month)),
          categoryId: ccCat,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
      const { data: sib } = await supabase
        .from('credit_card_invoices')
        .select('id, reference_month')
        .eq('credit_card_id', cardId)
        .eq('user_id', ownerUserId)
      const sorted = ((sib ?? []) as { id: string; reference_month: string }[]).sort((a, b) =>
        a.reference_month.localeCompare(b.reference_month),
      )
      const ix = sorted.findIndex((row) => row.id === invoiceId)
      const prevRows =
        ix > 0 ? sorted.slice(Math.max(0, ix - 3), ix) : []
      const nextRows =
        ix >= 0 && ix < sorted.length - 1 ? sorted.slice(ix + 1, Math.min(sorted.length, ix + 1 + 12)) : []
      setInvoiceNav({
        prev: prevRows.map((row) => ({ id: row.id, competenciaKey: refMonthDisplay(row.reference_month) })),
        next: nextRows.map((row) => ({ id: row.id, competenciaKey: refMonthDisplay(row.reference_month) })),
      })
    } else {
      setInvoiceNav({ prev: [], next: [] })
    }
    setInv(invoice)
    setLoading(false)
  }, [supabase, ownerUserId, invoiceId, cardId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!ccCategoryId || editingItem) return
    setItemForm((prev) => (prev.category_id ? prev : { ...prev, category_id: ccCategoryId }))
  }, [ccCategoryId, editingItem])

  const itemsLocked = !!(inv?.payable_id && payableStatus === 'paid')

  const runSyncInvoice = useCallback(async () => {
    if (!supabase || !invoiceId || !ownerUserId) return
    const { data: row } = await supabase
      .from('credit_card_invoices')
      .select('payable_id, due_date, reference_month')
      .eq('id', invoiceId)
      .eq('user_id', ownerUserId)
      .maybeSingle()
    const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
    if (!invRow?.payable_id) return
    const refLabel = monthLabel(parseISODate(invRow.reference_month))
    const r = await syncLinkedPayable(supabase, {
      invoiceId,
      payableId: invRow.payable_id,
      dueDate: invRow.due_date,
      cardName,
      referenceMonthLabel: refLabel,
      categoryId: ccCategoryId,
    })
    if (r.skippedPaid) setWarnPaid(true)
  }, [supabase, invoiceId, ownerUserId, cardName, ccCategoryId])

  const syncPayablesForInvoiceIds = useCallback(
    async (ids: string[]) => {
      if (!supabase || !ownerUserId) return
      const unique = [...new Set(ids)]
      for (const iid of unique) {
        const { data: row } = await supabase
          .from('credit_card_invoices')
          .select('payable_id, due_date, reference_month')
          .eq('id', iid)
          .eq('user_id', ownerUserId)
          .maybeSingle()
        const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
        if (!invRow) continue
        const effPayable = await ensureInvoicePayableLinked(supabase, {
          userId: ownerUserId,
          invoiceId: iid,
          dueDate: invRow.due_date,
          referenceMonth: invRow.reference_month,
          payableId: invRow.payable_id,
          cardName,
          categoryId: ccCategoryId,
        })
        const pid = effPayable ?? invRow.payable_id
        if (!pid) continue
        const r = await syncLinkedPayable(supabase, {
          invoiceId: iid,
          payableId: pid,
          dueDate: invRow.due_date,
          cardName,
          referenceMonthLabel: monthLabel(parseISODate(invRow.reference_month)),
          categoryId: ccCategoryId,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
    },
    [supabase, ownerUserId, cardName, ccCategoryId],
  )

  async function saveInvoiceMeta(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !inv) return
    const { error } = await supabase.from('credit_card_invoices').update({ due_date: dueDate }).eq('id', inv.id)
    if (error) alert(error.message)
    else {
      if (inv.payable_id) {
        const refLabel = monthLabel(parseISODate(inv.reference_month))
        const r = await syncLinkedPayable(supabase, {
          invoiceId: inv.id,
          payableId: inv.payable_id,
          dueDate,
          cardName,
          referenceMonthLabel: refLabel,
          categoryId: ccCategoryId,
        })
        if (r.skippedPaid) setWarnPaid(true)
      }
      await load()
    }
  }

  async function submitItem(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !invoiceId || !inv || !ownerUserId || !cardId || itemsLocked) return
    const n = Math.max(1, parseInt(itemForm.parcel_count, 10) || 1)
    const baseDesc = toUpperTrim(itemForm.description)
    const baseAmount = parseMoney(itemForm.amount)
    const baseCategoryId = itemForm.category_id || ccCategoryId || null
    const baseFamilyMemberId = itemForm.family_member_id || null

    const base = {
      occurred_on: itemForm.occurred_on,
      description: baseDesc,
      amount: baseAmount,
      category_id: baseCategoryId,
      family_member_id: baseFamilyMemberId,
    }

    if (editingItem) {
      const { error } = await supabase.from('credit_card_invoice_items').update(base).eq('id', editingItem.id)
      if (error) {
        alert(error.message)
        return
      }
      const extraInvoiceIds: string[] = []
      const gid = editingItem.installment_group_id
      const curNum = editingItem.installment_number
      const nParc = editingItem.installment_count
      if (gid != null && curNum != null && nParc != null && nParc > 1) {
        const { data: sibs, error: sibErr } = await supabase
          .from('credit_card_invoice_items')
          .select('id, invoice_id, installment_number')
          .eq('installment_group_id', gid)
          .gt('installment_number', curNum)
        if (sibErr) console.error(sibErr)
        else if (sibs?.length) {
          const invIds = [...new Set(sibs.map((s) => s.invoice_id))]
          const { data: invs } = await supabase
            .from('credit_card_invoices')
            .select('id, status')
            .in('id', invIds)
            .eq('user_id', ownerUserId)
          const openSet = new Set(
            ((invs ?? []) as { id: string; status: string }[])
              .filter((invRow) => invRow.status === 'open')
              .map((invRow) => invRow.id),
          )
          const targets = (sibs as { id: string; invoice_id: string }[]).filter((s) => openSet.has(s.invoice_id))
          if (targets.length) {
            const patchIds = targets.map((t) => t.id)
            const { error: batchErr } = await supabase
              .from('credit_card_invoice_items')
              .update({ amount: baseAmount, family_member_id: baseFamilyMemberId })
              .in('id', patchIds)
            if (batchErr) alert(batchErr.message)
            else extraInvoiceIds.push(...targets.map((t) => t.invoice_id))
          }
        }
      }
      setEditingItem(null)
      setItemForm({
        occurred_on: toISODate(new Date()),
        description: '',
        amount: '',
        category_id: ccCategoryId ?? '',
        family_member_id: '',
        parcel_count: '1',
        amount_mode: 'total',
      })
      await load()
      await syncPayablesForInvoiceIds([...new Set([invoiceId, ...extraInvoiceIds])])
    } else {
      if (n === 1) {
        const singleGroupId = crypto.randomUUID()
        const { error } = await supabase.from('credit_card_invoice_items').insert({
          invoice_id: invoiceId,
          ...base,
          installment_group_id: singleGroupId,
          installment_number: 1,
          installment_count: 1,
        })
        if (error) {
          alert(error.message)
          return
        }
        setItemForm({
          occurred_on: toISODate(new Date()),
          description: '',
          amount: '',
          category_id: ccCategoryId ?? '',
          family_member_id: '',
          parcel_count: '1',
          amount_mode: 'total',
        })
        await load()
        await runSyncInvoice()
        return
      }

      const shareAmounts =
        itemForm.amount_mode === 'per_installment'
          ? Array.from({ length: n }, () => baseAmount)
          : splitTotalAcrossInstallments(baseAmount, n)
      const groupId = crypto.randomUUID()
      const touchedInvoiceIds: string[] = []

      for (let i = 0; i < n; i++) {
        const ref = addMonthsToReferenceMonth(inv.reference_month, i)
        const due = addMonthsToDueDate(inv.due_date, i)
        let targetInvoiceId = invoiceId

        if (i > 0) {
          const { data: found } = await supabase
            .from('credit_card_invoices')
            .select('id')
            .eq('user_id', ownerUserId)
            .eq('credit_card_id', cardId)
            .eq('reference_month', ref)
            .maybeSingle()
          const foundId = (found as { id: string } | null)?.id
          if (foundId) {
            targetInvoiceId = foundId
          } else {
            const { data: created, error: createErr } = await supabase
              .from('credit_card_invoices')
              .insert({
                user_id: ownerUserId,
                credit_card_id: cardId,
                reference_month: ref,
                due_date: due,
                status: 'open',
                payable_id: null,
                installment_group_id: null,
                installment_number: null,
                installment_count: null,
              })
              .select('id')
              .single()
            if (createErr) {
              alert(createErr.message)
              return
            }
            targetInvoiceId = (created as { id: string }).id
          }
        }

        const { error: itemErr } = await supabase.from('credit_card_invoice_items').insert({
          invoice_id: targetInvoiceId,
          occurred_on: itemForm.occurred_on,
          description: `${baseDesc} (PARCELA ${i + 1}/${n})`,
          amount: shareAmounts[i] ?? 0,
          category_id: baseCategoryId,
          family_member_id: baseFamilyMemberId,
          installment_group_id: groupId,
          installment_number: i + 1,
          installment_count: n,
        })
        if (itemErr) {
          alert(itemErr.message)
          return
        }
        if (!touchedInvoiceIds.includes(targetInvoiceId)) touchedInvoiceIds.push(targetInvoiceId)
      }

      for (const iid of touchedInvoiceIds) {
        const { data: row } = await supabase
          .from('credit_card_invoices')
          .select('payable_id, due_date, reference_month')
          .eq('id', iid)
          .eq('user_id', ownerUserId)
          .maybeSingle()
        const invRow = row as { payable_id: string | null; due_date: string; reference_month: string } | null
        if (!invRow) continue
        const effPayable = await ensureInvoicePayableLinked(supabase, {
          userId: ownerUserId,
          invoiceId: iid,
          dueDate: invRow.due_date,
          referenceMonth: invRow.reference_month,
          payableId: invRow.payable_id,
          cardName,
          categoryId: ccCategoryId,
        })
        const pid = effPayable ?? invRow.payable_id
        if (!pid) continue
        await syncLinkedPayable(supabase, {
          invoiceId: iid,
          payableId: pid,
          dueDate: invRow.due_date,
          cardName,
          referenceMonthLabel: monthLabel(parseISODate(invRow.reference_month)),
          categoryId: ccCategoryId,
        })
      }

      setItemForm({
        occurred_on: toISODate(new Date()),
        description: '',
        amount: '',
        category_id: ccCategoryId ?? '',
        family_member_id: '',
        parcel_count: '1',
        amount_mode: 'total',
      })
      await load()
    }
  }

  async function deleteItem(id: string) {
    if (!supabase || itemsLocked) return
    const item = items.find((x) => x.id === id)
    const msg = item?.installment_group_id
      ? 'Esta compra está parcelada. Excluir esta parcela removerá TODAS as parcelas desta compra. Continuar?'
      : 'Excluir item?'
    if (!confirm(msg)) return
    const q = supabase.from('credit_card_invoice_items').delete()
    const { error } = item?.installment_group_id
      ? await q.eq('installment_group_id', item.installment_group_id)
      : await q.eq('id', id)
    if (error) alert(error.message)
    else {
      await load()
      await runSyncInvoice()
    }
  }

  if (!supabase || !invoiceId || !cardId) return <p className="text-slate-600">…</p>
  if (loading && !inv) return <p className="text-slate-500">Carregando…</p>
  if (!inv) return <p className="text-red-600">Fatura não encontrada.</p>

  const total = items.reduce((s, x) => s + Number(x.amount), 0)
  const percentUsed = limitAmount ? Math.min(100, (total / limitAmount) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/lsh/cartoes/${cardId}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              Fatura {cardName}
            </h2>
            <p className="text-sm text-slate-500">Competência: {monthLabel(parseISODate(inv.reference_month)).toUpperCase()}</p>
          </div>
        </div>

        <nav
          className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-xs font-semibold text-slate-600"
          aria-label="Navegação da fatura"
        >
          <div className="flex flex-wrap gap-4">
            <Link to="/lsh/cartoes" className="text-sky-600 hover:underline">
              ← CARTÕES
            </Link>
            <Link to={`/lsh/cartoes/${cardId}`} className="text-sky-600 hover:underline">
              VER FATURAS DESTE CARTÃO
            </Link>
          </div>
          {invoiceNav.prev.length > 0 && (
            <div className="border-t border-slate-100 pt-2.5">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Faturas Anteriores</p>
              <div className="flex flex-wrap gap-1.5">
                {invoiceNav.prev.map((row) => (
                  <Link
                    key={row.id}
                    to={`/lsh/cartoes/${cardId}/faturas/${row.id}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  >
                    {row.competenciaKey}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {invoiceNav.next.length > 0 && (
            <div className="border-t border-slate-100 pt-2.5">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Faturas Seguintes</p>
              <div className="flex flex-wrap gap-1.5">
                {invoiceNav.next.map((row) => (
                  <Link
                    key={row.id}
                    to={`/lsh/cartoes/${cardId}/faturas/${row.id}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  >
                    {row.competenciaKey}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      </div>

      {warnPaid && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          A conta a pagar vinculada está <strong>PAGA</strong>: novos lançamentos não alteram o valor no fluxo de caixa automaticamente.
        </div>
      )}

      {itemsLocked && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
          Itens bloqueados porque a fatura foi liquidada (conta a pagar está paga). Reabra a conta para editar.
        </div>
      )}

      {/* Visualização de Limite do Cartão */}
      {limitAmount && limitAmount > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wide">
            <span>Uso do Limite do Cartão</span>
            <span>{formatBRL(total)} / {formatBRL(limitAmount)} ({percentUsed.toFixed(1)}%)</span>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                percentUsed > 90
                  ? 'bg-red-500'
                  : percentUsed > 75
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-semibold text-slate-500">
            <span>Disponível para compras:</span>
            <span className="text-slate-800">{formatBRL(Math.max(0, limitAmount - total))}</span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {/* Info Fatura */}
        <div className="md:col-span-1 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Informações</h3>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total da Fatura</span>
              <span className="text-2xl font-bold text-slate-800 block">{formatBRL(total)}</span>
            </div>

            {inv.payable_id && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status da Conta Vinculada</span>
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${
                    payableStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {statusPt(payableStatus)}
                </span>
              </div>
            )}

            <form onSubmit={saveInvoiceMeta} className="space-y-3 pt-3 border-t border-slate-100">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Data de Vencimento</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium focus:outline-none"
                />
              </div>
              <Button type="submit" variant="secondary" className="w-full h-[36px] text-xs font-semibold">
                Atualizar Vencimento
              </Button>
            </form>
          </div>
        </div>

        {/* Cadastro de Item */}
        <div className="md:col-span-2">
          <form onSubmit={submitItem} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              {editingItem ? 'Editar Item da Fatura' : 'Adicionar Item na Fatura'}
            </h3>
            
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Data da Compra</label>
                <input
                  type="date"
                  value={itemForm.occurred_on}
                  onChange={(e) => setItemForm({ ...itemForm, occurred_on: e.target.value })}
                  disabled={itemsLocked}
                  className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Valor</label>
                <input
                  value={itemForm.amount}
                  onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })}
                  disabled={itemsLocked}
                  required
                  placeholder="0,00"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none"
                />
              </div>
              
              <div className="sm:col-span-2 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Modo do Lançamento</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="radio"
                      name="item_amount_mode"
                      checked={itemForm.amount_mode === 'total'}
                      disabled={itemsLocked || !!editingItem}
                      onChange={() => setItemForm({ ...itemForm, amount_mode: 'total' })}
                      className="h-4 w-4 text-[#185FA5]"
                    />
                    Dividir valor total pelas parcelas
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="radio"
                      name="item_amount_mode"
                      checked={itemForm.amount_mode === 'per_installment'}
                      disabled={itemsLocked || !!editingItem}
                      onChange={() => setItemForm({ ...itemForm, amount_mode: 'per_installment' })}
                      className="h-4 w-4 text-[#185FA5]"
                    />
                    Repetir valor em cada parcela
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Descrição</label>
                <input
                  value={itemForm.description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  disabled={itemsLocked}
                  placeholder="Ex.: Supermercado Lemos"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Categoria</label>
                <select
                  value={itemForm.category_id}
                  onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                  disabled={itemsLocked}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">— Categoria padrão</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Familiar Responsável</label>
                <select
                  value={itemForm.family_member_id}
                  onChange={(e) => setItemForm({ ...itemForm, family_member_id: e.target.value })}
                  disabled={itemsLocked}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">Sem vínculo</option>
                  {familyMembers.map((fm) => (
                    <option key={fm.id} value={fm.id}>
                      {fm.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Quantidade de Parcelas</label>
                <input
                  type="number"
                  min={1}
                  value={itemForm.parcel_count}
                  onChange={(e) => setItemForm({ ...itemForm, parcel_count: e.target.value })}
                  disabled={itemsLocked || !!editingItem}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
              {editingItem && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-[38px] px-4 text-xs font-semibold"
                  onClick={() => {
                    setEditingItem(null)
                    setItemForm({
                      occurred_on: toISODate(new Date()),
                      description: '',
                      amount: '',
                      category_id: ccCategoryId ?? '',
                      family_member_id: '',
                      parcel_count: '1',
                      amount_mode: 'total',
                    })
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button type="submit" variant="primary" className="h-[38px] px-5 text-xs font-semibold" disabled={itemsLocked}>
                {editingItem ? 'Salvar Item' : 'Adicionar Item'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Nenhum item lançado nesta fatura.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Descrição</th>
                <th className="px-5 py-3">Familiar</th>
                <th className="px-5 py-3">Parcela</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const fm = familyMembers.find((f) => f.id === it.family_member_id)
                return (
                  <tr key={it.id} className="hover:bg-slate-50/30">
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{it.occurred_on}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{it.description}</td>
                    <td className="px-5 py-3.5">
                      {fm ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          <Users size={12} className="text-slate-400" />
                          {fm.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-medium">
                      {`${it.installment_number ?? 1}/${it.installment_count ?? 1}`}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-medium">
                      {cats.find((c) => c.id === it.category_id)?.name ?? CREDIT_CARD_INVOICE_CATEGORY_NAME}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-800">
                      {formatBRL(Number(it.amount))}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="EDITAR"
                          aria-label="EDITAR"
                          disabled={itemsLocked}
                          onClick={() => {
                            setEditingItem(it)
                            setItemForm({
                              occurred_on: it.occurred_on,
                              description: it.description,
                              amount: String(it.amount),
                              category_id: it.category_id ?? '',
                              family_member_id: it.family_member_id ?? '',
                              parcel_count: String(it.installment_count ?? 1),
                              amount_mode: 'total',
                            })
                          }}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                          title="EXCLUIR"
                          aria-label="EXCLUIR"
                          disabled={itemsLocked}
                          onClick={() => deleteItem(it.id)}
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
          </div>
        )}
      </div>
    </div>
  )
}
