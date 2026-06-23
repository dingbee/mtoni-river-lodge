import * as React from 'react'
import { Heading, Hr, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { Shell, Row, money, styles, type BookingEmailProps } from './_shared'

const Email = (props: BookingEmailProps) => {
  const { reference = '', guestName = 'Guest', total, deposit, balance, currency = 'USD' } = props
  return (
    <Shell preheader={`Payment received for ${reference}`}>
      <Heading as="h1" style={styles.h1}>Payment received</Heading>
      <Text style={styles.p}>
        Asante, {guestName}. We've received your payment and your reservation {reference} is fully
        confirmed. We can't wait to welcome you to the river.
      </Text>
      <Hr style={styles.divider} />
      <Row label="Reference" value={reference} />
      {total !== undefined ? <Row label="Total" value={money(total, currency)} /> : null}
      {deposit !== undefined ? <Row label="Paid" value={money(deposit, currency)} /> : null}
      {balance !== undefined ? <Row label="Balance on arrival" value={money(balance, currency)} /> : null}
      <Text style={styles.signoff}>— Mtoni River Lodge Reservations</Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Payment received — Mtoni River Lodge (${d.reference ?? ''})`.trim(),
  displayName: 'Payment Received',
  previewData: { reference: 'MRL-AB1234', guestName: 'Amani', total: 930, deposit: 930, balance: 0, currency: 'USD' },
} satisfies TemplateEntry