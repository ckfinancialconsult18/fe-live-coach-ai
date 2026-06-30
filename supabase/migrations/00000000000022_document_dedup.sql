-- ─────────────────────────────────────────────────────────────────────────────
-- Duplicate detection: store a content hash per document upload and flag
-- exact duplicates for the same user at insert time (app-layer check uses
-- this index; see lib/documents/hash.ts + app/api/documents POST handler).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists file_hash text;

create index if not exists documents_user_hash_idx on public.documents(user_id, file_hash);
