import React, { useState, useEffect } from 'react'
import { X, Edit3, ArrowUpRight, ArrowDownLeft, AlertCircle } from 'lucide-react'
import { ContaPagar, TipoLancamento, StatusConta } from '../../services/v2ContasPagarService'

interface V2EditarLancamentoDrawerProps {
  isOpen: boolean
  onClose: () => void
  conta: ContaPagar | null
  onSalvar: (contaAtualizada: ContaPagar) => Promise<void>
}

const CATEGORIAS_RECEBER = [
  'Receita de vendas',
  'Rendimentos / Juros',
  'Reembolso',
  'Outras receitas',
]

const CATEGORIAS_PAGAR = [
  'Comissões',
  'Compra de mercadorias',
  'Serviços contábeis',
  'Aluguel / Condomínio',
  'Folha de pagamento',
  'Impostos / Taxas',
  'Marketing e Comercial',
  'Outras despesas',
]

const FORMAS_PAGAMENTO = [
  'Boleto',
  'Pix',
  'Cartão de crédito',
  'Cartão de débito',
  'Dinheiro',
  'Transferência',
]

export const V2EditarLancamentoDrawer: React.FC<V2EditarLancamentoDrawerProps> = ({
  isOpen,
  onClose,
  conta,
  onSalvar,
}) => {
  if (!isOpen || !conta) return null

  const [tipo, setTipo] = useState<TipoLancamento>(conta.tipo || 'pagar')
  const [descricao, setDescricao] = useState(conta.descricao || '')
  const [fornecedor, setFornecedor] = useState(conta.fornecedor || '')
  const [categoria, setCategoria] = useState(conta.categoria || '')
  const [valor, setValor] = useState(String(conta.total || ''))
  const [vencimento, setVencimento] = useState(
    conta.vencimento || conta.parcelas?.[0]?.vencimento || new Date().toISOString().split('T')[0]
  )
  const [formaPagto, setFormaPagto] = useState(conta.forma_pagamento || 'Boleto')
  const [contaTag, setContaTag] = useState(conta.conta_bancaria_tag || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (conta) {
      setTipo(conta.tipo || 'pagar')
      setDescricao(conta.descricao || '')
      setFornecedor(conta.fornecedor || '')
      setCategoria(conta.categoria || '')
      setValor(String(conta.total || ''))
      setVencimento(
        conta.vencimento || conta.parcelas?.[0]?.vencimento || new Date().toISOString().split('T')[0]
      )
      setFormaPagto(conta.forma_pagamento || 'Boleto')
      setContaTag(conta.conta_bancaria_tag || '')
      setErro(null)
    }
  }, [conta])

  const categoriasSugeridas = tipo === 'pagar' ? CATEGORIAS_PAGAR : CATEGORIAS_RECEBER

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    const valorNum = parseFloat(String(valor).replace(',', '.'))
    if (!descricao.trim()) {
      setErro('A descrição é obrigatória.')
      return
    }
    if (isNaN(valorNum) || valorNum <= 0) {
      setErro('Informe um valor válido maior que zero.')
      return
    }

    setSalvando(true)
    try {
      const parcelasAtualizadas =
        conta.parcelas && conta.parcelas.length > 0
          ? conta.parcelas.map((p, idx) => {
              if (idx === 0 && conta.status !== 'paga') {
                return { ...p, valor: valorNum, vencimento }
              }
              return p
            })
          : [
              {
                numero: 1,
                vencimento,
                valor: valorNum,
                status: conta.status || ('aberta' as StatusConta),
              },
            ]

      const contaAtualizada: ContaPagar = {
        ...conta,
        tipo,
        descricao: descricao.trim(),
        fornecedor: fornecedor.trim() || null,
        categoria: categoria.trim() || null,
        total: valorNum,
        vencimento,
        forma_pagamento: formaPagto,
        conta_bancaria_tag: contaTag.trim() || undefined,
        parcelas: parcelasAtualizadas,
        updated_at: new Date().toISOString(),
      }

      await onSalvar(contaAtualizada)
      onClose()
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar alterações do lançamento.')
    } finally {
      setSalvando(false)
    }
  }

  const isPagar = tipo === 'pagar'

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div
        className="w-full sm:max-w-[500px] bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 tracking-tight">Editar Lançamento</h3>
              <p className="text-xs text-slate-500">Altere os dados do título financeiro</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form id="form-editar-lancamento" onSubmit={handleSubmit} className="p-6 space-y-5 flex-1">
          {erro && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Tipo de Lançamento */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Tipo de Movimentação
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setTipo('pagar')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  isPagar
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowUpRight size={15} /> A Pagar (Saída)
              </button>
              <button
                type="button"
                onClick={() => setTipo('receber')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  !isPagar
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDownLeft size={15} /> A Receber (Entrada)
              </button>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Descrição do Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Compra de mercadorias, Comissão Venda, etc."
              className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white bg-slate-50 transition-colors"
            />
          </div>

          {/* Fornecedor / Cliente / Contraparte */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              {isPagar ? 'Fornecedor / Favorecido' : 'Cliente / Pagador'}
            </label>
            <input
              type="text"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              placeholder={isPagar ? 'Nome do fornecedor ou profissional' : 'Nome do cliente'}
              className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white bg-slate-50 transition-colors"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Categoria Financeira</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ex: Comissões, Mercadorias, Marketing..."
                list="categorias-sugeridas"
                className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white bg-slate-50 transition-colors"
              />
              <datalist id="categorias-sugeridas">
                {categoriasSugeridas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Grid: Valor e Vencimento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Valor (R$) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  R$
                </span>
                <input
                  type="text"
                  required
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full text-xs font-extrabold text-slate-900 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white bg-slate-50 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Data de Vencimento</label>
              <input
                type="date"
                required
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white bg-slate-50 transition-colors"
              />
            </div>
          </div>

          {/* Grid: Forma de Pagamento e Conta Bancária / Tag */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Forma de Pagamento</label>
              <select
                value={formaPagto}
                onChange={(e) => setFormaPagto(e.target.value)}
                className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white transition-colors cursor-pointer"
              >
                {FORMAS_PAGAMENTO.map((fp) => (
                  <option key={fp} value={fp}>
                    {fp}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Conta Bancária / Tag</label>
              <input
                type="text"
                value={contaTag}
                onChange={(e) => setContaTag(e.target.value)}
                placeholder="Ex: #Inter, #Nubank"
                className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white bg-slate-50 transition-colors"
              />
            </div>
          </div>

          {/* Informação sobre o status atual */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Status do Lançamento:</span>
              <span className="font-bold uppercase tracking-wider text-[11px] text-slate-800">
                {conta.status === 'paga'
                  ? (conta.tipo === 'receber' ? 'RECEBIDA' : 'PAGA')
                  : conta.status}
              </span>
            </div>
            {conta.status === 'paga' && (
              <p className="text-[11px] text-emerald-700 font-medium">
                Este título já foi liquidado ({conta.tipo === 'receber' ? 'recebido' : 'pago'}). As alterações não reverterão a baixa realizada.
              </p>
            )}
            {conta.pedido_id && (
              <p className="text-[11px] text-sky-700 font-medium">
                Vinculado ao pedido ID: {conta.pedido_id.slice(0, 14)}...
              </p>
            )}
          </div>
        </form>

        {/* Footer Buttons */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5 sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-editar-lancamento"
            disabled={salvando}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
