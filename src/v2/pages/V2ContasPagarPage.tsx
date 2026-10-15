import { memo, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock,
  Eye,
  Inbox,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Wallet,
  X,
} from 'lucide-react'
import {
  achatar,
  agruparPorDia,
  contarHistoria,
  filtrar,
  formatBRL,
  hojeISO,
  mesesDisponiveis,
  rotuloDia,
  rotuloMes,
  totalizar,
  type BaseData,
  type DiaExtrato,
  type Filtros,
  type Movimento,
  type Status,
} from '../features/financeiro/extrato'
import {
  listContasPagar,
  updateContaPagar,
  saveContaPagar,
  estornarBaixaParcela,
  ContaPagar,
  ContaPagarParcela,
  BaixaParcelaInfo,
  TipoLancamento,
  StatusConta,
} from '../services/v2ContasPagarService'
import {
  listContasBancarias,
  saveContaBancaria,
  updateSaldoContaBancaria,
  ContaBancaria,
} from '../services/v2ContasBancariasService'

const FORMAS_PAGAMENTO_FINANCEIRO: string[] = [
  'Dinheiro',
  'Pix',
  'Cartão Débito',
  'Cartão Crédito',
  'Boleto',
  'Crediário',
]

const DIAS_POR_PAGINA = 30

const STATUS_INFO: Record<Status, { label: string; cls: string; Icon: typeof Clock }> = {
  aberta: { label: 'Aberta', cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Clock },
  vencida: { label: 'Vencida', cls: 'bg-red-50 text-red-700 border-red-200', Icon: AlertCircle },
  parcial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: CircleDot },
  paga: { label: 'Paga', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  cancelada: { label: 'Cancelada', cls: 'bg-slate-50 text-slate-700 border-slate-200', Icon: X },
}

const STATUS_ORDEM: Status[] = ['vencida', 'aberta', 'parcial', 'paga']

const fmtData = (iso: string) => iso.split('-').reverse().join('/')

