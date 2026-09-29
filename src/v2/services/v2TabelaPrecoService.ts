import { supabase } from '../../lib/supabaseClient'
import { listV2Products, saveV2Product } from './v2ProdutosService'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface V2PriceTableItem {
  product_id: string
  sku: string
  product_name: string // Descrição Produto
  product_line: string // Linha do Produto
  tabela_fabrica: number
  tabela_vendas_sul: number
  sugestao_vendas: number
}

export interface V2PriceTable {
  id: string
  name: string
  reajuste_percent: number
  items: V2PriceTableItem[]
  active: boolean
  created_at: string
  updated_at: string
}

// ─── STORAGE KEYS & CONSTANTS ────────────────────────────────────────────────
const KEY_PRICE_TABLES = 'v2_price_tables_v2'
const SUPABASE_TABLE = 'v2_tabelas_preco'

// ─── CALCULO SUGESTÃO DE VENDAS (REGRA DE ARREDONDAMENTO ESPECIAL) ─────────────
/**
 * Cálculo: Tabela Vendas Sul + % Reajuste
 * Regra:
 * - truncar o valor calculado (ex: 8060.76 => 8060)
 * - olhar o último dígito do valor truncado:
 *   - se >= 0 e < 5 => arredondar para 5 (ex: 8060 => 8065.00)
 *   - se >= 5 e <= 9 => arredondar para a próxima dezena (ex: 11195 => 11200.00)
 */
export function calcSugestaoVendas(tabelaVendasSul: number, reajustePercent: number): number {
  if (!tabelaVendasSul || tabelaVendasSul <= 0) return 0

  const raw = tabelaVendasSul * (1 + (reajustePercent || 0) / 100)
  const truncated = Math.floor(raw)
  const lastDigit = Math.abs(truncated) % 10
  const baseTens = Math.floor(truncated / 10) * 10

  if (lastDigit >= 0 && lastDigit < 5) {
    return baseTens + 5
  } else {
    return baseTens + 10
  }
}

// ─── CRUD OPERATIONS ─────────────────────────────────────────────────────────

export async function listPriceTables(): Promise<V2PriceTable[]> {
  let list: V2PriceTable[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('name')
      if (!error && data && data.length > 0) {
        list = data as V2PriceTable[]
      }
    } catch {}
  }

  if (list.length === 0) {
    try {
      const raw = localStorage.getItem(KEY_PRICE_TABLES)
      if (raw) list = JSON.parse(raw)
    } catch {}
  }

  return list
}

export async function savePriceTable(table: Omit<V2PriceTable, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<V2PriceTable> {
  const current = await listPriceTables()
  const isEdit = Boolean(table.id)
  const id = table.id || 'tbl-' + Date.now()

  // Recalculate sugestao_vendas for all items in table based on current reajuste_percent
  const updatedItems: V2PriceTableItem[] = (table.items || []).map((item) => ({
    ...item,
    sugestao_vendas: calcSugestaoVendas(item.tabela_vendas_sul, table.reajuste_percent),
  }))

  const fullTable: V2PriceTable = {
    ...table,
    id,
    items: updatedItems,
    created_at: table.id
      ? current.find((c) => c.id === table.id)?.created_at || new Date().toISOString()
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert({
        id: fullTable.id,
        name: fullTable.name,
        reajuste_percent: fullTable.reajuste_percent,
        items: fullTable.items,
        active: fullTable.active,
        updated_at: fullTable.updated_at,
      })
    } catch (err) {
      console.warn('Supabase price table upsert fallback:', err)
    }
  }

  let updatedList: V2PriceTable[]
  if (isEdit) {
    updatedList = current.map((t) => (t.id === id ? fullTable : t))
  } else {
    updatedList = [fullTable, ...current]
  }
  localStorage.setItem(KEY_PRICE_TABLES, JSON.stringify(updatedList))
  return fullTable
}

export async function deletePriceTable(id: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).delete().eq('id', id)
    } catch (err) {
      console.warn('Supabase price table delete error:', err)
    }
  }
  const current = await listPriceTables()
  const filtered = current.filter((t) => t.id !== id)
  localStorage.setItem(KEY_PRICE_TABLES, JSON.stringify(filtered))
}

