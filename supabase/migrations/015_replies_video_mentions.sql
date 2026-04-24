-- Replies + video + @mentions

alter table public.posts
  add column if not exists reply_to_id uuid references public.posts(id) on delete set null,
  add column if not exists video_url text;

create index if not exists idx_posts_reply on public.posts(reply_to_id) where reply_to_id is not null;

create table if not exists public.post_mentions (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, mentioned_user_id)
);

create index if not exists idx_mentions_user on public.post_mentions(mentioned_user_id);
create index if not exists idx_mentions_post on public.post_mentions(post_id);

alter table public.post_mentions enable row level security;

drop policy if exists "mention_member_read" on public.post_mentions;
create policy "mention_member_read"
  on public.post_mentions for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_mentions.post_id
        and public.is_circle_member(posts.circle_id)
    )
  );

drop policy if exists "mention_author_insert" on public.post_mentions;
create policy "mention_author_insert"
  on public.post_mentions for insert
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_id
        and posts.author_id = auth.uid()
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_mentions'
  ) then
    execute 'alter publication supabase_realtime add table public.post_mentions';
  end if;
end $$;

drop function if exists public.get_circle_feed(uuid, timestamptz, int);

create or replace function public.get_circle_feed(
  p_circle_id uuid,
  p_before timestamptz default null,
  p_limit int default 30
)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  body text,
  photo_url text,
  video_url text,
  reply_to_id uuid,
  reply_to_author_name text,
  reply_to_body text,
  mentioned_user_ids uuid[],
  reaction_counts jsonb,
  user_reactions text[],
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.author_id,
    prof.display_name as author_name,
    prof.avatar_url as author_avatar,
    p.body,
    p.photo_url,
    p.video_url,
    p.reply_to_id,
    rprof.display_name as reply_to_author_name,
    rpost.body as reply_to_body,
    coalesce(
      (select array_agg(mentioned_user_id)
       from public.post_mentions where post_id = p.id),
      '{}'::uuid[]
    ) as mentioned_user_ids,
    coalesce(
      (select jsonb_object_agg(kind, cnt)
       from (
         select kind, count(*) as cnt
         from public.reactions
         where post_id = p.id
         group by kind
       ) r),
      '{}'::jsonb
    ) as reaction_counts,
    coalesce(
      (select array_agg(kind)
       from public.reactions
       where post_id = p.id and user_id = auth.uid()),
      '{}'::text[]
    ) as user_reactions,
    p.created_at
  from public.posts p
  join public.profiles prof on prof.id = p.author_id
  left join public.posts rpost on rpost.id = p.reply_to_id
  left join public.profiles rprof on rprof.id = rpost.author_id
  where p.circle_id = p_circle_id
    and p.deleted_at is null
    and (p_before is null or p.created_at < p_before)
    and is_circle_member(p_circle_id)
  order by p.created_at desc
  limit least(p_limit, 50);
$$;
