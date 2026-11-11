import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, Lock, Tag, AlertCircle, RefreshCw, WifiOff } from 'lucide-react'
import { listPriceTables, V2PriceTable } from '../../services/v2TabelaPrecoService'
import { listV2Products, V2Product } from '../../services/v2ProdutosService'
import { getCurrentV2User } from '../../services/v2AuthService'
import { listRolesConfig } from '../../services/v2PermissionsService'

const CACHE_KEY = 'v2:orcamento:tabela_ativa'

export function V2OrcamentoTabelaPrecoPage() {
  const [loading, setLoading] = useState(true)
  const [activeTable, setActiveTable] = useState<V2PriceTable | null>(null)
  const [productsMap, setProductsMap] = useState<Map<string, V2Product>>(new Map())
  const [canViewCost, setCanViewCost] = useState(false)
  const [cachedTime, setCachedTime] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false)

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce search query 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 150)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Focus input when search opens
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load Permissions, Products & Active Price Table
  useEffect(() => {
    async function init() {
      // 1. Check user permission for cost viewing
      const user = getCurrentV2User()
      if (user) {
        try {
          const roles = await listRolesConfig()
          const userRole = (user.role || 'vendedor') as keyof typeof roles
          setCanViewCost(Boolean(roles[userRole]?.permissoes_especiais?.ver_custo_margem))
        } catch {
          setCanViewCost(false)
        }
      }

      // 2. Read cache first for instant render
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached)
          setActiveTable(parsed.table)
          setCachedTime(parsed.cachedAt)
          setLoading(false)
        }
      } catch {}

      // 3. Fetch remote / current data
      try {
        const [tables, products] = await Promise.all([
          listPriceTables(),
          listV2Products(),
        ])

        const pMap = new Map<string, V2Product>()
        products.forEach((p: V2Product) => pMap.set(p.id, p))
        setProductsMap(pMap)

        // Find active table: prioritize is_default, then most recently updated active table
        const active = tables.find((t: V2PriceTable) => t.active && t.is_default) || tables.find((t: V2PriceTable) => t.active) || null
        setActiveTable(active)

        if (active) {
          const nowStr = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          setCachedTime(nowStr)
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ table: active, cachedAt: nowStr }))
          } catch {}
        }
      } catch (err) {
        console.error('Erro ao carregar tabela de preço:', err)
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [])

  // Format currency helpers
  const formatBRL = (val?: number) => {
    if (val == null || isNaN(val)) return 'R$ 0,00'
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Filter items in memory
  const normalize = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const filteredItems = useMemo(() => {
    if (!activeTable || !activeTable.items) return []
    if (!debouncedQuery.trim()) return activeTable.items

    const q = normalize(debouncedQuery)

    return activeTable.items.filter((item) => {
      const prod = productsMap.get(item.product_id)
      const nome = normalize(item.product_name || prod?.name || '')
      const sku = normalize(item.sku || prod?.code_sku || '')
      const linha = normalize(item.product_line || prod?.product_line || '')
      const modelo = normalize(prod?.model || '')
      const categoria = normalize(prod?.category || '')

      return nome.includes(q) || sku.includes(q) || linha.includes(q) || modelo.includes(q) || categoria.includes(q)
    })
  }, [activeTable, debouncedQuery, productsMap])

  if (loading && !activeTable) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-[#0D6BAF]" />
        <span className="text-sm font-semibold">Carregando tabela de preços...</span>
      </div>
    )
  }

  if (!activeTable) {
    return (
      <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 max-w-lg mx-auto mt-6 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
          <Tag className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Nenhuma tabela de preço ativa</h2>
        <p className="text-sm text-slate-500 mt-2">
          Entre em contato com o administrador para habilitar uma tabela de preços padrão para o sistema.
        </p>
      </div>
    )
  }

  const totalCount = activeTable.items?.length || 0
  const filteredCount = filteredItems.length

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* ── HEADER CARD COM NOME E REAJUSTE NÃO EDITÁVEL ── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Título & Identificação */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0D6BAF] flex items-center justify-center border border-sky-100 shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  {activeTable.name}
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Ativa
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                {cachedTime && <span>Atualizada em {cachedTime}</span>}
                {isOffline && (
                  <span className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Reajuste e Botão Lupa */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Reajuste % - Read Only com Cadeado */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700"
              title="Percentual de reajuste fixado na tabela ativa (somente leitura)"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">Reajuste:</span>
              <span className="text-xs font-black text-slate-900 tabular-nums" aria-readonly="true">
                {(Number(activeTable.reajuste_percent) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %
              </span>
            </div>

            {/* Botão Lupa de Pesquisa */}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(!isSearchOpen)
                if (isSearchOpen) setSearchQuery('')
              }}
              className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition border ${
                isSearchOpen
                  ? 'bg-[#0D6BAF] text-white border-[#0D6BAF] shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Pesquisar produtos"
              aria-label="Abrir pesquisa"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* ── BARRA DE PESQUISA EXPANSÍVEL (DEBOUNCE 150ms) ── */}
        {isSearchOpen && (
          <div className="pt-2 border-t border-slate-100 flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Pesquisar por descrição, SKU, linha ou modelo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D6BAF]/20 focus:border-[#0D6BAF]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                  title="Limpar filtro"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap tabular-nums">
              {filteredCount} de {totalCount} itens
            </span>
          </div>
        )}

      </div>

      {/* ── TABELA DE PRODUTOS COMPLETA ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100dvh-240px)]">
          <table className="w-full text-left border-collapse text-sm">
            
            {/* Header Sticky */}
            <thead className="bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th scope="col" className="py-3 px-4 min-w-[220px] sticky left-0 bg-slate-50 z-20 border-r border-slate-200">
                  Produto
                </th>
                {canViewCost && (
                  <th scope="col" className="py-3 px-3 min-w-[130px] text-right">
                    Tabela Fábrica
                  </th>
                )}
                <th scope="col" className="py-3 px-3 min-w-[130px] text-right">
                  Vendas Sul
                </th>
                <th scope="col" className="py-3 px-3 min-w-[140px] text-right text-[#0D6BAF]">
                  Sugestão Vendas
                </th>
                <th scope="col" className="py-3 px-3 min-w-[100px] text-right">
                  Ponto
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canViewCost ? 5 : 4} className="py-12 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span>Nenhum produto encontrado para o termo pesquisado.</span>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const prod = productsMap.get(item.product_id)
                  const sku = item.sku || prod?.code_sku || '—'
                  const nome = item.product_name || prod?.name || 'Produto sem descrição'
                  const linha = item.product_line || prod?.product_line

                  return (
                    <tr
                      key={item.product_id || index}
                      className="hover:bg-slate-50/80 transition-colors h-[56px]"
                    >
                      {/* Coluna 1: Produto (Sticky à esquerda) */}
                      <td className="py-2.5 px-4 sticky left-0 bg-white hover:bg-slate-50/80 z-10 border-r border-slate-100">
                        <div className="font-bold text-slate-900 leading-snug line-clamp-2">
                          {nome}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mt-0.5">
                          <span className="font-mono text-slate-500 font-semibold">{sku}</span>
                          {linha && (
                            <>
                              <span>•</span>
                              <span>{linha}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Tabela Fábrica (Apenas para autorizados) */}
                      {canViewCost && (
                        <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums">
                          {formatBRL(item.tabela_fabrica)}
                        </td>
                      )}

                      {/* Vendas Sul */}
                      <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                        {formatBRL(item.tabela_vendas_sul)}
                      </td>

                      {/* Sugestão de Vendas (Destaque Comercial) */}
                      <td className="py-2.5 px-3 text-right font-black text-[#0D6BAF] text-base tabular-nums">
                        {formatBRL(item.sugestao_vendas)}
                      </td>

                      {/* Ponto */}
                      <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums font-semibold">
                        {item.ponto != null ? item.ponto.toFixed(5) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

          </table>
        </div>
      </div>

    </div>
  )
}
