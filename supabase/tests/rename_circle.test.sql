-- ============================================================================
-- Tests for rename_circle RPC
-- ============================================================================
-- Run with: psql "$DATABASE_URL" -f supabase/tests/rename_circle.test.sql
-- Or paste into the Supabase SQL editor inside a transaction.
--
-- Each DO block simulates a scenario by setting request.jwt.claim.sub to
-- a specific user UUID (matching how Supabase auth.uid() resolves from JWT).
-- Everything runs in a transaction and is rolled back at the end.
-- ============================================================================

begin;

-- Fixtures -------------------------------------------------------------------
-- Two users: owner (alice) and non-owner (bob). One circle owned by alice.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, display_name, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'alice', 'UTC'),
  ('22222222-2222-2222-2222-222222222222', 'bob',   'UTC');

insert into public.circles (id, name, invite_code, created_by, member_count)
values
  ('33333333-3333-3333-3333-333333333333', 'original name', 'TESTAA',
   '11111111-1111-1111-1111-111111111111', 2);

insert into public.memberships (circle_id, user_id, role) values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111', 'owner'),
  ('33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222', 'member');


-- Test 1: owner can rename ---------------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  perform public.rename_circle(
    '33333333-3333-3333-3333-333333333333', 'new name');

  if (select name from public.circles
      where id = '33333333-3333-3333-3333-333333333333') <> 'new name' then
    raise exception 'TEST 1 FAILED: name did not update';
  end if;
  raise notice 'TEST 1 PASS: owner renamed circle';
end $$;


-- Test 2: non-owner cannot rename --------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.rename_circle(
      '33333333-3333-3333-3333-333333333333', 'bob rename attempt');
  exception when others then
    if sqlerrm like '%only the owner%' then
      v_caught := true;
    else
      raise;
    end if;
  end;
  if not v_caught then
    raise exception 'TEST 2 FAILED: non-owner rename was allowed';
  end if;
  raise notice 'TEST 2 PASS: non-owner rejected';
end $$;


-- Test 3: empty name rejected ------------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.rename_circle(
      '33333333-3333-3333-3333-333333333333', '   ');
  exception when others then
    if sqlerrm like '%1-40%' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST 3 FAILED: empty/whitespace name was allowed';
  end if;
  raise notice 'TEST 3 PASS: empty name rejected';
end $$;


-- Test 4: 41-character name rejected ----------------------------------------
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.rename_circle(
      '33333333-3333-3333-3333-333333333333', repeat('x', 41));
  exception when others then
    if sqlerrm like '%1-40%' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST 4 FAILED: 41-char name was allowed';
  end if;
  raise notice 'TEST 4 PASS: 41-char name rejected';
end $$;


-- Test 5: exactly 40 characters is allowed -----------------------------------
do $$
begin
  perform public.rename_circle(
    '33333333-3333-3333-3333-333333333333', repeat('a', 40));

  if char_length((select name from public.circles
      where id = '33333333-3333-3333-3333-333333333333')) <> 40 then
    raise exception 'TEST 5 FAILED: 40-char name did not persist';
  end if;
  raise notice 'TEST 5 PASS: 40-char name accepted';
end $$;


-- Test 6: name is trimmed before save ----------------------------------------
do $$
begin
  perform public.rename_circle(
    '33333333-3333-3333-3333-333333333333', '   trimmed name   ');

  if (select name from public.circles
      where id = '33333333-3333-3333-3333-333333333333') <> 'trimmed name' then
    raise exception 'TEST 6 FAILED: name was not trimmed';
  end if;
  raise notice 'TEST 6 PASS: name trimmed';
end $$;


-- Test 7: deleted circle cannot be renamed -----------------------------------
do $$
declare
  v_caught boolean := false;
begin
  update public.circles set deleted_at = now()
    where id = '33333333-3333-3333-3333-333333333333';

  begin
    perform public.rename_circle(
      '33333333-3333-3333-3333-333333333333', 'resurrection');
  exception when others then
    if sqlerrm like '%circle not found%' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST 7 FAILED: deleted circle was renamed';
  end if;
  raise notice 'TEST 7 PASS: deleted circle rejected';
end $$;


-- Test 8: unauthenticated caller rejected ------------------------------------
reset request.jwt.claim.sub;
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.rename_circle(
      '33333333-3333-3333-3333-333333333333', 'anon attempt');
  exception when others then
    if sqlerrm like '%not authenticated%' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST 8 FAILED: anon rename was allowed';
  end if;
  raise notice 'TEST 8 PASS: unauthenticated rejected';
end $$;

rollback;
