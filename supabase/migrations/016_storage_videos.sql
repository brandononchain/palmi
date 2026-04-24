-- post-videos storage bucket (50 MB cap, mp4/mov/webm)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-videos',
  'post-videos',
  true,
  50 * 1024 * 1024,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post-videos read" on storage.objects;
drop policy if exists "post-videos insert own" on storage.objects;
drop policy if exists "post-videos update own" on storage.objects;
drop policy if exists "post-videos delete own" on storage.objects;

create policy "post-videos read"
  on storage.objects for select
  using (bucket_id = 'post-videos');

create policy "post-videos insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post-videos update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post-videos delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
