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
grant select on public.staynas_booking_attributions to authenticated;
grant select on public.staynas_booking_analytics_events to authenticated;

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
  if _event_source='browser_observed' and (
    length(btrim(coalesce(_session_key,''))) not between 16 and 200
    or _amount is not null or _currency is not null or _booking_id is not null or _quote_id is not null
  ) then
    raise exception using errcode='42501', message='Browser-observed events cannot supply financial or ledger references';
  end if;
  if _attribution_id is not null and not exists (
    select 1 from public.staynas_booking_attributions a
    where a.id=_attribution_id and a.property_id=_property_id
      and a.organisation_id=_organisation_id
      and (_session_key is null or a.session_key=_session_key)
  ) then
    raise exception using errcode='42501', message='Attribution does not belong to the supplied property or session';
  end if;
  if _campaign_id is not null and not exists (
    select 1 from public.booking_campaigns c
    where c.id=_campaign_id and c.property_id=_property_id and c.organisation_id=_organisation_id
  ) then
    raise exception using errcode='42501', message='Campaign does not belong to the supplied property';
  end if;
  if _quote_id is not null and not exists (
    select 1 from public.staynas_reservation_quotes q where q.id=_quote_id and q.property_id=_property_id
  ) then
    raise exception using errcode='42501', message='Quote does not belong to the supplied property';
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


