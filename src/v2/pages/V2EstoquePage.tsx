import { useState, useEffect, useMemo } from 'react'
import {
  Warehouse,
  Search,
  Wrench,
  AlertTriangle,
  Package,
  CheckCircle2,
  X,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import {
  listEstoquePosicoes,
  listMovimentacoesEstoque,
  salvarEstoqueMinimo,
  registrarAjusteManual,
  ItemEstoquePosicao,
  MovimentacaoEstoqueV2,
  MotivoAjusteManual,
} from '../services/v2EstoqueService'
import { formatarMoeda } from '../../modules/lib/money'
import { getCurrentV2User } from '../services/v2AuthService'

type TabAtiva = 'posicao' | 'movimentacoes'
type FiltroPosicao = 'todos' | 'abaixo_minimo' | 'zerados' | 'com_reserva'
type FiltroMovimentacao = 'todas' | 'entradas' | 'saidas' | 'reservas' | 'ajustes'

export function V2EstoquePage() {
  const [tab, setTab] = useState<TabAtiva>('posicao')
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas')
  const [filtroPosicao, setFiltroPosicao] = useState<FiltroPosicao>('todos')
  const [filtroMov, setFiltroMov] = useState<FiltroMovimentacao>('todas')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('outubro')

  const [posicoes, setPosicoes] = useState<ItemEstoquePosicao[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoqueV2[]>([])

  // Drawer de Detalhe do Produto
  const [produtoSelecionado, setProdutoSelecionado] = useState<ItemEstoquePosicao | null>(null)
  const [novoMinimoInput, setNovoMinimoInput] = useState<string>('')
  const [salvandoMinimo, setSalvandoMinimo] = useState(false)

  // Modal de Ajuste Manual
  const [modalAjusteAberto, setModalAjusteAberto] = useState(false)
  const [produtoParaAjuste, setProdutoParaAjuste] = useState<ItemEstoquePosicao | null>(null)
  const [tipoAjuste, setTipoAjuste] = useState<'entrada' | 'saida' | 'contagem'>('saida')
  const [quantidadeAjuste, setQuantidadeAjuste] = useState<number>(1)
  const [dataAjuste, setDataAjuste] = useState<string>(() => {
    const d = new Date()
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
  })
  const [motivoAjuste, setMotivoAjuste] = useState<MotivoAjusteManual>('Avaria')
  const [observacaoAjuste, setObservacaoAjuste] = useState('peça com costura aberta, separada para troca')
  const [salvandoAjuste, setSalvandoAjuste] = useState(false)

  // Paginação
  const [itensPorPagina, setItensPorPagina] = useState<number>(10)
  const [paginaAtual, setPaginaAtual] = useState<number>(1)

  // Mensagem Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3500)
  }

  const currentUser = getCurrentV2User()
  const nomeUsuario = currentUser?.full_name?.split(' ')[0] || currentUser?.username || 'Leonardo'

  const carregarDados = async () => {
    try {
      const [p, m] = await Promise.all([listEstoquePosicoes(), listMovimentacoesEstoque()])
      setPosicoes(p)
      setMovimentacoes(m)
    } catch (e) {
      console.error('Erro ao carregar dados de estoque:', e)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Atualizar drawer se os dados mudarem
  useEffect(() => {
    if (produtoSelecionado) {
      const updated = posicoes.find((p) => p.produto_id === produtoSelecionado.produto_id)
      if (updated) {
        setProdutoSelecionado(updated)
        setNovoMinimoInput(String(updated.minimo))
      }
    }
  }, [posicoes])

  // Categorias disponíveis
  const categorias = useMemo(() => {
    const set = new Set<string>()
    posicoes.forEach((p) => {
      if (p.categoria) set.add(p.categoria)
    })
    return Array.from(set).sort()
  }, [posicoes])

  // Usuários para filtro de movimentações
  const usuariosMovs = useMemo(() => {
    const set = new Set<string>()
    movimentacoes.forEach((m) => {
      if (m.usuario) set.add(m.usuario)
    })
    return Array.from(set).sort()
  }, [movimentacoes])

  // Contagens dos cards de resumo
  const totalProdutos = posicoes.length
  const totalAbaixoMinimo = posicoes.filter((p) => p.situacao === 'abaixo_minimo').length
  const totalReservado = posicoes.reduce((acc, p) => acc + p.reservado, 0)
  const vendasComReservaCount = posicoes.filter((p) => p.reservado > 0).length
  const valorTotalEstoque = posicoes.reduce((acc, p) => acc + p.fisico * p.preco_medio, 0)
  const totalZerados = posicoes.filter((p) => p.situacao === 'zerado').length

  // Filtragem Posição de Estoque
  const posicoesFiltradas = useMemo(() => {
    return posicoes.filter((p) => {
      const matchBusca =
        !busca ||
        p.produto_nome.toLowerCase().includes(busca.toLowerCase()) ||
        p.codigo_sku.toLowerCase().includes(busca.toLowerCase()) ||
        p.categoria.toLowerCase().includes(busca.toLowerCase())

      const matchCat = categoriaFiltro === 'todas' || p.categoria === categoriaFiltro

      let matchPill = true
      if (filtroPosicao === 'abaixo_minimo') matchPill = p.situacao === 'abaixo_minimo'
      if (filtroPosicao === 'zerados') matchPill = p.situacao === 'zerado'
      if (filtroPosicao === 'com_reserva') matchPill = p.reservado > 0

      return matchBusca && matchCat && matchPill
    })
  }, [posicoes, busca, categoriaFiltro, filtroPosicao])

  // Itens paginados
  const totalPaginas = Math.ceil(posicoesFiltradas.length / itensPorPagina) || 1
  const posicoesPaginadas = useMemo(() => {
    const start = (paginaAtual - 1) * itensPorPagina
    return posicoesFiltradas.slice(start, start + itensPorPagina)
  }, [posicoesFiltradas, paginaAtual, itensPorPagina])

  // Filtragem Movimentações
  const movimentacoesFiltradas = useMemo(() => {
    return movimentacoes.filter((m) => {
      const matchBusca =
        !busca ||
        m.produto_nome.toLowerCase().includes(busca.toLowerCase()) ||
        m.origem.toLowerCase().includes(busca.toLowerCase()) ||
        (m.referencia && m.referencia.toLowerCase().includes(busca.toLowerCase()))

      const matchUsuario = filtroUsuario === 'todos' || m.usuario === filtroUsuario

      let matchTipo = true
      if (filtroMov === 'entradas') matchTipo = m.tipo === 'entrada'
      if (filtroMov === 'saidas') matchTipo = m.tipo === 'saida'
      if (filtroMov === 'reservas') matchTipo = m.tipo === 'reserva' || m.tipo === 'liberacao'
      if (filtroMov === 'ajustes') matchTipo = m.tipo === 'ajuste'

      return matchBusca && matchUsuario && matchTipo
    })
  }, [movimentacoes, busca, filtroUsuario, filtroMov])

  // Contagens para os pills de movimentações
  const countMovs = useMemo(() => {
    return {
      todas: movimentacoes.length,
      entradas: movimentacoes.filter((m) => m.tipo === 'entrada').length,
      saidas: movimentacoes.filter((m) => m.tipo === 'saida').length,
      reservas: movimentacoes.filter((m) => m.tipo === 'reserva' || m.tipo === 'liberacao').length,
      ajustes: movimentacoes.filter((m) => m.tipo === 'ajuste').length,
    }
  }, [movimentacoes])

  // Abrir modal de ajuste manual
  const handleAbrirAjuste = (produto?: ItemEstoquePosicao) => {
    const prod = produto || produtoSelecionado || posicoes[0]
    setProdutoParaAjuste(prod || null)
    setTipoAjuste('saida')
    setQuantidadeAjuste(1)
    setMotivoAjuste('Avaria')
    setObservacaoAjuste('peça com costura aberta, separada para troca')
    setModalAjusteAberto(true)
  }

  // Confirmar ajuste manual
  const handleSalvarAjuste = async () => {
    if (!produtoParaAjuste) return
    if (!quantidadeAjuste || quantidadeAjuste < 0) {
      showToast('error', 'Informe uma quantidade válida.')
      return
    }

    setSalvandoAjuste(true)
    try {
      const res = await registrarAjusteManual({
        produto_id: produtoParaAjuste.produto_id,
        produto_nome: produtoParaAjuste.produto_nome,
        codigo_sku: produtoParaAjuste.codigo_sku,
        tipoAjuste,
        quantidade: quantidadeAjuste,
        data: dataAjuste,
        motivo: motivoAjuste,
        observacao: observacaoAjuste,
        usuario: nomeUsuario,
      })

      if (res.ok) {
        showToast('success', 'Ajuste de estoque registrado com sucesso!')
        setModalAjusteAberto(false)
        await carregarDados()
        if (produtoSelecionado && produtoSelecionado.produto_id === produtoParaAjuste.produto_id) {
          setProdutoSelecionado(res.novaPosicao)
        }
      } else {
        showToast('error', res.erro)
      }
    } catch {
      showToast('error', 'Erro ao registrar ajuste de estoque.')
    } finally {
      setSalvandoAjuste(false)
    }
  }

  // Salvar novo estoque mínimo
  const handleSalvarMinimo = async () => {
    if (!produtoSelecionado) return
    const num = parseInt(novoMinimoInput, 10)
    if (isNaN(num) || num < 0) {
      showToast('error', 'Informe um valor numérico válido para o estoque mínimo.')
      return
    }

    setSalvandoMinimo(true)
    try {
      await salvarEstoqueMinimo(produtoSelecionado.produto_id, num)
      showToast('success', `Estoque mínimo de ${produtoSelecionado.codigo_sku} atualizado para ${num} un.`)
      await carregarDados()
    } catch {
      showToast('error', 'Erro ao atualizar estoque mínimo.')
    } finally {
      setSalvandoMinimo(false)
    }
  }

  // Cálculo da prévia do resultado do ajuste
  const previewAjuste = useMemo(() => {
    if (!produtoParaAjuste) return null
    const fisicoAtual = produtoParaAjuste.fisico
    const reservado = produtoParaAjuste.reservado
    const minimo = produtoParaAjuste.minimo

    let novoFisico = fisicoAtual
    if (tipoAjuste === 'entrada') {
      novoFisico = fisicoAtual + (quantidadeAjuste || 0)
    } else if (tipoAjuste === 'saida') {
      novoFisico = Math.max(0, fisicoAtual - (quantidadeAjuste || 0))
    } else if (tipoAjuste === 'contagem') {
      novoFisico = Math.max(0, quantidadeAjuste || 0)
    }

    const novoDisponivel = Math.max(0, novoFisico - reservado)
    const disponivelAtual = produtoParaAjuste.disponivel

    const ficariaAbaixo = minimo > 0 && novoDisponivel < minimo

    return {
      fisicoAntes: fisicoAtual,
      fisicoDepois: novoFisico,
      reservado,
      disponivelAntes: disponivelAtual,
      disponivelDepois: novoDisponivel,
      minimo,
      ficariaAbaixo,
    }
  }, [produtoParaAjuste, tipoAjuste, quantidadeAjuste])

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shadow-xs">
            <Warehouse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Estoque</h1>
            <p className="text-xs text-slate-500 font-medium">Físico, reservado e disponível por produto</p>
          </div>
        </div>

        <button
          onClick={() => handleAbrirAjuste()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs transition"
        >
          <Wrench className="h-4 w-4 text-slate-600" />
          Ajustar estoque
        </button>
      </div>

      {/* ── CARDS DE RESUMO (4 CARDS) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* Card 1: Produtos */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 mb-1">Produtos</p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{totalProdutos}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">cadastrados</p>
        </div>

        {/* Card 2: Abaixo do mínimo */}
        <div className="bg-amber-50/60 p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-xs">
          <p className="text-xs font-semibold text-amber-800 mb-1">Abaixo do mínimo</p>
          <p className="text-2xl sm:text-3xl font-black text-amber-900">{totalAbaixoMinimo}</p>
          <p className="text-xs text-amber-700/80 mt-1 font-medium">disponível menor que o mínimo</p>
        </div>

        {/* Card 3: Reservado */}
        <div className="bg-blue-50/60 p-4 sm:p-5 rounded-2xl border border-blue-200/80 shadow-xs">
          <p className="text-xs font-semibold text-blue-800 mb-1">Reservado</p>
          <p className="text-2xl sm:text-3xl font-black text-blue-900">{totalReservado} un</p>
          <p className="text-xs text-blue-700/80 mt-1 font-medium">
            em {vendasComReservaCount} {vendasComReservaCount === 1 ? 'venda aprovada' : 'vendas aprovadas'}
          </p>
        </div>

        {/* Card 4: Valor em estoque */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 mb-1">Valor em estoque</p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{formatarMoeda(valorTotalEstoque)}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">a preço médio de compra</p>
        </div>
      </div>

      {/* ── TABS PRINCIPAIS ── */}
      <div className="border-b border-slate-200 mb-6 flex gap-8">
        <button
          onClick={() => {
            setTab('posicao')
            setPaginaAtual(1)
          }}
          className={`pb-3 text-sm font-bold border-b-2 transition -mb-[2px] ${
            tab === 'posicao'
              ? 'border-sky-600 text-sky-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Posição de estoque
        </button>
        <button
          onClick={() => {
            setTab('movimentacoes')
          }}
          className={`pb-3 text-sm font-bold border-b-2 transition -mb-[2px] ${
            tab === 'movimentacoes'
              ? 'border-sky-600 text-sky-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Movimentações
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ABA 1: POSIÇÃO DE ESTOQUE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === 'posicao' && (
        <div className="space-y-4">
          {/* Pills de Filtro de Situação */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => {
                setFiltroPosicao('todos')
                setPaginaAtual(1)
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroPosicao === 'todos'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroPosicao === 'todos' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{posicoes.length}</span>
            </button>

            <button
              onClick={() => {
                setFiltroPosicao('abaixo_minimo')
                setPaginaAtual(1)
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroPosicao === 'abaixo_minimo'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Abaixo do mínimo <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroPosicao === 'abaixo_minimo' ? 'bg-sky-800 text-white' : 'bg-amber-100 text-amber-800'}`}>{totalAbaixoMinimo}</span>
            </button>

            <button
              onClick={() => {
                setFiltroPosicao('zerados')
                setPaginaAtual(1)
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroPosicao === 'zerados'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Zerados <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroPosicao === 'zerados' ? 'bg-sky-800 text-white' : 'bg-rose-100 text-rose-800'}`}>{totalZerados}</span>
            </button>

            <button
              onClick={() => {
                setFiltroPosicao('com_reserva')
                setPaginaAtual(1)
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroPosicao === 'com_reserva'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Com reserva <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroPosicao === 'com_reserva' ? 'bg-sky-800 text-white' : 'bg-blue-100 text-blue-800'}`}>{vendasComReservaCount}</span>
            </button>
          </div>

          {/* Barra de Busca e Categoria */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar produto, código ou categoria"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPaginaAtual(1)
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="sm:w-56 shrink-0">
              <select
                value={categoriaFiltro}
                onChange={(e) => {
                  setCategoriaFiltro(e.target.value)
                  setPaginaAtual(1)
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              >
                <option value="todas">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TABELA DESKTOP */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">PRODUTO</th>
                  <th className="py-3 px-4 text-center">FÍSICO</th>
                  <th className="py-3 px-4 text-center">RESERVADO</th>
                  <th className="py-3 px-4 text-center">DISPONÍVEL</th>
                  <th className="py-3 px-4 text-center">MÍNIMO</th>
                  <th className="py-3 px-4 text-center">SITUAÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {posicoesPaginadas.map((item) => {
                  const isOk = item.situacao === 'ok'
                  const isAbaixo = item.situacao === 'abaixo_minimo'

                  return (
                    <tr
                      key={item.produto_id}
                      onClick={() => {
                        setProdutoSelecionado(item)
                        setNovoMinimoInput(String(item.minimo))
                      }}
                      className="hover:bg-sky-50/40 cursor-pointer transition"
                    >
                      {/* Coluna Produto */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              item.fisico > 0
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                : 'bg-rose-50 border-rose-200 text-rose-500'
                            }`}
                          >
                            <Package className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-tight">{item.produto_nome}</p>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                              {item.codigo_sku} {item.categoria && `· ${item.categoria}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Coluna Físico */}
                      <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                        {item.fisico}
                      </td>

                      {/* Coluna Reservado */}
                      <td className="py-3.5 px-4 text-center font-bold">
                        {item.reservado > 0 ? (
                          <span className="text-blue-600">{item.reservado}</span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>

                      {/* Coluna Disponível */}
                      <td className="py-3.5 px-4 text-center font-black">
                        {item.disponivel > 0 ? (
                          <span className="text-emerald-700">{item.disponivel}</span>
                        ) : (
                          <span className="text-rose-600">0</span>
                        )}
                      </td>

                      {/* Coluna Mínimo */}
                      <td className="py-3.5 px-4 text-center font-medium text-slate-500">
                        {item.minimo > 0 ? item.minimo : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Coluna Situação */}
                      <td className="py-3.5 px-4 text-center">
                        {isOk && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Ok
                          </span>
                        )}
                        {isAbaixo && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Abaixo do mínimo
                          </span>
                        )}
                        {!isOk && !isAbaixo && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Zerado
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* LISTA DE CARDS MOBILE (Conforme Estoque · Posição (celular) (2).png) */}
          <div className="md:hidden space-y-3">
            {posicoesPaginadas.map((item) => {
              const isOk = item.situacao === 'ok'
              const isAbaixo = item.situacao === 'abaixo_minimo'

              return (
                <div
                  key={item.produto_id}
                  onClick={() => {
                    setProdutoSelecionado(item)
                    setNovoMinimoInput(String(item.minimo))
                  }}
                  className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs cursor-pointer active:bg-slate-50 transition space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                        item.fisico > 0
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                          : 'bg-rose-50 border-rose-200 text-rose-500'
                      }`}
                    >
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm leading-tight">{item.produto_nome}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{item.codigo_sku}</p>
                    </div>
                  </div>

                  {/* Grid 4 colunas: Físico, Reservado, Disponível, Mínimo */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Físico</p>
                      <p className="text-sm font-black text-slate-900 mt-0.5">{item.fisico}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Reservado</p>
                      <p className="text-sm font-black text-blue-600 mt-0.5">{item.reservado}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Disponível</p>
                      <p className={`text-sm font-black mt-0.5 ${item.disponivel > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {item.disponivel}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Mínimo</p>
                      <p className="text-sm font-medium text-slate-600 mt-0.5">{item.minimo}</p>
                    </div>
                  </div>

                  {/* Situação badge */}
                  <div className="pt-1">
                    {isOk && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Ok
                      </span>
                    )}
                    {isAbaixo && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Abaixo do mínimo
                      </span>
                    )}
                    {!isOk && !isAbaixo && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Zerado
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── PAGINAÇÃO E CONTROLES ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium">
              Mostrando <span className="font-bold text-slate-800">1–{Math.min(posicoesFiltradas.length, itensPorPagina)}</span> de{' '}
              <span className="font-bold text-slate-800">{posicoesFiltradas.length}</span> produtos
            </p>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                <span>Itens por página:</span>
                {[10, 25, 50, 100].map((qtd) => (
                  <button
                    key={qtd}
                    onClick={() => {
                      setItensPorPagina(qtd)
                      setPaginaAtual(1)
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      itensPorPagina === qtd
                        ? 'bg-sky-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {qtd}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  disabled={paginaAtual <= 1}
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 rounded-lg bg-sky-700 text-white font-bold text-xs">
                  {paginaAtual}
                </span>
                <button
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center sm:text-left pt-2 font-medium">
            Disponível = Físico — Reservado. Reserva nasce na aprovação da venda; a baixa do físico acontece na entrega.
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ABA 2: MOVIMENTAÇÕES DE ESTOQUE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === 'movimentacoes' && (
        <div className="space-y-4">
          {/* Filtros em Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setFiltroMov('todas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroMov === 'todas'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todas <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroMov === 'todas' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{countMovs.todas}</span>
            </button>

            <button
              onClick={() => setFiltroMov('entradas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroMov === 'entradas'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Entradas <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroMov === 'entradas' ? 'bg-sky-800 text-white' : 'bg-emerald-100 text-emerald-800'}`}>{countMovs.entradas}</span>
            </button>

            <button
              onClick={() => setFiltroMov('saidas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroMov === 'saidas'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Saídas <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroMov === 'saidas' ? 'bg-sky-800 text-white' : 'bg-rose-100 text-rose-800'}`}>{countMovs.saidas}</span>
            </button>

            <button
              onClick={() => setFiltroMov('reservas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroMov === 'reservas'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Reservas <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroMov === 'reservas' ? 'bg-sky-800 text-white' : 'bg-blue-100 text-blue-800'}`}>{countMovs.reservas}</span>
            </button>

            <button
              onClick={() => setFiltroMov('ajustes')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filtroMov === 'ajustes'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Ajustes <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${filtroMov === 'ajustes' ? 'bg-sky-800 text-white' : 'bg-amber-100 text-amber-800'}`}>{countMovs.ajustes}</span>
            </button>
          </div>

          {/* Busca e Filtros de Período / Usuário */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar produto, venda ou compra"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={filtroPeriodo}
                onChange={(e) => setFiltroPeriodo(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="outubro">Período: Outubro</option>
                <option value="setembro">Período: Setembro</option>
                <option value="ano_2026">Ano: 2026</option>
              </select>

              <select
                value={filtroUsuario}
                onChange={(e) => setFiltroUsuario(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="todos">Todos os usuários</option>
                {usuariosMovs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TABELA DE MOVIMENTAÇÕES (DESKTOP) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">DATA</th>
                  <th className="py-3 px-4">PRODUTO</th>
                  <th className="py-3 px-4 text-center">TIPO</th>
                  <th className="py-3 px-4 text-center">QTD</th>
                  <th className="py-3 px-4">ORIGEM</th>
                  <th className="py-3 px-4">USUÁRIO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {movimentacoesFiltradas.map((m) => {
                  let badge = (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                      {m.tipo}
                    </span>
                  )
                  if (m.tipo === 'entrada') {
                    badge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Entrada
                      </span>
                    )
                  } else if (m.tipo === 'saida') {
                    badge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        Saída
                      </span>
                    )
                  } else if (m.tipo === 'reserva') {
                    badge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
                        Reserva
                      </span>
                    )
                  } else if (m.tipo === 'liberacao') {
                    badge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        Liberação
                      </span>
                    )
                  } else if (m.tipo === 'ajuste') {
                    badge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        Ajuste
                      </span>
                    )
                  }

                  const isNegativo = m.quantidade < 0
                  const isPositivo = m.quantidade > 0

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                        {m.data}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {m.produto_nome}
                      </td>
                      <td className="py-3.5 px-4 text-center">{badge}</td>
                      <td className="py-3.5 px-4 text-center font-black">
                        {isNegativo && <span className="text-rose-600">{m.quantidade}</span>}
                        {isPositivo && <span className="text-emerald-700">+{m.quantidade}</span>}
                        {!isNegativo && !isPositivo && <span className="text-slate-500">0</span>}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">
                        {m.origem}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                        {m.usuario}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* LISTA DE MOVIMENTAÇÕES (MOBILE) */}
          <div className="md:hidden space-y-3">
            {movimentacoesFiltradas.map((m) => {
              const isNegativo = m.quantidade < 0
              const isPositivo = m.quantidade > 0

              let badge = (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                  {m.tipo}
                </span>
              )
              if (m.tipo === 'entrada') {
                badge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Entrada
                  </span>
                )
              } else if (m.tipo === 'saida') {
                badge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Saída
                  </span>
                )
              } else if (m.tipo === 'reserva') {
                badge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                    Reserva
                  </span>
                )
              } else if (m.tipo === 'liberacao') {
                badge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Liberação
                  </span>
                )
              } else if (m.tipo === 'ajuste') {
                badge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    Ajuste
                  </span>
                )
              }

              return (
                <div key={m.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{m.data}</span>
                    {badge}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900 text-sm leading-tight">{m.produto_nome}</p>
                    <span className="text-base font-black">
                      {isNegativo && <span className="text-rose-600">{m.quantidade}</span>}
                      {isPositivo && <span className="text-emerald-700">+{m.quantidade}</span>}
                      {!isNegativo && !isPositivo && <span className="text-slate-500">0</span>}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    {m.origem} · <span className="text-slate-700 font-semibold">{m.usuario}</span>
                  </p>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-slate-400 text-center sm:text-left pt-2 font-medium">
            As movimentações são geradas pelo sistema (compra recebida, venda aprovada, entrega) ou por ajuste manual. Não se edita nem se apaga: para corrigir, faça um novo ajuste.
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DRAWER / MODAL: DETALHE DO PRODUTO */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {produtoSelecionado && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex justify-end z-50 transition-opacity">
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Top Bar Drawer */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
              <div className="flex items-start gap-3">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                    produtoSelecionado.fisico > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-rose-50 border-rose-200 text-rose-500'
                  }`}
                >
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900 leading-tight">
                      {produtoSelecionado.produto_nome}
                    </h2>
                    {produtoSelecionado.situacao === 'ok' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" /> Ok
                      </span>
                    )}
                    {produtoSelecionado.situacao === 'abaixo_minimo' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <span className="h-1 w-1 rounded-full bg-amber-500" /> Abaixo
                      </span>
                    )}
                    {produtoSelecionado.situacao === 'zerado' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="h-1 w-1 rounded-full bg-rose-500" /> Zerado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Físico, reservado e disponível
                  </p>
                </div>
              </div>

              <button
                onClick={() => setProdutoSelecionado(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sub-header info bar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-medium">
              {produtoSelecionado.codigo_sku} · Última compra {formatarMoeda(produtoSelecionado.ultimo_preco_compra)} em {produtoSelecionado.data_ultima_compra} · Preço médio {formatarMoeda(produtoSelecionado.preco_medio)}
            </div>

            {/* Conteúdo Drawer */}
            <div className="p-5 flex-1 space-y-6">
              {/* 3 Cards de Posição */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">FÍSICO</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{produtoSelecionado.fisico}</p>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">na prateleira</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">RESERVADO</p>
                  <p className="text-2xl font-black text-blue-900 mt-1">{produtoSelecionado.reservado}</p>
                  <p className="text-[11px] text-blue-600 font-medium mt-0.5">vendas aprovadas</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">DISPONÍVEL</p>
                  <p className="text-2xl font-black text-emerald-900 mt-1">{produtoSelecionado.disponivel}</p>
                  <p className="text-[11px] text-emerald-700 font-medium mt-0.5">para novas vendas</p>
                </div>
              </div>

              {/* Card de Configuração de Estoque Mínimo */}
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-3">
                <label className="block text-xs font-bold text-amber-900">
                  Estoque mínimo (un)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={novoMinimoInput}
                    onChange={(e) => setNovoMinimoInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-amber-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    disabled={salvandoMinimo}
                    onClick={handleSalvarMinimo}
                    className="px-4 py-2 rounded-xl bg-sky-700 text-white text-xs font-bold hover:bg-sky-800 transition disabled:opacity-50"
                  >
                    {salvandoMinimo ? 'Salvando...' : 'Salvar mínimo'}
                  </button>
                </div>
                <p className="text-[11px] text-amber-800/80 leading-relaxed font-medium">
                  Quando o disponível ficar abaixo do mínimo, o produto aparece em "Abaixo do mínimo" e no alerta do Início.
                </p>
              </div>

              {/* Seção Reservas Ativas */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  RESERVAS ATIVAS
                </p>

                {produtoSelecionado.reservas_ativas.length > 0 ? (
                  <div className="space-y-2">
                    {produtoSelecionado.reservas_ativas.map((r, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-xs"
                      >
                        <div>
                          <p className="text-xs font-black text-slate-900">Venda {r.venda_numero}</p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {r.cliente_nome} · aprovada {r.data_aprovacao}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-blue-600">{r.quantidade} un</p>
                          <p className="text-[10px] text-slate-400">{r.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center">
                    Nenhuma reserva ativa no momento.
                  </p>
                )}
              </div>

              {/* Seção Últimas Movimentações */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  ÚLTIMAS MOVIMENTAÇÕES
                </p>

                {produtoSelecionado.ultimas_movimentacoes.length > 0 ? (
                  <div className="space-y-2">
                    {produtoSelecionado.ultimas_movimentacoes.map((m) => {
                      const isNegativo = m.quantidade < 0
                      const isPositivo = m.quantidade > 0
                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl border border-slate-100 bg-white flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-800">
                              <span className="capitalize">{m.tipo}</span> · {m.origem}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {m.data} · {m.usuario}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-sm">
                              {isNegativo && <span className="text-rose-600">{m.quantidade}</span>}
                              {isPositivo && <span className="text-emerald-700">+{m.quantidade}</span>}
                              {!isNegativo && !isPositivo && <span className="text-slate-500">0</span>}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center">
                    Nenhuma movimentação recente registrada.
                  </p>
                )}

                <button
                  onClick={() => {
                    setTab('movimentacoes')
                    setBusca(produtoSelecionado.produto_nome)
                    setProdutoSelecionado(null)
                  }}
                  className="text-xs font-bold text-sky-700 hover:text-sky-800 block pt-1 transition"
                >
                  Ver todas em Movimentações →
                </button>
              </div>
            </div>

            {/* Footer Drawer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
              <button
                onClick={() => setProdutoSelecionado(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  handleAbrirAjuste(produtoSelecionado)
                }}
                className="px-4 py-2.5 rounded-xl bg-sky-700 text-white font-bold text-xs hover:bg-sky-800 transition flex items-center gap-1.5 shadow-xs"
              >
                <Wrench className="h-4 w-4" />
                Ajustar estoque
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL / DRAWER: AJUSTAR ESTOQUE (Conforme tela de Ajuste Manual) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {modalAjusteAberto && produtoParaAjuste && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex justify-end z-50 transition-opacity">
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 leading-tight">Ajustar estoque</h2>
                  <p className="text-xs text-slate-400 font-medium">Correção manual com motivo e registro</p>
                </div>
              </div>

              <button
                onClick={() => setModalAjusteAberto(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo Formulário */}
            <div className="p-5 flex-1 space-y-5">
              {/* Box Produto Atual */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{produtoParaAjuste.produto_nome}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{produtoParaAjuste.codigo_sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">FÍSICO ATUAL</p>
                  <p className="text-xl font-black text-slate-900">{produtoParaAjuste.fisico} un</p>
                </div>
              </div>

              {/* Tipo de Ajuste (Entrada, Saída, Contagem) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Tipo de ajuste *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoAjuste('entrada')}
                    className={`py-2.5 rounded-xl text-xs font-bold transition border ${
                      tipoAjuste === 'entrada'
                        ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoAjuste('saida')}
                    className={`py-2.5 rounded-xl text-xs font-bold transition border ${
                      tipoAjuste === 'saida'
                        ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Saída
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoAjuste('contagem')}
                    className={`py-2.5 rounded-xl text-xs font-bold transition border ${
                      tipoAjuste === 'contagem'
                        ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Contagem
                  </button>
                </div>
              </div>

              {/* Quantidade e Data */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Quantidade *</label>
                  <input
                    type="number"
                    min="1"
                    value={quantidadeAjuste}
                    onChange={(e) => setQuantidadeAjuste(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Data</label>
                  <input
                    type="text"
                    value={dataAjuste}
                    onChange={(e) => setDataAjuste(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Motivo Pills */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Motivo *</label>
                <div className="flex flex-wrap gap-2">
                  {(['Contagem', 'Perda', 'Avaria', 'Devolução', 'Outro'] as MotivoAjusteManual[]).map((motivo) => {
                    const selected = motivoAjuste === motivo
                    return (
                      <button
                        key={motivo}
                        type="button"
                        onClick={() => setMotivoAjuste(motivo)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition border ${
                          selected
                            ? 'bg-sky-50 text-sky-700 border-sky-400'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {motivo}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Observação */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Observação</label>
                <textarea
                  rows={2}
                  value={observacaoAjuste}
                  onChange={(e) => setObservacaoAjuste(e.target.value)}
                  placeholder="Ex.: peça com costura aberta, separada para troca"
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {/* Caixa Resultado do Ajuste (Live Preview) */}
              {previewAjuste && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                    RESULTADO DO AJUSTE
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>Físico</span>
                      <span>
                        {previewAjuste.fisicoAntes} →{' '}
                        <span className="text-slate-900 font-black">{previewAjuste.fisicoDepois}</span>
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>Reservado</span>
                      <span className="text-blue-600">{previewAjuste.reservado}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>Disponível</span>
                      <span>
                        {previewAjuste.disponivelAntes} →{' '}
                        <span className="text-emerald-700 font-black">{previewAjuste.disponivelDepois}</span>
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-800/80 pt-1 border-t border-emerald-200/60 font-medium">
                    {previewAjuste.ficariaAbaixo
                      ? `Abaixo do mínimo (${previewAjuste.minimo}). O produto entrará no alerta de reposição.`
                      : `Dentro do mínimo (${previewAjuste.minimo}). Se ficasse abaixo, o produto entraria no alerta.`}
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                Só perfis com permissão de estoque ajustam. O ajuste fica registrado em Movimentações com usuário, data e motivo, e não pode ser apagado.
              </p>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => setModalAjusteAberto(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvandoAjuste}
                onClick={handleSalvarAjuste}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {salvandoAjuste ? 'Registrando...' : 'Registrar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ALERT ── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-xs font-bold z-50 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-800 text-white'
              : 'bg-rose-800 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  )
}
