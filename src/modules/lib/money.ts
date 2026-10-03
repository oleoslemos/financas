/**
 * Função única de arredondamento monetário (NUMERIC(14,2)).
 * Regra: 2 casas, meio para longe do zero (half away from zero).
 */
export function arredondar(valor: number, casas = 2): number {
  if (!Number.isFinite(valor)) {
    throw new Error('Valor monetário inválido')
  }
  const fator = 10 ** casas
  const sinal = valor < 0 ? -1 : 1
  // toPrecision(15) elimina ruído de ponto flutuante (ex.: 1.005 * 100 = 100.49999999999999)
  const escalado = Number((Math.abs(valor) * fator).toPrecision(15))
  return (sinal * Math.round(escalado)) / fator
}

export function paraCentavos(valor: number): number {
  return Math.round(arredondar(valor) * 100)
}

export function deCentavos(centavos: number): number {
  return arredondar(centavos / 100)
}

/** Soma valores monetários sem acumular erro de ponto flutuante. */
export function somar(...valores: number[]): number {
  return deCentavos(valores.reduce((acc, v) => acc + paraCentavos(v), 0))
}

/** Formata um número como moeda pt-BR (ex.: R$ 1.234,56). */
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}
