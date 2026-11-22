/**
 * v2PriceTableComparator.ts
 * Utilitário para comparar duas versões de tabelas de preço (Anterior vs Nova)
 * Identifica produtos novos, alterações de valores, produtos inalterados e descontinuados.
 */

import { V2PriceTable, ParsedImportRow } from './v2TabelaPrecoService'

export interface PriceDiffItem {
  sku?: string
  nome: string
  linha: string
  tipo: 'NOVO' | 'ALTERADO' | 'INALTERADO' | 'REMOVIDO'
  precoAnterior?: number
  precoNovo?: number
  diferenca?: number
  variacaoPercentual?: number
}

export interface PriceTableDiffSummary {
  versaoAnterior: string
  versaoNova: string
  totalNovos: number
  totalAlterados: number
  totalInalterados: number
  totalRemovidos: number
  itens: PriceDiffItem[]
}

// Normaliza strings de nomes para comparação segura (sem pontuação excessiva, minúsculas)
function normalizarNome(nome: string): string {
  return (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function comparePriceTables(
  tabelaAnterior: V2PriceTable | null,
  novosItens: ParsedImportRow[],
  versaoNova: string = 'REV06/2026'
): PriceTableDiffSummary {
  const itensDiff: PriceDiffItem[] = []

  const versaoAnterior = tabelaAnterior?.name || 'Versão Anterior'
  const mapaAnterior = new Map<string, { preco: number; linha: string; sku?: string; original: string }>()

  if (tabelaAnterior && tabelaAnterior.items) {
    tabelaAnterior.items.forEach((item) => {
      const key = normalizarNome(item.product_name)
      mapaAnterior.set(key, {
        preco: item.tabela_vendas_sul || item.sugestao_vendas || 0,
        linha: item.product_line || 'Geral',
        sku: item.sku,
        original: item.product_name,
      })
    })
  }

  const visitadosNaNova = new Set<string>()

  // 1. Processar itens da nova tabela
  novosItens.forEach((novo) => {
    const key = normalizarNome(novo.product_name)
    visitadosNaNova.add(key)

    const anterior = mapaAnterior.get(key)
    const precoNovo = novo.tabela_vendas_sul

    if (!anterior) {
      // Produto Novo
      itensDiff.push({
        sku: novo.sku,
        nome: novo.product_name,
        linha: novo.product_line,
        tipo: 'NOVO',
        precoNovo: precoNovo,
      })
    } else {
      const precoAntigo = anterior.preco
      const diferenca = Number((precoNovo - precoAntigo).toFixed(2))

      if (Math.abs(diferenca) > 0.05) {
        // Preço alterado
        const variacao = precoAntigo > 0 ? Number(((diferenca / precoAntigo) * 100).toFixed(2)) : 0
        itensDiff.push({
          sku: novo.sku || anterior.sku,
          nome: novo.product_name,
          linha: novo.product_line,
          tipo: 'ALTERADO',
          precoAnterior: precoAntigo,
          precoNovo: precoNovo,
          diferenca: diferenca,
          variacaoPercentual: variacao,
        })
      } else {
        // Preço inalterado
        itensDiff.push({
          sku: novo.sku || anterior.sku,
          nome: novo.product_name,
          linha: novo.product_line,
          tipo: 'INALTERADO',
          precoAnterior: precoAntigo,
          precoNovo: precoNovo,
          diferenca: 0,
          variacaoPercentual: 0,
        })
      }
    }
  })

  // 2. Verificar itens que estavam na tabela anterior e não estão na nova (Removidos/Descontinuados)
  mapaAnterior.forEach((dados, key) => {
    if (!visitadosNaNova.has(key)) {
      itensDiff.push({
        sku: dados.sku,
        nome: dados.original,
        linha: dados.linha,
        tipo: 'REMOVIDO',
        precoAnterior: dados.preco,
      })
    }
  })

  const totalNovos = itensDiff.filter((i) => i.tipo === 'NOVO').length
  const totalAlterados = itensDiff.filter((i) => i.tipo === 'ALTERADO').length
  const totalInalterados = itensDiff.filter((i) => i.tipo === 'INALTERADO').length
  const totalRemovidos = itensDiff.filter((i) => i.tipo === 'REMOVIDO').length

  return {
    versaoAnterior,
    versaoNova,
    totalNovos,
    totalAlterados,
    totalInalterados,
    totalRemovidos,
    itens: itensDiff,
  }
}
