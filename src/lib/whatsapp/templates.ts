// Plain-text WhatsApp message builders. Keep under 1000 chars each.

export interface BookingSnapshot {
  reference: string
  guest_name: string
  room_name?: string | null
  check_in: string
  check_out: string
  status: string
  payment_status: string
  total: number | string
  currency: string
  balance_amount: number | string
  guest_type: string
  guest_phone?: string | null
}

function header(b: BookingSnapshot) {
  const flag =
    b.guest_type === 'vip' ? '⭐ VIP' : b.guest_type === 'climber' ? '🏔 CLIMBER' : ''
  return `🏨 MTONI RIVER LODGE OPS ALERT${flag ? ` — ${flag}` : ''}`
}

function lines(b: BookingSnapshot, action: string, extra?: string[]) {
  return [
    header(b),
    '',
    `Guest: ${b.guest_name}`,
    `Room:  ${b.room_name ?? '—'}`,
    `Ref:   ${b.reference}`,
    `Stay:  ${b.check_in} → ${b.check_out}`,
    `Total: ${b.currency} ${b.total}`,
    ...(extra ?? []),
    '',
    `Action: ${action}`,
  ].join('\n')
}

export function newBookingMsg(b: BookingSnapshot) {
  return lines(b, 'Confirm payment within 24h.')
}
export function paymentPendingMsg(b: BookingSnapshot) {
  return lines(b, `Follow up — balance ${b.currency} ${b.balance_amount}.`)
}
export function paymentReceivedMsg(b: BookingSnapshot) {
  return lines(b, 'Assign room and confirm with guest.')
}
export function bookingCancelledMsg(b: BookingSnapshot) {
  return lines(b, 'Release inventory and notify housekeeping.')
}
export function checkInTodayMsg(b: BookingSnapshot) {
  return lines(b, 'Prepare welcome and meet on arrival.')
}
export function vipPriorityMsg(b: BookingSnapshot) {
  return lines(b, 'HIGH PRIORITY — VIP / Climber. Assign owner.')
}

export function morningDigest(items: BookingSnapshot[]) {
  if (items.length === 0) {
    return '🏨 MTONI RIVER LODGE — Morning digest\n\nNo arrivals today.'
  }
  const vipCount = items.filter((b) => b.guest_type !== 'standard').length
  const rows = items
    .map(
      (b) =>
        `• ${b.guest_name} — ${b.room_name ?? '—'} (${b.reference})${
          b.guest_type !== 'standard' ? `  [${b.guest_type.toUpperCase()}]` : ''
        }`,
    )
    .join('\n')
  return `🏨 MTONI RIVER LODGE — Morning digest\n\nArrivals today: ${items.length}${
    vipCount ? `  (${vipCount} priority)` : ''
  }\n\n${rows}`
}