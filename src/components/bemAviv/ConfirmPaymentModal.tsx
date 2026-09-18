import { CircleDollarSign, X, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../ui/Button'
import { formatBRL } from '../../lib/format'

type PedidoHeader = {
  id: string
  document_number: string | null
  status: string
  total_amount: number
  down_payment_amount?: number | null
  payment_method?: string | null
  down_payment_method?: string | null
}

type Props = {
  order: PedidoHeader | null
  onClose: () => void
  onConfirm: (orderId: string, nextStatus: 'ENTRADA_PAGA' | 'ENTREGA PENDENTE') => Promise<void>
}

export function ConfirmPaymentModal({ order, onClose, onConfirm }: Props) {
  const [saving, setSaving] = useState(false)

  if (!order) return null

  const total = Number(order.total_amount ?? 0)
  const entrada = Math.max(0, Number(order.down_payment_amount ?? 0))
  const isAberto = order.status === 'ABERTO'
  const isEntradaPaga = order.status === 'ENTRADA_PAGA'
  const hasEntrada = entrada > 0
  const canLowerEntrada = isAberto && hasEntrada
  const remainingValue = isEntradaPaga ? Math.max(0, total - entrada) : total

  const handleAction = async (nextStatus: 'ENTRADA_PAGA' | 'ENTREGA PENDENTE') => {
    setSaving(true)
    try {
      await onConfirm(order.id, nextStatus)
      onClose()
    } catch {
      // error handled upstream
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-payment-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CircleDollarSign size={20} />
            </div>
            <div>
              <h3 id="confirm-payment-title" className="text-lg font-semibold text-slate-900">
                Confirmar Pagamento
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Pedido <strong className="text-slate-700">{order.document_number ?? '—'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 transition-colors"
            onClick={onClose}
            aria-label="Fechar"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        {/* Resumo do Pedido */}
        <div className="bg-slate-50/50 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
              <span className="text-slate-400 block font-medium">Valor Total do Pedido</span>
              <span className="text-slate-900 font-bold text-sm block mt-0.5">{formatBRL(total)}</span>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
              <span className="text-slate-400 block font-medium">Valor da Entrada</span>
              <span className="text-emerald-700 font-bold text-sm block mt-0.5">
                {hasEntrada ? formatBRL(entrada) : 'Sem Entrada'}
              </span>
            </div>
          </div>
        </div>

        {/* Opções de Baixa */}
        <div className="space-y-3 px-4 py-5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Selecione como deseja baixar o pagamento:
          </p>

          {/* Opção 1: Baixar Valor Entrada */}
          {canLowerEntrada && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleAction('ENTRADA_PAGA')}
              className="w-full text-left p-4 rounded-xl border border-cyan-200 bg-cyan-50/30 hover:bg-cyan-50 transition-all hover:shadow-sm group focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white font-bold text-xs">
                    1
                  </span>
                  <span className="font-semibold text-slate-900 text-sm">
                    Baixar Valor Entrada ({formatBRL(entrada)})
                  </span>
                </div>
                <ArrowRight size={16} className="text-cyan-600 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="mt-2 text-xs text-slate-600 pl-8 leading-relaxed">
                Confirma o recebimento do valor da entrada. O pedido passará para o status{' '}
                <span className="font-semibold text-cyan-700">ENTRADA PAGA</span> e o saldo pendente de{' '}
                <strong className="text-slate-900">{formatBRL(total - entrada)}</strong> continuará aguardando pagamento.
              </p>
            </button>
          )}

          {/* Opção 2: Baixar Valor Total Pedido */}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleAction('ENTREGA PENDENTE')}
            className="w-full text-left p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 transition-all hover:shadow-sm group focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">
                  {canLowerEntrada ? '2' : '1'}
                </span>
                <span className="font-semibold text-slate-900 text-sm">
                  {isEntradaPaga
                    ? `Baixar Saldo Restante (${formatBRL(remainingValue)})`
                    : `Baixar Valor Total Pedido (${formatBRL(total)})`}
                </span>
              </div>
              <ArrowRight size={16} className="text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-slate-600 pl-8 leading-relaxed">
              {isEntradaPaga
                ? `Confirma a quitação do saldo restante de ${formatBRL(remainingValue)}. O pedido passará para o status ENTREGA PENDENTE.`
                : `Confirma o pagamento total do pedido. O pedido passará para o status ENTREGA PENDENTE.`}
            </p>
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}
