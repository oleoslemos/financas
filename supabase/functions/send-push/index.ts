import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowInBR(): Date {
  // Retorna a data/hora ajustada para o fuso horário de Brasília (UTC-3)
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
}

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(":")) return -1
  const [h, m] = timeStr.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return -1
  return h * 60 + m
}

function diffDays(dateStr: string, fromDate: Date): number {
  const d = new Date(dateStr + "T00:00:00")
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
  return Math.round((d.getTime() - from.getTime()) / 86400000)
}

function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

function whatsappLink(phone: string, message: string): string {
  const clean = formatPhone(phone)
  if (!clean) return ""
  const full = clean.startsWith("55") ? clean : `55${clean}`
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`
}

function cleanDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// ─── Envio Web Push ───────────────────────────────────────────────────────────

async function sendPush(
  supabase: ReturnType<typeof createClient>,
  subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: { title: string; body: string; url: string; tag?: string },
) {
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: payload.tag || "bem-aviv",
  })

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, data)
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id)
        }
        throw err
      }
    }),
  )

  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  }
}

// ─── Handler Principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "BMfj1Q3ueoxrWBpj6ivhvD9lnCilu6dBTWYKD1UIp1r5MaaFPrEYexNb1E9edIpUrSw8NCFbq1TgFsLo-kMzWPg"
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? ""
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@bemaviv.com.br"

  if (!vapidPrivateKey) {
    return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const todayBR = nowInBR()
  const todayClean = cleanDate(todayBR)
  const todayIso = todayClean.toISOString().slice(0, 10)
  const currentMinutes = todayBR.getHours() * 60 + todayBR.getMinutes()
  const currentTimeStr = `${String(todayBR.getHours()).padStart(2, "0")}:${String(todayBR.getMinutes()).padStart(2, "0")}`

  let bodyData: any = {}
  try {
    if (req.method === "POST") bodyData = await req.json()
  } catch { /* vazio */ }

  const isForce = !!bodyData.force || !!bodyData.title
  const forceUserId = bodyData.userId || null

  // 1. Disparo manual específico com título/corpo
  if (bodyData.title) {
    let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth")
    if (bodyData.userIds?.length) query = query.in("user_id", bodyData.userIds)
    const { data: subs } = await query
    const result = await sendPush(supabase, subs ?? [], {
      title: bodyData.title,
      body: bodyData.body ?? "",
      url: bodyData.url ?? "/bem-aviv",
    })
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // 2. Busca preferências de usuários
  let prefsQuery = supabase.from("push_notification_preferences").select("*")
  if (forceUserId) prefsQuery = prefsQuery.eq("user_id", forceUserId)
  const { data: prefs, error: prefsError } = await prefsQuery

  if (prefsError) {
    return new Response(JSON.stringify({ error: prefsError.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const report: Record<string, any> = {}
  let totalSent = 0

  for (const pref of prefs ?? []) {
    // Lista de horários do usuário: ex: ["08:00", "12:00", "18:00"]
    let scheduleTimes: string[] = []
    if (Array.isArray(pref.schedule_times) && pref.schedule_times.length > 0) {
      scheduleTimes = pref.schedule_times
    } else {
      // Fallback para os campos antigos
      const mStr = `${String(pref.morning_hour ?? 8).padStart(2, "0")}:${String(pref.morning_minute ?? 0).padStart(2, "0")}`
      scheduleTimes.push(mStr)
      if (pref.evening_enabled) {
        const eStr = `${String(pref.evening_hour ?? 18).padStart(2, "0")}:${String(pref.evening_minute ?? 0).padStart(2, "0")}`
        scheduleTimes.push(eStr)
      }
    }

    // Se NÃO for force, verifica se algum horário bate com a janela atual
    let matchingSlot: string | null = null
    if (isForce) {
      matchingSlot = scheduleTimes[0] || "manual"
    } else {
      // Janela de tolerância de 10 minutos (ex: se o cron roda a cada 5min)
      for (const slot of scheduleTimes) {
        const slotMins = timeStringToMinutes(slot)
        if (slotMins < 0) continue
        // Se a hora atual está entre slot e slot + 9 minutos
        if (currentMinutes >= slotMins && currentMinutes <= slotMins + 9) {
          // Checa se já enviamos neste slot hoje
          const { data: existingLog } = await supabase
            .from("push_notification_dispatch_logs")
            .select("id")
            .eq("user_id", pref.user_id)
            .eq("slot_time", slot)
            .eq("dispatch_date", todayIso)
            .maybeSingle()

          if (!existingLog) {
            matchingSlot = slot
            break
          }
        }
      }
    }

    // Se não há horário compatível para este usuário neste momento, pula
    if (!matchingSlot) {
      continue
    }

    // Busca as inscrições push ativas deste usuário
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", pref.user_id)
      .eq("system_source", pref.system_source)

    if (!subs || subs.length === 0) continue

    // Identifica o company_id associado ao usuário
    const { data: memberRow } = await supabase
      .from("company_members")
      .select("company_id")
      .or(`email.eq.${pref.user_email},clerk_user_id.eq.${pref.user_id}`)
      .limit(1)
      .maybeSingle()

    const companyId = memberRow?.company_id
    let userSentCount = 0

    // ── 1. Follow-ups de HOJE ─────────────────────────────────────────────
    if (pref.notify_followup_today) {
      let query = supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, next_followup_at, next_followup_status")
        .eq("next_followup_status", "PENDENTE")
        .gte("next_followup_at", `${todayIso}T00:00:00`)
        .lt("next_followup_at", `${todayIso}T23:59:59`)
        .not("full_name", "is", null)

      if (companyId) query = query.eq("company_id", companyId)
      const { data: followups } = await query

      if (followups && followups.length > 0) {
        const names = followups.slice(0, 3).map((c) => c.full_name.split(" ")[0]).join(", ")
        const more = followups.length > 3 ? ` e mais ${followups.length - 3}` : ""
        const firstPhone = followups[0].phone_1 ? formatPhone(followups[0].phone_1) : ""
        const url = firstPhone
          ? whatsappLink(firstPhone, `Olá! Tudo bem? Passando para dar continuidade ao nosso contato.`)
          : "/bem-aviv/follow-up"

        const r = await sendPush(supabase, subs, {
          title: `📋 ${followups.length} follow-up${followups.length > 1 ? "s" : ""} para hoje`,
          body: `${names}${more} aguardam contato. Toque para iniciar no WhatsApp.`,
          url,
          tag: `followup-today-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 2. Follow-ups ATRASADOS ───────────────────────────────────────────
    if (pref.notify_followup_overdue) {
      let query = supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, next_followup_at")
        .eq("next_followup_status", "PENDENTE")
        .lt("next_followup_at", `${todayIso}T00:00:00`)
        .not("next_followup_at", "is", null)

      if (companyId) query = query.eq("company_id", companyId)
      const { data: overdue } = await query

      if (overdue && overdue.length > 0) {
        const r = await sendPush(supabase, subs, {
          title: `⚠️ ${overdue.length} follow-up${overdue.length > 1 ? "s" : ""} em atraso`,
          body: overdue.slice(0, 3).map((c) => c.full_name.split(" ")[0]).join(", ") + " — toque para conferir",
          url: "/bem-aviv/follow-up",
          tag: `followup-overdue-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 3. ANIVERSARIANTES de hoje (com WhatsApp direto) ───────────────────
    if (pref.notify_birthdays_today) {
      const mm = String(todayBR.getMonth() + 1).padStart(2, "0")
      const dd = String(todayBR.getDate()).padStart(2, "0")

      let cQuery = supabase.from("bem_aviv_clients").select("id, full_name, birth_date, phone_1").not("birth_date", "is", null)
      if (companyId) cQuery = cQuery.eq("company_id", companyId)
      const { data: birthClients } = await cQuery

      const birthdays = (birthClients ?? []).filter((c) => {
        if (!c.birth_date || c.birth_date === "1900-01-01") return false
        const parts = c.birth_date.split("-")
        return parts[1] === mm && parts[2] === dd
      })

      // Familiares
      let rQuery = supabase.from("bem_aviv_client_relatives").select("id, name, birth_date, phone, client_id").not("birth_date", "is", null)
      if (companyId) rQuery = rQuery.eq("company_id", companyId)
      const { data: relBirths } = await rQuery

      const relBirthdays = (relBirths ?? []).filter((r) => {
        if (!r.birth_date || r.birth_date === "1900-01-01") return false
        const parts = r.birth_date.split("-")
        return parts[1] === mm && parts[2] === dd
      })

      const total = birthdays.length + relBirthdays.length

      if (total > 0) {
        const allNames = [
          ...birthdays.map((c) => c.full_name.split(" ")[0]),
          ...relBirthdays.map((r) => r.name.split(" ")[0]),
        ]
        const phones = [...birthdays.map((c) => c.phone_1), ...relBirthdays.map((r) => r.phone)].filter(Boolean)
        const firstPhone = phones[0] ?? ""
        const waUrl = firstPhone
          ? whatsappLink(firstPhone, `Feliz aniversário! 🎂 Que o seu dia seja repleto de realizações, saúde e felicidade!`)
          : "/bem-aviv/clientes"

        const r = await sendPush(supabase, subs, {
          title: `🎂 ${total} aniversariante${total > 1 ? "s" : ""} hoje!`,
          body: allNames.slice(0, 3).join(", ") + (total > 3 ? ` e +${total - 3}` : "") + " — toque para parabenizar no WhatsApp",
          url: waUrl,
          tag: `birthdays-today-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 4. FEEDBACK pós-entrega (3, 10 e 30 dias) ────────────────────────
    const feedbackWindows = [
      { days: 3, enabled: pref.notify_feedback_3d, tag: "feedback-3d", label: "3 dias" },
      { days: 10, enabled: pref.notify_feedback_10d, tag: "feedback-10d", label: "10 dias" },
      { days: 30, enabled: pref.notify_feedback_30d, tag: "feedback-30d", label: "30 dias" },
    ]

    for (const fw of feedbackWindows) {
      if (!fw.enabled) continue

      const targetDate = new Date(todayClean)
      targetDate.setDate(targetDate.getDate() - fw.days)
      const targetIso = targetDate.toISOString().slice(0, 10)

      let ordQuery = supabase
        .from("bem_aviv_sales_orders")
        .select("id, client_id, delivered_at")
        .eq("status", "ENTREGUE")
        .eq("delivered_at", targetIso)

      if (companyId) ordQuery = ordQuery.eq("company_id", companyId)
      const { data: deliveredOrders } = await ordQuery

      if (deliveredOrders && deliveredOrders.length > 0) {
        const clientIds = deliveredOrders.map((o) => o.client_id)
        const { data: feedbackClients } = await supabase
          .from("bem_aviv_clients")
          .select("id, full_name, phone_1")
          .in("id", clientIds)

        const clientMap = new Map((feedbackClients ?? []).map((c) => [c.id, c]))

        for (const order of deliveredOrders) {
          const client = clientMap.get(order.client_id)
          if (!client) continue

          const firstName = client.full_name.split(" ")[0]
          const phone = client.phone_1 ? formatPhone(client.phone_1) : ""
          const waMsg = `Olá ${firstName}, tudo bem? Faz ${fw.label} desde a entrega do seu produto. Como está sendo sua experiência? Se puder nos dar um feedback, agradecemos muito! 😊`
          const waUrl = phone ? whatsappLink(phone, waMsg) : `/bem-aviv/clientes`

          const r = await sendPush(supabase, subs, {
            title: `📦 Feedback ${fw.label} — ${firstName}`,
            body: `Entregue há ${fw.days} dias. Toque para enviar mensagem no WhatsApp.`,
            url: waUrl,
            tag: `${fw.tag}-${order.id}`,
          })
          userSentCount += r.sent
          totalSent += r.sent
        }
      }
    }

    // ── 5. VALIDADE DE GARANTIA DO PRODUTO (30 dias antes) ────────────────
    if (pref.notify_product_expiry_30d) {
      const expiryTarget = new Date(todayClean)
      expiryTarget.setDate(expiryTarget.getDate() + 30)
      const expiryIso = expiryTarget.toISOString().slice(0, 10)

      let expQuery = supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, product_purchase_date, product_warranty_months")
        .not("product_purchase_date", "is", null)

      if (companyId) expQuery = expQuery.eq("company_id", companyId)
      const { data: expiringClients } = await expQuery

      for (const c of expiringClients ?? []) {
        if (!c.product_purchase_date || !c.product_warranty_months) continue
        const purchaseDate = new Date(c.product_purchase_date)
        const expiryDate = new Date(purchaseDate)
        expiryDate.setMonth(expiryDate.getMonth() + c.product_warranty_months)
        const expiryDateIso = cleanDate(expiryDate).toISOString().slice(0, 10)

        if (expiryDateIso !== expiryIso) continue

        const firstName = c.full_name.split(" ")[0]
        const phone = c.phone_1 ? formatPhone(c.phone_1) : ""
        const waMsg = `Olá ${firstName}! A garantia do seu produto vence em 30 dias (${expiryDate.toLocaleDateString("pt-BR")}). Gostaríamos de verificar se você precisa de alguma revisão ou assistência! 😊`
        const waUrl = phone ? whatsappLink(phone, waMsg) : `/bem-aviv/clientes`

        const r = await sendPush(supabase, subs, {
          title: `⏰ Garantia vence em 30 dias — ${firstName}`,
          body: `Vence em ${expiryDate.toLocaleDateString("pt-BR")}. Toque para abrir no WhatsApp.`,
          url: waUrl,
          tag: `expiry-${c.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 6. Se nenhum alerta específico disparou, envia resumo geral da conta ──
    if (userSentCount === 0 && !isForce) {
      // Se era horário agendado, manda um aviso de conferência caso haja follow-ups abertos
      const { count: pendingCount } = await supabase
        .from("bem_aviv_clients")
        .select("id", { count: "exact", head: true })
        .eq("next_followup_status", "PENDENTE")

      if (pendingCount && pendingCount > 0) {
        const r = await sendPush(supabase, subs, {
          title: `🔔 Bem Aviv Hub — Horário de Alerta (${matchingSlot})`,
          body: `Você tem ${pendingCount} follow-up(s) pendente(s) no sistema. Toque para acompanhar!`,
          url: "/bem-aviv/follow-up",
          tag: `reminder-${matchingSlot}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // Registra que o slot de hoje foi executado para este usuário
    if (!isForce && matchingSlot) {
      await supabase.from("push_notification_dispatch_logs").upsert(
        {
          user_id: pref.user_id,
          slot_time: matchingSlot,
          dispatch_date: todayIso,
          sent_count: userSentCount,
        },
        { onConflict: "user_id,slot_time,dispatch_date" },
      )
    }

    report[pref.user_email || pref.user_id] = {
      slot: matchingSlot,
      sent: userSentCount,
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      timeBR: currentTimeStr,
      dateBR: todayIso,
      totalSent,
      report,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
