import { ContaPagar, ContaPagarParcela, StatusConta, TipoLancamento } from '../../services/v2ContasPagarService'

export type Tipo = TipoLancamento
export type Status = StatusConta
export type BaseData = 'vencimento' | 'pagamento'

/** Uma linha do extrato = uma parcela com o contexto do lançamento. */
export interface Movimento {
  id: string
  contaId: string
  tipo: Tipo
  descricao: string
  contraparte: string
  categoria?: string
  numero: number
  totalParcelas: number
  vencimento: string
  pagoEm: string | null
  valor: number
  valorPago: number
  restante: number
  status: Status
  /** Data que posiciona a linha no extrato (depende da base escolhida). */
  data: string
  contaOriginal: ContaPagar
  parcelaOriginal: ContaPagarParcela
}

export interface Filtros {
  tipo: 'todos' | Tipo
  status: ReadonlySet<Status>
  mes: string // 'todos' | 'YYYY-MM'
  base: BaseData
  busca: string
}

export interface DiaExtrato {
  data: string
  movimentos: Movimento[]
  /** Entradas - saídas efetivamente realizadas no dia. */
  saldoDia: number
}

export interface Totais {
  recebido: number
  pago: number
  saldoRealizado: number
  aReceber: number
  aPagar: number
  saldoProjetado: number
  vencidoPagar: number
  vencidoReceber: number
  qtd: number
}

/* ---------- datas ---------- */

