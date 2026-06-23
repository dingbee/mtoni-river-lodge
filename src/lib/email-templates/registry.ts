import type { ComponentType } from 'react'
import { template as bookingReceived } from './booking-received'
import { template as bookingConfirmed } from './booking-confirmed'
import { template as paymentPending } from './payment-pending'
import { template as paymentReceived } from './payment-received'
import { template as bookingCancelled } from './booking-cancelled'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'booking-received': bookingReceived,
  'booking-confirmed': bookingConfirmed,
  'payment-pending': paymentPending,
  'payment-received': paymentReceived,
  'booking-cancelled': bookingCancelled,
}
