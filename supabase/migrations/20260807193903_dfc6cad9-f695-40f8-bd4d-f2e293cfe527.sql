-- ============ ENUMS ============
create type public.restaurant_pr_status as enum ('draft','submitted','approved','rejected','converted_to_po','cancelled');
create type public.restaurant_pr_priority as enum ('low','normal','high','urgent');
create type public.restaurant_confirmation_status as enum ('pending','confirmed','partially_confirmed','declined');
create type public.restaurant_receipt_status as enum ('draft','posted','cancelled');
create type public.restaurant_invoice_status as enum ('draft','recorded','matched','disputed','cancelled');
create type public.restaurant_procurement_payment_status as enum ('unpaid','partially_paid','paid','disputed');
create type public.restaurant_variance_type as enum ('quantity','price','quality','delivery','tax','invoice');
create type public.restaurant_variance_status as enum ('open','accepted','resolved','escalated');

-- ============ DOCUMENT NUMBERING ============
create table public.restaurant_document_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  doc_type text not null,
  prefix text not null,
  next_number bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, doc_type)
);
grant select, insert, update, delete on public.restaurant_document_sequences to authenticated;
grant all on public.restaurant_document_sequences to service_role;
alter table public.restaurant_document_sequences enable row level security;
create policy "doc seq read" on public.restaurant_document_sequences for select using (public.restaurant_can_read(tenant_id));
create policy "doc seq write" on public.restaurant_document_sequences for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]));

create or replace function public.restaurant_next_document_number(_tenant uuid, _doc_type text, _prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare _n bigint; _p text;
begin
  if not public.restaurant_can_read(_tenant) then
    raise exception 'Forbidden — not a member of this restaurant tenant.';
  end if;
  insert into public.restaurant_document_sequences (tenant_id, doc_type, prefix, next_number)
  values (_tenant, _doc_type, coalesce(nullif(_prefix,''), upper(left(_doc_type, 3))), 1)
  on conflict (tenant_id, doc_type)
  do update set next_number = public.restaurant_document_sequences.next_number + 1, updated_at = now()
  returning next_number, prefix into _n, _p;
  return _p || '-' || to_char(now(), 'YYYY') || '-' || lpad(_n::text, 5, '0');
end;
$$;

-- ============ PURCHASE REQUESTS ============
create table public.restaurant_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  document_number text not null,
  status public.restaurant_pr_status not null default 'draft',
  priority public.restaurant_pr_priority not null default 'normal',
  category text,
  reason text,
  notes text,
  currency text not null default 'TZS',
  estimated_total numeric(14,2) not null default 0,
  requested_by uuid not null,
  requested_date date not null default current_date,
  required_by_date date,
  submitted_at timestamptz,
  submitted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  cancelled_at timestamptz,
  converted_purchase_order_id uuid references public.restaurant_purchase_orders(id) on delete set null,
  converted_at timestamptz,
  version integer not null default 1,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_number)
);
grant select, insert, update, delete on public.restaurant_purchase_requests to authenticated;
grant all on public.restaurant_purchase_requests to service_role;
alter table public.restaurant_purchase_requests enable row level security;
create policy "pr read" on public.restaurant_purchase_requests for select using (public.restaurant_can_read(tenant_id));
create policy "pr write" on public.restaurant_purchase_requests for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager','bartender']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager','bartender']::restaurant_role[]));
create index idx_rest_pr_tenant_status on public.restaurant_purchase_requests (tenant_id, status, created_at desc);

create table public.restaurant_purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  purchase_request_id uuid not null references public.restaurant_purchase_requests(id) on delete cascade,
  inventory_item_id uuid references public.restaurant_inventory_items(id) on delete set null,
  unit_id uuid references public.restaurant_inventory_units(id) on delete set null,
  preferred_supplier_id uuid references public.restaurant_suppliers(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 0,
  approved_quantity numeric(14,3),
  estimated_unit_cost numeric(14,4) not null default 0,
  estimated_total numeric(14,2) not null default 0,
  justification text,
  recommendation_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.restaurant_purchase_request_items to authenticated;
grant all on public.restaurant_purchase_request_items to service_role;
alter table public.restaurant_purchase_request_items enable row level security;
create policy "pr items read" on public.restaurant_purchase_request_items for select using (public.restaurant_can_read(tenant_id));
create policy "pr items write" on public.restaurant_purchase_request_items for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager','bartender']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager','bartender']::restaurant_role[]));
create index idx_rest_pr_items_request on public.restaurant_purchase_request_items (purchase_request_id);

