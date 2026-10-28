import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Check, X, Plus, Search, Tag, AlertCircle, Building2 } from 'lucide-react'
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

function formatarTagConta(nome: string): string {
  if (!nome) return ''
  const limpo = nome.trim()
  if (limpo.startsWith('#')) return limpo.toUpperCase()
  return `#${limpo.replace(/\s+/g, '').toUpperCase()}`
}

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

  // Campo de Pesquisa de Tags e Sugestão de Cadastro
  const [termoBuscaTag, setTermoBuscaTag] = useState('')
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const [sugestaoCadastro, setSugestaoCadastro] = useState<string | null>(null)
  const [cadastrandoTag, setCadastrandoTag] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputTagRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (conta) {
      const v = conta.saldo_residual && conta.saldo_residual > 0 ? conta.saldo_residual : conta.total
      setValorInput(v.toFixed(2))
      setDiferencaDestino('taxa')
      setDataBaixa(new Date().toISOString().split('T')[0])
      setFormaPagamento(conta.forma_pagamento || (isPagar ? 'Boleto' : 'Cartão de crédito'))

      // Seleção da conta bancária inicial
      let contaInicial: ContaBancaria | undefined
      if (conta.conta_bancaria_tag) {
        contaInicial = contasBancarias.find(
          (c) => formatarTagConta(c.nome) === conta.conta_bancaria_tag?.toUpperCase()
        )
      }
      if (!contaInicial && conta.conta_bancaria_id) {
        contaInicial = contasBancarias.find((c) => c.id === conta.conta_bancaria_id)
      }
      if (!contaInicial && contasBancarias.length > 0) {
        contaInicial = contasBancarias[0]
      }

      if (contaInicial) {
        setContaBancariaId(contaInicial.id)
        setTermoBuscaTag(formatarTagConta(contaInicial.nome))
      } else {
        setContaBancariaId('')
        setTermoBuscaTag('')
      }
      setSugestaoCadastro(null)
      setDropdownAberto(false)
    }
  }, [conta, contasBancarias])

  const valorDigitado = parseFloat(valorInput.replace(',', '.')) || 0
  const diferenca = valorPrevisto - valorDigitado
  const temDiferenca = Math.abs(diferenca) >= 0.01

  const contaBancariaSelecionada =
    contasBancarias.find((c) => c.id === contaBancariaId) || contasBancarias[0]

  const saldoAtual = contaBancariaSelecionada?.saldoAtual || 0
  const saldoApos = isPagar ? saldoAtual - valorDigitado : saldoAtual + valorDigitado

  // Lista de tags filtradas pela busca
  const tagsFiltradas = useMemo(() => {
    const termo = termoBuscaTag.trim().toLowerCase().replace(/^#/, '')
    if (!termo) return contasBancarias

    return contasBancarias.filter((cb) => {
      const nomeLower = cb.nome.toLowerCase()
      const tagLower = formatarTagConta(cb.nome).toLowerCase().replace(/^#/, '')
      const instLower = (cb.instituicao || '').toLowerCase()
      return (
        nomeLower.includes(termo) ||
        tagLower.includes(termo) ||
        instLower.includes(termo)
      )
    })
  }, [contasBancarias, termoBuscaTag])

  // Fecha dropdown se clicar fora
  useEffect(() => {
    const handleClickFora = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  // Selecionar conta da lista
  const handleSelecionarConta = (cb: ContaBancaria) => {
    setContaBancariaId(cb.id)
    setTermoBuscaTag(formatarTagConta(cb.nome))
    setDropdownAberto(false)
    setSugestaoCadastro(null)
  }

  // Ao sair do campo de busca (onBlur)
  const handleBlurBuscaTag = () => {
    // Pequeno delay para permitir o clique em itens do dropdown
    setTimeout(() => {
      const termo = termoBuscaTag.trim()
      if (!termo) {
        setSugestaoCadastro(null)
        return
      }

      // Verifica se o termo digitado já corresponde a alguma conta existente
      const termoNormalizado = termo.toLowerCase().replace(/^#/, '')
      const correspondencia = contasBancarias.find(
        (cb) =>
          cb.nome.toLowerCase() === termoNormalizado ||
          formatarTagConta(cb.nome).toLowerCase().replace(/^#/, '') === termoNormalizado
      )

      if (correspondencia) {
        setContaBancariaId(correspondencia.id)
        setTermoBuscaTag(formatarTagConta(correspondencia.nome))
        setSugestaoCadastro(null)
      } else {
        // Tag não encontrada -> sugere o cadastro!
        setSugestaoCadastro(termo)
      }
    }, 200)
  }

  // Cadastrar nova tag sugerida
  const handleCadastrarNovaTag = async (nomeOuTag: string) => {
    const nomeLimpo = nomeOuTag.trim()
    if (!nomeLimpo) return

    setCadastrandoTag(true)
    try {
      const tagNome = nomeLimpo.startsWith('#') ? nomeLimpo.slice(1).trim() : nomeLimpo
      const criada = await onCriarContaBancaria(tagNome)
      setContaBancariaId(criada.id)
      setTermoBuscaTag(formatarTagConta(criada.nome))
      setSugestaoCadastro(null)
      setDropdownAberto(false)
    } finally {
      setCadastrandoTag(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (valorDigitado <= 0) return
    setSalvando(true)
    try {
      const tag = contaBancariaSelecionada
        ? formatarTagConta(contaBancariaSelecionada.nome)
        : termoBuscaTag.trim() || undefined

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
                {isPagar ? 'Registrar pagamento' : 'Registrar recebimento'} · lançamento único
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form id="form-baixa" onSubmit={handleSubmit} className="p-5 space-y-4 flex-1">
          {/* Card Resumo do Título */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                  Descrição
                </span>
                <strong className="text-slate-900 block truncate font-bold text-xs mt-0.5">
                  {conta.descricao}
                </strong>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                  Vencimento
                </span>
                <span className="font-semibold text-slate-700">{fmtData(conta.vencimento)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-600">
              <span>{isPagar ? 'Fornecedor' : 'Cliente'}: <strong>{conta.fornecedor || '—'}</strong></span>
              <span>Previsto: <strong className="text-slate-900">{formatBRL(valorPrevisto)}</strong></span>
            </div>
          </div>

          {/* Campo Valor Efetivo */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                {isPagar ? 'Valor pago (R$)' : 'Valor recebido (R$)'} <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setValorInput(valorPrevisto.toFixed(2))}
                className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Usar valor previsto
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                required
                className="w-full text-right text-xl font-black text-slate-900 bg-white border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-shadow"
              />
            </div>
            {temDiferenca && (
              <div className="flex items-center justify-between text-xs mt-1.5 px-1 font-medium">
                <span className="text-slate-500">Diferença para o previsto:</span>
                <span className={diferenca > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                  {diferenca > 0 ? `- ${formatBRL(diferenca)}` : `+ ${formatBRL(Math.abs(diferenca))}`}
                </span>
              </div>
            )}
          </div>

          {/* Opções de Diferença quando houver */}
          {temDiferenca && (
            <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3.5 space-y-2.5">
              <span className="text-xs font-bold text-blue-900 block">
                O que fazer com a diferença?
              </span>

              {/* Opção Taxa / Desconto */}
              <div
                onClick={() => setDiferencaDestino('taxa')}
                className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                  diferencaDestino === 'taxa'
                    ? 'border-blue-600 bg-white shadow-xs'
                    : 'border-slate-200 bg-white/60 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="diferenca"
                  checked={diferencaDestino === 'taxa'}
                  onChange={() => setDiferencaDestino('taxa')}
                  className="mt-0.5 text-blue-600"
                />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {isPagar
                      ? 'Desconto obtido / Ajuste'
                      : 'Taxa da operadora / Abatimento'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {isPagar
                      ? `Encerra o lançamento como Pago e registra ${formatBRL(Math.abs(diferenca))} como desconto.`
                      : `Encerra o lançamento como Pago e retém ${formatBRL(Math.abs(diferenca))} como taxa de cartão/administradora.`}
                  </p>
                </div>
              </div>

              {/* Opção Baixa Parcial */}
              <div
                onClick={() => setDiferencaDestino('parcial')}
                className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                  diferencaDestino === 'parcial'
                    ? 'border-blue-600 bg-white shadow-xs'
                    : 'border-slate-200 bg-white/60 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="diferenca"
                  checked={diferencaDestino === 'parcial'}
                  onChange={() => setDiferencaDestino('parcial')}
                  className="mt-0.5 text-blue-600"
                />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {isPagar ? 'Pagar depois' : 'Receber o restante depois (Parcial)'}
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

          {/* ── CAMPO DE PESQUISA DE TAGS CADASTRADAS ── */}
          <div className="space-y-2 pt-1" ref={dropdownRef}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                {isPagar ? 'Conta de saída (origem do recurso)' : 'Conta de entrada (destino do recurso)'}
              </label>
              {contaBancariaSelecionada && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5">
                  {formatarTagConta(contaBancariaSelecionada.nome)}
                </span>
              )}
            </div>

            {/* Input de Busca de Tags com Autocomplete Dropdown */}
            <div className="relative">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  ref={inputTagRef}
                  type="text"
                  value={termoBuscaTag}
                  onChange={(e) => {
                    setTermoBuscaTag(e.target.value)
                    setDropdownAberto(true)
                    setSugestaoCadastro(null)
                  }}
                  onFocus={() => setDropdownAberto(true)}
                  onBlur={handleBlurBuscaTag}
                  placeholder="Pesquisar tag da conta (ex: #BANCOINTER, #NUBANK...)"
                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-shadow"
                />
                {termoBuscaTag && (
                  <button
                    type="button"
                    onClick={() => {
                      setTermoBuscaTag('')
                      setSugestaoCadastro(null)
                      inputTagRef.current?.focus()
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Menu Dropdown de Tags Encontradas */}
              {dropdownAberto && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                  {tagsFiltradas.length > 0 ? (
                    tagsFiltradas.map((cb) => {
                      const tagFormatada = formatarTagConta(cb.nome)
                      const isSelecionada = cb.id === contaBancariaSelecionada?.id

                      return (
                        <div
                          key={cb.id}
                          onMouseDown={() => handleSelecionarConta(cb)}
                          className={`p-2.5 px-3 flex items-center justify-between hover:bg-blue-50/60 cursor-pointer transition-colors ${
                            isSelecionada ? 'bg-blue-50/80 font-bold' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                              <Tag size={12} />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 block truncate">
                                {tagFormatada}
                              </span>
                              <span className="text-[10px] text-slate-500 block truncate">
                                {cb.nome} {cb.instituicao ? `· ${cb.instituicao}` : ''}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-extrabold tabular-nums shrink-0 ml-2 ${
                              cb.saldoAtual < 0 ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatBRL(cb.saldoAtual)}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-500 space-y-2">
                      <p>Nenhuma tag cadastrada corresponde a <strong>"{termoBuscaTag}"</strong>.</p>
                      {termoBuscaTag.trim() && (
                        <button
                          type="button"
                          onMouseDown={() => handleCadastrarNovaTag(termoBuscaTag)}
                          className="px-3 py-1.5 bg-[#0F3D6E] hover:bg-[#0c2f54] text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Plus size={13} /> Cadastrar "{formatarTagConta(termoBuscaTag)}"
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── SUGESTÃO DE CADASTRO CASO NÃO ENCONTRE AO SAIR DO CAMPO ── */}
            {sugestaoCadastro && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-amber-900">Tag não encontrada</h4>
                    <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                      A tag <strong>{formatarTagConta(sugestaoCadastro)}</strong> não está cadastrada entre as contas financeiras. Deseja cadastrá-la agora?
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCadastrarNovaTag(sugestaoCadastro)}
                    disabled={cadastrandoTag}
                    className="flex-1 py-1.5 px-3 bg-[#0F3D6E] hover:bg-[#0c2f54] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus size={13} /> {cadastrandoTag ? 'Cadastrando...' : `Cadastrar "${formatarTagConta(sugestaoCadastro)}"`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSugestaoCadastro(null)
                      if (contaBancariaSelecionada) {
                        setTermoBuscaTag(formatarTagConta(contaBancariaSelecionada.nome))
                      } else {
                        setTermoBuscaTag('')
                      }
                    }}
                    className="py-1.5 px-3 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Impacto de Saldo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                Saldo atual ({contaBancariaSelecionada ? formatarTagConta(contaBancariaSelecionada.nome) : '—'})
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">{formatBRL(saldoAtual)}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
              <span className="font-medium text-slate-700">
                {isPagar ? 'Saldo após o pagamento' : 'Saldo após o recebimento'}
              </span>
              <span className={`font-bold tabular-nums ${saldoApos < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
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
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-baixa"
              disabled={salvando || valorDigitado <= 0}
              className="px-5 py-2 bg-[#2D6A4F] hover:bg-[#24563F] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check size={16} /> {salvando ? 'Confirmando...' : 'Confirmar baixa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
