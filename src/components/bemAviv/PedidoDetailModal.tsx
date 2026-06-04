import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSupabase } from '../../hooks/useSupabase'
import { formatBRL } from '../../lib/format'
import { formatDateOnly } from '../../lib/dates'
import { isDeliveryPendingStatus, remainingQty } from '../../lib/bemAvivOrderDelivery'
import { fetchOrderDeliveryHistory, type OrderDeliveryHistoryRow } from '../../lib/bemAvivOrderDeliveries'

type PaymentOption = 'A_VISTA' | 'A_PRAZO'
type PaymentMethod = 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'BOLETO'

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão débito',
  CARTAO_CREDITO: 'Cartão crédito',
  BOLETO: 'Boleto',
}

type PedidoDetail = {
  id: string
  client_id: string | null
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  status: string
  total_amount: number
  notes: string | null
  discount_total: number | null
  installments_count: number | null
  payment_option?: string | null
  payment_method?: string | null
  down_payment_amount?: number | null
  down_payment_method?: string | null
  freight_amount?: number | null
  other_expenses?: number | null
  expected_arrival_date?: string | null
  delivered_at?: string | null
}

type OrderItemDetailRow = {
  id: string
  item_description: string
  quantity: number
  quantity_delivered: number
  unit_price: number
  total_price: number
  created_at: string
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

function parsePaymentOption(v: string | null | undefined): PaymentOption {
  return v === 'A_PRAZO' ? 'A_PRAZO' : 'A_VISTA'
}

function parsePaymentMethod(v: string | null | undefined): PaymentMethod {
  const u = (v ?? 'DINHEIRO').toUpperCase()
  if (u === 'PIX') return 'PIX'
  if (u === 'CARTAO_DEBITO') return 'CARTAO_DEBITO'
  if (u === 'CARTAO_CREDITO') return 'CARTAO_CREDITO'
  if (u === 'BOLETO') return 'BOLETO'
  return 'DINHEIRO'
}

function netTotal(r: PedidoDetail) {
  return clampMoney(Number(r.total_amount))
}

function downVal(r: PedidoDetail) {
  return clampMoney(Number(r.down_payment_amount ?? 0))
}

function installmentCell(r: PedidoDetail) {
  const net = netTotal(r)
  const inst = Math.min(120, Math.max(1, r.installments_count ?? 1))
  const entrada = downVal(r)
  const financed = clampMoney(net - entrada)
  const each = inst > 0 ? financed / inst : financed
  return `${inst}x de ${formatBRL(each)}`
}

type Props = {
  orderId: string | null
  companyId: string | null
  clientName?: string
  onClose: () => void
}

export function PedidoDetailModal({ orderId, companyId, clientName, onClose }: Props) {
  const supabase = useSupabase()
  const [pedido, setPedido] = useState<PedidoDetail | null>(null)
  const [items, setItems] = useState<OrderItemDetailRow[]>([])
  const [deliveries, setDeliveries] = useState<OrderDeliveryHistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orderId || !supabase || !companyId) {
      setPedido(null)
      setItems([])
      setDeliveries([])
      return
    }

    let cancelled = false
    setLoading(true)
    setPedido(null)
    setItems([])
    setDeliveries([])

    ;(async () => {
      const { data: orderData, error: orderErr } = await supabase
        .from('bem_aviv_sales_orders')
        .select(
          'id, client_id, order_date, document_type, document_number, status, total_amount, notes, discount_total, installments_count, payment_option, payment_method, down_payment_amount, down_payment_method, freight_amount, other_expenses, expected_arrival_date, delivered_at',
        )
        .eq('id', orderId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (cancelled) return
      if (orderErr || !orderData) {
        if (orderErr) alert(orderErr.message)
        setLoading(false)
        onClose()
        return
      }

      setPedido(orderData as PedidoDetail)

      const { data: itemsData, error: itemsErr } = await supabase
        .from('bem_aviv_sales_order_items')
        .select('id, item_description, quantity, quantity_delivered, unit_price, total_price, created_at')
        .eq('sales_order_id', orderId)

      if (cancelled) return
      if (itemsErr) {
        alert(itemsErr.message)
        setLoading(false)
        return
      }

      const rows = ((itemsData ?? []) as OrderItemDetailRow[]).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      setItems(rows)
      if (orderData.document_type === 'PEDIDO') {
        const history = await fetchOrderDeliveryHistory(supabase, orderId)
        if (!cancelled) setDeliveries(history)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [orderId, supabase, companyId])

  if (!orderId) return null

  const showDeliveryCols =
    pedido?.document_type === 'PEDIDO' &&
    (isDeliveryPendingStatus(pedido.status) || (pedido.status ?? '').toUpperCase() === 'ENTREGUE')

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pedido-detail-modal-title"
    >
      <div className="flex max-h-[min(94dvh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 id="pedido-detail-modal-title" className="text-lg font-bold text-slate-900 uppercase">
                Detalhes do documento
              </h3>
              {pedido ? (
                <span className="rounded-md bg-slate-200/60 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {pedido.document_type}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-bold tabular-nums text-slate-700">
              Nº {pedido?.document_number ?? '—'}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {loading || !pedido ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
              <p className="text-xs font-semibold uppercase text-slate-400">Carregando documento…</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="space-y-4 md:col-span-1">
                  <div className="space-y-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Resumo financeiro</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-slate-500">Subtotal</span>
                        <span className="font-semibold tabular-nums text-slate-800">
                          {formatBRL(
                            netTotal(pedido) +
                              Number(pedido.discount_total ?? 0) -
                              Number(pedido.freight_amount ?? 0) -
                              Number(pedido.other_expenses ?? 0),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-emerald-600">
                        <span>Desconto</span>
                        <span className="font-semibold tabular-nums">- {formatBRL(Number(pedido.discount_total ?? 0))}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Frete</span>
                        <span className="font-semibold tabular-nums">+ {formatBRL(Number(pedido.freight_amount ?? 0))}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Outras despesas</span>
                        <span className="font-semibold tabular-nums">+ {formatBRL(Number(pedido.other_expenses ?? 0))}</span>
                      </div>
                      <hr className="my-2 border-slate-200/80" />
                      <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                        <span>Total líquido</span>
                        <span className="text-lg tabular-nums text-emerald-700">{formatBRL(netTotal(pedido))}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Informações de pagamento</h4>
                    <div className="space-y-2 text-xs font-medium text-slate-600">
                      <div>
                        <span className="mb-0.5 block text-[10px] uppercase text-slate-400">Forma e meio</span>
                        <span className="font-semibold text-slate-800">
                          {parsePaymentOption(pedido.payment_option) === 'A_PRAZO' ? 'À prazo' : 'À vista'} ·{' '}
                          {PAYMENT_METHOD_LABEL[parsePaymentMethod(pedido.payment_method)]}
                        </span>
                      </div>
                      {downVal(pedido) > 0 ? (
                        <div>
                          <span className="mb-0.5 block text-[10px] uppercase text-slate-400">Entrada no ato</span>
                          <span className="font-semibold tabular-nums text-slate-800">{formatBRL(downVal(pedido))}</span>
                        </div>
                      ) : null}
                      <div>
                        <span className="mb-0.5 block text-[10px] uppercase text-slate-400">Condições</span>
                        <span className="font-semibold tabular-nums text-slate-800">{installmentCell(pedido)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Dados do registro</h4>
                    <div className="space-y-1 text-xs font-medium text-slate-600">
                      <p>
                        <span className="text-slate-400">Cliente:</span>{' '}
                        <span className="font-semibold text-slate-800">{clientName ?? '—'}</span>
                      </p>
                      <p>
                        <span className="text-slate-400">Data de emissão:</span>{' '}
                        <span className="font-semibold tabular-nums text-slate-800">
                          {pedido.order_date ? pedido.order_date.split('-').reverse().join('/') : '—'}
                        </span>
                      </p>
                      <p>
                        <span className="text-slate-400">Status atual:</span>{' '}
                        <span className="font-semibold text-slate-800">{pedido.status}</span>
                      </p>
                      {pedido.document_type === 'PEDIDO' ? (
                        <>
                          <p>
                            <span className="text-slate-400">Previsão de chegada:</span>{' '}
                            <span className="font-semibold tabular-nums text-slate-800">
                              {pedido.expected_arrival_date ? formatDateOnly(pedido.expected_arrival_date) : '—'}
                            </span>
                          </p>
                          <p>
                            <span className="text-slate-400">Data entrega total:</span>{' '}
                            <span className="font-semibold tabular-nums text-slate-800">
                              {pedido.delivered_at ? formatDateOnly(pedido.delivered_at) : '—'}
                            </span>
                          </p>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {pedido.document_type === 'PEDIDO' && deliveries.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Histórico de entregas</h4>
                      <ul className="max-h-36 space-y-2 overflow-y-auto text-xs">
                        {deliveries.map((d) => (
                          <li key={d.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <p className="font-semibold text-slate-800">
                              {d.kind === 'TOTAL' ? 'Entrega total' : 'Entrega parcial'}
                            </p>
                            <p className="text-slate-500">
                              Previsão: {formatDateOnly(d.expected_arrival_date)}
                              {d.delivered_at ? ` · Entrega: ${formatDateOnly(d.delivered_at)}` : ''}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 md:col-span-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-slate-800">
                    <span>Itens do documento</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{items.length}</span>
                  </h4>

                  {items.length === 0 ? (
                    <p className="rounded-2xl border border-slate-100 bg-slate-50/50 py-8 text-center text-sm font-medium uppercase text-slate-400">
                      Nenhum item vinculado.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                              <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-400">Descrição</th>
                              <th className="w-16 px-4 py-3 text-center font-bold uppercase tracking-wider text-slate-400">Qtd</th>
                              {showDeliveryCols && isDeliveryPendingStatus(pedido.status) ? (
                                <>
                                  <th className="w-16 px-4 py-3 text-center font-bold uppercase tracking-wider text-slate-400">Entregue</th>
                                  <th className="w-16 px-4 py-3 text-center font-bold uppercase tracking-wider text-slate-400">Pendente</th>
                                </>
                              ) : showDeliveryCols ? (
                                <th className="w-16 px-4 py-3 text-center font-bold uppercase tracking-wider text-slate-400">Entregue</th>
                              ) : null}
                              <th className="w-24 px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-400">Preço un.</th>
                              <th className="w-28 px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-400">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.map((it) => (
                              <tr key={it.id} className="transition-colors hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-medium leading-normal text-slate-800">{it.item_description}</td>
                                <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-800">{it.quantity}</td>
                                {showDeliveryCols && isDeliveryPendingStatus(pedido.status) ? (
                                  <>
                                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-emerald-700">{it.quantity_delivered}</td>
                                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-amber-700">{remainingQty(it)}</td>
                                  </>
                                ) : showDeliveryCols ? (
                                  <td className="px-4 py-3 text-center font-semibold tabular-nums text-emerald-700">{it.quantity_delivered}</td>
                                ) : null}
                                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-500">{formatBRL(it.unit_price)}</td>
                                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatBRL(it.total_price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {pedido.notes ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                      <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Observações</h4>
                      <p className="whitespace-pre-wrap text-xs font-medium uppercase leading-relaxed text-slate-600">{pedido.notes}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                  onClick={onClose}
                >
                  Fechar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
