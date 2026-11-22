/**
 * v2PriceTableComparator.ts
 * Comparador inteligente de tabelas de preço Eko7 / Bem Aviv.
 * Cruza produtos por Modelo + Dimensão de Base (Largura x Comprimento),
 * detectando variações de preço, inclusões e alterações de especificação (como mudança de altura).
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
  detalheMudanca?: string // Ex: "Altura: 20cm ➔ 25cm"
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

interface ProductSignature {
  modeloKey: string
  medidaKey: string
  altura?: string
  nomeOriginal: string
  linha: string
  preco: number
  sku?: string
}

// Normaliza strings removendo acentos e espaços extras
function normalizarTexto(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extrai Modelo Principal, Medida de Cama e Altura
function extrairAssinatura(nome: string, linha: string, preco: number, sku?: string): ProductSignature {
  const norm = normalizarTexto(nome)

  // 1. Identificar modelo base
  let modeloKey = 'outro'
  const modelosConhecidos = [
    { key: 'diamante', termos: ['diamante'] },
    { key: 'serie_ouro_pillow', termos: ['serie ouro pillow', 'ouro pillow'] },
    { key: 'serie_ouro', termos: ['serie ouro'] },
    { key: 'pangeia', termos: ['pangeia'] },
    { key: 'news', termos: ['news'] },
    { key: 'seven', termos: ['seven 2.0', 'seven'] },
    { key: 'renova', termos: ['renova'] },
    { key: 'lunar', termos: ['lunar'] },
    { key: 'unico', termos: ['unico'] },
    { key: 'baby', termos: ['baby'] },
    { key: 'colchonete', termos: ['colchonete'] },
    { key: 'manta_perfilada', termos: ['manta perfilada'] },
    { key: 'manta_conforto', termos: ['manta de conforto', 'manta conforto'] },
    { key: 'manta_quantica', termos: ['manta quantica'] },
    { key: 'box_bau_essencial', termos: ['box bau essencial', 'bau essencial'] },
    { key: 'box_bau_premium', termos: ['box premium c/ bau', 'box premium bau', 'box bau'] },
    { key: 'box_classico', termos: ['box premium classico', 'box classico'] },
    { key: 'box_slim', termos: ['box premium slim', 'box slim'] },
    { key: 'bicama_auxiliar', termos: ['bicama c/ cama auxiliar', 'bicama auxiliar'] },
    { key: 'bicama_bau', termos: ['bicama c/ bau', 'bicama bau'] },
    { key: 'bicama_sem_bau', termos: ['bicama s/ bau', 'bicama sem bau'] },
    { key: 'cama_gran_jaguar', termos: ['cama completa gran jaguar', 'cama base gran jaguar', 'cama gran jaguar'] },
    { key: 'cama_roma', termos: ['cama completa roma', 'cama base roma', 'cama roma'] },
    { key: 'cama_lisboa', termos: ['cama completa lisboa', 'cama base lisboa', 'cama lisboa'] },
    { key: 'articulado_gran_jaguar', termos: ['articulado c/ cabeceira gran jaguar', 'articulado s/ cabeceira gran jaguar'] },
    { key: 'articulado_roma', termos: ['articulado c/ cabeceira roma', 'articulado s/ cabeceira roma'] },
    { key: 'articulado_lisboa', termos: ['articulado c/ cabeceira lisboa', 'articulado s/ cabeceira lisboa'] },
    { key: 'maceio', termos: ['maceio'] },
    { key: 'cincinatti', termos: ['cincinatti'] },
    { key: 'rio', termos: ['rio'] },
    { key: 'havai_slim', termos: ['havai slim'] },
    { key: 'havai', termos: ['havai'] },
    { key: 'himalaia', termos: ['himalaia'] },
    { key: 'olimpia', termos: ['olimpia'] },
    { key: 'jaguar', termos: ['gran jaguar', 'jaguar'] },
    { key: 'roma', termos: ['roma'] },
    { key: 'lisboa', termos: ['lisboa'] },
    { key: 'cadeira_presidente', termos: ['cadeira presidente'] },
    { key: 'cadeira_diretor', termos: ['cadeira diretor'] },
    { key: 'cadeira_secretaria', termos: ['cadeira secretaria'] },
    { key: 'poltrona_reclinavel', termos: ['poltrona reclinavel'] },
    { key: 'poltrona_massagem', termos: ['poltrona c/ massagem', 'poltrona massagem'] },
    { key: 'poltrona', termos: ['poltrona'] },
    { key: 'travesseiro_visco', termos: ['viscoelastico'] },
    { key: 'travesseiro_soft', termos: ['soft'] },
    { key: 'travesseiro_hugging', termos: ['hugging', 'corpo'] },
    { key: 'tenis_fn1', termos: ['tenis fn1', 'fn1'] },
    { key: 'palmilha', termos: ['palmilha'] },
    { key: 'chinelo_fem', termos: ['chinelo feminino'] },
    { key: 'chinelo_masc', termos: ['chinelo masculino'] },
  ]

  for (const m of modelosConhecidos) {
    if (m.termos.some(t => norm.includes(t))) {
      modeloKey = m.key
      break
    }
  }

  // 2. Identificar medida padrão (largura x comprimento)
  let medidaKey = 'padrao'
  if (norm.includes('0,78') || norm.includes('0.78') || norm.includes('0,88') || norm.includes('0.88') || norm.includes('0.88m')) {
    medidaKey = '0.88x1.88'
  } else if (norm.includes('1,19') || norm.includes('1.19')) {
    medidaKey = '1.19x1.88'
  } else if (norm.includes('1,28') || norm.includes('1.28') || norm.includes('1,38') || norm.includes('1.38')) {
    medidaKey = '1.38x1.88'
  } else if (norm.includes('1,58') || norm.includes('1.58')) {
    medidaKey = '1.58x1.98'
  } else if (norm.includes('1,93') || norm.includes('1.93')) {
    medidaKey = '1.93x2.03'
  } else if (norm.includes('acima 1,93') || norm.includes('sob medida')) {
    medidaKey = 'sob_medida'
  } else if (norm.includes('0,80') || norm.includes('0.80')) {
    medidaKey = '0.80x2.00'
  } else if (norm.includes('0,90') || norm.includes('0.90')) {
    medidaKey = '0.90x2.00'
  } else if (norm.includes('1,40') || norm.includes('1.40')) {
    medidaKey = '1.40x2.00'
  } else if (norm.includes('1,60') || norm.includes('1.60')) {
    medidaKey = '1.60x2.00'
  } else if (norm.includes('1,80') || norm.includes('1.80')) {
    medidaKey = '1.80x2.00'
  } else if (norm.includes('2,00') || norm.includes('2.00')) {
    medidaKey = '2.00x2.00'
  }

  // 3. Identificar altura (se especificada, ex: 20cm, 0,20m, 25cm, 35cm, 40cm, etc.)
  let altura: string | undefined = undefined
  const matchAlturaCm = norm.match(/(\d{2})\s*cm/)
  const matchAlturaM = norm.match(/0[,.](\d{2})\s*m/)
  if (matchAlturaCm) {
    altura = `${matchAlturaCm[1]}cm`
  } else if (matchAlturaM) {
    altura = `${matchAlturaM[1]}cm`
  }

  return {
    modeloKey,
    medidaKey,
    altura,
    nomeOriginal: nome,
    linha,
    preco,
    sku,
  }
}

export function comparePriceTables(
  tabelaAnterior: V2PriceTable | null,
  novosItens: ParsedImportRow[],
  versaoNova: string = 'REV06/2026'
): PriceTableDiffSummary {
  const itensDiff: PriceDiffItem[] = []
  const versaoAnterior = tabelaAnterior?.name || 'Versão Anterior'

  // Mapa de assinaturas dos itens anteriores
  // Chave Primária: modeloKey + '|' + medidaKey (Permite cruzar mesmo se a altura mudou de 20cm para 25cm!)
  const mapaAnterior = new Map<string, ProductSignature[]>()

  if (tabelaAnterior && tabelaAnterior.items) {
    tabelaAnterior.items.forEach((item) => {
      const preco = item.tabela_vendas_sul || item.sugestao_vendas || 0
      const sig = extrairAssinatura(item.product_name, item.product_line, preco, item.sku)
      const key = `${sig.modeloKey}|${sig.medidaKey}`
      const lista = mapaAnterior.get(key) || []
      lista.push(sig)
      mapaAnterior.set(key, lista)
    })
  }

  const assinaturasUsadasAnterior = new Set<ProductSignature>()

  // 1. Processar cada item da nova tabela
  novosItens.forEach((novo) => {
    const sigNova = extrairAssinatura(novo.product_name, novo.product_line, novo.tabela_vendas_sul, novo.sku)
    const key = `${sigNova.modeloKey}|${sigNova.medidaKey}`
    const candidatos = mapaAnterior.get(key) || []

    // Procura primeiro candidato exato com mesma altura
    let match = candidatos.find(c => c.altura === sigNova.altura && !assinaturasUsadasAnterior.has(c))
    // Se não houver com mesma altura, pega o primeiro com mesmo modelo + medida base
    if (!match) {
      match = candidatos.find(c => !assinaturasUsadasAnterior.has(c))
    }

    if (!match || sigNova.modeloKey === 'outro') {
      // Produto Novo (ou modelo/medida que não existia na tabela anterior)
      itensDiff.push({
        sku: novo.sku,
        nome: novo.product_name,
        linha: novo.product_line,
        tipo: 'NOVO',
        precoNovo: novo.tabela_vendas_sul,
      })
    } else {
      assinaturasUsadasAnterior.add(match)

      const precoAntigo = match.preco
      const precoNovo = novo.tabela_vendas_sul
      const diferenca = Number((precoNovo - precoAntigo).toFixed(2))

      // Checa se a altura mudou (ex: de 20cm para 25cm)
      let detalheMudanca: string | undefined = undefined
      if (match.altura && sigNova.altura && match.altura !== sigNova.altura) {
        detalheMudanca = `Altura: ${match.altura} ➔ ${sigNova.altura}`
      }

      if (Math.abs(diferenca) > 0.05 || detalheMudanca) {
        // Produto Alterado (Preço Reajustado e/ou Medida de Altura Alterada)
        const variacao = precoAntigo > 0 ? Number(((diferenca / precoAntigo) * 100).toFixed(2)) : 0
        itensDiff.push({
          sku: novo.sku || match.sku,
          nome: novo.product_name,
          linha: novo.product_line,
          tipo: 'ALTERADO',
          precoAnterior: precoAntigo,
          precoNovo: precoNovo,
          diferenca,
          variacaoPercentual: variacao,
          detalheMudanca,
        })
      } else {
        // Preço e especificações idênticos
        itensDiff.push({
          sku: novo.sku || match.sku,
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

  // 2. Produtos da tabela anterior que não tiveram correspondência (Descontinuados/Ausentes)
  mapaAnterior.forEach((lista) => {
    lista.forEach((sigAntiga) => {
      if (!assinaturasUsadasAnterior.has(sigAntiga)) {
        itensDiff.push({
          sku: sigAntiga.sku,
          nome: sigAntiga.nomeOriginal,
          linha: sigAntiga.linha,
          tipo: 'REMOVIDO',
          precoAnterior: sigAntiga.preco,
        })
      }
    })
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
