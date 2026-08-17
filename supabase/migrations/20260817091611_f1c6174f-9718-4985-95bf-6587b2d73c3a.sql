ALTER TABLE public.restaurant_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.restaurant_goods_receipt_items
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.restaurant_inventory_batches(id) ON DELETE SET NULL;

-- One logical reversal per original movement, enforced by the database and not
-- by the UI: a retried void, a replayed request and a double tap collapse into
-- the same single correction.
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_stock_movements_reversal_once_idx
  ON public.restaurant_stock_movements (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.restaurant_apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qty numeric;
  v_cost numeric;
  v_new_qty numeric;
  v_allow_negative boolean;
  v_name text;
begin
  select current_quantity, average_cost, allow_negative, name
    into v_qty, v_cost, v_allow_negative, v_name
  from public.restaurant_inventory_items
  where id = new.inventory_item_id and tenant_id = new.tenant_id
  for update;

  if v_qty is null then
    return new;
  end if;

  v_new_qty := v_qty + new.quantity;

  -- Negative stock policy, enforced for every path. Corrections (reversal,
  -- adjustment) and inbound movements are always allowed; an outbound movement
  -- is refused when it would break the balance, unless the item permits
  -- negative stock or a supervisor approved this specific movement.
  if v_new_qty < 0
     and new.quantity < 0
     and new.movement_type not in ('reversal', 'adjustment')
     and coalesce(v_allow_negative, false) = false
     and new.approved_by is null then
    raise exception 'negative_stock: % would go to % on this movement (%). Receive stock, correct the count, or allow negative stock for this item.',
      coalesce(v_name, 'Stock item'), v_new_qty, new.movement_type
      using errcode = 'check_violation';
  end if;

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
$function$;