-- ============ APPROVAL RULES ============
create table public.restaurant_approval_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete cascade,
  location_id uuid references public.restaurant_locations(id) on delete cascade,
  document_type text not null default 'purchase_request',
  category text,
  currency text not null default 'TZS',
  min_amount numeric(14,2) not null default 0,
  max_amount numeric(14,2),
  approver_roles public.restaurant_role[] not null default array['owner','general_manager','restaurant_manager']::restaurant_role[],
  require_separation_of_duties boolean not null default true,
  priority integer not null default 100,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.restaurant_approval_rules to authenticated;
grant all on public.restaurant_approval_rules to service_role;
alter table public.restaurant_approval_rules enable row level security;
create policy "approval rules read" on public.restaurant_approval_rules for select using (public.restaurant_can_read(tenant_id));
create policy "approval rules write" on public.restaurant_approval_rules for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager']::restaurant_role[]));

-- ============ PURCHASE ORDER EXTENSIONS ============
alter table public.restaurant_purchase_orders
  add column if not exists document_number text,
  add column if not exists purchase_request_id uuid references public.restaurant_purchase_requests(id) on delete set null,
  add column if not exists buyer_id uuid,
  add column if not exists requested_delivery_date date,
  add column if not exists payment_terms text,
  add column if not exists discount_total numeric(14,2) not null default 0,
  add column if not exists supplier_reference text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_status public.restaurant_confirmation_status not null default 'pending',
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists version integer not null default 1;

alter table public.restaurant_purchase_order_items
  add column if not exists tax_rate numeric(6,3) not null default 0,
  add column if not exists tax_amount numeric(14,2) not null default 0,
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists accepted_quantity numeric(14,3) not null default 0,
  add column if not exists rejected_quantity numeric(14,3) not null default 0,
  add column if not exists confirmed_quantity numeric(14,3),
  add column if not exists confirmed_unit_price numeric(14,4);

-- ============ SUPPLIER CONFIRMATION ============
create table public.restaurant_supplier_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  purchase_order_id uuid not null references public.restaurant_purchase_orders(id) on delete cascade,
  document_number text not null,
  supplier_reference text,
  status public.restaurant_confirmation_status not null default 'confirmed',
  confirmed_delivery_date date,
  confirmed_at timestamptz not null default now(),
  notes text,
  recorded_by uuid not null,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_number)
);
grant select, insert, update, delete on public.restaurant_supplier_confirmations to authenticated;
grant all on public.restaurant_supplier_confirmations to service_role;
alter table public.restaurant_supplier_confirmations enable row level security;
create policy "confirmation read" on public.restaurant_supplier_confirmations for select using (public.restaurant_can_read(tenant_id));
create policy "confirmation write" on public.restaurant_supplier_confirmations for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]));

create table public.restaurant_supplier_confirmation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  confirmation_id uuid not null references public.restaurant_supplier_confirmations(id) on delete cascade,
  purchase_order_item_id uuid not null references public.restaurant_purchase_order_items(id) on delete cascade,
  ordered_quantity numeric(14,3) not null default 0,
  confirmed_quantity numeric(14,3) not null default 0,
  ordered_unit_price numeric(14,4) not null default 0,
  confirmed_unit_price numeric(14,4) not null default 0,
  confirmed_delivery_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.restaurant_supplier_confirmation_items to authenticated;
grant all on public.restaurant_supplier_confirmation_items to service_role;
alter table public.restaurant_supplier_confirmation_items enable row level security;
create policy "confirmation items read" on public.restaurant_supplier_confirmation_items for select using (public.restaurant_can_read(tenant_id));
create policy "confirmation items write" on public.restaurant_supplier_confirmation_items for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]));

