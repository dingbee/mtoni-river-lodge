import * as React from 'react'
import { Heading, Hr, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { Shell, Row, styles } from './_shared'

interface ReceiptLine {
  description: string
  quantity: number
  amount: string
}

interface Props {
  receiptNumber?: string
  outlet?: string | null
  issuedAt?: string | null
  total?: string
  paid?: string
  paymentStatus?: string
  lines?: ReceiptLine[]
  receiptUrl?: string | null
}

const Email = (props: Props) => {
  const {
    receiptNumber = '',
    outlet,
    issuedAt,
    total = '',
    paid = '',
    paymentStatus = 'Paid in full',
    lines = [],
    receiptUrl,
  } = props
  return (
    <Shell preheader={`Your receipt ${receiptNumber}`}>
      <Heading as="h1" style={styles.h1}>Your receipt</Heading>
      <Text style={styles.p}>
        Thank you for dining with us{outlet ? ` at ${outlet}` : ''}. Your receipt {receiptNumber} is below —
        this is a copy of the document issued at payment and its figures never change.
      </Text>
      <Hr style={styles.divider} />
      <Row label="Receipt" value={receiptNumber} />
      {outlet ? <Row label="Outlet" value={outlet} /> : null}
      {issuedAt ? <Row label="Issued" value={String(issuedAt).replace('T', ' ').slice(0, 16)} /> : null}
      <Row label="Total" value={total} />
      <Row label="Paid" value={paid} />
      <Row label="Status" value={paymentStatus} />
      {lines.length > 0 ? <Hr style={styles.divider} /> : null}
      {lines.map((l, i) => (
        <Row key={`${l.description}-${i}`} label={`${l.quantity} × ${l.description}`} value={l.amount} />
      ))}
      {receiptUrl ? (
        <Text style={styles.p}>
          View or download your receipt: <a href={receiptUrl}>{receiptUrl}</a>
        </Text>
      ) : null}
      <Text style={styles.signoff}>— Mtoni River Lodge</Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Your receipt ${d.receiptNumber ?? ''} — Mtoni River Lodge`.trim(),
  displayName: 'Restaurant Receipt',
  previewData: {
    receiptNumber: 'RCP-2026-000318',
    outlet: 'River Terrace',
    issuedAt: '2026-08-08T19:22:00Z',
    total: 'TZS 84,000.00',
    paid: 'TZS 84,000.00',
    paymentStatus: 'Paid in full',
    lines: [{ description: 'Grilled tilapia', quantity: 2, amount: 'TZS 54,000.00' }],
  },
} satisfies TemplateEntry