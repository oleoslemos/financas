import { CalendarClock, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { useSupabase } from '../../hooks/useSupabase'
import { updateOrderExpectedArrival } from '../../lib/bemAvivOrderDeliveries'
import { todayInputDate } from '../../lib/dates'

type OrderHeader = {
  id: string
  document_number: string | null
  expected_arrival_date?: string | null
}

type Props = {
  order: OrderHeader | null
  companyId: string | null
  onClose: () => void
  onSaved: () => void
}

export function ExpectedArrivalModal({ order, companyId, onClose, onSaved }: Props) {
  const supabase = useSupabase()
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(todayInputDate())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!order) return
    setExpectedArrivalDate(
      order.expected_arrival_date ? String(order.expected_arrival_date).slice(0, 10) : todayInputDate(),
    )
  }, [order])

  async function handleSave() {
    if (!supabase || !order || !companyId) return
    setSaving(true)
    const { error } = await updateOrderExpectedArrival(supabase, order.id, companyId, expectedArrivalDate)
    setSaving(false)
    if (error) {
      alert(error)
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
      aria-labelledby="expected-arrival-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div>
            <h3 id="expected-arrival-title" className="text-lg font-semibold text-slate-900">
              Previsão de chegada
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

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <p className="text-sm text-slate-600">
            Defina quando o cliente deve receber a próxima remessa, sem registrar entrega agora.
          </p>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Previsão de chegada <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={expectedArrivalDate}
              disabled={saving}
              onChange={(e) => setExpectedArrivalDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex items-center gap-1.5">
            <CalendarClock size={15} aria-hidden />
            {saving ? 'Salvando…' : 'Salvar previsão'}
          </Button>
        </div>
      </div>
    </div>
  )
}
