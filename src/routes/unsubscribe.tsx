import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const searchSchema = z.object({ token: z.string().optional() })

export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (s) => searchSchema.parse(s),
  component: UnsubscribePage,
  head: () => ({
    meta: [
      { title: 'Unsubscribe — Mtoni River Lodge' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
})

type State =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'already' }
  | { status: 'invalid' }
  | { status: 'submitting' }
  | { status: 'done' }
  | { status: 'error'; message: string }

function UnsubscribePage() {
  const { token } = Route.useSearch()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid' })
      return
    }
    let cancelled = false
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setState({ status: 'invalid' })
          return
        }
        if (json.valid) setState({ status: 'ready' })
        else if (json.reason === 'already_unsubscribed') setState({ status: 'already' })
        else setState({ status: 'invalid' })
      })
      .catch(() => !cancelled && setState({ status: 'invalid' }))
    return () => {
      cancelled = true
    }
  }, [token])

  const confirm = async () => {
    if (!token) return
    setState({ status: 'submitting' })
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await r.json().catch(() => ({}))
      if (r.ok && json.success) setState({ status: 'done' })
      else if (json.reason === 'already_unsubscribed') setState({ status: 'already' })
      else setState({ status: 'error', message: json.error ?? 'Something went wrong.' })
    } catch (e: any) {
      setState({ status: 'error', message: e?.message ?? 'Network error' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="font-serif text-2xl text-foreground mb-2">Mtoni River Lodge</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
          Email preferences
        </p>

        {state.status === 'loading' && (
          <p className="text-sm text-muted-foreground">Checking your link…</p>
        )}

        {state.status === 'ready' && (
          <>
            <h2 className="text-lg font-medium text-foreground mb-2">Unsubscribe from emails</h2>
            <p className="text-sm text-muted-foreground mb-6">
              You'll stop receiving reservation, payment, and marketing emails from Mtoni River
              Lodge. You can still reach us at bookings@mtoniriverlodge.com.
            </p>
            <button
              onClick={confirm}
              className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition"
            >
              Confirm unsubscribe
            </button>
          </>
        )}

        {state.status === 'submitting' && (
          <p className="text-sm text-muted-foreground">Updating your preferences…</p>
        )}

        {state.status === 'done' && (
          <>
            <h2 className="text-lg font-medium text-foreground mb-2">You're unsubscribed</h2>
            <p className="text-sm text-muted-foreground">
              We've removed you from our mailing list. Karibu tena — you can always reach us
              directly at bookings@mtoniriverlodge.com.
            </p>
          </>
        )}

        {state.status === 'already' && (
          <>
            <h2 className="text-lg font-medium text-foreground mb-2">Already unsubscribed</h2>
            <p className="text-sm text-muted-foreground">
              This address is already removed from our mailing list.
            </p>
          </>
        )}

        {state.status === 'invalid' && (
          <>
            <h2 className="text-lg font-medium text-foreground mb-2">Link not valid</h2>
            <p className="text-sm text-muted-foreground">
              This unsubscribe link is invalid or has expired. Contact bookings@mtoniriverlodge.com
              and we'll update your preferences manually.
            </p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <h2 className="text-lg font-medium text-foreground mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </>
        )}
      </div>
    </div>
  )
}