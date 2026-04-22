-- ============================================================================
-- palmi: rename_circle RPC
-- Migration 008: owner-only rename
-- ============================================================================
--
-- Circle rename is owner-only. Validates: authenticated, is owner of this
-- circle, name length 1–40, trims whitespace, circle not deleted.
-- ============================================================================

create or replace function public.rename_circle(
  p_circle_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_trimmed text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  v_trimmed := btrim(coalesce(p_name, ''));
  if char_length(v_trimmed) < 1 or char_length(v_trimmed) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;

  select exists (
    select 1 from public.memberships
    where circle_id = p_circle_id
      and user_id = v_user_id
      and role = 'owner'
      and left_at is null
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'only the owner can rename this circle';
  end if;

  update public.circles
  set name = v_trimmed
  where id = p_circle_id
    and deleted_at is null;

  if not found then
    raise exception 'circle not found';
  end if;
end;
$$;
