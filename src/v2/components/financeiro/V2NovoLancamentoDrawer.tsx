import React, { useState } from 'react'
import { Plus, X, Info } from 'lucide-react'
import { TipoLancamento, ContaPagar } from '../../services/v2ContasPagarService'

interface V2NovoLancamentoDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSalvar: (conta: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
}

const CATEGORIAS_RECEBER = [
  'Receita de vendas',
  'Rendimentos / Juros',
  'Reembolso',
  'Outras receitas',
]

const CATEGORIAS_PAGAR = [
  'Compra de mercadorias',
  'Serviços contábeis',
  'Aluguel / Condomínio',
  'Folha de pagamento',
  'Impostos / Taxas',
  'Marketing e Comercial',
  'Outras despesas',
]

const FORMAS_PAGAMENTO = [
  'Cartão de crédito',
  'Cartão de débito',
  'Pix',
  'Boleto',
  'Dinheiro',
  'Transferência',
]

export const V2NovoLancamentoDrawer: React.FC<V2NovoLancamentoDrawerProps> = ({
  isOpen,
  onClose,
  onSalvar,
}) => {
  if (!isOpen) return null

  const [tipo, setTipo] = useState<TipoLancamento>('pagar')
  const [descricao, setDescricao] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [categoria, setCategoria] = useState(tipo === 'pagar' ? CATEGORIAS_PAGAR[0] : CATEGORIAS_RECEBER[0])
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(() => new Date().toISOString().split('T')[0])
  const [formaPagto, setFormaPagto] = useState('Boleto')
  const [origem, setOrigem] = useState<'avulsa' | 'venda' | 'compra'>('avulsa')
  const [salvando, setSalvando] = useState(false)

  const handleTipoChange = (novoTipo: TipoLancamento) => {
    setTipo(novoTipo)
    setCategoria(novoTipo === 'pagar' ? CATEGORIAS_PAGAR[0] : CATEGORIAS_RECEBER[0])
    setFormaPagto(novoTipo === 'pagar' ? 'Boleto' : 'Cartão de crédito')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valorNum = parseFloat(valor.replace(',', '.')) || 0
    if (!descricao.trim() || valorNum <= 0) return

    setSalvando(true)
    try {
      await onSalvar({
        tipo,
        descricao: descricao.trim(),
        fornecedor: pessoa.trim() || null,
        categoria,
        total: valorNum,
        totalPago: 0,
        status: 'aberta',
        vencimento,
        forma_pagamento: formaPagto,
        origem,
        parcelas: [
          {
            numero: 1,
            vencimento,
            valor: valorNum,
            status: 'aberta',
          },
        ],
      })
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div
        className="w-full sm:max-w-[480px] bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0F3D6E] text-white flex items-center justify-center shrink-0">
              <Plus size={20} className="stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 leading-tight">Novo lançamento financeiro</h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                Conta a pagar ou a receber · lançamento único, sem parcelas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form id="form-novo-lancamento" onSubmit={handleSubmit} className="p-5 space-y-5 flex-1">
          {/* Seção 1: Tipo e Identificação */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">
              Tipo e Identificação
            </span>

            {/* Toggle Tipo */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleTipoChange('pagar')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                  tipo === 'pagar'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                A pagar (despesa)
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange('receber')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                  tipo === 'receber'
                    ? 'bg-[#2D6A4F] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                A receber (receita)
              </button>
            </div>

            {/* Descrição */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Descrição *
              </label>
              <input
                type="text"
                required
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Venda avulsa · travesseiro"
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            {/* Pessoa e Categoria */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {tipo === 'receber' ? 'Cliente' : 'Fornecedor'}
                </label>
                <input
                  type="text"
                  value={pessoa}
                  onChange={(e) => setPessoa(e.target.value)}
                  placeholder={tipo === 'receber' ? 'Ex: Rita M.' : 'Ex: Rta Cont'}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Categoria
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                >
                  {(tipo === 'receber' ? CATEGORIAS_RECEBER : CATEGORIAS_PAGAR).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Seção 2: Valor e Vencimento */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">
              Valor e Vencimento
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Valor (R$) *
                </label>
                <input
                  type="text"
                  required
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Vencimento *
                </label>
                <input
                  type="date"
                  required
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Forma de pagamento
                </label>
                <select
                  value={formaPagto}
                  onChange={(e) => setFormaPagto(e.target.value)}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Origem (opcional)
                </label>
                <select
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value as 'avulsa' | 'venda' | 'compra')}
                  className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="avulsa">Sem vínculo</option>
                  <option value="venda">Pedido de venda</option>
                  <option value="compra">Pedido de compra</option>
                </select>
              </div>
            </div>
          </div>

          {/* Callout Blue Box */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 flex items-start gap-2.5 text-blue-900">
            <Info size={18} className="shrink-0 text-blue-600 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">Lançamento único, sem parcelas.</span> Quando a venda é no cartão parcelado, a administradora controla as parcelas: registre cada repasse recebido na baixa, com o valor que realmente caiu.
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-end gap-2 sticky bottom-0 z-10 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-novo-lancamento"
            disabled={salvando}
            className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#24563F] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          >
            Criar lançamento
          </button>
        </div>
      </div>
    </div>
  )
}
