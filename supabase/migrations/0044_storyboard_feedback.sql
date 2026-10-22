-- Client feedback on the shared storyboard page (not part of the parent app).
-- Written and read only by the storyboard-feedback edge function (service
-- key); RLS is on with no policies, so the app's keys can't touch it.
create table if not exists public.storyboard_feedback (
  id          uuid primary key default gen_random_uuid(),
  screen_id   text not null check (char_length(screen_id) <= 40),
  screen_name text check (char_length(screen_name) <= 120),
  author      text check (char_length(author) <= 80),
  feedback    text not null check (char_length(feedback) between 1 and 3000),
  ai_followup text,
  reply       text check (char_length(reply) <= 3000),
  created_at  timestamptz not null default now(),
  replied_at  timestamptz
);
alter table public.storyboard_feedback enable row level security;
create index if not exists storyboard_feedback_screen_idx on public.storyboard_feedback (screen_id, created_at);
