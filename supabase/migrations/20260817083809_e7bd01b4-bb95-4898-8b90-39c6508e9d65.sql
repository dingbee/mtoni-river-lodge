-- 1. Scope restaurant procurement policies to authenticated role
ALTER POLICY "variance read" ON public.restaurant_procurement_variances TO authenticated;
ALTER POLICY "variance write" ON public.restaurant_procurement_variances TO authenticated;
ALTER POLICY "confirmation read" ON public.restaurant_supplier_confirmations TO authenticated;
ALTER POLICY "confirmation write" ON public.restaurant_supplier_confirmations TO authenticated;
ALTER POLICY "confirmation items read" ON public.restaurant_supplier_confirmation_items TO authenticated;
ALTER POLICY "confirmation items write" ON public.restaurant_supplier_confirmation_items TO authenticated;
ALTER POLICY "procurement audit read" ON public.restaurant_procurement_audit TO authenticated;
ALTER POLICY "procurement audit append" ON public.restaurant_procurement_audit TO authenticated;
ALTER POLICY "pr read" ON public.restaurant_purchase_requests TO authenticated;
ALTER POLICY "pr write" ON public.restaurant_purchase_requests TO authenticated;
ALTER POLICY "pr items read" ON public.restaurant_purchase_request_items TO authenticated;
ALTER POLICY "pr items write" ON public.restaurant_purchase_request_items TO authenticated;
ALTER POLICY "receipt read" ON public.restaurant_goods_receipts TO authenticated;
ALTER POLICY "receipt write" ON public.restaurant_goods_receipts TO authenticated;
ALTER POLICY "receipt items read" ON public.restaurant_goods_receipt_items TO authenticated;
ALTER POLICY "receipt items write" ON public.restaurant_goods_receipt_items TO authenticated;
ALTER POLICY "invoice read" ON public.restaurant_supplier_invoices TO authenticated;
ALTER POLICY "invoice write" ON public.restaurant_supplier_invoices TO authenticated;
ALTER POLICY "invoice items read" ON public.restaurant_supplier_invoice_items TO authenticated;
ALTER POLICY "invoice items write" ON public.restaurant_supplier_invoice_items TO authenticated;
ALTER POLICY "price history read" ON public.restaurant_supplier_price_history TO authenticated;
ALTER POLICY "price history write" ON public.restaurant_supplier_price_history TO authenticated;
ALTER POLICY "approval rules read" ON public.restaurant_approval_rules TO authenticated;
ALTER POLICY "approval rules write" ON public.restaurant_approval_rules TO authenticated;
ALTER POLICY "doc seq read" ON public.restaurant_document_sequences TO authenticated;
ALTER POLICY "doc seq write" ON public.restaurant_document_sequences TO authenticated;

-- 2. Narrow guest PII access to a restricted staff subset
CREATE OR REPLACE FUNCTION public.is_guest_pii_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','manager','admin','reception','reservations')
  )
$$;

DROP POLICY IF EXISTS "guests_staff_all" ON public.guests;
CREATE POLICY "guests_pii_staff_all" ON public.guests FOR ALL TO authenticated
  USING (public.is_guest_pii_staff(auth.uid()))
  WITH CHECK (public.is_guest_pii_staff(auth.uid()));

DROP POLICY IF EXISTS "guest_comms_staff_all" ON public.guest_communications;
CREATE POLICY "guest_comms_pii_staff_all" ON public.guest_communications FOR ALL TO authenticated
  USING (public.is_guest_pii_staff(auth.uid()))
  WITH CHECK (public.is_guest_pii_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage guest documents" ON public.guest_documents;
CREATE POLICY "Guest PII staff manage guest documents" ON public.guest_documents FOR ALL TO authenticated
  USING (public.is_guest_pii_staff(auth.uid()))
  WITH CHECK (public.is_guest_pii_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage guest checkins" ON public.guest_checkins;
CREATE POLICY "Guest PII staff manage guest checkins" ON public.guest_checkins FOR ALL TO authenticated
  USING (public.is_guest_pii_staff(auth.uid()))
  WITH CHECK (public.is_guest_pii_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage arrival information" ON public.arrival_information;
CREATE POLICY "Ops staff manage arrival information" ON public.arrival_information FOR ALL TO authenticated
  USING (public.is_guest_pii_staff(auth.uid()) OR public.has_role(auth.uid(), 'housekeeping'))
  WITH CHECK (public.is_guest_pii_staff(auth.uid()) OR public.has_role(auth.uid(), 'housekeeping'));
