-- Create the `post-photos` storage bucket used by the circle compose screen.
-- Without this bucket, `supabase.storage.from('post-photos').upload(...)`
-- returns "Bucket not found" and photo uploads fail.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-photos',
  'post-photos',
  true, -- public reads so <Image source={{ uri: publicUrl }} /> works
  10 * 1024 * 1024, -- 10 MB cap
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------
-- Storage RLS: only authenticated users can upload, and only under
-- their own user id prefix (e.g. `<uid>/<timestamp>.jpg`).
-- Reads are public because the bucket is public.
-- ------------------------------------------------------------------

-- Drop previous policies with the same names if re-running.
drop policy if exists "post-photos read" on storage.objects;
drop policy if exists "post-photos insert own" on storage.objects;
drop policy if exists "post-photos update own" on storage.objects;
drop policy if exists "post-photos delete own" on storage.objects;

-- Public read.
create policy "post-photos read"
  on storage.objects for select
  using (bucket_id = 'post-photos');

-- Authenticated users can upload to their own folder.
create policy "post-photos insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own files.
create policy "post-photos update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own files.
create policy "post-photos delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
