-- CPS-03: property-scoped booking pages and campaign data foundation.
-- No tenant records are seeded. Public booking and campaign writes remain disabled;
-- publication and booking orchestration are implemented in later CPS milestones.

create unique index if not exists staynas_properties_id_organisation_uidx
  on public.staynas_properties (id, organisation_id);
create unique index if not exists rooms_id_property_uidx
  on public.rooms (id, property_id);
create unique index if not exists bookings_id_property_uidx
  on public.bookings (id, property_id);
create unique index if not exists staynas_rate_plan_publications_id_property_uidx
  on public.staynas_rate_plan_publications (id, property_id);

create table public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  property_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft','published','paused')),
  title text not null check (length(trim(title)) between 2 and 160),
  seo_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(seo_metadata) = 'object'),
  theme_config jsonb not null default '{}'::jsonb check (jsonb_typeof(theme_config) = 'object'),
  booking_config jsonb not null default '{}'::jsonb check (jsonb_typeof(booking_config) = 'object'),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_pages_property_slug_key unique (property_id, slug),
  constraint booking_pages_one_per_property_key unique (property_id),
  constraint booking_pages_property_organisation_fkey
    foreign key (property_id, organisation_id)
    references public.staynas_properties (id, organisation_id) on delete cascade
);

create table public.booking_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  property_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 2 and 160),
  status text not null default 'draft'
    check (status in ('draft','published','paused','expired','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_campaigns_property_slug_key unique (property_id, slug),
  constraint booking_campaigns_id_property_key unique (id, property_id),
  constraint booking_campaigns_property_organisation_fkey
    foreign key (property_id, organisation_id)
    references public.staynas_properties (id, organisation_id) on delete cascade,
  constraint booking_campaigns_valid_window_check
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table public.campaign_page_content (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  property_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','published','superseded')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_page_content_version_key unique (campaign_id, version),
  constraint campaign_page_content_id_property_key unique (id, property_id),
  constraint campaign_page_content_campaign_property_fkey
    foreign key (campaign_id, property_id)
    references public.booking_campaigns (id, property_id) on delete cascade
);

create table public.campaign_room_selections (
  campaign_id uuid not null,
  property_id uuid not null,
  room_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  display_config jsonb not null default '{}'::jsonb check (jsonb_typeof(display_config) = 'object'),
  created_at timestamptz not null default now(),
  primary key (campaign_id, property_id, room_id),
  constraint campaign_room_selections_campaign_property_fkey
    foreign key (campaign_id, property_id)
    references public.booking_campaigns (id, property_id) on delete cascade,
  constraint campaign_room_selections_room_property_fkey
    foreign key (room_id, property_id)
    references public.rooms (id, property_id) on delete restrict
);

create table public.campaign_offers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  property_id uuid not null,
  offer_code text not null check (offer_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  rate_plan_publication_id uuid,
  display_config jsonb not null default '{}'::jsonb check (jsonb_typeof(display_config) = 'object'),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_offers_code_key unique (campaign_id, offer_code),
  constraint campaign_offers_campaign_property_fkey
    foreign key (campaign_id, property_id)
    references public.booking_campaigns (id, property_id) on delete cascade,
  constraint campaign_offers_rate_publication_property_fkey
    foreign key (rate_plan_publication_id, property_id)
    references public.staynas_rate_plan_publications (id, property_id) on delete restrict
);

create table public.campaign_attribution (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  property_id uuid not null,
  booking_id uuid,
  session_key text not null check (length(trim(session_key)) between 16 and 200),
  event_type text not null
    check (event_type in ('page_view','booking_click','booking_started','lead_submitted','booking_completed')),
  source text,
  medium text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint campaign_attribution_campaign_property_fkey
    foreign key (campaign_id, property_id)
    references public.booking_campaigns (id, property_id) on delete cascade,
  constraint campaign_attribution_booking_property_fkey
    foreign key (booking_id, property_id)
    references public.bookings (id, property_id) on delete restrict
);

create index booking_campaigns_property_status_window_idx
  on public.booking_campaigns (property_id, status, starts_at, ends_at);
create index campaign_page_content_campaign_status_idx
  on public.campaign_page_content (campaign_id, property_id, status, version desc);
create index campaign_room_selections_property_room_idx
  on public.campaign_room_selections (property_id, room_id);
create index campaign_offers_campaign_active_order_idx
  on public.campaign_offers (campaign_id, property_id, active, sort_order);
create index campaign_attribution_property_campaign_time_idx
  on public.campaign_attribution (property_id, campaign_id, occurred_at desc);
create index campaign_attribution_booking_idx
  on public.campaign_attribution (booking_id, property_id) where booking_id is not null;

alter table public.booking_pages enable row level security;
alter table public.booking_campaigns enable row level security;
alter table public.campaign_page_content enable row level security;
alter table public.campaign_room_selections enable row level security;
alter table public.campaign_offers enable row level security;
alter table public.campaign_attribution enable row level security;

-- Public reads are restricted to published pages/campaigns on active properties.
create policy booking_pages_public_published_read
  on public.booking_pages for select to anon, authenticated
  using (
    status = 'published'
  );

create policy booking_campaigns_public_published_read
  on public.booking_campaigns for select to anon, authenticated
  using (
    status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

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
    )
  );

create policy campaign_room_selections_public_published_read
  on public.campaign_room_selections for select to anon, authenticated
  using (
    exists (
      select 1 from public.booking_campaigns c
      where c.id = campaign_room_selections.campaign_id
        and c.property_id = campaign_room_selections.property_id
        and c.status = 'published'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    )
  );

create policy campaign_offers_public_published_read
  on public.campaign_offers for select to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.booking_campaigns c
      where c.id = campaign_offers.campaign_id
        and c.property_id = campaign_offers.property_id
        and c.status = 'published'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    )
  );

