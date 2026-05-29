export type OrderDeliveryItem = {
  id: string
  quantity: number
  quantity_delivered: number
}

export type OrderDeliveryStatus = 'ENTREGA PENDENTE' | 'ENTREGA PARCIAL' | 'ENTREGUE'

export function computeOrderDeliveryStatus(items: OrderDeliveryItem[]): OrderDeliveryStatus {
  if (items.length === 0) return 'ENTREGA PENDENTE'
  const allFull = items.every((i) => i.quantity_delivered >= i.quantity)
  if (allFull) return 'ENTREGUE'
  const anyDelivered = items.some((i) => i.quantity_delivered > 0)
  if (anyDelivered) return 'ENTREGA PARCIAL'
  return 'ENTREGA PENDENTE'
}

export function remainingQty(item: Pick<OrderDeliveryItem, 'quantity' | 'quantity_delivered'>): number {
  return Math.max(0, item.quantity - item.quantity_delivered)
}

export function isDeliveryPendingStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').trim().toUpperCase()
  return s === 'ENTREGA PENDENTE' || s === 'ENTREGA PARCIAL'
}
