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
    currency = 'USD',
  } = props
  return (
    <Shell preheader={`Your reservation ${reference} is held pending payment.`}>
      <Heading as="h1" style={styles.h1}>
        Karibu, {guestName}
      </Heading>
      <Text style={styles.p}>
        We've received your reservation request for <strong>Mtoni River Lodge</strong>. Your
        booking is held pending payment of the deposit. Once the deposit clears we'll send your
        full confirmation.
      </Text>
      <Hr style={styles.divider} />
      <Row label="Reference" value={reference} />
      {roomName ? <Row label="Room" value={roomName} /> : null}
      <Row label="Check-in" value={checkIn} />
      <Row label="Check-out" value={checkOut} />
      <Row label="Nights" value={String(nights)} />
      <Row label="Guests" value={guestsLine(adults, children)} />
      {total !== undefined ? <Row label="Total" value={money(total, currency)} /> : null}
      {deposit !== undefined ? <Row label="Deposit due" value={money(deposit, currency)} /> : null}
      <Hr style={styles.divider} />
      <Text style={styles.p}>
        If you haven't completed payment yet, you can resume from your booking link. Replies to
        this email reach our reservations team directly.
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