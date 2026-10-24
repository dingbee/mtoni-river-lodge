# Architecture rules

- Keep housekeeping RPC contracts in a local schema extension derived from existing SQL migrations; generated database files remain untouched and no schema is applied implicitly.
- Legacy website destinations absent from the StayNas router use ordinary anchors; do not recreate retired pages solely to satisfy router typing.
- Booking RPC contracts live in src/lib/booking-rpc.ts (local typed adapter, same pattern as housekeeping/staynas); every booking path resolves the configured property via staynas_booking_property_id() and passes _property_id. Unapplied review migrations live in supabase/review/, never supabase/migrations/, so no migrator picks them up.
