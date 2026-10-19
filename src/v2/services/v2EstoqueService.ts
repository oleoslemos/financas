import { supabase } from '../../lib/supabaseClient'
import { listV2Products, V2Product } from './v2ProdutosService'
import { registrarAuditoria } from './v2AuditoriaService'

export type TipoMovimentacaoEstoque = 'entrada' | 'saida' | 'reserva' | 'liberacao' | 'ajuste'

export type MotivoAjusteManual = 'Contagem' | 'Perda' | 'Avaria' | 'Devolução' | 'Outro'

export interface MovimentacaoEstoqueV2 {
  id: string
  produto_id: string
  produto_nome: string
  tipo: TipoMovimentacaoEstoque
  quantidade: number // positivo para entrada/liberação, negativo para saída/reserva
  origem: string // Ex: "Venda #20261015005", "Compra PC-20261010002", "Avaria · costura aberta"
  data: string // Ex: "18/10 09:12" ou YYYY-MM-DD
  usuario: string
  motivo?: MotivoAjusteManual | string
  observacao?: string
  custo_unitario?: number | null
  referencia?: string
  created_at: string
}

export interface ReservaEstoqueAtiva {
  venda_id: string
  venda_numero: string
  cliente_nome: string
  data_aprovacao: string
  quantidade: number
  status: string
}

export interface ItemEstoquePosicao {
  produto_id: string
  produto_nome: string
  codigo_sku: string
  categoria: string
  fisico: number
  reservado: number
  disponivel: number // Fisico - Reservado
  minimo: number
  situacao: 'ok' | 'abaixo_minimo' | 'zerado'
  unidade: string
  preco_medio: number
  ultimo_preco_compra: number
  data_ultima_compra: string
  reservas_ativas: ReservaEstoqueAtiva[]
  ultimas_movimentacoes: MovimentacaoEstoqueV2[]
}

const KEY_MOVIMENTACOES = 'v2_estoque_movimentacoes_v2'
const KEY_MINIMOS = 'v2_estoque_minimos'
const SUPABASE_MOVIMENTACOES = 'v2_estoque_movimentacoes'
const SUPABASE_MINIMOS = 'v2_estoque_minimos'

const SEED_MOVIMENTACOES: MovimentacaoEstoqueV2[] = [
  {
    id: 'mov-001',
    produto_id: 'colchao-leg-001',
    produto_nome: 'Legging feminina preta Emana [M]',
    tipo: 'reserva',
    quantidade: -1,
    origem: 'Venda #20261015005',
    data: '18/10 09:12',
    usuario: 'Leonardo',
    created_at: '2026-10-18T09:12:00Z',
  },
  {
    id: 'mov-002',
    produto_id: 'top-fitness-002',
    produto_nome: 'Top fitness Emana [P]',
    tipo: 'reserva',
    quantidade: -2,
    origem: 'Venda #20261015005',
    data: '16/10 14:20',
    usuario: 'Leonardo',
    created_at: '2026-10-16T14:20:00Z',
  },
  {
    id: 'mov-003',
    produto_id: 'colchao-leg-001',
    produto_nome: 'Legging feminina preta Emana [M]',
    tipo: 'entrada',
    quantidade: 3,
    origem: 'Compra PC-20261010002',
    data: '13/10 09:40',
    usuario: 'Leonardo',
    custo_unitario: 112.0,
    created_at: '2026-10-13T09:40:00Z',
  },
  {
    id: 'mov-004',
    produto_id: 'renova-003',
    produto_nome: 'RENOVA [1,38 X 1,88 X 0,20M] [QUÂNTICA + VIBRO]',
    tipo: 'entrada',
    quantidade: 1,
    origem: 'Compra PC-20261010002',
    data: '13/10 09:40',
    usuario: 'Leonardo',
    custo_unitario: 244.34,
    created_at: '2026-10-13T09:40:00Z',
  },
  {
    id: 'mov-005',
    produto_id: 'top-fitness-002',
    produto_nome: 'Top fitness Emana [P]',
    tipo: 'ajuste',
    quantidade: -1,
    origem: 'Avaria · costura aberta',
    motivo: 'Avaria',
    observacao: 'peça com costura aberta, separada para troca',
    data: '12/10 17:30',
    usuario: 'Carla',
    created_at: '2026-10-12T17:30:00Z',
  },
  {
    id: 'mov-006',
    produto_id: 'top-fitness-002',
    produto_nome: 'Top fitness Emana [P]',
    tipo: 'liberacao',
    quantidade: 1,
    origem: 'Venda #20261008004 recusada',
    data: '10/10 11:05',
    usuario: 'Leonardo',
    created_at: '2026-10-10T11:05:00Z',
  },
  {
    id: 'mov-007',
    produto_id: 'colchao-leg-001',
    produto_nome: 'Legging feminina preta Emana [M]',
    tipo: 'saida',
    quantidade: -1,
    origem: 'Entrega venda #20261008002',
    data: '09/10 16:05',
    usuario: 'Leonardo',
    created_at: '2026-10-09T16:05:00Z',
  },
  {
    id: 'mov-008',
    produto_id: 'top-fitness-002',
    produto_nome: 'Top fitness Emana [P]',
    tipo: 'entrada',
    quantidade: 4,
    origem: 'Compra PC-20261003001',
    data: '08/10 10:15',
    usuario: 'Carla',
    custo_unitario: 95.0,
    created_at: '2026-10-08T10:15:00Z',
  },
]

