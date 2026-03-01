-- Campus Marketplace: initial schema for Supabase (PostgreSQL)
-- Run this in Supabase SQL Editor or via supabase db push

-- Users (extends Supabase auth; link via id = auth.uid())
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  approximate_location JSONB, -- { lat, lng, label }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own row" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own row" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Listing drafts (seller flow: LLM extraction before publish)
CREATE TABLE IF NOT EXISTS public.listing_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  extracted JSONB NOT NULL, -- item_name, description, price, location, media_urls
  markdown_preview TEXT,
  media_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.listing_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own drafts" ON public.listing_drafts FOR ALL USING (auth.uid() = user_id);

-- Products (published listings)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
  location JSONB NOT NULL, -- { lat, lng, label }
  media_urls JSONB NOT NULL DEFAULT '[]', -- [{ url, thumbnail_url, media_type }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are readable by all" ON public.products FOR SELECT USING (true);
CREATE POLICY "Sellers can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can update own products" ON public.products FOR UPDATE USING (auth.uid() = seller_id);

-- Helper profiles
CREATE TABLE IF NOT EXISTS public.helper_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  location JSONB NOT NULL,
  vehicle_type TEXT NOT NULL,
  lift_capacity_kg DECIMAL(10,2) NOT NULL,
  default_quoted_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  assistance_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.helper_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Helper profiles readable by all" ON public.helper_profiles FOR SELECT USING (true);
CREATE POLICY "Users manage own helper profile" ON public.helper_profiles FOR ALL USING (auth.uid() = user_id);

-- Product-helpers (helpers interested in delivering a product)
CREATE TABLE IF NOT EXISTS public.product_helpers (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
  quoted_fee DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, helper_id)
);

ALTER TABLE public.product_helpers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Product helpers readable by all" ON public.product_helpers FOR SELECT USING (true);
CREATE POLICY "Helpers can insert own interest" ON public.product_helpers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.helper_profiles hp WHERE hp.id = helper_id AND hp.user_id = auth.uid())
);
CREATE POLICY "Helpers can delete own interest" ON public.product_helpers FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.helper_profiles hp WHERE hp.id = helper_id AND hp.user_id = auth.uid())
);

-- Chats (2-party or 3-party)
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can create chat" ON public.chats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Chat participants (buyer, seller, helper)
CREATE TABLE IF NOT EXISTS public.chat_participants (
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'helper')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can read own chats" ON public.chat_participants FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = chat_participants.chat_id AND cp.user_id = auth.uid())
);
CREATE POLICY "Participants can insert when in chat" ON public.chat_participants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Participants can update for their chat" ON public.chat_participants FOR UPDATE USING (auth.uid() = user_id);

-- Chats SELECT policy (must come after chat_participants exists)
CREATE POLICY "Chat participants can read chat" ON public.chats FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chat_participants WHERE chat_id = chats.id AND user_id = auth.uid())
);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants can read messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chat_participants WHERE chat_id = messages.chat_id AND user_id = auth.uid())
);
CREATE POLICY "Chat participants can send messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.chat_participants WHERE chat_id = messages.chat_id AND user_id = auth.uid())
);

-- Finalize intents (buyer + seller both confirm "Finalize Deal")
CREATE TABLE IF NOT EXISTS public.finalize_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buyer_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  seller_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  amount DECIMAL(12,2) NOT NULL,
  hold_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.finalize_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can manage finalize intents" ON public.finalize_intents FOR ALL USING (
  auth.uid() = buyer_id OR auth.uid() = seller_id
);

-- Payment holds (escrow)
CREATE TABLE IF NOT EXISTS public.payment_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can read holds" ON public.payment_holds FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chat_participants WHERE chat_id = payment_holds.chat_id AND user_id = auth.uid())
);
CREATE POLICY "System can insert holds" ON public.payment_holds FOR INSERT WITH CHECK (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_seller_status ON public.products(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_product_helpers_product ON public.product_helpers(product_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_chat ON public.chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_helper_profiles_user ON public.helper_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_listing_drafts_user ON public.listing_drafts(user_id);
