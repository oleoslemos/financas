import { PackageCheck, Truck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { useSupabase } from '../../hooks/useSupabase'
import { computeOrderDeliveryStatus, remainingQty } from '../../lib/bemAvivOrderDelivery'

type OrderHeader = {
  id: string
  document_number: string | null
  status: string
}

type DeliveryItemRow = {
  id: string
  item_description: string
  quantity: number
  quantity_delivered: number
}

type Props = {
  order: OrderHeader | null
  companyId: string | null
  onClose: () => void
  onSaved: () => void
}

export function PartialDeliveryModal({ order, companyId, onClose, onSaved }: Props) {
  const supabase = useSupabase()
  const [items, setItems] = useState<DeliveryItemRow[]>([])
  const [deliverNowById, setDeliverNowById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!order || !supabase) {
      setItems([])
      setDeliverNowById({})
      return
    }

    let cancelled = false
    setLoading(true)
    setItems([])
    setDeliverNowById({})

    void (async () => {
      const { data, error } = await supabase
        .from('bem_aviv_sales_order_items')
        .select('id, item_description, quantity, quantity_delivered')
        .eq('sales_order_id', order.id)
        .order('created_at')

      if (cancelled) return
      if (error) {
        alert(error.message)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as DeliveryItemRow[]
      setItems(rows)
      const draft: Record<string, string> = {}
      for (const row of rows) {
        if (remainingQty(row) > 0) draft[row.id] = ''
      }
      setDeliverNowById(draft)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [order, supabase])

  const pendingItems = useMemo(() => items.filter((i) => remainingQty(i) > 0), [items])

  async function persistDelivery(nextDeliveredById: Record<string, number>) {
    if (!supabase || !order || !companyId) return

    setSaving(true)
    const updatedItems = items.map((item) => ({
      ...item,
      quantity_delivered: nextDeliveredById[item.id] ?? item.quantity_delivered,
    }))

    for (const item of updatedItems) {
      const { error } = await supabase
        .from('bem_aviv_sales_order_items')
        .update({ quantity_delivered: item.quantity_delivered })
        .eq('id', item.id)
      if (error) {
        alert(error.message)
        setSaving(false)
        return
      }
    }

    const nextStatus = computeOrderDeliveryStatus(updatedItems)
    const { error: orderErr } = await supabase
      .from('bem_aviv_sales_orders')
      .update({ status: nextStatus })
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

  async function handleSavePartial() {
    if (!order) return

    const nextDeliveredById: Record<string, number> = {}
    let hasChange = false

    for (const item of items) {
      const raw = deliverNowById[item.id] ?? ''
      const deliverNow = raw.trim() === '' ? 0 : parseInt(raw.replace(/\D/g, ''), 10) || 0
      const maxNow = remainingQty(item)
      if (deliverNow > maxNow) {
        alert(`Quantidade inválida para "${item.item_description}". Máximo nesta entrega: ${maxNow}.`)
        return
      }
      const next = item.quantity_delivered + deliverNow
      nextDeliveredById[item.id] = next
      if (deliverNow > 0) hasChange = true
    }

    if (!hasChange) {
      alert('Informe a quantidade a entregar em pelo menos um item.')
      return
    }

    await persistDelivery(nextDeliveredById)
  }

  async function handleDeliverAll() {
    if (!order) return
    if (
      !confirm(
        `Entregar todos os itens pendentes do pedido ${order.document_number ?? ''}?\n\nO status será marcado como ENTREGUE.`,
      )
    ) {
      return
    }

    const nextDeliveredById = Object.fromEntries(items.map((item) => [item.id, item.quantity]))
    await persistDelivery(nextDeliveredById)
  }

  if (!order) return null

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partial-delivery-title"
    >
      <div className="flex max-h-[min(92dvh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div>
            <h3 id="partial-delivery-title" className="text-lg font-semibold text-slate-900">
              Entrega parcial
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Pedido <strong>{order.document_number ?? '—'}</strong> · informe o que será entregue agora
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">Carregando itens…</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Nenhum item neste pedido.</p>
          ) : pendingItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-emerald-700">Todos os itens já foram entregues.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5 text-center">Pedido</th>
                    <th className="px-3 py-2.5 text-center">Já entregue</th>
                    <th className="px-3 py-2.5 text-center">Pendente</th>
                    <th className="px-3 py-2.5 text-center">Entregar agora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const pending = remainingQty(item)
                    return (
                      <tr key={item.id} className={pending === 0 ? 'bg-emerald-50/40' : undefined}>
                        <td className="px-3 py-3 font-medium text-slate-800">{item.item_description}</td>
                        <td className="px-3 py-3 text-center tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-3 text-center tabular-nums text-emerald-700">{item.quantity_delivered}</td>
                        <td className="px-3 py-3 text-center tabular-nums font-semibold text-amber-700">{pending}</td>
                        <td className="px-3 py-3 text-center">
                          {pending > 0 ? (
                            <input
                              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm tabular-nums"
                              inputMode="numeric"
                              min={0}
                              max={pending}
                              placeholder="0"
                              value={deliverNowById[item.id] ?? ''}
                              disabled={saving}
                              onChange={(e) =>
                                setDeliverNowById((prev) => ({ ...prev, [item.id]: e.target.value.replace(/\D/g, '') }))
                              }
                            />
                          ) : (
                            <span className="text-xs font-semibold text-emerald-700">OK</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            onClick={() => void handleDeliverAll()}
            disabled={saving || loading || pendingItems.length === 0}
          >
            <PackageCheck size={15} aria-hidden />
            Entregar tudo
          </button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSavePartial()}
              disabled={saving || loading || pendingItems.length === 0}
              className="inline-flex items-center gap-1.5"
            >
              <Truck size={15} aria-hidden />
              {saving ? 'Salvando…' : 'Registrar entrega'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
