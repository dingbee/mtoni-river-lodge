# Intelligence Core

Central reasoning layer for Mtoni OS. It does **not** contain a chatbot and does
not own any module's data. It provides one loop that every module plugs into:

```
Observe  → intelligence_events        (events/)
Understand → intelligence_signals     (reasoning/)
Reason   → intelligence_insights      (reasoning/)
Recommend → intelligence_recommendations, intelligence_predictions
Act      → intelligence_actions       (actions/)
Learn    → intelligence_memory, intelligence_feedback (memory/)
```

## Rules

- The core never mutates another module's tables. It proposes; the owning module executes.
- All AI calls go through the existing `src/lib/ai-gateway.server.ts` transport.
- Output is advisory. Actions require approval unless a module explicitly marks them automated.
- Events and actions are idempotent through `dedupe_key`.
- Access reuses the existing role model (`has_any_role`); module visibility is
  narrowed per role in `core/permissions.ts`.

## Adding a module

```ts
registerIntelligenceProvider({
  module: "restaurant",
  label: "Restaurant OS",
  stages: ["observe", "understand"],
  emits: ["restaurant.order_placed"],
});
```

Then call `recordIntelligenceEvent({ data: { module, eventType, payload, dedupeKey } })`
from that module. Nothing else in Mtoni OS changes.