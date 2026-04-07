import type { SupabaseClient } from '@supabase/supabase-js'
import { monthLabel, parseISODate } from './dates'

export async function sumInvoiceItems(supabase: SupabaseClient, invoiceId: string): Promise<number> {
  const { data } = await supabase.from('credit_card_invoice_items').select('amount').eq('invoice_id', invoiceId)
  return (data ?? []).reduce((s, r: { amount: number }) => s + Number(r.amount), 0)
}

/** Cria conta a pagar e vincula em `credit_card_invoices` quando ainda não há `payable_id`. */
export async function ensureInvoicePayableLinked(
  supabase: SupabaseClient,
  opts: {
    userId: string
    invoiceId: string
    dueDate: string
    referenceMonth: string
    payableId: string | null
    cardName: string
    categoryId: string | null
  },
): Promise<string | null> {
  if (opts.payableId || !opts.categoryId) return opts.payableId
  const totalVal = await sumInvoiceItems(supabase, opts.invoiceId)
  const refLabel = monthLabel(parseISODate(opts.referenceMonth))
  const { data: created, error } = await supabase
    .from('payables_receivables')
    .insert({
      user_id: opts.userId,
      kind: 'payable',
      amount: totalVal,
      due_date: opts.dueDate,
      description: `FATURA ${opts.cardName} – ${refLabel}`,
      status: 'open',
      category_id: opts.categoryId,
      bank_account_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_count: null,
    })
    .select('id')
    .single()
  if (error) {
    console.error(error)
    return null
  }
  const pid = (created as { id: string }).id
  await supabase.from('credit_card_invoices').update({ payable_id: pid }).eq('id', opts.invoiceId)
  return pid
}

export async function syncLinkedPayable(
  supabase: SupabaseClient,
  opts: {
    invoiceId: string
    payableId: string | null
    dueDate: string
    cardName: string
    referenceMonthLabel: string
    /** Categoria "CARTÃO DE CRÉDITO" na conta a pagar vinculada */
    categoryId?: string | null
  },
): Promise<{ skippedPaid: boolean }> {
  if (!opts.payableId) return { skippedPaid: false }
  const { data: pay } = await supabase.from('payables_receivables').select('status').eq('id', opts.payableId).maybeSingle()
  if (pay?.status === 'paid') return { skippedPaid: true }
  const total = await sumInvoiceItems(supabase, opts.invoiceId)
  const patch: {
    amount: number
    due_date: string
    description: string
    category_id?: string | null
  } = {
    amount: total,
    due_date: opts.dueDate,
    description: `FATURA ${opts.cardName} – ${opts.referenceMonthLabel}`,
  }
  if (opts.categoryId) patch.category_id = opts.categoryId
  await supabase.from('payables_receivables').update(patch).eq('id', opts.payableId)
  return { skippedPaid: false }
}
