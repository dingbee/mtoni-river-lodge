-- CPS-03 runtime: transactional offer configuration, publication quota gate,
-- trusted lifecycle transitions, and server-only RPC grants.
-- Existing property, currency, rate publication and booking records are untouched.

create or replace function public.cps03_configure_booking_campaign(
  _campaign_id uuid,
  _property_id uuid,
  _organisation_id uuid,
  _room_ids uuid[],
  _publication_id uuid,
  _offer_code text,
  _offer_title text,
  _offer_description text,
  _actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_campaign public.booking_campaigns%rowtype;
  v_property public.staynas_properties%rowtype;
  v_room_count integer;
  v_publication record;
begin
  select * into v_campaign
  from public.booking_campaigns
  where id = _campaign_id and property_id = _property_id
    and organisation_id = _organisation_id
  for update;
  if not found then raise exception 'Campaign is not part of the verified property'; end if;
  if v_campaign.status not in ('draft','paused') then
    raise exception 'Only draft or paused campaigns can be configured';
  end if;

  select * into v_property from public.staynas_properties
  where id = _property_id and organisation_id = _organisation_id and status = 'active';
  if not found or v_property.currency is null or v_property.currency !~ '^[A-Z]{3}$' then
    raise exception 'Active property currency is missing or invalid';
  end if;

  if coalesce(cardinality(_room_ids),0) = 0 then
    raise exception 'Select at least one active room type';
  end if;
  select count(distinct r.id) into v_room_count
  from public.rooms r
  where r.property_id = _property_id and r.status = 'active'
    and r.id = any(_room_ids);
  if v_room_count <> cardinality(_room_ids) then
    raise exception 'One or more selected rooms are unavailable or belong to another property';
  end if;

  select pub.id, pub.rate_plan_id, pub.currency, pub.effective_from, pub.effective_to,
         p.active, p.publication_status, p.currency as plan_currency
  into v_publication
  from public.staynas_rate_plan_publications pub
  join public.staynas_rate_plans p
    on p.id = pub.rate_plan_id and p.property_id = pub.property_id
  where pub.id = _publication_id and pub.property_id = _property_id
    and p.active = true and p.publication_status = 'published'
    and pub.currency = v_property.currency and p.currency = v_property.currency
    and (pub.effective_from is null or pub.effective_from <= current_date)
    and (pub.effective_to is null or pub.effective_to >= current_date)
  order by pub.publication_number desc
  limit 1;
  if not found then
    raise exception 'Offer must reference a current published rate-plan snapshot in the property currency';
  end if;

  update public.campaign_offers set active = false, updated_at = now()
  where campaign_id = _campaign_id and property_id = _property_id;
  delete from public.campaign_room_selections
  where campaign_id = _campaign_id and property_id = _property_id;

  insert into public.campaign_room_selections(campaign_id,property_id,room_id,sort_order)
  select _campaign_id,_property_id,r.id,r.ordinality::integer
  from unnest(_room_ids) with ordinality as r(id,ordinality);

  insert into public.campaign_offers(
    campaign_id,property_id,offer_code,title,description,rate_plan_publication_id,sort_order,active
  ) values (
    _campaign_id,_property_id,_offer_code,_offer_title,_offer_description,_publication_id,0,true
  );

  update public.booking_campaigns set updated_by = _actor_id, updated_at = now()
  where id = _campaign_id and property_id = _property_id;

  return jsonb_build_object('ok',true,'campaign_id',_campaign_id,'selected_rooms',v_room_count,
    'rate_plan_publication_id',v_publication.id,'currency',v_property.currency);
end
$function$;

create or replace function public.cps03_publish_booking_campaign(
  _campaign_id uuid,
  _property_id uuid,
  _organisation_id uuid,
  _actor_id uuid,
  _usage_limit integer
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_campaign public.booking_campaigns%rowtype;
  v_property public.staynas_properties%rowtype;
  v_active_count integer;
  v_content_id uuid;
  v_room_count integer;
  v_offer_count integer;
begin
  if _usage_limit is null or _usage_limit < 0 then
    raise exception 'A valid founder-published active campaign quota is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_property_id::text || ':cps03_active_campaigns',0));
  select * into v_campaign
  from public.booking_campaigns
  where id = _campaign_id and property_id = _property_id
    and organisation_id = _organisation_id
  for update;
  if not found then raise exception 'Campaign is not part of the verified property'; end if;
  if v_campaign.status not in ('draft','paused','expired') then
    raise exception 'Campaign cannot be published from its current lifecycle state';
  end if;
  if v_campaign.ends_at is not null and v_campaign.ends_at <= now() then
    raise exception 'An expired campaign cannot be republished; update its dates first';
  end if;

  select * into v_property from public.staynas_properties
  where id = _property_id and organisation_id = _organisation_id
    and status = 'active' and currency ~ '^[A-Z]{3}$';
  if not found then raise exception 'Active property and valid configured currency are required'; end if;

  select count(*) into v_active_count from public.booking_campaigns c
  where c.property_id = _property_id and c.status = 'published'
    and c.id <> _campaign_id and (c.ends_at is null or c.ends_at > now());
  if v_active_count >= _usage_limit then
    raise exception 'The property active-campaign quota has been reached';
  end if;

  select count(*) into v_room_count
  from public.campaign_room_selections s
  join public.rooms r on r.id = s.room_id and r.property_id = s.property_id
  where s.campaign_id = _campaign_id and s.property_id = _property_id and r.status = 'active';
  if v_room_count = 0 then raise exception 'Campaign requires at least one active selected room'; end if;

  select count(*) into v_offer_count
  from public.campaign_offers o
  join public.staynas_rate_plan_publications pub
    on pub.id = o.rate_plan_publication_id and pub.property_id = o.property_id
  join public.staynas_rate_plans p
    on p.id = pub.rate_plan_id and p.property_id = pub.property_id
  where o.campaign_id = _campaign_id and o.property_id = _property_id and o.active = true
    and p.active = true and p.publication_status = 'published'
    and pub.currency = v_property.currency and p.currency = v_property.currency
    and (pub.effective_to is null or pub.effective_to >= coalesce(v_campaign.starts_at::date,current_date))
    and (pub.effective_from is null or pub.effective_from <= coalesce(v_campaign.ends_at::date,current_date));
  if v_offer_count = 0 then
    raise exception 'Campaign requires an active offer linked to a current published rate-plan snapshot in the property currency';
  end if;

  select id into v_content_id from public.campaign_page_content
  where campaign_id = _campaign_id and property_id = _property_id and status = 'draft'
  order by version desc limit 1;
  if v_content_id is null then raise exception 'Campaign requires a saved draft content version'; end if;

  update public.campaign_page_content set status = 'superseded', updated_at = now()
  where campaign_id = _campaign_id and property_id = _property_id and status = 'published';
  update public.campaign_page_content set status = 'published', published_at = now(),
    updated_by = _actor_id, updated_at = now()
  where id = v_content_id and property_id = _property_id;

  update public.booking_campaigns set status = 'published', published_at = now(),
    updated_by = _actor_id, updated_at = now()
  where id = _campaign_id and property_id = _property_id;

  return jsonb_build_object('ok',true,'campaign_id',_campaign_id,
    'published_content_id',v_content_id,'active_campaign_count',v_active_count + 1,
    'currency',v_property.currency);
end
$function$;

create or replace function public.cps03_transition_booking_campaign(
  _campaign_id uuid,
  _property_id uuid,
  _organisation_id uuid,
  _actor_id uuid,
  _action text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_campaign public.booking_campaigns%rowtype;
  v_next_status text;
begin
  select * into v_campaign from public.booking_campaigns
  where id = _campaign_id and property_id = _property_id
    and organisation_id = _organisation_id
  for update;
  if not found then raise exception 'Campaign is not part of the verified property'; end if;

  if _action = 'pause' and v_campaign.status = 'published' then
    v_next_status := 'paused';
  elsif _action = 'expire' and v_campaign.status = 'published'
    and v_campaign.ends_at is not null and v_campaign.ends_at <= now() then
    v_next_status := 'expired';
  elsif _action = 'archive' and v_campaign.status in ('draft','paused','expired') then
    v_next_status := 'archived';
  else
    raise exception 'Invalid campaign lifecycle transition';
  end if;

  update public.booking_campaigns set status = v_next_status,
    archived_at = case when v_next_status = 'archived' then now() else archived_at end,
    updated_by = _actor_id, updated_at = now()
  where id = _campaign_id and property_id = _property_id;

  return jsonb_build_object('ok',true,'campaign_id',_campaign_id,'status',v_next_status);
end
$function$;

revoke all on function public.cps03_configure_booking_campaign(uuid,uuid,uuid,uuid[],uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.cps03_publish_booking_campaign(uuid,uuid,uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.cps03_transition_booking_campaign(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.cps03_configure_booking_campaign(uuid,uuid,uuid,uuid[],uuid,text,text,text,uuid) to service_role;
grant execute on function public.cps03_publish_booking_campaign(uuid,uuid,uuid,uuid,integer) to service_role;
grant execute on function public.cps03_transition_booking_campaign(uuid,uuid,uuid,uuid,text) to service_role;
