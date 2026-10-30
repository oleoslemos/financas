import React, { useState } from 'react'
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Trash2,
  Printer,
  Check,
  Clock,
  Edit3,
  XCircle,
} from 'lucide-react'
import { ContaPagar } from '../../services/v2ContasPagarService'
import { formatBRL } from '../../features/financeiro/extrato'

interface V2LancamentoDetalheDrawerProps {
  isOpen: boolean
  onClose: () => void
  conta: ContaPagar | null
  modo?: 'detalhe' | 'detalhe_pago' | 'estorno' | 'excluir'
  onConfirmarEstorno: (contaId: string) => Promise<void>
  onConfirmarExclusao: (contaId: string) => Promise<void>
  onConfirmarCancelamento?: (contaId: string) => Promise<void>
  onAbrirBaixa?: (conta: ContaPagar) => void
  onAbrirEdicao?: (conta: ContaPagar) => void
}

export const V2LancamentoDetalheDrawer: React.FC<V2LancamentoDetalheDrawerProps> = ({
  isOpen,
  onClose,
  conta,
  modo = 'detalhe',
  onConfirmarEstorno,
  onConfirmarExclusao,
  onConfirmarCancelamento,
  onAbrirBaixa,
  onAbrirEdicao,
}) => {
  if (!isOpen || !conta) return null

  const [processando, setProcessando] = useState(false)
  const [subModo, setSubModo] = useState<'normal' | 'estorno' | 'excluir' | 'cancelar'>(
    modo === 'estorno' ? 'estorno' : modo === 'excluir' ? 'excluir' : 'normal'
  )

  const isPagar = (conta.tipo || 'pagar') === 'pagar'
  const isPago = conta.status === 'paga'
  const isCancelado = conta.status === 'cancelada'

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

  const handleCancelamento = async () => {
    if (!onConfirmarCancelamento) return
    setProcessando(true)
    try {
      await onConfirmarCancelamento(conta.id)
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
        className="w-full sm:max-w-[500px] bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isPagar ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {isPagar ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {isPago
                  ? isPagar
                    ? 'Título Pago'
                    : 'Título Recebido'
                  : isCancelado
                  ? 'Título Cancelado'
                  : 'Título em Aberto'}
              </h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {isPagar ? 'Conta a Pagar (Despesa)' : 'Conta a Receber (Receita)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                isPago
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : conta.status === 'vencida'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : isCancelado
                  ? 'bg-slate-100 text-slate-600 border border-slate-300'
                  : conta.status === 'parcial'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {isPago
                ? isPagar
                  ? 'Paga'
                  : 'Recebida'
                : conta.status === 'vencida'
                ? 'Vencida'
                : isCancelado
                ? 'Cancelada'
                : conta.status === 'parcial'
                ? 'Parcial'
                : 'Aberta'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 flex-1">
          {/* Seção de Ações do Título */}
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                Ações do Título
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                ID #{conta.id.slice(0, 8)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Editar */}
              {onAbrirEdicao && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onAbrirEdicao(conta)
                  }}
                  className="py-2.5 px-3 bg-white hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Editar dados deste lançamento"
                >
                  <Edit3 size={14} className="text-blue-600" />
                  <span>Editar</span>
                </button>
              )}

              {/* Baixar (quando aberto) */}
              {!isPago && !isCancelado && onAbrirBaixa && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onAbrirBaixa(conta)
                  }}
                  className="py-2.5 px-3 bg-[#0F3D6E] hover:bg-[#0c2f54] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Realizar baixa financeira deste título"
                >
                  <Check size={14} className="stroke-[2.5]" />
                  <span>Baixar Título</span>
                </button>
              )}

              {/* Estornar (quando pago) */}
              {isPago && (
                <button
                  type="button"
                  onClick={() => setSubModo(subModo === 'estorno' ? 'normal' : 'estorno')}
                  className="py-2.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Reverter a liquidação e reabrir o título"
                >
                  <RotateCcw size={14} />
                  <span>Estornar Baixa</span>
                </button>
              )}

              {/* Cancelar (quando aberto) */}
              {!isPago && !isCancelado && onConfirmarCancelamento && (
                <button
                  type="button"
                  onClick={() => setSubModo(subModo === 'cancelar' ? 'normal' : 'cancelar')}
                  className="py-2.5 px-3 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Cancelar título financeiro"
                >
                  <XCircle size={14} className="text-amber-600" />
                  <span>Cancelar</span>
                </button>
              )}

              {/* Excluir (quando aberto) */}
              {!isPago && (
                <button
                  type="button"
                  onClick={() => setSubModo(subModo === 'excluir' ? 'normal' : 'excluir')}
                  className="py-2.5 px-3 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-700 hover:text-red-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Excluir lançamento permanentemente"
                >
                  <Trash2 size={14} className="text-red-600" />
                  <span>Excluir</span>
                </button>
              )}

              {/* Imprimir Comprovante / Ficha */}
              <button
                type="button"
                onClick={handleImprimir}
                className="py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                title="Imprimir visualização / comprovante do título"
              >
                <Printer size={14} className="text-slate-600" />
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          {/* Descrição / Origem */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
              Descrição do Lançamento
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 mt-1 leading-snug">
              {conta.descricao}
            </h3>
            {conta.pedido_id && (
              <p className="text-[11px] text-sky-700 font-semibold mt-1">
                Vinculado ao Pedido ID: {conta.pedido_id}
              </p>
            )}
          </div>

          {/* Grid de Informações */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                {isPagar ? 'Fornecedor / Favorecido' : 'Cliente / Pagador'}
              </span>
              <p className="text-xs font-bold text-slate-900 mt-0.5 truncate">
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
              <p className="text-xs font-extrabold text-slate-900 mt-0.5">
                {fmtData(conta.vencimento)}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                Valor Previsto
              </span>
              <p
                className={`text-xs font-black mt-0.5 ${
                  isPagar ? 'text-[#C92A2A]' : 'text-[#2D6A4F]'
                }`}
              >
                {isPagar ? `- ${formatBRL(conta.total)}` : `+ ${formatBRL(conta.total)}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                Forma de Pagamento
              </span>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                {conta.forma_pagamento || '—'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                Conta Bancária / Tag
              </span>
              <p className="text-xs font-bold text-blue-700 mt-0.5">
                {conta.conta_bancaria_tag || '—'}
              </p>
            </div>
          </div>

          {/* Valores da baixa quando pago */}
          {isPago && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3">
                <span className="text-[10px] font-bold tracking-wider text-emerald-800 uppercase block">
                  {isPagar ? 'Valor Efetivamente Pago' : 'Valor Recebido'}
                </span>
                <p className="text-xs font-black text-emerald-900 mt-0.5">
                  {formatBRL(valorPago)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                  Diferença (Taxa / Desconto)
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
                Histórico de Liquidação
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
                      {conta.forma_pagamento || 'Cartão de crédito'} · {tagConta}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-black shrink-0 ml-2 ${
                    isPagar ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {isPagar ? `- ${formatBRL(valorPago)}` : `+ ${formatBRL(valorPago)}`}
                </span>
              </div>
            </div>
          )}

          {/* Callout quando aberto */}
          {!isPago && !isCancelado && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 flex items-center gap-2.5 text-blue-800">
              <Clock size={16} className="shrink-0 text-blue-600" />
              <span className="text-xs font-medium">
                Título em aberto · aguardando liquidação / baixa financeira
              </span>
            </div>
          )}

          {/* Caixa de Confirmação: Estorno */}
          {isPago && subModo === 'estorno' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <RotateCcw size={16} className="text-amber-700 shrink-0" />
                <span>Estornar esta baixa?</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                {formatBRL(valorPago)} {isPagar ? 'voltam para a conta' : 'saem da conta'}{' '}
                <strong>{tagConta}</strong> e o lançamento voltará para <strong>Aberto</strong>.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubModo('normal')}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-amber-300 bg-white text-amber-900 rounded-lg text-xs font-semibold hover:bg-amber-100/50 transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleEstorno}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-amber-400 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Confirmar estorno
                </button>
              </div>
            </div>
          )}

          {/* Caixa de Confirmação: Cancelar */}
          {!isPago && !isCancelado && subModo === 'cancelar' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <XCircle size={16} className="text-amber-700 shrink-0" />
                <span>Cancelar este título financeiro?</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                O título será marcado como <strong>Cancelado</strong> e não impactará o saldo projetado ou vencido.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubModo('normal')}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-amber-300 bg-white text-amber-900 rounded-lg text-xs font-semibold hover:bg-amber-100/50 transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleCancelamento}
                  disabled={processando}
                  className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <XCircle size={14} /> Confirmar cancelamento
                </button>
              </div>
            </div>
          )}

          {/* Caixa de Confirmação: Excluir */}
          {!isPago && subModo === 'excluir' && (
            <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2 text-red-900 font-bold text-xs">
                <Trash2 size={16} className="text-red-600 shrink-0" />
                <span>Excluir definitivamente este lançamento?</span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                Esta ação removerá o título do sistema financeiro. Esta operação não poderá ser desfeita.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubModo('normal')}
                  disabled={processando}
                  className="flex-1 py-2 px-3 border border-red-200 bg-white text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleExclusao}
                  disabled={processando}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} /> Confirmar exclusão
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
                className="px-3.5 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={15} /> Imprimir comprovante
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </>
          ) : (
            <>
              {!isCancelado && onAbrirBaixa && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onAbrirBaixa(conta)
                  }}
                  className="px-4 py-2 bg-[#0F3D6E] hover:bg-[#0c2f54] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Check size={15} /> Baixar lançamento
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors ml-auto cursor-pointer"
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
