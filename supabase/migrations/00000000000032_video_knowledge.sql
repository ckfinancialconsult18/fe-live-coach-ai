-- ─────────────────────────────────────────────────────────────────────────────
-- video_knowledge — tracks YouTube videos and uploaded video files that have
-- been imported into the knowledge base. Each row represents one video source.
-- Processing is asynchronous: yt-dlp → ffmpeg → Deepgram → OpenAI → embed.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.video_knowledge (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,

  -- Source
  source_type     text not null check (source_type in ('youtube', 'upload')),
  youtube_url     text,
  youtube_id      text,                        -- extracted video ID for dedup
  title           text,
  thumbnail_url   text,
  channel_name    text,
  duration_sec    int,
  storage_path    text,                        -- for uploaded files

  -- Classification
  category        text not null default 'General Sales',
  tags            text[] not null default '{}',

  -- Processing pipeline status
  status          text not null default 'queued' check (status in (
                    'queued', 'downloading', 'extracting_audio',
                    'transcribing', 'building_knowledge',
                    'embedding', 'complete', 'error'
                  )),
  progress        int not null default 0,      -- 0-100
  error_message   text,
  retry_count     int not null default 0,

  -- Pipeline outputs
  transcript_text text,
  ai_summary      text,
  key_takeaways   text[],
  document_id     uuid references public.knowledge_documents(id) on delete set null,

  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

create index video_knowledge_user_id_idx      on public.video_knowledge(user_id, created_at desc);
create index video_knowledge_youtube_id_idx   on public.video_knowledge(user_id, youtube_id);
create index video_knowledge_status_idx       on public.video_knowledge(status);

alter table public.video_knowledge enable row level security;

create policy "video_knowledge_select_own"
  on public.video_knowledge for select using (auth.uid() = user_id);
create policy "video_knowledge_insert_own"
  on public.video_knowledge for insert with check (auth.uid() = user_id);
create policy "video_knowledge_update_own"
  on public.video_knowledge for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "video_knowledge_delete_own"
  on public.video_knowledge for delete using (auth.uid() = user_id);
