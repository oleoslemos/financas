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
  Edit3,
  Percent,
  Table as TableIcon,
  List,
  Wallet,
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
  rotuloStatusFormatado,
  totalizar,
  type BaseData,
  type Filtros,
  type Movimento,
  type Status,
} from '../features/financeiro/extrato'
import {
  listContasPagar,
  saveContaPagar,
  updateContaPagar,
  baixarLancamento,
  estornarLancamento,
  cancelarLancamento,
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
import { V2EditarLancamentoDrawer } from '../components/financeiro/V2EditarLancamentoDrawer'
import { V2GerarComissoesModal } from '../components/financeiro/V2GerarComissoesModal'
import { V2RelatorioComissoes } from '../components/financeiro/V2RelatorioComissoes'

const STATUS_ORDEM: Status[] = ['vencida', 'aberta', 'parcial', 'paga']

const fmtData = (iso: string) => iso.split('-').reverse().join('/')

export function V2ContasPagarPage() {
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([])
  const [carregando, setCarregando] = useState(true)
  const hoje = useMemo(() => hojeISO(), [])

  // Abas Principais: Lançamentos / Relatório de Comissões
  const [abaPrincipal, setAbaPrincipal] = useState<'extrato' | 'comissoes'>('extrato')

  // Modo de visualização dos lançamentos: Tabela (padrão) vs. Extrato Timeline
  const [modoVisualizacao, setModoVisualizacao] = useState<'tabela' | 'extrato'>('tabela')

  // Filtros
  const [tipo, setTipo] = useState<Filtros['tipo']>('todos')
  const [status, setStatus] = useState<ReadonlySet<Status>>(() => new Set())
  const [mes, setMes] = useState('todos')
  const [base, setBase] = useState<BaseData>('vencimento')
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca)

  // Modais e Drawers
  const [drawerNovoAberto, setDrawerNovoAberto] = useState(false)
  const [contaParaEditar, setContaParaEditar] = useState<ContaPagar | null>(null)
  const [modalGerarComissoesAberto, setModalGerarComissoesAberto] = useState(false)
  const [baixaModal, setBaixaModal] = useState<ContaPagar | null>(null)
  const [detalheModal, setDetalheModal] = useState<{
    conta: ContaPagar
    modo: 'detalhe' | 'detalhe_pago' | 'estorno' | 'excluir'
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

  // Ações de criação, edição, baixa, estorno, cancelamento e exclusão
  const handleNovoLancamento = async (dados: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'>) => {
    await saveContaPagar(dados)
    await recarregar()
  }

  const handleSalvarEdicaoLancamento = async (contaAtualizada: ContaPagar) => {
    await updateContaPagar(contaAtualizada)
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

  const handleConfirmarCancelamento = async (contaId: string) => {
    await cancelarLancamento(contaId)
    await recarregar()
  }

  const handleConfirmarExclusao = async (contaId: string) => {
    await excluirLancamentoAberto(contaId)
    await recarregar()
  }

  const handleAbrirDetalheTitulo = (conta: ContaPagar) => {
    setDetalheModal({ conta, modo: 'detalhe' })
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
      {/* ── TOPO: TÍTULO E BOTÕES PRINCIPAIS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestão de títulos, comissões e fluxo de caixa</p>
        </div>

        {/* Botões do Topo */}
        <div className="flex items-center gap-2.5">
          {/* Botão Gerar Comissões */}
          <button
            type="button"
            onClick={() => setModalGerarComissoesAberto(true)}
            className="inline-flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-2xs transition-all cursor-pointer"
            title="Calcular e gerar comissões dos pedidos de vendas"
          >
            <Percent size={16} className="text-emerald-700" />
            <span>Gerar Comissões</span>
          </button>

          {/* Botão Novo Lançamento */}
          <button
            type="button"
            onClick={() => setDrawerNovoAberto(true)}
            className="inline-flex items-center gap-2 bg-[#2D6A4F] hover:bg-[#24563F] text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all hover:shadow cursor-pointer"
          >
            <Plus size={18} /> Novo lançamento
          </button>
        </div>
      </div>

      {/* ── ABAS SUPERIORES: LANÇAMENTOS VS. RELATÓRIO DE COMISSÕES ── */}
      <div className="flex items-center border-b border-slate-200 gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => setAbaPrincipal('extrato')}
          className={`px-4 sm:px-6 py-3 font-extrabold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            abaPrincipal === 'extrato'
              ? 'border-[#0F3D6E] text-[#0F3D6E]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet size={16} /> Lançamentos Financeiros
        </button>

        <button
          type="button"
          onClick={() => setAbaPrincipal('comissoes')}
          className={`px-4 sm:px-6 py-3 font-extrabold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            abaPrincipal === 'comissoes'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Percent size={16} /> Relatório de Comissões (Mês a Mês)
        </button>
      </div>

      {/* ── CONTEÚDO DA ABA SELECIONADA ── */}
      {abaPrincipal === 'comissoes' ? (
        <V2RelatorioComissoes />
      ) : (
        <>
          {/* ── BANNER AZUL PRINCIPAL ── */}
          <div className="bg-[#0F3D6E] text-white rounded-2xl p-6 sm:p-7 shadow-sm">
            <div className="hidden sm:flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-200 block">
                  Saldo em Caixa
                </span>
                <span className="text-4xl font-extrabold tracking-tight mt-1 block">
                  {formatBRL(totaisGerais.saldoRealizado)}
                </span>
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

            <div className="sm:hidden space-y-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200 block">
                  Saldo em Caixa
                </span>
                <span className="text-3xl font-extrabold tracking-tight mt-0.5 block">
                  {formatBRL(totaisGerais.saldoRealizado)}
                </span>
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

          {/* ── 4 KPI CARDS ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* ── BARRA DE FILTROS & SELEÇÃO DE VISUALIZAÇÃO ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
            {/* Linha 1: Abas de Tipo + Campo de Busca + Dropdown de Mês + Alternador Tabela/Extrato */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
                  placeholder="Buscar descrição ou fornecedor/cliente..."
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

              {/* Alternador de Modo: Tabela vs. Extrato Timeline */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setModoVisualizacao('tabela')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    modoVisualizacao === 'tabela'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Visualizar como tabela"
                >
                  <TableIcon size={14} /> Tabela
                </button>
                <button
                  type="button"
                  onClick={() => setModoVisualizacao('extrato')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    modoVisualizacao === 'extrato'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Visualizar como extrato por dia"
                >
                  <List size={14} /> Extrato
                </button>
              </div>
            </div>

            {/* Linha 2: Toggle Vencimento/Pagamento + Chips de Status */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center bg-slate-100/80 p-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setBase('vencimento')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
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
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
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

                let rotuloChip = rotuloStatusFormatado(s)
                if (s === 'paga') {
                  if (tipo === 'receber') rotuloChip = 'Recebida'
                  else if (tipo === 'pagar') rotuloChip = 'Paga'
                  else rotuloChip = 'Recebida / Paga'
                }

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => alternarStatus(s)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${colorCls}`}
                  >
                    {rotuloChip}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── VISUALIZAÇÃO EM TABELA OU EXTRATO TIMELINE ── */}
          {carregando ? (
            <div className="text-center py-12 text-slate-400 text-sm">Carregando dados financeiros...</div>
          ) : filtrados.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center">
              <Inbox size={36} className="text-slate-300 mb-2" />
              <h3 className="text-sm font-bold text-slate-800">Nenhum lançamento encontrado</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Não há lançamentos correspondentes aos filtros selecionados.
              </p>
            </div>
          ) : modoVisualizacao === 'tabela' ? (
            /* ──── MODO TABELA COMPLETA (DESIGN OTIMIZADO PARA CABER TUDO) ──── */
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
              <table className="w-full text-xs text-slate-700">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3 text-center w-20">Tipo</th>
                    <th className="px-3 py-3 text-left w-24">Vencimento</th>
                    <th className="px-3 py-3 text-left min-w-[200px]">Descrição & Categoria</th>
                    <th className="px-3 py-3 text-left w-36">Contraparte</th>
                    <th className="px-3 py-3 text-left w-28">Forma / Tag</th>
                    <th className="px-3 py-3 text-right w-28">Valor</th>
                    <th className="px-3 py-3 text-center w-24">Status</th>
                    <th className="px-3 py-3 text-center w-28">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrados.map((m: Movimento) => {
                    const isPagar = m.tipo === 'pagar'
                    const isPago = m.status === 'paga'
                    const isCancelado = m.status === 'cancelada'

                    return (
                      <tr
                        key={m.id}
                        onClick={() => handleAbrirDetalheTitulo(m.contaOriginal)}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                        title="Clique para abrir detalhes do título"
                      >
                        {/* Tipo */}
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                              isPagar
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isPagar ? (
                              <>
                                <ArrowUpRight size={12} className="text-red-600 shrink-0" />
                                <span>Pagar</span>
                              </>
                            ) : (
                              <>
                                <ArrowDownLeft size={12} className="text-emerald-600 shrink-0" />
                                <span>Receber</span>
                              </>
                            )}
                          </span>
                        </td>

                        {/* Vencimento / Data */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-extrabold text-slate-800 block">
                            {fmtData(m.vencimento)}
                          </span>
                          {isPago && m.pagoEm && (
                            <span className="text-[10px] text-emerald-700 font-semibold block leading-tight">
                              {fmtData(m.pagoEm)}
                            </span>
                          )}
                        </td>

                        {/* Descrição & Categoria */}
                        <td className="px-3 py-2.5 min-w-0">
                          <span
                            className="font-bold text-slate-900 block truncate group-hover:text-blue-700 transition-colors"
                            title={m.descricao}
                          >
                            {m.descricao}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-500 font-medium truncate">
                              {m.contaOriginal?.categoria || 'Geral'}
                            </span>
                            {m.contaOriginal?.pedido_id && (
                              <span className="text-[9px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 shrink-0">
                                Pedido
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Contraparte */}
                        <td className="px-3 py-2.5">
                          <span
                            className="font-medium text-slate-800 block truncate max-w-[150px]"
                            title={m.contraparte || ''}
                          >
                            {m.contraparte || '—'}
                          </span>
                        </td>

                        {/* Forma / Tag */}
                        <td className="px-3 py-2.5 text-slate-600">
                          <span
                            className="block font-medium truncate max-w-[120px]"
                            title={m.contaOriginal?.forma_pagamento || ''}
                          >
                            {m.contaOriginal?.forma_pagamento || '—'}
                          </span>
                          {m.contaOriginal?.conta_bancaria_tag && (
                            <span className="text-[10px] text-blue-600 font-bold block truncate">
                              {m.contaOriginal.conta_bancaria_tag}
                            </span>
                          )}
                        </td>

                        {/* Valor */}
                        <td className="px-3 py-2.5 text-right font-black tabular-nums whitespace-nowrap">
                          <span className={isPagar ? 'text-[#C92A2A]' : 'text-[#2D6A4F]'}>
                            {isPagar
                              ? `- ${formatBRL(isPago ? m.valorPago : m.valor)}`
                              : `+ ${formatBRL(isPago ? m.valorPago : m.valor)}`}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              m.status === 'paga'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : m.status === 'vencida'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : isCancelado
                                ? 'bg-slate-100 text-slate-600 border border-slate-300'
                                : m.status === 'parcial'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {rotuloStatusFormatado(m.status, m.tipo)}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <div
                            className="flex items-center justify-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Editar */}
                            <button
                              type="button"
                              onClick={() => setContaParaEditar(m.contaOriginal)}
                              className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors cursor-pointer"
                              title="Editar título"
                            >
                              <Edit3 size={13} />
                            </button>

                            {/* Baixar ou Estornar */}
                            {!isPago && !isCancelado ? (
                              <button
                                type="button"
                                onClick={() => setBaixaModal(m.contaOriginal)}
                                className="p-1.5 text-emerald-700 hover:text-white hover:bg-emerald-700 border border-emerald-300 rounded-lg transition-colors cursor-pointer"
                                title="Baixar título"
                              >
                                <Check size={13} className="stroke-[2.5]" />
                              </button>
                            ) : isPago ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDetalheModal({ conta: m.contaOriginal, modo: 'estorno' })
                                }
                                className="p-1.5 text-amber-800 hover:bg-amber-100 border border-amber-200 bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                title="Estornar baixa"
                              >
                                <RotateCcw size={13} />
                              </button>
                            ) : null}

                            {/* Cancelar ou Excluir */}
                            {!isPago && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDetalheModal({ conta: m.contaOriginal, modo: 'excluir' })
                                }
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                                title="Excluir ou cancelar"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}

                            {/* Ver Detalhes */}
                            <button
                              type="button"
                              onClick={() => handleAbrirDetalheTitulo(m.contaOriginal)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                              title="Ver detalhes completos"
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ──── MODO EXTRATO AGRUPADO POR DIA (TIMELINE) ──── */
            <div className="space-y-6">
              {dias.map((dia) => (
                <div key={dia.data} className="space-y-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
                    {rotuloDiaFormatado(dia.data)}
                  </div>

                  <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 shadow-2xs overflow-hidden">
                    {dia.movimentos.map((m: Movimento) => {
                      const isPagar = m.tipo === 'pagar'
                      const isPago = m.status === 'paga'

                      return (
                        <div
                          key={m.id}
                          onClick={() => handleAbrirDetalheTitulo(m.contaOriginal)}
                          className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors cursor-pointer"
                        >
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
                                  ? `${isPagar ? 'pago' : 'recebido'} em ${fmtData(m.pagoEm || m.vencimento)}`
                                  : `vence ${fmtData(m.vencimento)}`}
                              </p>
                            </div>
                          </div>

                          <div
                            className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`text-sm sm:text-base font-extrabold ${
                                  isPagar ? 'text-[#C92A2A]' : 'text-[#2D6A4F]'
                                }`}
                              >
                                {isPagar
                                  ? `- ${formatBRL(isPago ? m.valorPago : m.valor)}`
                                  : `+ ${formatBRL(isPago ? m.valorPago : m.valor)}`}
                              </span>

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
                                {rotuloStatusFormatado(m.status, m.tipo)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Editar */}
                              <button
                                type="button"
                                onClick={() => setContaParaEditar(m.contaOriginal)}
                                className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors cursor-pointer"
                                title="Editar título"
                              >
                                <Edit3 size={14} />
                              </button>

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
                                    onClick={() => handleAbrirDetalheTitulo(m.contaOriginal)}
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
              ))}
            </div>
          )}
        </>
      )}

      {/* ── DRAWERS E MODAIS ── */}
      <V2NovoLancamentoDrawer
        isOpen={drawerNovoAberto}
        onClose={() => setDrawerNovoAberto(false)}
        onSalvar={handleNovoLancamento}
      />

      <V2EditarLancamentoDrawer
        isOpen={contaParaEditar !== null}
        onClose={() => setContaParaEditar(null)}
        conta={contaParaEditar}
        onSalvar={handleSalvarEdicaoLancamento}
      />

      <V2GerarComissoesModal
        isOpen={modalGerarComissoesAberto}
        onClose={() => setModalGerarComissoesAberto(false)}
        onComissoesAtualizadas={recarregar}
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
        modo={detalheModal?.modo || 'detalhe'}
        onConfirmarEstorno={handleConfirmarEstorno}
        onConfirmarCancelamento={handleConfirmarCancelamento}
        onConfirmarExclusao={handleConfirmarExclusao}
        onAbrirBaixa={(c) => setBaixaModal(c)}
        onAbrirEdicao={(c) => setContaParaEditar(c)}
      />
    </div>
  )
}
