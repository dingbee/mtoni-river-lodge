// Server-only Twilio WhatsApp sender. Logs to whatsapp_alerts with idempotency.
// Gracefully no-ops (logs `skipped`) when credentials are not configured so that
// booking flow never fails because WhatsApp is missing.

const GATEWAY = 'https://connector-gateway.lovable.dev/twilio'

export interface SendWhatsAppArgs {
  bookingId: string
  eventType: string
  message: string
  idempotencyKey: string
}

export async function sendStaffWhatsApp(args: SendWhatsAppArgs): Promise<{
  ok: boolean
  reason?: string
  sid?: string
}> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  // Idempotency: skip if we've already logged this key
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_alerts')
    .select('id, status, provider_sid')
    .eq('idempotency_key', args.idempotencyKey)
    .maybeSingle()
  if (existing && existing.status === 'sent') {
    return { ok: true, reason: 'duplicate', sid: existing.provider_sid ?? undefined }
  }

  const lovableKey = process.env.LOVABLE_API_KEY
  const twilioKey = process.env.TWILIO_API_KEY
  const from = process.env.WHATSAPP_FROM // e.g. 'whatsapp:+14155238886'
  const toList = (process.env.WHATSAPP_STAFF_TO || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!lovableKey || !twilioKey || !from || toList.length === 0) {
    await supabaseAdmin.from('whatsapp_alerts').upsert(
      {
        booking_id: args.bookingId,
        event_type: args.eventType,
        idempotency_key: args.idempotencyKey,
        to_number: toList.join(',') || 'unconfigured',
        message: args.message,
        status: 'skipped',
        error_message: 'WhatsApp credentials not configured',
      },
      { onConflict: 'idempotency_key' },
    )
    return { ok: false, reason: 'not_configured' }
  }

  let lastSid: string | undefined
  let anyError: string | undefined

  for (const rawTo of toList) {
    const to = rawTo.startsWith('whatsapp:') ? rawTo : `whatsapp:${rawTo}`
    try {
      const body = new URLSearchParams({ From: from, To: to, Body: args.message })
      const res = await fetch(`${GATEWAY}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': twilioKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
      const json: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        anyError = `[${res.status}] ${JSON.stringify(json)}`
        console.error('[whatsapp] send failed', { to, error: anyError })
        continue
      }
      lastSid = json.sid
    } catch (e: any) {
      anyError = e?.message ?? String(e)
      console.error('[whatsapp] exception', { to, error: anyError })
    }
  }

  const status = lastSid ? 'sent' : 'failed'
  await supabaseAdmin.from('whatsapp_alerts').upsert(
    {
      booking_id: args.bookingId,
      event_type: args.eventType,
      idempotency_key: args.idempotencyKey,
      to_number: toList.join(','),
      message: args.message,
      status,
      provider_sid: lastSid,
      error_message: anyError,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    },
    { onConflict: 'idempotency_key' },
  )

  return { ok: status === 'sent', sid: lastSid, reason: status === 'sent' ? undefined : anyError }
}