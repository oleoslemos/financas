import { supabase } from '../../lib/supabaseClient'
import { listV2Products, saveV2Product } from './v2ProdutosService'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface V2PriceTableItem {
  product_id: string
  sku: string
  product_name: string // Descrição Produto
  product_line: string // Linha do Produto
  cod_group7?: string | null
  bu?: string | null
  tabela_fabrica: number
  tabela_vendas_sul: number
  sugestao_vendas: number
  ponto?: number
}

export interface V2PriceTable {
  id: string
  name: string
  reajuste_percent: number
  valor_ponto?: number
  items: V2PriceTableItem[]
  active: boolean
  is_default?: boolean
  created_at: string
  updated_at: string
}

// ─── STORAGE KEYS & CONSTANTS ────────────────────────────────────────────────
const KEY_PRICE_TABLES = 'v2_price_tables_v2'
export const SUPABASE_TABLE = 'bemaviv_tabela_preco'

// ─── CALCULO SUGESTÃO DE VENDAS (REGRA DE ARREDONDAMENTO DETERMINÍSTICA B1) ─
/**
 * Cálculo: Tabela Vendas Sul + % Reajuste
 * Regra determinística formal (B1):
 * - base = vendas_sul * (1 + reajuste/100)
 * - v = trunc(base)
 * - u = v mod 10
 * - se u = 0: mantém v (já termina em 0)
 * - se 1 <= u <= 5: v - u + 5 (arredonda para final 5)
 * - se 6 <= u <= 9: v - u + 10 (arredonda para a próxima dezena)
 * Exemplos:
 * 1.232,80 => v = 1232, u = 2 => 1232 - 2 + 5 = 1235.00
 * 8.060,00 => v = 8060, u = 0 => 8060.00
 * 11.197,00 => v = 11197, u = 7 => 11197 - 7 + 10 = 11200.00
 */
export function calcSugestaoVendas(tabelaVendasSul: number, reajustePercent: number): number {
  if (!tabelaVendasSul || tabelaVendasSul <= 0) return 0

  const raw = tabelaVendasSul * (1 + (reajustePercent || 0) / 100)
  const v = Math.floor(raw)
  const u = Math.abs(v) % 10

  if (u === 0) {
    return v
  } else if (u >= 1 && u <= 5) {
    return v - u + 5
  } else {
    return v - u + 10
  }
}

// ─── CÁLCULO DE PONTO (TABELA FÁBRICA / VALOR PONTO) ─────────────────────────
/**
 * Regra: "Tabela Fábrica (R$)" / "Valor Ponto" = Resultado com 5 casas decimais.
 * Exemplo:
 * Valor Ponto = 3000
 * Tabela Fábrica (R$) = 47,72
 * Cálculo = 47,72 / 3000 = 0,01590666667 => 0,01591
 */
export function calcPonto(tabelaFabrica: number, valorPonto: number): number {
  if (!valorPonto || valorPonto <= 0 || !tabelaFabrica || tabelaFabrica <= 0) return 0
  const raw = tabelaFabrica / valorPonto
  return Number(raw.toFixed(5))
}

export function formatPonto(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0,00000'
  return val.toFixed(5).replace('.', ',')
}

// ─── CRUD OPERATIONS ─────────────────────────────────────────────────────────

