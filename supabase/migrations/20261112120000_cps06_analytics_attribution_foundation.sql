-- CPS-06 analytics and durable attribution foundation.
-- Additive only: preserves existing bookings, quotes, rates and payment records.
-- Apply to an isolated UAT database before any production promotion.

begin;

create table if not exists public.staynas_booking_attributions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  property_id uuid not null references public.staynas_properties(id) on delete restrict,
  booking_page_id uuid,
  campaign_id uuid,
  campaign_offer_id uuid,
  session_key text not null,
  visitor_key text,
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  first_touch_at timestamptz,
  last_touch_at timestamptz,
  booking_started_at timestamptz,
  quote_id uuid references public.staynas_reservation_quotes(id) on delete set null,
  reservation_id uuid references public.bookings(id) on delete set null,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staynas_booking_attributions_session_key_check
    check (length(btrim(session_key)) between 16 and 200),
  constraint staynas_booking_attributions_touch_object_check
    check (jsonb_typeof(first_touch) = 'object' and jsonb_typeof(last_touch) = 'object'),
  constraint staynas_booking_attributions_property_session_uidx
    unique (property_id, session_key),
  constraint staynas_booking_attributions_id_property_uidx
    unique (id, property_id)
);

create index if not exists staynas_booking_attributions_property_created_idx
  on public.staynas_booking_attributions(property_id, created_at desc);
create index if not exists staynas_booking_attributions_campaign_idx
  on public.staynas_booking_attributions(property_id, campaign_id, created_at desc);
create index if not exists staynas_booking_attributions_reservation_idx
  on public.staynas_booking_attributions(property_id, reservation_id)
  where reservation_id is not null;

alter table public.staynas_reservation_quotes
  add column if not exists attribution_id uuid;
alter table public.bookings
  add column if not exists attribution_id uuid;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname='staynas_quotes_attribution_fk') then
    alter table public.staynas_reservation_quotes
      add constraint staynas_quotes_attribution_fk
      foreign key (attribution_id) references public.staynas_booking_attributions(id)
      on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='staynas_bookings_attribution_fk') then
    alter table public.bookings
      add constraint staynas_bookings_attribution_fk
      foreign key (attribution_id) references public.staynas_booking_attributions(id)
      on delete set null;
  end if;
end;
$constraints$;

create table if not exists public.staynas_booking_analytics_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  property_id uuid not null references public.staynas_properties(id) on delete restrict,
  attribution_id uuid references public.staynas_booking_attributions(id) on delete set null,
  campaign_id uuid,
  booking_id uuid references public.bookings(id) on delete set null,
  quote_id uuid references public.staynas_reservation_quotes(id) on delete set null,
  event_type text not null check (event_type in (
    'booking_page_viewed','campaign_page_viewed','campaign_cta_clicked',
    'room_selected','offer_selected','availability_searched','quote_generated',
    'booking_started','reservation_created','reservation_confirmed',
    'payment_initiated','payment_completed','booking_cancelled','payment_refunded'
  )),
  event_key text not null check (length(btrim(event_key)) between 12 and 200),
  event_source text not null check (event_source in ('browser_observed','server_confirmed')),
  occurred_at timestamptz not null default now(),
  session_key text,
  traffic_source text,
  traffic_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_page text,
  device_category text check (device_category is null or device_category in ('desktop','mobile','tablet','unknown')),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  amount numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staynas_booking_analytics_event_key_uidx unique(property_id,event_key),
  constraint staynas_booking_analytics_metadata_object_check check (jsonb_typeof(metadata)='object')
);

create index if not exists staynas_booking_analytics_property_time_idx
  on public.staynas_booking_analytics_events(property_id,occurred_at desc);
create index if not exists staynas_booking_analytics_campaign_time_idx
  on public.staynas_booking_analytics_events(property_id,campaign_id,occurred_at desc)
  where campaign_id is not null;
