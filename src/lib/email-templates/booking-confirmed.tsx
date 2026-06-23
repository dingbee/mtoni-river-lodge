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
    balance,
    currency = 'USD',
  } = props
  return (
    <Shell preheader={`Your booking ${reference} is confirmed.`}>
      <Heading as="h1" style={styles.h1}>
        Your stay is confirmed
      </Heading>
      <Text style={styles.p}>
        Asante sana, {guestName}. We've received your deposit and your reservation at{' '}
        <strong>Mtoni River Lodge</strong> is confirmed. We can't wait to welcome you to the river.
      </Text>
      <Hr style={styles.divider} />
      <Row label="Reference" value={reference} />
      {roomName ? <Row label="Room" value={roomName} /> : null}
      <Row label="Check-in" value={checkIn} />
      <Row label="Check-out" value={checkOut} />
      <Row label="Nights" value={String(nights)} />
      <Row label="Guests" value={guestsLine(adults, children)} />
      {total !== undefined ? <Row label="Total" value={money(total, currency)} /> : null}
      {deposit !== undefined ? <Row label="Deposit paid" value={money(deposit, currency)} /> : null}
      {balance !== undefined ? (
        <Row label="Balance on arrival" value={money(balance, currency)} />
      ) : null}
      <Hr style={styles.divider} />
      <Text style={styles.p}>
        Please reply to this email with arrival time and any special requests. If you'd like to add
        an airport transfer or an experience, just let us know — we'll also share your invoice on
        request.
      </Text>
      <Text style={styles.signoff}>— The Mtoni River Lodge Reservations Team</Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Mtoni River Lodge — Booking confirmed (${data.reference ?? ''})`.trim(),
  displayName: 'Booking Confirmed',
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
    balance: 651,
    currency: 'USD',
  } as BookingEmailProps,
} satisfies TemplateEntry