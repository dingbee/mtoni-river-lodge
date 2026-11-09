-- CPS-03 schedule operations use the property's configured IANA timezone.
-- Date-only inputs are converted to inclusive property-local calendar-day bounds.

create or replace function public.cps03_create_booking_campaign(
  _organisation_id uuid,
  _property_id uuid,
  _slug text,
  _name text,
  _starts_on date,
  _ends_on date,
  _actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_property public.staynas_properties%rowtype;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_campaign public.booking_campaigns%rowtype;
begin
  select * into v_property from public.staynas_properties
  where id = _property_id and organisation_id = _organisation_id and status = 'active';
  if not found or nullif(trim(v_property.timezone),'') is null
    or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_property.timezone) then
    raise exception 'Active property with a valid configured IANA timezone is required';
  end if;
  if _starts_on is not null and _ends_on is not null and _ends_on < _starts_on then
    raise exception 'Campaign end date must not precede its start date';
  end if;
  v_starts_at := case when _starts_on is null then null
    else (_starts_on::timestamp at time zone v_property.timezone) end;
  v_ends_at := case when _ends_on is null then null
    else (((_ends_on + 1)::timestamp at time zone v_property.timezone) - interval '1 microsecond') end;

  insert into public.booking_campaigns(
    organisation_id,property_id,slug,name,status,starts_at,ends_at,created_by,updated_by
  ) values (
    _organisation_id,_property_id,_slug,_name,'draft',v_starts_at,v_ends_at,_actor_id,_actor_id
  ) returning * into v_campaign;

  return jsonb_build_object('id',v_campaign.id,'slug',v_campaign.slug,'name',v_campaign.name,
    'status',v_campaign.status,'starts_at',v_campaign.starts_at,'ends_at',v_campaign.ends_at);
end
$function$;

create or replace function public.cps03_set_campaign_schedule(
  _campaign_id uuid,
  _property_id uuid,
  _organisation_id uuid,
  _starts_on date,
  _ends_on date,
  _actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_property public.staynas_properties%rowtype;
  v_campaign public.booking_campaigns%rowtype;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select * into v_campaign from public.booking_campaigns
  where id = _campaign_id and property_id = _property_id and organisation_id = _organisation_id
  for update;
  if not found then raise exception 'Campaign is not part of the verified property'; end if;
  if v_campaign.status not in ('draft','paused','expired') then
    raise exception 'Pause the campaign before changing its schedule';
  end if;
  select * into v_property from public.staynas_properties
  where id = _property_id and organisation_id = _organisation_id and status = 'active';
  if not found or nullif(trim(v_property.timezone),'') is null
    or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_property.timezone) then
    raise exception 'Active property with a valid configured IANA timezone is required';
  end if;
  if _starts_on is not null and _ends_on is not null and _ends_on < _starts_on then
    raise exception 'Campaign end date must not precede its start date';
  end if;
  v_starts_at := case when _starts_on is null then null
    else (_starts_on::timestamp at time zone v_property.timezone) end;
  v_ends_at := case when _ends_on is null then null
    else (((_ends_on + 1)::timestamp at time zone v_property.timezone) - interval '1 microsecond') end;

  update public.booking_campaigns set starts_at = v_starts_at, ends_at = v_ends_at,
    updated_by = _actor_id, updated_at = now()
  where id = _campaign_id and property_id = _property_id
  returning * into v_campaign;

  return jsonb_build_object('id',v_campaign.id,'starts_at',v_campaign.starts_at,
    'ends_at',v_campaign.ends_at,'status',v_campaign.status);
end
$function$;

revoke all on function public.cps03_create_booking_campaign(uuid,uuid,text,text,date,date,uuid) from public, anon, authenticated;
revoke all on function public.cps03_set_campaign_schedule(uuid,uuid,uuid,date,date,uuid) from public, anon, authenticated;
grant execute on function public.cps03_create_booking_campaign(uuid,uuid,text,text,date,date,uuid) to service_role;
grant execute on function public.cps03_set_campaign_schedule(uuid,uuid,uuid,date,date,uuid) to service_role;
