export type StatusPedidoCompra =
  | 'rascunho'
  | 'emitido'
  | 'recebido_parcial'
  | 'recebido'
  | 'cancelado'

export type ItemRecebimento = {
  quantidadePedida: number
  quantidadeRecebida: number
}

/** Quantidades com 3 casas: compara em milésimos para evitar erro de ponto flutuante. */
const milesimos = (n: number) => Math.round(n * 1000)

export function statusPorRecebimento(itens: ItemRecebimento[]): 'emitido' | 'recebido_parcial' | 'recebido' {
  const recebidoTotal = itens.every((i) => milesimos(i.quantidadeRecebida) >= milesimos(i.quantidadePedida))
  if (recebidoTotal) return 'recebido'
  const algum = itens.some((i) => milesimos(i.quantidadeRecebida) > 0)
  return algum ? 'recebido_parcial' : 'emitido'
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string }

/** Valida um recebimento contra o pedido. Não permite receber acima do pedido nem em pedido não recebível. */
export function validarRecebimento(params: {
  statusPedido: StatusPedidoCompra
  itens: { quantidadePedida: number; quantidadeJaRecebida: number; quantidadeNova: number }[]
}): ResultadoValidacao {
  if (params.statusPedido !== 'emitido' && params.statusPedido !== 'recebido_parcial') {
    return { ok: false, erro: 'Pedido não está disponível para recebimento' }
  }
  if (params.itens.every((i) => i.quantidadeNova <= 0)) {
    return { ok: false, erro: 'Informe ao menos uma quantidade recebida' }
  }
  for (const i of params.itens) {
    if (i.quantidadeNova < 0) return { ok: false, erro: 'Quantidade recebida não pode ser negativa' }
    const saldo = milesimos(i.quantidadePedida) - milesimos(i.quantidadeJaRecebida)
    if (milesimos(i.quantidadeNova) > saldo) {
      return { ok: false, erro: 'Quantidade recebida maior que o saldo do pedido' }
    }
  }
  return { ok: true }
}