/**
 * Cria uma nova Tabela de Preço incluindo AUTOMATICAMENTE todos os produtos já cadastrados no menu Produtos
 */
export async function createPriceTableWithAllProducts(name: string, reajustePercent: number): Promise<V2PriceTable> {
  const products = await listV2Products()

  const items: V2PriceTableItem[] = products.map((p) => ({
    product_id: p.id,
    sku: p.code_sku || 'SKU',
    product_name: p.name,
    product_line: p.product_line || 'Geral',
    tabela_fabrica: p.cost_price || 0,
    tabela_vendas_sul: p.sale_price || 0,
    sugestao_vendas: calcSugestaoVendas(p.sale_price || 0, reajustePercent),
  }))

  return savePriceTable({
    name,
    reajuste_percent: reajustePercent,
    items,
    active: true,
  })
}

/**
 * Adiciona produtos ausentes a uma Tabela de Preço existente com 1 clique
 */
export async function syncMissingProductsToPriceTable(tableId: string): Promise<V2PriceTable | null> {
  const tables = await listPriceTables()
  const table = tables.find((t) => t.id === tableId)
  if (!table) return null

  const allProducts = await listV2Products()
  const existingProductIds = new Set(table.items.map((i) => i.product_id))

  const missingProducts = allProducts.filter((p) => !existingProductIds.has(p.id))
  if (missingProducts.length === 0) return table

  const newItems: V2PriceTableItem[] = missingProducts.map((p) => ({
    product_id: p.id,
    sku: p.code_sku || 'SKU',
    product_name: p.name,
    product_line: p.product_line || 'Geral',
    tabela_fabrica: p.cost_price || 0,
    tabela_vendas_sul: p.sale_price || 0,
    sugestao_vendas: calcSugestaoVendas(p.sale_price || 0, table.reajuste_percent),
  }))

  return savePriceTable({
    ...table,
    items: [...table.items, ...newItems],
  })
}

// ─── FERRAMENTA DE IMPORTAÇÃO (BASEADA NA IMAGEM 02) ─────────────────────────

export interface ParsedImportRow {
  sku?: string
  product_name: string // PRODUTO
  product_line: string // LINHA
  tabela_fabrica: number // TABELA FABRICA
  tabela_vendas_sul: number // TABELA SUL
  sugestao_vendas?: number // SUGESTÃO VENDAS (calculada se não informada)
}

/**
 * Parse text or CSV for product import
 * Suporta colunas separadas por tabulação (\t), vírgula (,), ou ponto e vírgula (;)
 */
export function parseImportText(rawText: string): ParsedImportRow[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const result: ParsedImportRow[] = []

  // Check if first line is header
  const firstLineUpper = lines[0].toUpperCase()
  const isHeader =
    firstLineUpper.includes('PRODUTO') ||
    firstLineUpper.includes('LINHA') ||
    firstLineUpper.includes('FABRICA') ||
    firstLineUpper.includes('SKU')

  const dataLines = isHeader ? lines.slice(1) : lines

  for (const line of dataLines) {
    // Detect delimiter
    let cols: string[] = []
    if (line.includes('\t')) {
      cols = line.split('\t')
    } else if (line.includes(';')) {
      cols = line.split(';')
    } else {
      // Split by 2 or more spaces
      cols = line.split(/\s{2,}/)
    }

    cols = cols.map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cols.length < 2) continue

    // Format helpers for currency parsing
    const parseCurrency = (str: string): number => {
      if (!str) return 0
      const clean = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
      const val = parseFloat(clean)
      return isNaN(val) ? 0 : val
    }

    // Heuristic mapping:
    // Case 1: SKU | PRODUTO | LINHA | TABELA FABRICA | TABELA SUL
    // Case 2: PRODUTO | LINHA | TABELA FABRICA | TABELA SUL | SUGESTAO VENDAS
    let sku = ''
    let name = ''
    let lineName = ''
    let fab = 0
    let sul = 0
    let sug = 0

    if (cols[0].toUpperCase().startsWith('EKO-') || cols[0].toUpperCase().startsWith('PRD-')) {
      sku = cols[0]
      name = cols[1] || ''
      lineName = cols[2] || ''
      fab = parseCurrency(cols[3] || '0')
      sul = parseCurrency(cols[4] || '0')
      sug = parseCurrency(cols[5] || '0')
    } else {
      name = cols[0] || ''
      lineName = cols[1] || ''
      fab = parseCurrency(cols[2] || '0')
      sul = parseCurrency(cols[3] || '0')
      sug = parseCurrency(cols[4] || '0')
    }

    if (name) {
      result.push({
        sku: sku || undefined,
        product_name: name,
        product_line: lineName || 'Geral',
        tabela_fabrica: fab,
        tabela_vendas_sul: sul,
        sugestao_vendas: sug > 0 ? sug : undefined,
      })
    }
  }

  return result
}

