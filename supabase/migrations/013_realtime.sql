-- Enable Supabase Realtime on posts + reactions so the in-app messaging
-- feed updates live for circle members.
--
-- Realtime in Supabase works by adding tables to the `supabase_realtime`
-- publication. RLS is still enforced — clients only receive events for rows
-- they would be allowed to SELECT via the existing policies in 002_rls.sql.

alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.reactions;
