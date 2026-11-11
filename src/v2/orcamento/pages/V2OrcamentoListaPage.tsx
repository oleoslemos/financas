import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Calculator,
  Calendar,
  ArrowRight,
  WifiOff,
  RefreshCw,
} from 'lucide-react'
import { listPedidosVenda, PedidoVenda } from '../../services/v2PedidoVendasService'
import { getCurrentV2User } from '../../services/v2AuthService'
import { getOutbox } from '../services/v2OrcamentoOfflineService'

export function V2OrcamentoListaPage() {
  const navigate = useNavigate()
  const user = getCurrentV2User()
  const isAdmin = (user?.role || '').toLowerCase() === 'administrador'
  const userName = user?.full_name || user?.username || ''

  const [loading, setLoading] = useState(true)
  const [propostas, setPropostas] = useState<PedidoVenda[]>([])
  const [search, setSearch] = useState('')
  const [outboxIds, setOutboxIds] = useState<Set<string>>(new Set())

  const loadData = async () => {
    setLoading(true)
    try {
      const all = await listPedidosVenda()
      // Filter: only status === 'proposta'
      const onlyPropostas = all.filter((p) => p.status === 'proposta')
      
      // Filter by user unless administrator
      const filteredByUser = isAdmin
        ? onlyPropostas
        : onlyPropostas.filter((p) => {
            if (!p.vendedor_nome) return true
            return p.vendedor_nome.toLowerCase().includes(userName.toLowerCase())
          })

      setPropostas(filteredByUser)
      setOutboxIds(new Set(getOutbox().map((o) => o.id)))
    } catch (err) {
      console.error('Erro ao listar orçamentos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return propostas
    const q = search.toLowerCase()
    return propostas.filter((p) =>
      p.numero.toLowerCase().includes(q) ||
      p.cliente_nome.toLowerCase().includes(q) ||
      (p.cliente_cidade && p.cliente_cidade.toLowerCase().includes(q))
    )
  }, [propostas, search])

  const formatBRL = (val?: number) => {
    if (val == null || isNaN(val)) return 'R$ 0,00'
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatDate = (isoOrDate?: string | null) => {
    if (!isoOrDate) return '—'
    if (isoOrDate.includes('T')) {
      const [d] = isoOrDate.split('T')
      const [y, m, day] = d.split('-')
      return `${day}/${m}/${y}`
    }
    const parts = isoOrDate.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return isoOrDate
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      
      {/* ── HEADER DA LISTA DE ORÇAMENTOS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Meus Orçamentos
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Propostas comerciais em elaboração e negociação
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/v2/orcamento/propostas/nova')}
          className="min-h-[48px] px-5 rounded-2xl bg-[#0D6BAF] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0b5a93] transition shadow-md shadow-[#0D6BAF]/20 active:scale-98"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Orçamento</span>
        </button>
      </div>

      {/* ── BARRA DE BUSCA RÁPIDA ── */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por cliente, cidade ou número da proposta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D6BAF]/20 focus:border-[#0D6BAF] shadow-2xs"
        />
      </div>

      {/* ── LISTA DE PROPOSTAS / CARDS ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#0D6BAF]" />
          <span className="text-sm font-semibold">Carregando orçamentos...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-[#0D6BAF] flex items-center justify-center mx-auto">
            <Calculator className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {search ? 'Nenhum orçamento encontrado para o filtro' : 'Nenhum orçamento cadastrado ainda'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-medium">
            {search ? 'Tente buscar com outro nome de cliente ou número.' : 'Crie seu primeiro orçamento comercial tocando no botão abaixo.'}
          </p>
          {!search && (
            <button
              type="button"
              onClick={() => navigate('/v2/orcamento/propostas/nova')}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0D6BAF] text-white font-bold text-xs"
            >
              <Plus className="w-4 h-4" />
              Criar Proposta
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const isPendingOutbox = outboxIds.has(p.id)
            const valorTotal = p.condicaoSelecionada === 'ate_5x'
              ? (p.total5x || p.total)
              : p.condicaoSelecionada === 'a_vista'
              ? (p.totalVista || p.total)
              : p.total

            const itensCount = p.itens?.length || 0

            return (
              <div
                key={p.id}
                onClick={() => navigate(`/v2/orcamento/propostas/${p.id}`)}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs hover:border-[#0D6BAF]/40 hover:shadow-xs transition cursor-pointer active:bg-slate-50 relative group"
              >
                <div className="flex items-start justify-between gap-3">
                  
                  {/* Informações Principais */}
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                        #{p.numero}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        Orçamento
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {p.canal === 'representacao' ? 'Representação' : 'Distribuição'}
                      </span>
                      {isPendingOutbox && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                          <WifiOff className="w-2.5 h-2.5" /> Pendente de envio
                        </span>
                      )}
                    </div>

                    {/* Cliente */}
                    <div className="font-bold text-slate-900 text-sm sm:text-base truncate pt-0.5">
                      {p.cliente_nome}
                    </div>

                    {/* Metadados: Data, Itens, Cidade */}
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(p.dataEmissao)}
                      </span>
                      <span>•</span>
                      <span>{itensCount} item{itensCount !== 1 ? 's' : ''}</span>
                      {p.cliente_cidade && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[150px]">{p.cliente_cidade}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Valor e Ação */}
                  <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                    <div>
                      <div className="text-[11px] text-slate-400 font-bold uppercase">
                        {p.condicaoSelecionada === 'a_vista'
                          ? 'À Vista'
                          : p.condicaoSelecionada === 'ate_5x'
                          ? 'Até 5x'
                          : 'Preço Normal'}
                      </div>
                      <div className="text-base sm:text-lg font-black text-[#0D6BAF] tabular-nums">
                        {formatBRL(valorTotal)}
                      </div>
                    </div>

                    <div className="flex items-center text-xs font-bold text-[#0D6BAF] group-hover:translate-x-1 transition-transform gap-1 mt-2">
                      <span>Abrir</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