export async function listMovimentacoesEstoque(): Promise<MovimentacaoEstoqueV2[]> {
  let list: MovimentacaoEstoqueV2[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_MOVIMENTACOES)
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data && data.length > 0) {
        list = data.map((d: any) => ({
          id: d.id,
          produto_id: d.produto_id,
          produto_nome: d.produto_nome,
          tipo: (d.tipo as TipoMovimentacaoEstoque) || 'entrada',
          quantidade: Number(d.quantidade || 0),
          origem: d.origem || d.referencia || 'Sistema',
          data: d.data || new Date(d.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          usuario: d.usuario_nome || 'Leonardo',
          motivo: d.motivo,
          observacao: d.observacao,
          custo_unitario: d.custo_unitario ? Number(d.custo_unitario) : null,
          referencia: d.referencia,
          created_at: d.created_at,
        }))
        return list
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(KEY_MOVIMENTACOES)
    if (raw) list = JSON.parse(raw)
  } catch {}

  if (list.length === 0) {
    list = SEED_MOVIMENTACOES
    try {
      localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(list))
    } catch {}
  }

  return list
}

export async function listEstoqueMinimos(): Promise<Record<string, number>> {
  let map: Record<string, number> = {
    'colchao-leg-001': 2,
    'top-fitness-002': 3,
    'renova-003': 2,
    'renova-001': 1,
    'renova-002': 1,
    'seven-006': 1,
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_MINIMOS).select('*')
      if (!error && data) {
        data.forEach((row: any) => {
          map[row.produto_id] = Number(row.estoque_minimo || 0)
        })
        return map
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(KEY_MINIMOS)
    if (raw) map = { ...map, ...JSON.parse(raw) }
  } catch {}

  return map
}

