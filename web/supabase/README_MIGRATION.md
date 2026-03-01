# How to run the database migration in Supabase

## 1. Open SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. In the left sidebar, click **SQL Editor**

## 2. Run the migration

1. Click **+ New query**
2. Open the file `web/supabase/migrations/20250228000001_initial_schema.sql` in your project
3. Copy **all** of its contents (Ctrl+A, Ctrl+C)
4. Paste into the Supabase SQL Editor (Ctrl+V)
5. Click **Run** (or press Ctrl+Enter)

You should see: **Success. No rows returned.**

## 3. Create the storage bucket (for seller uploads)

1. In the left sidebar, click **Storage**
2. Click **New bucket**
3. Name: **`listings`**
4. Optionally enable **Public bucket** if you want product images to load without signed URLs
5. Click **Create bucket**

## 4. Done

Your database now has the tables and policies for the campus marketplace. Use your **Project URL**, **anon key**, and **service_role key** (Settings → API) in `web/.env` and `backend/.env`.
