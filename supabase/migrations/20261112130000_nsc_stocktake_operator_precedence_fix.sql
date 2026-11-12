-- Repair the stocktake trigger's text-concatenation/operator precedence.
-- Keep this as a forward migration because the original NSC migration may already be applied.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_nsc_lexibite_inventory_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, nsc_private
AS $nsc$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_tenant_id uuid;
  v_remote_property_id uuid;
  v_local_property_id uuid;
  v_item_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_event_type text;
  v_dedupe_key text;
  v_severity text := 'info';
  v_title text;
  v_body text;
  v_status text;
  v_movement text;
  v_quantity numeric;
  v_threshold numeric;
  v_item_name text;
  v_roles public.app_role[] := ARRAY['owner','manager','admin','finance']::public.app_role[];
  v_occurred_at timestamptz := COALESCE(NULLIF(v_new->>'occurred_at','')::timestamptz,
    NULLIF(v_new->>'updated_at','')::timestamptz, clock_timestamp());
  v_correlation_id uuid;
  v_conn record;
BEGIN
  v_tenant_id := NULLIF(v_new->>'tenant_id','')::uuid;
  v_remote_property_id := NULLIF(v_new->>'property_id','')::uuid;
  IF v_remote_property_id IS NULL THEN
    IF TG_TABLE_NAME = 'restaurant_stock_transfers' THEN
      SELECT l.property_id INTO v_remote_property_id
      FROM public.restaurant_locations l
      WHERE l.id = NULLIF(v_new->>'source_location_id','')::uuid
        AND l.tenant_id = v_tenant_id;
    ELSE
      SELECT l.property_id INTO v_remote_property_id
      FROM public.restaurant_locations l
      WHERE l.id = COALESCE(NULLIF(v_new->>'location_id','')::uuid,
                            NULLIF(v_new->>'source_location_id','')::uuid)
        AND l.tenant_id = v_tenant_id;
    END IF;
  END IF;
  IF v_tenant_id IS NULL OR v_remote_property_id IS NULL THEN RETURN NEW; END IF;

  v_status := v_new->>'status';
  v_entity_id := NULLIF(v_new->>'id','')::uuid;
  v_entity_type := TG_TABLE_NAME;
  v_item_id := COALESCE(NULLIF(v_new->>'inventory_item_id','')::uuid, v_entity_id);
  v_correlation_id := CASE
    WHEN COALESCE(v_new->>'correlation_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (v_new->>'correlation_id')::uuid ELSE NULL END;

  CASE TG_TABLE_NAME
    WHEN 'restaurant_inventory_items' THEN
      v_entity_type := 'inventory_item';
      v_quantity := NULLIF(v_new->>'current_quantity','')::numeric;
      v_threshold := COALESCE(NULLIF(v_new->>'reorder_point','')::numeric,
                              NULLIF(v_new->>'par_level','')::numeric);
      IF v_quantity IS NULL OR v_threshold IS NULL THEN RETURN NEW; END IF;
      IF v_quantity <= v_threshold THEN
        IF TG_OP = 'UPDATE'
           AND NULLIF(v_old->>'current_quantity','')::numeric <= v_threshold
           AND NULLIF(v_old->>'reorder_point','')::numeric IS NOT DISTINCT FROM NULLIF(v_new->>'reorder_point','')::numeric
           AND NULLIF(v_old->>'par_level','')::numeric IS NOT DISTINCT FROM NULLIF(v_new->>'par_level','')::numeric THEN
          RETURN NEW;
        END IF;
        v_event_type := 'inventory_low_stock';
        v_severity := 'warning';
        v_title := 'Inventory below reorder level';
        v_body := COALESCE(v_new->>'name','Inventory item') || ' is at ' || v_quantity::text ||
          ' (reorder level ' || v_threshold::text || ').';
        v_dedupe_key := 'lexibite:low-stock:' || v_item_id::text || ':' || to_char(v_occurred_at,'YYYYMMDDHH24MI');
        v_entity_id := v_item_id;
      ELSE
        IF TG_OP = 'UPDATE' AND NULLIF(v_old->>'current_quantity','')::numeric <=
          COALESCE(NULLIF(v_old->>'reorder_point','')::numeric,NULLIF(v_old->>'par_level','')::numeric) THEN
          FOR v_conn IN
            SELECT c.local_property_id FROM public.staynas_product_connections c
            WHERE c.remote_product='lexibite' AND c.remote_tenant_id=v_tenant_id
              AND c.remote_property_id=v_remote_property_id AND c.status='active'
              AND c.local_approved_at IS NOT NULL AND c.remote_approved_at IS NOT NULL
          LOOP
            PERFORM nsc_private.staynas_resolve_entity_notifications(
              v_conn.local_property_id,'inventory_item',v_item_id,
              ARRAY['inventory_low_stock']::text[],NULL,'inventory_replenished'
            );
          END LOOP;
        END IF;
        RETURN NEW;
      END IF;

    WHEN 'restaurant_stock_movements' THEN
      v_entity_type := 'inventory_item';
      v_movement := v_new->>'movement_type';
      IF v_movement NOT IN ('wastage','adjustment','adjustment_out','return_to_supplier','reversal','transfer_out') THEN
        RETURN NEW;
      END IF;
      v_event_type := 'inventory_stock_movement_' || v_movement;
      v_severity := CASE WHEN v_movement IN ('wastage','adjustment_out','return_to_supplier') THEN 'warning' ELSE 'info' END;
      v_title := 'Inventory ' || replace(v_movement,'_',' ');
      SELECT i.name INTO v_item_name FROM public.restaurant_inventory_items i
      WHERE i.id=v_item_id AND i.tenant_id=v_tenant_id AND i.property_id=v_remote_property_id;
      v_body := COALESCE(v_item_name,'Inventory item') || ': ' ||
        COALESCE(v_new->>'quantity','0') || ' units recorded';
      v_dedupe_key := 'lexibite:stock-movement:' || v_entity_id::text;
      v_entity_id := v_item_id;

    WHEN 'restaurant_purchase_orders' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status NOT IN ('submitted','approved','partially_received','received','cancelled') THEN RETURN NEW; END IF;
      v_event_type := 'inventory_purchase_order_' || v_status;
      v_severity := CASE WHEN v_status='cancelled' THEN 'warning' ELSE 'info' END;
      v_title := 'Purchase order ' || replace(v_status,'_',' ');
      v_body := 'Purchase order ' || COALESCE(v_new->>'reference',v_entity_id::text);
      v_dedupe_key := 'lexibite:purchase-order:' || v_entity_id::text || ':' || v_status || ':' || COALESCE(v_new->>'updated_at',clock_timestamp()::text);

    WHEN 'restaurant_goods_receipts' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status NOT IN ('posted','cancelled') THEN RETURN NEW; END IF;
      v_event_type := 'inventory_goods_receipt_' || v_status;
      v_severity := CASE WHEN v_status='cancelled' THEN 'warning' ELSE 'info' END;
      v_title := 'Goods receipt ' || v_status;
      v_body := 'Goods receipt ' || COALESCE(v_new->>'document_number',v_entity_id::text);
      v_dedupe_key := 'lexibite:goods-receipt:' || v_entity_id::text || ':' || v_status;

    WHEN 'restaurant_stocktakes' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status <> 'posted' OR COALESCE(NULLIF(v_new->>'variance_value','')::numeric,0)=0 THEN RETURN NEW; END IF;
      v_event_type := 'inventory_stocktake_variance';
      v_severity := 'warning';
      v_title := 'Stocktake variance posted';
      v_body := 'Stocktake ' || COALESCE(v_new->>'stocktake_number',v_entity_id::text) ||
        ' posted with variance ' || (v_new->>'variance_value') || ' ' || COALESCE(v_new->>'currency','');
      v_dedupe_key := 'lexibite:stocktake:' || v_entity_id::text || ':posted';

    WHEN 'restaurant_stock_transfers' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status NOT IN ('requested','approved','rejected','dispatched','partially_received','received','completed','cancelled') THEN RETURN NEW; END IF;
      v_event_type := 'inventory_transfer_' || v_status;
      v_severity := CASE WHEN v_status IN ('rejected','cancelled') THEN 'warning' ELSE 'info' END;
      v_title := 'Stock transfer ' || replace(v_status,'_',' ');
      v_body := 'Stock transfer ' || COALESCE(v_new->>'transfer_number',v_entity_id::text);
      v_dedupe_key := 'lexibite:stock-transfer:' || v_entity_id::text || ':' || v_status;

    WHEN 'restaurant_reconciliation_exceptions' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status'
         AND v_new->>'resolution' IS NOT DISTINCT FROM v_old->>'resolution' THEN RETURN NEW; END IF;
      IF v_status IN ('resolved','closed') OR v_new->>'resolution' IS NOT NULL THEN
        v_event_type := 'inventory_reconciliation_exception_resolved';
        v_title := 'Inventory reconciliation exception resolved';
        v_severity := 'info';
      ELSE
        v_event_type := 'inventory_reconciliation_exception_opened';
        v_title := COALESCE(v_new->>'title','Inventory reconciliation exception');
        v_severity := CASE WHEN lower(COALESCE(v_new->>'severity','warning'))='critical' THEN 'critical' ELSE 'warning' END;
      END IF;
      v_body := COALESCE(v_new->>'what_happened',v_new->>'required_action','Inventory reconciliation requires attention');
      v_dedupe_key := 'lexibite:reconciliation-exception:' || v_entity_id::text || ':' || v_event_type;
    ELSE
      RETURN NEW;
  END CASE;

  FOR v_conn IN
    SELECT c.id,c.local_property_id
    FROM public.staynas_product_connections c
    WHERE c.remote_product='lexibite'
      AND c.remote_tenant_id=v_tenant_id
      AND c.remote_property_id=v_remote_property_id
      AND c.status='active'
      AND c.local_approved_at IS NOT NULL
      AND c.remote_approved_at IS NOT NULL
  LOOP
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_conn.local_property_id,
      'integrations.lexibite.inventory',
      v_dedupe_key,
      v_event_type,
      'inventory',
      v_entity_type,
      v_entity_id,
      NULL,NULL,NULL,
      v_roles,
      v_severity,
      left(COALESCE(v_title,'Inventory update'),200),
      left(COALESCE(v_body,'LexiBite inventory event'),1000),
      '/admin/inventory',
      jsonb_build_object(
        'source_product','lexibite','remote_tenant_id',v_tenant_id,
        'remote_property_id',v_remote_property_id,'source_table',TG_TABLE_NAME,
        'source_entity_id',v_entity_id,'event_type',v_event_type
      ),
      v_correlation_id,
      v_occurred_at
    );
    IF TG_TABLE_NAME='restaurant_reconciliation_exceptions'
       AND v_event_type='inventory_reconciliation_exception_resolved' THEN
      PERFORM nsc_private.staynas_resolve_entity_notifications(
        v_conn.local_property_id,'restaurant_reconciliation_exceptions',v_entity_id,
        ARRAY['inventory_reconciliation_exception_opened']::text[],NULL,'inventory_reconciliation_resolved'
      );
    END IF;
    IF TG_TABLE_NAME='restaurant_inventory_items' AND v_event_type='inventory_low_stock' THEN
      -- Low-stock event is already deduplicated per connected property and item update.
      NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$nsc$;
REVOKE ALL ON FUNCTION public.staynas_nsc_lexibite_inventory_event() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