export async function listPriceTables(): Promise<V2PriceTable[]> {
  let list: V2PriceTable[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
      if (!error && data && data.length > 0) {
        list = data.map((t: any) => ({
          ...t,
          active: t.active !== undefined ? t.active : true,
        })) as V2PriceTable[]
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

export let lastSavePriceTableError: string | null = null

export async function savePriceTable(table: Omit<V2PriceTable, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<V2PriceTable> {
  lastSavePriceTableError = null
  const current = await listPriceTables()
  const isEdit = Boolean(table.id)
  const id = table.id || 'tbl-' + Date.now()

  const valorPonto = table.valor_ponto !== undefined ? Number(table.valor_ponto) : 0

  // Recalculate sugestao_vendas and ponto for all items in table
  const updatedItems: V2PriceTableItem[] = (table.items || []).map((item) => ({
    ...item,
    sugestao_vendas: calcSugestaoVendas(item.tabela_vendas_sul, table.reajuste_percent),
    ponto: item.bu && item.bu.toUpperCase() === 'MADRESSENZA' ? 0 : calcPonto(item.tabela_fabrica, valorPonto),
  }))

  const fullTable: V2PriceTable = {
    ...table,
    id,
    valor_ponto: valorPonto,
    is_default: table.is_default ?? (current.length === 0 ? true : false),
    items: updatedItems,
    created_at: table.id
      ? current.find((c) => c.id === table.id)?.created_at || new Date().toISOString()
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      const payload: any = {
        id: fullTable.id,
        name: fullTable.name,
        reajuste_percent: fullTable.reajuste_percent,
        valor_ponto: fullTable.valor_ponto,
        items: fullTable.items,
        active: fullTable.active,
        is_default: fullTable.is_default,
        updated_at: fullTable.updated_at,
      }
      console.log('[savePriceTable] upsert payload →', payload)
      const { error } = await supabase.from(SUPABASE_TABLE).upsert(payload)
      if (error) {
        const msg = `[savePriceTable] ERRO ao salvar em "${SUPABASE_TABLE}": ${error.message} (code: ${error.code}, details: ${error.details}, hint: ${error.hint})`
        console.error(msg)
        lastSavePriceTableError = msg
      } else {
        console.log('[savePriceTable] salvo com sucesso em', SUPABASE_TABLE)
      }
    } catch (err) {
      const msg = `[savePriceTable] EXCEÇÃO: ${String(err)}`
      console.error(msg)
      lastSavePriceTableError = msg
    }
  } else {
    const msg = '[savePriceTable] Supabase não inicializado — salvando apenas no localStorage.'
    console.warn(msg)
    lastSavePriceTableError = msg
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

export async function renamePriceTable(id: string, newName: string): Promise<V2PriceTable | null> {
  const trimmed = newName.trim()
  if (!trimmed) return null

  const current = await listPriceTables()
  const table = current.find((t) => t.id === id)
  if (!table) return null

  return savePriceTable({
    ...table,
    name: trimmed,
  })
}

export async function setDefaultPriceTable(id: string): Promise<V2PriceTable[]> {
  const current = await listPriceTables()
  const updatedList: V2PriceTable[] = current.map((t) => ({
    ...t,
    is_default: t.id === id,
    active: t.id === id ? true : t.active,
    updated_at: new Date().toISOString(),
  }))

  localStorage.setItem(KEY_PRICE_TABLES, JSON.stringify(updatedList))

  if (supabase) {
    try {
      for (const t of updatedList) {
        const payload: any = {
          id: t.id,
          name: t.name,
          reajuste_percent: t.reajuste_percent,
          valor_ponto: t.valor_ponto || 0,
          items: t.items,
          active: t.active,
          is_default: t.is_default,
          updated_at: t.updated_at,
        }
        const { error } = await supabase.from(SUPABASE_TABLE).upsert(payload)
        if (error) {
          console.error('[setDefaultPriceTable] ERRO ao salvar tabela', t.id, ':', error.message)
        }
      }
    } catch (err) {
      console.warn('Supabase setDefaultPriceTable error:', err)
    }
  }

  return updatedList
}

export async function getDefaultPriceTable(): Promise<V2PriceTable | null> {
  const list = await listPriceTables()
  if (list.length === 0) return null
  return list.find((t) => t.is_default) || list.find((t) => t.active) || list[0]
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
  // Se a tabela excluída era a default e restam outras tabelas, define a primeira como default
  const wasDefault = current.find((t) => t.id === id)?.is_default
  if (wasDefault && filtered.length > 0) {
    filtered[0].is_default = true
  }
  localStorage.setItem(KEY_PRICE_TABLES, JSON.stringify(filtered))
}

/**
 * Cria uma nova Tabela de Preço incluindo AUTOMATICAMENTE todos os produtos já cadastrados no menu Produtos
 */
export async function createPriceTableWithAllProducts(
  name: string,
  reajustePercent: number,
  isDefault: boolean = false,
  valorPonto: number = 3000,
  copyAllProducts: boolean = true
): Promise<V2PriceTable> {
    const products = await listV2Products();
    const currentTables = await listPriceTables();
    const items: V2PriceTableItem[] = copyAllProducts
      ? products.map((p) => ({
          product_id: p.id,
          sku: p.code_sku || 'SKU',
          product_name: p.name,
          product_line: p.product_line || 'Geral',
          cod_group7: p.cod_group7 || undefined,
          bu: p.bu || undefined,
          tabela_fabrica: p.cost_price || 0,
          tabela_vendas_sul: p.sale_price || 0,
          sugestao_vendas: calcSugestaoVendas(p.sale_price || 0, reajustePercent),
          ponto: calcPonto(p.cost_price || 0, valorPonto),
        }))
      : [];
    const shouldBeDefault = isDefault || currentTables.length === 0;

  const newTable = await savePriceTable({
    name,
    reajuste_percent: reajustePercent,
    valor_ponto: valorPonto,
    items,
    active: true,
    is_default: shouldBeDefault,
  })

  if (shouldBeDefault && currentTables.length > 0) {
    await setDefaultPriceTable(newTable.id)
  }

  return newTable
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
    cod_group7: p.cod_group7 || undefined,
    bu: p.bu || undefined,
    tabela_fabrica: p.cost_price || 0,
    tabela_vendas_sul: p.sale_price || 0,
    sugestao_vendas: calcSugestaoVendas(p.sale_price || 0, table.reajuste_percent),
    ponto: calcPonto(p.cost_price || 0, table.valor_ponto || 0),
  }))

  return savePriceTable({
    ...table,
    items: [...table.items, ...newItems],
  })
}

/**
 * Atualiza os preços de fábrica e venda de um produto em todas as tabelas de preço ativas,
 * recalculando sugestão de vendas e pontuação.
 */
export async function updateProductPricesInPriceTables(
  productId: string,
  costPrice: number,
  salePrice: number
): Promise<void> {
  const tables = await listPriceTables()
  for (const table of tables) {
    const itemIndex = (table.items || []).findIndex((i) => i.product_id === productId)
    if (itemIndex >= 0) {
      const updatedItems = [...table.items]
      const oldItem = updatedItems[itemIndex]
      updatedItems[itemIndex] = {
        ...oldItem,
        tabela_fabrica: costPrice,
        tabela_vendas_sul: salePrice,
        sugestao_vendas: calcSugestaoVendas(salePrice, table.reajuste_percent),
        ponto: calcPonto(costPrice, table.valor_ponto || 0),
      }
      await savePriceTable({
        ...table,
        items: updatedItems,
      })
    }
  }
}

// ─── FERRAMENTA DE IMPORTAÇÃO (BASEADA NA PLANILHA DE PREÇOS) ──────────────────

export interface ParsedImportRow {
  sku?: string
  product_name: string // PRODUTO
  product_line: string // LINHA
  cod_group7?: string // COD_GROUP7
  bu?: string // BU
  tabela_fabrica: number // TABELA FABRICA
  tabela_vendas_sul: number // TABELA SUL
  sugestao_vendas?: number // SUGESTÃO VENDAS (calculada se não informada)
}

/**
 * Parse text or CSV for product import
 * Suporta colunas separadas por tabulação (\t), vírgula (,), ou ponto e vírgula (;)
 * Identifica automaticamente colunas COD_GROUP7 e BU tanto por cabeçalho quanto por posição.
 */
export function parseImportText(rawText: string): ParsedImportRow[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const result: ParsedImportRow[] = []

  const parseCurrency = (str: string): number => {
    if (!str) return 0
    const clean = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
    const val = parseFloat(clean)
    return isNaN(val) ? 0 : val
  }

  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()

  const firstLineNorm = normalize(lines[0])
  const isHeader =
    firstLineNorm.includes('PRODUTO') ||
    firstLineNorm.includes('DESCRIC') ||
    firstLineNorm.includes('LINHA') ||
    firstLineNorm.includes('FABRICA') ||
    firstLineNorm.includes('SKU') ||
    firstLineNorm.includes('GROUP7') ||
    firstLineNorm.includes('COD_GROUP') ||
    firstLineNorm.includes('BU')

  const splitCols = (line: string): string[] => {
    let cols: string[] = []
    if (line.includes('\t')) {
      cols = line.split('\t')
    } else if (line.includes(';')) {
      cols = line.split(';')
    } else {
      cols = line.split(/\s{2,}/)
    }
    return cols.map((c) => c.trim().replace(/^"|"$/g, ''))
  }

  // Header column mapping
  let colSku = -1
  let colName = -1
  let colLine = -1
  let colGroup7 = -1
  let colBu = -1
  let colFab = -1
  let colSul = -1
  let colSug = -1

  if (isHeader) {
    const headerCols = splitCols(lines[0])
    headerCols.forEach((col, idx) => {
      const norm = normalize(col)
      if (norm.includes('GROUP7') || norm.includes('COD_GROUP') || norm.includes('COD GROUP') || norm.includes('GRUPO7')) {
        colGroup7 = idx
      } else if (norm === 'BU' || norm.startsWith('BU ') || norm.includes('B.U.') || norm.includes('UNIDADE')) {
        colBu = idx
      } else if (norm.includes('PRODUTO') || norm.includes('DESCRIC') || norm.includes('NOME')) {
        colName = idx
      } else if (norm.includes('LINHA')) {
        colLine = idx
      } else if (norm.includes('FABRICA') || norm.includes('CUSTO')) {
        colFab = idx
      } else if (norm.includes('SUL') || norm.includes('VENDA')) {
        colSul = idx
      } else if (norm.includes('SUGEST')) {
        colSug = idx
      } else if (norm.includes('SKU') || norm.includes('CODIGO')) {
        colSku = idx
      }
    })
  }

  const dataLines = isHeader ? lines.slice(1) : lines

  for (const line of dataLines) {
    const cols = splitCols(line)
    if (cols.length < 2) continue

    let sku = ''
    let name = ''
    let lineName = ''
    let cod_group7 = ''
    let bu = ''
    let fab = 0
    let sul = 0
    let sug = 0

    if (isHeader && colName >= 0) {
      // Header-based extraction
      name = cols[colName] || ''
      if (colSku >= 0) sku = cols[colSku] || ''
      if (colLine >= 0) lineName = cols[colLine] || ''
      if (colGroup7 >= 0) cod_group7 = cols[colGroup7] || ''
      if (colBu >= 0) bu = cols[colBu] || ''
      if (colFab >= 0) fab = parseCurrency(cols[colFab] || '0')
      if (colSul >= 0) sul = parseCurrency(cols[colSul] || '0')
      if (colSug >= 0) sug = parseCurrency(cols[colSug] || '0')
    } else {
      // Positional heuristic extraction:
      if (cols.length === 4) {
        // PRODUTO | LINHA | TABELA FABRICA | TABELA SUL
        name = cols[0] || ''
        lineName = cols[1] || ''
        fab = parseCurrency(cols[2] || '0')
        sul = parseCurrency(cols[3] || '0')
      } else if (cols.length === 5) {
        if (cols[0].toUpperCase().startsWith('EKO-') || cols[0].toUpperCase().startsWith('PRD-')) {
          // SKU | PRODUTO | LINHA | TABELA FABRICA | TABELA SUL
          sku = cols[0]
          name = cols[1] || ''
          lineName = cols[2] || ''
          fab = parseCurrency(cols[3] || '0')
          sul = parseCurrency(cols[4] || '0')
        } else {
          // PRODUTO | LINHA | TABELA FABRICA | TABELA SUL | SUGESTAO
          name = cols[0] || ''
          lineName = cols[1] || ''
          fab = parseCurrency(cols[2] || '0')
          sul = parseCurrency(cols[3] || '0')
          sug = parseCurrency(cols[4] || '0')
        }
      } else if (cols.length === 6) {
        // Check if prices are at end or middle
        const p2 = parseCurrency(cols[2])
        const p3 = parseCurrency(cols[3])
        const p4 = parseCurrency(cols[4])
        const p5 = parseCurrency(cols[5])

        if (p4 > 0 || p5 > 0) {
          // COD_GROUP7 | BU | PRODUTO | LINHA | TABELA FABRICA | TABELA SUL
          cod_group7 = cols[0] || ''
          bu = cols[1] || ''
          name = cols[2] || ''
          lineName = cols[3] || ''
          fab = p4
          sul = p5
        } else if (p2 > 0 || p3 > 0) {
          // PRODUTO | LINHA | TABELA FABRICA | TABELA SUL | COD_GROUP7 | BU
          name = cols[0] || ''
          lineName = cols[1] || ''
          fab = p2
          sul = p3
          cod_group7 = cols[4] || ''
          bu = cols[5] || ''
        } else {
          sku = cols[0]
          name = cols[1] || ''
          lineName = cols[2] || ''
          fab = parseCurrency(cols[3] || '0')
          sul = parseCurrency(cols[4] || '0')
          sug = parseCurrency(cols[5] || '0')
        }
      } else if (cols.length >= 7) {
        // Check for SKU at cols[0]
        const hasSku = cols[0].toUpperCase().startsWith('EKO-') || cols[0].toUpperCase().startsWith('PRD-')
        if (hasSku) {
          // SKU | PRODUTO | LINHA | TABELA FABRICA | TABELA SUL | COD_GROUP7 | BU
          sku = cols[0]
          name = cols[1] || ''
          lineName = cols[2] || ''
          fab = parseCurrency(cols[3] || '0')
          sul = parseCurrency(cols[4] || '0')
          cod_group7 = cols[5] || ''
          bu = cols[6] || ''
          if (cols[7]) sug = parseCurrency(cols[7])
        } else {
          // COD_GROUP7 | BU | PRODUTO | LINHA | TABELA FABRICA | TABELA SUL | SUGESTAO
          cod_group7 = cols[0] || ''
          bu = cols[1] || ''
          name = cols[2] || ''
          lineName = cols[3] || ''
          fab = parseCurrency(cols[4] || '0')
          sul = parseCurrency(cols[5] || '0')
          if (cols[6]) sug = parseCurrency(cols[6])
        }
      }
    }

    if (name) {
      result.push({
        sku: sku || undefined,
        product_name: name,
        product_line: lineName || 'Geral',
        cod_group7: cod_group7 || undefined,
        bu: bu || undefined,
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
 * 1. Cadastra novos produtos ou atualiza produtos existentes em bemaviv_produtos com os preços, cod_group7 e bu.
 * 2. Atualiza os preços e novos campos de todos os produtos na Tabela de Preço alvo.
 */
export async function executeImportToCatalogAndTable(
  rows: ParsedImportRow[],
  targetTableId: string
): Promise<{ registeredCount: number; updatedCount: number; table: V2PriceTable }> {
  const existingProducts = await listV2Products()
  let registeredCount = 0
  let updatedCount = 0

  for (const row of rows) {
    // Check if product exists by SKU, COD_GROUP7 or Name
    let found = existingProducts.find(
      (p) =>
        (row.sku && p.code_sku && p.code_sku.toUpperCase() === row.sku.toUpperCase()) ||
        (row.cod_group7 && p.cod_group7 && p.cod_group7.trim().toUpperCase() === row.cod_group7.trim().toUpperCase()) ||
        p.name.trim().toLowerCase() === row.product_name.trim().toLowerCase()
    )

    if (!found) {
      // Cadastra novo produto com SKU automático se a coluna SKU não estiver preenchida
      found = await saveV2Product({
        code_sku: row.sku || '',
        name: row.product_name,
        type: 'SIMPLES',
        product_line: row.product_line,
        cod_group7: row.cod_group7 || undefined,
        bu: row.bu || undefined,
        cost_price: row.tabela_fabrica,
        sale_price: row.tabela_vendas_sul,
        unit: 'UN',
        active: true,
      })
      registeredCount++
    } else {
      // Atualiza preços e campos cod_group7 e bu do produto cadastrado
      found = await saveV2Product({
        ...found,
        product_line: row.product_line || found.product_line,
        cost_price: row.tabela_fabrica || found.cost_price,
        sale_price: row.tabela_vendas_sul || found.sale_price,
        cod_group7: row.cod_group7 !== undefined ? row.cod_group7 : found.cod_group7,
        bu: row.bu !== undefined ? row.bu : found.bu,
      })
      updatedCount++
    }
  }

  // Agora sincroniza todos os produtos na Tabela de Preço alvo
  let targetTable: V2PriceTable | null = null
  const tables = await listPriceTables()
  targetTable = tables.find((t) => t.id === targetTableId) || null

  if (!targetTable) {
    targetTable = await createPriceTableWithAllProducts('Tabela de Preço Principal', 1.0)
  } else {
    // 1. Atualiza itens existentes na tabela de preço com os novos dados do catálogo
    const refreshedProducts = await listV2Products()
    const productMap = new Map(refreshedProducts.map((p) => [p.id, p]))

    const updatedExistingItems = targetTable.items.map((item) => {
      const prod = productMap.get(item.product_id)
      if (!prod) return item
      const fab = prod.cost_price || item.tabela_fabrica
      const sul = prod.sale_price || item.tabela_vendas_sul
      return {
        ...item,
        sku: prod.code_sku || item.sku,
        product_name: prod.name || item.product_name,
        product_line: prod.product_line || item.product_line,
        cod_group7: prod.cod_group7 || item.cod_group7,
        bu: prod.bu || item.bu,
        tabela_fabrica: fab,
        tabela_vendas_sul: sul,
        sugestao_vendas: calcSugestaoVendas(sul, targetTable!.reajuste_percent),
        ponto: calcPonto(fab, targetTable!.valor_ponto || 0),
      }
    })

    targetTable = await savePriceTable({
      ...targetTable,
      items: updatedExistingItems,
    })

    // 2. Adiciona produtos ausentes
    const updatedTable = await syncMissingProductsToPriceTable(targetTable.id)
    if (updatedTable) targetTable = updatedTable
  }

  return { registeredCount, updatedCount, table: targetTable }
}

// ─── EXPORTAÇÃO DE TABELA DE PREÇO PARA CSV ──────────────────────────────────

export function exportPriceTableToCSV(table: V2PriceTable): void {
  const headers = [
    'SKU',
    'CÓD GROUP7',
    'BU',
    'DESCRIÇÃO PRODUTO',
    'LINHA DO PRODUTO',
    'TABELA FÁBRICA (R$)',
    'PONTO',
    'TABELA VENDAS SUL (R$)',
    'SUGESTÃO DE VENDAS (R$)',
  ]

  const rows = (table.items || []).map((item) => {
    const ponto = calcPonto(item.tabela_fabrica, table.valor_ponto || 0)
    return [
      `"${item.sku || ''}"`,
      `"${item.cod_group7 || ''}"`,
      `"${item.bu || ''}"`,
      `"${(item.product_name || '').replace(/"/g, '""')}"`,
      `"${(item.product_line || '').replace(/"/g, '""')}"`,
      `"${(item.tabela_fabrica || 0).toFixed(2).replace('.', ',')}"`,
      `"${table.valor_ponto && table.valor_ponto > 0 ? formatPonto(ponto) : '0,00000'}"`,
      `"${(item.tabela_vendas_sul || 0).toFixed(2).replace('.', ',')}"`,
      `"${(item.sugestao_vendas || 0).toFixed(2).replace('.', ',')}"`,
    ].join(';')
  })

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

// ─── SALVAR TABELA ESTRUTURADA IMPORTADA DO PDF ─────────────────────────────

export async function saveStructuredPriceTable(doc: {
  versao: string
  titulo: string
  regras_comerciais: any
  tabelas_matriz: any
  items_planos: ParsedImportRow[]
}): Promise<V2PriceTable> {
  const tableId = 'tbl-' + doc.versao.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const valorPontoPadrao = 3000

  const items: V2PriceTableItem[] = doc.items_planos.map((item) => ({
    product_id: 'prd-' + Math.random().toString(36).substring(2, 9),
    sku: item.sku || 'SKU',
    product_name: item.product_name,
    product_line: item.product_line,
    tabela_fabrica: item.tabela_fabrica,
    tabela_vendas_sul: item.tabela_vendas_sul,
    sugestao_vendas: item.tabela_vendas_sul,
    ponto: calcPonto(item.tabela_fabrica, valorPontoPadrao),
  }))

  const priceTable: V2PriceTable = {
    id: tableId,
    name: doc.titulo,
    reajuste_percent: 0,
    valor_ponto: valorPontoPadrao,
    items,
    active: true,
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // 1. Salvar no Supabase na tabela bemaviv_tabela_preco
  if (supabase) {
    try {
      const payload: any = {
        id: priceTable.id,
        nome: doc.titulo,
        name: doc.titulo,
        versao: doc.versao,
        regras_comerciais: doc.regras_comerciais,
        tabelas_matriz: doc.tabelas_matriz,
        items: priceTable.items,
        ativa: true,
        active: true,
        is_default: true,
        metadata: {
          total_itens: doc.items_planos.length,
          categorias: Object.keys(doc.tabelas_matriz),
          regras_comerciais: doc.regras_comerciais,
        },
        updated_at: new Date().toISOString(),
      }
      await supabase.from(SUPABASE_TABLE).upsert(payload)
    } catch (e) {
      console.warn('Erro ao salvar no Supabase:', e)
    }
  }

  // 2. Atualizar cache local
  await savePriceTable(priceTable)
  await setDefaultPriceTable(priceTable.id)

  return priceTable
}
