-- ============ ENUMS ============
create type public.restaurant_order_status as enum ('open','sent','served','closed','cancelled','voided');
create type public.restaurant_order_type as enum ('dine_in','bar','takeaway','room_service','delivery','banquet');
create type public.restaurant_payment_state as enum ('unpaid','partially_paid','paid','refunded','comped','room_charged');
create type public.restaurant_table_status as enum ('available','occupied','reserved','cleaning','out_of_service');
create type public.restaurant_ticket_status as enum ('queued','preparing','ready','served','cancelled');
create type public.restaurant_stock_movement_type as enum ('opening_balance','purchase_receipt','consumption','wastage','transfer_in','transfer_out','adjustment','return_to_supplier');

-- ============ 2.1 SALES & POS ============
create table public.restaurant_service_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  code text not null,
  name text not null,
  start_time time not null default '00:00',
  end_time time not null default '23:59',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_id, code)
);
grant select, insert, update, delete on public.restaurant_service_periods to authenticated;
grant all on public.restaurant_service_periods to service_role;
alter table public.restaurant_service_periods enable row level security;
create policy "service periods readable by tenant" on public.restaurant_service_periods for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "service periods managed by tenant" on public.restaurant_service_periods for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager']::restaurant_role[]));

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  code text not null,
  name text not null,
  zone text,
  seats integer not null default 2,
  status public.restaurant_table_status not null default 'available',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_id, code)
);
grant select, insert, update, delete on public.restaurant_tables to authenticated;
grant all on public.restaurant_tables to service_role;
alter table public.restaurant_tables enable row level security;
create policy "tables readable by tenant" on public.restaurant_tables for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "tables managed by tenant" on public.restaurant_tables for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender']::restaurant_role[]));

create table public.restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  table_id uuid references public.restaurant_tables(id) on delete set null,
  service_period_id uuid references public.restaurant_service_periods(id) on delete set null,
  order_number text not null,
  order_type public.restaurant_order_type not null default 'dine_in',
  status public.restaurant_order_status not null default 'open',
  payment_state public.restaurant_payment_state not null default 'unpaid',
  guest_count integer not null default 1,
  booking_id uuid references public.bookings(id) on delete set null,
  guest_name text,
  server_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  external_ref text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  service_charge numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  cost_total numeric(14,4) not null default 0,
  currency text not null default 'TZS',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_number)
);
create index restaurant_orders_tenant_opened_idx on public.restaurant_orders (tenant_id, opened_at desc);
create index restaurant_orders_location_status_idx on public.restaurant_orders (location_id, status);
grant select, insert, update, delete on public.restaurant_orders to authenticated;
grant all on public.restaurant_orders to service_role;
alter table public.restaurant_orders enable row level security;
create policy "orders readable by tenant" on public.restaurant_orders for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "orders managed by tenant" on public.restaurant_orders for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender','chef','kitchen_manager','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender','chef','kitchen_manager','accountant']::restaurant_role[]));

create table public.restaurant_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  menu_item_id uuid references public.restaurant_menu_items(id) on delete set null,
  station_id uuid,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  line_cost numeric(14,4) not null default 0,
  status text not null default 'ordered',
  course text,
  notes text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index restaurant_order_items_order_idx on public.restaurant_order_items (order_id);
create index restaurant_order_items_menu_item_idx on public.restaurant_order_items (tenant_id, menu_item_id);
grant select, insert, update, delete on public.restaurant_order_items to authenticated;
grant all on public.restaurant_order_items to service_role;
alter table public.restaurant_order_items enable row level security;
create policy "order items readable by tenant" on public.restaurant_order_items for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "order items managed by tenant" on public.restaurant_order_items for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender','chef','kitchen_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender','chef','kitchen_manager']::restaurant_role[]));

