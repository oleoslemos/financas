import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowInBR(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
}

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(":")) return -1
  const [h, m] = timeStr.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return -1
  return h * 60 + m
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
    let scheduleTimes: string[] = []
    if (Array.isArray(pref.schedule_times) && pref.schedule_times.length > 0) {
      scheduleTimes = pref.schedule_times
    } else {
      const mStr = `${String(pref.morning_hour ?? 8).padStart(2, "0")}:${String(pref.morning_minute ?? 0).padStart(2, "0")}`
      scheduleTimes.push(mStr)
      if (pref.evening_enabled) {
        const eStr = `${String(pref.evening_hour ?? 18).padStart(2, "0")}:${String(pref.evening_minute ?? 0).padStart(2, "0")}`
        scheduleTimes.push(eStr)
      }
    }

    let matchingSlot: string | null = null
    if (isForce) {
      matchingSlot = scheduleTimes[0] || "manual"
    } else {
      for (const slot of scheduleTimes) {
        const slotMins = timeStringToMinutes(slot)
        if (slotMins < 0) continue
        if (currentMinutes >= slotMins && currentMinutes <= slotMins + 9) {
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

    if (!matchingSlot) continue

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", pref.user_id)
      .eq("system_source", pref.system_source)

    if (!subs || subs.length === 0) continue

    const { data: memberRow } = await supabase
      .from("company_members")
      .select("company_id")
      .or(`email.eq.${pref.user_email},clerk_user_id.eq.${pref.user_id}`)
      .limit(1)
      .maybeSingle()

    const companyId = memberRow?.company_id
    let userSentCount = 0

    // ── 1. Follow-ups de HOJE (ITEM POR ITEM com WhatsApp direto) ────────
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

      for (const f of followups ?? []) {
        const firstName = f.full_name.trim().split(" ")[0]
        const phone = f.phone_1 ? formatPhone(f.phone_1) : ""
        const waMsg = `Olá ${firstName}, tudo bem? Aqui é da Bem Aviv. Gostaria de dar seguimento ao nosso contato combinado para hoje!`
        const url = phone ? whatsappLink(phone, waMsg) : "/bem-aviv/follow-up"

        const r = await sendPush(supabase, subs, {
          title: `📋 Follow-up Hoje: ${f.full_name}`,
          body: phone ? `Toque para falar com ${firstName} no WhatsApp agora` : `Agendado para hoje. Toque para abrir`,
          url,
          tag: `fu-today-${f.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 2. Follow-ups ATRASADOS (ITEM POR ITEM com WhatsApp direto) ───────
    if (pref.notify_followup_overdue) {
      let query = supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, next_followup_at")
        .eq("next_followup_status", "PENDENTE")
        .lt("next_followup_at", `${todayIso}T00:00:00`)
        .not("next_followup_at", "is", null)

      if (companyId) query = query.eq("company_id", companyId)
      const { data: overdue } = await query

      for (const o of overdue ?? []) {
        const firstName = o.full_name.trim().split(" ")[0]
        const phone = o.phone_1 ? formatPhone(o.phone_1) : ""
        const waMsg = `Olá ${firstName}, tudo bem? Estou entrando em contato para darmos continuidade ao seu atendimento!`
        const url = phone ? whatsappLink(phone, waMsg) : "/bem-aviv/follow-up"

        const r = await sendPush(supabase, subs, {
          title: `⚠️ Follow-up Atrasado: ${o.full_name}`,
          body: phone ? `Pendente. Toque para iniciar conversa no WhatsApp` : `Contato pendente. Toque para abrir`,
          url,
          tag: `fu-overdue-${o.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 3. ANIVERSARIANTES DE HOJE (ITEM POR ITEM com WhatsApp direto) ───
    if (pref.notify_birthdays_today) {
      const mm = String(todayBR.getMonth() + 1).padStart(2, "0")
      const dd = String(todayBR.getDate()).padStart(2, "0")

      // Clientes
      let cQuery = supabase.from("bem_aviv_clients").select("id, full_name, birth_date, phone_1").not("birth_date", "is", null)
      if (companyId) cQuery = cQuery.eq("company_id", companyId)
      const { data: birthClients } = await cQuery

      const birthdays = (birthClients ?? []).filter((c) => {
        if (!c.birth_date || c.birth_date === "1900-01-01") return false
        const parts = c.birth_date.split("-")
        return parts[1] === mm && parts[2] === dd
      })

      for (const b of birthdays) {
        const firstName = b.full_name.trim().split(" ")[0]
        const phone = b.phone_1 ? formatPhone(b.phone_1) : ""
        const waMsg = `Parabéns ${firstName}! 🎂 Desejo a você um feliz aniversário, muita saúde, paz e conquistas!`
        const url = phone ? whatsappLink(phone, waMsg) : "/bem-aviv/clientes"

        const r = await sendPush(supabase, subs, {
          title: `🎂 Aniversário Hoje: ${b.full_name}`,
          body: phone ? `Toque para parabenizar ${firstName} no WhatsApp agora!` : `Aniversariante de hoje!`,
          url,
          tag: `bday-client-${b.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }

      // Familiares
      let rQuery = supabase.from("bem_aviv_client_relatives").select("id, name, birth_date, phone, relationship, client_id").not("birth_date", "is", null)
      if (companyId) rQuery = rQuery.eq("company_id", companyId)
      const { data: relBirths } = await rQuery

      const relBirthdays = (relBirths ?? []).filter((r) => {
        if (!r.birth_date || r.birth_date === "1900-01-01") return false
        const parts = r.birth_date.split("-")
        return parts[1] === mm && parts[2] === dd
      })

      for (const rb of relBirthdays) {
        const firstName = rb.name.trim().split(" ")[0]
        const phone = rb.phone ? formatPhone(rb.phone) : ""
        const waMsg = `Parabéns ${firstName}! 🎂 Que seu dia seja muito especial e repleto de felicidades!`
        const url = phone ? whatsappLink(phone, waMsg) : "/bem-aviv/clientes"

        const r = await sendPush(supabase, subs, {
          title: `🎂 Aniversário Hoje: ${rb.name} (${rb.relationship || "Familiar"})`,
          body: phone ? `Toque para parabenizar no WhatsApp!` : `Familiar aniversariante hoje`,
          url,
          tag: `bday-rel-${rb.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 4. FEEDBACK PÓS-ENTREGA (ITEM POR ITEM com WhatsApp direto) ───────
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

          const firstName = client.full_name.trim().split(" ")[0]
          const phone = client.phone_1 ? formatPhone(client.phone_1) : ""
          const waMsg = `Olá ${firstName}, tudo bem? Faz ${fw.label} desde a entrega do seu produto. Como está sendo sua experiência? Gostaríamos muito de saber! 😊`
          const waUrl = phone ? whatsappLink(phone, waMsg) : `/bem-aviv/clientes`

          const r = await sendPush(supabase, subs, {
            title: `📦 Feedback ${fw.label}: ${client.full_name}`,
            body: phone ? `Entregue há ${fw.days} dias. Toque para pedir feedback no WhatsApp` : `Entregue há ${fw.days} dias.`,
            url: waUrl,
            tag: `${fw.tag}-${order.id}-${todayIso}`,
          })
          userSentCount += r.sent
          totalSent += r.sent
        }
      }
    }

    // ── 5. VALIDADE DE GARANTIA DO PRODUTO (ITEM POR ITEM com WhatsApp) ───
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

        const firstName = c.full_name.trim().split(" ")[0]
        const phone = c.phone_1 ? formatPhone(c.phone_1) : ""
        const waMsg = `Olá ${firstName}! A garantia do seu produto vence em 30 dias (${expiryDate.toLocaleDateString("pt-BR")}). Gostaríamos de saber se precisa de alguma revisão ou assistência! 😊`
        const waUrl = phone ? whatsappLink(phone, waMsg) : `/bem-aviv/clientes`

        const r = await sendPush(supabase, subs, {
          title: `⏰ Garantia Vence em 30d: ${c.full_name}`,
          body: `Vence em ${expiryDate.toLocaleDateString("pt-BR")}. Toque para abrir no WhatsApp`,
          url: waUrl,
          tag: `expiry-30d-${c.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // ── 6. PEDIDOS COM ENTREGA ATRASADA (ITEM POR ITEM) ───────────────────
    if (pref.notify_orders_pending) {
      let pQuery = supabase
        .from("bem_aviv_sales_orders")
        .select("id, client_id, document_number, expected_arrival_date, status")
        .in("status", ["CONFIRMADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA"])

      if (companyId) pQuery = pQuery.eq("company_id", companyId)
      const { data: pending } = await pQuery

      const overdueOrders = (pending ?? []).filter((o) => {
        if (!o.expected_arrival_date) return false
        return o.expected_arrival_date < todayIso
      })

      for (const ord of overdueOrders) {
        const docNum = ord.document_number ? `#${ord.document_number}` : `#${ord.id.slice(0, 6)}`
        const r = await sendPush(supabase, subs, {
          title: `🚚 Entrega Atrasada: Pedido ${docNum}`,
          body: `Previsão era ${ord.expected_arrival_date}. Toque para abrir pedidos`,
          url: "/bem-aviv/pedidos",
          tag: `order-overdue-${ord.id}-${todayIso}`,
        })
        userSentCount += r.sent
        totalSent += r.sent
      }
    }

    // Registra o disparo do slot para evitar repetição no mesmo dia
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
