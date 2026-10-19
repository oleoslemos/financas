import { supabase } from '../../lib/supabaseClient'

export type AuditoriaArea = 'Venda' | 'Desconto' | 'Estoque' | 'Financeiro' | 'Permissão' | 'Sistema'

export interface AuditoriaMudancaCampo {
  campo: string
  antes: string
  depois: string
}

export interface AuditoriaCampoExtra {
  label: string
  valor: string
}

export interface AuditoriaDetalhe {
  acao_titulo: string
  subtitulo: string
  mudancas: AuditoriaMudancaCampo[]
  campos_extras?: AuditoriaCampoExtra[]
  link_objeto?: string
}

export interface AuditoriaRegistro {
  id: string // ex: '#A-000417'
  data_hora: string
  usuario_nome: string
  area: AuditoriaArea
  objeto: string
  o_que_mudou: string
  detalhe?: AuditoriaDetalhe
  created_at: string
}

const STORAGE_KEY = 'v2_auditoria_historico'
const SUPABASE_TABLE = 'v2_auditoria'

const SEED_AUDITORIA: AuditoriaRegistro[] = [
  {
    id: '#A-000418',
    data_hora: '18/10 15:48',
    usuario_nome: 'Leonardo',
    area: 'Venda',
    objeto: '#20261015005',
    o_que_mudou: 'Assinatura do cliente registrada',
    detalhe: {
      acao_titulo: 'Assinatura do cliente registrada',
      subtitulo: 'Venda #20261015005 · Maria Aparecida Souza',
      mudancas: [
        { campo: 'Status da assinatura', antes: 'Pendente', depois: 'Registrada' },
        { campo: 'Documento assinado', antes: '—', depois: 'Aceite digital coletado em tela' },
      ],
      campos_extras: [
        { label: 'Usuário', valor: 'Leonardo' },
        { label: 'Data e hora', valor: '18/10/2026 15:48' },
        { label: 'Origem', valor: 'Vendas · Assinatura na tela' },
      ],
      link_objeto: '/v2/propostas-vendas',
    },
    created_at: '2026-10-18T15:48:00Z',
  },
  {
    id: '#A-000417',
    data_hora: '18/10 14:02',
    usuario_nome: 'Maria',
    area: 'Desconto',
    objeto: '#20261015006',
    o_que_mudou: 'Desconto de 12% acima do limite (10%) · liberado por Leonardo',
    detalhe: {
      acao_titulo: 'Desconto acima do limite aprovado',
      subtitulo: 'Proposta #20261015006',
      mudancas: [
        { campo: 'Desconto aplicado', antes: '10%', depois: '12%' },
        { campo: 'Autorização', antes: 'Pendente', depois: 'Liberado por Leonardo' },
      ],
      campos_extras: [
        { label: 'Vendedor', valor: 'Maria' },
        { label: 'Aprovador', valor: 'Leonardo' },
        { label: 'Data e hora', valor: '18/10/2026 14:02' },
      ],
      link_objeto: '/v2/propostas-vendas',
    },
    created_at: '2026-10-18T14:02:00Z',
  },
  {
    id: '#A-000416',
    data_hora: '17/10 17:30',
    usuario_nome: 'Maria',
    area: 'Estoque',
    objeto: 'Top fitness Emana [P]',
    o_que_mudou: 'Ajuste de saída -1 · motivo Avaria',
    detalhe: {
      acao_titulo: 'Ajuste manual de estoque',
      subtitulo: 'Top fitness Emana [P] (TOP-002)',
      mudancas: [
        { campo: 'Físico', antes: '4', depois: '3' },
        { campo: 'Disponível', antes: '2', depois: '1' },
        { campo: 'Motivo', antes: '—', depois: 'Avaria' },
      ],
      campos_extras: [
        { label: 'Usuário', valor: 'Maria' },
        { label: 'Data e hora', valor: '17/10/2026 17:30' },
        { label: 'Observação', valor: 'peça com costura aberta, separada para troca' },
      ],
      link_objeto: '/v2/estoque',
    },
    created_at: '2026-10-17T17:30:00Z',
  },
  {
    id: '#A-000415',
    data_hora: '17/10 11:15',
    usuario_nome: 'Leonardo',
    area: 'Financeiro',
    objeto: 'Receber · Roberto Silva',
    o_que_mudou: 'Baixa com valor editado: R$ 1.972,00 → R$ 1.941,42',
    detalhe: {
      acao_titulo: 'Baixa com valor editado',
      subtitulo: 'Receber · Roberto Silva',
      mudancas: [
        { campo: 'Valor recebido', antes: '—', depois: 'R$ 1.941,42' },
        { campo: 'Situação', antes: 'Aberto', depois: 'Pago' },
        { campo: 'Diferença', antes: '—', depois: '- R$ 30,58' },
        { campo: 'Motivo', antes: '—', depois: 'Taxa da administradora' },
      ],
      campos_extras: [
        { label: 'Usuário', valor: 'Leonardo' },
        { label: 'Data e hora', valor: '17/10/2026 11:15' },
        { label: 'Origem', valor: 'Financeiro · Baixa' },
        { label: 'Valor previsto', valor: 'R$ 1.972,00' },
      ],
      link_objeto: '/v2/contas-pagar',
    },
    created_at: '2026-10-17T11:15:00Z',
  },
  {
    id: '#A-000414',
    data_hora: '16/10 14:05',
    usuario_nome: 'Leonardo',
    area: 'Venda',
    objeto: '#20261015005',
    o_que_mudou: 'Ajuste manual de - R$ 0,50 · arredondamento acordado',
    detalhe: {
      acao_titulo: 'Ajuste manual no valor da proposta',
      subtitulo: 'Proposta #20261015005',
      mudancas: [
        { campo: 'Ajuste manual', antes: 'R$ 0,00', depois: '- R$ 0,50' },
        { campo: 'Total da proposta', antes: 'R$ 438,50', depois: 'R$ 438,00' },
      ],
      campos_extras: [
        { label: 'Usuário', valor: 'Leonardo' },
        { label: 'Data e hora', valor: '16/10/2026 14:05' },
        { label: 'Motivo', valor: 'Arredondamento acordado com cliente' },
      ],
      link_objeto: '/v2/propostas-vendas',
    },
    created_at: '2026-10-16T14:05:00Z',
  },
  {
    id: '#A-000413',
    data_hora: '16/10 09:40',
    usuario_nome: 'Leonardo',
    area: 'Financeiro',
    objeto: 'Pagar · Frete Sul',
    o_que_mudou: 'Lançamento aberto excluído (sem baixa)',
    detalhe: {
      acao_titulo: 'Exclusão de lançamento financeiro aberto',
      subtitulo: 'Conta a pagar · Frete Sul (R$ 180,00)',
      mudancas: [
        { campo: 'Situação', antes: 'Aberto', depois: 'Excluído' },
      ],
      campos_extras: [
        { label: 'Usuário', valor: 'Leonardo' },
        { label: 'Data e hora', valor: '16/10/2026 09:40' },
        { label: 'Origem', valor: 'Lançamento avulso' },
      ],
      link_objeto: '/v2/contas-pagar',
    },
    created_at: '2026-10-16T09:40:00Z',
  },
  {
    id: '#A-000412',
    data_hora: '15/10 16:20',
    usuario_nome: 'Leonardo',
    area: 'Permissão',
    objeto: 'Papel Vendedor',
    o_que_mudou: 'Ver custo e margem: ligado → desligado',
    detalhe: {
      acao_titulo: 'Alteração em papel e permissões',
      subtitulo: 'Papel Vendedor',
      mudancas: [
        { campo: 'Ver custo e margem', antes: 'Ligado', depois: 'Desligado' },
      ],
      campos_extras: [
        { label: 'Usuário responsável', valor: 'Leonardo' },
        { label: 'Data e hora', valor: '15/10/2026 16:20' },
      ],
      link_objeto: '/v2/configuracoes?tab=papeis',
    },
    created_at: '2026-10-15T16:20:00Z',
  },
  {
    id: '#A-000411',
    data_hora: '14/10 10:05',
    usuario_nome: 'Maria',
    area: 'Venda',
    objeto: '#20261014001',
    o_que_mudou: 'Aprovada · estoque reservado · contas a receber geradas',
    detalhe: {
      acao_titulo: 'Aprovação e fechamento de venda',
      subtitulo: 'Venda #20261014001',
      mudancas: [
        { campo: 'Situação', antes: 'Orçamento', depois: 'Aprovado' },
        { campo: 'Estoque', antes: 'Disponível livre', depois: 'Reserva efetuada' },
        { campo: 'Financeiro', antes: 'Sem lançamento', depois: 'Conta a receber gerada' },
      ],
      campos_extras: [
        { label: 'Vendedor', valor: 'Maria' },
        { label: 'Data e hora', valor: '14/10/2026 10:05' },
      ],
      link_objeto: '/v2/propostas-vendas',
    },
    created_at: '2026-10-14T10:05:00Z',
  },
]