export function V2ContasPagarPage() {
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [carregando, setCarregando] = useState(true)
  const hoje = useMemo(() => hojeISO(), [])

  // Filtros
  const [tipo, setTipo] = useState<Filtros['tipo']>('todos')
  const [status, setStatus] = useState<ReadonlySet<Status>>(() => new Set())
  const [mes, setMes] = useState('todos')
  const [base, setBase] = useState<BaseData>('vencimento')
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(DIAS_POR_PAGINA)
  const [mesInicializado, setMesInicializado] = useState(false)

  const buscaAdiada = useDeferredValue(busca)

  // Modal de Detalhes do Lançamento / Pedido
  const [detalhesModal, setDetalhesModal] = useState<{
    conta: ContaPagar
    parcela: ContaPagarParcela
  } | null>(null)

  // Modal de Baixa Inteligente
  const [baixaModal, setBaixaModal] = useState<{
    conta: ContaPagar
    parcela: ContaPagarParcela
  } | null>(null)
  const [baixaData, setBaixaData] = useState(() => new Date().toISOString().split('T')[0])
  const [descontoTipo, setDescontoTipo] = useState<'R$' | '%'>('R$')
  const [descontoValor, setDescontoValor] = useState<number>(0)
  const [acrescimoTipo, setAcrescimoTipo] = useState<'R$' | '%'>('R$')
  const [acrescimoValor, setAcrescimoValor] = useState<number>(0)
  const [baixaFormaPagto, setBaixaFormaPagto] = useState('Boleto')
  const [baixaContaTag, setBaixaContaTag] = useState('')
  const [baixaObs, setBaixaObs] = useState('')
  const [valorLiquidoInput, setValorLiquidoInput] = useState<string>('')

  // Contas Bancárias / Carteiras para Baixa
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([])
  const [contaBancariaSelecionadaId, setContaBancariaSelecionadaId] = useState<string>('')
  const [criandoNovaContaTag, setCriandoNovaContaTag] = useState(false)
  const [novoNomeContaTag, setNovoNomeContaTag] = useState('')

  // Modal de Novo Lançamento
  const [novaContaModal, setNovaContaModal] = useState(false)
  const [novaTipo, setNovaTipo] = useState<TipoLancamento>('pagar')
  const [novaDescricao, setNovaDescricao] = useState('')
  const [novaPessoa, setNovaPessoa] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novaTotal, setNovaTotal] = useState<number>(0)
  const [novaVencimento, setNovaVencimento] = useState(() => new Date().toISOString().split('T')[0])
  const [novaQtdParcelas, setNovaQtdParcelas] = useState<number>(1)

  // Carga inicial dos dados
  const recarregar = async () => {
    setCarregando(true)
    try {
      const [dadosContas, bancos] = await Promise.all([
        listContasPagar(),
        listContasBancarias(),
      ])
      setContas(dadosContas)
      setContasBancarias(bancos)
      if (bancos.length > 0 && !contaBancariaSelecionadaId) {
        setContaBancariaSelecionadaId(bancos[0].id)
      }
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void recarregar()
  }, [])

  // Derivações do Extrato
  const movsGerais = useMemo(() => achatar(contas, hoje, 'vencimento'), [contas, hoje])
  const movs = useMemo(() => achatar(contas, hoje, base), [contas, hoje, base])
  const meses = useMemo(() => mesesDisponiveis(movs), [movs])
  const saldoGeral = useMemo(() => totalizar(movsGerais, hoje), [movsGerais, hoje])

  // Inicializa com o mês atual se houver dados
  useEffect(() => {
    if (mesInicializado || carregando) return
    setMesInicializado(true)
    const atual = hoje.slice(0, 7)
    if (movs.some((m) => m.data.startsWith(atual))) setMes(atual)
  }, [carregando, mesInicializado, movs, hoje])

  useEffect(() => {
    setLimite(DIAS_POR_PAGINA)
  }, [tipo, status, mes, base, buscaAdiada])

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
    () => (tipo === 'todos' ? semTipo : semTipo.filter((m) => m.tipo === tipo)),
    [semTipo, tipo],
  )

  const totais = useMemo(() => totalizar(filtrados, hoje), [filtrados, hoje])
  const dias = useMemo(() => agruparPorDia(filtrados), [filtrados])
  const escopo = mes === 'todos' ? 'todo o período' : rotuloMes(mes).toLowerCase()
  const historia = useMemo(
    () => contarHistoria(totais, filtrados, hoje, escopo),
    [totais, filtrados, hoje, escopo],
  )

  const temFiltro = tipo !== 'todos' || status.size > 0 || busca !== '' || mes !== 'todos'

  const limpar = () => {
    setTipo('todos')
    setStatus(new Set())
    setBusca('')
    setMes('todos')
  }

  const alternarStatus = (s: Status) =>
    setStatus((atual) => {
      const novo = new Set(atual)
      if (novo.has(s)) novo.delete(s)
      else novo.add(s)
      return novo
    })

  // Cálculos do Modal de Baixa
  const valorOriginal = baixaModal?.parcela.valor ?? 0
  const valorDescontoCalc =
    descontoTipo === 'R$'
      ? Math.max(0, descontoValor)
      : (valorOriginal * Math.max(0, descontoValor)) / 100
  const valorAcrescimoCalc =
    acrescimoTipo === 'R$'
      ? Math.max(0, acrescimoValor)
      : (valorOriginal * Math.max(0, acrescimoValor)) / 100
  const valorFinalLiquido = Math.max(0, Math.round((valorOriginal - valorDescontoCalc + valorAcrescimoCalc) * 100) / 100)

  const contaBancariaSelecionada = contasBancarias.find((cb) => cb.id === contaBancariaSelecionadaId)
  const saldoPrevistoAposBaixa = contaBancariaSelecionada
    ? Math.round(
        (baixaModal?.conta.tipo === 'receber'
          ? contaBancariaSelecionada.saldoAtual + valorFinalLiquido
          : contaBancariaSelecionada.saldoAtual - valorFinalLiquido) * 100
      ) / 100
    : 0

  function handleValorLiquidoChange(valStr: string) {
    setValorLiquidoInput(valStr)
    const valNum = parseFloat(valStr.replace(',', '.'))
    if (isNaN(valNum) || valNum < 0) {
      setDescontoValor(0)
      setAcrescimoValor(0)
      return
    }

    const diff = Math.round((valNum - valorOriginal) * 100) / 100
    if (diff > 0) {
      setAcrescimoTipo('R$')
      setAcrescimoValor(diff)
      setDescontoValor(0)
    } else if (diff < 0) {
      setDescontoTipo('R$')
      setDescontoValor(Math.abs(diff))
      setAcrescimoValor(0)
    } else {
      setDescontoValor(0)
      setAcrescimoValor(0)
    }
  }

  function handleDescontoChange(novoDesc: number, tipoDesc: 'R$' | '%') {
    setDescontoTipo(tipoDesc)
    setDescontoValor(novoDesc)
    setAcrescimoValor(0)
    const descCalc = tipoDesc === 'R$' ? novoDesc : (valorOriginal * novoDesc) / 100
    const novoLiquido = Math.max(0, Math.round((valorOriginal - descCalc) * 100) / 100)
    setValorLiquidoInput(novoLiquido.toFixed(2))
  }

  function handleAcrescimoChange(novoAcr: number, tipoAcr: 'R$' | '%') {
    setAcrescimoTipo(tipoAcr)
    setAcrescimoValor(novoAcr)
    setDescontoValor(0)
    const acrCalc = tipoAcr === 'R$' ? novoAcr : (valorOriginal * novoAcr) / 100
    const novoLiquido = Math.max(0, Math.round((valorOriginal + acrCalc) * 100) / 100)
    setValorLiquidoInput(novoLiquido.toFixed(2))
  }

  function abrirModalBaixa(conta: ContaPagar, parcela: ContaPagarParcela) {
    setBaixaModal({ conta, parcela })
    setBaixaData(new Date().toISOString().split('T')[0])
    setDescontoTipo('R$')
    setDescontoValor(0)
    setAcrescimoTipo('R$')
    setAcrescimoValor(0)
    setValorLiquidoInput(parcela.valor.toFixed(2))
    setBaixaFormaPagto('Boleto')
    setBaixaObs('')
    setCriandoNovaContaTag(false)
    setNovoNomeContaTag('')
    if (contasBancarias.length > 0) {
      const padrao = contasBancarias[0]
      setContaBancariaSelecionadaId(padrao.id)
      setBaixaContaTag(`#${padrao.nome.replace(/\s+/g, '')}`)
    } else {
      setBaixaContaTag('')
    }
  }

  async function handleCriarNovaContaTag() {
    if (!novoNomeContaTag.trim()) return
    const tagFormatada = novoNomeContaTag.trim().startsWith('#')
      ? novoNomeContaTag.trim()
      : `#${novoNomeContaTag.trim()}`
    const nova = await saveContaBancaria({
      nome: novoNomeContaTag.trim().replace(/^#/, ''),
      tipo: 'carteira',
      saldoAtual: 0,
      cor: '#3B82F6',
      ativo: true,
    })
    const lista = await listContasBancarias()
    setContasBancarias(lista)
    setContaBancariaSelecionadaId(nova.id)
    setBaixaContaTag(tagFormatada)
    setNovoNomeContaTag('')
    setCriandoNovaContaTag(false)
  }

  async function confirmarBaixa() {
    if (!baixaModal) return
    const { conta, parcela } = baixaModal
    const isPagar = (conta.tipo || 'pagar') === 'pagar'

    const contaBancariaObj = contasBancarias.find(
      (cb) => cb.id === contaBancariaSelecionadaId || `#${cb.nome.replace(/\s+/g, '')}`.toLowerCase() === baixaContaTag.trim().toLowerCase()
    )

    const baixaInfo: BaixaParcelaInfo = {
      dataBaixa: baixaData,
      valorOriginal: parcela.valor,
      descontoTipo,
      descontoValor,
      descontoFinal: valorDescontoCalc,
      acrescimoTipo,
      acrescimoValor,
      acrescimoFinal: valorAcrescimoCalc,
      valorFinalPago: valorFinalLiquido,
      formaPagamento: baixaFormaPagto,
      observacao: baixaObs.trim() || undefined,
      contaBancariaId: contaBancariaObj?.id,
      contaBancariaNome: baixaContaTag.trim() || contaBancariaObj?.nome || undefined,
    }

    const novasParcelas = conta.parcelas.map((p) => {
      if (p.numero === parcela.numero) {
        return {
          ...p,
          status: 'paga' as StatusConta,
          baixa: baixaInfo,
        }
      }
      return p
    })

    const totalPagoAtualizado = conta.totalPago + parcela.valor
    const todasPagas = novasParcelas.every((p) => p.status === 'paga')
    const novoStatus: StatusConta = todasPagas ? 'paga' : 'parcial'

    const contaAtualizada: ContaPagar = {
      ...conta,
      parcelas: novasParcelas,
      totalPago: totalPagoAtualizado,
      status: novoStatus,
    }

    await updateContaPagar(contaAtualizada)

    if (contaBancariaObj) {
      const delta = isPagar ? -valorFinalLiquido : valorFinalLiquido
      await updateSaldoContaBancaria(contaBancariaObj.id, delta)
      const bancosAtualizados = await listContasBancarias()
      setContasBancarias(bancosAtualizados)
    }

    setContas((prev) => prev.map((c) => (c.id === contaAtualizada.id ? contaAtualizada : c)))
    setBaixaModal(null)
    setDetalhesModal(null)
  }

  async function handleEstornarParcela(conta: ContaPagar, parcela: ContaPagarParcela) {
    const isPagar = (conta.tipo || 'pagar') === 'pagar'
    const textoAcao = isPagar ? 'pagamento' : 'recebimento'
    const valorEstornado = parcela.baixa?.valorFinalPago ?? parcela.valor
    const conf = window.confirm(
      `Confirma o estorno do ${textoAcao} da parcela #${parcela.numero} (${formatBRL(valorEstornado)})?\n\n` +
      `• O status da parcela voltará para Aberto;\n` +
      (parcela.baixa?.contaBancariaNome ? `• O saldo da conta bancária (${parcela.baixa.contaBancariaNome}) será recomposto.` : '')
    )
    if (!conf) return

    try {
      const atualizada = await estornarBaixaParcela(conta.id, parcela.numero)
      if (atualizada) {
        setContas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
        const bancosAtualizados = await listContasBancarias()
        setContasBancarias(bancosAtualizados)
        setDetalhesModal(null)
      } else {
        alert('Não foi possível realizar o estorno da parcela.')
      }
    } catch {
      alert('Erro ao realizar o estorno da parcela.')
    }
  }

  async function handleSalvarNovaConta(e: React.FormEvent) {
    e.preventDefault()
    if (!novaDescricao.trim() || novaTotal <= 0) return

    const parcelasGeradas: ContaPagarParcela[] = []
    const valorParcelaBase = Math.round((novaTotal / novaQtdParcelas) * 100) / 100
    let soma = 0

    for (let i = 1; i <= novaQtdParcelas; i++) {
      const dt = new Date(novaVencimento + 'T12:00:00')
      dt.setMonth(dt.getMonth() + (i - 1))
      const venc = dt.toISOString().split('T')[0]
      const valor = i === novaQtdParcelas ? Math.round((novaTotal - soma) * 100) / 100 : valorParcelaBase
      soma += valor
      parcelasGeradas.push({
        numero: i,
        vencimento: venc,
        valor,
        status: 'aberta',
      })
    }

    const nova: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'> = {
      tipo: novaTipo,
      descricao: novaDescricao.trim(),
      fornecedor: novaPessoa.trim() || null,
      categoria: novaCategoria.trim() || (novaTipo === 'pagar' ? 'Despesa Geral' : 'Receita Geral'),
      origem: 'avulsa',
      total: novaTotal,
      totalPago: 0,
      status: 'aberta',
      parcelas: parcelasGeradas,
    }

    const criada = await saveContaPagar(nova)
    setContas((prev) => [criada, ...prev])
    setNovaContaModal(false)
    setNovaDescricao('')
    setNovaPessoa('')
    setNovaCategoria('')
    setNovaTotal(0)
    setNovaQtdParcelas(1)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 py-4 sm:py-6">
      {/* ── TOPO ── */}
      <header className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
            <Wallet size={20} aria-hidden />
          </span>
          <div>
            <h1 className="font-hub text-lg sm:text-xl font-bold uppercase tracking-tight text-slate-900">Financeiro</h1>
            <p className="text-xs sm:text-sm text-slate-500">Seu extrato de contas a pagar e a receber</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNovaContaModal(true)}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-700 px-4 py-2.5 text-xs sm:text-sm font-semibold uppercase text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:scale-[0.99] cursor-pointer"
        >
          <Plus size={16} aria-hidden />
          <span>Novo lançamento</span>
        </button>
      </header>

      {/* ── SALDO + KPIS ── */}
      <section className="grid gap-2.5 sm:gap-3 lg:grid-cols-[1.35fr_1fr]" aria-label="Resumo">
        <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 p-4 sm:p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Saldo em caixa</p>
          {carregando ? (
            <div className="mt-3 h-8 sm:h-10 w-44 sm:w-48 animate-pulse rounded-lg bg-white/20" />
          ) : (
            <p className="mt-1 font-hub text-2xl sm:text-4xl font-bold tabular-nums break-words leading-tight">{formatBRL(saldoGeral.saldoRealizado)}</p>
          )}
          <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2 sm:gap-3 border-t border-white/15 pt-3 text-xs sm:text-sm">
            <div>
              <p className="text-[10px] sm:text-xs uppercase text-blue-100 font-medium">Projetado</p>
              <p className="font-semibold tabular-nums mt-0.5 truncate">{carregando ? '—' : formatBRL(saldoGeral.saldoProjetado)}</p>
            </div>
            <div>
              <p className="text-[10px] sm:text-xs uppercase text-blue-100 font-medium">Vencido</p>
              <p className="font-semibold tabular-nums mt-0.5 truncate">
                {carregando ? '—' : formatBRL(saldoGeral.vencidoPagar + saldoGeral.vencidoReceber)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Kpi rotulo="Recebido" valor={totais.recebido} cor="text-emerald-600" carregando={carregando} />
          <Kpi rotulo="Pago" valor={totais.pago} cor="text-rose-600" carregando={carregando} />
          <Kpi rotulo="A receber" valor={totais.aReceber} cor="text-emerald-600" carregando={carregando} />
          <Kpi rotulo="A pagar" valor={totais.aPagar} cor="text-rose-600" carregando={carregando} />
        </div>
      </section>

      {/* ── STORYTELLING ── */}
      {!carregando && (
        <section
          aria-live="polite"
          className={`mt-3 rounded-2xl border border-l-4 bg-white p-3.5 sm:p-4 shadow-sm ${
            historia.tom === 'atencao'
              ? 'border-amber-200 border-l-amber-500'
              : historia.tom === 'positivo'
                ? 'border-emerald-100 border-l-emerald-500'
                : 'border-slate-200 border-l-slate-300'
          }`}
        >
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">{historia.titulo}</h2>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-600">{historia.texto}</p>
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="sticky top-0 z-10 -mx-3 sm:-mx-6 mt-4 space-y-2.5 bg-[#eff5ee]/95 px-3 sm:px-6 py-2.5 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div role="tablist" aria-label="Tipo de conta" className="flex overflow-x-auto no-scrollbar rounded-xl bg-white p-1 shadow-xs shrink-0 max-w-full">
            <Aba ativa={tipo === 'todos'} onClick={() => setTipo('todos')} texto={`Todos (${contagem.todos})`} />
            <Aba ativa={tipo === 'pagar'} onClick={() => setTipo('pagar')} texto={`A pagar (${contagem.pagar})`} />
            <Aba ativa={tipo === 'receber'} onClick={() => setTipo('receber')} texto={`A receber (${contagem.receber})`} />
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Buscar lançamentos</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar descrição, fornecedor..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-2 text-xs sm:text-sm">
              <span className="text-[10px] sm:text-xs font-semibold uppercase text-slate-500">Mês</span>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none text-xs sm:text-sm max-w-[110px] sm:max-w-none cursor-pointer"
              >
                <option value="todos">Todos</option>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {rotuloMes(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white p-1 shadow-xs shrink-0" role="group" aria-label="Base da data">
            <Aba ativa={base === 'vencimento'} onClick={() => setBase('vencimento')} texto="Vencimento" />
            <Aba ativa={base === 'pagamento'} onClick={() => setBase('pagamento')} texto="Pagamento" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {STATUS_ORDEM.map((s) => {
              const { label, cls, Icon } = STATUS_INFO[s]
              const ativo = status.has(s)
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => alternarStatus(s)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] sm:text-xs font-semibold uppercase transition cursor-pointer ${
                    ativo ? `${cls} border-current shadow-xs` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Icon size={11} aria-hidden /> {label}
                </button>
              )
            })}
          </div>
          {temFiltro && (
            <button
              type="button"
              onClick={limpar}
              className="ml-auto inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold uppercase text-blue-700 hover:underline cursor-pointer"
            >
              <X size={12} aria-hidden /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── EXTRATO AGRUPADO POR DIA ── */}
      <main className="mt-2 space-y-3" aria-busy={carregando}>
        {carregando ? (
          <Esqueleto />
        ) : dias.length === 0 ? (
          <VazioEstado temFiltro={temFiltro} onLimpar={limpar} />
        ) : (
          <>
            {dias.slice(0, limite).map((d) => (
              <Dia
                key={d.data}
                dia={d}
                hoje={hoje}
                onBaixar={(conta, parcela) => abrirModalBaixa(conta, parcela)}
                onVerDetalhes={(conta, parcela) => setDetalhesModal({ conta, parcela })}
              />
            ))}
            {dias.length > limite && (
              <button
                type="button"
                onClick={() => setLimite((l) => l + DIAS_POR_PAGINA)}
                className="mx-auto block rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:border-slate-300 shadow-sm transition cursor-pointer"
              >
                Ver mais dias ({dias.length - limite} restantes)
              </button>
            )}
          </>
        )}
      </main>

      {/* ── MODAL DE BAIXA COM DESCONTO, ACRÉSCIMO E CONTA BANCÁRIA ── */}
      {baixaModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="baixa-modal-title"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
        >
          <div className="relative flex flex-col w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden my-auto border border-slate-100">
            {/* Cabeçalho Fixo */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 shrink-0 bg-white">
              <div className="min-w-0 pr-2">
                <h3 id="baixa-modal-title" className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Baixar Parcela #{baixaModal.parcela.numero}
                </h3>
                <p className="text-xs text-slate-500 truncate mt-0.5 max-w-[260px] sm:max-w-md">
                  {baixaModal.conta.descricao}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBaixaModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 cursor-pointer"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Corpo Rolável */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3.5">
              {/* Valor Original */}
              <div className="bg-slate-50 p-3 sm:px-3.5 sm:py-2.5 rounded-xl border border-slate-200/80 flex justify-between items-center">
                <span className="text-xs sm:text-sm text-slate-500 font-semibold">Valor Nominal</span>
                <span className="text-base sm:text-lg font-black text-slate-900 tabular-nums">
                  {formatBRL(baixaModal.parcela.valor)}
                </span>
              </div>

              {/* Data da Baixa */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Data do Pagamento / Liquidação
                </label>
                <input
                  type="date"
                  value={baixaData}
                  onChange={(e) => setBaixaData(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500 bg-white"
                />
              </div>

              {/* Campo Direto: Valor Líquido Pago */}
              <div className="bg-blue-50/40 p-3 sm:p-3.5 rounded-xl border border-blue-200/70">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1.5">
                  <label className="text-xs sm:text-sm font-black text-slate-900">
                    💵 Valor Líquido Pago / Recebido (R$)
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">Calcula desconto/acréscimo automático</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={valorLiquidoInput}
                  onChange={(e) => handleValorLiquidoChange(e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 rounded-xl border-2 border-blue-500 text-base sm:text-lg font-black text-blue-900 outline-none bg-white tabular-nums shadow-xs"
                />
              </div>

              {/* Desconto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Desconto Concedido / Obtido
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDescontoChange(descontoValor, 'R$')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        descontoTipo === 'R$' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDescontoChange(descontoValor, '%')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        descontoTipo === '%' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={descontoValor || ''}
                    onChange={(e) => handleDescontoChange(Number(e.target.value), descontoTipo)}
                    className="flex-1 min-w-[90px] px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                  />
                  {valorDescontoCalc > 0 && (
                    <div className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl shrink-0">
                      -{formatBRL(valorDescontoCalc)}
                    </div>
                  )}
                </div>
              </div>

              {/* Acréscimo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Acréscimo (Juros / Multa / Taxa)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAcrescimoChange(acrescimoValor, 'R$')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        acrescimoTipo === 'R$' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcrescimoChange(acrescimoValor, '%')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        acrescimoTipo === '%' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={acrescimoValor || ''}
                    onChange={(e) => handleAcrescimoChange(Number(e.target.value), acrescimoTipo)}
                    className="flex-1 min-w-[90px] px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                  />
                  {valorAcrescimoCalc > 0 && (
                    <div className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 rounded-xl shrink-0">
                      +{formatBRL(valorAcrescimoCalc)}
                    </div>
                  )}
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={baixaFormaPagto}
                  onChange={(e) => setBaixaFormaPagto(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold outline-none bg-white focus:border-blue-500"
                >
                  {FORMAS_PAGAMENTO_FINANCEIRO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conta Bancária / Carteira (Tag de Saída / Entrada) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Tag size={13} className="text-blue-600" />
                    Conta de Saída (Tag / Origem do Recurso)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCriandoNovaContaTag(!criandoNovaContaTag)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-bold cursor-pointer"
                  >
                    {criandoNovaContaTag ? 'Cancelar' : '+ Nova Conta'}
                  </button>
                </div>

                {criandoNovaContaTag ? (
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Nome da nova conta (ex: Santander PJ, Cofre)"
                      value={novoNomeContaTag}
                      onChange={(e) => setNovoNomeContaTag(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-blue-400 text-xs sm:text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCriarNovaContaTag}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer shrink-0"
                    >
                      Salvar
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder="Ex: #Inter, #Caixa, #BB, #Nubank"
                      value={baixaContaTag}
                      onChange={(e) => {
                        const val = e.target.value
                        setBaixaContaTag(val)
                        const correspondente = contasBancarias.find(
                          (c) => `#${c.nome.replace(/\s+/g, '')}`.toLowerCase() === val.trim().toLowerCase() || c.nome.toLowerCase() === val.trim().toLowerCase()
                        )
                        if (correspondente) setContaBancariaSelecionadaId(correspondente.id)
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                    />

                    {/* Chips de Atalho das Contas Cadastradas */}
                    {contasBancarias.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto">
                        {contasBancarias.map((cb) => {
                          const tagFormatada = `#${cb.nome.replace(/\s+/g, '')}`
                          const isSel = baixaContaTag === tagFormatada || contaBancariaSelecionadaId === cb.id
                          return (
                            <button
                              key={cb.id}
                              type="button"
                              onClick={() => {
                                setBaixaContaTag(tagFormatada)
                                setContaBancariaSelecionadaId(cb.id)
                              }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
                                isSel
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-xs'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {tagFormatada} ({formatBRL(cb.saldoAtual)})
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Exibição em Tempo Real do Saldo da Conta */}
                {contaBancariaSelecionada && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Saldo Atual Disponível:</span>
                      <strong className={`tabular-nums ${contaBancariaSelecionada.saldoAtual >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        {formatBRL(contaBancariaSelecionada.saldoAtual)}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center border-t border-slate-200 pt-1.5">
                      <span className="text-slate-500 font-medium">
                        {baixaModal.conta.tipo === 'receber' ? 'Saldo após o recebimento:' : 'Saldo após o pagamento:'}
                      </span>
                      <strong className={`tabular-nums ${saldoPrevistoAposBaixa >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}`}>
                        {formatBRL(saldoPrevistoAposBaixa)}
                      </strong>
                    </div>

                    {baixaModal.conta.tipo !== 'receber' && saldoPrevistoAposBaixa < 0 && (
                      <span className="block text-[11px] text-rose-600 font-semibold mt-1">
                        ⚠️ Saldo da conta ficará negativo após esta baixa.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé Fixo com Total e Ações (Sempre visível em qualquer altura de tela) */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/95 shrink-0 space-y-3">
              <div className="bg-blue-50/80 border border-blue-200/80 p-3 sm:px-4 sm:py-2.5 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wide block">
                    Valor Efetivo da Baixa
                  </span>
                  <p className="text-[11px] text-slate-500 truncate">
                    Nominal: {formatBRL(valorOriginal)}
                    {valorDescontoCalc > 0 ? ` - ${formatBRL(valorDescontoCalc)}` : ''}
                    {valorAcrescimoCalc > 0 ? ` + ${formatBRL(valorAcrescimoCalc)}` : ''}
                  </p>
                </div>
                <span className="text-lg sm:text-xl font-black text-blue-900 tabular-nums shrink-0">
                  {formatBRL(valorFinalLiquido)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setBaixaModal(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarBaixa}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border-none bg-emerald-600 text-white text-xs sm:text-sm font-black hover:bg-emerald-700 transition shadow-sm shadow-emerald-600/20 cursor-pointer"
                >
                  Confirmar Baixa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE DETALHES DO LANÇAMENTO / PEDIDO (COM BOTÃO ESTORNAR) ── */}
      {detalhesModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
        >
          <div className="relative flex flex-col w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden my-auto border border-slate-100">
            {/* Header Fixo */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 shrink-0 bg-white">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    detalhesModal.conta.tipo === 'receber' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <Eye size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                    Visualizar Lançamento
                  </h3>
                  <span className="text-xs text-slate-500 block truncate">
                    {detalhesModal.conta.tipo === 'receber' ? 'Conta a Receber' : 'Conta a Pagar'} · Parcela #{detalhesModal.parcela.numero} de {detalhesModal.conta.parcelas.length}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetalhesModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 cursor-pointer"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Informações Gerais da Conta / Pedido (Scrollable) */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3.5">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                  Descrição / Origem
                </span>
                <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                  {detalhesModal.conta.descricao}
                </p>
                {detalhesModal.conta.origem === 'compra' && (
                  <span className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                    📦 Gerado a partir de Pedido de Compra
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 font-semibold block">
                    {detalhesModal.conta.tipo === 'receber' ? 'Cliente' : 'Fornecedor'}
                  </span>
                  <strong className="text-xs sm:text-sm text-slate-900 block mt-0.5 truncate">
                    {detalhesModal.conta.fornecedor || 'Não informado'}
                  </strong>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 font-semibold block">
                    Categoria
                  </span>
                  <strong className="text-xs sm:text-sm text-slate-900 block mt-0.5 truncate">
                    {detalhesModal.conta.categoria || 'Geral'}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 font-semibold block">
                    Vencimento Nominal
                  </span>
                  <strong className="text-xs sm:text-sm text-slate-900 block mt-0.5">
                    {fmtData(detalhesModal.parcela.vencimento)}
                  </strong>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 font-semibold block">
                    Valor Nominal
                  </span>
                  <strong className="text-sm sm:text-base text-slate-900 font-black block mt-0.5 tabular-nums">
                    {formatBRL(detalhesModal.parcela.valor)}
                  </strong>
                </div>
              </div>

              {/* Status e Dados da Quitação (se Paga) */}
              {detalhesModal.parcela.status === 'paga' ? (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-black text-emerald-800">
                      <CheckCircle2 size={16} /> Parcela Liquidada / Paga
                    </span>
                    <span className="text-xs font-bold text-emerald-700">
                      {detalhesModal.parcela.baixa?.dataBaixa ? `Em ${fmtData(detalhesModal.parcela.baixa.dataBaixa)}` : 'Confirmada'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 pt-1">
                    <div>
                      <span className="text-slate-500 block">Forma de Pagamento:</span>
                      <strong className="text-slate-900 font-bold">
                        {detalhesModal.parcela.baixa?.formaPagamento || 'Boleto'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Conta de Saída (Tag):</span>
                      <strong className="text-blue-700 font-bold">
                        {detalhesModal.parcela.baixa?.contaBancariaNome || 'Não especificada'}
                      </strong>
                    </div>
                    {detalhesModal.parcela.baixa?.descontoFinal ? (
                      <div>
                        <span className="text-slate-500 block">Desconto Obtido:</span>
                        <strong className="text-emerald-700 font-bold">
                          -{formatBRL(detalhesModal.parcela.baixa.descontoFinal)}
                        </strong>
                      </div>
                    ) : null}
                    {detalhesModal.parcela.baixa?.acrescimoFinal ? (
                      <div>
                        <span className="text-slate-500 block">Acréscimo / Juros:</span>
                        <strong className="text-rose-700 font-bold">
                          +{formatBRL(detalhesModal.parcela.baixa.acrescimoFinal)}
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-emerald-200/80 pt-2.5 flex justify-between items-center">
                    <span className="text-xs sm:text-sm font-bold text-emerald-900">
                      Valor Líquido Baixado:
                    </span>
                    <span className="text-base sm:text-lg font-black text-emerald-800 tabular-nums">
                      {formatBRL(detalhesModal.parcela.baixa?.valorFinalPago ?? detalhesModal.parcela.valor)}
                    </span>
                  </div>

                  {detalhesModal.parcela.baixa?.observacao && (
                    <p className="text-xs text-slate-600 italic">
                      Obs: {detalhesModal.parcela.baixa.observacao}
                    </p>
                  )}

                  {/* ── BOTÃO ESTORNAR (DENTRO DO MODAL DE VISUALIZAÇÃO) ── */}
                  <button
                    type="button"
                    onClick={() => handleEstornarParcela(detalhesModal.conta, detalhesModal.parcela)}
                    className="w-full mt-2 py-2.5 px-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    <span>Estornar Pagamento da Parcela</span>
                  </button>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const c = detalhesModal.conta
                      const p = detalhesModal.parcela
                      setDetalhesModal(null)
                      abrirModalBaixa(c, p)
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition cursor-pointer shadow-sm shadow-blue-600/20"
                  >
                    <span>Realizar Baixa / Liquidar Parcela</span>
                  </button>
                </div>
              )}
            </div>

            {/* Rodapé Fixo */}
            <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setDetalhesModal(null)}
                className="w-full sm:w-auto px-5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-100 transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE NOVO LANÇAMENTO (PAGAR OU RECEBER) ── */}
      {novaContaModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
        >
          <div className="relative flex flex-col w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden my-auto border border-slate-100">
            {/* Header Fixo */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 shrink-0 bg-white">
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Novo Lançamento Financeiro
              </h3>
              <button
                type="button"
                onClick={() => setNovaContaModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 cursor-pointer"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaConta} className="flex-1 overflow-y-auto flex flex-col">
              {/* Form Body Scrollable */}
              <div className="px-4 sm:px-6 py-4 space-y-3.5 flex-1">
                {/* Tipo de Operação */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNovaTipo('pagar')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                      novaTipo === 'pagar' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Conta a Pagar (Despesa)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNovaTipo('receber')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                      novaTipo === 'receber' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Conta a Receber (Receita)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Descrição *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Aluguel da Loja, Manutenção, Venda Avulsa..."
                    value={novaDescricao}
                    onChange={(e) => setNovaDescricao(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {novaTipo === 'pagar' ? 'Fornecedor / Beneficiário' : 'Cliente / Pagador'}
                    </label>
                    <input
                      type="text"
                      placeholder="Nome da pessoa ou empresa"
                      value={novaPessoa}
                      onChange={(e) => setNovaPessoa(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Categoria
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Operacional, Marketing, Salários..."
                      value={novaCategoria}
                      onChange={(e) => setNovaCategoria(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Valor Total (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0,00"
                      value={novaTotal || ''}
                      onChange={(e) => setNovaTotal(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold outline-none focus:border-blue-500 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      1º Vencimento *
                    </label>
                    <input
                      type="date"
                      required
                      value={novaVencimento}
                      onChange={(e) => setNovaVencimento(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nº Parcelas
                    </label>
                    <select
                      value={novaQtdParcelas}
                      onChange={(e) => setNovaQtdParcelas(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-blue-500 bg-white cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                        <option key={num} value={num}>
                          {num === 1 ? '1x À vista' : `${num}x Parcelas`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Rodapé Fixo */}
              <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setNovaContaModal(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border-none bg-blue-700 text-white text-xs sm:text-sm font-black hover:bg-blue-800 transition shadow-sm shadow-blue-700/20 cursor-pointer"
                >
                  Criar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================== PARTES ============================== */

function Kpi({ rotulo, valor, cor, carregando }: { rotulo: string; valor: number; cor: string; carregando: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4 shadow-sm min-w-0">
      <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">{rotulo}</p>
      {carregando ? (
        <div className="mt-2 h-6 w-20 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className={`mt-1 font-hub text-base sm:text-lg font-bold tabular-nums truncate ${cor}`}>{formatBRL(valor)}</p>
      )}
    </div>
  )
}

function Aba({ ativa, onClick, texto }: { ativa: boolean; onClick: () => void; texto: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold uppercase transition cursor-pointer whitespace-nowrap ${
        ativa ? 'bg-blue-700 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {texto}
    </button>
  )
}

const dayStyle: CSSProperties = { contentVisibility: 'auto', containIntrinsicSize: '0 160px' }

const Dia = memo(function Dia({
  dia,
  hoje,
  onBaixar,
  onVerDetalhes,
}: {
  dia: DiaExtrato
  hoje: string
  onBaixar: (conta: ContaPagar, parcela: ContaPagarParcela) => void
  onVerDetalhes: (conta: ContaPagar, parcela: ContaPagarParcela) => void
}) {
  const { titulo, sub } = rotuloDia(dia.data, hoje)
  return (
    <section style={dayStyle} aria-label={`${titulo}, ${sub}`}>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-800">
          {titulo} <span className="text-[11px] sm:text-xs font-normal uppercase text-slate-400">{sub}</span>
        </h3>
        {dia.saldoDia !== 0 && (
          <span className={`text-[11px] sm:text-xs font-semibold tabular-nums ${dia.saldoDia > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {dia.saldoDia > 0 ? '+' : '−'} {formatBRL(Math.abs(dia.saldoDia))} em baixas
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {dia.movimentos.map((m) => (
          <Linha
            key={m.id}
            m={m}
            onBaixar={() => onBaixar(m.contaOriginal, m.parcelaOriginal)}
            onVerDetalhes={() => onVerDetalhes(m.contaOriginal, m.parcelaOriginal)}
          />
        ))}
      </ul>
    </section>
  )
})

const Linha = memo(function Linha({
  m,
  onBaixar,
  onVerDetalhes,
}: {
  m: Movimento
  onBaixar: () => void
  onVerDetalhes: () => void
}) {
  const receber = m.tipo === 'receber'
  const { label, cls, Icon } = STATUS_INFO[m.status] || STATUS_INFO.aberta
  const Seta = receber ? ArrowDownLeft : ArrowUpRight
  const detalhe = [
    m.contraparte,
    m.totalParcelas > 1 ? `parcela ${m.numero}/${m.totalParcelas}` : null,
    m.status === 'paga' && m.pagoEm ? `paga em ${fmtData(m.pagoEm)}` : `vence ${fmtData(m.vencimento)}`,
    m.parcelaOriginal.baixa?.contaBancariaNome ? `🏦 ${m.parcelaOriginal.baixa.contaBancariaNome}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      onClick={onVerDetalhes}
      className="p-3 sm:px-4 sm:py-3 hover:bg-slate-50/80 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3"
      title="Clique para visualizar detalhes do lançamento"
    >
      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        <span
          className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 sm:mt-0 ${
            receber ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}
          title={receber ? 'A receber' : 'A pagar'}
        >
          <Seta size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 sm:block">
            <p className="line-clamp-2 text-xs sm:text-sm font-semibold text-slate-900 leading-snug">{m.descricao}</p>
            {/* Em telas menores (mobile), valor destacado no topo direito */}
            <span className={`sm:hidden text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap shrink-0 ${receber ? 'text-emerald-600' : 'text-rose-600'}`}>
              {receber ? '+' : '−'} {formatBRL(m.valor)}
            </span>
          </div>
          <p className="truncate text-[11px] sm:text-xs text-slate-500 mt-0.5">{detalhe}</p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pt-1.5 sm:pt-0 border-t border-slate-50 sm:border-0 shrink-0">
        <div className="flex items-center sm:flex-col sm:items-end gap-2 sm:gap-1">
          <span className={`hidden sm:inline text-sm font-bold tabular-nums ${receber ? 'text-emerald-600' : 'text-rose-600'}`}>
            {receber ? '+' : '−'} {formatBRL(m.valor)}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase ${cls}`}>
            <Icon size={10} aria-hidden />
            {m.status === 'parcial' ? `Faltam ${formatBRL(m.restante)}` : label}
          </span>
        </div>

        {/* Ações da Parcela: Baixar ou Visualizar */}
        {m.status !== 'paga' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onBaixar()
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition border min-h-[30px] cursor-pointer ${
              receber
                ? 'border-emerald-600 text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100'
                : 'border-rose-600 text-rose-600 hover:bg-rose-50 active:bg-rose-100'
            }`}
          >
            Baixar
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onVerDetalhes()
            }}
            title="Visualizar detalhes do pedido e opções"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-xs min-h-[30px] cursor-pointer"
          >
            <Eye size={12} aria-hidden />
            Visualizar
          </button>
        )}
      </div>
    </li>
  )
})

function Esqueleto() {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando extrato">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-3 border-b border-slate-50 px-4 py-3 last:border-0">
              <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function VazioEstado({ temFiltro, onLimpar }: { temFiltro: boolean; onLimpar: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <Inbox size={28} className="text-slate-400" aria-hidden />
      <p className="mt-3 text-base font-semibold text-slate-800">
        {temFiltro ? 'Nada encontrado com esses filtros' : 'Nenhum lançamento ainda'}
      </p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {temFiltro
          ? 'Tente outro mês ou remova algum filtro para ver mais movimentos.'
          : 'Quando você criar contas a pagar ou receber, elas aparecem aqui em forma de extrato.'}
      </p>
      {temFiltro && (
        <button type="button" onClick={onLimpar} className="mt-4 text-sm font-semibold uppercase text-blue-700 hover:underline">
          Limpar filtros
        </button>
      )}
    </div>
  )
}
