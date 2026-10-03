import type { StatusPedidoCompra } from './recebimento'

export type AvaliacaoCancelamento =
  | {
      permitido: true
      /** Efeitos que a action deve executar, na mesma transação. */
      acoes: ('cancelar_parcelas_abertas' | 'estornar_estoque_recebido')[]
    }
  | { permitido: false; motivo: string }

/**
 * Regras de cancelamento de pedido de compra (nunca exclui, só cancela/estorna):
 * - já cancelado: bloqueia
 * - com pagamentos ativos (não estornados): bloqueia até estornar as baixas
 * - com recebimentos: permite, gerando movimentação de estorno no estoque
 * - parcelas ainda abertas são canceladas
 */
export function avaliarCancelamentoPedido(params: {
  status: StatusPedidoCompra
  temRecebimentos: boolean
  temPagamentosAtivos: boolean
}): AvaliacaoCancelamento {
  if (params.status === 'cancelado') return { permitido: false, motivo: 'Pedido já está cancelado' }
  if (params.temPagamentosAtivos) {
    return {
      permitido: false,
      motivo: 'Existem pagamentos baixados. Estorne os pagamentos antes de cancelar o pedido.',
    }
  }
  const acoes: ('cancelar_parcelas_abertas' | 'estornar_estoque_recebido')[] = []
  if (params.status !== 'rascunho') acoes.push('cancelar_parcelas_abertas')
  if (params.temRecebimentos) acoes.push('estornar_estoque_recebido')
  return { permitido: true, acoes }
}
