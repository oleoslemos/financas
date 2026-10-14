import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayBR(): Date {
  const now = new Date()
  // Ajusta para fuso horário BRT (UTC-3)
  return new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
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

// ─── Envio de notificação ─────────────────────────────────────────────────────

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

// ─── Handler principal ────────────────────────────────────────────────────────

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
  const today = todayBR()
  const todayClean = cleanDate(today)

  // Suporte a disparo manual de uma notificação específica via POST
  let manualPayload: { title?: string; body?: string; url?: string; userIds?: string[] } = {}
  if (req.method === "POST") {
    try { manualPayload = await req.json() } catch { /* usa padrão */ }
  }

  if (manualPayload.title) {
    // Modo manual: envia para usuários específicos ou todos
    let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth")
    if (manualPayload.userIds?.length) query = query.in("user_id", manualPayload.userIds)
    const { data: subs } = await query
    const result = await sendPush(supabase, subs ?? [], {
      title: manualPayload.title,
      body: manualPayload.body ?? "",
      url: manualPayload.url ?? "/bem-aviv",
    })
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // ─── Modo Automático: busca preferências de todos os usuários ─────────────
  const { data: prefs } = await supabase
    .from("push_notification_preferences")
    .select("*")

  const report: Record<string, number> = {}
  let totalSent = 0

  for (const pref of prefs ?? []) {
    // Busca as inscrições deste usuário
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", pref.user_id)
      .eq("system_source", pref.system_source)

    if (!subs || subs.length === 0) continue

    // Filtra a company_id do usuário a partir de algum recurso dele
    // Usamos o company_id mais recente de seus followups ou clientes
    const { data: memberRow } = await supabase
      .from("company_members")
      .select("company_id")
      .or(`email.eq.${pref.user_email},clerk_user_id.eq.${pref.user_id}`)
      .limit(1)
      .maybeSingle()

    const companyId = memberRow?.company_id

    // ── 1. Follow-ups de HOJE ─────────────────────────────────────────────
    if (pref.notify_followup_today) {
      const todayIso = today.toISOString().slice(0, 10)
      const { data: followups } = await supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, next_followup_at, next_followup_status")
        .eq("company_id", companyId)
        .eq("next_followup_status", "PENDENTE")
        .gte("next_followup_at", `${todayIso}T00:00:00`)
        .lt("next_followup_at", `${todayIso}T23:59:59`)
        .not("full_name", "is", null)

      if (followups && followups.length > 0) {
        const names = followups.slice(0, 3).map((c) => c.full_name.split(" ")[0]).join(", ")
        const more = followups.length > 3 ? ` e mais ${followups.length - 3}` : ""
        const r = await sendPush(supabase, subs, {
          title: `📋 ${followups.length} follow-up${followups.length > 1 ? "s" : ""} para hoje`,
          body: `${names}${more} aguardam contato.`,
          url: "/bem-aviv/follow-up",
          tag: "followup-today",
        })
        totalSent += r.sent
        report["followup_today"] = (report["followup_today"] ?? 0) + r.sent
      }
    }

    // ── 2. Follow-ups ATRASADOS ───────────────────────────────────────────
    if (pref.notify_followup_overdue) {
      const todayIso = today.toISOString().slice(0, 10)
      const { data: overdue } = await supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, next_followup_at")
        .eq("company_id", companyId)
        .eq("next_followup_status", "PENDENTE")
        .lt("next_followup_at", `${todayIso}T00:00:00`)
        .not("next_followup_at", "is", null)

      if (overdue && overdue.length > 0) {
        const r = await sendPush(supabase, subs, {
          title: `⚠️ ${overdue.length} follow-up${overdue.length > 1 ? "s" : ""} em atraso`,
          body: overdue.slice(0, 3).map((c) => c.full_name.split(" ")[0]).join(", ") + " — clique para ver",
          url: "/bem-aviv/follow-up",
          tag: "followup-overdue",
        })
        totalSent += r.sent
        report["followup_overdue"] = (report["followup_overdue"] ?? 0) + r.sent
      }
    }

    // ── 3. ANIVERSARIANTES de hoje ────────────────────────────────────────
    if (pref.notify_birthdays_today) {
      const mm = String(today.getMonth() + 1).padStart(2, "0")
      const dd = String(today.getDate()).padStart(2, "0")

      const { data: birthClients } = await supabase
        .from("bem_aviv_clients")
        .select("id, full_name, birth_date, phone_1")
        .eq("company_id", companyId)
        .not("birth_date", "is", null)

      const birthdays = (birthClients ?? []).filter((c) => {
        if (!c.birth_date || c.birth_date === "1900-01-01") return false
        const parts = c.birth_date.split("-")
        return parts[1] === mm && parts[2] === dd
      })

      // Também verifica familiares
      const { data: relBirths } = await supabase
        .from("bem_aviv_client_relatives")
        .select("id, name, birth_date, phone, client_id")
        .eq("company_id", companyId)
        .not("birth_date", "is", null)

      const relBirthdays = (relBirths ?? []).filter((r) => {
        if (!r.birth_date) return false
        const parts = r.birth_date.split("-")
        return parts[1] === mm && parts[2] === dd && r.birth_date !== "19000-12-07"
      })

      const total = birthdays.length + relBirthdays.length

      if (total > 0) {
        const allNames: string[] = [
          ...birthdays.map((c) => c.full_name.split(" ")[0]),
          ...relBirthdays.map((r) => r.name.split(" ")[0]),
        ]
        const phones = [...birthdays.map((c) => c.phone_1), ...relBirthdays.map((r) => r.phone)].filter(Boolean)
        const firstPhone = phones[0] ?? ""
        const waUrl = firstPhone
          ? whatsappLink(firstPhone, `Feliz aniversário! 🎂 Que seu dia seja muito especial!`)
          : "/bem-aviv/clientes"

        const r = await sendPush(supabase, subs, {
          title: `🎂 ${total} aniversariante${total > 1 ? "s" : ""} hoje!`,
          body: allNames.slice(0, 3).join(", ") + (total > 3 ? ` e +${total - 3}` : "") + " — toque para parabenizar no WhatsApp",
          url: waUrl,
          tag: "birthdays-today",
        })
        totalSent += r.sent
        report["birthdays_today"] = (report["birthdays_today"] ?? 0) + r.sent
      }
    }

    // ── 4. ANIVERSARIANTES nos próximos 3 dias ────────────────────────────
    if (pref.notify_birthdays_upcoming) {
      const upcoming: Array<{ name: string; daysUntil: number; phone: string }> = []

      const { data: allClients } = await supabase
        .from("bem_aviv_clients")
        .select("full_name, birth_date, phone_1")
        .eq("company_id", companyId)
        .not("birth_date", "is", null)

      for (const c of allClients ?? []) {
        if (!c.birth_date || c.birth_date === "1900-01-01") continue
        const parts = c.birth_date.split("-")
        const thisYear = new Date(today.getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const diff = Math.round((cleanDate(thisYear).getTime() - todayClean.getTime()) / 86400000)
        if (diff > 0 && diff <= 3) {
          upcoming.push({ name: c.full_name.split(" ")[0], daysUntil: diff, phone: c.phone_1 ?? "" })
        }
      }

      if (upcoming.length > 0) {
        const label = upcoming.map((u) => `${u.name} (em ${u.daysUntil}d)`).slice(0, 3).join(", ")
        const r = await sendPush(supabase, subs, {
          title: `🎁 ${upcoming.length} aniversário${upcoming.length > 1 ? "s" : ""} nos próximos 3 dias`,
          body: label,
          url: "/bem-aviv/clientes",
          tag: "birthdays-upcoming",
        })
        totalSent += r.sent
        report["birthdays_upcoming"] = (report["birthdays_upcoming"] ?? 0) + r.sent
      }
    }

    // ── 5. FEEDBACK pós-entrega (3, 10 e 30 dias) ────────────────────────
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

      const { data: deliveredOrders } = await supabase
        .from("bem_aviv_sales_orders")
        .select("id, client_id, delivered_at")
        .eq("company_id", companyId)
        .eq("status", "ENTREGUE")
        .eq("delivered_at", targetIso)

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
          const waMsg = `Olá ${firstName}, tudo bem? Faz ${fw.label} desde a entrega do seu produto. Gostaríamos de saber como está sua experiência. Podemos conversar? 😊`
          const waUrl = phone ? whatsappLink(phone, waMsg) : `/bem-aviv/clientes`

          await sendPush(supabase, subs, {
            title: `📦 Feedback ${fw.label} — ${firstName}`,
            body: `Pedido entregue há ${fw.days} dias. Toque para enviar feedback pelo WhatsApp.`,
            url: waUrl,
            tag: `${fw.tag}-${order.id}`,
          })
          totalSent++
        }
        report[fw.tag] = (report[fw.tag] ?? 0) + deliveredOrders.length
      }
    }

    // ── 6. VALIDADE DE GARANTIA DO PRODUTO (30 dias antes do vencimento) ──
    if (pref.notify_product_expiry_30d) {
      const expiryTarget = new Date(todayClean)
      expiryTarget.setDate(expiryTarget.getDate() + 30)
      const expiryIso = expiryTarget.toISOString().slice(0, 10)

      // Clientes com product_purchase_date + warranty_months onde vencimento = hoje + 30d
      const { data: expiringClients } = await supabase
        .from("bem_aviv_clients")
        .select("id, full_name, phone_1, product_purchase_date, product_warranty_months")
        .eq("company_id", companyId)
        .not("product_purchase_date", "is", null)

      for (const c of expiringClients ?? []) {
        if (!c.product_purchase_date || !c.product_warranty_months) continue
        const purchaseDate = new Date(c.product_purchase_date)
        const expiryDate = new Date(purchaseDate)
        expiryDate.setMonth(expiryDate.getMonth() + c.product_warranty_months)
        const expiryDateIso = cleanDate(expiryDate).toISOString().slice(0, 10)

        if (expiryDateIso !== expiryIso) continue

        const firstName = c.full_name.split(" ")[0]
        const phone = c.phone_1 ? formatPhone(c.phone_1) : ""
        const waMsg = `Olá ${firstName}! A garantia do seu produto vence em 30 dias (${expiryDate.toLocaleDateString("pt-BR")}). Que tal agendar uma revisão? 😊`
        const waUrl = phone ? whatsappLink(phone, waMsg) : `/bem-aviv/clientes`

        await sendPush(supabase, subs, {
          title: `⏰ Garantia vence em 30 dias — ${firstName}`,
          body: `Vence em ${expiryDate.toLocaleDateString("pt-BR")}. Toque para contatar pelo WhatsApp.`,
          url: waUrl,
          tag: `expiry-${c.id}`,
        })
        totalSent++
        report["product_expiry_30d"] = (report["product_expiry_30d"] ?? 0) + 1
      }
    }

    // ── 7. Pedidos pendentes de entrega ───────────────────────────────────
    if (pref.notify_orders_pending) {
      const { data: pending } = await supabase
        .from("bem_aviv_sales_orders")
        .select("id, client_id, expected_arrival_date, status")
        .eq("company_id", companyId)
        .in("status", ["CONFIRMADO", "EM_PRODUCAO", "PRONTO_PARA_ENTREGA"])

      if (pending && pending.length > 0) {
        const overdueDelivery = pending.filter((o) => {
          if (!o.expected_arrival_date) return false
          return diffDays(o.expected_arrival_date, today) < 0
        })

        if (overdueDelivery.length > 0) {
          const r = await sendPush(supabase, subs, {
            title: `🚚 ${overdueDelivery.length} pedido${overdueDelivery.length > 1 ? "s" : ""} com entrega atrasada`,
            body: "Clique para ver os pedidos em aberto",
            url: "/bem-aviv/pedidos",
            tag: "orders-overdue-delivery",
          })
          totalSent += r.sent
          report["orders_pending"] = (report["orders_pending"] ?? 0) + r.sent
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ success: true, totalSent, report }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
