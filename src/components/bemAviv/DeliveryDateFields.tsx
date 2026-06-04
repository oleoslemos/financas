type Props = {
  expectedArrivalDate: string
  deliveredAtDate: string
  onExpectedChange: (value: string) => void
  onDeliveredChange: (value: string) => void
  disabled?: boolean
  /** Entrega total: rótulo da data efetiva pode enfatizar confirmação. */
  fullDelivery?: boolean
}

export function DeliveryDateFields({
  expectedArrivalDate,
  deliveredAtDate,
  onExpectedChange,
  onDeliveredChange,
  disabled,
  fullDelivery,
}: Props) {
  return (
    <div className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Previsão de chegada <span className="text-rose-600">*</span>
        </label>
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={expectedArrivalDate}
          disabled={disabled}
          onChange={(e) => onExpectedChange(e.target.value)}
        />
        <p className="mt-1 text-[10px] text-slate-500">Quando o cliente deve receber esta remessa.</p>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {fullDelivery ? 'Data da entrega' : 'Data da entrega (registro)'}
        </label>
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={deliveredAtDate}
          disabled={disabled}
          onChange={(e) => onDeliveredChange(e.target.value)}
        />
        <p className="mt-1 text-[10px] text-slate-500">
          {fullDelivery ? 'Data em que a entrega foi realizada.' : 'Opcional; padrão é hoje ao salvar.'}
        </p>
      </div>
    </div>
  )
}