export async function listAuditoria(): Promise<AuditoriaRegistro[]> {
  let list: AuditoriaRegistro[] = []

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        list = data.map((d: any) => ({
          id: d.id,
          data_hora: d.data_hora
            ? new Date(d.data_hora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
              ' ' +
              new Date(d.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '',
          usuario_nome: d.usuario_nome,
          area: d.area as AuditoriaArea,
          objeto: d.objeto,
          o_que_mudou: d.o_que_mudou,
          detalhe: d.detalhe,
          created_at: d.created_at,
        }))
        return list
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      list = JSON.parse(raw)
    }
  } catch {}

  if (list.length === 0) {
    list = SEED_AUDITORIA
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch {}
  }

  return list
}

export async function registrarAuditoria(
  item: Omit<AuditoriaRegistro, 'id' | 'created_at' | 'data_hora'> & {
    data_hora?: string
    id?: string
  }
): Promise<AuditoriaRegistro> {
  const current = await listAuditoria()
  const now = new Date()
  const dataHoraFormatted =
    now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const randomNum = Math.floor(100000 + Math.random() * 900000)
  const newId = item.id || `#A-${randomNum}`

  const newRecord: AuditoriaRegistro = {
    id: newId,
    data_hora: item.data_hora || dataHoraFormatted,
    usuario_nome: item.usuario_nome,
    area: item.area,
    objeto: item.objeto,
    o_que_mudou: item.o_que_mudou,
    detalhe: item.detalhe,
    created_at: now.toISOString(),
  }

  const updated = [newRecord, ...current]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert({
        id: newRecord.id,
        data_hora: now.toISOString(),
        usuario_nome: newRecord.usuario_nome,
        area: newRecord.area,
        objeto: newRecord.objeto,
        o_que_mudou: newRecord.o_que_mudou,
        detalhe: newRecord.detalhe || {},
        created_at: newRecord.created_at,
      })
    } catch {}
  }

  return newRecord
}
