import { SupabaseClient } from '@supabase/supabase-js'

export type NotificationPendingItem = {
  id: string
  category: 'aniversario' | 'followup' | 'feedback' | 'garantia' | 'pedido'
  typeLabel: string
  urgency: 'high' | 'medium' | 'normal'
  clientName: string
  clientPhone?: string
  relationship?: string
  dateInfo: string
  description: string
  suggestedMessage?: string
  whatsappUrl?: string
  systemUrl: string
}

function formatPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

function buildWhatsAppUrl(phone: string, text: string): string {
  const clean = formatPhone(phone)
  if (!clean) return ''
  const full = clean.startsWith('55') ? clean : `55${clean}`
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

function cleanDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export async function fetchPendingNotificationItems(
  supabase: SupabaseClient,
  companyId?: string | null
): Promise<NotificationPendingItem[]> {
  const items: NotificationPendingItem[] = []
  const now = new Date()
  const todayBR = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const todayClean = cleanDate(todayBR)
  const todayIso = todayClean.toISOString().slice(0, 10)
  const mm = String(todayBR.getMonth() + 1).padStart(2, '0')
  const dd = String(todayBR.getDate()).padStart(2, '0')

  try {
    // ── 1. ANIVERSARIANTES DE HOJE (Clientes) ─────────────────────────────
    let cQuery = supabase
      .from('bem_aviv_clients')
      .select('id, full_name, birth_date, phone_1')
      .not('birth_date', 'is', null)
    if (companyId) cQuery = cQuery.eq('company_id', companyId)
    const { data: clients } = await cQuery

    for (const c of clients ?? []) {
      if (!c.birth_date || c.birth_date === '1900-01-01') continue
      const parts = c.birth_date.split('-')
      if (parts[1] === mm && parts[2] === dd) {
        const firstName = c.full_name.trim().split(' ')[0]
        const phone = c.phone_1 ? formatPhone(c.phone_1) : ''
        const msg = `Parabéns ${firstName}! 🎂 Desejo a você um feliz aniversário, com muita saúde, paz e realizações!`
        items.push({
          id: `bday-c-${c.id}`,
          category: 'aniversario',
          typeLabel: 'Aniversariante Hoje 🎂',
          urgency: 'high',
          clientName: c.full_name,
          clientPhone: c.phone_1,
          dateInfo: 'Hoje',
          description: 'Cliente faz aniversário no dia de hoje.',
          suggestedMessage: msg,
          whatsappUrl: phone ? buildWhatsAppUrl(phone, msg) : undefined,
          systemUrl: '/bem-aviv/clientes',
        })
      }
    }

    // ── 2. ANIVERSARIANTES DE HOJE (Familiares) ────────────────────────────
    let rQuery = supabase
      .from('bem_aviv_client_relatives')
      .select('id, name, birth_date, phone, relationship, client_id')
      .not('birth_date', 'is', null)
    if (companyId) rQuery = rQuery.eq('company_id', companyId)
    const { data: relatives } = await rQuery

    for (const r of relatives ?? []) {
      if (!r.birth_date || r.birth_date === '1900-01-01') continue
      const parts = r.birth_date.split('-')
      if (parts[1] === mm && parts[2] === dd) {
        const firstName = r.name.trim().split(' ')[0]
        const phone = r.phone ? formatPhone(r.phone) : ''
        const msg = `Parabéns ${firstName}! 🎂 Que o seu dia seja muito especial e repleto de felicidades!`
        items.push({
          id: `bday-r-${r.id}`,
          category: 'aniversario',
          typeLabel: 'Familiar Aniversariante 🎂',
          urgency: 'high',
          clientName: r.name,
          relationship: r.relationship,
          clientPhone: r.phone,
          dateInfo: 'Hoje',
          description: `Familiar (${r.relationship || 'Parente'}) aniversariando hoje.`,
          suggestedMessage: msg,
          whatsappUrl: phone ? buildWhatsAppUrl(phone, msg) : undefined,
          systemUrl: '/bem-aviv/clientes',
        })
      }
    }

    // ── 3. FOLLOW-UPS DE HOJE ─────────────────────────────────────────────
    let fuQuery = supabase
      .from('bem_aviv_clients')
      .select('id, full_name, phone_1, next_followup_at, next_followup_note, next_followup_status')
      .eq('next_followup_status', 'PENDENTE')
      .gte('next_followup_at', `${todayIso}T00:00:00`)
      .lt('next_followup_at', `${todayIso}T23:59:59`)
      .not('full_name', 'is', null)
    if (companyId) fuQuery = fuQuery.eq('company_id', companyId)
    const { data: todayFu } = await fuQuery

    for (const f of todayFu ?? []) {
      const firstName = f.full_name.trim().split(' ')[0]
      const phone = f.phone_1 ? formatPhone(f.phone_1) : ''
      const msg = `Olá ${firstName}, tudo bem? Aqui é da Bem Aviv. Gostaria de dar continuidade ao nosso contato agendado para hoje!`
      items.push({
        id: `fu-today-${f.id}`,
        category: 'followup',
        typeLabel: 'Follow-up Hoje 📋',
        urgency: 'high',
        clientName: f.full_name,
        clientPhone: f.phone_1,
        dateInfo: 'Hoje',
        description: f.next_followup_note || 'Contato agendado para o dia de hoje.',
        suggestedMessage: msg,
        whatsappUrl: phone ? buildWhatsAppUrl(phone, msg) : undefined,
        systemUrl: '/bem-aviv/follow-up',
      })
    }

    // ── 4. FOLLOW-UPS ATRASADOS ───────────────────────────────────────────
    let overQuery = supabase
      .from('bem_aviv_clients')
      .select('id, full_name, phone_1, next_followup_at, next_followup_note, next_followup_status')
      .eq('next_followup_status', 'PENDENTE')
      .lt('next_followup_at', `${todayIso}T00:00:00`)
      .not('next_followup_at', 'is', null)
      .limit(30)
    if (companyId) overQuery = overQuery.eq('company_id', companyId)
    const { data: overdueFu } = await overQuery

    for (const o of overdueFu ?? []) {
      const firstName = o.full_name.trim().split(' ')[0]
      const phone = o.phone_1 ? formatPhone(o.phone_1) : ''
      const msg = `Olá ${firstName}, tudo bem? Estou entrando em contato para darmos continuidade ao seu atendimento!`
      const dataStr = o.next_followup_at ? new Date(o.next_followup_at).toLocaleDateString('pt-BR') : 'Anterior'
      items.push({
        id: `fu-overdue-${o.id}`,
        category: 'followup',
        typeLabel: 'Follow-up Atrasado ⚠️',
        urgency: 'high',
        clientName: o.full_name,
        clientPhone: o.phone_1,
        dateInfo: `Venceu em ${dataStr}`,
        description: o.next_followup_note || 'Contato pendente com data ultrapassada.',
        suggestedMessage: msg,
        whatsappUrl: phone ? buildWhatsAppUrl(phone, msg) : undefined,
        systemUrl: '/bem-aviv/follow-up',
      })
    }

    // ── 5. FEEDBACK PÓS-ENTREGA (3, 10 e 30 dias) ────────────────────────
    const feedbackWindows = [
      { days: 3, label: '3 dias' },
      { days: 10, label: '10 dias' },
      { days: 30, label: '30 dias' },
    ]

    for (const fw of feedbackWindows) {
      const targetDate = new Date(todayClean)
      targetDate.setDate(targetDate.getDate() - fw.days)
      const targetIso = targetDate.toISOString().slice(0, 10)

      let ordQuery = supabase
        .from('bem_aviv_sales_orders')
        .select('id, client_id, document_number, delivered_at')
        .eq('status', 'ENTREGUE')
        .eq('delivered_at', targetIso)

      if (companyId) ordQuery = ordQuery.eq('company_id', companyId)
      const { data: delivOrders } = await ordQuery

      if (delivOrders && delivOrders.length > 0) {
        const clientIds = delivOrders.map((o) => o.client_id)
        const { data: clientsMapData } = await supabase
          .from('bem_aviv_clients')
          .select('id, full_name, phone_1')
          .in('id', clientIds)

        const cMap = new Map((clientsMapData ?? []).map((c) => [c.id, c]))

        for (const order of delivOrders) {
          const c = cMap.get(order.client_id)
          if (!c) continue
          const firstName = c.full_name.trim().split(' ')[0]
          const phone = c.phone_1 ? formatPhone(c.phone_1) : ''
          const msg = `Olá ${firstName}, tudo bem? Faz ${fw.label} desde a entrega do seu produto. Como está sendo sua experiência? Gostaríamos muito de receber seu feedback! 😊`

          items.push({
            id: `feedback-${fw.days}d-${order.id}`,
            category: 'feedback',
            typeLabel: `Feedback ${fw.label} 📦`,
            urgency: 'medium',
            clientName: c.full_name,
            clientPhone: c.phone_1,
            dateInfo: `Entregue em ${new Date(targetIso + 'T00:00:00').toLocaleDateString('pt-BR')}`,
            description: `Pedido ${order.document_number ? '#' + order.document_number : ''} entregue há ${fw.days} dias.`,
            suggestedMessage: msg,
            whatsappUrl: phone ? buildWhatsAppUrl(phone, msg) : undefined,
            systemUrl: '/bem-aviv/pedidos',
          })
        }
      }
    }

    // ── 6. VALIDADE DE GARANTIA (30 dias antes do vencimento) ────────────
    const expiryTarget = new Date(todayClean)
    expiryTarget.setDate(expiryTarget.getDate() + 30)
    const expiryIso = expiryTarget.toISOString().slice(0, 10)

    let expQuery = supabase
      .from('bem_aviv_clients')
      .select('id, full_name, phone_1, product_purchase_date, product_warranty_months')
      .not('product_purchase_date', 'is', null)

    if (companyId) expQuery = expQuery.eq('company_id', companyId)
    const { data: expClients } = await expQuery

    for (const c of expClients ?? []) {
      if (!c.product_purchase_date || !c.product_warranty_months) continue
      const purchaseDate = new Date(c.product_purchase_date)
      const expiryDate = new Date(purchaseDate)
      expiryDate.setMonth(expiryDate.getMonth() + c.product_warranty_months)
      const expiryDateIso = cleanDate(expiryDate).toISOString().slice(0, 10)

      if (expiryDateIso === expiryIso) {
        const firstName = c.full_name.trim().split(' ')[0]
        const phone = c.phone_1 ? formatPhone(c.phone_1) : ''
        const expStr = expiryDate.toLocaleDateString('pt-BR')
        const msg = `Olá ${firstName}! A garantia do seu produto vence em 30 dias (${expStr}). Gostaria de verificar se você precisa de alguma revisão ou assistência! 😊`

        items.push({
          id: `expiry-30d-${c.id}`,
          category: 'garantia',
          typeLabel: 'Garantia a Vencer ⏰',
          urgency: 'medium',
          clientName: c.full_name,
          clientPhone: c.phone_1,
          dateInfo: `Vence em ${expStr}`,
          description: 'Garantia do produto cadastrado vence em 30 dias.',
          suggestedMessage: msg,
          whatsappUrl: phone ? buildWhatsAppUrl(phone, msg) : undefined,
          systemUrl: '/bem-aviv/clientes',
        })
      }
    }

    // ── 7. PEDIDOS COM ENTREGA ATRASADA ──────────────────────────────────
    let pOrdQuery = supabase
      .from('bem_aviv_sales_orders')
      .select('id, client_id, document_number, expected_arrival_date, status')
      .in('status', ['CONFIRMADO', 'EM_PRODUCAO', 'PRONTO_PARA_ENTREGA'])
      .lt('expected_arrival_date', todayIso)

    if (companyId) pOrdQuery = pOrdQuery.eq('company_id', companyId)
    const { data: overdueOrders } = await pOrdQuery

    for (const ord of overdueOrders ?? []) {
      const doc = ord.document_number ? `#${ord.document_number}` : `#${ord.id.slice(0, 6)}`
      items.push({
        id: `ord-overdue-${ord.id}`,
        category: 'pedido',
        typeLabel: 'Entrega Atrasada 🚚',
        urgency: 'high',
        clientName: `Pedido ${doc}`,
        dateInfo: `Previsão: ${ord.expected_arrival_date}`,
        description: `Status: ${ord.status}. A data prevista de entrega já passou.`,
        systemUrl: '/bem-aviv/pedidos',
      })
    }
  } catch (err) {
    console.error('Erro ao buscar notificações pendentes:', err)
  }

  return items
}
