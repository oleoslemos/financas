export type PedidosStatusFilter = 'TODOS' | 'ABERTO' | 'ENTREGA PENDENTE' | 'ENTREGUE' | 'CANCELADO'

export type PedidosListFilters = {
  typeTab: 'ORCAMENTO' | 'PEDIDO'
  statusFilter: PedidosStatusFilter
  search: string
  sortBy: 'DATA' | 'DOCUMENTO' | 'CLIENTE' | 'STATUS' | 'VALOR'
  sortDir: 'DESC' | 'ASC'
  clientTableFilterId: string | null
}

export const PEDIDOS_FILTERS_SESSION_KEY = 'bemAvivPedidosListFilters'

export function isPedidosPageReload(): boolean {
  if (typeof performance === 'undefined') return false
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'reload'
}

export function readPedidosFiltersFromSession(): PedidosListFilters | null {
  try {
    const raw = sessionStorage.getItem(PEDIDOS_FILTERS_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PedidosListFilters
  } catch {
    return null
  }
}

export function writePedidosFiltersToSession(filters: PedidosListFilters): void {
  try {
    sessionStorage.setItem(PEDIDOS_FILTERS_SESSION_KEY, JSON.stringify(filters))
  } catch {
    /* quota / modo privado */
  }
}

export function clearPedidosFiltersSession(): void {
  try {
    sessionStorage.removeItem(PEDIDOS_FILTERS_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
