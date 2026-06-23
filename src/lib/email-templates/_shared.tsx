import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

const BRAND = '#2f5d3a'
const ACCENT = '#c79a4b'

export const styles = {
  main: {
    backgroundColor: '#ffffff',
    fontFamily: 'Georgia, "Times New Roman", serif',
    color: '#2b2b2b',
    margin: 0,
    padding: 0,
  },
  outer: { backgroundColor: '#f6f3ee', padding: '24px 0' },
  container: {
    maxWidth: '600px',
    backgroundColor: '#ffffff',
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    margin: '0 auto',
  },
  header: {
    backgroundColor: BRAND,
    padding: '28px 32px',
    color: '#ffffff',
    textAlign: 'center' as const,
  },
  brand: {
    fontSize: '22px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    margin: 0,
    color: '#ffffff',
  },
  location: {
    fontSize: '12px',
    opacity: 0.85,
    marginTop: '4px',
    letterSpacing: '1px',
    color: '#ffffff',
  },
  body: { padding: '32px' },
  h1: { margin: '0 0 8px', fontSize: '24px', color: BRAND },
  p: { margin: '0 0 18px', lineHeight: 1.6, color: '#444', fontSize: '15px' },
  footer: {
    backgroundColor: '#fafaf7',
    padding: '20px 32px',
    borderTop: '1px solid #eee',
    fontSize: '12px',
    color: '#777',
    textAlign: 'center' as const,
  },
  link: { color: ACCENT, textDecoration: 'none' },
  label: {
    color: '#777',
    fontSize: '13px',
    padding: '6px 0',
    margin: 0,
    width: '40%',
    display: 'inline-block',
  },
  value: {
    color: '#2b2b2b',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    padding: '6px 0',
    margin: 0,
    display: 'inline-block',
  },
  divider: { borderColor: '#eee', margin: '8px 0 20px' },
  signoff: { margin: '24px 0 0', color: '#777', fontSize: '13px' },
}

export function money(amount: number | string | undefined, currency: string): string {
  if (amount === undefined || amount === null) return '—'
  const n = Number(amount)
  if (!isFinite(n)) return `${amount} ${currency}`
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ borderBottom: '1px solid #f3f0ea', padding: '4px 0' }}>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={{ color: '#777', fontSize: '13px', padding: '6px 0', width: '45%' }}>
            {label}
          </td>
          <td style={{ color: '#2b2b2b', fontSize: '14px', fontWeight: 'bold', padding: '6px 0' }}>
            {value}
          </td>
        </tr>
      </table>
    </Section>
  )
}

export function Shell({
  preheader,
  children,
}: {
  preheader: string
  children: React.ReactNode
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={styles.main}>
        <Section style={styles.outer}>
          <Container style={styles.container}>
            <Section style={styles.header}>
              <Heading as="h1" style={styles.brand}>
                Mtoni River Lodge
              </Heading>
              <Text style={styles.location}>ARUSHA · TANZANIA</Text>
            </Section>
            <Section style={styles.body}>{children}</Section>
            <Section style={styles.footer}>
              <Text style={{ margin: 0, color: '#777', fontSize: '12px' }}>
                Mtoni River Lodge · Arusha, Tanzania
              </Text>
              <Text style={{ margin: '4px 0 0', color: '#777', fontSize: '12px' }}>
                <Link href="https://mtoniriverlodge.com" style={styles.link}>
                  mtoniriverlodge.com
                </Link>
                {' · '}
                <Link href="mailto:bookings@mtoniriverlodge.com" style={styles.link}>
                  bookings@mtoniriverlodge.com
                </Link>
              </Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export interface BookingEmailProps {
  reference?: string
  guestName?: string
  roomName?: string
  checkIn?: string
  checkOut?: string
  nights?: number
  adults?: number
  children?: number
  total?: number | string
  deposit?: number | string
  balance?: number | string
  currency?: string
}

export function guestsLine(adults?: number, children?: number): string {
  const a = adults ?? 1
  const c = children ?? 0
  const aStr = `${a} adult${a > 1 ? 's' : ''}`
  return c > 0 ? `${aStr}, ${c} child${c > 1 ? 'ren' : ''}` : aStr
}