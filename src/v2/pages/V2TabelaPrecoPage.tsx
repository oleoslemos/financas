import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentV2User } from '../services/v2AuthService'
import {
  listPriceTables,
  savePriceTable,
  deletePriceTable,
  createPriceTableWithAllProducts,
  syncMissingProductsToPriceTable,
  calcSugestaoVendas,
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
  FileSpreadsheet,
  Percent,
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
}

type Toast = { type: 'success' | 'error'; text: string }

export function V2TabelaPrecoPage() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!getCurrentV2User()) navigate('/v2/login', { replace: true })
  }, [navigate])

  const [tables, setTables] = useState<V2PriceTable[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<V2PriceTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLine, setFilterLine] = useState<string>('TODAS')

  // Toast
  const [toast, setToast] = useState<Toast | null>(null)
  const showToast = (t: Toast) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableReajuste, setNewTableReajuste] = useState<number>(1.0)
  const [creatingTable, setCreatingTable] = useState(false)

  // Import Modal state
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importRawText, setImportRawText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([])
  const [importing, setImporting] = useState(false)

  // Sorting
  const [sortField, setSortField] = useState<'sku' | 'name' | 'line' | 'fabrica' | 'sul' | 'sugestao'>('sku')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: 'sku' | 'name' | 'line' | 'fabrica' | 'sul' | 'sugestao') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Load tables
  const loadData = async () => {
    setLoading(true)
    const list = await listPriceTables()
    setTables(list)

    if (list.length > 0) {
      const activeTbl = list.find((t) => t.id === selectedTableId) || list[0]
      setSelectedTableId(activeTbl.id)
      setSelectedTable(activeTbl)
    } else {
      setSelectedTableId('')
      setSelectedTable(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedTableId && tables.length > 0) {
      const found = tables.find((t) => t.id === selectedTableId) || null
      setSelectedTable(found)
    }
  }, [selectedTableId, tables])

  // Handle Creating a New Price Table
  const handleCreatePriceTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableName.trim()) {
      showToast({ type: 'error', text: 'Informe o nome da tabela de preço.' })
      return
    }

    setCreatingTable(true)
    const created = await createPriceTableWithAllProducts(newTableName.trim(), newTableReajuste)
    setCreatingTable(false)
    setCreateModalOpen(false)
    setNewTableName('')

    await loadData()
    setSelectedTableId(created.id)
    showToast({
      type: 'success',
      text: `Tabela "${created.name}" criada com sucesso contendo ${created.items.length} produtos!`,
    })
  }

  // Handle Sync Missing Products
  const handleSyncMissingProducts = async () => {
    if (!selectedTable) return
    setLoading(true)
    const updated = await syncMissingProductsToPriceTable(selectedTable.id)
    await loadData()
    setLoading(false)
    if (updated) {
      showToast({
        type: 'success',
        text: 'Produtos ausentes sincronizados com sucesso!',
      })
    }
  }

  // Handle Live Reajuste % Update
  const handleReajustePercentChange = async (newPercent: number) => {
    if (!selectedTable) return
    const updated = await savePriceTable({
      ...selectedTable,
      reajuste_percent: newPercent,
    })
    setSelectedTable(updated)
    setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  // Handle Deleting Price Table
  const handleDeleteTable = async () => {
    if (!selectedTable) return
    if (window.confirm(`Tem certeza que deseja excluir a tabela "${selectedTable.name}"?`)) {
      await deletePriceTable(selectedTable.id)
      setSelectedTableId('')
      setSelectedTable(null)
      await loadData()
      showToast({ type: 'success', text: 'Tabela de preço removida com sucesso.' })
    }
  }

  // Handle Import Preview
  const handleParseImport = () => {
    const rows = parseImportText(importRawText)
    setParsedRows(rows)
  }

  // Handle Execute Import
  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) {
      showToast({ type: 'error', text: 'Nenhuma linha válida para importar.' })
      return
    }

    setImporting(true)
    const targetId = selectedTableId || ''
    const res = await executeImportToCatalogAndTable(parsedRows, targetId)
    setImporting(false)
    setImportModalOpen(false)
    setImportRawText('')
    setParsedRows([])

    await loadData()
    if (res.table) setSelectedTableId(res.table.id)

    showToast({
      type: 'success',
      text: `Importação concluída! ${res.registeredCount} produtos novos cadastrados e ${res.updatedCount} atualizados na Tabela de Preço.`,
    })
  }

  // Filter & Sort Items in Selected Table
  const items = selectedTable?.items || []

  const distinctLines = Array.from(
    new Set(items.map((i) => i.product_line).filter(Boolean))
  ).sort()

  const filteredItems = items.filter((i) => {
    const q = search.toLowerCase()
    const matchesSearch =
      i.product_name.toLowerCase().includes(q) ||
      (i.sku && i.sku.toLowerCase().includes(q)) ||
      (i.product_line && i.product_line.toLowerCase().includes(q))

    const matchesLine = filterLine === 'TODAS' || i.product_line === filterLine

    return matchesSearch && matchesLine
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
    let comp = 0
    if (sortField === 'sku') {
      comp = (a.sku || '').localeCompare(b.sku || '', undefined, { numeric: true, sensitivity: 'base' })
    } else if (sortField === 'name') {
      comp = a.product_name.localeCompare(b.product_name)
    } else if (sortField === 'line') {
      comp = (a.product_line || '').localeCompare(b.product_line || '')
    } else if (sortField === 'fabrica') {
      comp = (a.tabela_fabrica || 0) - (b.tabela_fabrica || 0)
    } else if (sortField === 'sul') {
      comp = (a.tabela_vendas_sul || 0) - (b.tabela_vendas_sul || 0)
    } else if (sortField === 'sugestao') {
      comp = (a.sugestao_vendas || 0) - (b.sugestao_vendas || 0)
    }
    return sortDirection === 'asc' ? comp : -comp
  })

  return (
    <div
      className="min-h-screen font-sans pb-16"
      style={{ background: 'linear-gradient(135deg, #EEF5F9 0%, #F0F7EE 100%)' }}
    >
      {/* Background Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #8B5CF6, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #10B981, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: '#1A2E1A' }}>
              Tabelas de Preço
            </h1>
            <p className="text-sm font-medium mt-1" style={{ color: '#4A6A4A' }}>
              Gerencie listas de preços por canal ou vigência, reajuste percentual automático e ferramenta de importação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedTable && (
              <>
                <button
                  onClick={() => exportPriceTableToCSV(selectedTable)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition shadow-2xs"
                  title="Exportar Tabela de Preço Atual para CSV"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  Exportar CSV
                </button>

                <button
                  onClick={handleSyncMissingProducts}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition shadow-2xs"
                  title="Sincronizar produtos ausentes nesta tabela"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sincronizar Produtos
                </button>
              </>
            )}

            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition shadow-2xs"
              title="Importar lista de produtos e preços (Imagem 02)"
            >
              <Upload className="h-4 w-4 text-purple-600" />
              Importar Produtos & Preços
            </button>

            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-sm justify-center"
              style={{ background: '#8B5CF6' }}
            >
              <Plus className="h-4 w-4" />
              Criar Tabela de Preço
            </button>
          </div>
        </div>

        {/* ── TABLE SELECTOR & REAJUSTE CONTROL BAR ── */}
        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Tabela de Preço Ativa:
              </label>
              {tables.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold">Nenhuma tabela cadastrada</p>
              ) : (
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="rounded-xl px-4 py-2.5 border border-purple-200 text-sm font-black bg-purple-50/50 text-purple-900 outline-none focus:ring-2 focus:ring-purple-400 min-w-64"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.items.length} itens - {t.reajuste_percent}% Reajuste)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedTable && (
              <div className="flex items-center gap-2 pt-4 sm:pt-0 sm:pl-4 sm:border-l border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Percent className="h-3 w-3 text-purple-600" />
                    Percentual Reajuste (%):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      value={selectedTable.reajuste_percent}
                      onChange={(e) => handleReajustePercentChange(parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-xl px-3 py-1.5 border border-purple-300 font-black text-sm text-purple-900 bg-white outline-none focus:ring-2 focus:ring-purple-400"
                    />
                    <span className="text-xs font-bold text-purple-700">%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedTable && (
            <div className="flex items-center gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 justify-end">
              <div className="text-right pr-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Itens</span>
                <span className="text-lg font-black text-slate-800">{selectedTable.items.length} produtos</span>
              </div>
              <button
                onClick={handleDeleteTable}
                className="p-2 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                title="Excluir esta Tabela de Preço"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* ── SEARCH & LINE FILTERS BAR ── */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3 justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por descrição, SKU ou linha..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border border-slate-200 bg-slate-50 outline-none focus:border-purple-500"
              />
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 w-full md:w-auto">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Ordenar por:</span>
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [f, d] = e.target.value.split('-') as ['sku' | 'name' | 'line' | 'fabrica' | 'sul' | 'sugestao', 'asc' | 'desc']
                  setSortField(f)
                  setSortDirection(d)
                }}
                className="text-xs font-bold bg-transparent text-slate-800 outline-none cursor-pointer"
              >
                <option value="sku-asc">SKU (Crescente 001 ➔ 008)</option>
                <option value="sku-desc">SKU (Decrescente 008 ➔ 001)</option>
                <option value="name-asc">Descrição Produto (A ➔ Z)</option>
                <option value="name-desc">Descrição Produto (Z ➔ A)</option>
                <option value="sugestao-desc">Maior Sugestão Vendas</option>
                <option value="sugestao-asc">Menor Sugestão Vendas</option>
              </select>
            </div>
          </div>

          {/* Line Filters */}
          {distinctLines.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Linha:</span>
              {['TODAS', ...distinctLines].map((line) => (
                <button
                  key={line}
                  onClick={() => setFilterLine(line)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap border ${
                    filterLine === line
                      ? 'bg-purple-50 text-purple-800 border-purple-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {line}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── PRICE TABLE GRID ── */}
        {loading ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600 mb-2" />
            <p className="text-sm font-medium text-slate-500">Carregando tabelas de preço...</p>
          </div>
        ) : !selectedTable || sortedItems.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <Tag className="h-10 w-10 text-purple-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">
              {!selectedTable ? 'Nenhuma tabela de preço selecionada' : 'Nenhum produto nesta tabela de preço'}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {!selectedTable
                ? 'Clique em "Criar Tabela de Preço" para iniciar ou selecione uma tabela existente.'
                : 'Clique no botão "Sincronizar Produtos" para incluir automaticamente todos os produtos cadastrados.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    <th
                      onClick={() => handleSort('sku')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition select-none group"
                      title="Clique para ordenar por SKU"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>SKU</span>
                        {sortField === 'sku' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-purple-600 font-black" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-purple-600 font-black" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('name')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition select-none group"
                      title="Clique para ordenar por Descrição"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Descrição do Produto</span>
                        {sortField === 'name' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-purple-600 font-black" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-purple-600 font-black" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('line')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition select-none group"
                      title="Clique para ordenar por Linha"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Linha</span>
                        {sortField === 'line' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-purple-600 font-black" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-purple-600 font-black" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('fabrica')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition select-none group"
                      title="Clique para ordenar por Tabela Fábrica"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tabela Fábrica (R$)</span>
                        {sortField === 'fabrica' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-purple-600 font-black" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-purple-600 font-black" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('sul')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100/80 transition select-none group"
                      title="Clique para ordenar por Tabela Sul"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tabela Sul (R$)</span>
                        {sortField === 'sul' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-purple-600 font-black" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-purple-600 font-black" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('sugestao')}
                      className="p-3.5 cursor-pointer bg-emerald-50/70 text-emerald-900 border-l border-emerald-100 hover:bg-emerald-100/70 transition select-none group"
                      title="Sugestão de Vendas com Reajuste + Regra de Arredondamento Especial"
                    >
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Sugestão Vendas (R$)</span>
                        {sortField === 'sugestao' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-emerald-700 font-black" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-emerald-700 font-black" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-emerald-400 opacity-0 group-hover:opacity-100 transition" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {sortedItems.map((item, idx) => {
                    const sugestaoCalculada = calcSugestaoVendas(item.tabela_vendas_sul, selectedTable.reajuste_percent)

                    return (
                      <tr key={idx} className="hover:bg-purple-50/30 transition">
                        <td className="p-3.5">
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-mono border border-purple-200">
                            {item.sku || 'SKU'}
                          </span>
                        </td>

                        <td className="p-3.5 font-bold text-slate-900 text-sm">
                          {item.product_name}
                        </td>

                        <td className="p-3.5">
                          <span className="inline-block font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {item.product_line || 'Geral'}
                          </span>
                        </td>

                        <td className="p-3.5 font-medium text-slate-600">
                          {formatCurrency(item.tabela_fabrica)}
                        </td>

                        <td className="p-3.5 font-bold text-blue-700">
                          {formatCurrency(item.tabela_vendas_sul)}
                        </td>

                        <td className="p-3.5 font-black text-emerald-800 text-sm bg-emerald-50/40 border-l border-emerald-100">
                          {formatCurrency(sugestaoCalculada)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL CRIAR TABELA DE PREÇO ── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Tag className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-slate-900 uppercase">Criar Tabela de Preço</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePriceTable} className="space-y-4 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1">Nome da Tabela de Preço *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tabela Padrão 2026, Tabela Sul + 2%"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block mb-1">Percentual Reajuste (%) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="Ex: 1.0"
                  value={newTableReajuste}
                  onChange={(e) => setNewTableReajuste(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-purple-500"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1">
                  O valor da Sugestão de Vendas será calculado automaticamente com a regra de arredondamento especial.
                </p>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-[11px] font-medium leading-snug">
                ✨ Todos os produtos cadastrados no menu Produtos serão incluídos automaticamente nesta nova tabela.
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingTable}
                  className="px-6 py-2.5 rounded-xl text-white font-bold bg-purple-600 hover:bg-purple-700 transition"
                >
                  {creatingTable ? 'Criando...' : 'Criar Tabela'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL IMPORTAR PRODUTOS E PREÇOS (IMAGEM 02) ── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-5 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">
                    Importar Produtos & Tabela de Preço
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cole os dados da planilha (Imagem 02) para cadastrar produtos automaticamente e atualizar preços.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cole o conteúdo da planilha (Colunas: PRODUTO | LINHA | TABELA FABRICA | TABELA SUL):
                </label>
                <textarea
                  rows={6}
                  value={importRawText}
                  onChange={(e) => setImportRawText(e.target.value)}
                  placeholder={`Exemplo de conteúdo copiado do Excel:\nRENOVA [0,88 x 1,88 x 0,20m]\tColchões Relax\tR$ 858,49\tR$ 2.002,57\nSEVEN [1,38 x 1,88 x 0,30m]\tColchões Relax\tR$ 1.841,31\tR$ 4.295,16\nNEWS [1,58 x 1,98 x 0,26m]\tColchões Premium\tR$ 4.743,33\tR$ 11.064,58`}
                  className="w-full rounded-2xl p-3 border border-slate-200 font-mono text-xs outline-none focus:border-purple-500 bg-slate-50"
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleParseImport}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100"
                >
                  🔍 Processar Pré-visualização ({parsedRows.length} linhas detectadas)
                </button>
              </div>

              {/* PREVIEW GRID */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">
                    Pré-visualização dos Produtos ({parsedRows.length} itens):
                  </h4>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="p-2">PRODUTO</th>
                          <th className="p-2">LINHA</th>
                          <th className="p-2">TABELA FÁBRICA</th>
                          <th className="p-2">TABELA SUL</th>
                          <th className="p-2">SKU STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {parsedRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-bold text-slate-900">{r.product_name}</td>
                            <td className="p-2 text-slate-600">{r.product_line}</td>
                            <td className="p-2">{formatCurrency(r.tabela_fabrica)}</td>
                            <td className="p-2 font-bold text-emerald-700">{formatCurrency(r.tabela_vendas_sul)}</td>
                            <td className="p-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                                {r.sku || 'SKU Automático (EKO-PRD-00X)'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={importing || parsedRows.length === 0}
                  onClick={handleExecuteImport}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm bg-purple-600 hover:bg-purple-700 transition"
                >
                  {importing ? 'Importando...' : 'Confirmar Importação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold z-50 transition-all"
          style={{
            background: toast.type === 'success' ? '#EBF5E8' : '#FEE8E8',
            border: `1px solid ${toast.type === 'success' ? '#C8E6C0' : '#FFCDD2'}`,
            color: toast.type === 'success' ? '#3A7A2A' : '#C62828',
          }}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  )
}
