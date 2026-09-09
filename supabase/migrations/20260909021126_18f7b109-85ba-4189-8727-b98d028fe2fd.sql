CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS allowed_types text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_frozen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_session_id text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS username text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, role, plan, allowed_types)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'user',
    'none',
    '{}'::text[]
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

create table if not exists public.site_settings (
  id              smallint primary key default 1,
  mascot_enabled  boolean  not null default true,
  mascot_size     smallint not null default 120,
  updated_at      timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  subject text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS username   text,
  ADD COLUMN IF NOT EXISTS reply      text;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS mascot_enabled boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS mascot_size    int         DEFAULT 120,
  ADD COLUMN IF NOT EXISTS mascot_bottom  int         DEFAULT 50,
  ADD COLUMN IF NOT EXISTS mascot_right   int         DEFAULT 12,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

INSERT INTO public.site_settings (id, mascot_enabled, mascot_size, mascot_bottom, mascot_right)
VALUES (1, true, 120, 50, 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, username, role, plan, allowed_types)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
  'user',
  'none',
  '{}'::text[]
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

UPDATE public.profiles
SET role           = 'owner',
    plan           = 'enterprise',
    is_frozen      = false,
    allowed_types  = ARRAY[
      'bm_meta_tool','meta_ads_one_way','mini_meta_2','cc_from_bm',
      'bm_creator','cc_tools','vortex_meta_tools','remove_payment',
      'add_funds_meta','add_primary_cc','switch_bm_old',
      'funds','ads','cards','paypal','gateway','iban',
      'methods','debug','generator','checker','email',
      'social','proxy','support'
    ]
WHERE lower(email) IN (
  'beshoyyy1986@gmail.com',
  'beshoyyy1986@outlook.com'
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END;
$$;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.support_tickets', pol.policyname);
  END LOOP;
END;
$$;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.site_settings', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_service_role_all"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tickets_select_own"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tickets_insert_own"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tickets_service_role_all"
  ON public.support_tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "settings_select_public"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "settings_service_role_all"
  ON public.site_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatar user upload" ON storage.objects;
CREATE POLICY "Avatar user upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Avatar user update" ON storage.objects;
CREATE POLICY "Avatar user update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Avatar user delete" ON storage.objects;
CREATE POLICY "Avatar user delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.role                    := OLD.role;
  NEW.plan                    := OLD.plan;
  NEW.allowed_types           := OLD.allowed_types;
  NEW.is_frozen               := OLD.is_frozen;
  NEW.subscription_expires_at := OLD.subscription_expires_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

CREATE OR REPLACE FUNCTION public.force_default_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.role                    := 'user';
  NEW.plan                    := 'none';
  NEW.allowed_types           := '{}'::text[];
  NEW.is_frozen               := false;
  NEW.subscription_expires_at := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS force_default_profile_privileges ON public.profiles;
CREATE TRIGGER force_default_profile_privileges
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_default_profile_privileges();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_last_seen_at_idx
  ON public.profiles (last_seen_at DESC NULLS LAST);

UPDATE public.profiles
SET role          = 'owner',
    plan          = 'enterprise',
    is_frozen     = false,
    allowed_types = ARRAY[
      'bm_meta_tool','meta_ads_one_way','mini_meta_2','cc_from_bm',
      'bm_creator','inviter_user_bm','cc_tools','vortex_meta_tools',
      'remove_payment','add_funds_meta','add_primary_cc','switch_bm_old',
      'funds','ads','cards','paypal','gateway','iban','methods',
      'debug','generator','checker','email','social','proxy','support'
    ]
WHERE lower(email) IN (
  'beshoyyy1986@gmail.com',
  'beshoyyy1986@outlook.com'
);

CREATE OR REPLACE FUNCTION public.promote_owner_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) IN (
    'beshoyyy1986@gmail.com',
    'beshoyyy1986@outlook.com'
  ) THEN
    NEW.role          := 'owner';
    NEW.plan          := 'enterprise';
    NEW.is_frozen     := false;
    NEW.allowed_types := ARRAY[
      'bm_meta_tool','meta_ads_one_way','mini_meta_2','cc_from_bm',
      'bm_creator','inviter_user_bm','cc_tools','vortex_meta_tools',
      'remove_payment','add_funds_meta','add_primary_cc','switch_bm_old',
      'funds','ads','cards','paypal','gateway','iban','methods',
      'debug','generator','checker','email','social','proxy','support'
    ];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_promote_owner_on_signup ON public.profiles;
CREATE TRIGGER zz_promote_owner_on_signup
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.promote_owner_on_signup();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'site_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype  = 'f'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND contype  = 'f'
  ) THEN
    ALTER TABLE public.support_tickets
      ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx
  ON public.support_tickets (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;