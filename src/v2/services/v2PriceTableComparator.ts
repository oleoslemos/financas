/**
 * v2PriceTableComparator.ts
 * Comparador inteligente de tabelas de preço Eko7 / Bem Aviv.
 * Cruza produtos por Modelo + Dimensão de Base (Largura x Comprimento),
 * detectando variações de preço, inclusões, alterações de especificação (como mudança de altura)
 * e diferenciando produtos comerciais de itens de assistência técnica.
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
  isAssistencia?: boolean
}

export interface PriceTableDiffSummary {
  versaoAnterior: string
  versaoNova: string
  totalNovos: number
  totalAlterados: number
  totalInalterados: number
  totalRemovidos: number
  totalAssistenciaIgnorados?: number
  itens: PriceDiffItem[]
}

interface ProductSignature {
  modeloKey: string
  medidaKey: string
  altura?: string
  tamanhoGrade?: string
  corGrade?: string
  isAssistencia: boolean
  isVestuarioAcessoriosLingerie: boolean
  descricaoLimpa: string
  nomeOriginal: string
  nomeNormalizado: string
  linha: string
  preco: number
  sku?: string
}

// Normaliza strings removendo acentos, pontuações e espaços extras
function normalizarTexto(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"()\/+,-]/g, ' ')
    .replace(/[;:]/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Limpa descrições de Lingeries, Vestuário e Acessórios Diversos
// Remove menções de grade P ao EXG para permitir busca puramente por descrição
function limparDescricaoVestuarioAcessorios(nome: string): string {
  let norm = normalizarTexto(nome)
  // Remove indicativos de grade P ao EXG
  norm = norm.replace(/\b(p|m|g|gg|exg|xg)\b/g, '')
  // Remove menções de marca sufixada
  norm = norm.replace(/\beko7\b/g, '')
  norm = norm.replace(/\beko\s*7\b/g, '')
  // Normaliza abreviações comuns
  norm = norm.replace(/\balm\b/g, 'almofada')
  norm = norm.replace(/\bcol\b/g, 'colchaozinho')
  norm = norm.replace(/\s+/g, ' ').trim()
  return norm
}

// Extrai Modelo Principal, Medida/Tamanho e Altura
function extrairAssinatura(nome: string, linha: string, preco: number, sku?: string): ProductSignature {
  const norm = normalizarTexto(nome)
// const normLinha = normalizarTexto(linha) // não utilizada
  const isAssistencia = norm.startsWith('assistencia') || norm.includes('assistencia faixa') || norm.includes('assistencia tampo') || norm.includes('assistencia diversos')

  // 1. Identificar modelo base abrangente
  let modeloKey = 'outro'
  const modelosConhecidos: { key: string; termos: string[] }[] = [
    // Colchões Premium
    { key: 'diamante', termos: ['colchao diamante', 'diamante'] },
    { key: 'serie_ouro_pillow', termos: ['serie ouro premium pillow', 'serie ouro pillow', 'ouro premium pillow', 'ouro pillow', 'pillow'] },
    { key: 'serie_ouro', termos: ['serie ouro premium', 'serie ouro'] },
    { key: 'pangeia', termos: ['colchao pangeia', 'pangeia'] },
    { key: 'news', termos: ['colchao news', 'news'] },

    // Colchões Relax
    { key: 'seven', termos: ['seven 2.0', 'seven'] },
    { key: 'renova', termos: ['renova'] },
    { key: 'lunar', termos: ['colchao lunar', 'lunar'] },
    { key: 'unico', termos: ['colchao unico', 'unico'] },
    { key: 'baby', termos: ['colchao baby', 'baby'] },
    { key: 'colchonete', termos: ['colchonete'] },

    // Mantas
    { key: 'manta_perfilada', termos: ['manta perfilada'] },
    { key: 'manta_conforto', termos: ['manta de conforto', 'manta conforto'] },
    { key: 'manta_quantica', termos: ['manta quantica'] },

    // Box e Camas
    { key: 'box_bau_essencial', termos: ['box bau essencial', 'bau essencial'] },
    { key: 'box_bau_premium', termos: ['box premium c/ bau', 'box premium c bau', 'box premium bau', 'box bau', 'box com bau'] },
    { key: 'box_classico', termos: ['box premium classico', 'box classico'] },
    { key: 'box_slim', termos: ['box premium slim', 'box slim'] },
    { key: 'bicama_auxiliar', termos: ['bicama c/ cama auxiliar', 'bicama c cama auxiliar', 'bicama auxiliar'] },
    { key: 'bicama_bau', termos: ['bicama c/ bau', 'bicama c bau', 'bicama bau'] },
    { key: 'bicama_sem_bau', termos: ['bicama s/ bau', 'bicama s bau', 'bicama sem bau'] },
    { key: 'cama_gran_jaguar', termos: ['cama completa gran jaguar', 'cama base gran jaguar', 'cama gran jaguar'] },
    { key: 'cama_roma', termos: ['cama completa roma', 'cama base roma', 'cama roma'] },
    { key: 'cama_lisboa', termos: ['cama completa lisboa', 'cama base lisboa', 'cama lisboa'] },
    { key: 'articulado_gran_jaguar', termos: ['articulado c/ cabeceira gran jaguar', 'articulado c cabeceira gran jaguar', 'articulado s/ cabeceira gran jaguar', 'articulado gran jaguar'] },
    { key: 'articulado_roma', termos: ['articulado c/ cabeceira roma', 'articulado c cabeceira roma', 'articulado s/ cabeceira roma', 'articulado roma'] },
    { key: 'articulado_lisboa', termos: ['articulado c/ cabeceira lisboa', 'articulado c cabeceira lisboa', 'articulado s/ cabeceira lisboa', 'articulado lisboa'] },

    // Cabeceiras
    { key: 'cabeceira_maceio', termos: ['cabeceira maceio', 'maceio'] },
    { key: 'cabeceira_cincinatti', termos: ['cabeceira cincinatti', 'cincinatti'] },
    { key: 'cabeceira_rio', termos: ['cabeceira rio', 'rio'] },
    { key: 'cabeceira_havai_slim', termos: ['cabeceira havai slim', 'havai slim'] },
    { key: 'cabeceira_havai', termos: ['cabeceira havai', 'havai'] },
    { key: 'cabeceira_himalaia', termos: ['cabeceira himalaia', 'himalaia'] },
    { key: 'cabeceira_olimpia', termos: ['cabeceira olimpia', 'olimpia'] },
    { key: 'cabeceira_jaguar', termos: ['cabeceira gran jaguar', 'cabeceira jaguar'] },
    { key: 'cabeceira_roma', termos: ['cabeceira roma'] },
    { key: 'cabeceira_lisboa', termos: ['cabeceira lisboa'] },

    // Calçados (Página 11)
    { key: 'tenis_fn1', termos: ['tenis fn1', 'fn1'] },
    { key: 'chinelo_fem', termos: ['chinelo feminino'] },
    { key: 'chinelo_masc', termos: ['chinelo masculino'] },
    { key: 'chinelo_nuvem', termos: ['chinelo nuvem'] },
    { key: 'palmilha', termos: ['palmilha'] },

    // Acessórios Diversos (Página 11)
    { key: 'cinta_lombar', termos: ['cinta lombar'] },
    { key: 'colar_magnetos', termos: ['colar de magnetos', 'colar magnetos'] },
    { key: 'adesivo_magneto', termos: ['adesivo de magneto', 'adesivo magneto'] },
    { key: 'imantador', termos: ['imantador'] },
    { key: 'mascara_dormir', termos: ['mascara para dormir', 'mascara'] },
    { key: 'pulseira_health', termos: ['pulseira health', "health'7", 'health 7'] },
    { key: 'alm_suporte', termos: ['alm. suporte', 'alm suporte', 'almofada suporte', 'suporte multicomforto'] },
    { key: 'col_fitness', termos: ['col. fitness', 'col fitness', 'colchaozinho fitness'] },
    { key: 'col_equilibrium', termos: ['col. equilibrium', 'col equilibrium', 'colchaozinho equilibrium'] },
    { key: 'col_nomade', termos: ['col. nomade', 'col nomade', 'colchaozinho nomade'] },
    { key: 'garrafa_eko7', termos: ['garrafa eko7', 'garrafa'] },

    // Dreams Pet (Página 11)
    { key: 'pet_plus', termos: ['dreams pet plus', 'caminha dreams pet plus', 'pet plus'] },
    { key: 'pet_slim', termos: ['dreams pet slim', 'caminha dreams pet slim', 'pet slim'] },
    { key: 'pet_puff', termos: ['dreams pet puff', 'caminha dreams pet puff', 'pet puff'] },

    // Banho (Página 11)
    { key: 'jogo_toalhas', termos: ['jogo de toalhas', 'jogo toalhas'] },
    { key: 'toalha_banho', termos: ['toalha banho'] },
    { key: 'toalha_rosto', termos: ['toalha rosto'] },
    { key: 'tapete_banho', termos: ['tapete banho', 'tapete'] },
    { key: 'roupao_microfibra', termos: ['roupao microfibra', 'roupao 360'] },
    { key: 'roupao_plush', termos: ['roupao plush'] },

    // Vestuário e Lingerie (Página 11)
    { key: 'legging_emana', termos: ['legging feminina preta emana', 'legging preta emana', 'legging emana'] },
    { key: 'legging_fem', termos: ['legging feminina', 'legging'] },
    { key: 'bermuda_fem', termos: ['bermuda feminina'] },
    { key: 'bermuda_masc', termos: ['bermuda masculina'] },
    { key: 'shorts_saia', termos: ['shorts saia', 'short saia'] },
    { key: 'shorts_fem', termos: ['shorts feminino', 'short feminino'] },
    { key: 'regata_fitness', termos: ['regata fitness feminina', 'regata fitness'] },
    { key: 'regata_fem', termos: ['regata feminina'] },
    { key: 'regata_masc', termos: ['regata masculina'] },
    { key: 'top_nadador', termos: ['top nadador'] },
    { key: 'top_tradicional', termos: ['top tradicional'] },
    { key: 'blusa_3_4', termos: ['blusa 3 4', 'blusa 3/4'] },
    { key: 'macaquinho_perna', termos: ['macaquinho c/ perna', 'macaquinho c perna', 'macaquinho com perna'] },
    { key: 'macaquinho_manga', termos: ['macaquinho c/ manga', 'macaquinho c manga', 'macaquinho com manga'] },
    { key: 'macaquinho', termos: ['macaquinho'] },
    { key: 'macacao_preto', termos: ['macacao preto', 'macacao'] },
    { key: 'blusa_masc_manga', termos: ['blusa masculina c/ manga', 'blusa masculina c manga', 'blusa masculina com manga', 'blusa masculina'] },
    { key: 'calcinha', termos: ['calcinha'] },
    { key: 'sutia', termos: ['sutia'] },

    // Linha Têxtil
    { key: 'lencol_malha_jogo', termos: ['jogo de lencol malha', 'jogo lencol malha'] },
    { key: 'lencol_percal_jogo', termos: ['jogo de lencol percal', 'jogo lencol percal'] },
    { key: 'lencol_malha_avulso', termos: ['lencol avulso malha', 'lencol malha'] },
    { key: 'lencol_percal_avulso', termos: ['lencol avulso percal', 'lencol percal'] },
    { key: 'capa_protetor', termos: ['capa protetor impermeavel', 'protetor impermeavel'] },
    { key: 'edredom_malha', termos: ['edredom malha'] },
    { key: 'edredom_percal', termos: ['edredom percal'] },
    { key: 'coberdrom_plush', termos: ['coberdrom plush', 'coberdrom'] },
    { key: 'manta_microfibra', termos: ['manta microfibra'] },
    { key: 'kit_colcha_almofada', termos: ['kit colcha c/ almofadas', 'kit colcha c almofadas', 'kit colcha com almofadas'] },
    { key: 'kit_colcha', termos: ['kit colcha'] },
    { key: 'fronha_malha', termos: ['fronha malha'] },
    { key: 'fronha_percal', termos: ['fronha percal'] },
    { key: 'almofada_versatile', termos: ['almofada versatile'] },
    { key: 'almofada_avulsa', termos: ['almofada avulsa'] },

    // Cadeiras e Poltronas
    { key: 'cadeira_presidente', termos: ['cadeira presidente'] },
    { key: 'cadeira_diretor', termos: ['cadeira diretor'] },
    { key: 'cadeira_secretaria', termos: ['cadeira secretaria'] },
    { key: 'poltrona_reclinavel', termos: ['poltrona reclinavel'] },
    { key: 'poltrona_massagem', termos: ['poltrona c/ massagem', 'poltrona c massagem', 'poltrona massagem'] },
    { key: 'poltrona', termos: ['poltrona'] },

    // Travesseiros
    { key: 'travesseiro_visco', termos: ['viscoelastico'] },
    { key: 'travesseiro_soft', termos: ['soft'] },
    { key: 'travesseiro_hugging', termos: ['hugging', 'corpo'] },
  ]

  for (const m of modelosConhecidos) {
    if (m.termos.some(t => norm.includes(t))) {
      modeloKey = m.key
      break
    }
  }

// Detecta se o item pertence à categoria Calçados
const isCalcado = (() => {
  // termos que identificam calçados
  const termosCalcado = [
    'tenis fn1', 'chinelo feminino', 'chinelo masculino',
    'chinelo nuvem', 'palmilha', 'cinta lombar', 'colar de magnetos',
    'adesivo de magneto', 'imantador', 'mascara para dormir',
    'pulseira health', 'alm. suporte', 'col. fitness',
    'col. equilibrium', 'col. nomade', 'garrafa eko7',
  ]
  // `norm` já contém a descrição normalizada
  return termosCalcado.some(t => norm.includes(t))
})()

  // Detecta se o item pertence a Lingeries, Vestuário ou Acessórios Diversos
  const isVestuarioAcessoriosLingerie = (
    normLinha.includes('lingerie') ||
    normLinha.includes('vestuario') ||
    normLinha.includes('acessorio') ||
    [
      'cinta_lombar', 'colar_magnetos', 'adesivo_magneto', 'imantador', 'mascara_dormir',
      'pulseira_health', 'alm_suporte', 'col_fitness', 'col_equilibrium', 'col_nomade',
      'garrafa_eko7', 'legging_emana', 'legging_fem', 'bermuda_fem', 'bermuda_masc',
      'shorts_saia', 'shorts_fem', 'regata_fitness', 'regata_fem', 'regata_masc',
      'top_nadador', 'top_tradicional', 'blusa_3_4', 'macaquinho_perna', 'macaquinho_manga',
      'macaquinho', 'macacao_preto', 'blusa_masc_manga', 'calcinha', 'sutia'
    ].includes(modeloKey)
  );


  // 2. Identificar medida padrão (largura x comprimento, pet ou gramatura)
  let medidaKey = 'padrao'
  let tamanhoGrade: string | undefined = undefined
  let corGrade: string | undefined = undefined

  if (isVestuarioAcessoriosLingerie) {
  // Para Lingeries, Vestuário e Acessórios Diversos a busca usa apenas a descrição
  medidaKey = 'padrao'
} else if (isCalcado) {
  // 1. Extração de Tamanho para Calçados (ex.: [33/34], 33/34, [32/33/34], etc.)
  const matchTamBracket = norm.match(/\[(\d{2}(?:\/\d{2})*(?:\/\d{2})*)\]/)
  const matchTamRaw = norm.match(/\b(\d{2}\/\d{2}(?:\/\d{2})*)\b/)
  const matchTamNum = norm.match(/\[(\d{2})\]/) || norm.match(/\b(3[2-9]|4[0-5])\b/)

  if (matchTamBracket) {
    tamanhoGrade = matchTamBracket[1]
  } else if (matchTamRaw) {
    tamanhoGrade = matchTamRaw[1]
  } else if (matchTamNum) {
    tamanhoGrade = matchTamNum[1]
  }

  // 2. Extração de Cor para Calçados
  const coresConhecidas = [
    'off white', 'preta', 'preto', 'branca', 'branco', 'azul',
    'roxa', 'roxo', 'rosa neon', 'rosa claro', 'rosa', 'laranja',
    'cinza mescla', 'mescla', 'verde', 'marsala', 'vermelha',
  ]
  // (continua o restante do código existente)

    if (matchTamBracket) {
      tamanhoGrade = matchTamBracket[1]
    } else if (matchTamRaw) {
      tamanhoGrade = matchTamRaw[1]
    } else if (matchTamNum) {
      tamanhoGrade = matchTamNum[1]
    }

    // 2. Extração de Cor para Calçados
    const coresConhecidas = [
      'off white', 'preta', 'preto', 'branca', 'branco', 'azul',
      'roxa', 'roxo', 'rosa neon', 'rosa claro', 'rosa', 'laranja',
      'cinza mescla', 'mescla', 'verde', 'marsala', 'vermelha'
    ]

    const matchCorBracket = norm.match(/\[([a-z\s]+)\]/g)
    if (matchCorBracket) {
      for (const b of matchCorBracket) {
        const inside = b.replace(/[\[\]]/g, '').trim()
        const achou = coresConhecidas.find(c => inside === c || inside.includes(c))
        if (achou) {
          corGrade = achou
          break
        }
      }
    }

    if (!corGrade) {
      corGrade = coresConhecidas.find(c => norm.includes(c))
    }

    if (tamanhoGrade || corGrade) {
      medidaKey = `grade_${tamanhoGrade || 'geral'}_${corGrade || 'geral'}`
    }
  } else if (norm.includes('0 78') || norm.includes('0 88') || norm.includes('0.88') || norm.includes('solteiro 0 88') || norm.includes('0,88')) {
    medidaKey = '0.88x1.88'
  } else if (norm.includes('1 19') || norm.includes('1.19') || norm.includes('solteiro 1 19') || norm.includes('1,19')) {
    medidaKey = '1.19x1.88'
  } else if (norm.includes('1 28') || norm.includes('1 38') || norm.includes('1.38') || norm.includes('casal 1 38') || norm.includes('1,38') || norm.includes('1,28')) {
    medidaKey = '1.38x1.88'
  } else if (norm.includes('1 58') || norm.includes('1.58') || norm.includes('queen 1 58') || norm.includes('1,58')) {
    medidaKey = '1.58x1.98'
  } else if (norm.includes('1 93') || norm.includes('1.93') || norm.includes('king 1 93') || norm.includes('1,93')) {
    medidaKey = '1.93x2.03'
  } else if (norm.includes('acima 1 93') || norm.includes('acima 1.93') || norm.includes('acima 1,93') || norm.includes('sob medida')) {
    medidaKey = 'sob_medida'
  } else if (norm.includes('500 g') || norm.includes('500g') || norm.includes('500 g/m')) {
    medidaKey = '500g'
  } else if (norm.includes('800 g') || norm.includes('800g') || norm.includes('800 g/m')) {
    medidaKey = '800g'
  } else if (norm.includes('360 g') || norm.includes('360g') || norm.includes('360 g/m')) {
    medidaKey = '360g'
  } else if (norm.includes('57 x 53') || norm.includes(' p ') || norm.endsWith(' p') || norm.includes(' - p')) {
    medidaKey = 'tam_p'
  } else if (norm.includes('82 x 71') || norm.includes(' m ') || norm.endsWith(' m') || norm.includes(' - m')) {
    medidaKey = 'tam_m'
  } else if (norm.includes('100 x 86') || norm.includes(' g ') || norm.endsWith(' g') || norm.includes(' - g')) {
    medidaKey = 'tam_g'
  }

  // 3. Identificar altura (se especificada, ex: 20cm, 0,20m, 25cm, 35cm, 40cm, etc.)
  let altura: string | undefined = undefined
  const matchAlturaCm = norm.match(/(\d{2})\s*cm/)
  const matchAlturaM = norm.match(/0\s*(\d{2})\s*m/) || norm.match(/0[,.](\d{2})\s*m/)
  if (matchAlturaCm) {
    altura = `${matchAlturaCm[1]}cm`
  } else if (matchAlturaM) {
    altura = `${matchAlturaM[1]}cm`
  }

  return {
    modeloKey,
    medidaKey,
    altura,
    tamanhoGrade,
    corGrade,
    isAssistencia,
    isVestuarioAcessoriosLingerie,
    descricaoLimpa,
    nomeOriginal: nome,
    nomeNormalizado: norm,
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
  let totalAssistenciaIgnorados = 0

  if (tabelaAnterior && tabelaAnterior.items) {
    tabelaAnterior.items.forEach((item) => {
      const preco = item.tabela_vendas_sul || item.sugestao_vendas || 0
      const sig = extrairAssinatura(item.product_name, item.product_line, preco, item.sku)

      // Peças de assistência técnica não constam em tabela de vendas da fábrica
      if (sig.isAssistencia) {
        totalAssistenciaIgnorados++
        return
      }

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

    // Procura primeiro candidato exato com a mesma altura
    let match = candidatos.find(
      c => c.altura === sigNova.altura && !assinaturasUsadasAnterior.has(c)
    )
    // Se o modelo for cabeceira, ignore a diferença de altura e aceita o primeiro candidato do mesmo modelo
    if (!match && sigNova.modeloKey.startsWith('cabeceira')) {
      match = candidatos.find(c => !assinaturasUsadasAnterior.has(c))
    }
    // Caso ainda não haja correspondência, pega o primeiro candidato do mesmo modelo + medida base
    if (!match) {
      match = candidatos.find(c => !assinaturasUsadasAnterior.has(c))
    }

    // REGRA ESPECÍFICA: Para Lingeries, Vestuário e Acessórios Diversos, busca puramente pela descrição (grade P ao EXG inclusa)
    if (!match && sigNova.isVestuarioAcessoriosLingerie) {
      for (const [, lista] of mapaAnterior) {
        const achado = lista.find(c => {
          if (assinaturasUsadasAnterior.has(c)) return false
          const mesmoModelo = c.modeloKey !== 'outro' && c.modeloKey === sigNova.modeloKey
          const mesmaDescricao =
            c.descricaoLimpa.length > 3 && sigNova.descricaoLimpa.length > 3 &&
            (c.descricaoLimpa === sigNova.descricaoLimpa ||
             c.descricaoLimpa.includes(sigNova.descricaoLimpa) ||
             sigNova.descricaoLimpa.includes(c.descricaoLimpa))
          return mesmoModelo || mesmaDescricao
        })
        if (achado) {
          match = achado
          break
        }
      }
    }

    // Fallback: se for 'outro', tenta correspondência por nome similar
    if (!match && sigNova.modeloKey === 'outro') {
      for (const [, lista] of mapaAnterior) {
        const achado = lista.find(c => {
          if (assinaturasUsadasAnterior.has(c)) return false
          const p1 = sigNova.nomeNormalizado
          const p2 = c.nomeNormalizado
          return p1.includes(p2) || p2.includes(p1)
        })
        if (achado) {
          match = achado
          break
        }
      }
    }

    if (!match) {
      // Produto Novo (inclusão de catálogo)
      let detalheMudanca: string | undefined = undefined
      if (sigNova.tamanhoGrade || sigNova.corGrade) {
        detalheMudanca = `Grade: [${sigNova.tamanhoGrade || '-'}] [${sigNova.corGrade?.toUpperCase() || '-'}]`
      }

      itensDiff.push({
        sku: novo.sku,
        nome: novo.product_name,
        linha: novo.product_line,
        tipo: 'NOVO',
        precoNovo: novo.tabela_vendas_sul,
        detalheMudanca,
      })
    } else {
      assinaturasUsadasAnterior.add(match)

      const precoAntigo = match.preco
      const precoNovo = novo.tabela_vendas_sul
      const diferenca = Number((precoNovo - precoAntigo).toFixed(2))

      // Checa se a altura ou especificação mudou (ex: de 20cm para 25cm)
      let detalheMudanca: string | undefined = undefined
      if (match.altura && sigNova.altura && match.altura !== sigNova.altura) {
        detalheMudanca = `Altura: ${match.altura} ➔ ${sigNova.altura}`
      } else if (sigNova.tamanhoGrade || sigNova.corGrade) {
        detalheMudanca = `Grade: [${sigNova.tamanhoGrade || '-'}] [${sigNova.corGrade?.toUpperCase() || '-'}]`
      }

      if (Math.abs(diferenca) > 0.05 || (match.altura && sigNova.altura && match.altura !== sigNova.altura)) {
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
          detalheMudanca,
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
    totalAssistenciaIgnorados,
    itens: itensDiff,
  }
}
