import { memo, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock,
  Inbox,
  Plus,
  RotateCcw,
  Search,
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
  const [baixaFormaPagto, setBaixaFormaPagto] = useState('PIX')
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
    setBaixaFormaPagto('PIX')
    setBaixaObs('')
    setCriandoNovaContaTag(false)
    setNovoNomeContaTag('')
    if (contasBancarias.length > 0 && !contaBancariaSelecionadaId) {
      setContaBancariaSelecionadaId(contasBancarias[0].id)
    }
  }

  async function handleCriarNovaContaTag() {
    if (!novoNomeContaTag.trim()) return
    const nova = await saveContaBancaria({
      nome: novoNomeContaTag.trim(),
      tipo: 'carteira',
      saldoAtual: 0,
      cor: '#3B82F6',
      ativo: true,
    })
    const lista = await listContasBancarias()
    setContasBancarias(lista)
    setContaBancariaSelecionadaId(nova.id)
    setNovoNomeContaTag('')
    setCriandoNovaContaTag(false)
  }

  async function confirmarBaixa() {
    if (!baixaModal) return
    const { conta, parcela } = baixaModal
    const isPagar = (conta.tipo || 'pagar') === 'pagar'

    const contaBancariaObj = contasBancarias.find((cb) => cb.id === contaBancariaSelecionadaId)

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
      contaBancariaNome: contaBancariaObj?.nome,
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
  }

  async function handleEstornarParcela(conta: ContaPagar, parcela: ContaPagarParcela) {
    if (!parcela.baixa) return
    const isPagar = (conta.tipo || 'pagar') === 'pagar'
    const textoAcao = isPagar ? 'pagamento' : 'recebimento'
    const conf = window.confirm(
      `Confirma o estorno do ${textoAcao} da parcela #${parcela.numero} (${formatBRL(parcela.baixa.valorFinalPago)})?\n\n` +
      `• O status da parcela voltará para Aberto;\n` +
      `• O saldo da conta bancária (${parcela.baixa.contaBancariaNome || 'vinculada'}) será recomposto.`
    )
    if (!conf) return

    try {
      const atualizada = await estornarBaixaParcela(conta.id, parcela.numero)
      if (atualizada) {
        setContas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
        const bancosAtualizados = await listContasBancarias()
        setContasBancarias(bancosAtualizados)
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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* ── TOPO ── */}
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
            <Wallet size={20} aria-hidden />
          </span>
          <div>
            <h1 className="font-hub text-xl font-bold uppercase tracking-tight text-slate-900">Financeiro</h1>
            <p className="text-sm text-slate-500">Seu extrato de contas a pagar e a receber</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNovaContaModal(true)}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold uppercase text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Plus size={16} aria-hidden />
          <span className="sm:hidden">Novo</span>
          <span className="hidden sm:inline">Novo lançamento</span>
        </button>
      </header>

      {/* ── SALDO + KPIS ── */}
      <section className="grid gap-3 lg:grid-cols-[1.35fr_1fr]" aria-label="Resumo">
        <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Saldo em caixa</p>
          {carregando ? (
            <div className="mt-3 h-10 w-48 animate-pulse rounded-lg bg-white/20" />
          ) : (
            <p className="mt-1 font-hub text-4xl font-bold tabular-nums">{formatBRL(saldoGeral.saldoRealizado)}</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-sm">
            <div>
              <p className="text-xs uppercase text-blue-100">Projetado</p>
              <p className="font-semibold tabular-nums">{carregando ? '—' : formatBRL(saldoGeral.saldoProjetado)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-blue-100">Vencido</p>
              <p className="font-semibold tabular-nums">
                {carregando ? '—' : formatBRL(saldoGeral.vencidoPagar + saldoGeral.vencidoReceber)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          className={`mt-3 rounded-2xl border border-l-4 bg-white p-4 shadow-sm ${
            historia.tom === 'atencao'
              ? 'border-amber-200 border-l-amber-500'
              : historia.tom === 'positivo'
                ? 'border-emerald-100 border-l-emerald-500'
                : 'border-slate-200 border-l-slate-300'
          }`}
        >
          <h2 className="text-base font-semibold text-slate-900">{historia.titulo}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{historia.texto}</p>
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 space-y-2 bg-[#eff5ee]/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Tipo de conta" className="flex rounded-xl bg-white p-1 shadow-sm">
            <Aba ativa={tipo === 'todos'} onClick={() => setTipo('todos')} texto={`Todos (${contagem.todos})`} />
            <Aba ativa={tipo === 'pagar'} onClick={() => setTipo('pagar')} texto={`A pagar (${contagem.pagar})`} />
            <Aba ativa={tipo === 'receber'} onClick={() => setTipo('receber')} texto={`A receber (${contagem.receber})`} />
          </div>

          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Buscar lançamentos</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar descrição, fornecedor ou cliente"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-500">Mês</span>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none"
            >
              <option value="todos">Todos os meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white p-1 shadow-sm" role="group" aria-label="Base da data">
            <Aba ativa={base === 'vencimento'} onClick={() => setBase('vencimento')} texto="Por vencimento" />
            <Aba ativa={base === 'pagamento'} onClick={() => setBase('pagamento')} texto="Por pagamento" />
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
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase transition ${
                    ativo ? `${cls} border-current` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Icon size={12} aria-hidden /> {label}
                </button>
              )
            })}
          </div>
          {temFiltro && (
            <button
              type="button"
              onClick={limpar}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold uppercase text-blue-700 hover:underline"
            >
              <X size={12} aria-hidden /> Limpar filtros
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
                onEstornar={(conta, parcela) => handleEstornarParcela(conta, parcela)}
              />
            ))}
            {dias.length > limite && (
              <button
                type="button"
                onClick={() => setLimite((l) => l + DIAS_POR_PAGINA)}
                className="mx-auto block rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 shadow-sm"
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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0F172A' }}>
                  Baixar Parcela #{baixaModal.parcela.numero}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  {baixaModal.conta.descricao}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBaixaModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Valor Original */}
              <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Valor Nominal</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{formatBRL(baixaModal.parcela.valor)}</span>
              </div>

              {/* Data da Baixa */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Data do Pagamento / Liquidação
                </label>
                <input
                  type="date"
                  value={baixaData}
                  onChange={(e) => setBaixaData(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Campo Direto: Valor Líquido Pago */}
              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #CBD5E1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                    💵 Valor Líquido Pago / Recebido (R$)
                  </label>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Calcula desconto/acréscimo automático</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={valorLiquidoInput}
                  onChange={(e) => handleValorLiquidoChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '2px solid #3B82F6',
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#1E3A8A',
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#FFFFFF',
                  }}
                />
              </div>

              {/* Desconto */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Desconto Concedido / Obtido
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => handleDescontoChange(descontoValor, 'R$')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: descontoTipo === 'R$' ? '#FFFFFF' : 'transparent',
                        color: descontoTipo === 'R$' ? '#0F172A' : '#64748B',
                        boxShadow: descontoTipo === 'R$' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDescontoChange(descontoValor, '%')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: descontoTipo === '%' ? '#FFFFFF' : 'transparent',
                        color: descontoTipo === '%' ? '#0F172A' : '#64748B',
                        boxShadow: descontoTipo === '%' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
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
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {valorDescontoCalc > 0 && (
                    <div style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', borderRadius: 8, alignSelf: 'center' }}>
                      -{formatBRL(valorDescontoCalc)}
                    </div>
                  )}
                </div>
              </div>

              {/* Acréscimo */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Acréscimo (Juros / Multa / Taxa)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => handleAcrescimoChange(acrescimoValor, 'R$')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: acrescimoTipo === 'R$' ? '#FFFFFF' : 'transparent',
                        color: acrescimoTipo === 'R$' ? '#0F172A' : '#64748B',
                        boxShadow: acrescimoTipo === 'R$' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcrescimoChange(acrescimoValor, '%')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: acrescimoTipo === '%' ? '#FFFFFF' : 'transparent',
                        color: acrescimoTipo === '%' ? '#0F172A' : '#64748B',
                        boxShadow: acrescimoTipo === '%' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
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
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {valorAcrescimoCalc > 0 && (
                    <div style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', borderRadius: 8, alignSelf: 'center' }}>
                      +{formatBRL(valorAcrescimoCalc)}
                    </div>
                  )}
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Forma de Pagamento
                </label>
                <select
                  value={baixaFormaPagto}
                  onChange={(e) => setBaixaFormaPagto(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', background: '#FFFFFF' }}
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto Bancário</option>
                  <option value="TRANSFERENCIA">Transferência / TED</option>
                  <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                  <option value="CARTAO_DEBITO">Cartão de Débito</option>
                  <option value="DINHEIRO">Dinheiro em Espécie</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              {/* Conta Bancária / Carteira (Tag) e Saldo */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Conta Bancária / Carteira (Tag de Liquidação)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCriandoNovaContaTag(!criandoNovaContaTag)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {criandoNovaContaTag ? 'Cancelar nova' : '+ Nova Conta / Tag'}
                  </button>
                </div>

                {criandoNovaContaTag ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input
                      type="text"
                      placeholder="Nome da nova conta (ex: Santander PJ, Carteira 2)"
                      value={novoNomeContaTag}
                      onChange={(e) => setNovoNomeContaTag(e.target.value)}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #3B82F6', fontSize: 13, outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={handleCriarNovaContaTag}
                      style={{ padding: '0 14px', borderRadius: 8, background: '#2563EB', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Salvar
                    </button>
                  </div>
                ) : (
                  <select
                    value={contaBancariaSelecionadaId}
                    onChange={(e) => {
                      if (e.target.value === '__NOVA__') {
                        setCriandoNovaContaTag(true)
                      } else {
                        setContaBancariaSelecionadaId(e.target.value)
                      }
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', background: '#FFFFFF' }}
                  >
                    {contasBancarias.map((cb) => (
                      <option key={cb.id} value={cb.id}>
                        {cb.nome} · Saldo: {formatBRL(cb.saldoAtual)}
                      </option>
                    ))}
                    <option value="__NOVA__">+ Cadastrar outra conta...</option>
                  </select>
                )}

                {/* Exibição em Tempo Real do Saldo da Conta */}
                {contaBancariaSelecionada && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#F8FAFC',
                      border: '1.5px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Saldo Atual Disponível:</span>
                      <strong style={{ fontSize: 13, color: contaBancariaSelecionada.saldoAtual >= 0 ? '#0F172A' : '#DC2626' }}>
                        {formatBRL(contaBancariaSelecionada.saldoAtual)}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderTop: '1px solid #E2E8F0', paddingTop: 4 }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>
                        {baixaModal.conta.tipo === 'receber' ? 'Saldo após o recebimento:' : 'Saldo após o pagamento:'}
                      </span>
                      <strong
                        style={{
                          fontSize: 13,
                          color: saldoPrevistoAposBaixa >= 0 ? '#16A34A' : '#DC2626',
                        }}
                      >
                        {formatBRL(saldoPrevistoAposBaixa)}
                      </strong>
                    </div>

                    {baixaModal.conta.tipo !== 'receber' && saldoPrevistoAposBaixa < 0 && (
                      <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>
                        ⚠️ Saldo da conta ficará negativo após esta baixa.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Total Final a Liquidar */}
              <div
                style={{
                  background: '#EFF6FF',
                  border: '1.5px solid #BFDBFE',
                  padding: '14px 16px',
                  borderRadius: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 6,
                }}
              >
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                    Valor Efetivo da Baixa
                  </span>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748B' }}>
                    Nominal: {formatBRL(valorOriginal)} {valorDescontoCalc > 0 ? ` - ${formatBRL(valorDescontoCalc)}` : ''} {valorAcrescimoCalc > 0 ? ` + ${formatBRL(valorAcrescimoCalc)}` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#1E3A8A' }}>
                  {formatBRL(valorFinalLiquido)}
                </span>
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setBaixaModal(null)}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarBaixa}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#16A34A', color: '#FFFFFF', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                >
                  Confirmar Baixa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE NOVO LANÇAMENTO (PAGAR OU RECEBER) ── */}
      {novaContaModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0F172A' }}>
                Novo Lançamento Financeiro
              </h3>
              <button
                type="button"
                onClick={() => setNovaContaModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaConta} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Tipo de Operação */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setNovaTipo('pagar')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    background: novaTipo === 'pagar' ? '#DC2626' : '#F1F5F9',
                    color: novaTipo === 'pagar' ? '#FFFFFF' : '#64748B',
                  }}
                >
                  Conta a Pagar (Despesa)
                </button>
                <button
                  type="button"
                  onClick={() => setNovaTipo('receber')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    background: novaTipo === 'receber' ? '#16A34A' : '#F1F5F9',
                    color: novaTipo === 'receber' ? '#FFFFFF' : '#64748B',
                  }}
                >
                  Conta a Receber (Receita)
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Descrição *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aluguel da Loja, Manutenção, Venda Avulsa..."
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    {novaTipo === 'pagar' ? 'Fornecedor / Beneficiário' : 'Cliente / Pagador'}
                  </label>
                  <input
                    type="text"
                    placeholder="Nome da pessoa ou empresa"
                    value={novaPessoa}
                    onChange={(e) => setNovaPessoa(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Categoria
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Operacional, Marketing, Salários..."
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
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
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    1º Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={novaVencimento}
                    onChange={(e) => setNovaVencimento(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Nº Parcelas
                  </label>
                  <select
                    value={novaQtdParcelas}
                    onChange={(e) => setNovaQtdParcelas(Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none', background: '#FFFFFF' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                      <option key={num} value={num}>
                        {num === 1 ? '1x À vista' : `${num}x Parcelas`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setNovaContaModal(false)}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#1D4ED8', color: '#FFFFFF', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
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
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      {carregando ? (
        <div className="mt-2 h-6 w-20 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className={`mt-1 font-hub text-lg font-bold tabular-nums ${cor}`}>{formatBRL(valor)}</p>
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
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase transition ${
        ativa ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
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
  onEstornar,
}: {
  dia: DiaExtrato
  hoje: string
  onBaixar: (conta: ContaPagar, parcela: ContaPagarParcela) => void
  onEstornar: (conta: ContaPagar, parcela: ContaPagarParcela) => void
}) {
  const { titulo, sub } = rotuloDia(dia.data, hoje)
  return (
    <section style={dayStyle} aria-label={`${titulo}, ${sub}`}>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h3 className="text-sm font-semibold text-slate-800">
          {titulo} <span className="text-xs font-normal uppercase text-slate-400">{sub}</span>
        </h3>
        {dia.saldoDia !== 0 && (
          <span className={`text-xs font-semibold tabular-nums ${dia.saldoDia > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
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
            onEstornar={() => onEstornar(m.contaOriginal, m.parcelaOriginal)}
          />
        ))}
      </ul>
    </section>
  )
})

const Linha = memo(function Linha({
  m,
  onBaixar,
  onEstornar,
}: {
  m: Movimento
  onBaixar: () => void
  onEstornar: () => void
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
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 transition">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          receber ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
        }`}
        title={receber ? 'A receber' : 'A pagar'}
      >
        <Seta size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-slate-900">{m.descricao}</p>
        <p className="truncate text-xs text-slate-500">{detalhe}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-bold tabular-nums ${receber ? 'text-emerald-600' : 'text-rose-600'}`}>
            {receber ? '+' : '−'} {formatBRL(m.valor)}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${cls}`}>
            <Icon size={10} aria-hidden />
            {m.status === 'parcial' ? `Faltam ${formatBRL(m.restante)}` : label}
          </span>
        </div>

        {/* Ações da Parcela: Baixar ou Estornar */}
        {m.status !== 'paga' ? (
          <button
            type="button"
            onClick={onBaixar}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition border ${
              receber
                ? 'border-emerald-600 text-emerald-600 hover:bg-emerald-50'
                : 'border-rose-600 text-rose-600 hover:bg-rose-50'
            }`}
          >
            Baixar
          </button>
        ) : (
          <button
            type="button"
            onClick={onEstornar}
            title="Estornar baixa"
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 transition"
          >
            <RotateCcw size={11} aria-hidden />
            Estornar
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
