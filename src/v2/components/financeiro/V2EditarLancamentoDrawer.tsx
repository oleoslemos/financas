import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Edit3,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  DollarSign,
} from 'lucide-react'
import { ContaPagar, TipoLancamento, StatusConta, ContaPagarParcela } from '../../services/v2ContasPagarService'

interface V2EditarLancamentoDrawerProps {
  isOpen: boolean
  onClose: () => void
  conta: ContaPagar | null
  onSalvar: (contaAtualizada: ContaPagar) => Promise<void>
}

const CATEGORIAS_RECEBER = [
  'Receita de Vendas',
  'Receita de vendas',
  'Rendimentos / Juros',
  'Reembolso',
  'Outras receitas',
]

const CATEGORIAS_PAGAR = [
  'Comissões',
  'Compra de mercadorias',
  'Mercadoria',
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

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function somarDiasIso(iso: string, dias: number): string {
  try {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + dias)
    return dt.toISOString().split('T')[0]
  } catch {
    const dt = new Date()
    dt.setDate(dt.getDate() + dias)
    return dt.toISOString().split('T')[0]
  }
}

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
  const [formaPagto, setFormaPagto] = useState(conta.forma_pagamento || 'Boleto')
  const [contaTag, setContaTag] = useState(conta.conta_bancaria_tag || '')
  const [parcelas, setParcelas] = useState<ContaPagarParcela[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (conta) {
      setTipo(conta.tipo || 'pagar')
      setDescricao(conta.descricao || '')
      setFornecedor(conta.fornecedor || '')
      setCategoria(conta.categoria || '')
      setFormaPagto(conta.forma_pagamento || 'Boleto')
      setContaTag(conta.conta_bancaria_tag || '')
      setErro(null)

      if (Array.isArray(conta.parcelas) && conta.parcelas.length > 0) {
        setParcelas(conta.parcelas.map((p) => ({ ...p })))
      } else {
        const valorInicial = Number(conta.total) || 0
        const vencInicial =
          conta.vencimento || new Date().toISOString().split('T')[0]
        setParcelas([
          {
            numero: 1,
            vencimento: vencInicial,
            valor: valorInicial,
            status: conta.status || ('aberta' as StatusConta),
          },
        ])
      }
    }
  }, [conta])

  // Total somado de todas as parcelas atuais
  const totalParcelas = useMemo(() => {
    return parcelas.reduce((acc, p) => acc + (Number(p.valor) || 0), 0)
  }, [parcelas])

  // Total já liquidado/pago
  const totalPago = useMemo(() => {
    return parcelas.reduce((acc, p) => {
      if (p.baixa?.valorFinalPago) return acc + p.baixa.valorFinalPago
      if (p.status === 'paga') return acc + (Number(p.valor) || 0)
      return acc
    }, 0)
  }, [parcelas])

  const saldoRestante = Math.max(0, totalParcelas - totalPago)

  const categoriasSugeridas = tipo === 'pagar' ? CATEGORIAS_PAGAR : CATEGORIAS_RECEBER

  // Alterar valor ou vencimento de uma parcela específica
  const handleAlterarParcela = (
    index: number,
    campo: 'vencimento' | 'valor',
    valorNovo: string | number
  ) => {
    setParcelas((prev) => {
      const copy = [...prev]
      if (!copy[index]) return prev
      if (campo === 'valor') {
        const num = typeof valorNovo === 'number' ? valorNovo : parseFloat(String(valorNovo).replace(',', '.'))
        copy[index] = { ...copy[index], valor: isNaN(num) ? 0 : num }
      } else {
        copy[index] = { ...copy[index], vencimento: String(valorNovo) }
      }
      return copy
    })
  }

  // Adicionar uma nova parcela (+30 dias da última)
  const handleAdicionarParcela = () => {
    setParcelas((prev) => {
      const ultimoNum = prev.length
      const ultimoVenc =
        prev[prev.length - 1]?.vencimento || new Date().toISOString().split('T')[0]
      const proximoVenc = somarDiasIso(ultimoVenc, 30)

      // Sugere valor médio ou valor da última
      const valorSugerido = prev.length > 0 ? prev[prev.length - 1].valor : 100

      return [
        ...prev,
        {
          numero: ultimoNum + 1,
          vencimento: proximoVenc,
          valor: valorSugerido,
          status: 'aberta' as StatusConta,
        },
      ]
    })
  }

  // Remover uma parcela aberta
  const handleRemoverParcela = (index: number) => {
    if (parcelas.length <= 1) {
      alert('O lançamento deve conter pelo menos 1 parcela.')
      return
    }
    const parcela = parcelas[index]
    if (parcela.status === 'paga' || parcela.baixa) {
      alert('Não é possível excluir uma parcela que já foi quitada/baixada.')
      return
    }

    setParcelas((prev) => {
      const filtradas = prev.filter((_, i) => i !== index)
      // Renumera
      return filtradas.map((p, i) => ({ ...p, numero: i + 1 }))
    })
  }

  // Distribuir igualmente um novo valor total entre as parcelas abertas
  const handleDistribuirTotal = (novoTotal: number) => {
    if (isNaN(novoTotal) || novoTotal <= 0) return

    setParcelas((prev) => {
      const abertasIndices = prev
        .map((p, idx) => (p.status !== 'paga' && !p.baixa ? idx : -1))
        .filter((i) => i !== -1)

      if (abertasIndices.length === 0) {
        alert('Todas as parcelas já estão pagas. Não há parcelas abertas para recalcular.')
        return prev
      }

      // Soma do que já está pago
      const somaPagas = prev.reduce((acc, p) => {
        if (p.status === 'paga' || p.baixa) {
          return acc + (p.baixa?.valorFinalPago || p.valor)
        }
        return acc
      }, 0)

      const valorRestante = Math.max(0, novoTotal - somaPagas)
      const qtdAbertas = abertasIndices.length
      const valorBase = Number((valorRestante / qtdAbertas).toFixed(2))

      return prev.map((p, idx) => {
        if (p.status === 'paga' || p.baixa) return p
        // Ajuste de centavos na última parcela aberta
        const isUltimaAberta = idx === abertasIndices[abertasIndices.length - 1]
        const val = isUltimaAberta
          ? Number((valorRestante - valorBase * (qtdAbertas - 1)).toFixed(2))
          : valorBase

        return { ...p, valor: val }
      })
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (!descricao.trim()) {
      setErro('A descrição é obrigatória.')
      return
    }

    if (parcelas.length === 0) {
      setErro('Informe pelo menos 1 parcela.')
      return
    }

    // Valida parcelas
    for (let i = 0; i < parcelas.length; i++) {
      const p = parcelas[i]
      if (isNaN(p.valor) || p.valor <= 0) {
        setErro(`A parcela #${p.numero || i + 1} precisa ter um valor maior que zero.`)
        return
      }
      if (!p.vencimento) {
        setErro(`A parcela #${p.numero || i + 1} precisa ter uma data de vencimento válida.`)
        return
      }
    }

    setSalvando(true)
    try {
      const totalFinal = parcelas.reduce((acc, p) => acc + (Number(p.valor) || 0), 0)
      const primeiraAberta = parcelas.find((p) => p.status !== 'paga')
      const primeiroVenc = primeiraAberta?.vencimento || parcelas[0]?.vencimento

      const contaAtualizada: ContaPagar = {
        ...conta,
        tipo,
        descricao: descricao.trim(),
        fornecedor: fornecedor.trim() || null,
        categoria: categoria.trim() || null,
        total: Number(totalFinal.toFixed(2)),
        vencimento: primeiroVenc,
        forma_pagamento: formaPagto,
        conta_bancaria_tag: contaTag.trim() || undefined,
        parcelas,
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
        className="w-full sm:max-w-[640px] bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
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
              <p className="text-xs text-slate-500">Altere os dados do título financeiro e edite a tabela de parcelas</p>
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
              placeholder="Ex: Compra de mercadorias, Venda #PV-202610..., etc."
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
                placeholder="Ex: Receita de Vendas, Comissões, Mercadoria..."
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

          {/* ══════════════════════════════════════════════════════════ */}
          {/* SEÇÃO: EDIÇÃO DA TABELA DE PARCELAS E VALORES               */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign size={14} className="text-blue-600" />
                  Tabela de Parcelas & Valores
                </h4>
                <p className="text-[11px] text-slate-500">
                  Ajuste o valor da parcela, datas de vencimento ou adicione/remova parcelas
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAdicionarParcela}
                  className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Adicionar mais uma parcela ao título"
                >
                  <Plus size={13} /> Parcela
                </button>
              </div>
            </div>

            {/* Cards de Resumo: Total do Pedido/Título e Valor da Parcela */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Valor Total
                </span>
                <span className="text-sm font-black text-slate-900 tabular-nums">
                  {formatBRL(totalParcelas)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Parcelas
                </span>
                <span className="text-sm font-bold text-slate-800">
                  {parcelas.length}x {parcelas.length > 0 ? `(~${formatBRL(totalParcelas / parcelas.length)})` : ''}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Restante a Quitar
                </span>
                <span className="text-sm font-bold text-blue-700 tabular-nums">
                  {formatBRL(saldoRestante)}
                </span>
              </div>
            </div>

            {/* Tabela Interativa de Parcelas */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
              <table className="w-full text-xs text-slate-700">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5 text-center w-12">#</th>
                    <th className="px-3 py-2.5 text-left min-w-[130px]">Vencimento</th>
                    <th className="px-3 py-2.5 text-left min-w-[130px]">Valor da Parcela</th>
                    <th className="px-3 py-2.5 text-center w-24">Status</th>
                    <th className="px-2 py-2.5 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parcelas.map((p, idx) => {
                    const isPaga = p.status === 'paga' || Boolean(p.baixa)
                    return (
                      <tr key={idx} className={isPaga ? 'bg-emerald-50/20' : 'hover:bg-slate-50/60'}>
                        <td className="px-3 py-2 text-center font-bold text-slate-600">
                          {p.numero || idx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            required
                            disabled={isPaga}
                            value={p.vencimento}
                            onChange={(e) => handleAlterarParcela(idx, 'vencimento', e.target.value)}
                            className="w-full text-xs font-medium text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                              R$
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              disabled={isPaga}
                              value={p.valor}
                              onChange={(e) =>
                                handleAlterarParcela(idx, 'valor', parseFloat(e.target.value) || 0)
                              }
                              className="w-full text-xs font-bold text-slate-900 border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                              isPaga
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === 'vencida'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {isPaga ? 'Paga' : p.status === 'vencida' ? 'Vencida' : 'Aberta'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {!isPaga && parcelas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoverParcela(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover esta parcela"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Ações de Distribuição e Recálculo */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  const inputVal = prompt(
                    'Informe o novo Valor Total para distribuir igualmente entre as parcelas abertas:',
                    String(totalParcelas.toFixed(2))
                  )
                  if (inputVal) {
                    const num = parseFloat(inputVal.replace(',', '.'))
                    if (!isNaN(num) && num > 0) {
                      handleDistribuirTotal(num)
                    }
                  }
                }}
                className="text-[11px] font-bold text-blue-700 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} /> Distribuir novo total igualmente
              </button>

              <span className="text-[11px] text-slate-500 font-medium">
                Soma das parcelas: <strong className="text-slate-900">{formatBRL(totalParcelas)}</strong>
              </span>
            </div>
          </div>

          {/* Informação sobre o status atual */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Status do Lançamento:</span>
              <span className="font-bold uppercase tracking-wider text-[11px] text-slate-800">
                {conta.status === 'paga'
                  ? conta.tipo === 'receber'
                    ? 'RECEBIDA'
                    : 'PAGA'
                  : conta.status}
              </span>
            </div>
            {conta.status === 'paga' && (
              <p className="text-[11px] text-emerald-700 font-medium">
                Este título já foi liquidado ({conta.tipo === 'receber' ? 'recebido' : 'pago'}). As alterações
                não reverterão a baixa realizada.
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
