import { useEffect, useMemo, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { formatBRL } from '../../lib/format'
import * as XLSX from 'xlsx'
import {
  Search,
  Plus,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  X,
  FileSpreadsheet,
} from 'lucide-react'

type Row = {
  id: string
  description: string
  amount: number
  due_date: string
  kind: 'payable' | 'receivable' | 'transfer'
  bank_account_id: string | null
  destination_bank_account_id: string | null
  status: 'open' | 'paid'
  category_id: string | null
}

type Bank = { id: string; name: string }
type Category = { id: string; name: string }

export function V2CashflowPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<Row[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'payable' | 'receivable' | 'transfer'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid'>('all')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formDesc, setFormDesc] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDueDate, setFormDueDate] = useState(new Date().toISOString().split('T')[0])
  const [formKind, setFormKind] = useState<'payable' | 'receivable' | 'transfer'>('payable')
  const [formBankId, setFormBankId] = useState('')
  const [formCatId, setFormCatId] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchMovements = async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [mvRes, bankRes, catRes] = await Promise.all([
      supabase
        .from('payables_receivables')
        .select('*')
        .eq('user_id', ownerUserId)
        .order('due_date', { ascending: false }),
      supabase.from('bank_accounts').select('id, name').eq('user_id', ownerUserId),
      supabase.from('categories').select('id, name').eq('user_id', ownerUserId),
    ])

    setRows((mvRes.data as Row[]) ?? [])
    setBanks((bankRes.data as Bank[]) ?? [])
    setCats((catRes.data as Category[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMovements()
  }, [supabase, ownerUserId])

  const toggleStatus = async (row: Row) => {
    if (!supabase) return
    const newStatus = row.status === 'open' ? 'paid' : 'open'
    const { error } = await supabase
      .from('payables_receivables')
      .update({ status: newStatus })
      .eq('id', row.id)

    if (!error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)))
    }
  }

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !ownerUserId || !formDesc || !formAmount) return
    setSaving(true)

    try {
      const { error } = await supabase.from('payables_receivables').insert({
        user_id: ownerUserId,
        description: formDesc,
        amount: parseFloat(formAmount.replace(',', '.')),
        due_date: formDueDate,
        kind: formKind,
        bank_account_id: formBankId || null,
        category_id: formCatId || null,
        status: 'open',
      })

      if (error) throw error

      setIsModalOpen(false)
      setFormDesc('')
      setFormAmount('')
      fetchMovements()
    } catch (err) {
      console.error('Erro ao salvar transação:', err)
      alert('Erro ao salvar transação.')
    } finally {
      setSaving(false)
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        (r.category_id && cats.find((c) => c.id === r.category_id)?.name.toLowerCase().includes(search.toLowerCase()))
      const matchesKind = kindFilter === 'all' || r.kind === kindFilter
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      return matchesSearch && matchesKind && matchesStatus
    })
  }, [rows, search, kindFilter, statusFilter, cats])

  const exportExcel = () => {
    const dataToExport = filteredRows.map((r) => ({
      Descrição: r.description,
      Valor: r.amount,
      Tipo: r.kind === 'receivable' ? 'Receita' : r.kind === 'payable' ? 'Despesa' : 'Transferência',
      Status: r.status === 'paid' ? 'Pago' : 'Pendente',
      Vencimento: r.due_date,
      Conta: banks.find((b) => b.id === r.bank_account_id)?.name || '-',
      Categoria: cats.find((c) => c.id === r.category_id)?.name || '-',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fluxo_de_Caixa')
    XLSX.writeFile(workbook, `Fluxo_de_Caixa_V2_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              MÓDULO V2
            </span>
            <span className="text-xs text-slate-400">· Lançamentos & Gestão de Caixa</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Fluxo de Caixa</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Transação</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por descrição ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Kind Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setKindFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${kindFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setKindFilter('receivable')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${kindFilter === 'receivable' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Receitas
          </button>
          <button
            type="button"
            onClick={() => setKindFilter('payable')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${kindFilter === 'payable' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Despesas
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Todos Status
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('open')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${statusFilter === 'open' ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Pendentes
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('paid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${statusFilter === 'paid' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Pagas
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs">Carregando transações...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">Nenhum lançamento encontrado para os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                  <th className="px-5 py-3.5">Descrição</th>
                  <th className="px-5 py-3.5">Tipo</th>
                  <th className="px-5 py-3.5">Valor</th>
                  <th className="px-5 py-3.5">Vencimento</th>
                  <th className="px-5 py-3.5">Conta</th>
                  <th className="px-5 py-3.5">Categoria</th>
                  <th className="px-5 py-3.5 text-center">Status / Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((row) => {
                  const isPaid = row.status === 'paid'
                  const bankName = banks.find((b) => b.id === row.bank_account_id)?.name || 'Sem conta'
                  const catName = cats.find((c) => c.id === row.category_id)?.name || 'Sem categoria'

                  return (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-4 font-bold text-white max-w-[220px] truncate">{row.description}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                            row.kind === 'receivable'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : row.kind === 'payable'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {row.kind === 'receivable' ? (
                            <>
                              <ArrowUpRight className="h-3 w-3" /> Receita
                            </>
                          ) : row.kind === 'payable' ? (
                            <>
                              <ArrowDownRight className="h-3 w-3" /> Despesa
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3" /> Transferência
                            </>
                          )}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-4 font-black text-sm tabular-nums ${
                          row.kind === 'receivable' ? 'text-emerald-400' : row.kind === 'payable' ? 'text-rose-400' : 'text-indigo-300'
                        }`}
                      >
                        {formatBRL(Number(row.amount))}
                      </td>
                      <td className="px-5 py-4 font-mono text-slate-400">{row.due_date}</td>
                      <td className="px-5 py-4 text-slate-300">{bankName}</td>
                      <td className="px-5 py-4 text-slate-300">{catName}</td>
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleStatus(row)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                            isPaid
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                          }`}
                        >
                          {isPaid ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          <span>{isPaid ? 'Pago' : 'Pendente (Baixar)'}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white">Nova Transação</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Supermercado, Salário..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    required
                    placeholder="150,00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Data Vencimento</label>
                  <input
                    type="date"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Tipo de Transação</label>
                <select
                  value={formKind}
                  onChange={(e) => setFormKind(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="payable">Despesa (A Pagar)</option>
                  <option value="receivable">Receita (A Receber)</option>
                  <option value="transfer">Transferência</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Conta Bancária</label>
                  <select
                    value={formBankId}
                    onChange={(e) => setFormBankId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Selecione...</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Categoria</label>
                  <select
                    value={formCatId}
                    onChange={(e) => setFormCatId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Selecione...</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg"
                >
                  {saving ? 'Salvando...' : 'Salvar Transação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
