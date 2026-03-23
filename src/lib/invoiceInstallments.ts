import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonths, monthLabel, parseISODate, toISODate } from './dates'
import { syncLinkedPayable } from './invoicePayableSync'

/** Divide total em N parcelas em centavos (reais com 2 decimais), sem perder valor. */
export function splitTotalAcrossInstallments(total: number, n: number): number[] {
  if (n < 1) return []
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const rem = cents % n
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push((base + (i < rem ? 1 : 0)) / 100)
  }
  return out
}

export function addMonthsToReferenceMonth(referenceMonthIso: string, months: number): string {
  const d = parseISODate(referenceMonthIso.slice(0, 10))
  const x = addMonths(d, months)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function addMonthsToDueDate(dueIso: string, months: number): string {
  const d = parseISODate(dueIso + 'T12:00:00')
  return toISODate(addMonths(d, months))
}

export type InvoiceRow = {
  id: string
  credit_card_id: string
  reference_month: string
  due_date: string
  status: string
  payable_id: string | null
  installment_group_id: string | null
  installment_number: number | null
  installment_count: number | null
}

/** Soma dos itens de uma fatura. */
export async function sumItemsForInvoice(supabase: SupabaseClient, invoiceId: string): Promise<number> {
  const { data } = await supabase.from('credit_card_invoice_items').select('amount').eq('invoice_id', invoiceId)
  return (data ?? []).reduce((s, r: { amount: number }) => s + Number(r.amount), 0)
}

function refKey(iso: string): string {
  return iso.slice(0, 10).slice(0, 7)
}

async function deletePayableIfOpen(
  supabase: SupabaseClient,
  payableId: string | null,
): Promise<{ error?: string }> {
  if (!payableId) return {}
  const { data: p } = await supabase.from('payables_receivables').select('status').eq('id', payableId).maybeSingle()
  const st = (p as { status: string } | null)?.status
  if (st === 'paid') return { error: 'Conta a pagar vinculada está paga.' }
  await supabase.from('payables_receivables').delete().eq('id', payableId)
  return {}
}

/**
 * Aplica parcelamento em N faturas: cria meses faltantes (vencimento + competência),
 * redistribui o total atual em N linhas (uma por fatura) para permitir ajuste manual de arredondamento.
 */
export async function applyCreditCardInstallments(
  supabase: SupabaseClient,
  opts: {
    userId: string
    anchorInvoiceId: string
    installmentCount: number
    categoryIdForItems: string | null
    cardName: string
  },
): Promise<{ error?: string }> {
  const n = Math.max(2, Math.floor(opts.installmentCount))
  const { data: anchorRaw, error: aErr } = await supabase
    .from('credit_card_invoices')
    .select('*')
    .eq('id', opts.anchorInvoiceId)
    .eq('user_id', opts.userId)
    .single()
  if (aErr || !anchorRaw) return { error: 'Fatura não encontrada.' }
  const anchor = anchorRaw as InvoiceRow

  const groupId = anchor.installment_group_id ?? crypto.randomUUID()

  let existing: InvoiceRow[] = []
  if (anchor.installment_group_id) {
    const { data: g } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('installment_group_id', anchor.installment_group_id)
      .eq('user_id', opts.userId)
    existing = (g as InvoiceRow[]) ?? []
  } else {
    existing = [anchor]
  }

  existing.sort((x, y) => x.due_date.localeCompare(y.due_date))
  const base = existing[0]
  const baseDue = base.due_date
  const baseRef = base.reference_month.slice(0, 10)

  let T_total = 0
  for (const inv of existing) {
    T_total += await sumItemsForInvoice(supabase, inv.id)
  }

  for (const inv of existing) {
    if (inv.payable_id) {
      const { data: p } = await supabase.from('payables_receivables').select('status').eq('id', inv.payable_id).maybeSingle()
      if ((p as { status: string } | null)?.status === 'paid') {
        return { error: 'Não é possível alterar parcelamento: há fatura com conta a pagar paga.' }
      }
    }
  }

  const slots = Array.from({ length: n }, (_, i) => {
    const k = i + 1
    return {
      k,
      ref: addMonthsToReferenceMonth(baseRef, i),
      due: addMonthsToDueDate(baseDue, i),
    }
  })

  const matchedBySlot = new Map<number, InvoiceRow>()
  const usedIds = new Set<string>()

  for (const slot of slots) {
    const hit = existing.find((e) => refKey(e.reference_month) === refKey(slot.ref) && !usedIds.has(e.id))
    if (hit) {
      matchedBySlot.set(slot.k, hit)
      usedIds.add(hit.id)
      continue
    }
    const { data: clash } = await supabase
      .from('credit_card_invoices')
      .select('id, installment_group_id')
      .eq('credit_card_id', anchor.credit_card_id)
      .eq('user_id', opts.userId)
      .eq('reference_month', slot.ref)
      .maybeSingle()
    const c = clash as { id: string; installment_group_id: string | null } | null
    if (c && c.installment_group_id != null && c.installment_group_id !== groupId) {
      return {
        error:
          'Já existe fatura em outro parcelamento no mês ' +
          refKey(slot.ref) +
          '. Exclua ou ajuste antes de continuar.',
      }
    }
    if (c) {
      const { data: row } = await supabase.from('credit_card_invoices').select('*').eq('id', c.id).single()
      if (row) {
        matchedBySlot.set(slot.k, row as InvoiceRow)
        usedIds.add(c.id)
      }
    }
  }

  for (const slot of slots) {
    if (matchedBySlot.has(slot.k)) continue
    const { data: created, error: insErr } = await supabase
      .from('credit_card_invoices')
      .insert({
        user_id: opts.userId,
        credit_card_id: anchor.credit_card_id,
        reference_month: slot.ref,
        due_date: slot.due,
        status: 'open',
        payable_id: null,
        installment_group_id: groupId,
        installment_number: slot.k,
        installment_count: n,
      })
      .select('*')
      .single()
    if (insErr) return { error: insErr.message }
    matchedBySlot.set(slot.k, created as InvoiceRow)
    usedIds.add((created as InvoiceRow).id)
  }

  const toRemove = existing.filter((e) => !usedIds.has(e.id))
  for (const inv of toRemove) {
    const d = await deletePayableIfOpen(supabase, inv.payable_id)
    if (d.error) return d
    const { error: delErr } = await supabase.from('credit_card_invoices').delete().eq('id', inv.id)
    if (delErr) return { error: delErr.message }
  }

  const ordered: InvoiceRow[] = slots.map((s) => matchedBySlot.get(s.k)!).filter((x) => x != null)
  for (const slot of slots) {
    const inv = matchedBySlot.get(slot.k)
    if (!inv) return { error: 'Falha ao montar parcelas.' }
    const { error: uErr } = await supabase
      .from('credit_card_invoices')
      .update({
        installment_group_id: groupId,
        installment_number: slot.k,
        installment_count: n,
        reference_month: slot.ref,
        due_date: slot.due,
      })
      .eq('id', inv.id)
    if (uErr) return { error: uErr.message }
  }

  const shares = splitTotalAcrossInstallments(T_total, n)
  for (let i = 0; i < ordered.length; i++) {
    const inv = ordered[i]
    const slot = slots[i]
    await supabase.from('credit_card_invoice_items').delete().eq('invoice_id', inv.id)
    const { error: itErr } = await supabase.from('credit_card_invoice_items').insert({
      invoice_id: inv.id,
      occurred_on: slot.due,
      description: `PARCELA ${i + 1}/${n} — ${opts.cardName.toUpperCase()}`,
      amount: shares[i] ?? 0,
      category_id: opts.categoryIdForItems,
    })
    if (itErr) return { error: itErr.message }
  }

  for (let i = 0; i < ordered.length; i++) {
    const inv = ordered[i]
    const slot = slots[i]
    if (!inv.payable_id) continue
    const refLabel = monthLabel(parseISODate(slot.ref))
    await syncLinkedPayable(supabase, {
      invoiceId: inv.id,
      payableId: inv.payable_id,
      dueDate: slot.due,
      cardName: opts.cardName,
      referenceMonthLabel: refLabel,
      categoryId: opts.categoryIdForItems,
    })
  }

  return {}
}

/** Remove parcelamento: mantém só a fatura mais antiga (1º vencimento); apaga as demais do grupo. */
export async function dissolveCreditCardInstallmentGroup(
  supabase: SupabaseClient,
  userId: string,
  anchorInvoiceId: string,
): Promise<{ error?: string; survivorInvoiceId?: string }> {
  const { data: anchorRaw } = await supabase
    .from('credit_card_invoices')
    .select('*')
    .eq('id', anchorInvoiceId)
    .eq('user_id', userId)
    .single()
  const anchor = anchorRaw as InvoiceRow | null
  if (!anchor) return { error: 'Fatura não encontrada.' }
  if (!anchor.installment_group_id) return { error: 'Esta fatura não está parcelada.' }

  const { data: g } = await supabase
    .from('credit_card_invoices')
    .select('*')
    .eq('installment_group_id', anchor.installment_group_id)
    .eq('user_id', userId)
  const group = (g as InvoiceRow[]) ?? []
  group.sort((x, y) => x.due_date.localeCompare(y.due_date))
  const survivor = group[0]
  const others = group.slice(1)

  for (const inv of group) {
    if (inv.payable_id) {
      const { data: p } = await supabase.from('payables_receivables').select('status').eq('id', inv.payable_id).maybeSingle()
      if ((p as { status: string } | null)?.status === 'paid') {
        return { error: 'Não é possível remover: há conta a pagar paga em alguma parcela.' }
      }
    }
  }

  for (const inv of others) {
    const d = await deletePayableIfOpen(supabase, inv.payable_id)
    if (d.error) return d
    const { error: delErr } = await supabase.from('credit_card_invoices').delete().eq('id', inv.id)
    if (delErr) return { error: delErr.message }
  }

  await supabase
    .from('credit_card_invoices')
    .update({
      installment_group_id: null,
      installment_number: null,
      installment_count: null,
    })
    .eq('id', survivor.id)

  return { survivorInvoiceId: survivor.id }
}

/** Exclui uma fatura; se fizer parte de parcelamento, exclui todas as parcelas do grupo. */
export async function deleteCreditCardInvoiceOrGroup(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string,
): Promise<{ error?: string }> {
  const { data: invRaw } = await supabase
    .from('credit_card_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .single()
  const inv = invRaw as InvoiceRow | null
  if (!inv) return { error: 'Fatura não encontrada.' }

  if (!inv.installment_group_id) {
    const d = await deletePayableIfOpen(supabase, inv.payable_id)
    if (d.error) return d
    const { error: delErr } = await supabase.from('credit_card_invoices').delete().eq('id', invoiceId)
    if (delErr) return { error: delErr.message }
    return {}
  }

  const { data: group } = await supabase
    .from('credit_card_invoices')
    .select('id, payable_id')
    .eq('installment_group_id', inv.installment_group_id)
    .eq('user_id', userId)

  for (const row of group ?? []) {
    const r = row as { id: string; payable_id: string | null }
    if (r.payable_id) {
      const { data: p } = await supabase.from('payables_receivables').select('status').eq('id', r.payable_id).maybeSingle()
      if ((p as { status: string } | null)?.status === 'paid') {
        return { error: 'Não é possível excluir: há parcela com conta a pagar paga.' }
      }
    }
  }

  for (const row of group ?? []) {
    const r = row as { id: string; payable_id: string | null }
    if (r.payable_id) await supabase.from('payables_receivables').delete().eq('id', r.payable_id)
  }

  const ids = (group ?? []).map((x: { id: string }) => x.id)
  const { error: delErr } = await supabase.from('credit_card_invoices').delete().in('id', ids)
  if (delErr) return { error: delErr.message }
  return {}
}
