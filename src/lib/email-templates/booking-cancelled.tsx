import * as React from 'react'
import { Heading, Hr, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { Shell, Row, styles, type BookingEmailProps } from './_shared'

const Email = (props: BookingEmailProps) => {
  const { reference = '', guestName = 'Guest', checkIn, checkOut } = props
  return (
    <Shell preheader={`Booking ${reference} cancelled`}>
      <Heading as="h1" style={styles.h1}>Your booking is cancelled</Heading>
      <Text style={styles.p}>
        Hello {guestName}, we've cancelled reservation {reference} as requested. If this was a
        mistake or you'd like to rebook, simply reply to this email and we'll take care of it.
      </Text>
      <Hr style={styles.divider} />
      <Row label="Reference" value={reference} />
      {checkIn ? <Row label="Check-in" value={checkIn} /> : null}
      {checkOut ? <Row label="Check-out" value={checkOut} /> : null}
      <Text style={styles.signoff}>— Mtoni River Lodge Reservations</Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Booking cancelled — Mtoni River Lodge (${d.reference ?? ''})`.trim(),
  displayName: 'Booking Cancelled',
  previewData: { reference: 'MRL-AB1234', guestName: 'Amani', checkIn: '2026-03-12', checkOut: '2026-03-15' },
} satisfies TemplateEntry