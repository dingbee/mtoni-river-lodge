function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Continuous percentile over millisecond intervals, returned in minutes. */
export function percentileMinutes(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return round((sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)) / 60_000);
}

export function responseIntervals(rows: any[]) {
  const unique = new Map<string, any>();
  for (const row of rows) {
    const key = row.provider_message_id
      ? `provider:${row.property_id}:${row.channel}:${row.provider}:${row.provider_message_id}`
      : row.client_message_id
        ? `client:${row.property_id}:${row.session_id}:${row.client_message_id}`
        : `row:${row.id}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  const bySession = new Map<string, any[]>();
  for (const row of unique.values()) {
    const bucket = bySession.get(row.session_id) ?? [];
    bucket.push(row);
    bySession.set(row.session_id, bucket);
  }

  const first: number[] = [];
  const ai: number[] = [];
  const human: number[] = [];
  let unanswered = 0;
  for (const messages of bySession.values()) {
    messages.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || String(a.id).localeCompare(String(b.id)));
    const pending: number[] = [];
    let firstInboundAt: number | null = null;
    let firstAnswered = false;
    for (const message of messages) {
      const at = Date.parse(message.occurred_at);
      if (!Number.isFinite(at) || ["event", "template"].includes(message.message_type)) continue;
      if (message.direction === "outbound" && !["recorded", "accepted", "delivered", "read"].includes(message.status)) continue;
      if (message.direction === "inbound" && message.actor_type === "guest") {
        pending.push(at);
        if (firstInboundAt === null) firstInboundAt = at;
      } else if (message.direction === "outbound" && ["assistant", "staff"].includes(message.actor_type) && pending.length) {
        const inboundAt = pending.shift()!;
        const interval = at - inboundAt;
        if (interval < 0) continue;
        (message.actor_type === "assistant" ? ai : human).push(interval);
        if (!firstAnswered && firstInboundAt !== null) {
          first.push(at - firstInboundAt);
          firstAnswered = true;
        }
      }
    }
    if (pending.length) unanswered += 1;
  }
  return { first, ai, human, unanswered, conversations: bySession.size };
}
