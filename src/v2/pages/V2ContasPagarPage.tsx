import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Eye,
  Inbox,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Check,
} from 'lucide-react'
import {
  achatar,
  agruparPorDia,
  filtrar,
  formatBRL,
  hojeISO,
  mesesDisponiveis,
  rotuloDiaFormatado,
  rotuloMes,
  totalizar,
  type BaseData,
  type Filtros,
  type Movimento,
  type Status,
} from '../features/financeiro/extrato'
import {
  listContasPagar,
  saveContaPagar,
  baixarLancamento,
  estornarLancamento,
  excluirLancamentoAberto,
  ContaPagar,
  BaixarLancamentoParams,
} from '../services/v2ContasPagarService'
import {
  listContasBancarias,
  saveContaBancaria,
  ContaBancaria,
} from '../services/v2ContasBancariasService'
import { V2BaixaDrawer } from '../components/financeiro/V2BaixaDrawer'
import { V2NovoLancamentoDrawer } from '../components/financeiro/V2NovoLancamentoDrawer'
import { V2LancamentoDetalheDrawer } from '../components/financeiro/V2LancamentoDetalheDrawer'

const STATUS_ORDEM: Status[] = ['vencida', 'aberta', 'parcial', 'paga']

const fmtData = (iso: string) => iso.split('-').reverse().join('/')

