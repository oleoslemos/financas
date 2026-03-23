import type { SupabaseClient } from '@supabase/supabase-js'

export async function sumInvoiceItems(supabase: SupabaseClient, invoiceId: string): Promise<number> {
  const { data } = await supabase.from('credit_card_invoice_items').select('amount').eq('invoice_id', invoiceId)
  return (data ?? []).reduce((s, r: { amount: number }) => s + Number(r.amount), 0)
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
