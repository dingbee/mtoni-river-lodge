-- Sprint 5.11: menu lifecycle, allergen model, guest dietary context

alter table public.restaurant_menu_items
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists lifecycle_changed_at timestamptz not null default now(),
  add column if not exists lifecycle_changed_by uuid,
  add column if not exists discontinued_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists unavailable_reason text,
  add column if not exists allergen_status text not null default 'unknown',
  add column if not exists allergen_reviewed_at timestamptz,
  add column if not exists allergen_reviewed_by uuid;

update public.restaurant_menu_items
  set lifecycle_status = case when coalesce(available, true) then 'active' else 'paused' end
  where lifecycle_status = 'draft';

do $$ begin
  alter table public.restaurant_menu_items
    add constraint restaurant_menu_items_lifecycle_chk
    check (lifecycle_status in ('draft','active','paused','discontinued','archived'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.restaurant_menu_items
    add constraint restaurant_menu_items_allergen_status_chk
    check (allergen_status in ('unknown','declared','none'));
exception when duplicate_object then null; end $$;

create index if not exists restaurant_menu_items_lifecycle_idx
  on public.restaurant_menu_items (tenant_id, lifecycle_status);

alter table public.restaurant_inventory_items
  add column if not exists allergens text[] not null default '{}'::text[],
  add column if not exists allergen_status text not null default 'unknown',
  add column if not exists allergen_reviewed_at timestamptz,
  add column if not exists allergen_reviewed_by uuid;

do $$ begin
  alter table public.restaurant_inventory_items
    add constraint restaurant_inventory_items_allergen_status_chk
    check (allergen_status in ('unknown','declared','none'));
exception when duplicate_object then null; end $$;

alter table public.guest_preferences
  add column if not exists kind text not null default 'preference',
  add column if not exists state text not null default 'observed',
  add column if not exists confidence numeric,
  add column if not exists severity text,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists observed_count integer not null default 1,
  add column if not exists last_observed_at timestamptz;

do $$ begin
  alter table public.guest_preferences
    add constraint guest_preferences_kind_chk
    check (kind in ('preference','dietary_requirement','allergy'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.guest_preferences
    add constraint guest_preferences_state_chk
    check (state in ('observed','confirmed','recurring'));
exception when duplicate_object then null; end $$;

create index if not exists guest_preferences_kind_idx on public.guest_preferences (guest_id, kind);