export function V2ContasPagarPage() {
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([])
  const [carregando, setCarregando] = useState(true)
  const hoje = useMemo(() => hojeISO(), [])

  // Filtros
  const [tipo, setTipo] = useState<Filtros['tipo']>('todos')
  const [status, setStatus] = useState<ReadonlySet<Status>>(() => new Set())
  const [mes, setMes] = useState('todos')
  const [base, setBase] = useState<BaseData>('vencimento')
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca)

  // Drawers
  const [drawerNovoAberto, setDrawerNovoAberto] = useState(false)
  const [baixaModal, setBaixaModal] = useState<ContaPagar | null>(null)
  const [detalheModal, setDetalheModal] = useState<{
    conta: ContaPagar
    modo: 'detalhe_pago' | 'estorno' | 'excluir'
  } | null>(null)

  // Carga inicial
  const recarregar = async () => {
    setCarregando(true)
    try {
      const [dadosContas, bancos] = await Promise.all([
        listContasPagar(),
        listContasBancarias(),
      ])
      setContas(dadosContas)
      setContasBancarias(bancos)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void recarregar()
  }, [])

  // Cálculos do extrato
  const movsGerais = useMemo(() => achatar(contas, hoje, 'vencimento'), [contas, hoje])
  const movs = useMemo(() => achatar(contas, hoje, base), [contas, hoje, base])
  const meses = useMemo(() => mesesDisponiveis(movs), [movs])
  const totaisGerais = useMemo(() => totalizar(movsGerais, hoje), [movsGerais, hoje])

  const semTipo = useMemo(
    () => filtrar(movs, { tipo: 'todos', status, mes, base, busca: buscaAdiada }),
    [movs, status, mes, base, buscaAdiada],
  )

  const contagem = useMemo(() => {
    let pagar = 0
    for (const m of semTipo) if (m.tipo === 'pagar') pagar++
    return { todos: semTipo.length, pagar, receber: semTipo.length - pagar }
  }, [semTipo])

  const filtrados = useMemo(
    () => filtrar(movs, { tipo, status, mes, base, busca: buscaAdiada }),
    [movs, tipo, status, mes, base, buscaAdiada],
  )

  const dias = useMemo(() => agruparPorDia(filtrados), [filtrados])

  // Contagem de vencidas
  const vencidasQtd = useMemo(() => {
    return movsGerais.filter((m) => m.status === 'vencida').length
  }, [movsGerais])

  // Próximo vencimento para a mensagem descritiva
  const proximoVencimentoTexto = useMemo(() => {
    const pendentes = movsGerais
      .filter((m) => m.restante > 0 && m.vencimento >= hoje)
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1))

    if (pendentes.length === 0) return 'Nenhum vencimento pendente no momento.'

    const prox = pendentes[0]
    const [ya, ma, da] = hoje.split('-').map(Number)
    const [yb, mb, db] = prox.vencimento.split('-').map(Number)
    const dif = Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)

    const diasStr = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : `em ${dif} dias`
    return `Próximo vencimento ${diasStr}: ${prox.descricao}.`
  }, [movsGerais, hoje])

  const alternarStatus = (s: Status) => {
    setStatus((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  // Ações de criação, baixa, estorno e exclusão
  const handleNovoLancamento = async (dados: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'>) => {
    await saveContaPagar(dados)
    await recarregar()
  }

  const handleConfirmarBaixa = async (params: BaixarLancamentoParams) => {
    await baixarLancamento(params)
    await recarregar()
  }

  const handleConfirmarEstorno = async (contaId: string) => {
    await estornarLancamento(contaId)
    await recarregar()
  }

  const handleConfirmarExclusao = async (contaId: string) => {
    await excluirLancamentoAberto(contaId)
    await recarregar()
  }

  const handleCriarContaBancaria = async (nome: string) => {
    const nova = await saveContaBancaria({
      nome,
      tipo: 'carteira',
      saldoAtual: 0,
      cor: '#3B82F6',
      ativo: true,
    })
    const lista = await listContasBancarias()
    setContasBancarias(lista)
    return nova
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* ── TOPO: TÍTULO E BOTÃO NOVO LANÇAMENTO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Seu extrato de contas a pagar e a receber</p>
        </div>

        {/* Desktop Button */}
        <button
          type="button"
          onClick={() => setDrawerNovoAberto(true)}
          className="hidden sm:inline-flex items-center gap-2 bg-[#2D6A4F] hover:bg-[#24563F] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all hover:shadow cursor-pointer"
        >
          <Plus size={18} /> Novo lançamento
        </button>

        {/* Mobile Button */}
        <button
          type="button"
          onClick={() => setDrawerNovoAberto(true)}
          className="sm:hidden w-12 h-12 rounded-full bg-[#2D6A4F] hover:bg-[#24563F] text-white flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
          aria-label="Novo lançamento"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* ── BANNER AZUL PRINCIPAL ── */}
      <div className="bg-[#0F3D6E] text-white rounded-2xl p-6 sm:p-7 shadow-sm">
        {/* Desktop Banner Layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-200 block">
              Saldo em Caixa
            </span>
            <span className="text-4xl font-extrabold tracking-tight mt-1 block">R$ 0,00</span>
          </div>

          <div className="flex items-center gap-12 text-right">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-200 block">
                Projetado
              </span>
              <span className="text-2xl font-bold tracking-tight mt-0.5 block">
                {formatBRL(totaisGerais.saldoProjetado)}
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-200 block">
                Vencido
              </span>
              <span className="text-2xl font-bold tracking-tight mt-0.5 block">
                {formatBRL(totaisGerais.vencidoPagar + totaisGerais.vencidoReceber)}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Banner Layout */}
        <div className="sm:hidden space-y-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200 block">
              Saldo em Caixa
            </span>
            <span className="text-3xl font-extrabold tracking-tight mt-0.5 block">R$ 0,00</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-blue-400/30 text-xs">
            <div>
              <span className="text-blue-200">Projetado </span>
              <span className="font-bold text-white">{formatBRL(totaisGerais.saldoProjetado)}</span>
            </div>
            <div>
              <span className="text-blue-200">Vencido </span>
              <span className="font-bold text-white">
                {formatBRL(totaisGerais.vencidoPagar + totaisGerais.vencidoReceber)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 KPI CARDS (Desktop: 4 colunas; Mobile: 2 colunas) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Recebido (apenas desktop na spec mobile, mas visível e responsivo) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Recebido
          </span>
          <span className="text-xl sm:text-2xl font-black text-[#2D6A4F] mt-1 block">
            {formatBRL(totaisGerais.recebido)}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Pago
          </span>
          <span className="text-xl sm:text-2xl font-black text-[#C92A2A] mt-1 block">
            {formatBRL(totaisGerais.pago)}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            A Receber
          </span>
          <span className="text-xl sm:text-2xl font-black text-[#2D6A4F] mt-1 block">
            {formatBRL(totaisGerais.aReceber)}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block">
            A Pagar
          </span>
          <span className="text-xl sm:text-2xl font-black text-[#C92A2A] mt-1 block">
            {formatBRL(totaisGerais.aPagar)}
          </span>
        </div>
      </div>

      {/* ── ALERTA DE VENCIMENTO / STORYTELLING ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 shadow-2xs">
        {vencidasQtd > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold shrink-0 self-start sm:self-auto">
            <Clock size={13} />
            <span>
              {vencidasQtd} {vencidasQtd === 1 ? 'vencida' : 'vencidas'}
            </span>
          </div>
        )}
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
          Ainda restam <strong className="font-bold">{formatBRL(totaisGerais.aPagar)}</strong> a pagar e{' '}
          <strong className="font-bold">{formatBRL(totaisGerais.aReceber)}</strong> a receber.{' '}
          {proximoVencimentoTexto}
        </p>
      </div>

      {/* ── BARRA DE FILTROS ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
        {/* Linha 1: Abas de Tipo + Campo de Busca + Dropdown de Mês */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Abas Tipo */}
          <div className="flex items-center bg-slate-100/80 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setTipo('todos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tipo === 'todos'
                  ? 'bg-[#0F3D6E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos <span className="opacity-80 font-normal">{contagem.todos}</span>
            </button>
            <button
              type="button"
              onClick={() => setTipo('pagar')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tipo === 'pagar'
                  ? 'bg-[#0F3D6E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A pagar <span className="opacity-80 font-normal">{contagem.pagar}</span>
            </button>
            <button
              type="button"
              onClick={() => setTipo('receber')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tipo === 'receber'
                  ? 'bg-[#0F3D6E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A receber <span className="opacity-80 font-normal">{contagem.receber}</span>
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative flex-1 min-w-0">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar descrição ou fornecedor"
              className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-xs font-medium text-slate-800 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
            />
          </div>

          {/* Dropdown Mês */}
          <div className="shrink-0">
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value="todos">Mês: Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  Mês: {rotuloMes(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha 2: Toggle Vencimento/Pagamento + Chips de Status */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center bg-slate-100/80 p-0.5 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setBase('vencimento')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                base === 'vencimento'
                  ? 'bg-[#0F3D6E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vencimento
            </button>
            <button
              type="button"
              onClick={() => setBase('pagamento')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                base === 'pagamento'
                  ? 'bg-[#0F3D6E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pagamento
            </button>
          </div>

          {STATUS_ORDEM.map((s) => {
            const ativo = status.has(s)
            let colorCls = 'text-slate-600 border-slate-200 hover:border-slate-300'
            if (s === 'vencida') {
              colorCls = ativo
                ? 'bg-red-50 text-red-700 border-red-300 ring-1 ring-red-400'
                : 'text-red-700 border-red-200 hover:bg-red-50/50'
            } else if (s === 'aberta') {
              colorCls = ativo
                ? 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-400'
                : 'text-blue-700 border-blue-200 hover:bg-blue-50/50'
            } else if (s === 'parcial') {
              colorCls = ativo
                ? 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-400'
                : 'text-amber-700 border-amber-200 hover:bg-amber-50/50'
            } else if (s === 'paga') {
              colorCls = ativo
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-400'
                : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50/50'
            }

            return (
              <button
                key={s}
                type="button"
                onClick={() => alternarStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${colorCls}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── EXTRATO AGRUPADO POR DATA ── */}
      <div className="space-y-6">
        {carregando ? (
          <div className="text-center py-12 text-slate-400 text-sm">Carregando extrato...</div>
        ) : dias.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center">
            <Inbox size={36} className="text-slate-300 mb-2" />
            <h3 className="text-sm font-bold text-slate-800">Nenhum lançamento encontrado</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Não há lançamentos correspondentes aos filtros selecionados.
            </p>
          </div>
        ) : (
          dias.map((dia) => (
            <div key={dia.data} className="space-y-2">
              {/* Header do Dia: 15 DE NOVEMBRO DOM */}
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
                {rotuloDiaFormatado(dia.data)}
              </div>

              {/* Lista de Movimentos no Dia */}
              <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 shadow-2xs overflow-hidden">
                {dia.movimentos.map((m: Movimento) => {
                  const isPagar = m.tipo === 'pagar'
                  const isPago = m.status === 'paga'

                  return (
                    <div
                      key={m.id}
                      className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                    >
                      {/* Left: Ícone e Descrição */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isPagar ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isPagar ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug truncate">
                            {m.descricao}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {m.contraparte} · {m.contaOriginal?.forma_pagamento || 'outros'} ·{' '}
                            {isPago
                              ? `recebido ${fmtData(m.pagoEm || m.vencimento)}`
                              : `vence ${fmtData(m.vencimento)}`}
                          </p>
                        </div>
                      </div>

                      {/* Right: Valor, Badge e Ações */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="flex items-center gap-2.5">
                          {/* Valor com sinal + ou - */}
                          <span
                            className={`text-sm sm:text-base font-extrabold ${
                              isPagar ? 'text-[#C92A2A]' : 'text-[#2D6A4F]'
                            }`}
                          >
                            {isPagar
                              ? `- ${formatBRL(isPago ? m.valorPago : m.valor)}`
                              : `+ ${formatBRL(isPago ? m.valorPago : m.valor)}`}
                          </span>

                          {/* Status Badge */}
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                              m.status === 'paga'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : m.status === 'vencida'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : m.status === 'parcial'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                          </span>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex items-center gap-2">
                          {!isPago ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setBaixaModal(m.contaOriginal)}
                                className="px-3.5 py-1.5 border border-blue-600 text-blue-700 hover:bg-blue-50/80 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Check size={14} className="stroke-[2.5]" /> Baixar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDetalheModal({ conta: m.contaOriginal, modo: 'excluir' })
                                }
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                                title="Excluir lançamento"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setDetalheModal({ conta: m.contaOriginal, modo: 'estorno' })
                                }
                                className="px-3 py-1.5 border border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <RotateCcw size={13} /> Estornar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDetalheModal({ conta: m.contaOriginal, modo: 'detalhe_pago' })
                                }
                                className="px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Eye size={14} /> Ver
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── DRAWERS MODAIS ── */}
      <V2NovoLancamentoDrawer
        isOpen={drawerNovoAberto}
        onClose={() => setDrawerNovoAberto(false)}
        onSalvar={handleNovoLancamento}
      />

      <V2BaixaDrawer
        isOpen={baixaModal !== null}
        onClose={() => setBaixaModal(null)}
        conta={baixaModal}
        contasBancarias={contasBancarias}
        onConfirmarBaixa={handleConfirmarBaixa}
        onCriarContaBancaria={handleCriarContaBancaria}
      />

      <V2LancamentoDetalheDrawer
        isOpen={detalheModal !== null}
        onClose={() => setDetalheModal(null)}
        conta={detalheModal?.conta || null}
        modo={detalheModal?.modo || 'detalhe_pago'}
        onConfirmarEstorno={handleConfirmarEstorno}
        onConfirmarExclusao={handleConfirmarExclusao}
        onAbrirBaixa={(c) => setBaixaModal(c)}
      />
    </div>
  )
}