create table public.restaurant_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  method text not null default 'cash',
  state public.restaurant_payment_state not null default 'paid',
  amount numeric(14,2) not null default 0,
  tendered numeric(14,2),
  change_due numeric(14,2) not null default 0,
  currency text not null default 'TZS',
  reference text,
  booking_id uuid references public.bookings(id) on delete set null,
  captured_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index restaurant_payments_order_idx on public.restaurant_payments (order_id);
grant select, insert, update, delete on public.restaurant_payments to authenticated;
grant all on public.restaurant_payments to service_role;
alter table public.restaurant_payments enable row level security;
create policy "payments readable by tenant" on public.restaurant_payments for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "payments managed by tenant" on public.restaurant_payments for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]));

-- ============ 2.2 KITCHEN OPERATIONS ============
create table public.restaurant_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  code text not null,
  name text not null,
  station_type text not null default 'kitchen',
  target_prep_minutes integer not null default 15,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_id, code)
);
grant select, insert, update, delete on public.restaurant_stations to authenticated;
grant all on public.restaurant_stations to service_role;
alter table public.restaurant_stations enable row level security;
create policy "stations readable by tenant" on public.restaurant_stations for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "stations managed by tenant" on public.restaurant_stations for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

alter table public.restaurant_order_items
  add constraint restaurant_order_items_station_fk foreign key (station_id) references public.restaurant_stations(id) on delete set null;

create table public.restaurant_kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  station_id uuid references public.restaurant_stations(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  ticket_number text not null,
  status public.restaurant_ticket_status not null default 'queued',
  priority integer not null default 0,
  course text,
  target_minutes integer not null default 15,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  prep_seconds integer,
  delay_seconds integer not null default 0,
  is_delayed boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ticket_number)
);
create index restaurant_kitchen_tickets_status_idx on public.restaurant_kitchen_tickets (tenant_id, status, queued_at);
grant select, insert, update, delete on public.restaurant_kitchen_tickets to authenticated;
grant all on public.restaurant_kitchen_tickets to service_role;
alter table public.restaurant_kitchen_tickets enable row level security;
create policy "tickets readable by tenant" on public.restaurant_kitchen_tickets for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "tickets managed by tenant" on public.restaurant_kitchen_tickets for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager','bartender']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager','bartender']::restaurant_role[]));

create table public.restaurant_kitchen_ticket_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  ticket_id uuid not null references public.restaurant_kitchen_tickets(id) on delete cascade,
  order_item_id uuid references public.restaurant_order_items(id) on delete set null,
  menu_item_id uuid references public.restaurant_menu_items(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1,
  status public.restaurant_ticket_status not null default 'queued',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index restaurant_kitchen_ticket_items_ticket_idx on public.restaurant_kitchen_ticket_items (ticket_id);
grant select, insert, update, delete on public.restaurant_kitchen_ticket_items to authenticated;
grant all on public.restaurant_kitchen_ticket_items to service_role;
alter table public.restaurant_kitchen_ticket_items enable row level security;
create policy "ticket items readable by tenant" on public.restaurant_kitchen_ticket_items for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "ticket items managed by tenant" on public.restaurant_kitchen_ticket_items for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager','bartender']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager','bartender']::restaurant_role[]));

-- ============ 2.3 INVENTORY MOVEMENT ENGINE ============
create table public.restaurant_stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  destination_location_id uuid references public.restaurant_locations(id) on delete set null,
  inventory_item_id uuid not null references public.restaurant_inventory_items(id) on delete cascade,
  unit_id uuid references public.restaurant_inventory_units(id) on delete set null,
  movement_type public.restaurant_stock_movement_type not null,
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4) not null default 0,
  total_cost numeric(14,4) not null default 0,
  currency text not null default 'TZS',
  balance_after numeric(14,4),
  reference_type text,
  reference_id uuid,
  order_item_id uuid references public.restaurant_order_items(id) on delete set null,
  reason text,
  notes text,
  dedupe_key text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);
