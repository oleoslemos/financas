import { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, CheckCircle2, AlertCircle, Smartphone, Send, X,
  ShieldAlert, Settings2, Calendar, Package, MessageCircle, Clock, Save
} from 'lucide-react'
import {
  isPushNotificationSupported,
  isPwaInstalled,
  isIosDevice,
  getNotificationPermission,
  getExistingPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  savePushSubscriptionToSupabase,
  removePushSubscriptionFromSupabase,
  sendLocalTestNotification,
  DEFAULT_VAPID_PUBLIC_KEY,
} from '../lib/webPush'
import { useSupabase } from '../hooks/useSupabase'
import { useUser } from '../hooks/useClerkCompat'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  isOpen: boolean
  onClose: () => void
  systemSource?: 'v1' | 'v2'
  customEmail?: string | null
}

type Prefs = {
  notify_followup_today: boolean
  notify_followup_overdue: boolean
  notify_birthdays_today: boolean
  notify_birthdays_upcoming: boolean
  notify_feedback_3d: boolean
  notify_feedback_10d: boolean
  notify_feedback_30d: boolean
  notify_product_expiry_30d: boolean
  notify_orders_pending: boolean
  notify_orders_payment: boolean
  notify_new_order: boolean
  morning_hour: number
  morning_minute: number
  evening_enabled: boolean
  evening_hour: number
  evening_minute: number
}

