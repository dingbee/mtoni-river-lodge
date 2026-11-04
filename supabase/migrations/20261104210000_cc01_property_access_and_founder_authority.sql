-- CC-01 P0 remediation: enforce tenant lifecycle in property access and
-- make the platform-admin registry the canonical founder authority.
-- This migration is intentionally staged for review; it has NOT been applied.

begin;

create or replace function public.staynas_user_has_property_access(
  _uid uuid,
  _property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.staynas_property_members pm
    join public.staynas_properties p
      on p.id = pm.property_id
    join public.staynas_organisations o
      on o.id = p.organisation_id
    where pm.user_id = _uid
      and pm.property_id = _property_id
      and pm.status = 'active'
      and p.status <> 'suspended'
      and o.status = 'active'
  );
$function$;

create or replace function public.staynas_current_property_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select pm.role::text
  from public.staynas_user_property_context c
  join public.staynas_property_members pm
    on pm.property_id = c.property_id
   and pm.user_id = c.user_id
  join public.staynas_properties p
    on p.id = c.property_id
  join public.staynas_organisations o
    on o.id = p.organisation_id
  where c.user_id = auth.uid()
    and pm.status = 'active'
    and p.status <> 'suspended'
    and o.status = 'active'
  limit 1;
$function$;

-- Founder/platform authority is independent of operational property ownership.
-- The registry is service-role managed and self-readable under its existing RLS.
create or replace function public.is_staynas_founder_ai_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.staynas_platform_admins platform_admin
    where platform_admin.user_id = auth.uid()
  );
$function$;


-- Return every active role in the explicitly selected property. The previous
-- scalar helper could silently discard roles for multi-role property members.
create or replace function public.staynas_current_property_roles()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(array_agg(distinct pm.role::text order by pm.role::text), array[]::text[])
  from public.staynas_user_property_context c
  join public.staynas_property_members pm
    on pm.property_id = c.property_id
   and pm.user_id = c.user_id
  join public.staynas_properties p
    on p.id = c.property_id
  join public.staynas_organisations o
    on o.id = p.organisation_id
  where c.user_id = auth.uid()
    and pm.status = 'active'
    and p.status <> 'suspended'
    and o.status = 'active';
$function$;

revoke all on function public.staynas_current_property_roles() from public, anon;
grant execute on function public.staynas_current_property_roles() to authenticated, service_role;

commit;
