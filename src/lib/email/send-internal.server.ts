// Server-only internal email sender — mirrors the /lovable/email/transactional/send
// pipeline but is called directly from trusted server code (booking flow, payment
// finalize). No JWT check because the caller already runs server-side with the
// service role.

import * as React from 'react'
import { render } from '@react-email/components'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'Mtoni River Lodge'
const SENDER_DOMAIN = 'notify.mtoniriverlodge.com'
const FROM_DOMAIN = 'notify.mtoniriverlodge.com'
const FROM_LOCAL = 'bookings'

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  return `${local[0]}***@${domain}`
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface SendInternalArgs {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, unknown>
}

export type SendInternalResult =
  | { ok: true; queued: true; messageId: string }
  | { ok: false; reason: 'suppressed' | 'template_not_found' | 'failed'; error?: string }

export async function sendTransactionalInternal(
  args: SendInternalArgs,
): Promise<SendInternalResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  const template = TEMPLATES[args.templateName]
  if (!template) {
    return { ok: false, reason: 'template_not_found' }
  }

  const effectiveRecipient = template.to || args.recipientEmail
  if (!effectiveRecipient) {
    return { ok: false, reason: 'failed', error: 'No recipient' }
  }

  const normalizedEmail = effectiveRecipient.toLowerCase()
  const messageId = crypto.randomUUID()
  const idempotencyKey = args.idempotencyKey || messageId
  const templateData = args.templateData || {}

  // Suppression check (fail-closed)
  const { data: suppressed, error: suppressionError } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (suppressionError) {
    console.error('[email] suppression check failed', {
      error: suppressionError,
      recipient: redactEmail(effectiveRecipient),
    })
    return { ok: false, reason: 'failed', error: 'Suppression check failed' }
  }

  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: args.templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })
    return { ok: false, reason: 'suppressed' }
  }

  // Unsubscribe token (one per email)
  let unsubscribeToken: string
  const { data: existingToken } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    unsubscribeToken = generateToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (!stored) {
      return { ok: false, reason: 'failed', error: 'Token storage failed' }
    }
    unsubscribeToken = stored.token
  } else {
    // Token used but not suppressed — safety fallback
    return { ok: false, reason: 'suppressed' }
  }

  // Render template
  const element = React.createElement(template.component as React.ComponentType<any>, templateData)
  const html = await render(element)
  const plainText = await render(element, { plainText: true })
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // Log pending then enqueue
  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: args.templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <${FROM_LOCAL}@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: args.templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('[email] enqueue failed', { error: enqueueError })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: args.templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return { ok: false, reason: 'failed', error: enqueueError.message }
  }

  return { ok: true, queued: true, messageId }
}