const DEFAULT_PREFS: Prefs = {
  notify_followup_today: true,
  notify_followup_overdue: true,
  notify_birthdays_today: true,
  notify_birthdays_upcoming: true,
  notify_feedback_3d: true,
  notify_feedback_10d: true,
  notify_feedback_30d: true,
  notify_product_expiry_30d: true,
  notify_orders_pending: true,
  notify_orders_payment: false,
  notify_new_order: false,
  morning_hour: 8,
  morning_minute: 0,
  evening_enabled: false,
  evening_hour: 17,
  evening_minute: 30,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-[#0F3764]' : 'bg-slate-200'
      }`}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}

function PrefRow({
  label,
  description,
  checked,
  onChange,
  whatsapp,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  whatsapp?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-800">{label}</span>
          {whatsapp && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
              <MessageCircle className="h-2.5 w-2.5" /> WhatsApp
            </span>
          )}
        </div>
        {description && <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 pt-1 pb-0.5">
      <Icon className="h-3.5 w-3.5 text-[#0F3764]" />
      <span className="text-[11px] font-black text-[#0F3764] uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PushNotificationModal({ isOpen, onClose, systemSource = 'v1', customEmail }: Props) {
  const supabase = useSupabase()
  const { user } = useUser()

  const [tab, setTab] = useState<'device' | 'prefs'>('device')
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [prefsFeedback, setPrefsFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)

  const isInstalled = isPwaInstalled()
  const isIos = isIosDevice()

  const targetEmail = customEmail || user?.primaryEmailAddress?.emailAddress || ''
  const targetUserId = user?.id || null

  const checkStatus = useCallback(async () => {
    const isSupp = isPushNotificationSupported()
    setSupported(isSupp)
    if (!isSupp) return
    setPermission(getNotificationPermission())
    const sub = await getExistingPushSubscription()
    setIsSubscribed(!!sub)
  }, [])

  const loadPrefs = useCallback(async () => {
    if (!supabase || !targetUserId) return
    try {
      const { data } = await supabase
        .from('push_notification_preferences')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('system_source', systemSource)
        .maybeSingle()
      if (data) {
        setPrefs({
          notify_followup_today: data.notify_followup_today ?? true,
          notify_followup_overdue: data.notify_followup_overdue ?? true,
          notify_birthdays_today: data.notify_birthdays_today ?? true,
          notify_birthdays_upcoming: data.notify_birthdays_upcoming ?? true,
          notify_feedback_3d: data.notify_feedback_3d ?? true,
          notify_feedback_10d: data.notify_feedback_10d ?? true,
          notify_feedback_30d: data.notify_feedback_30d ?? true,
          notify_product_expiry_30d: data.notify_product_expiry_30d ?? true,
          notify_orders_pending: data.notify_orders_pending ?? true,
          notify_orders_payment: data.notify_orders_payment ?? false,
          notify_new_order: data.notify_new_order ?? false,
          morning_hour: data.morning_hour ?? 8,
          morning_minute: data.morning_minute ?? 0,
          evening_enabled: data.evening_enabled ?? false,
          evening_hour: data.evening_hour ?? 17,
          evening_minute: data.evening_minute ?? 30,
        })
      }
    } catch { /* usa defaults */ }
  }, [supabase, targetUserId, systemSource])

  useEffect(() => {
    if (isOpen) {
      setFeedbackMsg(null)
      setPrefsFeedback(null)
      void checkStatus()
      void loadPrefs()
    }
  }, [isOpen, checkStatus, loadPrefs])

  if (!isOpen) return null

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  async function handleToggleSubscription() {
    setLoading(true)
    setFeedbackMsg(null)
    try {
      if (isSubscribed) {
        const sub = await getExistingPushSubscription()
        if (sub && supabase) await removePushSubscriptionFromSupabase(supabase, sub.endpoint)
        await unsubscribeFromPush()
        setIsSubscribed(false)
        setPermission(getNotificationPermission())
        setFeedbackMsg({ type: 'info', text: 'Notificações desativadas para este dispositivo.' })
      } else {
        const sub = await subscribeToPush(DEFAULT_VAPID_PUBLIC_KEY)
        setIsSubscribed(true)
        setPermission('granted')
        if (supabase) {
          const res = await savePushSubscriptionToSupabase(supabase, sub, {
            userId: targetUserId,
            email: targetEmail,
            systemSource,
          })
          if (res.success) {
            setFeedbackMsg({ type: 'success', text: '✓ Notificações push ativadas neste dispositivo!' })
          } else {
            setFeedbackMsg({ type: 'info', text: 'Ativado no navegador, mas não foi possível salvar no banco.' })
          }
        } else {
          setFeedbackMsg({ type: 'success', text: 'Notificações ativadas no navegador!' })
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFeedbackMsg({ type: 'error', text: msg || 'Não foi possível alterar as notificações.' })
    } finally {
      setLoading(false)
      void checkStatus()
    }
  }

  async function handleSendTest() {
    setLoading(true)
    setFeedbackMsg(null)
    try {
      await sendLocalTestNotification(
        'Bem Aviv Hub — Notificação de Teste',
        '✅ Seu dispositivo está pronto para receber alertas de follow-ups e pedidos!',
        systemSource === 'v2' ? '/v2/inicio' : '/bem-aviv',
      )
      setFeedbackMsg({ type: 'success', text: 'Notificação de teste disparada! Verifique seu dispositivo.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFeedbackMsg({ type: 'error', text: msg || 'Falha ao disparar teste.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePrefs() {
    if (!supabase || !targetUserId) {
      setPrefsFeedback({ type: 'error', text: 'Você precisa estar logado para salvar preferências.' })
      return
    }
    setSavingPrefs(true)
    setPrefsFeedback(null)
    try {
      const payload = {
        user_id: targetUserId,
        user_email: targetEmail,
        system_source: systemSource,
        ...prefs,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('push_notification_preferences')
        .upsert(payload, { onConflict: 'user_id,system_source' })
      if (error) throw error
      setPrefsFeedback({ type: 'success', text: '✓ Preferências salvas com sucesso!' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setPrefsFeedback({ type: 'error', text: msg || 'Erro ao salvar preferências.' })
    } finally {
      setSavingPrefs(false)
    }
  }

  function padTime(h: number, m: number) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  function parseTime(val: string): [number, number] {
    const [h, m] = val.split(':').map(Number)
    return [h ?? 8, m ?? 0]
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F3764] text-white shadow-sm">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Notificações Push</h3>
              <p className="text-[11px] text-slate-400 font-medium">Bem Aviv Hub</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-slate-100 shrink-0 px-5">
          <button
            type="button"
            onClick={() => setTab('device')}
            className={`flex items-center gap-1.5 px-1 py-2.5 text-xs font-bold border-b-2 transition-colors mr-5 ${
              tab === 'device'
                ? 'border-[#0F3764] text-[#0F3764]'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Dispositivo
          </button>
          <button
            type="button"
            onClick={() => setTab('prefs')}
            className={`flex items-center gap-1.5 px-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              tab === 'prefs'
                ? 'border-[#0F3764] text-[#0F3764]'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Preferências
          </button>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="overflow-y-auto flex-1 min-h-0">

          {/* ═══ ABA: DISPOSITIVO ═══ */}
          {tab === 'device' && (
            <div className="p-5 space-y-4">
              {/* Feedback */}
              {feedbackMsg && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-xs font-semibold ${
                  feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : feedbackMsg.type === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200'
                  : 'bg-sky-50 text-sky-950 border border-sky-200'
                }`}>
                  {feedbackMsg.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />}
                  {feedbackMsg.type === 'error' && <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />}
                  {feedbackMsg.type === 'info' && <Bell className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-0.5" />}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Status */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Suporte neste navegador:</span>
                  <span className={`font-bold ${supported ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {supported ? 'Compatível ✓' : 'Não suportado'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Permissão do sistema:</span>
                  <span className={`font-bold uppercase tracking-tight ${
                    permission === 'granted' ? 'text-emerald-700'
                    : permission === 'denied' ? 'text-rose-600'
                    : 'text-amber-700'
                  }`}>
                    {permission === 'granted' ? '✓ Permitido' : permission === 'denied' ? '✗ Bloqueado' : 'Pendente'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Status da inscrição:</span>
                  <span className={`font-bold ${isSubscribed ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {isSubscribed ? '✓ Ativo neste aparelho' : 'Inativo'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">App instalado (PWA):</span>
                  <span className="font-bold text-slate-700">
                    {isInstalled ? '✓ Standalone' : 'No Navegador'}
                  </span>
                </div>
              </div>

              {/* iOS tip */}
              {isIos && !isInstalled && (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Smartphone className="h-3.5 w-3.5 text-amber-700" />
                    Dica para iPhone / iPad
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    No Safari do iOS, notificações push só funcionam após adicionar à tela de início. Toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.
                  </p>
                </div>
              )}

              {/* Blocked warning */}
              {permission === 'denied' && (
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-3 text-xs text-rose-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-700" />
                    Notificações bloqueadas
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-900">
                    Clique no ícone de cadeado 🔒 na barra de endereço do navegador e altere a permissão de notificações para "Permitir".
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-2 pt-1">
                {supported && (
                  <button
                    type="button"
                    disabled={loading || permission === 'denied'}
                    onClick={handleToggleSubscription}
                    className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-60 ${
                      isSubscribed
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                        : 'bg-[#0F3764] hover:bg-[#0c2c50] text-white'
                    }`}
                  >
                    {isSubscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                    {isSubscribed ? 'Desativar notificações neste aparelho' : 'Ativar notificações neste aparelho'}
                  </button>
                )}

                {isSubscribed && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleSendTest}
                    className="w-full py-2 px-4 rounded-xl font-bold text-xs border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Send className="h-3 w-3 text-emerald-600" />
                    Enviar notificação de teste agora
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 px-4 rounded-xl font-bold text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {/* ═══ ABA: PREFERÊNCIAS ═══ */}
          {tab === 'prefs' && (
            <div className="p-5 space-y-4">
              {!isSubscribed && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Ative as notificações na aba <strong>Dispositivo</strong> primeiro para que os alertas sejam entregues.</span>
                </div>
              )}

              {/* ── CRM / FOLLOW-UP ── */}
              <div className="space-y-0">
                <SectionTitle icon={Calendar} label="CRM · Follow-ups e Agenda" />
                <PrefRow
                  label="Follow-ups do dia (resumo matinal)"
                  description="Lista de clientes agendados para contato hoje"
                  checked={prefs.notify_followup_today}
                  onChange={(v) => setPref('notify_followup_today', v)}
                />
                <PrefRow
                  label="Follow-ups em atraso"
                  description="Clientes com data de contato vencida ainda pendentes"
                  checked={prefs.notify_followup_overdue}
                  onChange={(v) => setPref('notify_followup_overdue', v)}
                />
              </div>

              {/* ── ANIVERSÁRIOS ── */}
              <div className="space-y-0">
                <SectionTitle icon={Calendar} label="🎂 Aniversários" />
                <PrefRow
                  label="Aniversariantes de hoje"
                  description="Clientes e familiares com aniversário no dia — com link para WhatsApp"
                  checked={prefs.notify_birthdays_today}
                  onChange={(v) => setPref('notify_birthdays_today', v)}
                  whatsapp
                />
                <PrefRow
                  label="Próximos aniversários (3 dias)"
                  description="Prévia de aniversários nos próximos 3 dias para preparar o contato"
                  checked={prefs.notify_birthdays_upcoming}
                  onChange={(v) => setPref('notify_birthdays_upcoming', v)}
                />
              </div>

              {/* ── FEEDBACK PÓS-ENTREGA ── */}
              <div className="space-y-0">
                <SectionTitle icon={MessageCircle} label="📦 Feedback pós-entrega" />
                <PrefRow
                  label="3 dias após entrega"
                  description="Lembrete com link WhatsApp para verificar satisfação inicial"
                  checked={prefs.notify_feedback_3d}
                  onChange={(v) => setPref('notify_feedback_3d', v)}
                  whatsapp
                />
                <PrefRow
                  label="10 dias após entrega"
                  description="Follow-up de uso e primeiras impressões"
                  checked={prefs.notify_feedback_10d}
                  onChange={(v) => setPref('notify_feedback_10d', v)}
                  whatsapp
                />
                <PrefRow
                  label="30 dias após entrega"
                  description="Pesquisa de satisfação e fidelização"
                  checked={prefs.notify_feedback_30d}
                  onChange={(v) => setPref('notify_feedback_30d', v)}
                  whatsapp
                />
              </div>

              {/* ── VALIDADE DO PRODUTO ── */}
              <div className="space-y-0">
                <SectionTitle icon={Package} label="⏰ Validade / Garantia do Produto" />
                <PrefRow
                  label="30 dias antes do vencimento"
                  description="Alerta com link WhatsApp para oferecer renovação ou revisão"
                  checked={prefs.notify_product_expiry_30d}
                  onChange={(v) => setPref('notify_product_expiry_30d', v)}
                  whatsapp
                />
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-[11px] text-sky-800 leading-snug">
                  <strong>Como configurar:</strong> no cadastro de cada cliente, preencha a <em>Data de compra</em> e os <em>Meses de garantia</em> para que o alerta seja calculado automaticamente.
                </div>
              </div>

              {/* ── PEDIDOS ── */}
              <div className="space-y-0">
                <SectionTitle icon={Package} label="Pedidos e Vendas" />
                <PrefRow
                  label="Entregas em atraso"
                  description="Pedidos confirmados cuja data prevista de entrega já passou"
                  checked={prefs.notify_orders_pending}
                  onChange={(v) => setPref('notify_orders_pending', v)}
                />
                <PrefRow
                  label="Pagamentos pendentes"
                  description="Pedidos aguardando confirmação de entrada financeira"
                  checked={prefs.notify_orders_payment}
                  onChange={(v) => setPref('notify_orders_payment', v)}
                />
                <PrefRow
                  label="Novo pedido criado"
                  description="Notificação imediata ao registrar um novo pedido/orçamento"
                  checked={prefs.notify_new_order}
                  onChange={(v) => setPref('notify_new_order', v)}
                />
              </div>

              {/* ── HORÁRIOS ── */}
              <div className="space-y-2.5">
                <SectionTitle icon={Clock} label="Horários de envio" />
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Resumo da manhã</p>
                      <p className="text-[11px] text-slate-400">Follow-ups + aniversários do dia</p>
                    </div>
                    <input
                      type="time"
                      value={padTime(prefs.morning_hour, prefs.morning_minute)}
                      onChange={(e) => {
                        const [h, m] = parseTime(e.target.value)
                        setPref('morning_hour', h)
                        setPref('morning_minute', m)
                      }}
                      className="text-xs font-bold text-slate-800 border border-slate-300 rounded-lg px-2 py-1.5 bg-white cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Resumo do fim do dia</p>
                      <p className="text-[11px] text-slate-400">Pendências não atendidas</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={prefs.evening_enabled} onChange={(v) => setPref('evening_enabled', v)} />
                      {prefs.evening_enabled && (
                        <input
                          type="time"
                          value={padTime(prefs.evening_hour, prefs.evening_minute)}
                          onChange={(e) => {
                            const [h, m] = parseTime(e.target.value)
                            setPref('evening_hour', h)
                            setPref('evening_minute', m)
                          }}
                          className="text-xs font-bold text-slate-800 border border-slate-300 rounded-lg px-2 py-1.5 bg-white cursor-pointer"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback de salvar */}
              {prefsFeedback && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-xs font-semibold ${
                  prefsFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}>
                  {prefsFeedback.type === 'success'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    : <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />}
                  <span>{prefsFeedback.text}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer (só na aba Preferências) ── */}
        {tab === 'prefs' && (
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 shrink-0 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 rounded-xl font-bold text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={savingPrefs}
              onClick={handleSavePrefs}
              className="flex-1 py-2 px-4 rounded-xl font-bold text-xs bg-[#0F3764] hover:bg-[#0c2c50] text-white flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {savingPrefs ? 'Salvando...' : 'Salvar Preferências'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
