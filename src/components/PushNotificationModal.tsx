import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, CheckCircle2, AlertCircle, Smartphone, Send, X, ShieldAlert } from 'lucide-react'
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

type Props = {
  isOpen: boolean
  onClose: () => void
  systemSource?: 'v1' | 'v2'
  customEmail?: string | null
}

export function PushNotificationModal({ isOpen, onClose, systemSource = 'v1', customEmail }: Props) {
  const supabase = useSupabase()
  const { user } = useUser()

  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const isInstalled = isPwaInstalled()
  const isIos = isIosDevice()

  const checkStatus = useCallback(async () => {
    const isSupp = isPushNotificationSupported()
    setSupported(isSupp)
    if (!isSupp) return

    setPermission(getNotificationPermission())
    const sub = await getExistingPushSubscription()
    setIsSubscribed(!!sub)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setFeedbackMsg(null)
      void checkStatus()
    }
  }, [isOpen, checkStatus])

  if (!isOpen) return null

  const targetEmail = customEmail || user?.primaryEmailAddress?.emailAddress || ''
  const targetUserId = user?.id || null

  async function handleToggleSubscription() {
    setLoading(true)
    setFeedbackMsg(null)

    try {
      if (isSubscribed) {
        // Desinscrever
        const sub = await getExistingPushSubscription()
        if (sub && supabase) {
          await removePushSubscriptionFromSupabase(supabase, sub.endpoint)
        }
        await unsubscribeFromPush()
        setIsSubscribed(false)
        setPermission(getNotificationPermission())
        setFeedbackMsg({ type: 'info', text: 'Notificações desativadas para este dispositivo.' })
      } else {
        // Inscrever
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
            setFeedbackMsg({ type: 'success', text: 'Notificações push ativadas com sucesso!' })
          } else {
            setFeedbackMsg({
              type: 'info',
              text: 'Notificação ativada no navegador. (Tabela push_subscriptions do Supabase ainda aguarda migration).',
            })
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
        'Seu dispositivo está pronto para receber alertas de follow-ups e pedidos!',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F3764] text-white shadow-xs">
              <Bell size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Notificações Push</h3>
              <p className="text-xs text-slate-500 font-medium">Bem Aviv Hub PWA</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback message */}
        {feedbackMsg && (
          <div
            className={`flex items-start gap-2 p-3 rounded-xl text-xs font-semibold ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : feedbackMsg.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border border-rose-200'
                  : 'bg-sky-50 text-sky-950 border border-sky-200'
            }`}
          >
            {feedbackMsg.type === 'success' && <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />}
            {feedbackMsg.type === 'error' && <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />}
            {feedbackMsg.type === 'info' && <Bell size={15} className="text-sky-600 shrink-0 mt-0.5" />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Status atual */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Suporte neste navegador:</span>
            <span className={`font-bold ${supported ? 'text-emerald-700' : 'text-rose-600'}`}>
              {supported ? 'Compatível' : 'Não suportado'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Permissão do sistema:</span>
            <span
              className={`font-bold uppercase tracking-tight ${
                permission === 'granted'
                  ? 'text-emerald-700'
                  : permission === 'denied'
                    ? 'text-rose-600'
                    : 'text-amber-700'
              }`}
            >
              {permission === 'granted' ? 'Permitido' : permission === 'denied' ? 'Bloqueado' : 'Pendente'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">App instalado (PWA):</span>
            <span className="font-bold text-slate-700">
              {isInstalled ? 'Sim (Standalone)' : 'No Navegador'}
            </span>
          </div>
        </div>

        {/* Dica para iOS */}
        {isIos && !isInstalled && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Smartphone size={14} className="text-amber-700" />
              <span>Dica para iPhone / iPad</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900">
              No Safari do iOS, notificações push só funcionam após adicionar à tela de início. Toque no botão de <strong>Compartilhar</strong> do Safari e selecione <strong>Adicionar à Tela de Início</strong>.
            </p>
          </div>
        )}

        {permission === 'denied' && (
          <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-3 text-xs text-rose-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert size={14} className="text-rose-700" />
              <span>Notificações bloqueadas</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-900">
              As notificações foram bloqueadas nas permissões do seu navegador. Clique no ícone de cadeado na barra de endereço para redefinir a permissão.
            </p>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="space-y-2 pt-2">
          {supported && (
            <button
              type="button"
              disabled={loading || permission === 'denied'}
              onClick={handleToggleSubscription}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-60 ${
                isSubscribed
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  : 'bg-[#0F3764] hover:bg-[#0c2c50] text-white'
              }`}
            >
              {isSubscribed ? <BellOff size={15} /> : <Bell size={15} />}
              <span>{isSubscribed ? 'Desativar notificações' : 'Ativar notificações neste aparelho'}</span>
            </button>
          )}

          {isSubscribed && (
            <button
              type="button"
              disabled={loading}
              onClick={handleSendTest}
              className="w-full py-2 px-4 rounded-xl font-bold text-xs border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Send size={13} className="text-emerald-600" />
              <span>Enviar notificação de teste agora</span>
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
    </div>
  )
}