create index if not exists staynas_booking_analytics_booking_idx
  on public.staynas_booking_analytics_events(property_id,booking_id,occurred_at)
  where booking_id is not null;
create index if not exists staynas_booking_analytics_type_time_idx
  on public.staynas_booking_analytics_events(property_id,event_type,occurred_at desc);

alter table public.staynas_booking_attributions enable row level security;
alter table public.staynas_booking_analytics_events enable row level security;
revoke all on public.staynas_booking_attributions from public, anon, authenticated;
revoke all on public.staynas_booking_analytics_events from public, anon, authenticated;
grant all on public.staynas_booking_attributions to service_role;
grant all on public.staynas_booking_analytics_events to service_role;

drop policy if exists staynas_booking_attributions_property_read on public.staynas_booking_attributions;
create policy staynas_booking_attributions_property_read
  on public.staynas_booking_attributions for select to authenticated
  using (public.staynas_user_has_property_access(auth.uid(),property_id));
drop policy if exists staynas_booking_analytics_property_read on public.staynas_booking_analytics_events;
create policy staynas_booking_analytics_property_read
  on public.staynas_booking_analytics_events for select to authenticated
  using (public.staynas_user_has_property_access(auth.uid(),property_id));

create or replace function public.staynas_record_booking_analytics_event(
  _property_id uuid,
  _organisation_id uuid,
  _event_type text,
  _event_key text,
  _event_source text,
  _attribution_id uuid default null,
  _campaign_id uuid default null,
  _booking_id uuid default null,
  _quote_id uuid default null,
  _session_key text default null,
  _traffic_source text default null,
  _traffic_medium text default null,
  _utm_campaign text default null,
  _utm_content text default null,
  _utm_term text default null,
  _referrer text default null,
  _landing_page text default null,
  _device_category text default null,
  _currency text default null,
  _amount numeric default null,
  _metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_role text := coalesce(auth.role(),'');
begin
  if v_role <> 'service_role' then
    raise exception using errcode='42501', message='Analytics event ingestion is server-only';
  end if;
  if _property_id is null or _organisation_id is null
     or _event_type not in (
       'booking_page_viewed','campaign_page_viewed','campaign_cta_clicked',
       'room_selected','offer_selected','availability_searched','quote_generated',
       'booking_started','reservation_created','reservation_confirmed',
       'payment_initiated','payment_completed','booking_cancelled','payment_refunded'
     )
     or _event_source not in ('browser_observed','server_confirmed')
     or nullif(btrim(_event_key),'') is null
     or length(_event_key) not between 12 and 200
     or jsonb_typeof(coalesce(_metadata,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023', message='Invalid analytics event contract';
  end if;
  if _event_type in ('reservation_created','reservation_confirmed','payment_initiated',
      'payment_completed','booking_cancelled','payment_refunded')
      and _event_source <> 'server_confirmed' then
    raise exception using errcode='42501', message='Financial and reservation lifecycle events must be server-confirmed';
  end if;
  if not exists (
    select 1 from public.staynas_properties p
    where p.id=_property_id and p.organisation_id=_organisation_id
  ) then
    raise exception using errcode='42501', message='Property and organisation scope do not match';
  end if;
  if _attribution_id is not null and not exists (
    select 1 from public.staynas_booking_attributions a
    where a.id=_attribution_id and a.property_id=_property_id
      and a.organisation_id=_organisation_id
  ) then
    raise exception using errcode='42501', message='Attribution does not belong to the supplied property';
  end if;
  if _booking_id is not null and not exists (
    select 1 from public.bookings b where b.id=_booking_id and b.property_id=_property_id
  ) then
    raise exception using errcode='42501', message='Booking does not belong to the supplied property';
  end if;
  insert into public.staynas_booking_analytics_events(
    organisation_id,property_id,attribution_id,campaign_id,booking_id,quote_id,
    event_type,event_key,event_source,session_key,traffic_source,traffic_medium,
    utm_campaign,utm_content,utm_term,referrer,landing_page,device_category,
    currency,amount,metadata
  ) values (
    _organisation_id,_property_id,_attribution_id,_campaign_id,_booking_id,_quote_id,
    _event_type,_event_key,_event_source,_session_key,_traffic_source,_traffic_medium,
    _utm_campaign,_utm_content,_utm_term,_referrer,_landing_page,_device_category,
    upper(_currency),_amount,coalesce(_metadata,'{}'::jsonb)
  )
  on conflict (property_id,event_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.staynas_booking_analytics_events
    where property_id=_property_id and event_key=_event_key;
    return jsonb_build_object('ok',true,'duplicate',true,'event_id',v_id);
  end if;
  return jsonb_build_object('ok',true,'duplicate',false,'event_id',v_id);
end
$function$;

revoke all on function public.staynas_record_booking_analytics_event(
  uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,jsonb
) from public, anon, authenticated;
grant execute on function public.staynas_record_booking_analytics_event(
  uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,jsonb
) to service_role;

-- Server-side lifecycle evidence is derived from the authoritative booking and
-- payment ledgers. No browser event can fabricate these conversions.
create or replace function public.staynas_capture_booking_analytics_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trigger$
declare
  v_type text;
  v_key text;
  v_org uuid;
  v_attribution uuid;
begin
  if tg_table_name='payment_events' then
    if new.booking_id is null then return new; end if;
    select p.organisation_id,b.attribution_id into v_org,v_attribution
    from public.bookings b join public.staynas_properties p on p.id=b.property_id
    where b.id=new.booking_id;
    if v_org is null then return new; end if;
    if new.event_type='payment_completed' then v_type:='payment_completed';
    elsif new.event_type in ('refund','provider_reversal') then v_type:='payment_refunded';
    else return new;
    end if;
    v_key:='ledger-payment:'||new.id::text;
    perform public.staynas_record_booking_analytics_event(
      (select property_id from public.bookings where id=new.booking_id),v_org,
      v_type,v_key,'server_confirmed',v_attribution,null,new.booking_id,null,null,
      null,null,null,null,null,null,null,null,new.currency,new.amount,
      jsonb_build_object('payment_event_id',new.id,'provider',new.provider,'payment_event_type',new.event_type)
    );
    return new;
  end if;

  if tg_op='INSERT' then
    v_type:='reservation_created';
    v_key:='ledger-reservation-created:'||new.id::text;
  elsif new.status is distinct from old.status and new.status::text='confirmed' then
    v_type:='reservation_confirmed';
    v_key:='ledger-reservation-confirmed:'||new.id::text;
  elsif new.status is distinct from old.status and new.status::text='cancelled' then
    v_type:='booking_cancelled';
    v_key:='ledger-booking-cancelled:'||new.id::text;
  else
    return new;
  end if;
  select organisation_id into v_org from public.staynas_properties where id=new.property_id;
  if v_org is null then return new; end if;
  perform public.staynas_record_booking_analytics_event(
    new.property_id,v_org,v_type,v_key,'server_confirmed',new.attribution_id,
    null,new.id,new.reservation_quote_id,null,null,null,null,null,null,null,null,null,
    new.currency,case when v_type='reservation_created' then new.total else null end,
    jsonb_build_object('booking_status',new.status::text)
  );
  return new;
end
$trigger$;

drop trigger if exists staynas_booking_analytics_lifecycle on public.bookings;
create trigger staynas_booking_analytics_lifecycle
  after insert or update of status on public.bookings
  for each row execute function public.staynas_capture_booking_analytics_lifecycle();

drop trigger if exists staynas_payment_analytics_lifecycle on public.payment_events;
create trigger staynas_payment_analytics_lifecycle
  after insert on public.payment_events
  for each row execute function public.staynas_capture_booking_analytics_lifecycle();

commit;