export async function salvarEstoqueMinimo(produtoId: string, minimo: number): Promise<void> {
  const current = await listEstoqueMinimos()
  current[produtoId] = minimo

  try {
    localStorage.setItem(KEY_MINIMOS, JSON.stringify(current))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MINIMOS).upsert({
        produto_id: produtoId,
        estoque_minimo: minimo,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }
}

export async function listEstoquePosicoes(): Promise<ItemEstoquePosicao[]> {
  const [produtos, movs, minimos] = await Promise.all([
    listV2Products(),
    listMovimentacoesEstoque(),
    listEstoqueMinimos(),
  ])

  // Lista base inicial com os produtos cadastrados e produtos de destaque da V2
  const produtosMap = new Map<string, V2Product>()
  produtos.forEach((p) => produtosMap.set(p.id, p))

  // Garantir produtos da tela de amostra se não estiverem na lista
  const amostraProdutos: V2Product[] = [
    {
      id: 'colchao-leg-001',
      code_sku: 'LEG-001',
      name: 'Legging feminina preta Emana [M]',
      type: 'SIMPLES',
      category: 'Vestuário',
      product_line: 'Emana',
      unit: 'un',
      cost_price: 108.4,
      sale_price: 240.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'top-fitness-002',
      code_sku: 'TOP-002',
      name: 'Top fitness Emana [P]',
      type: 'SIMPLES',
      category: 'Vestuário',
      product_line: 'Emana',
      unit: 'un',
      cost_price: 95.0,
      sale_price: 180.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'renova-003',
      code_sku: 'EKO-PRD-003',
      name: 'RENOVA [1,38 X 1,88 X 0,20M] [QUÂNTICA + VIBRO]',
      type: 'SIMPLES',
      category: 'Colchões',
      product_line: 'Renova',
      unit: 'un',
      cost_price: 244.34,
      sale_price: 1890.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'renova-001',
      code_sku: 'EKO-PRD-001',
      name: 'RENOVA [0,88 X 1,88 X 0,20M] [QUÂNTICA + VIBRO]',
      type: 'SIMPLES',
      category: 'Colchões',
      product_line: 'Renova',
      unit: 'un',
      cost_price: 858.49,
      sale_price: 1650.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'renova-002',
      code_sku: 'EKO-PRD-002',
      name: 'RENOVA [1,19 X 1,88 X 0,20M] [QUÂNTICA + VIBRO]',
      type: 'SIMPLES',
      category: 'Colchões',
      product_line: 'Renova',
      unit: 'un',
      cost_price: 1030.18,
      sale_price: 1750.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'seven-006',
      code_sku: 'EKO-PRD-006',
      name: 'SEVEN [0,88 X 1,88 X 0,30M] [QUÂNTICA + VIBRO]',
      type: 'SIMPLES',
      category: 'Colchões',
      product_line: 'Seven',
      unit: 'un',
      cost_price: 1047.35,
      sale_price: 2100.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'seven-007',
      code_sku: 'EKO-PRD-007',
      name: 'SEVEN [1,19 X 1,88 X 0,30M] [QUÂNTICA + VIBRO]',
      type: 'SIMPLES',
      category: 'Colchões',
      product_line: 'Seven',
      unit: 'un',
      cost_price: 1256.82,
      sale_price: 2450.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'seven-008',
      code_sku: 'EKO-PRD-008',
      name: 'SEVEN [1,38 X 1,88 X 0,30M] [QUÂNTICA + VIBRO]',
      type: 'SIMPLES',
      category: 'Colchões',
      product_line: 'Seven',
      unit: 'un',
      cost_price: 1745.59,
      sale_price: 2890.0,
      active: true,
      created_at: '2026-10-01T00:00:00Z',
    },
  ]

  amostraProdutos.forEach((ap) => {
    if (!produtosMap.has(ap.id)) {
      produtosMap.set(ap.id, ap)
    }
  })

  const todosProdutos = Array.from(produtosMap.values())

  const posicoes: ItemEstoquePosicao[] = todosProdutos.map((p) => {
    const movsP = movs.filter(
      (m) => m.produto_id === p.id || m.produto_nome.toLowerCase() === p.name.toLowerCase()
    )

    // Físico = soma de entradas (+), saídas (-) e ajustes manuais (+/-)
    // Reservas não mexem no físico, apenas no disponível
    const movsFisico = movsP.filter((m) => m.tipo === 'entrada' || m.tipo === 'saida' || m.tipo === 'ajuste')
    const saldoFisicoCalculado = movsFisico.reduce((acc, m) => acc + m.quantidade, 0)
    const fisico = Math.max(0, saldoFisicoCalculado)

    // Reservado = soma de reservas ativas pendentes de entrega
    const totalReservas = movsP.filter((m) => m.tipo === 'reserva').reduce((acc, m) => acc + Math.abs(m.quantidade), 0)
    const totalLiberacoes = movsP.filter((m) => m.tipo === 'liberacao').reduce((acc, m) => acc + m.quantidade, 0)
    const totalEntregas = movsP.filter((m) => m.tipo === 'saida' && m.origem.toLowerCase().includes('entrega')).reduce((acc, m) => acc + Math.abs(m.quantidade), 0)
    const reservado = Math.max(0, totalReservas - totalLiberacoes - totalEntregas)

    // Disponível = Físico - Reservado
    const disponivel = Math.max(0, fisico - reservado)

    const minimo = minimos[p.id] !== undefined ? minimos[p.id] : 0

    // Situação:
    let situacao: 'ok' | 'abaixo_minimo' | 'zerado' = 'zerado'
    if (fisico <= 0 || disponivel <= 0) {
      situacao = 'zerado'
    } else if (minimo > 0 && disponivel < minimo) {
      situacao = 'abaixo_minimo'
    } else {
      situacao = 'ok'
    }

    const entradas = movsP.filter((m) => m.tipo === 'entrada' && m.custo_unitario)
    const precoMedio = entradas.length > 0
      ? entradas.reduce((acc, m) => acc + (m.custo_unitario || 0), 0) / entradas.length
      : p.cost_price || 0
    const ultimoPrecoCompra = entradas[0]?.custo_unitario || p.cost_price || 0
    const dataUltimaCompra = entradas[0]?.data || '13/10'

    // Reservas ativas simuladas/vinculadas
    const reservasAtivas: ReservaEstoqueAtiva[] = []
    if (reservado > 0) {
      reservasAtivas.push({
        venda_id: 'venda-20261015005',
        venda_numero: '#20261015005',
        cliente_nome: 'Maria Aparecida Souza',
        data_aprovacao: '16/10',
        quantidade: reservado,
        status: 'aguardando entrega',
      })
    }

    return {
      produto_id: p.id,
      produto_nome: p.name,
      codigo_sku: p.code_sku || 'EKO-PRD',
      categoria: p.category || p.product_line || 'Outros',
      fisico,
      reservado,
      disponivel,
      minimo,
      situacao,
      unidade: p.unit || 'un',
      preco_medio: precoMedio,
      ultimo_preco_compra: ultimoPrecoCompra,
      data_ultima_compra: dataUltimaCompra,
      reservas_ativas: reservasAtivas,
      ultimas_movimentacoes: movsP.slice(0, 5),
    }
  })

  // Ordenar para que itens com estoque fiquem visíveis primeiro, ou por SKU
  posicoes.sort((a, b) => {
    if (a.fisico !== b.fisico) return b.fisico - a.fisico
    return a.codigo_sku.localeCompare(b.codigo_sku)
  })

  return posicoes
}

export async function registrarAjusteManual(params: {
  produto_id: string
  produto_nome: string
  codigo_sku?: string
  tipoAjuste: 'entrada' | 'saida' | 'contagem'
  quantidade: number
  data?: string
  motivo: MotivoAjusteManual | string
  observacao?: string
  usuario?: string
}): Promise<{ ok: true; novaPosicao: ItemEstoquePosicao } | { ok: false; erro: string }> {
  const movsAtuais = await listMovimentacoesEstoque()
  const posicoes = await listEstoquePosicoes()
  const posAtual = posicoes.find((p) => p.produto_id === params.produto_id)

  const fisicoAtual = posAtual ? posAtual.fisico : 0
  const reservadoAtual = posAtual ? posAtual.reservado : 0
  let diferencaQuantidade = 0
  let tipoMovimentacao: TipoMovimentacaoEstoque = 'ajuste'

  if (params.tipoAjuste === 'entrada') {
    diferencaQuantidade = Math.abs(params.quantidade)
    tipoMovimentacao = 'ajuste'
  } else if (params.tipoAjuste === 'saida') {
    diferencaQuantidade = -Math.abs(params.quantidade)
    tipoMovimentacao = 'ajuste'
  } else if (params.tipoAjuste === 'contagem') {
    diferencaQuantidade = params.quantidade - fisicoAtual
    tipoMovimentacao = 'ajuste'
  }

  const novoFisico = Math.max(0, fisicoAtual + diferencaQuantidade)
  const novoDisponivel = Math.max(0, novoFisico - reservadoAtual)

  const now = new Date()
  const dataFormatada =
    params.data ||
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' +
      now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const usuarioNome = params.usuario || 'Leonardo'

  const novaMov: MovimentacaoEstoqueV2 = {
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    produto_id: params.produto_id,
    produto_nome: params.produto_nome,
    tipo: tipoMovimentacao,
    quantidade: diferencaQuantidade,
    origem: `${params.motivo}${params.observacao ? ` · ${params.observacao}` : ''}`,
    data: dataFormatada,
    usuario: usuarioNome,
    motivo: params.motivo,
    observacao: params.observacao,
    referencia: `Ajuste manual (${params.tipoAjuste})`,
    created_at: now.toISOString(),
  }

  const atualizado = [novaMov, ...movsAtuais]
  try {
    localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MOVIMENTACOES).insert({
        id: novaMov.id,
        produto_id: novaMov.produto_id,
        produto_nome: novaMov.produto_nome,
        tipo: novaMov.tipo,
        quantidade: novaMov.quantidade,
        origem: novaMov.origem,
        data: novaMov.data,
        usuario_nome: novaMov.usuario,
        motivo: novaMov.motivo,
        observacao: novaMov.observacao,
        created_at: novaMov.created_at,
      })
    } catch {}
  }

  // Registrar auditoria do ajuste manual automaticamente
  await registrarAuditoria({
    usuario_nome: usuarioNome,
    area: 'Estoque',
    objeto: `${params.produto_nome} [${params.codigo_sku || 'PRD'}]`,
    o_que_mudou: `Ajuste de ${params.tipoAjuste} ${diferencaQuantidade > 0 ? `+${diferencaQuantidade}` : diferencaQuantidade} · motivo ${params.motivo}`,
    detalhe: {
      acao_titulo: 'Ajuste manual de estoque',
      subtitulo: `${params.produto_nome} (${params.codigo_sku || ''})`,
      mudancas: [
        { campo: 'Físico', antes: `${fisicoAtual}`, depois: `${novoFisico}` },
        { campo: 'Disponível', antes: `${posAtual?.disponivel ?? 0}`, depois: `${novoDisponivel}` },
        { campo: 'Motivo', antes: '—', depois: `${params.motivo}` },
      ],
      campos_extras: [
        { label: 'Usuário', valor: usuarioNome },
        { label: 'Data e hora', valor: dataFormatada },
        { label: 'Observação', valor: params.observacao || '—' },
      ],
      link_objeto: '/v2/estoque',
    },
  })

  const posicoesAtualizadas = await listEstoquePosicoes()
  const posRecalculada = posicoesAtualizadas.find((p) => p.produto_id === params.produto_id)!

  return { ok: true, novaPosicao: posRecalculada }
}

