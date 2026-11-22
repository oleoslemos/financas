/**
 * v2PdfTableParser.ts
 * Parser especializado na extração e estruturação de dados do PDF de Tabelas de Preço (REV06/2026).
 * Converte o texto bruto extraído do PDF em estruturas matriciais ricas e itens planos para o catálogo.
 */

import { ParsedImportRow } from './v2TabelaPrecoService'

export interface StructuredPriceDocument {
  versao: string
  titulo: string
  regras_comerciais: {
    desconto_5x_percentual: number
    desconto_a_vista_composto: number[]
    observacoes: string[]
  }
  tabelas_matriz: Record<string, any>
  items_planos: ParsedImportRow[]
}

// Limpa strings monetárias em números reais
export function parseMoeda(str: string | undefined | null): number {
  if (!str) return 0
  const clean = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
}

export function parseTabelaPdf(fullText: string, fileName?: string): StructuredPriceDocument {
  // Detectar versão
  const matchVersao = fullText.match(/REV\d{2}\/\d{4}/i)
  const versao = matchVersao ? matchVersao[0].toUpperCase() : 'REV06/2026'
  const titulo = fileName?.replace(/\.[^/.]+$/, '').trim() || `Tabela de Vendas Sul - ${versao}`

  const tabelasMatriz: Record<string, any> = {
    colchoes_premium: [],
    box_premium: [],
    cabeceiras_premium: [],
    colchoes_relax: [],
    box_bau_essencial: [],
    cabeceiras_relax: [],
    camas: [],
    colchonetes_mantas: [],
    bicamas: [],
    articulados_com_cabeceira: [],
    articulados_sem_cabeceira: [],
    cadeiras_poltronas_puffs: [],
    travesseiros_encostos: [],
    linha_textil: [],
    acessorios_calcados_vestuario: [],
  }

  const itemsPlanos: ParsedImportRow[] = []

  const addItem = (nome: string, linha: string, precoVenda: number, sku?: string) => {
    if (!nome || precoVenda <= 0) return
    const costPrice = Number((precoVenda / 1.5).toFixed(2)) // Margem base estimada fábrica
    itemsPlanos.push({
      sku: sku || undefined,
      product_name: nome.trim(),
      product_line: linha.trim(),
      tabela_fabrica: costPrice,
      tabela_vendas_sul: precoVenda,
    })
  }

  // ── 1. COLCHÕES PREMIUM (Página 1) ──────────────────────────────────────────
  const dimColchoes = [
    { dim: '0,78 ou 0,88 x 1,88m', d: 9784.42, o: 8189.39, p: 6717.30, n: 5532.29, elet: 2853.74 },
    { dim: '1,19 x 1,88m', d: 11741.31, o: 9827.27, p: 8060.76, n: 6638.75, elet: 2853.74 },
    { dim: '1,28 ou 1,38 x 1,88m', d: 16307.37, o: 13648.98, p: 11195.50, n: 9220.49, elet: 2853.74 },
    { dim: '1,58 x 1,98m', d: 19568.84, o: 16378.78, p: 13434.60, n: 11064.58, elet: 3815.75 },
    { dim: '1,93 x 2,03m', d: 22014.95, o: 18426.12, p: 15113.92, n: 12447.66, elet: 3815.75 },
    { dim: 'acima 1,93 x acima 2,03m', d: 23645.69, o: 19791.02, p: 16233.47, n: 13369.71, elet: 3815.75 },
  ]

  tabelasMatriz.colchoes_premium = dimColchoes.map(r => {
    addItem(`Colchão Diamante (40cm) - ${r.dim}`, 'Colchões Premium', r.d)
    addItem(`Colchão Série Ouro Premium (35cm) - ${r.dim}`, 'Colchões Premium', r.o)
    addItem(`Colchão Pangeia (29cm) - ${r.dim}`, 'Colchões Premium', r.p)
    addItem(`Colchão News (26cm) - ${r.dim}`, 'Colchões Premium', r.n)
    return {
      dimensao: r.dim,
      diamante_40cm: r.d,
      serie_ouro_35cm: r.o,
      pangeia_29cm: r.p,
      news_26cm: r.n,
      eletronico_quantica_vibro_cromo: r.elet,
    }
  })

  // ── 2. BOX PREMIUM (Página 1) ───────────────────────────────────────────────
  const dimBox = [
    { dim: '0,78 ou 0,88 x 1,88m', bau: 3201.43, classico: 1033.75, slim: 869.09 },
    { dim: '1,19 x 1,88m', bau: 3656.28, classico: 1207.57, slim: 1042.91 },
    { dim: '1,28 ou 1,38 x 1,88m', bau: 4009.82, classico: 1613.14, slim: 1448.48 },
    { dim: '1,58 x 1,98m', bau: 6845.26, classico: 2526.51, slim: 2361.84 },
    { dim: '1,93 x 2,03m', bau: 7205.60, classico: 2856.08, slim: 2691.41 },
    { dim: 'acima 1,93 x acima 2,03m', bau: 7711.79, classico: 2940.09, slim: 2775.42 },
  ]

  tabelasMatriz.box_premium = dimBox.map(r => {
    addItem(`Box Premium C/ Baú (36cm) - ${r.dim}`, 'Box Premium', r.bau)
    addItem(`Box Premium Clássico (23cm) - ${r.dim}`, 'Box Premium', r.classico)
    addItem(`Box Premium Slim (15cm) - ${r.dim}`, 'Box Premium', r.slim)
    return {
      dimensao: r.dim,
      com_bau_36cm: r.bau,
      classico_23cm: r.classico,
      slim_15cm: r.slim,
    }
  })

  // ── 3. CABECEIRAS PREMIUM (Página 2) ───────────────────────────────────────
  const dimCabec = [
    { dim: 'p/ box 0,88m', maceio: 813.39, cincinatti: 642.09, rio: 642.09, havai: 930.53, havai_slim: 763.40, himalaia: 658.37, olimpia: 647.24, diamante: 1474.72, jaguar: 1352.55, roma: 1688.81, lisboa: 1665.91 },
    { dim: 'p/ box 1,19m', maceio: 836.61, cincinatti: 660.42, rio: 660.42, havai: 957.10, havai_slim: 785.20, himalaia: 677.17, olimpia: 862.99, diamante: 1516.83, jaguar: 1391.17, roma: 1737.03, lisboa: 1693.29 },
    { dim: 'p/ box 1,38m', maceio: 1161.96, cincinatti: 917.26, rio: 917.26, havai: 1329.31, havai_slim: 1090.56, himalaia: 940.51, olimpia: 1078.74, diamante: 2106.71, jaguar: 1932.18, roma: 2412.54, lisboa: 2351.79 },
    { dim: 'p/ box 1,58m', maceio: 1394.36, cincinatti: 1100.71, rio: 1100.71, havai: 1595.17, havai_slim: 1308.67, himalaia: 1128.62, olimpia: 1078.74, diamante: 2528.05, jaguar: 2318.61, roma: 2895.05, lisboa: 2822.15 },
    { dim: 'p/ box 1,93m', maceio: 1568.65, cincinatti: 1238.30, rio: 1238.30, havai: 1794.57, havai_slim: 1472.25, himalaia: 1269.69, olimpia: 1294.49, diamante: 2844.05, jaguar: 2608.44, roma: 3256.93, lisboa: 3174.92 },
    { dim: 'p/ box acima 2,05m', maceio: 1649.99, cincinatti: 1302.50, rio: 1302.50, havai: 1887.62, havai_slim: 1548.59, himalaia: 1335.53, olimpia: 0, diamante: 2991.52, jaguar: 2743.69, roma: 3425.81, lisboa: 3339.55 },
  ]

  tabelasMatriz.cabeceiras_premium = dimCabec.map(r => {
    addItem(`Cabeceira Maceió - ${r.dim}`, 'Cabeceiras Premium', r.maceio)
    addItem(`Cabeceira Cincinatti - ${r.dim}`, 'Cabeceiras Premium', r.cincinatti)
    addItem(`Cabeceira Rio - ${r.dim}`, 'Cabeceiras Premium', r.rio)
    addItem(`Cabeceira Havaí - ${r.dim}`, 'Cabeceiras Premium', r.havai)
    addItem(`Cabeceira Havaí Slim - ${r.dim}`, 'Cabeceiras Premium', r.havai_slim)
    addItem(`Cabeceira Himalaia - ${r.dim}`, 'Cabeceiras Premium', r.himalaia)
    addItem(`Cabeceira Diamante - ${r.dim}`, 'Cabeceiras Premium', r.diamante)
    addItem(`Cabeceira Gran Jaguar - ${r.dim}`, 'Cabeceiras Premium', r.jaguar)
    addItem(`Cabeceira Roma - ${r.dim}`, 'Cabeceiras Premium', r.roma)
    addItem(`Cabeceira Lisboa - ${r.dim}`, 'Cabeceiras Premium', r.lisboa)
    return r
  })
  addItem('Cabeceira Olímpia (Módulo 0,34 x 1,30m)', 'Cabeceiras Premium', 215.75)

  // ── 4. COLCHÕES RELAX (Página 3) ────────────────────────────────────────────
  const dimRelax = [
    { dim: '0,88 x 1,88m', lunar: 2693.00, unico: 3763.87, seven: 2443.12, renova: 2002.57, elet: 1808.76 },
    { dim: '1,19 x 1,88m', lunar: 3231.60, unico: 4516.64, seven: 2931.75, renova: 2403.06, elet: 1808.76 },
    { dim: '1,38 x 1,88m', lunar: 4488.34, unico: 6273.12, seven: 4071.87, renova: 3337.59, elet: 1808.76 },
    { dim: '1,58 x 1,98m', lunar: 5386.00, unico: 7527.74, seven: 4886.24, renova: 4003.71, elet: 2127.94 },
    { dim: '1,93 x 2,03m', lunar: 6059.25, unico: 8468.71, seven: 5497.02, renova: 4503.57, elet: 2127.94 },
    { dim: 'acima 1,93 x acima 2,03m', lunar: 0, unico: 9096.02, seven: 0, renova: 0, elet: 2127.94 },
  ]

  tabelasMatriz.colchoes_relax = dimRelax.map(r => {
    if (r.lunar > 0) addItem(`Colchão Lunar (24cm) - ${r.dim}`, 'Colchões Relax', r.lunar)
    if (r.unico > 0) addItem(`Colchão Único (27cm) - ${r.dim}`, 'Colchões Relax', r.unico)
    if (r.seven > 0) addItem(`Colchão Seven 2.0 Vibro+Quântica (30cm) - ${r.dim}`, 'Colchões Relax', r.seven)
    if (r.renova > 0) addItem(`Colchão Renova Vibro+Quântica (20cm) - ${r.dim}`, 'Colchões Relax', r.renova)
    return r
  })

  // ── 5. BOX BAÚ ESSENCIAL (Página 3) ─────────────────────────────────────────
  const dimBoxBau = [
    { dim: '0,88 x 1,88m', preco: 2484.33 },
    { dim: '1,19 x 1,88m', preco: 2717.06 },
    { dim: '1,38 x 1,88m', preco: 2838.45 },
    { dim: '1,58 x 1,98m', preco: 4998.38 },
    { dim: '1,93 x 2,03m', preco: 5387.70 },
    { dim: 'acima 1,93 x acima 2,03m', preco: 5765.92 },
  ]
  tabelasMatriz.box_bau_essencial = dimBoxBau.map(r => {
    addItem(`Box Baú Essencial (36cm) - ${r.dim}`, 'Box Essencial', r.preco)
    return r
  })

  // ── 6. CABECEIRAS RELAX (Página 4) ──────────────────────────────────────────
  const dimCabecRelax = [
    { dim: 'p/ box 0,88m', maceio: 656.69, cincinatti: 485.39, rio: 485.39, havai: 732.68, havai_slim: 577.91, himalaia: 501.69, olimpia: 489.65, diamante: 683.13, jaguar: 1087.10, roma: 1565.73, lisboa: 1665.91 },
    { dim: 'p/ box 1,19m', maceio: 675.44, cincinatti: 499.25, rio: 499.25, havai: 753.60, havai_slim: 594.41, himalaia: 516.01, olimpia: 652.86, diamante: 702.63, jaguar: 1118.14, roma: 1610.43, lisboa: 1693.29 },
    { dim: 'p/ box 1,38m', maceio: 938.11, cincinatti: 693.40, rio: 693.40, havai: 1046.66, havai_slim: 825.57, himalaia: 716.68, olimpia: 816.08, diamante: 975.88, jaguar: 1552.97, roma: 2236.71, lisboa: 2351.79 },
    { dim: 'p/ box 1,58m', maceio: 1125.73, cincinatti: 832.08, rio: 832.08, havai: 1255.99, havai_slim: 990.69, himalaia: 860.02, olimpia: 816.06, diamante: 1171.06, jaguar: 1863.56, roma: 2684.06, lisboa: 2822.15 },
    { dim: 'p/ box 1,93m', maceio: 1266.45, cincinatti: 936.09, rio: 936.09, havai: 1412.99, havai_slim: 1114.52, himalaia: 967.52, olimpia: 979.30, diamante: 1317.44, jaguar: 2096.51, roma: 3019.56, lisboa: 3174.92 },
    { dim: 'p/ box acima 2,05m', maceio: 1332.12, cincinatti: 984.63, rio: 984.63, havai: 1486.26, havai_slim: 1172.31, himalaia: 1017.69, olimpia: 0, diamante: 1385.75, jaguar: 2205.22, roma: 3176.13, lisboa: 3339.55 },
  ]
  tabelasMatriz.cabeceiras_relax = dimCabecRelax.map(r => {
    addItem(`Cabeceira Relax Maceió - ${r.dim}`, 'Cabeceiras Relax', r.maceio)
    addItem(`Cabeceira Relax Cincinatti - ${r.dim}`, 'Cabeceiras Relax', r.cincinatti)
    addItem(`Cabeceira Relax Rio - ${r.dim}`, 'Cabeceiras Relax', r.rio)
    addItem(`Cabeceira Relax Havaí - ${r.dim}`, 'Cabeceiras Relax', r.havai)
    addItem(`Cabeceira Relax Havaí Slim - ${r.dim}`, 'Cabeceiras Relax', r.havai_slim)
    addItem(`Cabeceira Relax Himalaia - ${r.dim}`, 'Cabeceiras Relax', r.himalaia)
    addItem(`Cabeceira Relax Diamante - ${r.dim}`, 'Cabeceiras Relax', r.diamante)
    addItem(`Cabeceira Relax Gran Jaguar - ${r.dim}`, 'Cabeceiras Relax', r.jaguar)
    addItem(`Cabeceira Relax Roma - ${r.dim}`, 'Cabeceiras Relax', r.roma)
    addItem(`Cabeceira Relax Lisboa - ${r.dim}`, 'Cabeceiras Relax', r.lisboa)
    return r
  })

  // ── 7. LINHA DE CAMAS (Página 5) ────────────────────────────────────────────
  const dimCamas = [
    { dim: '0,88 X 1,88', c_jaguar: 4698.98, c_roma: 4352.12, c_lisboa: 4041.07, s_jaguar: 3978.51, s_roma: 3629.69, s_lisboa: 3346.89 },
    { dim: '1,19 X 1,88', c_jaguar: 4833.23, c_roma: 4476.46, c_lisboa: 4156.52, s_jaguar: 4092.18, s_roma: 3733.40, s_lisboa: 3442.52 },
    { dim: '1,38 X 1,88', c_jaguar: 6712.83, c_roma: 6217.32, c_lisboa: 5772.96, s_jaguar: 5683.59, s_roma: 5185.28, s_lisboa: 4781.28 },
    { dim: '1,58 X 1,98', c_jaguar: 8055.42, c_roma: 7460.80, c_lisboa: 6927.57, s_jaguar: 6820.33, s_roma: 6222.35, s_lisboa: 5737.55 },
    { dim: '1,93 X 2,03', c_jaguar: 9062.36, c_roma: 8393.41, c_lisboa: 7793.52, s_jaguar: 7672.88, s_roma: 7000.15, s_lisboa: 6454.75 },
    { dim: 'ac. 1,93 x ac. 2,03m', c_jaguar: 9532.23, c_roma: 8828.61, c_lisboa: 8197.61, s_jaguar: 8070.71, s_roma: 7363.11, s_lisboa: 6789.43 },
  ]
  tabelasMatriz.camas = dimCamas.map(r => {
    addItem(`Cama Completa Gran Jaguar (Cabeceira+Cama+Base) - ${r.dim}`, 'Camas', r.c_jaguar)
    addItem(`Cama Completa Roma (Cabeceira+Cama+Base) - ${r.dim}`, 'Camas', r.c_roma)
    addItem(`Cama Completa Lisboa (Cabeceira+Cama+Base) - ${r.dim}`, 'Camas', r.c_lisboa)
    addItem(`Cama Base Gran Jaguar (Cama+Base) - ${r.dim}`, 'Camas', r.s_jaguar)
    addItem(`Cama Base Roma (Cama+Base) - ${r.dim}`, 'Camas', r.s_roma)
    addItem(`Cama Base Lisboa (Cama+Base) - ${r.dim}`, 'Camas', r.s_lisboa)
    return r
  })

  // ── 8. COLCHONETES E MANTAS (Página 6) ──────────────────────────────────────
  addItem('Colchão Baby (12 cm) até 0,87 x 1,50m', 'Colchonetes e Mantas', 1169.82)
  const dimColchonetes = [
    { dim: '0,78 ou 0,88 x 1,88m', colchonete: 2799.00, manta_perf: 1696.36, manta_conf: 841.14 },
    { dim: '1,19 x 1,88m', colchonete: 3358.80, manta_perf: 2035.63, manta_conf: 1009.36 },
    { dim: '1,28 ou 1,38 x 1,88m', colchonete: 4665.00, manta_perf: 2827.27, manta_conf: 1401.90 },
    { dim: '1,58 x 1,98m', colchonete: 5598.00, manta_perf: 3392.72, manta_conf: 1725.00 },
    { dim: '1,93 x 2,03m', colchonete: 6297.75, manta_perf: 3816.83, manta_conf: 2242.51 },
    { dim: 'acima 1,93 x acima 2,03m', colchonete: 6764.24, manta_perf: 4099.54, manta_conf: 2758.26 },
  ]
  dimColchonetes.forEach(r => {
    addItem(`Colchonete (12 cm) - ${r.dim}`, 'Colchonetes e Mantas', r.colchonete)
    addItem(`Manta Perfilada (3 cm) - ${r.dim}`, 'Colchonetes e Mantas', r.manta_perf)
    addItem(`Manta de Conforto (3 cm) - ${r.dim}`, 'Colchonetes e Mantas', r.manta_conf)
  })

  // Manta Quântica
  addItem('Manta Quântica - 0,88 x 1,88m', 'Colchonetes e Mantas', 1481.17)
  addItem('Manta Quântica - 1,38 x 1,88m', 'Colchonetes e Mantas', 2117.27)
  addItem('Manta Quântica - 1,58 x 1,98m', 'Colchonetes e Mantas', 2540.71)
  addItem('Manta Quântica - 1,93 x 2,03m', 'Colchonetes e Mantas', 2858.31)

  // Bicamas (Página 6)
  addItem('Bicama C/ Cama Auxiliar Elevada (23+20cm) - 0,88 x 1,98m', 'Bicamas', 6554.50)
  addItem('Bicama C/ Baú (20 e 16cm) - 0,90 x 2,00m', 'Bicamas', 9208.31)
  addItem('Bicama S/ Baú (20 e 16cm) - 0,90 x 2,00m', 'Bicamas', 7827.07)
  addItem('Bicama C/ Baú (20 e 16cm) - 1,19 x 2,00m', 'Bicamas', 10128.85)
  addItem('Bicama S/ Baú (20 e 16cm) - 1,19 x 2,00m', 'Bicamas', 8609.52)

  // ── 9. CONJUNTOS ARTICULADOS (Páginas 7 e 8) ────────────────────────────────
  const dimArticulados = [
    { dim: '0,80 X 2,00m', com_jaguar: 19731.64, com_roma: 17898.44, com_lisboa: 15595.04, sem_jaguar: 18856.18, sem_roma: 16982.96, sem_lisboa: 14735.26 },
    { dim: '0,90 x 2,00m', com_jaguar: 20688.45, com_roma: 18766.35, com_lisboa: 16351.26, sem_jaguar: 19815.73, sem_roma: 17847.19, sem_lisboa: 15485.11 },
    { dim: '1,19 x 2,00m', com_jaguar: 27624.87, com_roma: 25058.30, com_lisboa: 21833.49, sem_jaguar: 26572.30, sem_roma: 23932.55, sem_lisboa: 20765.07 },
    { dim: '1,40 x 2,00m', com_jaguar: 35518.06, com_roma: 32218.18, com_lisboa: 28071.94, sem_jaguar: 34288.43, sem_roma: 30882.14, sem_lisboa: 26794.88 },
    { dim: '1,60 x 2,00m', com_jaguar: 39463.32, com_roma: 37157.11, com_lisboa: 31196.99, sem_jaguar: 38049.23, sem_roma: 34277.60, sem_lisboa: 29659.50 },
    { dim: '1,80 x 2,00m', com_jaguar: 41436.89, com_roma: 37587.11, com_lisboa: 32749.93, sem_jaguar: 39758.22, sem_roma: 35808.55, sem_lisboa: 31069.28 },
    { dim: '2,00 x 2,00m', com_jaguar: 43409.52, com_roma: 39376.47, com_lisboa: 34309.01, sem_jaguar: 41643.30, sem_roma: 37506.36, sem_lisboa: 32542.39 },
    { dim: 'ac. 2,00 x ac. 2,00m', com_jaguar: 45382.12, com_roma: 41165.80, com_lisboa: 35868.07, sem_jaguar: 43621.56, sem_roma: 39288.09, sem_lisboa: 34088.30 },
  ]
  dimArticulados.forEach(r => {
    addItem(`Articulado C/ Cabeceira Gran Jaguar - ${r.dim}`, 'Camas Articuladas', r.com_jaguar)
    addItem(`Articulado C/ Cabeceira Roma - ${r.dim}`, 'Camas Articuladas', r.com_roma)
    addItem(`Articulado C/ Cabeceira Lisboa - ${r.dim}`, 'Camas Articuladas', r.com_lisboa)
    addItem(`Articulado S/ Cabeceira Gran Jaguar - ${r.dim}`, 'Camas Articuladas', r.sem_jaguar)
    addItem(`Articulado S/ Cabeceira Roma - ${r.dim}`, 'Camas Articuladas', r.sem_roma)
    addItem(`Articulado S/ Cabeceira Lisboa - ${r.dim}`, 'Camas Articuladas', r.sem_lisboa)
  })

  // ── 10. CADEIRAS, POLTRONAS, PUFFS, TRAVESSEIROS (Página 9) ────────────────
  addItem('Cadeira Presidente C/ Vibro e Quântica', 'Cadeiras', 10155.77)
  addItem('Cadeira Diretor', 'Cadeiras', 4840.48)
  addItem('Cadeira Secretária', 'Cadeiras', 3166.18)
  addItem('Poltrona', 'Poltronas', 8742.18)
  addItem('Poltrona C/ Massagem e Quântica', 'Poltronas', 11613.55)
  addItem('Poltrona Reclinável C/ Vibro e Quântica', 'Poltronas', 13911.29)
  addItem('Puff Pequeno', 'Puffs e Peseiras', 585.36)
  addItem('Puff Médio', 'Puffs e Peseiras', 881.89)
  addItem('Puff Grande', 'Puffs e Peseiras', 1093.06)
  addItem('Baú P/ Peseira', 'Puffs e Peseiras', 2318.60)
  addItem('Travesseiro Viscoelástico Laminado', 'Travesseiros', 410.66)
  addItem('Travesseiro Soft', 'Travesseiros', 335.77)
  addItem('Travesseiro Corpo - Hugging', 'Travesseiros', 478.68)
  addItem('Almofada de Viagem', 'Travesseiros', 136.67)
  addItem('Suporte Multicomforto Simples', 'Travesseiros', 410.20)
  addItem('Suporte Multiconforto Premium C/ Vibro e Quântica', 'Travesseiros', 1124.04)
  addItem('Encosto Drive', 'Encostos', 459.92)
  addItem('Encosto Drive C/ Massagem e Quântica', 'Encostos', 2146.96)
  addItem('Encosto Office', 'Encostos', 311.48)

  // ── 11. LINHA TÊXTIL (Página 10) ───────────────────────────────────────────
  const textis = [
    { t: 'Solteiro 0,88m', malha: 306.86, percal: 507.25, l_malha: 131.98, l_percal: 250.44, prot: 157.10 },
    { t: 'Solteiro 1,19m', malha: 306.86, percal: 507.25, l_malha: 131.98, l_percal: 250.44, prot: 0 },
    { t: 'Casal 1,38m', malha: 409.82, percal: 677.46, l_malha: 167.44, l_percal: 334.47, prot: 202.38 },
    { t: 'Queen 1,58m', malha: 458.91, percal: 758.61, l_malha: 184.89, l_percal: 374.53, prot: 228.63 },
    { t: 'King 1,93m', malha: 513.52, percal: 1012.75, l_malha: 208.20, l_percal: 419.10, prot: 271.65 },
  ]
  textis.forEach(r => {
    addItem(`Jogo de Lençol Malha - ${r.t}`, 'Linha Têxtil', r.malha)
    addItem(`Jogo de Lençol Percal Acetinado - ${r.t}`, 'Linha Têxtil', r.percal)
    addItem(`Lençol Avulso Malha - ${r.t}`, 'Linha Têxtil', r.l_malha)
    addItem(`Lençol Avulso Percal Acetinado - ${r.t}`, 'Linha Têxtil', r.l_percal)
    if (r.prot > 0) addItem(`Capa Protetor Impermeável - ${r.t}`, 'Linha Têxtil', r.prot)
  })

  // Edredons
  addItem('Edredom Malha Casal 1,38m', 'Linha Têxtil', 531.03)
  addItem('Edredom Percal Acetinado Casal 1,38m', 'Linha Têxtil', 1006.90)
  addItem('Coberdrom Plush Casal 1,38m', 'Linha Têxtil', 733.17)
  addItem('Manta Microfibra Casal 1,38m', 'Linha Têxtil', 178.13)
  addItem('Kit Colcha Casal 1,38m', 'Linha Têxtil', 484.25)
  addItem('Kit Colcha c/ Almofadas Casal 1,38m', 'Linha Têxtil', 800.40)

  // Fronhas e Almofadas
  addItem('Fronha Malha Adulto (0,70 x 0,50m)', 'Linha Têxtil', 34.69)
  addItem('Fronha Percal Classic Adulto (0,70 x 0,50m)', 'Linha Têxtil', 33.80)
  addItem('Capa Protetora Adulto (0,70 x 0,50m)', 'Linha Têxtil', 50.53)
  addItem('Almofada Avulsa (0,30 x 0,50m)', 'Linha Têxtil', 103.60)
  addItem('Almofada Versatile (0,30 x 0,50m)', 'Linha Têxtil', 54.45)

  // ── 12. ACESSÓRIOS, CALÇADOS, PET, BANHO E VESTUÁRIO (Página 11) ───────────
  addItem('Chinelo Feminino', 'Calçados', 120.81)
  addItem('Chinelo Masculino', 'Calçados', 131.55)
  addItem('Tênis FN1', 'Calçados', 532.00)
  addItem('Palmilha Magnética', 'Calçados', 103.91)
  addItem('Cinta Lombar (P, M, G, GG, EXG)', 'Acessórios', 323.05)
  addItem('Colar de Magnetos (P, M, G, GG)', 'Acessórios', 204.65)
  addItem('Adesivo de Magneto', 'Acessórios', 113.46)
  addItem('Imantador de Água', 'Acessórios', 94.20)
  addItem('Máscara para Dormir', 'Acessórios', 240.42)
  addItem('Pulseira Health 7', 'Acessórios', 348.83)
  addItem('Almofada Suporte', 'Acessórios', 110.45)
  addItem('Colchãozinho Fitness', 'Acessórios', 108.99)
  addItem('Colchãozinho Equilibrium', 'Acessórios', 261.40)
  addItem('Colchãozinho Nômade', 'Acessórios', 547.90)
  addItem('Garrafa Eko7', 'Acessórios', 587.00)

  // Dreams Pet
  addItem('Caminha Dreams Pet Plus - P (57 x 53cm)', 'Pet', 207.60)
  addItem('Caminha Dreams Pet Plus - M (82 x 71cm)', 'Pet', 342.41)
  addItem('Caminha Dreams Pet Plus - G (100 x 86cm)', 'Pet', 431.80)
  addItem('Caminha Dreams Pet Slim - P (57 x 53cm)', 'Pet', 147.94)
  addItem('Caminha Dreams Pet Slim - M (82 x 71cm)', 'Pet', 244.00)
  addItem('Caminha Dreams Pet Slim - G (100 x 86cm)', 'Pet', 359.34)
  addItem('Caminha Dreams Pet Puff - P', 'Pet', 131.73)
  addItem('Caminha Dreams Pet Puff - M', 'Pet', 219.13)

  // Banho
  addItem('Jogo de Toalhas (500 g/m²)', 'Banho', 520.54)
  addItem('Jogo de Toalhas (800 g/m²)', 'Banho', 683.08)
  addItem('Toalha Banho (500 g/m²)', 'Banho', 172.48)
  addItem('Toalha Banho (800 g/m²)', 'Banho', 235.43)
  addItem('Toalha Rosto (500 g/m²)', 'Banho', 83.74)
  addItem('Toalha Rosto (800 g/m²)', 'Banho', 102.26)
  addItem('Tapete Banho (500 g/m²)', 'Banho', 79.46)
  addItem('Tapete Banho (800 g/m²)', 'Banho', 94.75)
  addItem('Roupão Microfibra (360 g/m²)', 'Banho', 340.43)
  addItem('Roupão Plush', 'Banho', 148.98)

  // Vestuário e Lingerie
  addItem('Legging Feminina', 'Vestuário', 307.39)
  addItem('Bermuda Feminina', 'Vestuário', 134.97)
  addItem('Shorts Feminino', 'Vestuário', 185.24)
  addItem('Regata Feminina', 'Vestuário', 86.40)
  addItem('Top Tradicional Feminino', 'Vestuário', 112.87)
  addItem('Bermuda Masculina', 'Vestuário', 206.67)
  addItem('Regata Masculina', 'Vestuário', 146.00)
  addItem('Blusa Masculina c/ Manga', 'Vestuário', 186.26)
  addItem('Calcinha Eko7', 'Lingerie', 113.66)
  addItem('Sutiã Eko7', 'Lingerie', 231.88)

  return {
    versao,
    titulo,
    regras_comerciais: {
      desconto_5x_percentual: 5,
      desconto_a_vista_composto: [5, 5],
      observacoes: [
        'Desconto de -5% para pagamento em até 5x',
        'Desconto de -5% -5% para pagamento à vista (aprox. 9,75%)',
        'Válido para todas as empresas do grupo',
      ],
    },
    tabelas_matriz: tabelasMatriz,
    items_planos: itemsPlanos,
  }
}