-- Tenant staff can administer only properties to which they have active membership.
-- Tenant admins own campaign operations; founder commercial controls stay outside this scope.
create policy booking_pages_property_staff_manage
  on public.booking_pages for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  );

create policy booking_campaigns_property_staff_manage
  on public.booking_campaigns for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  );

create policy campaign_page_content_property_staff_manage
  on public.campaign_page_content for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  );

create policy campaign_room_selections_property_staff_manage
  on public.campaign_room_selections for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  );

create policy campaign_offers_property_staff_manage
  on public.campaign_offers for all to authenticated
  using (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  )
  with check (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    and public.has_any_role(auth.uid(), array['owner','manager','admin','marketing']::public.app_role[])
  );

create policy campaign_attribution_property_staff_read
  on public.campaign_attribution for select to authenticated
  using (public.staynas_user_has_property_access(auth.uid(), property_id));

grant select on public.booking_pages, public.booking_campaigns, public.campaign_page_content,
  public.campaign_room_selections, public.campaign_offers to anon, authenticated;
-- Publication state is server-controlled. Tenant clients can create drafts and edit
-- content/configuration, but cannot publish or unpublish pages/campaigns/content directly.
grant insert (organisation_id, property_id, slug, title, seo_metadata, theme_config,
  booking_config, created_by, updated_by) on public.booking_pages to authenticated;
grant update (slug, title, seo_metadata, theme_config, booking_config, updated_by, updated_at)
  on public.booking_pages to authenticated;
grant delete on public.booking_pages to authenticated;

grant insert (organisation_id, property_id, slug, name, starts_at, ends_at, created_by, updated_by)
  on public.booking_campaigns to authenticated;
grant update (slug, name, starts_at, ends_at, updated_by, updated_at)
  on public.booking_campaigns to authenticated;
grant delete on public.booking_campaigns to authenticated;

grant insert (campaign_id, property_id, version, content, created_by, updated_by)
  on public.campaign_page_content to authenticated;
grant update (content, updated_by, updated_at) on public.campaign_page_content to authenticated;
grant delete on public.campaign_page_content to authenticated;

grant insert, update, delete on public.campaign_room_selections, public.campaign_offers
  to authenticated;
grant select on public.campaign_attribution to authenticated;
grant all on public.booking_pages, public.booking_campaigns, public.campaign_page_content,
  public.campaign_room_selections, public.campaign_offers, public.campaign_attribution
  to service_role;

comment on table public.booking_pages is 'One permanent direct-booking page configuration per StayNas property.';
comment on table public.booking_campaigns is 'Tenant-managed, property-scoped campaign pages; publication is gated by CPS-04.';
comment on table public.campaign_page_content is 'Versioned campaign page content, isolated by campaign and property.';
comment on table public.campaign_room_selections is 'Property-validated room selections for campaign presentation; pricing remains in StayNas Pricing Engine.';
comment on table public.campaign_offers is 'Campaign display offers linked to immutable published StayNas rate-plan snapshots; no client-authored prices.';
comment on table public.campaign_attribution is 'Server-written campaign interaction and booking attribution evidence.';