export async function reservarEstoqueVenda(params: {
  venda_id: string
  venda_numero: string
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number }>
  usuario?: string
}): Promise<void> {
  const movsAtuais = await listMovimentacoesEstoque()
  const now = new Date()
  const dataFormatada =
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'reserva',
    quantidade: -Math.abs(item.quantidade),
    origem: `Venda ${params.venda_numero}`,
    data: dataFormatada,
    usuario: params.usuario || 'Sistema',
    referencia: params.venda_numero,
    created_at: now.toISOString(),
  }))

  const atualizado = [...novasMovs, ...movsAtuais]
  try {
    localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MOVIMENTACOES).insert(
        novasMovs.map((m) => ({
          id: m.id,
          produto_id: m.produto_id,
          produto_nome: m.produto_nome,
          tipo: m.tipo,
          quantidade: m.quantidade,
          origem: m.origem,
          data: m.data,
          usuario_nome: m.usuario,
          created_at: m.created_at,
        }))
      )
    } catch {}
  }
}

export async function liberarEstoqueVenda(params: {
  venda_id: string
  venda_numero: string
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number }>
  motivo?: string
  usuario?: string
}): Promise<void> {
  const movsAtuais = await listMovimentacoesEstoque()
  const now = new Date()
  const dataFormatada =
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'liberacao',
    quantidade: Math.abs(item.quantidade),
    origem: `Venda ${params.venda_numero} ${params.motivo || 'cancelada'}`,
    data: dataFormatada,
    usuario: params.usuario || 'Sistema',
    referencia: params.venda_numero,
    created_at: now.toISOString(),
  }))

  const atualizado = [...novasMovs, ...movsAtuais]
  try {
    localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MOVIMENTACOES).insert(
        novasMovs.map((m) => ({
          id: m.id,
          produto_id: m.produto_id,
          produto_nome: m.produto_nome,
          tipo: m.tipo,
          quantidade: m.quantidade,
          origem: m.origem,
          data: m.data,
          usuario_nome: m.usuario,
          created_at: m.created_at,
        }))
      )
    } catch {}
  }
}

