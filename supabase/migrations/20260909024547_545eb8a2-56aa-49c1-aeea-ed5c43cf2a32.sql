-- 1) Restrict avatar uploads to image files inside the user's own folder
DROP POLICY IF EXISTS "Avatar images only" ON storage.objects;
CREATE POLICY "Avatar images only"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id <> 'avatars'
  OR (
    (storage.foldername(name))[1] = auth.uid()::text
    AND lower(coalesce(metadata->>'mimetype', '')) LIKE 'image/%'
  )
);

DROP POLICY IF EXISTS "Avatar images only update" ON storage.objects;
CREATE POLICY "Avatar images only update"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  bucket_id <> 'avatars'
  OR (
    (storage.foldername(name))[1] = auth.uid()::text
    AND lower(coalesce(metadata->>'mimetype', '')) LIKE 'image/%'
  )
);

-- 2) Block privilege escalation through profile self-updates (defense in depth alongside the existing trigger)
DROP POLICY IF EXISTS "profiles_no_privilege_escalation" ON public.profiles;
CREATE POLICY "profiles_no_privilege_escalation"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = profiles.id
      AND p.role IS NOT DISTINCT FROM profiles.role
      AND p.plan IS NOT DISTINCT FROM profiles.plan
      AND p.allowed_types IS NOT DISTINCT FROM profiles.allowed_types
      AND p.is_frozen IS NOT DISTINCT FROM profiles.is_frozen
      AND p.subscription_expires_at IS NOT DISTINCT FROM profiles.subscription_expires_at
  )
);