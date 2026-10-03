import { arredondar, somar } from '../../lib/money'

export type ItemPedidoInput = {
  quantidade: number // NUMERIC(14,3)
  custoUnitario: number // NUMERIC(14,2)
  desconto?: number // desconto em valor do item
}

export type TotaisPedido = {
  itens: { total: number }[]
  subtotal: number
  desconto: number
  frete: number
  total: number
}

export function totalDoItem(item: ItemPedidoInput): number {
  if (item.quantidade <= 0) throw new Error('Quantidade deve ser maior que zero')
  if (item.custoUnitario < 0) throw new Error('Custo unitário não pode ser negativo')
  const bruto = arredondar(item.quantidade * item.custoUnitario)
  const desconto = item.desconto ?? 0
  if (desconto < 0 || desconto > bruto) throw new Error('Desconto do item inválido')
  return arredondar(bruto - desconto)
}

/** total = soma dos itens (já com desconto de item) - desconto do pedido + frete */
export function calcularTotaisPedido(
  itens: ItemPedidoInput[],
  opcoes: { desconto?: number; frete?: number } = {},
): TotaisPedido {
  if (itens.length === 0) throw new Error('O pedido precisa de ao menos um item')
  const desconto = opcoes.desconto ?? 0
  const frete = opcoes.frete ?? 0
  if (desconto < 0 || frete < 0) throw new Error('Desconto e frete não podem ser negativos')

  const totais = itens.map((i) => ({ total: totalDoItem(i) }))
  const subtotal = somar(...totais.map((t) => t.total))
  if (desconto > subtotal) throw new Error('Desconto maior que o subtotal')

  return {
    itens: totais,
    subtotal,
    desconto: arredondar(desconto),
    frete: arredondar(frete),
    total: somar(subtotal, -desconto, frete),
  }
}