export async function baixarFisicoEntregaVenda(params: {
  venda_id: string
  venda_numero: string
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number }>
  usuario?: string
}): Promise<void> {
  const movsAtuais = await listMovimentacoesEstoque()
  const now = new Date()
  const dataFormatada =
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'saida',
    quantidade: -Math.abs(item.quantidade),
    origem: `Entrega venda ${params.venda_numero}`,
    data: dataFormatada,
    usuario: params.usuario || 'Sistema',
    referencia: params.venda_numero,
    created_at: now.toISOString(),
  }))

  const atualizado = [...novasMovs, ...movsAtuais]
  try {
    localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MOVIMENTACOES).insert(
        novasMovs.map((m) => ({
          id: m.id,
          produto_id: m.produto_id,
          produto_nome: m.produto_nome,
          tipo: m.tipo,
          quantidade: m.quantidade,
          origem: m.origem,
          data: m.data,
          usuario_nome: m.usuario,
          created_at: m.created_at,
        }))
      )
    } catch {}
  }
}

export async function registrarEntradaCompra(params: {
  pedidoId: string
  pedidoNumero: number | string
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number; preco_unitario: number }>
  usuario?: string
}): Promise<void> {
  const movsAtuais = await listMovimentacoesEstoque()
  const now = new Date()
  const dataFormatada =
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'entrada',
    quantidade: Math.abs(item.quantidade),
    origem: `Compra PC-${params.pedidoNumero}`,
    referencia: `Pedido #${params.pedidoNumero}`,
    data: dataFormatada,
    usuario: params.usuario || 'Leonardo',
    custo_unitario: item.preco_unitario,
    created_at: now.toISOString(),
  }))

  const atualizado = [...novasMovs, ...movsAtuais]
  try {
    localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MOVIMENTACOES).insert(
        novasMovs.map((m) => ({
          id: m.id,
          produto_id: m.produto_id,
          produto_nome: m.produto_nome,
          tipo: m.tipo,
          quantidade: m.quantidade,
          origem: m.origem,
          data: m.data,
          usuario_nome: m.usuario,
          custo_unitario: m.custo_unitario,
          created_at: m.created_at,
        }))
      )
    } catch {}
  }
}

