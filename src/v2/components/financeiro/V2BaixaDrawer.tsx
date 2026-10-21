import React, { useState, useEffect } from 'react'
import { Check, X, Plus } from 'lucide-react'
import { ContaPagar, BaixarLancamentoParams } from '../../services/v2ContasPagarService'
import { ContaBancaria } from '../../services/v2ContasBancariasService'
import { formatBRL } from '../../features/financeiro/extrato'

interface V2BaixaDrawerProps {
  isOpen: boolean
  onClose: () => void
  conta: ContaPagar | null
  contasBancarias: ContaBancaria[]
  onConfirmarBaixa: (params: BaixarLancamentoParams) => Promise<void>
  onCriarContaBancaria: (nome: string) => Promise<ContaBancaria>
}

const FORMAS_OPCOES = [
  'Cartão de crédito',
  'Cartão de débito',
  'Pix',
  'Boleto',
  'Dinheiro',
  'Transferência bancária',
]

export const V2BaixaDrawer: React.FC<V2BaixaDrawerProps> = ({
  isOpen,
  onClose,
  conta,
  contasBancarias,
  onConfirmarBaixa,
  onCriarContaBancaria,
}) => {
  if (!isOpen || !conta) return null

  const isPagar = (conta.tipo || 'pagar') === 'pagar'
  const valorPrevisto = conta.saldo_residual && conta.saldo_residual > 0 ? conta.saldo_residual : conta.total

  const [valorInput, setValorInput] = useState<string>(valorPrevisto.toFixed(2))
  const [diferencaDestino, setDiferencaDestino] = useState<'taxa' | 'parcial'>('taxa')
  const [dataBaixa, setDataBaixa] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [formaPagamento, setFormaPagamento] = useState<string>(conta.forma_pagamento || 'Cartão de crédito')
  const [contaBancariaId, setContaBancariaId] = useState<string>(contasBancarias[0]?.id || '')
  const [criandoNovaConta, setCriandoNovaConta] = useState(false)
  const [novoNomeConta, setNovoNomeConta] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (conta) {
      const v = conta.saldo_residual && conta.saldo_residual > 0 ? conta.saldo_residual : conta.total
      setValorInput(v.toFixed(2))
      setDiferencaDestino('taxa')
      setDataBaixa(new Date().toISOString().split('T')[0])
      setFormaPagamento(conta.forma_pagamento || (isPagar ? 'Boleto' : 'Cartão de crédito'))
      if (contasBancarias.length > 0 && !contaBancariaId) {
        setContaBancariaId(contasBancarias[0].id)
      }
    }
  }, [conta, contasBancarias])

  const valorDigitado = parseFloat(valorInput.replace(',', '.')) || 0
  const diferenca = valorPrevisto - valorDigitado
  const temDiferenca = Math.abs(diferenca) >= 0.01

  const contaBancariaSelecionada =
    contasBancarias.find((c) => c.id === contaBancariaId) || contasBancarias[0]

  const saldoAtual = contaBancariaSelecionada?.saldoAtual || 0
  const saldoApos = isPagar ? saldoAtual - valorDigitado : saldoAtual + valorDigitado

  const handleCriarConta = async () => {
    if (!novoNomeConta.trim()) return
    try {
      const criada = await onCriarContaBancaria(novoNomeConta.trim())
      setContaBancariaId(criada.id)
      setNovoNomeConta('')
      setCriandoNovaConta(false)
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (valorDigitado <= 0) return
    setSalvando(true)
    try {
      const tag = contaBancariaSelecionada ? `#${contaBancariaSelecionada.nome.replace(/\s+/g, '').toUpperCase()}` : undefined
      await onConfirmarBaixa({
        id: conta.id,
        valorRecebidoOuPago: valorDigitado,
        diferencaDestino,
        dataBaixa,
        formaPagamento,
        contaBancariaId: contaBancariaSelecionada?.id || '',
        contaBancariaTag: tag,
      })
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  const fmtData = (iso?: string) => {
    if (!iso) return '—'
    return iso.split('-').reverse().join('/')
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
              <Check size={20} className="stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 leading-tight">Baixar lançamento</h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {conta.descricao} · {conta.fornecedor || 'Geral'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                conta.status === 'vencida'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : conta.status === 'parcial'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {conta.status === 'vencida' ? 'Vencida' : conta.status === 'parcial' ? 'Parcial' : 'Aberta'}
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
        <form id="form-baixa" onSubmit={handleSubmit} className="p-5 space-y-4 flex-1">
          {/* Card Valor Previsto */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase block">
                Valor Previsto
              </span>
              <p className="text-xs text-slate-600 mt-0.5">
                Vence {fmtData(conta.vencimento)} · {conta.fornecedor || '—'} · {conta.forma_pagamento || '—'}
              </p>
            </div>
            <span className="text-lg font-bold text-slate-900">{formatBRL(valorPrevisto)}</span>
          </div>

          {/* Input Valor Recebido / Pago */}
          <div className="rounded-xl border border-emerald-500/60 bg-emerald-50/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="valorRecebido" className="font-semibold text-slate-800">
                {isPagar ? 'Valor pago (R$) *' : 'Valor recebido (R$) *'}
              </label>
              <button
                type="button"
                onClick={() => setValorInput(valorPrevisto.toFixed(2))}
                className="text-blue-700 font-semibold hover:underline text-xs"
              >
                Usar valor previsto
              </button>
            </div>
            <div className="relative">
              <input
                id="valorRecebido"
                type="text"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                required
                className="w-full text-right text-2xl font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="0,00"
              />
            </div>
            {temDiferenca && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                <span className="text-slate-600">Diferença para o previsto</span>
                <span className={`font-semibold ${diferenca > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {diferenca > 0 ? `- ${formatBRL(diferenca)}` : `+ ${formatBRL(Math.abs(diferenca))}`}
                </span>
              </div>
            )}
          </div>

          {/* O que fazer com a diferença */}
          {temDiferenca && (
            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-slate-700 block">
                O que fazer com a diferença?
              </label>
              <div
                onClick={() => setDiferencaDestino('taxa')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  diferencaDestino === 'taxa'
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="diferenca"
                  checked={diferencaDestino === 'taxa'}
                  onChange={() => setDiferencaDestino('taxa')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {isPagar ? 'Desconto obtido / ajuste' : 'Taxa da administradora / ajuste'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {isPagar
                      ? `Encerra o lançamento como Pago e registra ${formatBRL(Math.abs(diferenca))} como desconto.`
                      : `Encerra o lançamento como Pago e registra ${formatBRL(Math.abs(diferenca))} como taxa.`}
                  </p>
                </div>
              </div>

              <div
                onClick={() => setDiferencaDestino('parcial')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  diferencaDestino === 'parcial'
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="diferenca"
                  checked={diferencaDestino === 'parcial'}
                  onChange={() => setDiferencaDestino('parcial')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {isPagar ? 'Pagar depois' : 'Receber depois'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {isPagar
                      ? `Mantém o lançamento como Parcial, com saldo de ${formatBRL(Math.abs(diferenca))} em aberto, para o próximo pagamento.`
                      : `Mantém o lançamento como Parcial, com saldo de ${formatBRL(Math.abs(diferenca))} em aberto, para o próximo repasse.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Data e Forma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {isPagar ? 'Data do pagamento' : 'Data do recebimento'}
              </label>
              <input
                type="date"
                value={dataBaixa}
                onChange={(e) => setDataBaixa(e.target.value)}
                required
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {isPagar ? 'Forma de pagamento' : 'Forma de recebimento'}
              </label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
              >
                {FORMAS_OPCOES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Contas Bancárias / Tags */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                {isPagar ? 'Conta de saída (origem do recurso)' : 'Conta de entrada (tag / origem do recurso)'}
              </label>
              <button
                type="button"
                onClick={() => setCriandoNovaConta(!criandoNovaConta)}
                className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> Nova conta
              </button>
            </div>

            {criandoNovaConta && (
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="text"
                  placeholder="Nome da conta (ex: Banco Inter)"
                  value={novoNomeConta}
                  onChange={(e) => setNovoNomeConta(e.target.value)}
                  className="flex-1 text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleCriarConta}
                  className="px-3 py-1.5 bg-[#0F3D6E] text-white rounded text-xs font-semibold hover:bg-[#0c2f54]"
                >
                  Salvar
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {contasBancarias.map((cb) => {
                const ativo = cb.id === contaBancariaSelecionada?.id
                const tag = `#${cb.nome.replace(/\s+/g, '').toUpperCase()}`
                return (
                  <button
                    key={cb.id}
                    type="button"
                    onClick={() => setContaBancariaId(cb.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                      ativo
                        ? 'border-2 border-blue-600 bg-blue-50 text-blue-800 shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {tag} · {formatBRL(cb.saldoAtual)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Impacto de Saldo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Saldo atual disponível</span>
              <span className="font-semibold text-slate-800">{formatBRL(saldoAtual)}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
              <span className="font-medium text-slate-700">
                {isPagar ? 'Saldo após o pagamento' : 'Saldo após o recebimento'}
              </span>
              <span className={`font-bold ${saldoApos < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {formatBRL(saldoApos)}
              </span>
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between sticky bottom-0 z-10 shadow-lg">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
              Valor efetivo da baixa
            </span>
            <span className="text-xl font-black text-slate-900">{formatBRL(valorDigitado)}</span>
          </div>
          <div className="flex items-center gap-2">
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
              form="form-baixa"
              disabled={salvando || valorDigitado <= 0}
              className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#24563F] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
            >
              <Check size={16} /> Confirmar baixa
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
