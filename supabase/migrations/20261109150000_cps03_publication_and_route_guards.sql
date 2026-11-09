-- CPS-03 hardening: trusted lifecycle transitions, active-property public visibility,
-- shared route namespace, and idempotent attribution event keys.
-- Additive only: no existing property, currency, booking, or rate data is modified.

create or replace function public.cps03_guard_publication_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if current_user <> 'service_role' then
    if tg_op = 'INSERT' and new.status <> 'draft' then
      raise exception 'Published booking resources must be created through the trusted server workflow'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      raise exception 'Booking resource lifecycle transitions must use the trusted server workflow'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists cps03_booking_pages_publication_guard on public.booking_pages;
create trigger cps03_booking_pages_publication_guard
before insert or update of status on public.booking_pages
for each row execute function public.cps03_guard_publication_transition();

drop trigger if exists cps03_booking_campaigns_publication_guard on public.booking_campaigns;
create trigger cps03_booking_campaigns_publication_guard
before insert or update of status on public.booking_campaigns
for each row execute function public.cps03_guard_publication_transition();

drop trigger if exists cps03_campaign_content_publication_guard on public.campaign_page_content;
create trigger cps03_campaign_content_publication_guard
before insert or update of status on public.campaign_page_content
for each row execute function public.cps03_guard_publication_transition();

-- Prevent collisions between the permanent /book route and campaign slugs.
create or replace function public.cps03_guard_shared_booking_slug()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.property_id::text || ':' || new.slug, 0));
  if tg_table_name = 'booking_pages' then
    if exists (select 1 from public.booking_campaigns c
      where c.property_id = new.property_id and c.slug = new.slug) then
      raise exception 'Booking route slug is already used by a campaign'
        using errcode = '23505';
    end if;
  else
    if exists (select 1 from public.booking_pages p
      where p.property_id = new.property_id and p.slug = new.slug) then
      raise exception 'Campaign route slug is reserved by the permanent booking page'
        using errcode = '23505';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists cps03_booking_pages_shared_slug_guard on public.booking_pages;
create trigger cps03_booking_pages_shared_slug_guard
before insert or update of property_id, slug on public.booking_pages
for each row execute function public.cps03_guard_shared_booking_slug();

drop trigger if exists cps03_booking_campaigns_shared_slug_guard on public.booking_campaigns;
create trigger cps03_booking_campaigns_shared_slug_guard
before insert or update of property_id, slug on public.booking_campaigns
for each row execute function public.cps03_guard_shared_booking_slug();

-- SECURITY DEFINER avoids requiring anonymous users to read tenant property records.
create or replace function public.cps03_is_property_public_active(_property_id uuid, _organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1 from public.staynas_properties p
    where p.id = _property_id
      and p.organisation_id = _organisation_id
      and p.status = 'active'
  )
$function$;

-- Public RLS visibility is always conditional on the property remaining active.
drop policy if exists booking_pages_public_published_read on public.booking_pages;
create policy booking_pages_public_published_read
on public.booking_pages for select to anon, authenticated
using (
  status = 'published'
  and public.cps03_is_property_public_active(property_id, organisation_id)
);

drop policy if exists booking_campaigns_public_published_read on public.booking_campaigns;
create policy booking_campaigns_public_published_read
on public.booking_campaigns for select to anon, authenticated
using (
  status = 'published'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
  and public.cps03_is_property_public_active(property_id, organisation_id)
);

drop policy if exists campaign_page_content_public_published_read on public.campaign_page_content;
create policy campaign_page_content_public_published_read
on public.campaign_page_content for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.booking_campaigns c
    
    where c.id = campaign_page_content.campaign_id
      and c.property_id = campaign_page_content.property_id
      and c.status = 'published'
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
      and p.status = 'active'
  )
);

drop policy if exists campaign_room_selections_public_published_read on public.campaign_room_selections;
create policy campaign_room_selections_public_published_read
on public.campaign_room_selections for select to anon, authenticated
using (
  exists (
    select 1 from public.booking_campaigns c
    join public.staynas_properties p on p.id = c.property_id and p.organisation_id = c.organisation_id
    where c.id = campaign_room_selections.campaign_id
      and c.property_id = campaign_room_selections.property_id
      and c.status = 'published'
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
      and p.status = 'active'
  )
);

drop policy if exists campaign_offers_public_published_read on public.campaign_offers;
create policy campaign_offers_public_published_read
on public.campaign_offers for select to anon, authenticated
using (
  active
  and exists (
    select 1 from public.booking_campaigns c
    join public.staynas_properties p on p.id = c.property_id and p.organisation_id = c.organisation_id
    where c.id = campaign_offers.campaign_id
      and c.property_id = campaign_offers.property_id
      and c.status = 'published'
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
      and p.status = 'active'
  )
);

alter table public.campaign_attribution
  add column if not exists event_key text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

alter table public.campaign_attribution
  add constraint campaign_attribution_event_key_length_check
  check (event_key is null or length(trim(event_key)) between 12 and 200);

create unique index if not exists campaign_attribution_event_key_uidx
  on public.campaign_attribution (property_id, event_key)
  where event_key is not null;

comment on function public.cps03_guard_publication_transition() is
  'CPS-03: tenant clients cannot directly publish, pause, expire, or archive booking pages/campaigns/content.';
comment on function public.cps03_guard_shared_booking_slug() is
  'CPS-03: reserves a single property route namespace across permanent booking pages and campaigns.';