export async function getSaldoProduto(produtoId: string): Promise<number> {
  const posicoes: ItemEstoquePosicao[] = await listEstoquePosicoes()
  const p = posicoes.find((item: ItemEstoquePosicao) => item.produto_id === produtoId)
  return p ? p.disponivel : 0
}

export async function validarConsumoEstoque(
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number }>
): Promise<{ ok: true } | { ok: false; erro: string }> {
  for (const item of itens) {
    const saldo = await getSaldoProduto(item.produto_id)
    if (saldo < item.quantidade) {
      return {
        ok: false,
        erro: `Não é possível desfazer o recebimento: o item "${item.produto_nome}" já foi consumido do estoque. Saldo disponível em estoque: ${saldo} un (necessário: ${item.quantidade} un).`,
      }
    }
  }
  return { ok: true }
}

export async function desfazerEntradaCompra(params: {
  pedidoId: string
  pedidoNumero: number | string
  itens: Array<{ produto_id: string; produto_nome: string; quantidade: number; preco_unitario: number }>
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const movsAtuais = await listMovimentacoesEstoque()
  const now = new Date()
  const dataFormatada =
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const novasMovs: MovimentacaoEstoqueV2[] = params.itens.map((item) => ({
    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    tipo: 'saida',
    quantidade: -Math.abs(item.quantidade),
    origem: `Estorno Pedido #${params.pedidoNumero}`,
    referencia: `Estorno Pedido #${params.pedidoNumero}`,
    data: dataFormatada,
    usuario: 'Leonardo',
    custo_unitario: item.preco_unitario,
    created_at: now.toISOString(),
  }))

  const atualizado = [...novasMovs, ...movsAtuais]
  try {
    localStorage.setItem(KEY_MOVIMENTACOES, JSON.stringify(atualizado))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_MOVIMENTACOES).insert(
        novasMovs.map((m) => ({
          id: m.id,
          produto_id: m.produto_id,
          produto_nome: m.produto_nome,
          tipo: m.tipo,
          quantidade: m.quantidade,
          origem: m.origem,
          data: m.data,
          usuario_nome: m.usuario,
          custo_unitario: m.custo_unitario,
          created_at: m.created_at,
        }))
      )
    } catch {}
  }

  return { ok: true }
}

