import { useState, useEffect } from 'react'
import {
  Bell,
  Clock,
  Plus,
  X,
  Check,
  RefreshCw,
  Smartphone,
  ShieldAlert,
  Calendar,
  MessageSquare,
  Package,
  Clock3,
  CalendarDays,
  Sparkles,
} from 'lucide-react'

interface NotificationSettings {
  sendTimes: string[]
  crmFollowUpsToday: boolean
  crmFollowUpsDelayed: boolean
  birthdaysToday: boolean
  birthdaysNext3Days: boolean
  feedback3Days: boolean
  feedback10Days: boolean
  feedback30Days: boolean
  warranty30Days: boolean
  delayedDeliveries: boolean
  pendingPayments: boolean
}

const DEFAULT_SETTINGS: NotificationSettings = {
  sendTimes: ['08:00', '18:00'],
  crmFollowUpsToday: true,
  crmFollowUpsDelayed: true,
  birthdaysToday: true,
  birthdaysNext3Days: true,
  feedback3Days: true,
  feedback10Days: true,
  feedback30Days: true,
  warranty30Days: true,
  delayedDeliveries: true,
  pendingPayments: false,
}

const STORAGE_KEY = 'v2_notification_settings'

export function V2SettingsNotificacoes() {
  const [subTab, setSubTab] = useState<'alertas' | 'dispositivo'>('alertas')
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const [newTimeInput, setNewTimeInput] = useState('12:00')
  const [saving, setSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [testingAlerts, setTestingAlerts] = useState(false)

  // Device status state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true)
      setNotificationPermission(Notification.permission)
    }
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleAddTime = (timeToAdd: string) => {
    const formatted = timeToAdd.trim()
    if (!formatted) return
    if (settings.sendTimes.includes(formatted)) {
      showToast('Este horário já está na lista.')
      return
    }
    setSettings((prev) => ({
      ...prev,
      sendTimes: [...prev.sendTimes, formatted].sort(),
    }))
  }

  const handleRemoveTime = (timeToRemove: string) => {
    setSettings((prev) => ({
      ...prev,
      sendTimes: prev.sendTimes.filter((t) => t !== timeToRemove),
    }))
  }

  const handleToggle = (key: keyof Omit<NotificationSettings, 'sendTimes'>) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSave = () => {
    setSaving(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      setTimeout(() => {
        setSaving(false)
        showToast('Preferências de notificações salvas com sucesso!')
      }, 400)
    } catch {
      setSaving(false)
      showToast('Erro ao salvar preferências.')
    }
  }

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) {
      showToast('Notificações não são suportadas neste navegador.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      if (permission === 'granted') {
        new Notification('Bem Aviv - Notificações Ativadas', {
          body: 'Seu dispositivo agora receberá lembretes e avisos importantes.',
          icon: '/favicon.ico',
        })
        showToast('Notificações ativadas com sucesso!')
      } else {
        showToast('Permissão de notificação negada no navegador.')
      }
    } catch {
      showToast('Não foi possível solicitar permissão.')
    }
  }

  const handleTestAlerts = () => {
    setTestingAlerts(true)
    setTimeout(() => {
      setTestingAlerts(false)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Alerta de Teste - Bem Aviv', {
          body: 'Teste disparado com sucesso: você possui follow-ups e avisos pendentes.',
          icon: '/favicon.ico',
        })
      }
      showToast('Disparo de teste executado! Verifique seus alertas.')
    }, 800)
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="h-11 w-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">Notificações e alertas</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Avisos automáticos por WhatsApp e push
            </p>
          </div>
        </div>

        {/* Subtabs Bar */}
        <div className="flex border-b border-slate-200 px-6 gap-8 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setSubTab('alertas')}
            className={`py-3.5 text-xs font-bold transition-all relative flex items-center gap-2 ${
              subTab === 'alertas' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock3 className="h-4 w-4" />
            Alertas e horários
            {subTab === 'alertas' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('dispositivo')}
            className={`py-3.5 text-xs font-bold transition-all relative flex items-center gap-2 ${
              subTab === 'dispositivo' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            Este dispositivo
            {subTab === 'dispositivo' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab 1: Alertas e Horários */}
        {subTab === 'alertas' && (
          <div className="p-6 space-y-6">
            {/* Warning banner */}
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center gap-3 text-xs text-amber-800 font-medium">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Ative as notificações na aba <strong>Este dispositivo</strong> para receber os alertas no computador ou celular.
              </span>
            </div>

            {/* Horários de envio */}
            <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-700" />
                  <span className="text-sm font-black text-slate-800">Horários de envio</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-md">
                  Por usuário
                </span>
              </div>
              <p className="text-xs text-slate-500">O servidor verifica seus alertas nestes horários.</p>

              {/* Active times chips */}
              <div className="flex flex-wrap items-center gap-2">
                {settings.sendTimes.map((time) => (
                  <div
                    key={time}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold shadow-2xs"
                  >
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <span>{time}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTime(time)}
                      className="text-slate-400 hover:text-red-600 transition"
                      title="Remover horário"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Time input & Add */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="time"
                  value={newTimeInput}
                  onChange={(e) => setNewTimeInput(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleAddTime(newTimeInput)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar horário
                </button>
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-slate-500">
                <span className="text-[11px] font-medium mr-1">Sugestões:</span>
                {['10:00', '12:00', '14:00', '16:00', '20:00'].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleAddTime(sug)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold transition"
                  >
                    +{sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Section: CRM */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                CRM · Follow-ups e agenda
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-2xl bg-white overflow-hidden">
                <NotificationToggleRow
                  label="Follow-ups do dia"
                  badge="WhatsApp"
                  desc="Lista de clientes agendados para contato hoje"
                  checked={settings.crmFollowUpsToday}
                  onChange={() => handleToggle('crmFollowUpsToday')}
                />
                <NotificationToggleRow
                  label="Follow-ups em atraso"
                  badge="WhatsApp"
                  desc="Clientes com data de contato vencida ainda pendentes"
                  checked={settings.crmFollowUpsDelayed}
                  onChange={() => handleToggle('crmFollowUpsDelayed')}
                />
              </div>
            </div>

            {/* Section: Aniversários */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5 text-purple-600" />
                Aniversários
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-2xl bg-white overflow-hidden">
                <NotificationToggleRow
                  label="Aniversariantes de hoje"
                  badge="WhatsApp"
                  desc="Clientes e familiares com link direto para parabenizar"
                  checked={settings.birthdaysToday}
                  onChange={() => handleToggle('birthdaysToday')}
                />
                <NotificationToggleRow
                  label="Próximos aniversários (3 dias)"
                  badge="WhatsApp"
                  desc="Prévia para preparar contato com antecedência"
                  checked={settings.birthdaysNext3Days}
                  onChange={() => handleToggle('birthdaysNext3Days')}
                />
              </div>
            </div>

            {/* Section: Feedback pós-entrega */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
                Feedback pós-entrega
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-2xl bg-white overflow-hidden">
                <NotificationToggleRow
                  label="3 dias após a entrega"
                  badge="WhatsApp"
                  desc="Avaliar a satisfação inicial"
                  checked={settings.feedback3Days}
                  onChange={() => handleToggle('feedback3Days')}
                />
                <NotificationToggleRow
                  label="10 dias após a entrega"
                  badge="WhatsApp"
                  desc="Adaptação e uso"
                  checked={settings.feedback10Days}
                  onChange={() => handleToggle('feedback10Days')}
                />
                <NotificationToggleRow
                  label="30 dias após a entrega"
                  badge="WhatsApp"
                  desc="Pesquisa de satisfação e fidelização"
                  checked={settings.feedback30Days}
                  onChange={() => handleToggle('feedback30Days')}
                />
              </div>
            </div>

            {/* Section: Validade e garantia */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                <Package className="h-3.5 w-3.5 text-amber-600" />
                Validade e garantia do produto
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-2xl bg-white overflow-hidden">
                <NotificationToggleRow
                  label="30 dias antes do vencimento"
                  badge="WhatsApp"
                  desc="Oferecer renovação ou revisão"
                  checked={settings.warranty30Days}
                  onChange={() => handleToggle('warranty30Days')}
                />
              </div>
            </div>

            {/* Section: Pedidos e vendas */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5 text-rose-600" />
                Pedidos e vendas
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-2xl bg-white overflow-hidden">
                <NotificationToggleRow
                  label="Entregas em atraso"
                  desc="Pedidos confirmados com entrega prevista vencida"
                  checked={settings.delayedDeliveries}
                  onChange={() => handleToggle('delayedDeliveries')}
                />
                <NotificationToggleRow
                  label="Pagamentos pendentes"
                  desc="Pedidos aguardando entrada financeira"
                  checked={settings.pendingPayments}
                  onChange={() => handleToggle('pendingPayments')}
                />
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestAlerts}
                disabled={testingAlerts}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-xs font-bold text-slate-700 inline-flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className={`h-4 w-4 text-slate-500 ${testingAlerts ? 'animate-spin' : ''}`} />
                {testingAlerts ? 'Disparando teste...' : 'Disparar meus alertas agora (teste)'}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Check className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar preferências'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Este Dispositivo */}
        {subTab === 'dispositivo' && (
          <div className="p-6 space-y-6">
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl bg-white overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Suporte neste navegador</span>
                <span className={`text-xs font-bold ${isSupported ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isSupported ? 'Compatível ✓' : 'Não compatível ✕'}
                </span>
              </div>
              <div className="p-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Permissão do sistema</span>
                <span
                  className={`text-xs font-bold ${
                    notificationPermission === 'granted'
                      ? 'text-emerald-600'
                      : notificationPermission === 'denied'
                      ? 'text-red-500'
                      : 'text-amber-600'
                  }`}
                >
                  {notificationPermission === 'granted'
                    ? 'Permitido'
                    : notificationPermission === 'denied'
                    ? 'Bloqueado'
                    : 'Pendente'}
                </span>
              </div>
              <div className="p-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Status da inscrição</span>
                <span
                  className={`text-xs font-bold ${
                    notificationPermission === 'granted' ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {notificationPermission === 'granted' ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="p-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">App instalado (PWA)</span>
                <span className="text-xs font-bold text-slate-500">No navegador</span>
              </div>
            </div>

            {/* Alert if denied */}
            {notificationPermission === 'denied' && (
              <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200 flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-red-900">Notificações bloqueadas</h4>
                  <p className="text-xs text-red-700">
                    Toque no ícone de cadeado na barra de endereço do navegador e altere a permissão de notificações para "Permitir".
                  </p>
                </div>
              </div>
            )}

            {/* Action button */}
            <button
              type="button"
              onClick={handleRequestPermission}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition"
            >
              <Bell className="h-4 w-4" />
              {notificationPermission === 'granted'
                ? 'Testar notificação push neste aparelho'
                : 'Ativar notificações neste aparelho'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function NotificationToggleRow({
  label,
  badge,
  desc,
  checked,
  onChange,
}: {
  label: string
  badge?: string
  desc: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">{label}</span>
          {badge && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-md">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
      </div>

      {/* Modern iOS style toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
          checked ? 'bg-emerald-600' : 'bg-slate-200'
        }`}
      >
        <div
          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