-- ============ GOODS RECEIVING ============
create table public.restaurant_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  purchase_order_id uuid references public.restaurant_purchase_orders(id) on delete set null,
  supplier_id uuid references public.restaurant_suppliers(id) on delete set null,
  document_number text not null,
  status public.restaurant_receipt_status not null default 'draft',
  delivery_note_ref text,
  received_at timestamptz not null default now(),
  expected_at date,
  received_by uuid not null,
  posted_at timestamptz,
  posted_by uuid,
  currency text not null default 'TZS',
  subtotal numeric(14,2) not null default 0,
  accepted_value numeric(14,2) not null default 0,
  notes text,
  version integer not null default 1,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_number)
);
grant select, insert, update, delete on public.restaurant_goods_receipts to authenticated;
grant all on public.restaurant_goods_receipts to service_role;
alter table public.restaurant_goods_receipts enable row level security;
create policy "receipt read" on public.restaurant_goods_receipts for select using (public.restaurant_can_read(tenant_id));
create policy "receipt write" on public.restaurant_goods_receipts for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager']::restaurant_role[]));
create index idx_rest_receipts_po on public.restaurant_goods_receipts (purchase_order_id);

create table public.restaurant_goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  receipt_id uuid not null references public.restaurant_goods_receipts(id) on delete cascade,
  purchase_order_item_id uuid references public.restaurant_purchase_order_items(id) on delete set null,
  inventory_item_id uuid references public.restaurant_inventory_items(id) on delete set null,
  unit_id uuid references public.restaurant_inventory_units(id) on delete set null,
  storage_location_id uuid references public.restaurant_locations(id) on delete set null,
  description text not null,
  ordered_quantity numeric(14,3) not null default 0,
  received_quantity numeric(14,3) not null default 0,
  accepted_quantity numeric(14,3) not null default 0,
  rejected_quantity numeric(14,3) not null default 0,
  damaged_quantity numeric(14,3) not null default 0,
  ordered_unit_cost numeric(14,4) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  currency text not null default 'TZS',
  batch_code text,
  expiry_date date,
  rejection_reason text,
  notes text,
  stock_movement_id uuid references public.restaurant_stock_movements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.restaurant_goods_receipt_items to authenticated;
grant all on public.restaurant_goods_receipt_items to service_role;
alter table public.restaurant_goods_receipt_items enable row level security;
create policy "receipt items read" on public.restaurant_goods_receipt_items for select using (public.restaurant_can_read(tenant_id));
create policy "receipt items write" on public.restaurant_goods_receipt_items for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager']::restaurant_role[]));
create index idx_rest_receipt_items_receipt on public.restaurant_goods_receipt_items (receipt_id);

-- ============ VARIANCES ============
create table public.restaurant_procurement_variances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  variance_type public.restaurant_variance_type not null,
  severity text not null default 'medium',
  status public.restaurant_variance_status not null default 'open',
  purchase_order_id uuid references public.restaurant_purchase_orders(id) on delete cascade,
  receipt_id uuid references public.restaurant_goods_receipts(id) on delete cascade,
  receipt_item_id uuid references public.restaurant_goods_receipt_items(id) on delete cascade,
  invoice_id uuid,
  supplier_id uuid references public.restaurant_suppliers(id) on delete set null,
  label text not null,
  expected_value numeric(14,4),
  actual_value numeric(14,4),
  variance_value numeric(14,4),
  variance_pct numeric(10,4),
  unit text,
  currency text,
  detail jsonb not null default '{}'::jsonb,
  dedupe_key text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);
grant select, insert, update, delete on public.restaurant_procurement_variances to authenticated;
grant all on public.restaurant_procurement_variances to service_role;
alter table public.restaurant_procurement_variances enable row level security;
create policy "variance read" on public.restaurant_procurement_variances for select using (public.restaurant_can_read(tenant_id));
create policy "variance write" on public.restaurant_procurement_variances for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant','chef','kitchen_manager']::restaurant_role[]));
create index idx_rest_variance_open on public.restaurant_procurement_variances (tenant_id, status, detected_at desc);

-- ============ SUPPLIER PRICE HISTORY ============
create table public.restaurant_supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  supplier_id uuid not null references public.restaurant_suppliers(id) on delete cascade,
  inventory_item_id uuid references public.restaurant_inventory_items(id) on delete set null,
  supplier_product_id uuid references public.restaurant_supplier_products(id) on delete set null,
  unit_id uuid references public.restaurant_inventory_units(id) on delete set null,
  price_type text not null,
  price numeric(14,4) not null,
  quantity numeric(14,3),
  currency text not null default 'TZS',
  effective_date date not null default current_date,
  source_type text,
  source_id uuid,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);
