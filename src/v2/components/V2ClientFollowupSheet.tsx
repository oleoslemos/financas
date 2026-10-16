import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CalendarPlus,
  Clock,
  History,
  MessageCircle,
  CheckCircle2,
  Trash2,
  X,
  Loader2,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { dateInputToIso, formatDateOnly, todayInputDate } from '../../lib/dates'
import { getCurrentV2User } from '../services/v2AuthService'
import { useUser } from '@clerk/clerk-react'
import { buildWhatsappUrl } from '../../lib/whatsapp'

const CHANNEL_AGENDAMENTO = 'AGENDAMENTO'

export type ClientFollowupRecord = {
  id: string
  client_id: string
  contacted_at: string
  channel: string
  created_by_name?: string | null
  result: string | null
  notes: string | null
  created_at?: string
}

export interface ClientFollowupTarget {
  id: string
  full_name: string
  phone_1?: string | null
  phone_2?: string | null
  last_contact_at?: string | null
  next_followup_at?: string | null
  next_followup_note?: string | null
  next_followup_status?: string | null
  commercial_stage?: string | null
  client_status?: string | null
  company_id?: string | null
}

interface V2ClientFollowupSheetProps {
  client: ClientFollowupTarget
  companyId: string
  isModal?: boolean
  onClose?: () => void
  onClientUpdated?: () => void
}

function parseAgendamentoResult(raw?: string | null) {
  const r = (raw ?? '').trim()
  const m = r.match(/^STATUS:([A-Z_]+)(?:\s*\|\s*(.*))?$/i)
  if (m) {
    return {
      status: (m[1] ?? 'PENDENTE').toUpperCase(),
      summary: (m[2] ?? '').trim(),
    }
  }
  return { status: 'PENDENTE', summary: r }
}

function encodeAgendamentoResult(status: string, summary: string) {
  const s = (status || 'PENDENTE').toUpperCase()
  const sum = (summary || '').trim()
  return sum ? `STATUS:${s} | ${sum}` : `STATUS:${s}`
}


function composeFollowupNote(summary: string, details: string) {
  const s = summary.trim()
  const d = details.trim()
  if (s && d) return `RESUMO: ${s}\n${d}`
  if (s) return `RESUMO: ${s}`
  return d
}

