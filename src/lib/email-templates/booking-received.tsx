import * as React from 'react'
import { Heading, Hr, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { Shell, Row, money, guestsLine, styles, type BookingEmailProps } from './_shared'

const Email = (props: BookingEmailProps) => {
  const {
    reference = 'MRL-XXXXXX',
    guestName = 'Guest',
    roomName,
    checkIn = '',
    checkOut = '',
    nights = 1,
    adults = 1,
    children = 0,
    total,
    deposit,
    taxes,
    paymentMethod = 'online',
    currency = 'USD',
  } = props
  const payAtProperty = paymentMethod === 'pay_at_property'
  return (
    <Shell preheader={payAtProperty ? `Your reservation ${reference} is received; payment is due at the property.` : `Your reservation ${reference} is held pending payment.`}>
      <Heading as="h1" style={styles.h1}>
        Karibu, {guestName}
      </Heading>
      <Text style={styles.p}>
        We've received your reservation request for <strong>Mtoni River Lodge</strong>. {payAtProperty
          ? 'Our reservations team will review and confirm your stay. Payment is due directly at the property on arrival.'
          : 'Your booking is held pending payment of the deposit. Once the deposit clears we will send your full confirmation.'}
      </Text>
      <Hr style={styles.divider} />
      <Row label="Reference" value={reference} />
      {roomName ? <Row label="Room" value={roomName} /> : null}
      <Row label="Check-in" value={checkIn} />
      <Row label="Check-out" value={checkOut} />
      <Row label="Nights" value={String(nights)} />
      <Row label="Guests" value={guestsLine(adults, children)} />
      {taxes !== undefined && Number(taxes) > 0 ? <Row label="Taxes included in total" value={money(taxes, currency)} /> : null}
      {total !== undefined ? <Row label="Total" value={money(total, currency)} /> : null}
      {payAtProperty ? <Row label="Payment due at property" value={money(total, currency)} /> : deposit !== undefined ? <Row label="Deposit due" value={money(deposit, currency)} /> : null}
      <Row label="Payment method" value={payAtProperty ? 'Pay at property' : 'Online payment'} />
      <Hr style={styles.divider} />
      <Text style={styles.p}>
        {payAtProperty ? 'Please keep this reference for your arrival. Replies to this email reach our reservations team directly.' : "If you haven't completed payment yet, you can resume from your booking link. Replies to this email reach our reservations team directly."}
      </Text>
      <Text style={styles.signoff}>— The Mtoni River Lodge Reservations Team</Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Mtoni River Lodge — Reservation received (${data.reference ?? ''})`.trim(),
  displayName: 'Booking Received',
  previewData: {
    reference: 'MRL-AB1234',
    guestName: 'Amani Mollel',
    roomName: 'Riverfront Deluxe',
    checkIn: '2026-03-12',
    checkOut: '2026-03-15',
    nights: 3,
    adults: 2,
    children: 1,
    total: 930,
    deposit: 279,
    currency: 'USD',
  } as BookingEmailProps,
} satisfies TemplateEntry