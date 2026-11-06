begin;
drop policy if exists "Staff can read payment events" on public.payment_events;
create policy "Finance staff can read payment events for accessible properties"
  on public.payment_events
  for select
  to authenticated
  using (
    booking_id is not null
    and exists (
      select 1 from public.bookings b
      where b.id = payment_events.booking_id
        and public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
    and public.has_any_role(
      auth.uid(),
      array['owner','manager','finance']::public.app_role[]
    )
  );
commit;