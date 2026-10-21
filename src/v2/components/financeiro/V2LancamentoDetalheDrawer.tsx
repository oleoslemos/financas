import React, { useState } from 'react'
import { Eye, X, ArrowDownLeft, ArrowUpRight, RotateCcw, Trash2, Printer, Check, Clock } from 'lucide-react'
import { ContaPagar } from '../../services/v2ContasPagarService'
import { formatBRL } from '../../features/financeiro/extrato'

interface V2LancamentoDetalheDrawerProps {
  isOpen: boolean
  onClose: () => void
  conta: ContaPagar | null
  modo: 'detalhe_pago' | 'estorno' | 'excluir'
  onConfirmarEstorno: (contaId: string) => Promise<void>
  onConfirmarExclusao: (contaId: string) => Promise<void>
  onAbrirBaixa?: (conta: ContaPagar) => void
}

export const V2LancamentoDetalheDrawer: React.FC<V2LancamentoDetalheDrawerProps> = ({
  isOpen,
  onClose,
  conta,
  modo,
  onConfirmarEstorno,
  onConfirmarExclusao,
  onAbrirBaixa,
}) => {
  if (!isOpen || !conta) return null

  const [processando, setProcessando] = useState(false)
  const isPagar = (conta.tipo || 'pagar') === 'pagar'
  const isPago = conta.status === 'paga'

  const valorPago = conta.totalPago || conta.parcelas?.[0]?.baixa?.valorFinalPago || conta.total
  const taxa = conta.taxa_administradora || conta.parcelas?.[0]?.baixa?.descontoFinal || 0
  const dataBaixa = conta.data_baixa || conta.parcelas?.[0]?.baixa?.dataBaixa || conta.updated_at.split('T')[0]
  const tagConta = conta.conta_bancaria_tag || conta.parcelas?.[0]?.baixa?.contaBancariaNome || '#BANCOINTER'

  const fmtData = (iso?: string) => {
    if (!iso) return '—'
    return iso.split('-').reverse().join('/')
  }

  const handleEstorno = async () => {
    setProcessando(true)
    try {
      await onConfirmarEstorno(conta.id)
      onClose()
    } finally {
      setProcessando(false)
    }
  }

  const handleExclusao = async () => {
    setProcessando(true)
    try {
      await onConfirmarExclusao(conta.id)
      onClose()
    } finally {
      setProcessando(false)
    }
  }

  const handleImprimir = () => {
    window.print()
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
              <Eye size={20} className="stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {isPago ? 'Lançamento pago' : 'Lançamento em aberto'}
              </h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {isPagar ? 'Despesa' : 'Receita'} · lançamento único
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                isPago
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : conta.status === 'vencida'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {isPago ? 'Paga' : conta.status === 'vencida' ? 'Vencida' : 'Aberta'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 flex-1">
          {/* Descrição / Origem */}
          <div>
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
              Descrição / Origem
            </span>
            <h3 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
              {conta.descricao}
            </h3>
          </div>

          {/* Grid de Informações */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                {isPagar ? 'Fornecedor' : 'Cliente'}
              </span>
              <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                {conta.fornecedor || '—'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                Categoria
              </span>
              <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                {conta.categoria || 'Geral'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                Vencimento
              </span>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                {fmtData(conta.vencimento)}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                Valor Previsto
              </span>
              <p className="text-xs font-bold text-slate-900 mt-0.5">
                {formatBRL(conta.total)}
              </p>
            </div>
          </div>

          {/* Valores da baixa quando pago */}
          {isPago && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                  {isPagar ? 'Valor Pago' : 'Valor Recebido'}
                </span>
                <p className="text-xs font-bold text-slate-900 mt-0.5">
                  {formatBRL(valorPago)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                  Diferença (Taxa)
                </span>
                <p className="text-xs font-bold text-red-600 mt-0.5">
                  {taxa > 0 ? `- ${formatBRL(taxa)}` : 'R$ 0,00'}
                </p>
              </div>
            </div>
          )}

          {/* Histórico de Baixas quando pago */}
          {isPago && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">
                Histórico de Baixas
              </span>
              <div className="border border-slate-200 rounded-xl p-3 flex items-center justify-between bg-white shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isPagar ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {isPagar ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-800 leading-tight">
                      {isPagar ? `Pago em ${fmtData(dataBaixa)}` : `Recebido em ${fmtData(dataBaixa)}`}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {conta.forma_pagamento || 'Cartão de crédito'} · repasse da administradora · {tagConta}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold shrink-0 ml-2 ${
                    isPagar ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {isPagar ? `- ${formatBRL(valorPago)}` : `+ ${formatBRL(valorPago)}`}
                </span>
              </div>
            </div>
          )}

          {/* Callout quando aberto */}
          {!isPago && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 flex items-center gap-2.5 text-blue-800">
              <Clock size={16} className="shrink-0 text-blue-600" />
              <span className="text-xs font-medium">
                Lançamento aberto · ainda sem baixa
              </span>
            </div>
          )}

          {/* Caixa de Ação Estorno */}
          {isPago && (modo === 'estorno' || modo === 'detalhe_pago') && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <RotateCcw size={16} className="text-amber-700 shrink-0" />
                <span>Estornar esta baixa?</span>
              </div>
              <p className="text-xs text-amber-800/90 leading-relaxed">
                {formatBRL(valorPago)} {isPagar ? 'voltam para a conta' : 'saem da conta'} <strong>{tagConta}</strong> e o lançamento volta para <strong>Aberto</strong>. O histórico fica registrado na auditoria.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-amber-300 bg-white text-amber-900 rounded-lg text-xs font-semibold hover:bg-amber-100/50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleEstorno}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-amber-400 bg-amber-100/80 hover:bg-amber-200 text-amber-950 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Confirmar estorno
                </button>
              </div>
            </div>
          )}

          {/* Caixa de Ação Excluir (apenas se aberto) */}
          {!isPago && modo === 'excluir' && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2 text-red-900 font-bold text-xs">
                <Trash2 size={16} className="text-red-600 shrink-0" />
                <span>Excluir este lançamento?</span>
              </div>
              <p className="text-xs text-red-800/90 leading-relaxed">
                O lançamento sai do financeiro. Só é possível excluir lançamentos <strong>abertos</strong>, sem baixa.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-red-200 bg-white text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExclusao}
                  disabled={processando}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} /> Excluir lançamento
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between sticky bottom-0 z-10 shadow-lg">
          {isPago ? (
            <>
              <button
                type="button"
                onClick={handleImprimir}
                className="px-3.5 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              >
                <Printer size={15} /> Imprimir comprovante
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
            </>
          ) : (
            <>
              {onAbrirBaixa && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onAbrirBaixa(conta)
                  }}
                  className="px-4 py-2 bg-[#0F3D6E] hover:bg-[#0c2f54] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Check size={15} /> Baixar lançamento
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors ml-auto"
              >
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
