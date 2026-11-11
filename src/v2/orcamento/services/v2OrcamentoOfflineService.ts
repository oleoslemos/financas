import { PedidoVenda, savePedidoVenda } from '../../services/v2PedidoVendasService'
import { getCurrentV2User } from '../../services/v2AuthService'

const OUTBOX_KEY = 'v2:orcamento:outbox'
const DRAFT_PREFIX = 'v2:orcamento:draft:'

export interface OfflineDraft {
  cliente?: {
    id?: string
    nome: string
    documento?: string
    cidade?: string
    telefone?: string
  }
  itens: Array<{
    produto_id: string
    produto_nome: string
    sku?: string
    quantidade: number
    preco_tabela: number
    preco_unitario: number
    desconto_percentual: number
    total: number
  }>
  condicaoSelecionada: 'sem_desconto' | 'ate_5x' | 'a_vista'
  frete: number
  formaPagamento: string
  observacao?: string
  canal: 'distribuicao' | 'representacao'
  tabelaPrecoId?: string
  tabelaPrecoNome?: string
  updatedAt: string
}

// ─── Draft Management ────────────────────────────────────────────────────────

function getDraftKey(): string {
  const user = getCurrentV2User()
  return `${DRAFT_PREFIX}${user?.id || 'anonymous'}`
}

export function saveOrcamentoDraft(draft: OfflineDraft): void {
  try {
    localStorage.setItem(getDraftKey(), JSON.stringify(draft))
  } catch {}
}

export function getOrcamentoDraft(): OfflineDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey())
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearOrcamentoDraft(): void {
  try {
    localStorage.removeItem(getDraftKey())
  } catch {}
}

// ─── Outbox Management ───────────────────────────────────────────────────────

export function getOutbox(): PedidoVenda[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveToOutbox(pedido: PedidoVenda): void {
  try {
    const list = getOutbox()
    const existingIndex = list.findIndex((p) => p.id === pedido.id)
    if (existingIndex >= 0) {
      list[existingIndex] = pedido
    } else {
      list.push(pedido)
    }
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list))
  } catch {}
}

export function removeFromOutbox(id: string): void {
  try {
    const list = getOutbox().filter((p) => p.id !== id)
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list))
  } catch {}
}

// ─── Background Sync ─────────────────────────────────────────────────────────

let isSyncing = false

export async function syncOutboxNow(onSyncItem?: (pedido: PedidoVenda) => void): Promise<{ synced: number; failed: number }> {
  if (isSyncing || typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 }
  }

  isSyncing = true
  let synced = 0
  let failed = 0
  const outbox = getOutbox()

  for (const item of outbox) {
    try {
      await savePedidoVenda(item)
      removeFromOutbox(item.id)
      synced++
      if (onSyncItem) onSyncItem(item)
    } catch {
      failed++
    }
  }

  isSyncing = false
  return { synced, failed }
}

// ─── Network Listener ────────────────────────────────────────────────────────

export function subscribeNetworkStatus(callback: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    callback(true)
    void syncOutboxNow()
  }

  const handleOffline = () => {
    callback(false)
  }

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void syncOutboxNow()
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    document.removeEventListener('visibilitychange', handleVisibility)
  }
}
