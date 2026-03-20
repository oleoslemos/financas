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
  },
): Promise<{ skippedPaid: boolean }> {
  if (!opts.payableId) return { skippedPaid: false }
  const { data: pay } = await supabase.from('payables_receivables').select('status').eq('id', opts.payableId).maybeSingle()
  if (pay?.status === 'paid') return { skippedPaid: true }
  const total = await sumInvoiceItems(supabase, opts.invoiceId)
  await supabase
    .from('payables_receivables')
    .update({
      amount: total,
      due_date: opts.dueDate,
      description: `FATURA ${opts.cardName} – ${opts.referenceMonthLabel}`,
    })
    .eq('id', opts.payableId)
  return { skippedPaid: false }
}
