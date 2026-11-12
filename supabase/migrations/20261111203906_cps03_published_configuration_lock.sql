-- CPS-03 immutability: published campaign configuration and content can only
-- change through the trusted server lifecycle; draft content is versioned by insert.

create or replace function public.cps03_guard_published_campaign_configuration()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_campaign_id uuid;
  v_status text;
begin
  if current_user = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name = 'booking_campaigns' then
    if tg_op = 'DELETE' and old.status = 'published' then
      raise exception 'Pause a published campaign before deleting it' using errcode = '42501';
    elsif tg_op = 'UPDATE' and old.status = 'published' then
      raise exception 'Pause a published campaign before changing its configuration' using errcode = '42501';
    end if;
  else
    if tg_op = 'DELETE' then v_campaign_id := old.campaign_id;
    else v_campaign_id := new.campaign_id;
    end if;
    select status into v_status from public.booking_campaigns where id = v_campaign_id;
    if v_status = 'published' then
      raise exception 'Pause a published campaign before changing rooms or offers' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;

create or replace function public.cps03_guard_campaign_content_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Campaign content versions are immutable; save a new draft version'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;

drop trigger if exists cps03_booking_campaign_config_lock on public.booking_campaigns;
create trigger cps03_booking_campaign_config_lock
before update or delete on public.booking_campaigns
for each row execute function public.cps03_guard_published_campaign_configuration();

drop trigger if exists cps03_campaign_room_selection_lock on public.campaign_room_selections;
create trigger cps03_campaign_room_selection_lock
before insert or update or delete on public.campaign_room_selections
for each row execute function public.cps03_guard_published_campaign_configuration();

drop trigger if exists cps03_campaign_offer_lock on public.campaign_offers;
create trigger cps03_campaign_offer_lock
before insert or update or delete on public.campaign_offers
for each row execute function public.cps03_guard_published_campaign_configuration();

drop trigger if exists cps03_campaign_content_immutable on public.campaign_page_content;
create trigger cps03_campaign_content_immutable
before update or delete on public.campaign_page_content
for each row execute function public.cps03_guard_campaign_content_immutability();

comment on function public.cps03_guard_published_campaign_configuration() is
  'CPS-03: tenants must pause a published campaign before changing its route, schedule, rooms or offers.';
comment on function public.cps03_guard_campaign_content_immutability() is
  'CPS-03: campaign content is versioned by insert; tenant updates/deletes are prohibited.';