-- Durable acquisition context. First touch is immutable; last touch changes
-- only for a qualifying external acquisition, never for internal navigation.
create or replace function public.staynas_upsert_booking_attribution(
  _property_id uuid,
  _organisation_id uuid,
  _session_key text,
  _visitor_key text default null,
  _booking_page_id uuid default null,
  _campaign_id uuid default null,
  _campaign_offer_id uuid default null,
  _touch jsonb default '{}'::jsonb,
  _touch_at timestamptz default now(),
  _is_external_acquisition boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Attribution writes are server-only';
  end if;
  if _property_id is null or _organisation_id is null
     or length(btrim(coalesce(_session_key,''))) not between 16 and 200
     or jsonb_typeof(coalesce(_touch,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023',message='Invalid attribution contract';
  end if;
  if not exists(select 1 from public.staynas_properties p
    where p.id=_property_id and p.organisation_id=_organisation_id) then
    raise exception using errcode='42501',message='Property and organisation scope do not match';
  end if;
  if _campaign_id is not null and not exists(
    select 1 from public.booking_campaigns c
    where c.id=_campaign_id and c.property_id=_property_id
      and c.organisation_id=_organisation_id
  ) then
    raise exception using errcode='42501',message='Campaign does not belong to the property';
  end if;
  if _campaign_offer_id is not null and not exists(
    select 1 from public.campaign_offers o
    where o.id=_campaign_offer_id and o.property_id=_property_id
      and (_campaign_id is null or o.campaign_id=_campaign_id)
  ) then
    raise exception using errcode='42501',message='Campaign offer does not belong to the property and campaign';
  end if;
  insert into public.staynas_booking_attributions(
    organisation_id,property_id,session_key,visitor_key,booking_page_id,
    campaign_id,campaign_offer_id,first_touch,last_touch,first_touch_at,last_touch_at
  ) values (
    _organisation_id,_property_id,_session_key,_visitor_key,_booking_page_id,
    _campaign_id,_campaign_offer_id,coalesce(_touch,'{}'::jsonb),
    coalesce(_touch,'{}'::jsonb),_touch_at,_touch_at
  )
  on conflict(property_id,session_key) do update set
    visitor_key=coalesce(public.staynas_booking_attributions.visitor_key,excluded.visitor_key),
    booking_page_id=coalesce(excluded.booking_page_id,public.staynas_booking_attributions.booking_page_id),
    campaign_id=coalesce(excluded.campaign_id,public.staynas_booking_attributions.campaign_id),
    campaign_offer_id=coalesce(excluded.campaign_offer_id,public.staynas_booking_attributions.campaign_offer_id),
    last_touch=case when _is_external_acquisition then excluded.last_touch
      else public.staynas_booking_attributions.last_touch end,
    last_touch_at=case when _is_external_acquisition then _touch_at
      else public.staynas_booking_attributions.last_touch_at end,
    updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'attribution_id',v_id);
end
$function$;

revoke all on function public.staynas_upsert_booking_attribution(uuid,uuid,text,text,uuid,uuid,uuid,jsonb,timestamptz,boolean)
  from public,anon,authenticated;
grant execute on function public.staynas_upsert_booking_attribution(uuid,uuid,text,text,uuid,uuid,uuid,jsonb,timestamptz,boolean)
  to service_role;

create or replace function public.staynas_attach_quote_attribution(
  _quote_id uuid,_property_id uuid,_attribution_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Quote attribution is server-only';
  end if;
  if not exists(select 1 from public.staynas_booking_attributions a
    where a.id=_attribution_id and a.property_id=_property_id) then
    raise exception using errcode='42501',message='Attribution does not belong to the quote property';
  end if;
  update public.staynas_reservation_quotes
  set attribution_id=_attribution_id,
      request=request || jsonb_build_object('attribution_id',_attribution_id)
  where id=_quote_id and property_id=_property_id;
  if not found then return false; end if;
  update public.staynas_booking_attributions
  set quote_id=_quote_id, booking_started_at=coalesce(booking_started_at,now()), updated_at=now()
  where id=_attribution_id and property_id=_property_id;
  return found;
end
$function$;

revoke all on function public.staynas_attach_quote_attribution(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.staynas_attach_quote_attribution(uuid,uuid,uuid)
  to service_role;

create or replace function public.staynas_inherit_quote_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trigger$
begin
  if new.attribution_id is null and new.reservation_quote_id is not null then
    select q.attribution_id into new.attribution_id
    from public.staynas_reservation_quotes q
    where q.id=new.reservation_quote_id and q.property_id=new.property_id;
  end if;
  return new;
end
$trigger$;

drop trigger if exists staynas_booking_inherit_quote_attribution on public.bookings;
create trigger staynas_booking_inherit_quote_attribution
  before insert on public.bookings
  for each row execute function public.staynas_inherit_quote_attribution();

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
  v_campaign uuid;
begin
  if tg_table_name='payment_events' then
    if new.booking_id is null then return new; end if;
    select p.organisation_id,b.attribution_id,a.campaign_id into v_org,v_attribution,v_campaign
    from public.bookings b
    join public.staynas_properties p on p.id=b.property_id
    left join public.staynas_booking_attributions a on a.id=b.attribution_id and a.property_id=b.property_id
    where b.id=new.booking_id;
    if v_org is null then return new; end if;
    update public.staynas_booking_attributions
    set reservation_id=new.booking_id,
        payment_reference=coalesce(payment_reference,new.order_tracking_id,new.merchant_reference),
        updated_at=now()
    where id=v_attribution and property_id=(select property_id from public.bookings where id=new.booking_id);
    if new.event_type in ('manual_payment','payment_completed') then v_type:='payment_completed';
    elsif new.event_type in ('refund','provider_reversal') then v_type:='payment_refunded';
    else return new;
    end if;
    v_key:='ledger-payment:'||new.id::text;
    insert into public.staynas_booking_analytics_events(
      organisation_id,property_id,attribution_id,campaign_id,booking_id,event_type,event_key,
      event_source,currency,amount,metadata
    )
    select v_org,b.property_id,v_attribution,v_campaign,new.booking_id,v_type,v_key,
      'server_confirmed',upper(new.currency),abs(new.amount),
      jsonb_build_object('payment_event_id',new.id,'provider',new.provider,'payment_event_type',new.event_type)
    from public.bookings b where b.id=new.booking_id
    on conflict(property_id,event_key) do nothing;
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
  select p.organisation_id,a.campaign_id into v_org,v_campaign
  from public.staynas_properties p
  left join public.staynas_booking_attributions a on a.id=new.attribution_id and a.property_id=new.property_id
  where p.id=new.property_id;
  if v_org is null then return new; end if;
  update public.staynas_booking_attributions
  set reservation_id=new.id, updated_at=now()
  where id=new.attribution_id and property_id=new.property_id;
  insert into public.staynas_booking_analytics_events(
    organisation_id,property_id,attribution_id,campaign_id,booking_id,quote_id,event_type,
    event_key,event_source,currency,amount,metadata
  ) values (
    v_org,new.property_id,new.attribution_id,v_campaign,new.id,new.reservation_quote_id,
    v_type,v_key,'server_confirmed',upper(new.currency),
    case when v_type='reservation_created' then new.total else null end,
    jsonb_build_object('booking_status',new.status::text)
  ) on conflict(property_id,event_key) do nothing;
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


-- Aggregated reporting remains server-side; tenant authorization is repeated
-- inside the database function and all monetary totals remain currency-separated.
create or replace function public.staynas_get_booking_analytics(
  _property_id uuid,
  _from timestamptz,
  _to timestamptz
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  if _property_id is null or _from is null or _to is null or _to <= _from then
    raise exception using errcode='22023',message='A valid property and reporting window are required';
  end if;
  if not public.staynas_user_has_property_access(auth.uid(),_property_id) then
    raise exception using errcode='42501',message='Property analytics access denied';
  end if;
  select organisation_id into v_org from public.staynas_properties where id=_property_id;
  if v_org is null then raise exception using errcode='P0002',message='Property not found'; end if;

  with e as (
    select * from public.staynas_booking_analytics_events
    where property_id=_property_id and occurred_at >= _from and occurred_at < _to
  ),
  stages as (
    select
      count(*) filter(where event_type in ('booking_page_viewed','campaign_page_viewed')) as views,
      count(distinct session_key) filter(where event_type in ('booking_page_viewed','campaign_page_viewed')) as visitors,
      count(*) filter(where event_type='booking_started') as starts,
      count(*) filter(where event_type='availability_searched') as searches,
      count(*) filter(where event_type='quote_generated') as quotes,
      count(*) filter(where event_type='reservation_created') as reservations,
      count(*) filter(where event_type='reservation_confirmed') as confirmed,
      count(distinct booking_id) filter(where event_type='payment_completed') as paid_bookings
    from e
  ),
  booking_money as (
    select upper(currency) as currency,
      coalesce(sum(total),0) as gross_booking_value,
      coalesce(sum(total) filter(where status::text in ('confirmed','checked_in','completed')),0) as confirmed_booking_value,
      coalesce(sum(balance_amount) filter(where status::text not in ('cancelled','no_show')),0) as outstanding
    from public.bookings
    where property_id=_property_id and created_at >= _from and created_at < _to
    group by upper(currency)
  ),
  payment_money as (
    select currency,
      coalesce(sum(amount) filter(where event_type='payment_completed'),0) as amount_paid,
      coalesce(sum(abs(amount)) filter(where event_type='payment_refunded'),0) as refunds
    from e where currency is not null
      and event_type in ('payment_completed','payment_refunded')
    group by currency
  ),
  money as (
    select coalesce(b.currency,p.currency) as currency,
      coalesce(b.gross_booking_value,0) as gross_booking_value,
      coalesce(b.confirmed_booking_value,0) as confirmed_booking_value,
      coalesce(p.amount_paid,0) as amount_paid,
      coalesce(b.outstanding,0) as outstanding,
      coalesce(p.refunds,0) as refunds,
      coalesce(p.amount_paid,0)-coalesce(p.refunds,0) as net_collected
    from booking_money b
    full join payment_money p using(currency)
  ),
  campaign_rows as (
    select c.id,c.name,c.slug,c.status,
      count(*) filter(where e.event_type='campaign_page_viewed') as views,
      count(distinct e.session_key) filter(where e.event_type='campaign_page_viewed') as visitors,
      count(*) filter(where e.event_type='booking_started') as booking_starts,
      count(*) filter(where e.event_type='quote_generated') as quotes,
      count(distinct e.booking_id) filter(where e.event_type='reservation_created') as reservations,
      count(distinct e.booking_id) filter(where e.event_type='payment_completed') as paid_bookings,
      coalesce((
        select jsonb_agg(jsonb_build_object('currency',totals.currency,'net_collected',totals.net_collected))
        from (
          select pe.currency,
            coalesce(sum(pe.amount) filter(where pe.event_type='payment_completed'),0)
              - coalesce(sum(abs(pe.amount)) filter(where pe.event_type='payment_refunded'),0) as net_collected
          from e pe
          where pe.campaign_id=c.id and pe.currency is not null
          group by pe.currency
        ) totals
      ),'[]'::jsonb) as net_collected_by_currency
    from public.booking_campaigns c
    left join e on e.campaign_id=c.id and e.property_id=c.property_id
    where c.property_id=_property_id
    group by c.id,c.name,c.slug,c.status
  ),
  acquisition as (
    select coalesce(traffic_source,'(not set)') as source,
      coalesce(traffic_medium,'(not set)') as medium,
      count(*) filter(where event_type in ('booking_page_viewed','campaign_page_viewed')) as views,
      count(distinct session_key) filter(where event_type in ('booking_page_viewed','campaign_page_viewed')) as visitors,
      count(*) filter(where event_type='booking_started') as booking_starts,
      count(distinct booking_id) filter(where event_type='reservation_created') as reservations
    from e group by 1,2
  )
  select jsonb_build_object(
    'property_id',_property_id,
    'organisation_id',v_org,
    'period',jsonb_build_object('from',_from,'to',_to),
    'funnel',jsonb_build_object(
      'page_views',(select views from stages),
      'unique_sessions',(select visitors from stages),
      'booking_starts',(select starts from stages),
      'availability_searches',(select searches from stages),
      'quotes',(select quotes from stages),
      'reservations',(select reservations from stages),
      'confirmed_reservations',(select confirmed from stages),
      'paid_bookings',(select paid_bookings from stages),
      'booking_start_rate',case when (select visitors from stages)>0 then round(100.0*(select starts from stages)/(select visitors from stages),2) else null end,
      'reservation_rate',case when (select visitors from stages)>0 then round(100.0*(select reservations from stages)/(select visitors from stages),2) else null end,
      'paid_rate',case when (select visitors from stages)>0 then round(100.0*(select paid_bookings from stages)/(select visitors from stages),2) else null end
    ),
    'currencies',coalesce((select jsonb_agg(to_jsonb(money)) from money),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(campaign_rows)) from campaign_rows),'[]'::jsonb),
    'acquisition',coalesce((select jsonb_agg(to_jsonb(acquisition)) from acquisition),'[]'::jsonb),
    'permanent_page',(
      select jsonb_build_object(
        'views',count(*) filter(where event_type='booking_page_viewed' and campaign_id is null),
        'visitors',count(distinct session_key) filter(where event_type='booking_page_viewed' and campaign_id is null),
        'booking_starts',count(*) filter(where event_type='booking_started' and campaign_id is null),
        'quotes',count(*) filter(where event_type='quote_generated' and campaign_id is null),
        'reservations',count(distinct booking_id) filter(where event_type='reservation_created' and campaign_id is null),
        'paid_bookings',count(distinct booking_id) filter(where event_type='payment_completed' and campaign_id is null)
      ) from e
    )
  ) into v_result;
  return v_result;
end
$function$;

revoke all on function public.staynas_get_booking_analytics(uuid,timestamptz,timestamptz)
  from public,anon;
grant execute on function public.staynas_get_booking_analytics(uuid,timestamptz,timestamptz)
  to authenticated,service_role;


commit;