create index restaurant_stock_movements_item_idx on public.restaurant_stock_movements (tenant_id, inventory_item_id, occurred_at desc);
create index restaurant_stock_movements_type_idx on public.restaurant_stock_movements (tenant_id, movement_type, occurred_at desc);
grant select, insert, update, delete on public.restaurant_stock_movements to authenticated;
grant all on public.restaurant_stock_movements to service_role;
alter table public.restaurant_stock_movements enable row level security;
create policy "movements readable by tenant" on public.restaurant_stock_movements for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "movements managed by tenant" on public.restaurant_stock_movements for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender','purchasing_officer']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender','purchasing_officer']::restaurant_role[]));

-- Movements are the single source of truth for stock levels.
create or replace function public.restaurant_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;
  v_cost numeric;
  v_new_qty numeric;
begin
  select current_quantity, average_cost into v_qty, v_cost
  from public.restaurant_inventory_items
  where id = new.inventory_item_id and tenant_id = new.tenant_id
  for update;

  if v_qty is null then
    return new;
  end if;

  v_new_qty := v_qty + new.quantity;

  -- Weighted-average cost only moves on inbound movements with a stated cost.
  if new.quantity > 0 and new.unit_cost > 0 and v_new_qty > 0 then
    v_cost := ((greatest(v_qty, 0) * coalesce(v_cost, 0)) + (new.quantity * new.unit_cost)) / (greatest(v_qty, 0) + new.quantity);
  end if;

  update public.restaurant_inventory_items
     set current_quantity = v_new_qty,
         average_cost = coalesce(v_cost, average_cost),
         updated_at = now()
   where id = new.inventory_item_id and tenant_id = new.tenant_id;

  new.balance_after := v_new_qty;
  if new.total_cost = 0 and new.unit_cost <> 0 then
    new.total_cost := abs(new.quantity) * new.unit_cost;
  end if;
  return new;
end;
$$;

create trigger restaurant_stock_movement_apply
before insert on public.restaurant_stock_movements
for each row execute function public.restaurant_apply_stock_movement();

-- ============ 2.4 COST INTELLIGENCE ============
create table public.restaurant_profitability_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  menu_item_id uuid references public.restaurant_menu_items(id) on delete set null,
  menu_item_name text not null,
  period_start date not null,
  period_end date not null,
  quantity_sold numeric(14,3) not null default 0,
  revenue numeric(14,2) not null default 0,
  theoretical_cost numeric(14,4) not null default 0,
  actual_cost numeric(14,4) not null default 0,
  variance numeric(14,4) not null default 0,
  gross_profit numeric(14,4) not null default 0,
  margin_percent numeric(6,2),
  food_cost_percent numeric(6,2),
  currency text not null default 'TZS',
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index restaurant_profitability_idx on public.restaurant_profitability_snapshots (tenant_id, period_start desc);
grant select, insert, update, delete on public.restaurant_profitability_snapshots to authenticated;
grant all on public.restaurant_profitability_snapshots to service_role;
alter table public.restaurant_profitability_snapshots enable row level security;
create policy "profitability readable by tenant" on public.restaurant_profitability_snapshots for select to authenticated using (public.restaurant_can_read(tenant_id));
create policy "profitability managed by tenant" on public.restaurant_profitability_snapshots for all to authenticated
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','chef','kitchen_manager','accountant']::restaurant_role[]));

-- ============ updated_at triggers ============
create trigger set_updated_at_restaurant_service_periods before update on public.restaurant_service_periods for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_tables before update on public.restaurant_tables for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_orders before update on public.restaurant_orders for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_order_items before update on public.restaurant_order_items for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_payments before update on public.restaurant_payments for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_stations before update on public.restaurant_stations for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_kitchen_tickets before update on public.restaurant_kitchen_tickets for each row execute function public.set_updated_at();
create trigger set_updated_at_restaurant_kitchen_ticket_items before update on public.restaurant_kitchen_ticket_items for each row execute function public.set_updated_at();