grant select, insert, update, delete on public.restaurant_supplier_price_history to authenticated;
grant all on public.restaurant_supplier_price_history to service_role;
alter table public.restaurant_supplier_price_history enable row level security;
create policy "price history read" on public.restaurant_supplier_price_history for select using (public.restaurant_can_read(tenant_id));
create policy "price history write" on public.restaurant_supplier_price_history for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::restaurant_role[]));
create index idx_rest_price_history_lookup on public.restaurant_supplier_price_history (tenant_id, supplier_id, inventory_item_id, effective_date desc);

-- ============ SUPPLIER INVOICES ============
create table public.restaurant_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  property_id uuid references public.restaurant_properties(id) on delete set null,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  supplier_id uuid references public.restaurant_suppliers(id) on delete set null,
  purchase_order_id uuid references public.restaurant_purchase_orders(id) on delete set null,
  document_number text not null,
  supplier_invoice_number text not null,
  status public.restaurant_invoice_status not null default 'recorded',
  payment_status public.restaurant_procurement_payment_status not null default 'unpaid',
  match_status text not null default 'unmatched',
  matched_at timestamptz,
  invoice_date date not null default current_date,
  due_date date,
  currency text not null default 'TZS',
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  attachment_url text,
  notes text,
  recorded_by uuid not null,
  version integer not null default 1,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_number),
  unique (tenant_id, supplier_id, supplier_invoice_number)
);
grant select, insert, update, delete on public.restaurant_supplier_invoices to authenticated;
grant all on public.restaurant_supplier_invoices to service_role;
alter table public.restaurant_supplier_invoices enable row level security;
create policy "invoice read" on public.restaurant_supplier_invoices for select using (public.restaurant_can_read(tenant_id));
create policy "invoice write" on public.restaurant_supplier_invoices for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','accountant']::restaurant_role[]));

create table public.restaurant_supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  invoice_id uuid not null references public.restaurant_supplier_invoices(id) on delete cascade,
  purchase_order_item_id uuid references public.restaurant_purchase_order_items(id) on delete set null,
  receipt_item_id uuid references public.restaurant_goods_receipt_items(id) on delete set null,
  inventory_item_id uuid references public.restaurant_inventory_items(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,4) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.restaurant_supplier_invoice_items to authenticated;
grant all on public.restaurant_supplier_invoice_items to service_role;
alter table public.restaurant_supplier_invoice_items enable row level security;
create policy "invoice items read" on public.restaurant_supplier_invoice_items for select using (public.restaurant_can_read(tenant_id));
create policy "invoice items write" on public.restaurant_supplier_invoice_items for all
  using (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','accountant']::restaurant_role[]))
  with check (public.restaurant_can_write(tenant_id, array['owner','general_manager','restaurant_manager','purchasing_officer','accountant']::restaurant_role[]));

alter table public.restaurant_procurement_variances
  add constraint restaurant_variance_invoice_fk foreign key (invoice_id) references public.restaurant_supplier_invoices(id) on delete cascade;

-- ============ PROCUREMENT AUDIT TRAIL ============
create table public.restaurant_procurement_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurant_tenants(id) on delete cascade,
  document_type text not null,
  document_id uuid not null,
  document_number text,
  action text not null,
  previous_state text,
  new_state text,
  reason text,
  actor_id uuid,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.restaurant_procurement_audit to authenticated;
grant all on public.restaurant_procurement_audit to service_role;
alter table public.restaurant_procurement_audit enable row level security;
create policy "procurement audit read" on public.restaurant_procurement_audit for select using (public.restaurant_can_read(tenant_id));
create policy "procurement audit append" on public.restaurant_procurement_audit for insert
  with check (public.restaurant_can_read(tenant_id) and actor_id = auth.uid());
create index idx_rest_proc_audit_doc on public.restaurant_procurement_audit (tenant_id, document_type, document_id, created_at desc);

-- ============ TIMESTAMP TRIGGERS ============
create trigger set_updated_at before update on public.restaurant_document_sequences for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_purchase_requests for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_purchase_request_items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_approval_rules for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_supplier_confirmations for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_supplier_confirmation_items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_goods_receipts for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_goods_receipt_items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_procurement_variances for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_supplier_price_history for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_supplier_invoices for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.restaurant_supplier_invoice_items for each row execute function public.set_updated_at();