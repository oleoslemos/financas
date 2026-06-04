import type { SupabaseClient } from '@supabase/supabase-js'
export type OrderDeliveryKind = 'PARCIAL' | 'TOTAL'

export type OrderDeliveryLineInput = {
  sales_order_item_id: string
  quantity: number
}

export type OrderDeliveryRecordInput = {
  sales_order_id: string
  company_id: string
  user_id: string
  kind: OrderDeliveryKind
  expected_arrival_date: string
  delivered_at: string | null
  lines: OrderDeliveryLineInput[]
}

export type OrderDeliveryHistoryRow = {
  id: string
  kind: OrderDeliveryKind
  expected_arrival_date: string
  delivered_at: string | null
  created_at: string
}

/** Converte input date (YYYY-MM-DD) para coluna date do Postgres. */
export function toPgDateOnly(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 10)
}

export function validateDeliveryDates(expectedArrival: string, deliveredAt: string): string | null {
  const expected = toPgDateOnly(expectedArrival)
  if (!expected) return 'Informe a previsão de chegada.'
  const delivered = deliveredAt.trim() ? toPgDateOnly(deliveredAt) : null
  if (deliveredAt.trim() && !delivered) return 'Data da entrega inválida.'
  return null
}

export async function insertOrderDelivery(
  supabase: SupabaseClient,
  input: OrderDeliveryRecordInput,
): Promise<{ error: string | null }> {
  const expected = toPgDateOnly(input.expected_arrival_date)
  if (!expected) return { error: 'Previsão de chegada obrigatória.' }

  const delivered = input.delivered_at?.trim() ? toPgDateOnly(input.delivered_at) : null

  const { data: delivery, error: deliveryErr } = await supabase
    .from('bem_aviv_sales_order_deliveries')
    .insert({
      sales_order_id: input.sales_order_id,
      company_id: input.company_id,
      user_id: input.user_id,
      kind: input.kind,
      expected_arrival_date: expected,
      delivered_at: delivered,
    })
    .select('id')
    .single()

  if (deliveryErr) return { error: deliveryErr.message }
  if (!delivery?.id) return { error: 'Não foi possível registrar a entrega.' }

  if (input.lines.length > 0) {
    const { error: linesErr } = await supabase.from('bem_aviv_sales_order_delivery_lines').insert(
      input.lines.map((line) => ({
        delivery_id: delivery.id,
        sales_order_item_id: line.sales_order_item_id,
        quantity: line.quantity,
      })),
    )
    if (linesErr) return { error: linesErr.message }
  }

  return { error: null }
}

export async function fetchOrderDeliveryHistory(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderDeliveryHistoryRow[]> {
  const { data, error } = await supabase
    .from('bem_aviv_sales_order_deliveries')
    .select('id, kind, expected_arrival_date, delivered_at, created_at')
    .eq('sales_order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return (data ?? []) as OrderDeliveryHistoryRow[]
}

/** Atualiza previsão no pedido sem registrar entrega. */
export async function updateOrderExpectedArrival(
  supabase: SupabaseClient,
  orderId: string,
  companyId: string,
  expectedArrivalDate: string,
): Promise<{ error: string | null }> {
  const expected = toPgDateOnly(expectedArrivalDate)
  if (!expected) return { error: 'Informe a previsão de chegada.' }

  const { error } = await supabase
    .from('bem_aviv_sales_orders')
    .update({ expected_arrival_date: expected })
    .eq('id', orderId)
    .eq('company_id', companyId)

  return { error: error?.message ?? null }
}