function formatPhone(v?: string | null) {
  const d = (v ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

export function V2ClientFollowupSheet({
  client,
  companyId,
  isModal = false,
  onClose,
  onClientUpdated,
}: V2ClientFollowupSheetProps) {
  const { user: clerkUser } = useUser()
  const v2User = getCurrentV2User()
  const actorName = (clerkUser?.fullName || clerkUser?.primaryEmailAddress?.emailAddress || v2User?.full_name || v2User?.username || 'Usuário').trim().toUpperCase()
  const actorUserId = clerkUser?.id || v2User?.id || 'v2_user'

  const [historyRows, setHistoryRows] = useState<ClientFollowupRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Forms inline
  const [showContactForm, setShowContactForm] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form states
  const [contactForm, setContactForm] = useState({
    contacted_at: todayInputDate(),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })

  const [scheduleForm, setScheduleForm] = useState({
    next_followup_at: todayInputDate(),
    commercial_stage: client.commercial_stage || 'CONTATO',
    summary: '',
    details: '',
    contact_done: false,
  })

  const loadHistory = useCallback(async () => {
    if (!supabase || !client.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes, created_at')
      .eq('client_id', client.id)
      .is('deleted_at', null)
      .order('contacted_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Erro ao carregar follow-up history:', error)
      setHistoryRows([])
    } else {
      setHistoryRows((data as ClientFollowupRecord[]) || [])
    }
    setLoading(false)
  }, [client.id])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  // Submissão do Registro de Contato
  async function handleSubmitContact(e: React.FormEvent) {
    e.preventDefault()
    if (!contactForm.contacted_at) {
      alert('Informe a data do contato.')
      return
    }

    setSaving(true)
    const contactedAtIso = dateInputToIso(contactForm.contacted_at)

    const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: actorUserId,
      company_id: companyId,
      created_by_user_id: clerkUser?.id ?? null,
      created_by_name: actorName,
      client_id: client.id,
      contacted_at: contactedAtIso,
      channel: contactForm.channel,
      result: contactForm.result || null,
      notes: contactForm.notes || null,
    })

    if (insertError) {
      alert(`Erro ao registrar contato: ${insertError.message}`)
      setSaving(false)
      return
    }

    // Atualiza data do último contato no cadastro do cliente
    await supabase
      .from('bem_aviv_clients')
      .update({
        last_contact_at: contactedAtIso,
        next_followup_status: client.next_followup_at && new Date(client.next_followup_at) > new Date() ? 'PENDENTE' : 'CONCLUIDO',
      })
      .eq('id', client.id)

    setContactForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setShowContactForm(false)
    setSaving(false)
    await loadHistory()
    onClientUpdated?.()
  }

  // Submissão de Agendamento
  async function handleSubmitSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!scheduleForm.next_followup_at) {
      alert('Informe a data de agendamento.')
      return
    }

    setSaving(true)
    const isoDate = dateInputToIso(scheduleForm.next_followup_at)
    const fullNote = composeFollowupNote(scheduleForm.summary, scheduleForm.details)
    const nowIso = new Date().toISOString()

    // 1. Inserir registro de agendamento em bem_aviv_client_followups
    const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: actorUserId,
      company_id: companyId,
      created_by_user_id: clerkUser?.id ?? null,
      created_by_name: actorName,
      client_id: client.id,
      contacted_at: isoDate,
      channel: CHANNEL_AGENDAMENTO,
      result: encodeAgendamentoResult('PENDENTE', scheduleForm.summary),
      notes: scheduleForm.details || null,
    })

    if (insertError) {
      alert(`Erro ao salvar agendamento: ${insertError.message}`)
      setSaving(false)
      return
    }

    // 2. Se marcou que houve contato hoje, registra também um contato
    if (scheduleForm.contact_done) {
      await supabase.from('bem_aviv_client_followups').insert({
        user_id: actorUserId,
        company_id: companyId,
        created_by_user_id: clerkUser?.id ?? null,
        created_by_name: actorName,
        client_id: client.id,
        contacted_at: nowIso,
        channel: 'WHATSAPP',
        result: scheduleForm.summary || 'Contato realizado no agendamento',
        notes: scheduleForm.details || null,
      })
    }

    // 3. Atualizar cadastro do cliente
    await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: isoDate,
        next_followup_note: fullNote || null,
        next_followup_status: 'PENDENTE',
        commercial_stage: scheduleForm.commercial_stage || client.commercial_stage || 'CONTATO',
        last_contact_at: scheduleForm.contact_done ? nowIso : client.last_contact_at,
      })
      .eq('id', client.id)

    setScheduleForm({
      next_followup_at: todayInputDate(),
      commercial_stage: client.commercial_stage || 'CONTATO',
      summary: '',
      details: '',
      contact_done: false,
    })
    setShowScheduleForm(false)
    setSaving(false)
    await loadHistory()
    onClientUpdated?.()
  }

  // Concluir agendamento
  async function handleMarkScheduleDone(scheduleId?: string) {
    if (!confirm('Confirmar conclusão deste agendamento?')) return
    const nowIso = new Date().toISOString()

    if (scheduleId) {
      const row = historyRows.find((r) => r.id === scheduleId)
      const parsed = parseAgendamentoResult(row?.result)
      await supabase
        .from('bem_aviv_client_followups')
        .update({
          result: encodeAgendamentoResult('CONCLUIDO', parsed.summary),
          notes: row?.notes || null,
        })
        .eq('id', scheduleId)
    }

    await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_status: 'CONCLUIDO',
        last_contact_at: nowIso,
      })
      .eq('id', client.id)

    await loadHistory()
    onClientUpdated?.()
  }

  // Excluir registro do histórico
  async function handleDeleteHistory(id: string) {
    if (!confirm('Deseja excluir este registro de histórico?')) return
    await supabase
      .from('bem_aviv_client_followups')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)

    await loadHistory()
    onClientUpdated?.()
  }

  // Montar lista de timeline (contatos + agendamentos)
  const timelineItems = useMemo(() => {
    return historyRows.map((r) => {
      const isAgendamento = r.channel === CHANNEL_AGENDAMENTO
      const parsed = isAgendamento ? parseAgendamentoResult(r.result) : null
      return {
        id: r.id,
        isAgendamento,
        channel: r.channel,
        contacted_at: r.contacted_at,
        created_by_name: r.created_by_name,
        result: isAgendamento ? parsed?.summary || 'Agendamento' : r.result,
        status: isAgendamento ? parsed?.status || 'PENDENTE' : null,
        notes: r.notes,
      }
    })
  }, [historyRows])

  const rawPhone = client.phone_1 || client.phone_2
  const waUrl = buildWhatsappUrl(rawPhone)
  const isClientOverdue =
    client.next_followup_at &&
    new Date(client.next_followup_at).getTime() < Date.now() &&
    (client.next_followup_status ?? 'PENDENTE') === 'PENDENTE'

  const content = (
    <div className="space-y-4">
      {/* Cabeçalho do Cliente com Resumo e Ação de WhatsApp */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{client.full_name}</h3>
              {client.client_status && (
                <span className="rounded-full bg-sky-100 border border-sky-200 px-2 py-0.5 text-[9px] font-bold text-sky-800">
                  {client.client_status}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatPhone(rawPhone) || 'Sem telefone'} · Etapa:{' '}
              <span className="font-semibold text-slate-700">{client.commercial_stage || 'CONTATO'}</span>
            </p>
            {client.last_contact_at && (
              <p className="text-[11px] text-slate-500 mt-1">
                Último contato registrado: <strong>{formatDateOnly(client.last_contact_at)}</strong>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
              >
                <MessageCircle size={14} />
                WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Card de Agendamento Ativo (se houver) */}
        {client.next_followup_at && (client.next_followup_status ?? 'PENDENTE') === 'PENDENTE' && (
          <div className={`mt-3 rounded-lg border p-3 ${isClientOverdue ? 'border-amber-300 bg-amber-50/80' : 'border-sky-200 bg-sky-50/80'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <Clock size={16} className={isClientOverdue ? 'text-amber-700 mt-0.5' : 'text-sky-700 mt-0.5'} />
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Próximo Follow-up: {formatDateOnly(client.next_followup_at)}
                    {isClientOverdue && (
                      <span className="ml-2 rounded bg-amber-200/80 border border-amber-300 text-amber-900 px-1.5 py-0.2 text-[9px] font-bold">
                        Atrasado
                      </span>
                    )}
                  </p>
                  {client.next_followup_note && (
                    <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{client.next_followup_note}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleMarkScheduleDone()}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 transition cursor-pointer shrink-0"
              >
                <CheckCircle2 size={12} />
                Feito
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ações de Registro */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setShowContactForm((v) => !v)
            setShowScheduleForm(false)
          }}
          className={`flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition shadow-2xs cursor-pointer ${
            showContactForm
              ? 'border-[#0D6BAF] bg-[#0D6BAF] text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <History size={14} />
          {showContactForm ? 'Fechar Registro' : 'Registrar Contato'}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowScheduleForm((v) => !v)
            setShowContactForm(false)
          }}
          className={`flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition shadow-2xs cursor-pointer ${
            showScheduleForm
              ? 'border-sky-600 bg-sky-600 text-white'
              : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
          }`}
        >
          <CalendarPlus size={14} />
          {showScheduleForm ? 'Fechar Agendamento' : 'Agendar Próximo'}
        </button>
      </div>

      {/* Formulário Inline: Registrar Contato */}
      {showContactForm && (
        <form onSubmit={handleSubmitContact} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Registrar Contato Realizado</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Data</label>
              <input
                type="date"
                required
                value={contactForm.contacted_at}
                onChange={(e) => setContactForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Canal</label>
              <select
                value={contactForm.channel}
                onChange={(e) => setContactForm((prev) => ({ ...prev, channel: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              >
                <option value="WHATSAPP">WHATSAPP</option>
                <option value="LIGACAO">LIGAÇÃO</option>
                <option value="EMAIL">E-MAIL</option>
                <option value="VISITA">VISITA</option>
                <option value="REUNIAO">REUNIÃO</option>
                <option value="OUTRO">OUTRO</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Resumo Curto / Resultado</label>
              <input
                type="text"
                required
                placeholder="Ex: Conversado sobre o colchão, pediu retorno próxima semana..."
                value={contactForm.result}
                onChange={(e) => setContactForm((prev) => ({ ...prev, result: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Detalhes / Observações</label>
              <textarea
                rows={2}
                placeholder="Detalhes adicionais sobre a conversa..."
                value={contactForm.notes}
                onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowContactForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-[#0D6BAF] hover:bg-[#095287] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Contato'}
            </button>
          </div>
        </form>
      )}

      {/* Formulário Inline: Agendar Próximo */}
      {showScheduleForm && (
        <form onSubmit={handleSubmitSchedule} className="rounded-xl border border-sky-200 bg-sky-50/30 p-4 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-sky-800">Agendar Próximo Follow-up</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Data da Ação</label>
              <input
                type="date"
                required
                value={scheduleForm.next_followup_at}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_at: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Estágio Comercial</label>
              <select
                value={scheduleForm.commercial_stage}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, commercial_stage: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              >
                <option value="CONTATO">CONTATO</option>
                <option value="VISITA AGENDADA">VISITA AGENDADA</option>
                <option value="VISITA REALIZADA">VISITA REALIZADA</option>
                <option value="FECHADO PLATAFORMA CONFORTO">FECHADO PLATAFORMA CONFORTO</option>
                <option value="FECHADO DEMAIS PRODUTOS">FECHADO DEMAIS PRODUTOS</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Resumo (até 60 caracteres)</label>
              <input
                type="text"
                maxLength={60}
                required
                placeholder="Ex: Ligar para confirmar visita ou proposta..."
                value={scheduleForm.summary}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, summary: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Mais detalhes</label>
              <textarea
                rows={2}
                placeholder="Detalhes adicionais sobre o agendamento..."
                value={scheduleForm.details}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, details: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#0D6BAF]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleForm.contact_done}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, contact_done: e.target.checked }))}
                  className="rounded text-[#0D6BAF] focus:ring-[#0D6BAF]"
                />
                Registrar que houve contato com o cliente hoje
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-sky-100">
            <button
              type="button"
              onClick={() => setShowScheduleForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Agendamento'}
            </button>
          </div>
        </form>
      )}

      {/* Lista da Linha do Tempo (Histórico) */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Histórico ({timelineItems.length})
        </h4>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-[#0D6BAF]" />
            Carregando histórico...
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-400">
            Nenhum registro de follow-up ou contato encontrado para este cliente.
          </div>
        ) : (
          <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-3">
            {timelineItems.map((item) => {
              const isAgendamento = item.isAgendamento
              const isPendente = item.status === 'PENDENTE'
              const isConcluido = item.status === 'CONCLUIDO'

              let dotColor = 'bg-indigo-500 border-indigo-600'
              if (isAgendamento) {
                if (isPendente) dotColor = 'bg-amber-500 border-amber-600'
                else if (isConcluido) dotColor = 'bg-emerald-500 border-emerald-600'
                else dotColor = 'bg-slate-400 border-slate-500'
              }

              return (
                <div key={item.id} className="relative">
                  <span className={`absolute -left-[21px] top-2 flex h-2.5 w-2.5 rounded-full border shadow-2xs ${dotColor}`} />

                  <div className={`rounded-xl border p-3 bg-white shadow-2xs transition-all ${isAgendamento && isPendente ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {isAgendamento ? 'Agendamento' : `Contato por ${item.channel}`}
                          </span>
                          {isAgendamento && item.status && (
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[8px] font-bold uppercase ${
                                isPendente
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : isConcluido
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {item.status}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formatDateOnly(item.contacted_at)} · Por {item.created_by_name || 'Usuário'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isAgendamento && isPendente && (
                          <button
                            type="button"
                            onClick={() => handleMarkScheduleDone(item.id)}
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold px-2 py-0.5 transition cursor-pointer"
                          >
                            <CheckCircle2 size={11} />
                            Feito
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Excluir do histórico"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {item.result && (
                      <p className="text-xs font-semibold text-slate-800 mt-1.5">{item.result}</p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{item.notes}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
            <div>
              <h3 className="text-base font-bold text-slate-900">Ficha de Follow-up do Cliente</h3>
              <p className="text-xs text-slate-500 font-medium">Histórico de contatos e agendamentos</p>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {content}
          </div>
        </div>
      </div>
    )
  }

  return content
}
