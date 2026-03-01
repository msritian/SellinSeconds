-- When buyer accepts a helper before a buyer-seller chat exists, we store it here.
-- When that chat is created (initiate), we add the helper to the chat and remove from this table.
CREATE TABLE IF NOT EXISTS public.product_accepted_helpers (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, buyer_id, helper_id)
);

ALTER TABLE public.product_accepted_helpers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer can insert own accepted helper" ON public.product_accepted_helpers FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Participants can read for their product chat" ON public.product_accepted_helpers FOR SELECT USING (auth.uid() = buyer_id);
CREATE POLICY "Delete after add to chat" ON public.product_accepted_helpers FOR DELETE USING (auth.uid() = buyer_id);

CREATE INDEX IF NOT EXISTS idx_product_accepted_helpers_lookup ON public.product_accepted_helpers(product_id, buyer_id);
