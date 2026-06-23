import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import {
  listFrontDeskBookings,
  listOpenTasks,
  getGuestThread,
  updateBookingStatus,
  saveStaffNote,
  completeTask,
} from '@/lib/front-desk.functions'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Mail, MessageCircle, ClipboardList, Crown, Mountain, Clock } from 'lucide-react'

const COLUMNS: { key: string; label: string }[] = [
  { key: 'pending', label: 'New / Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'checked_in', label: 'Checked In' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export const Route = createFileRoute('/_authenticated/admin/front-desk')({
  component: FrontDeskPage,
})

function FrontDeskPage() {
  const qc = useQueryClient()
  const fetchBookings = useServerFn(listFrontDeskBookings)
  const fetchTasks = useServerFn(listOpenTasks)

  const bookingsQ = useQuery({ queryKey: ['fd-bookings'], queryFn: () => fetchBookings() })
  const tasksQ = useQuery({ queryKey: ['fd-tasks'], queryFn: () => fetchTasks() })

  // Realtime invalidation
  useEffect(() => {
    const ch = supabase
      .channel('front-desk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        qc.invalidateQueries({ queryKey: ['fd-bookings'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_tasks' }, () => {
        qc.invalidateQueries({ queryKey: ['fd-tasks'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_threads' }, () => {
        qc.invalidateQueries({ queryKey: ['fd-thread'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])

  const bookings = bookingsQ.data ?? []
  const tasks = tasksQ.data ?? []

  const today = new Date().toISOString().slice(0, 10)
  const arrivalsToday = bookings.filter((b: any) => b.check_in === today)
  const departuresToday = bookings.filter((b: any) => b.check_out === today)
  const pendingPayments = bookings.filter((b: any) => Number(b.balance_amount) > 0 && b.status !== 'cancelled')
  const vipArrivals = arrivalsToday.filter((b: any) => b.guest_type !== 'standard')

  const [selected, setSelected] = useState<any | null>(null)

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-3xl font-serif">Front Desk Command</h1>
        <p className="text-sm text-muted-foreground">Operations console — bookings, tasks, alerts.</p>
      </header>

      {/* Today's ops */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Check-ins today" value={arrivalsToday.length} icon={<Clock className="size-4" />} />
        <StatCard label="Check-outs today" value={departuresToday.length} icon={<Clock className="size-4" />} />
        <StatCard label="Pending payments" value={pendingPayments.length} icon={<Mail className="size-4" />} />
        <StatCard label="VIP / climber arrivals" value={vipArrivals.length} icon={<Crown className="size-4" />} />
      </div>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">Booking board</TabsTrigger>
          <TabsTrigger value="tasks">Open tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {COLUMNS.map((col) => {
              const items = bookings.filter((b: any) => b.status === col.key)
              return (
                <div key={col.key} className="bg-muted/40 rounded-md p-3 min-h-[300px]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((b: any) => (
                      <BookingCard key={b.id} booking={b} onClick={() => setSelected(b)} />
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Nothing here.</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <TaskList tasks={tasks} bookings={bookings} onOpen={(b) => setSelected(b)} />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsPanel bookings={bookings} onOpen={(b) => setSelected(b)} />
        </TabsContent>
      </Tabs>

      <GuestDrawer booking={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </Card>
  )
}

function GuestTypeBadge({ type }: { type: string }) {
  if (type === 'vip') return <Badge className="bg-amber-500 text-black"><Crown className="size-3 mr-1" />VIP</Badge>
  if (type === 'climber') return <Badge className="bg-emerald-600"><Mountain className="size-3 mr-1" />Climber</Badge>
  return null
}

function BookingCard({ booking, onClick }: { booking: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left bg-card border rounded-md p-3 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{booking.guest_name}</p>
          <p className="text-xs text-muted-foreground truncate">{booking.room?.name ?? '—'}</p>
        </div>
        <GuestTypeBadge type={booking.guest_type} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground flex justify-between">
        <span>{booking.check_in} → {booking.check_out}</span>
        <span className="font-mono">{booking.reference}</span>
      </div>
      {Number(booking.balance_amount) > 0 && (
        <p className="text-xs mt-1 text-amber-700">Balance: {booking.currency} {booking.balance_amount}</p>
      )}
    </button>
  )
}

function TaskList({ tasks, bookings, onOpen }: { tasks: any[]; bookings: any[]; onOpen: (b: any) => void }) {
  const qc = useQueryClient()
  const completeFn = useServerFn(completeTask)
  const mut = useMutation({
    mutationFn: (taskId: string) => completeFn({ data: { taskId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-tasks'] }),
  })
  const byId = new Map(bookings.map((b) => [b.id, b]))
  return (
    <div className="space-y-2">
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">All caught up.</p>}
      {tasks.map((t) => {
        const b = byId.get(t.booking_id)
        return (
          <Card key={t.id} className="p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {t.priority === 1 && <Badge variant="destructive">P1</Badge>}
                <p className="font-medium truncate">{t.title}</p>
              </div>
              {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {t.task_type}{t.due_at ? ` · due ${new Date(t.due_at).toLocaleString()}` : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {b && <Button size="sm" variant="outline" onClick={() => onOpen(b)}>Open</Button>}
              <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate(t.id)}>Done</Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function AlertsPanel({ bookings, onOpen }: { bookings: any[]; onOpen: (b: any) => void }) {
  const now = Date.now()
  const in48h = new Date(now + 48 * 3600 * 1000).toISOString().slice(0, 10)
  const overduePayments = bookings.filter(
    (b) => Number(b.balance_amount) > 0 && b.check_in <= in48h && b.status !== 'cancelled',
  )
  const vipUpcoming = bookings.filter(
    (b) => b.guest_type !== 'standard' && b.check_in <= in48h && b.status !== 'cancelled' && b.status !== 'completed',
  )
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <AlertGroup title="Payment overdue" items={overduePayments} onOpen={onOpen} tone="warn" />
      <AlertGroup title="VIP / climber within 48h" items={vipUpcoming} onOpen={onOpen} tone="info" />
    </div>
  )
}

function AlertGroup({ title, items, onOpen, tone }: { title: string; items: any[]; onOpen: (b: any) => void; tone: 'warn' | 'info' }) {
  return (
    <Card className={`p-4 ${tone === 'warn' ? 'border-amber-500/50' : 'border-emerald-500/50'}`}>
      <h3 className="font-semibold mb-2">{title} ({items.length})</h3>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Clear.</p>}
        {items.map((b) => (
          <button key={b.id} onClick={() => onOpen(b)} className="block w-full text-left text-sm hover:underline">
            <span className="font-medium">{b.guest_name}</span> — {b.reference} · {b.check_in}
          </button>
        ))}
      </div>
    </Card>
  )
}

function GuestDrawer({ booking, onClose }: { booking: any | null; onClose: () => void }) {
  const qc = useQueryClient()
  const fetchThread = useServerFn(getGuestThread)
  const updateStatus = useServerFn(updateBookingStatus)
  const saveNote = useServerFn(saveStaffNote)

  const threadQ = useQuery({
    queryKey: ['fd-thread', booking?.id],
    queryFn: () => fetchThread({ data: { bookingId: booking!.id } }),
    enabled: !!booking,
  })

  const [noteDraft, setNoteDraft] = useState('')
  useEffect(() => { setNoteDraft(threadQ.data?.thread?.notes ?? '') }, [threadQ.data])

  const statusMut = useMutation({
    mutationFn: (status: string) => updateStatus({ data: { bookingId: booking.id, status: status as any } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-bookings'] }),
  })
  const noteMut = useMutation({
    mutationFn: () => saveNote({ data: { bookingId: booking.id, notes: noteDraft } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-thread', booking.id] }),
  })

  const timeline = useMemo(() => {
    const t: any[] = (threadQ.data?.thread?.timeline as any[]) ?? []
    const emails = (threadQ.data?.emails ?? []).map((e: any) => ({
      at: e.occurred_at, type: `email:${e.event_type}`, message: `${e.template_name} → ${e.recipient_email}`,
    }))
    const wa = (threadQ.data?.whatsapp ?? []).map((w: any) => ({
      at: w.sent_at ?? w.created_at, type: `whatsapp:${w.status}`, message: w.event_type,
    }))
    return [...t, ...emails, ...wa].sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [threadQ.data])

  return (
    <Sheet open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {booking && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {booking.guest_name}
                <GuestTypeBadge type={booking.guest_type} />
              </SheetTitle>
              <p className="text-xs text-muted-foreground">{booking.reference} · {booking.room?.name}</p>
            </SheetHeader>

            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Check-in</span><br />{booking.check_in}</div>
                <div><span className="text-muted-foreground">Check-out</span><br />{booking.check_out}</div>
                <div><span className="text-muted-foreground">Total</span><br />{booking.currency} {booking.total}</div>
                <div><span className="text-muted-foreground">Balance</span><br />{booking.currency} {booking.balance_amount}</div>
                <div><span className="text-muted-foreground">Email</span><br />{booking.guest_email}</div>
                <div><span className="text-muted-foreground">Phone</span><br />{booking.guest_phone ?? '—'}</div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <Select value={booking.status} onValueChange={(v) => statusMut.mutate(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Staff notes</p>
                <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={3} />
                <Button size="sm" className="mt-2" disabled={noteMut.isPending} onClick={() => noteMut.mutate()}>Save note</Button>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <ClipboardList className="size-3" /> Timeline
                </p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                  {timeline.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                  {timeline.map((ev, i) => (
                    <div key={i} className="text-sm border-l-2 pl-3 py-1">
                      <p className="font-mono text-xs text-muted-foreground">{ev.at ? new Date(ev.at).toLocaleString() : ''}</p>
                      <p>
                        {ev.type.startsWith('email') && <Mail className="inline size-3 mr-1" />}
                        {ev.type.startsWith('whatsapp') && <MessageCircle className="inline size-3 mr-1" />}
                        <span className="font-medium">{ev.type}</span> — {ev.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}