CREATE TABLE public.restaurant_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid,
  location_id uuid,
  document_type text NOT NULL,
  document_id uuid,
  document_number text,
  action text NOT NULL,
  format text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.restaurant_document_events TO authenticated;
GRANT ALL ON public.restaurant_document_events TO service_role;

ALTER TABLE public.restaurant_document_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members read document events"
  ON public.restaurant_document_events FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));

CREATE POLICY "Restaurant members append document events"
  ON public.restaurant_document_events FOR INSERT TO authenticated
  WITH CHECK (public.restaurant_can_read(tenant_id) AND actor_id = auth.uid());

CREATE INDEX restaurant_document_events_tenant_idx
  ON public.restaurant_document_events (tenant_id, created_at DESC);
CREATE INDEX restaurant_document_events_doc_idx
  ON public.restaurant_document_events (tenant_id, document_type, document_id);
CREATE INDEX restaurant_document_events_number_idx
  ON public.restaurant_document_events (tenant_id, document_number);