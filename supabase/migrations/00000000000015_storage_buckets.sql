-- ─────────────────────────────────────────────────────────────────────────────
-- storage buckets — every file the app uploads lives in one of these.
-- Files are namespaced by uploader: <bucket>/<user_id>/<filename>
-- so the policies below can authorize using the first path segment.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('avatars',      'avatars',      true,  5242880),     -- 5 MB, public read
  ('documents',     'documents',    false, 26214400),   -- 25 MB, private
  ('recordings',    'recordings',   false, 524288000),  -- 500 MB, private
  ('transcripts',   'transcripts',  false, 26214400)    -- 25 MB, private (knowledge pipeline uploads)
on conflict (id) do nothing;

-- ── avatars: public read, owner write ───────────────────────────────────────
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── documents / recordings / transcripts: private, owner-only ──────────────
create policy "documents_owner_all"
  on storage.objects for all
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "recordings_owner_all"
  on storage.objects for all
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "transcripts_owner_all"
  on storage.objects for all
  using (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text);
