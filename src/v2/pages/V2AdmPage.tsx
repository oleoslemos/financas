import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentV2User, logoutV2User } from '../services/v2AuthService'
import { isAdminUser } from '../guards/V2AdminGuard'
import {
  listPriceTables,
  savePriceTable,
  deletePriceTable,
  renamePriceTable,
  setDefaultPriceTable,
  createPriceTableWithAllProducts,
  syncMissingProductsToPriceTable,
  calcSugestaoVendas,
  calcPonto,
  formatPonto,
  parseImportText,
  executeImportToCatalogAndTable,
  exportPriceTableToCSV,
  V2PriceTable,
  ParsedImportRow,
} from '../services/v2TabelaPrecoService'
import {
  Tag,
  Plus,
  Search,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Percent,
  Coins,
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Star,
  LogOut,
  ShieldCheck,
  Globe,
  FileSpreadsheet,
  Eye,
  EyeOff,
} from 'lucide-react'

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
}

type Toast = { type: 'success' | 'error'; text: string }

export function V2AdmPage() {
  const navigate = useNavigate()
  const user = getCurrentV2User()

  useEffect(() => {
    if (!user || !isAdminUser(user.username)) {
      navigate('/v2/login', { replace: true })
    }
  }, [navigate, user])

  const [tables, setTables] = useState<V2PriceTable[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<V2PriceTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLine, setFilterLine] = useState<string>('TODAS')

  const [toast, setToast] = useState<Toast | null>(null)
  const showToast = (t: Toast) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // Modal – Criar Tabela
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableReajuste, setNewTableReajuste] = useState<number>(1.0)
  const [newTableValorPonto, setNewTableValorPonto] = useState<number | ''>('')
  const [newTableIsDefault, setNewTableIsDefault] = useState(false)
  const [creatingTable, setCreatingTable] = useState(false)

  // Modal – Renomear Tabela
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameTableName, setRenameTableName] = useState('')
  const [renamingTable, setRenamingTable] = useState(false)

  // Modal – Importar
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importRawText, setImportRawText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [showImportPreview, setShowImportPreview] = useState(false)

  // Paginação
  const ITEMS_PER_PAGE = 50
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [search, filterLine, selectedTableId])

  // Ordenação
  const [sortField, setSortField] = useState<'sku' | 'name' | 'line' | 'fabrica' | 'ponto' | 'sul' | 'sugestao'>('sku')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection('asc') }
  }

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }, [])

  const loadData = async () => {
    setLoading(true)
    const list = await listPriceTables()
    setTables(list)
    if (list.length > 0) {
      const activeTbl =
        list.find((t) => t.id === selectedTableId) ||
        list.find((t) => t.is_default) ||
        list.find((t) => t.active) ||
        list[0]
      setSelectedTableId(activeTbl.id)
      setSelectedTable(activeTbl)
    } else {
      setSelectedTableId('')
      setSelectedTable(null)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (selectedTableId && tables.length > 0) {
      setSelectedTable(tables.find((t) => t.id === selectedTableId) || null)
    }
  }, [selectedTableId, tables])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreatePriceTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableName.trim()) { showToast({ type: 'error', text: 'Informe o nome da tabela de preço.' }); return }
    setCreatingTable(true)
    const valorPontoNum = typeof newTableValorPonto === 'number' ? newTableValorPonto : 0
    const created = await createPriceTableWithAllProducts(newTableName.trim(), newTableReajuste, newTableIsDefault, valorPontoNum)
    setCreatingTable(false)
    setCreateModalOpen(false)
    setNewTableName('')
    setNewTableValorPonto('')
    setNewTableIsDefault(false)
    await loadData()
    setSelectedTableId(created.id)
    showToast({ type: 'success', text: `Tabela "${created.name}" criada com ${created.items.length} produtos!` })
  }

  const handleRenameTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTable) return
    const trimmed = renameTableName.trim()
    if (!trimmed) { showToast({ type: 'error', text: 'Informe um nome válido.' }); return }
    setRenamingTable(true)
    const updated = await renamePriceTable(selectedTable.id, trimmed)
    setRenamingTable(false)
    if (updated) {
      setSelectedTable(updated)
      setTables(prev => prev.map(t => t.id === updated.id ? updated : t))
      setRenameModalOpen(false)
      showToast({ type: 'success', text: `Tabela renomeada para "${updated.name}".` })
    } else {
      showToast({ type: 'error', text: 'Erro ao renomear a tabela.' })
    }
  }

  const handleSetDefaultTable = async (tableId: string) => {
    setLoading(true)
    const updatedList = await setDefaultPriceTable(tableId)
    setTables(updatedList)
    setSelectedTable(updatedList.find(t => t.id === tableId) || null)
    setLoading(false)
    showToast({ type: 'success', text: 'Tabela definida como padrão!' })
  }

  const handleSyncMissingProducts = async () => {
    if (!selectedTable) return
    setLoading(true)
    await syncMissingProductsToPriceTable(selectedTable.id)
    await loadData()
    setLoading(false)
    showToast({ type: 'success', text: 'Produtos ausentes sincronizados!' })
  }

  const handleReajusteChange = (val: number) => {
    if (!selectedTable) return
    const updated = { ...selectedTable, reajuste_percent: val }
    setSelectedTable(updated)
    setTables(prev => prev.map(t => t.id === updated.id ? updated : t))
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => savePriceTable(updated), 400)
  }

  const handleValorPontoChange = (val: number) => {
    if (!selectedTable) return
    const updated = { ...selectedTable, valor_ponto: val }
    setSelectedTable(updated)
    setTables(prev => prev.map(t => t.id === updated.id ? updated : t))
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => savePriceTable(updated), 400)
  }

  const handleDeleteTable = async () => {
    if (!selectedTable) return
    if (window.confirm(`Excluir a tabela "${selectedTable.name}"?`)) {
      await deletePriceTable(selectedTable.id)
      setSelectedTableId('')
      setSelectedTable(null)
      await loadData()
      showToast({ type: 'success', text: 'Tabela removida.' })
    }
  }

  const handleParseImport = () => {
    const rows = parseImportText(importRawText)
    setParsedRows(rows)
    setShowImportPreview(true)
  }

  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) { showToast({ type: 'error', text: 'Nenhuma linha válida.' }); return }
    setImporting(true)
    const res = await executeImportToCatalogAndTable(parsedRows, selectedTableId || '')
    setImporting(false)
    setImportModalOpen(false)
    setImportRawText('')
    setParsedRows([])
    setShowImportPreview(false)
    await loadData()
    if (res.table) setSelectedTableId(res.table.id)
    showToast({ type: 'success', text: `Importação concluída! ${res.registeredCount} novos · ${res.updatedCount} atualizados.` })
  }

  const handleLogout = () => {
    logoutV2User()
    navigate('/v2/login')
  }

  // ── Filter & Sort ──────────────────────────────────────────────────────────

  const items = selectedTable?.items || []
  const distinctLines = Array.from(new Set(items.map(i => i.product_line).filter(Boolean))).sort()
  const filteredItems = items.filter(i => {
    const q = search.toLowerCase()
    return (
      (i.product_name.toLowerCase().includes(q) || (i.sku && i.sku.toLowerCase().includes(q)) || (i.product_line && i.product_line.toLowerCase().includes(q))) &&
      (filterLine === 'TODAS' || i.product_line === filterLine)
    )
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
    let comp = 0
    if (sortField === 'sku') comp = (a.sku || '').localeCompare(b.sku || '', undefined, { numeric: true, sensitivity: 'base' })
    else if (sortField === 'name') comp = a.product_name.localeCompare(b.product_name)
    else if (sortField === 'line') comp = (a.product_line || '').localeCompare(b.product_line || '')
    else if (sortField === 'fabrica') comp = (a.tabela_fabrica || 0) - (b.tabela_fabrica || 0)
    else if (sortField === 'ponto') comp = calcPonto(a.tabela_fabrica, selectedTable?.valor_ponto || 0) - calcPonto(b.tabela_fabrica, selectedTable?.valor_ponto || 0)
    else if (sortField === 'sul') comp = (a.tabela_vendas_sul || 0) - (b.tabela_vendas_sul || 0)
    else if (sortField === 'sugestao') comp = (a.sugestao_vendas || 0) - (b.sugestao_vendas || 0)
    return sortDirection === 'asc' ? comp : -comp
  })

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginatedItems = sortedItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  if (!user || !isAdminUser(user.username)) return null

  return (
    <div className="min-h-screen font-sans pb-16" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2027 100%)' }}>
      {/* BG decorativo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #10b981, transparent 70%)' }} />
      </div>

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">ADM</span>
            </div>
            <span className="text-white font-black text-lg hidden sm:block">Painel Administrativo</span>
          </div>

          {/* Badge Tabela Global Unificada (Multi-Empresa) */}
          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/50 rounded-xl px-3.5 py-1.5 shadow-2xs">
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-300">Tabela Global · Compartilhada entre todas as Empresas</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 hidden md:block">
              Olá, <span className="text-indigo-300 font-black">{user.full_name || user.username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-900/30 border border-slate-700 hover:border-red-700/50 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 animate-in fade-in slide-in-from-right-4">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-bold border ${toast.type === 'success' ? 'bg-emerald-900/90 text-emerald-200 border-emerald-700' : 'bg-red-900/90 text-red-200 border-red-700'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.text}
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header da seção ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Tag className="h-5 w-5 text-indigo-400" />
              <h1 className="text-2xl font-black text-white">Tabelas de Preço Globais</h1>
            </div>
            <p className="text-sm text-slate-400">
              Importação, criação e atualização centralizada de preços · <span className="text-emerald-400 font-semibold">Consumida diretamente por todas as empresas cadastradas no sistema</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedTable && (
              <>
                <button
                  onClick={() => exportPriceTableToCSV(selectedTable)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition"
                >
                  <Download className="h-4 w-4 text-emerald-400" />
                  Exportar CSV
                </button>
                <button
                  onClick={handleSyncMissingProducts}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-900/40 border border-blue-700/50 hover:bg-blue-900/60 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sincronizar Produtos
                </button>
              </>
            )}
            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-purple-300 bg-purple-900/40 border border-purple-700/50 hover:bg-purple-900/60 transition"
            >
              <Upload className="h-4 w-4 text-purple-400" />
              Importar Produtos & Preços
            </button>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-lg"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Plus className="h-4 w-4" />
              Nova Tabela
            </button>
          </div>
        </div>

        {/* ── Seletor de Tabela & Configurações ── */}
        <div className="bg-slate-800/60 border border-slate-700 p-5 rounded-2xl backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Tabela de Preço Ativa:
              </label>
              {tables.length === 0 ? (
                <p className="text-xs text-slate-500 font-bold">Nenhuma tabela cadastrada</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedTableId}
                    onChange={e => setSelectedTableId(e.target.value)}
                    className="rounded-xl px-4 py-2.5 border border-slate-600 text-sm font-black bg-slate-900 text-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 min-w-64 cursor-pointer"
                  >
                    {tables.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.is_default ? '⭐ ' : ''}{t.name} ({t.items.length} itens){t.is_default ? ' [PADRÃO]' : ''}
                      </option>
                    ))}
                  </select>

                  {selectedTable && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setRenameTableName(selectedTable.name); setRenameModalOpen(true) }}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-700 border border-slate-600 hover:bg-slate-600 transition"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-indigo-400" />
                        Renomear
                      </button>

                      {selectedTable.is_default ? (
                        <span className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black bg-amber-900/40 text-amber-300 border border-amber-700/50">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          Tabela Padrão
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultTable(selectedTable.id)}
                          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-700 border border-slate-600 hover:bg-amber-900/30 hover:text-amber-300 hover:border-amber-700/50 transition"
                        >
                          <Star className="h-3.5 w-3.5" />
                          Definir como Padrão
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {selectedTable && (
              <div className="flex flex-wrap items-center gap-4 pt-4 sm:pt-0 sm:pl-4 sm:border-l border-slate-600">
                <div>
                  <label className="block text-[11px] font-bold text-indigo-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Percent className="h-3 w-3" /> Reajuste (%):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" step="0.1"
                      value={selectedTable.reajuste_percent}
                      onChange={e => handleReajusteChange(parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-xl px-3 py-1.5 border border-slate-600 font-black text-sm text-indigo-200 bg-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-indigo-400">%</span>
                  </div>
                </div>
                <div className="pl-4 border-l border-slate-600">
                  <label className="block text-[11px] font-bold text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Coins className="h-3 w-3" /> Valor Ponto:
                  </label>
                  <input
                    type="number" step="any" min="0" placeholder="Ex: 3000"
                    value={selectedTable.valor_ponto || ''}
                    onChange={e => handleValorPontoChange(parseFloat(e.target.value) || 0)}
                    className="w-28 rounded-xl px-3 py-1.5 border border-slate-600 font-black text-sm text-emerald-200 bg-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {selectedTable && (
            <div className="flex items-center gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-700 justify-end">
              <div className="text-right pr-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total</span>
                <span className="text-lg font-black text-white">{selectedTable.items.length} produtos</span>
              </div>
              <button
                onClick={handleDeleteTable}
                className="p-2 rounded-xl text-red-400 hover:bg-red-900/40 hover:text-red-300 border border-transparent hover:border-red-700/50 transition"
                title="Excluir tabela"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Busca & Filtros ── */}
        <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex flex-col lg:flex-row items-center gap-3 justify-between">
            <div className="relative w-full lg:flex-1 lg:max-w-lg">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por descrição, SKU ou linha..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border border-slate-600 bg-slate-900 text-slate-200 outline-none focus:border-indigo-500 placeholder:text-slate-600"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-600">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Linha:</span>
                <select
                  value={filterLine}
                  onChange={e => setFilterLine(e.target.value)}
                  className="text-xs font-bold bg-transparent text-slate-200 outline-none cursor-pointer max-w-[200px]"
                >
                  <option value="TODAS">TODAS</option>
                  {distinctLines.map(line => <option key={line} value={line}>{line}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-600">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Ordenar:</span>
                <select
                  value={`${sortField}-${sortDirection}`}
                  onChange={e => {
                    const [f, d] = e.target.value.split('-') as [typeof sortField, 'asc' | 'desc']
                    setSortField(f); setSortDirection(d)
                  }}
                  className="text-xs font-bold bg-transparent text-slate-200 outline-none cursor-pointer max-w-[220px]"
                >
                  <option value="sku-asc">SKU (001 → 008)</option>
                  <option value="sku-desc">SKU (008 → 001)</option>
                  <option value="name-asc">Descrição (A → Z)</option>
                  <option value="name-desc">Descrição (Z → A)</option>
                  <option value="fabrica-asc">Menor Preço Fábrica</option>
                  <option value="fabrica-desc">Maior Preço Fábrica</option>
                  <option value="ponto-asc">Menor Ponto</option>
                  <option value="ponto-desc">Maior Ponto</option>
                  <option value="sul-asc">Menor Tabela Sul</option>
                  <option value="sul-desc">Maior Tabela Sul</option>
                  <option value="sugestao-desc">Maior Sugestão Vendas</option>
                  <option value="sugestao-asc">Menor Sugestão Vendas</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Grade de preços ── */}
        {loading ? (
          <div className="py-16 text-center bg-slate-800/60 rounded-2xl border border-slate-700">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-400 mb-2" />
            <p className="text-sm font-medium text-slate-400">Carregando tabelas de preço...</p>
          </div>
        ) : !selectedTable || sortedItems.length === 0 ? (
          <div className="py-16 text-center bg-slate-800/60 rounded-2xl border border-dashed border-slate-600">
            <Tag className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">
              {!selectedTable ? 'Nenhuma tabela selecionada' : 'Nenhum produto nesta tabela'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {!selectedTable
                ? 'Clique em "Nova Tabela" ou importe produtos & preços.'
                : 'Clique em "Sincronizar Produtos" para incluir todos os produtos cadastrados.'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                      {([
                        ['sku', 'SKU'],
                        ['name', 'Descrição do Produto'],
                        ['line', 'Linha'],
                        ['fabrica', 'Tabela Fábrica (R$)'],
                        ['ponto', 'Ponto'],
                        ['sul', 'Tabela Sul (R$)'],
                        ['sugestao', 'Sugestão Vendas (R$)'],
                      ] as [typeof sortField, string][]).map(([field, label]) => (
                        <th
                          key={field}
                          onClick={() => handleSort(field)}
                          className={`p-3.5 cursor-pointer hover:bg-slate-700/50 transition select-none group ${field === 'sugestao' ? 'bg-emerald-950/40 text-emerald-400 border-l border-emerald-900/50' : ''}`}
                        >
                          <div className="flex items-center gap-1.5">
                            {field === 'sugestao' && <Sparkles className="h-3.5 w-3.5 text-emerald-500" />}
                            <span>{label}</span>
                            {sortField === field ? (
                              sortDirection === 'asc'
                                ? <ArrowUp className="h-3.5 w-3.5 text-indigo-400" />
                                : <ArrowDown className="h-3.5 w-3.5 text-indigo-400" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-600 opacity-0 group-hover:opacity-100 transition" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 text-xs font-medium text-slate-300">
                    {paginatedItems.map((item, idx) => {
                      const sugestao = calcSugestaoVendas(item.tabela_vendas_sul, selectedTable!.reajuste_percent)
                      const ponto = calcPonto(item.tabela_fabrica, selectedTable!.valor_ponto || 0)
                      return (
                        <tr key={idx} className="hover:bg-indigo-500/5 transition">
                          <td className="p-3.5">
                            <span className="text-[10px] font-black text-indigo-300 bg-indigo-900/40 px-2 py-0.5 rounded font-mono border border-indigo-700/40">
                              {item.sku || '—'}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-white text-sm">{item.product_name}</td>
                          <td className="p-3.5">
                            <span className="inline-block font-bold text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded text-[11px]">
                              {item.product_line || '—'}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-slate-200">{formatCurrency(item.tabela_fabrica)}</td>
                          <td className="p-3.5">
                            <span className="text-slate-400 font-mono text-[11px]">
                              {selectedTable!.valor_ponto && selectedTable!.valor_ponto > 0 ? formatPonto(ponto) : '—'}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-slate-200">{formatCurrency(item.tabela_vendas_sul)}</td>
                          <td className="p-3.5 bg-emerald-950/20 border-l border-emerald-900/30">
                            <span className="font-black text-emerald-300">{formatCurrency(sugestao)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 py-2 px-1">
                <span className="text-xs text-slate-500">
                  {sortedItems.length} produtos · Página {currentPage} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition">
                    Anterior
                  </button>
                  <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition">
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ════════════════ MODAL – CRIAR TABELA ════════════════ */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Nova Tabela de Preço</h2>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-500 hover:text-slate-200 transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePriceTable} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Nome da Tabela *</label>
                <input
                  autoFocus type="text" value={newTableName}
                  onChange={e => setNewTableName(e.target.value)}
                  placeholder="Ex: Tabela Sul Rev 04 2026"
                  className="w-full rounded-xl px-4 py-2.5 border border-slate-600 text-sm font-bold bg-slate-800 text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Reajuste (%)</label>
                  <input
                    type="number" step="0.1" value={newTableReajuste}
                    onChange={e => setNewTableReajuste(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl px-3 py-2.5 border border-slate-600 text-sm font-bold bg-slate-800 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Valor Ponto</label>
                  <input
                    type="number" step="any" min="0" placeholder="Ex: 3000"
                    value={newTableValorPonto}
                    onChange={e => setNewTableValorPonto(e.target.value ? parseFloat(e.target.value) : '')}
                    className="w-full rounded-xl px-3 py-2.5 border border-slate-600 text-sm font-bold bg-slate-800 text-white outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-600"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-amber-600/50 transition">
                <input type="checkbox" checked={newTableIsDefault} onChange={e => setNewTableIsDefault(e.target.checked)} className="rounded accent-amber-400 h-4 w-4" />
                <span className="text-sm font-bold text-slate-200">Definir como Tabela Padrão</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={creatingTable}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {creatingTable ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <><Plus className="h-4 w-4" /> Criar Tabela</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL – RENOMEAR ════════════════ */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Renomear Tabela</h2>
              <button onClick={() => setRenameModalOpen(false)} className="text-slate-500 hover:text-slate-200 transition"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleRenameTable} className="space-y-4">
              <input
                autoFocus type="text" value={renameTableName}
                onChange={e => setRenameTableName(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 border border-slate-600 text-sm font-bold bg-slate-800 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setRenameModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={renamingTable}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {renamingTable ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL – IMPORTAR ════════════════ */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.80)' }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-black text-white">Importar Produtos & Preços</h2>
              </div>
              <button onClick={() => { setImportModalOpen(false); setShowImportPreview(false); setImportRawText(''); setParsedRows([]) }}
                className="text-slate-500 hover:text-slate-200 transition"><X className="h-5 w-5" /></button>
            </div>

            {!showImportPreview ? (
              <div className="space-y-4">
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Formato aceito (separado por Tab, ponto-e-vírgula ou espaços):</p>
                  <code className="text-xs text-emerald-300 font-mono block leading-5">
                    SKU · PRODUTO · LINHA · TABELA FÁBRICA · TABELA SUL<br />
                    EKO-001 · Nome Produto · Linha X · 100,00 · 150,00
                  </code>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Cole aqui o texto da tabela:</label>
                  <textarea
                    value={importRawText}
                    onChange={e => setImportRawText(e.target.value)}
                    rows={12}
                    placeholder="Cole o conteúdo da planilha aqui (Ctrl+V)..."
                    className="w-full rounded-xl px-4 py-3 border border-slate-600 text-xs font-mono bg-slate-800 text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-600 resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleParseImport}
                    disabled={!importRawText.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-purple-200 transition flex items-center justify-center gap-2 disabled:opacity-40 bg-purple-900/60 border border-purple-700/50 hover:bg-purple-900/80"
                  >
                    <Eye className="h-4 w-4" />
                    Pré-visualizar ({importRawText.trim() ? parseImportText(importRawText).length : 0} linhas detectadas)
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white">{parsedRows.length} produtos detectados</p>
                  <button onClick={() => setShowImportPreview(false)}
                    className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-200 transition">
                    <EyeOff className="h-3.5 w-3.5" /> Editar texto
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800 border-b border-slate-700">
                      <tr className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                        <th className="p-2.5">SKU</th>
                        <th className="p-2.5">Produto</th>
                        <th className="p-2.5">Linha</th>
                        <th className="p-2.5">Fábrica</th>
                        <th className="p-2.5">Sul</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {parsedRows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-800/50">
                          <td className="p-2.5 font-mono text-indigo-300">{r.sku || '—'}</td>
                          <td className="p-2.5 font-bold text-white">{r.product_name}</td>
                          <td className="p-2.5 text-slate-400">{r.product_line}</td>
                          <td className="p-2.5 text-slate-300">{formatCurrency(r.tabela_fabrica)}</td>
                          <td className="p-2.5 text-slate-300">{formatCurrency(r.tabela_vendas_sul)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-xl p-3">
                  <p className="text-xs font-bold text-indigo-300">
                    Tabela de destino: <span className="text-white">{selectedTable?.name || '(será criada automaticamente)'}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => { setImportModalOpen(false); setShowImportPreview(false); setImportRawText(''); setParsedRows([]) }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleExecuteImport} disabled={importing || parsedRows.length === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>
                    {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</> : <><Upload className="h-4 w-4" /> Confirmar Importação</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
