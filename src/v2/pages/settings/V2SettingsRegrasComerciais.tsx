import { useState, useEffect } from 'react'
import {
  SlidersHorizontal,
  CreditCard,
  Check,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import {
  getCommercialRules,
  saveCommercialRules,
  CommercialRules,
  DEFAULT_COMMERCIAL_RULES,
} from '../../services/v2CommercialRulesService'
import { registrarAuditoria } from '../../services/v2AuditoriaService'
import { getCurrentV2User } from '../../services/v2AuthService'

export function V2SettingsRegrasComerciais() {
  const [rules, setRules] = useState<CommercialRules>(DEFAULT_COMMERCIAL_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const currentUser = getCurrentV2User()
  const nomeUsuario = currentUser?.full_name?.split(' ')[0] || currentUser?.username || 'Leonardo'

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await getCommercialRules()
      setRules(data)
      setLoading(false)
    }
    load()
  }, [])

  const handleSalvar = async () => {
    setSaving(true)
    try {
      await saveCommercialRules(rules)

      // Registrar auditoria das regras
      await registrarAuditoria({
        usuario_nome: nomeUsuario,
        area: 'Sistema',
        objeto: 'Regras Comerciais',
        o_que_mudou: `Regras atualizadas: Margem mín. ${rules.margem_minima}%, Validade ${rules.validade_proposta_dias}d, Padrão ${rules.forma_pagamento_padrao}`,
        detalhe: {
          acao_titulo: 'Atualização de Regras Comerciais',
          subtitulo: 'Parâmetros de vendas e financeiro',
          mudancas: [
            { campo: 'Margem mínima', antes: '—', depois: `${rules.margem_minima}%` },
            { campo: 'Validade proposta', antes: '—', depois: `${rules.validade_proposta_dias} dias` },
            { campo: 'Forma padrão', antes: '—', depois: rules.forma_pagamento_padrao },
          ],
          campos_extras: [
            { label: 'Usuário', valor: nomeUsuario },
            { label: 'Data e hora', valor: new Date().toLocaleString('pt-BR') },
          ],
          link_objeto: '/v2/configuracoes?tab=regras',
        },
      })

      setToast({ type: 'success', text: 'Regras comerciais salvas com sucesso!' })
      setTimeout(() => setToast(null), 3500)
    } catch {
      setToast({ type: 'error', text: 'Erro ao salvar regras comerciais.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">Carregando regras...</div>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── CARD 1: VENDAS E PROPOSTAS ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-base leading-tight">Vendas e propostas</h3>
            <p className="text-xs text-slate-400 font-medium">Valem para todas as propostas novas</p>
          </div>
        </div>

        <div className="space-y-4 divide-y divide-slate-100">
          {/* Margem mínima */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Margem mínima</p>
              <p className="text-xs text-slate-500 font-medium">
                Abaixo disso a proposta mostra "Margem baixa" e exige aprovação do Administrador
              </p>
            </div>
            <div className="relative w-28 shrink-0">
              <input
                type="number"
                min="0"
                max="100"
                value={rules.margem_minima}
                onChange={(e) =>
                  setRules((prev) => ({ ...prev, margem_minima: parseFloat(e.target.value) || 0 }))
                }
                className="w-full text-right pr-7 pl-3 py-2 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                %
              </span>
            </div>
          </div>

          {/* Validade padrão da proposta */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Validade padrão da proposta</p>
              <p className="text-xs text-slate-500 font-medium">Dias até o orçamento vencer</p>
            </div>
            <div className="relative w-28 shrink-0">
              <input
                type="number"
                min="1"
                value={rules.validade_proposta_dias}
                onChange={(e) =>
                  setRules((prev) => ({
                    ...prev,
                    validade_proposta_dias: parseInt(e.target.value, 10) || 1,
                  }))
                }
                className="w-full text-right pr-11 pl-3 py-2 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                dias
              </span>
            </div>
          </div>

          {/* Forma de pagamento padrão */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Forma de pagamento padrão</p>
              <p className="text-xs text-slate-500 font-medium">
                Já vem selecionada na proposta. Boleto fica por último na lista
              </p>
            </div>
            <div className="w-32 shrink-0">
              <select
                value={rules.forma_pagamento_padrao}
                onChange={(e) =>
                  setRules((prev) => ({ ...prev, forma_pagamento_padrao: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="Pix">Pix</option>
                <option value="Cartão">Cartão</option>
                <option value="Boleto">Boleto</option>
              </select>
            </div>
          </div>

          {/* Reservar estoque na aprovação */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Reservar estoque na aprovação</p>
              <p className="text-xs text-slate-500 font-medium">
                O disponível cai quando a venda é aprovada
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setRules((prev) => ({
                  ...prev,
                  reservar_estoque_aprovacao: !prev.reservar_estoque_aprovacao,
                }))
              }
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                rules.reservar_estoque_aprovacao ? 'bg-sky-700' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                  rules.reservar_estoque_aprovacao ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Exigir assinatura do cliente */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Exigir assinatura do cliente</p>
              <p className="text-xs text-slate-500 font-medium">
                Sem assinatura, a venda não pode ser aprovada
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setRules((prev) => ({
                  ...prev,
                  exigir_assinatura_cliente: !prev.exigir_assinatura_cliente,
                }))
              }
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                rules.exigir_assinatura_cliente ? 'bg-sky-700' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                  rules.exigir_assinatura_cliente ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Permitir aprovar com estoque insuficiente */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Permitir aprovar com estoque insuficiente</p>
              <p className="text-xs text-slate-500 font-medium">
                Reserva o que há e deixa o restante pendente
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setRules((prev) => ({
                  ...prev,
                  permitir_estoque_insuficiente: !prev.permitir_estoque_insuficiente,
                }))
              }
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                rules.permitir_estoque_insuficiente ? 'bg-sky-700' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                  rules.permitir_estoque_insuficiente ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── CARD 2: FINANCEIRO NAS VENDAS ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-base leading-tight">Financeiro nas vendas</h3>
            <p className="text-xs text-slate-400 font-medium">Como a aprovação alimenta o Contas a receber</p>
          </div>
        </div>

        <div className="space-y-4 divide-y divide-slate-100">
          {/* Gerar contas a receber ao aprovar */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Gerar contas a receber ao aprovar</p>
              <p className="text-xs text-slate-500 font-medium">
                1 lançamento por forma de pagamento, sem parcelas
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setRules((prev) => ({
                  ...prev,
                  gerar_contas_receber_ao_aprovar: !prev.gerar_contas_receber_ao_aprovar,
                }))
              }
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                rules.gerar_contas_receber_ao_aprovar ? 'bg-sky-700' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                  rules.gerar_contas_receber_ao_aprovar ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Adiantamento entra já baixado */}
          <div className="flex items-center justify-between pt-3 gap-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">Adiantamento entra já baixado</p>
              <p className="text-xs text-slate-500 font-medium">
                Registra o recebimento do sinal na data informada
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setRules((prev) => ({
                  ...prev,
                  adiantamento_ja_baixado: !prev.adiantamento_ja_baixado,
                }))
              }
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                rules.adiantamento_ja_baixado ? 'bg-sky-700' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                  rules.adiantamento_ja_baixado ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 font-medium pt-2 border-t border-slate-100">
          Pagamentos no cartão parcelado: o sistema não parcela; cada repasse da administradora é uma baixa com valor editável.
        </p>
      </div>

      {/* Botão Salvar Regras (Verde) */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleSalvar}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          {saving ? 'Salvando...' : 'Salvar regras'}
        </button>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-xs font-bold z-50 transition-all ${
            toast.type === 'success' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
