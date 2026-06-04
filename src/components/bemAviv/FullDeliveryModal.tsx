import { PackageCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { useSupabase } from '../../hooks/useSupabase'
import { DeliveryDateFields } from './DeliveryDateFields'
import {
  insertOrderDelivery,
  toPgDateOnly,
  validateDeliveryDates,
} from '../../lib/bemAvivOrderDeliveries'
import { todayInputDate } from '../../lib/dates'

type OrderHeader = {
  id: string
  document_number: string | null
  expected_arrival_date?: string | null
}

type Props = {
  order: OrderHeader | null
  companyId: string | null
  ownerUserId: string | null
  onClose: () => void
  onSaved: () => void
}

export function FullDeliveryModal({ order, companyId, ownerUserId, onClose, onSaved }: Props) {
  const supabase = useSupabase()
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(todayInputDate())
  const [deliveredAtDate, setDeliveredAtDate] = useState(todayInputDate())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!order) return
    const prefill = order.expected_arrival_date ? String(order.expected_arrival_date).slice(0, 10) : todayInputDate()
    setExpectedArrivalDate(prefill)
    setDeliveredAtDate(todayInputDate())
  }, [order])

  async function handleConfirm() {
    if (!supabase || !order || !companyId || !ownerUserId) return

    const dateErr = validateDeliveryDates(expectedArrivalDate, deliveredAtDate)
    if (dateErr) {
      alert(dateErr)
      return
    }

    setSaving(true)

    const { data: items, error: itemsErr } = await supabase
      .from('bem_aviv_sales_order_items')
      .select('id, quantity, quantity_delivered')
      .eq('sales_order_id', order.id)

    if (itemsErr) {
      alert(itemsErr.message)
      setSaving(false)
      return
    }

    const rows = (items ?? []) as Array<{ id: string; quantity: number; quantity_delivered: number }>
    const lines = rows
      .filter((item) => item.quantity > item.quantity_delivered)
      .map((item) => ({
        sales_order_item_id: item.id,
        quantity: item.quantity - item.quantity_delivered,
      }))

    const deliveredAt = deliveredAtDate.trim() ? toPgDateOnly(deliveredAtDate) : toPgDateOnly(todayInputDate())

    const { error: histErr } = await insertOrderDelivery(supabase, {
      sales_order_id: order.id,
      company_id: companyId,
      user_id: ownerUserId.toUpperCase(),
      kind: 'TOTAL',
      expected_arrival_date: expectedArrivalDate,
      delivered_at: deliveredAt,
      lines,
    })

    if (histErr) {
      alert(histErr)
      setSaving(false)
      return
    }

    for (const item of rows) {
      const { error } = await supabase
        .from('bem_aviv_sales_order_items')
        .update({ quantity_delivered: item.quantity })
        .eq('id', item.id)
      if (error) {
        alert(error.message)
        setSaving(false)
        return
      }
    }

    const { error: orderErr } = await supabase
      .from('bem_aviv_sales_orders')
      .update({
        status: 'ENTREGUE',
        expected_arrival_date: toPgDateOnly(expectedArrivalDate),
        delivered_at: deliveredAt,
      })
      .eq('id', order.id)
      .eq('company_id', companyId)

    setSaving(false)
    if (orderErr) {
      alert(orderErr.message)
      return
    }

    onSaved()
    onClose()
  }

  if (!order) return null

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-delivery-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div>
            <h3 id="full-delivery-title" className="text-lg font-semibold text-slate-900">
              Confirmar entrega total
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Pedido <strong>{order.document_number ?? '—'}</strong>
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <p className="text-sm text-slate-600">
            Todos os itens pendentes serão marcados como entregues. Informe a previsão de chegada e a data da entrega.
          </p>
          <DeliveryDateFields
            expectedArrivalDate={expectedArrivalDate}
            deliveredAtDate={deliveredAtDate}
            onExpectedChange={setExpectedArrivalDate}
            onDeliveredChange={setDeliveredAtDate}
            disabled={saving}
            fullDelivery
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={saving} className="inline-flex items-center gap-1.5">
            <PackageCheck size={15} aria-hidden />
            {saving ? 'Salvando…' : 'Confirmar entrega total'}
          </Button>
        </div>
      </div>
    </div>
  )
}