/**
 * Executa a importação:
 * 1. Para cada linha onde o SKU NÃO estiver preenchido, cadastra um NOVO produto em v2_produtos com SKU automático.
 * 2. Atualiza os preços de fábrica e venda sul dos produtos no catálogo.
 * 3. Vincula/atualiza todos os produtos na Tabela de Preço selecionada.
 */
export async function executeImportToCatalogAndTable(
  rows: ParsedImportRow[],
  targetTableId: string
): Promise<{ registeredCount: number; updatedCount: number; table: V2PriceTable }> {
  const existingProducts = await listV2Products()
  let registeredCount = 0
  let updatedCount = 0

  for (const row of rows) {
    // Check if product exists by SKU or Name
    let found = existingProducts.find(
      (p) => (row.sku && p.code_sku.toUpperCase() === row.sku.toUpperCase()) ||
             p.name.trim().toLowerCase() === row.product_name.trim().toLowerCase()
    )

    if (!found) {
      // Cadastra novo produto com SKU automático se a coluna SKU não estiver preenchida
      found = await saveV2Product({
        code_sku: row.sku || '',
        name: row.product_name,
        type: 'SIMPLES',
        product_line: row.product_line,
        cost_price: row.tabela_fabrica,
        sale_price: row.tabela_vendas_sul,
        unit: 'UN',
        active: true,
      })
      registeredCount++
    } else {
      // Atualiza preços do produto cadastrado
      found = await saveV2Product({
        ...found,
        product_line: row.product_line || found.product_line,
        cost_price: row.tabela_fabrica || found.cost_price,
        sale_price: row.tabela_vendas_sul || found.sale_price,
      })
      updatedCount++
    }
  }

  // Agora sincroniza todos os produtos na Tabela de Preço
  let targetTable: V2PriceTable | null = null
  const tables = await listPriceTables()
  targetTable = tables.find((t) => t.id === targetTableId) || null

  if (!targetTable) {
    targetTable = await createPriceTableWithAllProducts('Tabela de Preço Principal', 1.0)
  } else {
    const updatedTable = await syncMissingProductsToPriceTable(targetTable.id)
    if (updatedTable) targetTable = updatedTable
  }

  return { registeredCount, updatedCount, table: targetTable }
}

// ─── EXPORTAÇÃO DE TABELA DE PREÇO PARA CSV ──────────────────────────────────

export function exportPriceTableToCSV(table: V2PriceTable): void {
  const headers = [
    'SKU',
    'DESCRIÇÃO PRODUTO',
    'LINHA DO PRODUTO',
    'TABELA FÁBRICA (R$)',
    'TABELA VENDAS SUL (R$)',
    'SUGESTÃO DE VENDAS (R$)',
  ]

  const rows = (table.items || []).map((item) => [
    `"${item.sku || ''}"`,
    `"${(item.product_name || '').replace(/"/g, '""')}"`,
    `"${(item.product_line || '').replace(/"/g, '""')}"`,
    `"${(item.tabela_fabrica || 0).toFixed(2).replace('.', ',')}"`,
    `"${(item.tabela_vendas_sul || 0).toFixed(2).replace('.', ',')}"`,
    `"${(item.sugestao_vendas || 0).toFixed(2).replace('.', ',')}"`,
  ].join(';'))

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `TabelaPreco_${(table.name || 'Export').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
