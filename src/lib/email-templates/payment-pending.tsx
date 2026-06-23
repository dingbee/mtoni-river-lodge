import * as React from 'react'
import { Heading, Hr, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { Shell, Row, money, styles, type BookingEmailProps } from './_shared'

const Email = (props: BookingEmailProps) => {
  const { reference = '', guestName = 'Guest', balance, currency = 'USD', checkIn } = props
  return (
    <Shell preheader={`Payment pending for ${reference}`}>
      <Heading as="h1" style={styles.h1}>Payment reminder</Heading>
      <Text style={styles.p}>
        Karibu, {guestName}. We're holding your reservation {reference} but haven't yet received
        your deposit. Please complete payment so we can confirm your stay.
      </Text>
      <Hr style={styles.divider} />
      <Row label="Reference" value={reference} />
      {checkIn ? <Row label="Check-in" value={checkIn} /> : null}
      {balance !== undefined ? <Row label="Balance due" value={money(balance, currency)} /> : null}
      <Hr style={styles.divider} />
      <Text style={styles.p}>
        Reply to this email if you'd like a fresh payment link or have any questions.
      </Text>
      <Text style={styles.signoff}>— Mtoni River Lodge Reservations</Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Payment pending — Mtoni River Lodge (${d.reference ?? ''})`.trim(),
  displayName: 'Payment Pending',
  previewData: { reference: 'MRL-AB1234', guestName: 'Amani', balance: 651, currency: 'USD', checkIn: '2026-03-12' },
} satisfies TemplateEntry