export function hojeISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatBRL = (v: number) => brl.format(v)

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function rotuloMes(chave: string): string {
  if (chave === 'todos') return 'Todos os meses'
  const [y, m] = chave.split('-').map(Number)
  const nome = MESES[m - 1]
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${y}`
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function rotuloDia(iso: string, hoje: string): { titulo: string; sub: string } {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = SEMANA[new Date(y, m - 1, d).getDay()]
  const dif = diasEntre(hoje, iso)
  const base = `${String(d).padStart(2, '0')} de ${MESES[m - 1]}`
  if (dif === 0) return { titulo: 'Hoje', sub: base }
  if (dif === -1) return { titulo: 'Ontem', sub: base }
  if (dif === 1) return { titulo: 'Amanhã', sub: base }
  return { titulo: base, sub: dow }
}

export function rotuloDiaFormatado(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dow = SEMANA[date.getDay()].toUpperCase()
  const nomeMes = MESES[m - 1].toUpperCase()
  return `${String(d).padStart(2, '0')} DE ${nomeMes} ${dow}`
}

/* ---------- derivação ---------- */

export function statusDaParcela(p: ContaPagarParcela, hoje: string): Status {
  if (p.status === 'paga') return 'paga'
  if (p.status === 'parcial') return 'parcial'
  if (p.baixa) return 'paga'
  if (p.vencimento < hoje) return 'vencida'
  return 'aberta'
}

export function rotuloStatusFormatado(status: Status, tipo?: 'pagar' | 'receber'): string {
  if (status === 'paga') {
    return tipo === 'receber' ? 'Recebida' : 'Paga'
  }
  if (status === 'vencida') return 'Vencida'
  if (status === 'aberta') return 'Aberta'
  if (status === 'parcial') return 'Parcial'
  if (status === 'cancelada') return 'Cancelada'
  return status
}


/** Achata as contas em movimentos por parcela. */
export function achatar(contas: ContaPagar[], hoje: string, base: BaseData): Movimento[] {
  const out: Movimento[] = []
  for (const c of contas) {
    const tipo = c.tipo || 'pagar'
    for (const p of c.parcelas) {
      const status = statusDaParcela(p, hoje)
      const pagoEm = p.baixa?.dataBaixa ?? c.data_baixa ?? null
      const data = base === 'pagamento' ? (pagoEm || p.vencimento) : p.vencimento
      if (!data) continue

      const valorPago = p.baixa ? p.baixa.valorFinalPago : (c.totalPago || 0)
      const restante =
        status === 'paga'
          ? 0
          : c.saldo_residual !== undefined && c.saldo_residual > 0
          ? c.saldo_residual
          : Math.max(0, p.valor - valorPago)

      out.push({
        id: `${c.id}-p${p.numero}`,
        contaId: c.id,
        tipo,
        descricao: c.descricao,
        contraparte: c.fornecedor || (tipo === 'receber' ? 'Cliente' : 'Fornecedor'),
        categoria: c.categoria || undefined,
        numero: p.numero,
        totalParcelas: c.parcelas.length,
        vencimento: p.vencimento,
        pagoEm,
        valor: p.valor,
        valorPago,
        restante,
        status,
        data,
        contaOriginal: c,
        parcelaOriginal: p,
      })
    }
  }
  return out
}

export function mesesDisponiveis(movs: Movimento[]): string[] {
  const set = new Set<string>()
  for (const m of movs) set.add(m.data.slice(0, 7))
  return [...set].sort().reverse()
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function filtrar(movs: Movimento[], f: Filtros): Movimento[] {
  const q = semAcento(f.busca.trim())
  return movs.filter((m) => {
    if (f.tipo !== 'todos' && m.tipo !== f.tipo) return false
    if (f.status.size > 0 && !f.status.has(m.status)) return false
    if (f.mes !== 'todos' && !m.data.startsWith(f.mes)) return false
    if (q && !semAcento(`${m.descricao} ${m.contraparte} ${m.categoria ?? ''}`).includes(q)) return false
    return true
  })
}

export function totalizar(movs: Movimento[], hoje: string): Totais {
  const t: Totais = {
    recebido: 0,
    pago: 0,
    saldoRealizado: 0,
    aReceber: 0,
    aPagar: 0,
    saldoProjetado: 0,
    vencidoPagar: 0,
    vencidoReceber: 0,
    qtd: movs.length,
  }
  for (const m of movs) {
    if (m.tipo === 'receber') {
      t.recebido += m.valorPago
      t.aReceber += m.restante
      if (m.restante > 0 && m.vencimento < hoje) t.vencidoReceber += m.restante
    } else {
      t.pago += m.valorPago
      t.aPagar += m.restante
      if (m.restante > 0 && m.vencimento < hoje) t.vencidoPagar += m.restante
    }
  }
  t.saldoRealizado = t.recebido - t.pago
  t.saldoProjetado = t.saldoRealizado + t.aReceber - t.aPagar
  return t
}

/** Agrupa por dia, mais recente primeiro. */
export function agruparPorDia(movs: Movimento[]): DiaExtrato[] {
  const mapa = new Map<string, Movimento[]>()
  for (const m of movs) {
    const arr = mapa.get(m.data)
    if (arr) arr.push(m)
    else mapa.set(m.data, [m])
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([data, lista]) => {
      let saldoDia = 0
      for (const m of lista) saldoDia += m.tipo === 'receber' ? m.valorPago : -m.valorPago
      lista.sort((a, b) => b.valor - a.valor)
      return { data, movimentos: lista, saldoDia }
    })
}

/* ---------- storytelling ---------- */

export interface Historia {
  tom: 'positivo' | 'atencao' | 'neutro'
  titulo: string
  texto: string
}

export function contarHistoria(t: Totais, movs: Movimento[], hoje: string, escopo: string): Historia {
  if (t.qtd === 0) {
    return {
      tom: 'neutro',
      titulo: 'Nada por aqui ainda',
      texto: 'Nenhum lançamento corresponde aos filtros escolhidos. Ajuste o período ou limpe os filtros.',
    }
  }

  const partes: string[] = []
  if (t.recebido > 0 || t.pago > 0) {
    const verbo = t.saldoRealizado >= 0 ? 'fechou no positivo' : 'está no negativo'
    partes.push(
      `Em ${escopo}, entraram ${formatBRL(t.recebido)} e saíram ${formatBRL(t.pago)}: o caixa ${verbo} em ${formatBRL(Math.abs(t.saldoRealizado))}.`,
    )
  } else {
    partes.push(`Em ${escopo} ainda não houve movimentação de caixa.`)
  }

  if (t.aPagar > 0 || t.aReceber > 0) {
    const falta: string[] = []
    if (t.aPagar > 0) falta.push(`${formatBRL(t.aPagar)} a pagar`)
    if (t.aReceber > 0) falta.push(`${formatBRL(t.aReceber)} a receber`)
    partes.push(`Ainda restam ${falta.join(' e ')}.`)
  } else {
    partes.push('Não há pendências em aberto.')
  }

  // próximo vencimento ainda não quitado
  let prox: Movimento | null = null
  for (const m of movs) {
    if (m.restante > 0 && m.vencimento >= hoje && (!prox || m.vencimento < prox.vencimento)) prox = m
  }
  if (prox) {
    const d = diasEntre(hoje, prox.vencimento)
    const quando = d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`
    partes.push(`O próximo vencimento é ${quando}: ${prox.descricao}.`)
  }

  const vencido = t.vencidoPagar + t.vencidoReceber
  if (vencido > 0) {
    return {
      tom: 'atencao',
      titulo: 'Tem coisa vencida pedindo atenção',
      texto: `${partes.join(' ')} Atenção: ${formatBRL(t.vencidoPagar)} a pagar e ${formatBRL(t.vencidoReceber)} a receber já passaram do vencimento.`,
    }
  }

  return {
    tom: t.saldoProjetado >= 0 ? 'positivo' : 'neutro',
    titulo: t.saldoProjetado >= 0 ? 'Tudo em dia' : 'Caixa projetado abaixo de zero',
    texto: partes.join(' '),
  }
}
