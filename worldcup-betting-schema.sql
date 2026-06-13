-- ============================================================================
-- STC World Cup 2026 — Face-Off Duels: Supabase schema
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL Editor (Project → SQL Editor →
-- New query → Run). It is idempotent: safe to run again after edits.
--
-- Trust model: a friendly 10-person play-money pool. Reads are public to the
-- group (anon key). ALL writes go through SECURITY DEFINER functions that
-- verify a per-manager PIN, so balances can't be tampered with directly.
-- Tokens are zero-sum (total is always 10,000), so each token = pot/10000 in
-- real cash for the proportional prize-money split.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.managers (
  name        text primary key,
  balance     integer not null default 1000,   -- available tokens
  locked      integer not null default 0,      -- tokens escrowed in open/active duels
  claimed     boolean not null default false,  -- has this manager set a PIN yet?
  created_at  timestamptz not null default now()
);

-- PINs live in a separate table with NO read policy, so the anon key can never
-- read them; only the SECURITY DEFINER functions (which run as owner) can.
create table if not exists public.manager_secrets (
  name      text primary key references public.managers(name) on delete cascade,
  pin_hash  text not null
);

create table if not exists public.results (
  fixture_id   text primary key,             -- app fixture id = homeId + awayId
  home_score   integer not null,
  away_score   integer not null,
  source       text not null default 'feed', -- 'feed' | 'admin'
  reported_at  timestamptz not null default now()
);

create table if not exists public.duels (
  id              bigint generated always as identity primary key,
  fixture_id      text not null,
  kickoff         timestamptz not null,       -- enforces the kick-off lock server-side
  challenger      text not null references public.managers(name),
  opponent        text not null references public.managers(name),
  challenger_side text not null check (challenger_side in ('home','away')),
  stake           integer not null check (stake > 0),
  status          text not null default 'pending'
                    check (status in ('pending','accepted','declined','cancelled','settled')),
  outcome         text check (outcome in ('challenger','opponent','push')),
  created_at      timestamptz not null default now(),
  settled_at      timestamptz,
  constraint diff_managers check (challenger <> opponent)
);

create index if not exists duels_fixture_idx on public.duels(fixture_id);
create index if not exists duels_status_idx  on public.duels(status);

-- Immutable audit of realised P&L (one row per token transfer at settlement).
create table if not exists public.ledger (
  id          bigint generated always as identity primary key,
  manager     text not null references public.managers(name),
  delta       integer not null,
  reason      text not null,
  duel_id     bigint references public.duels(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security: read-only for anon, no direct writes.
-- ---------------------------------------------------------------------------
alter table public.managers        enable row level security;
alter table public.manager_secrets enable row level security;
alter table public.results         enable row level security;
alter table public.duels           enable row level security;
alter table public.ledger          enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='managers' and policyname='read_managers')
    then create policy read_managers on public.managers for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename='results' and policyname='read_results')
    then create policy read_results on public.results for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename='duels' and policyname='read_duels')
    then create policy read_duels on public.duels for select using (true); end if;
  if not exists (select 1 from pg_policies where tablename='ledger' and policyname='read_ledger')
    then create policy read_ledger on public.ledger for select using (true); end if;
  -- manager_secrets intentionally has NO policy → anon cannot read/write it.
end $$;

-- ---------------------------------------------------------------------------
-- Seed the 10 managers (unclaimed; each sets their PIN on first login).
-- ---------------------------------------------------------------------------
insert into public.managers (name) values
  ('Paul'),('Matt'),('Kirk'),('Tom'),('Rory'),
  ('Omar'),('Jack'),('Gerry'),('Mike'),('Ben')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._verify_pin(p_name text, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  select pin_hash into v_hash from manager_secrets where name = p_name;
  if v_hash is null or crypt(p_pin, v_hash) <> v_hash then
    raise exception 'Incorrect PIN for %', p_name using errcode = '28000';
  end if;
end $$;

-- Adjust a manager's available + escrowed balances together.
create or replace function public._adj(p_name text, p_dbal integer, p_dlock integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update managers set balance = balance + p_dbal, locked = locked + p_dlock
   where name = p_name;
end $$;

-- ---------------------------------------------------------------------------
-- claim_manager: first login sets the PIN; later logins verify it.
-- ---------------------------------------------------------------------------
create or replace function public.claim_manager(p_name text, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare v_claimed boolean;
begin
  if p_pin is null or length(p_pin) < 4 then
    raise exception 'PIN must be at least 4 digits';
  end if;
  select claimed into v_claimed from managers where name = p_name;
  if v_claimed is null then raise exception 'Unknown manager %', p_name; end if;
  if not v_claimed then
    insert into manager_secrets(name, pin_hash) values (p_name, crypt(p_pin, gen_salt('bf')))
      on conflict (name) do update set pin_hash = excluded.pin_hash;
    update managers set claimed = true where name = p_name;
  else
    perform _verify_pin(p_name, p_pin);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- create_duel: challenger stakes tokens against an opponent on a fixture.
-- Escrows the challenger's stake immediately (balance → locked).
-- ---------------------------------------------------------------------------
create or replace function public.create_duel(
  p_challenger text, p_pin text, p_opponent text,
  p_fixture text, p_kickoff timestamptz, p_side text, p_stake integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_avail integer; v_id bigint;
begin
  perform _verify_pin(p_challenger, p_pin);
  if p_challenger = p_opponent then raise exception 'Cannot duel yourself'; end if;
  if p_side not in ('home','away') then raise exception 'Bad side'; end if;
  if p_stake < 10 then raise exception 'Minimum stake is 10 tokens'; end if;
  if p_kickoff <= now() then raise exception 'Betting is locked for this match'; end if;

  select balance into v_avail from managers where name = p_challenger;
  if v_avail is null then raise exception 'Unknown manager'; end if;
  if v_avail < p_stake then raise exception 'Not enough tokens (have %, need %)', v_avail, p_stake; end if;

  perform _adj(p_challenger, -p_stake, p_stake);  -- escrow challenger's stake
  insert into duels(fixture_id, kickoff, challenger, opponent, challenger_side, stake)
    values (p_fixture, p_kickoff, p_challenger, p_opponent, p_side, p_stake)
    returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- respond_duel: opponent accepts or declines a pending challenge.
-- Accept escrows the opponent's stake; decline refunds the challenger.
-- Auto-cancels (refunds) if kick-off has already passed.
-- ---------------------------------------------------------------------------
create or replace function public.respond_duel(
  p_opponent text, p_pin text, p_duel_id bigint, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_avail integer;
begin
  perform _verify_pin(p_opponent, p_pin);
  select * into d from duels where id = p_duel_id for update;
  if d.id is null then raise exception 'No such duel'; end if;
  if d.opponent <> p_opponent then raise exception 'This challenge is not yours to answer'; end if;
  if d.status <> 'pending' then raise exception 'Challenge already %', d.status; end if;

  if d.kickoff <= now() then               -- expired before a response → refund challenger
    perform _adj(d.challenger, d.stake, -d.stake);
    update duels set status='cancelled' where id=d.id;
    raise exception 'Match kicked off — challenge expired';
  end if;

  if not p_accept then
    perform _adj(d.challenger, d.stake, -d.stake);  -- refund challenger escrow
    update duels set status='declined' where id=d.id;
    return;
  end if;

  select balance into v_avail from managers where name = p_opponent;
  if v_avail < d.stake then raise exception 'Not enough tokens to accept'; end if;
  perform _adj(p_opponent, -d.stake, d.stake);      -- escrow opponent's stake
  update duels set status='accepted' where id=d.id;
end $$;

-- ---------------------------------------------------------------------------
-- cancel_duel: challenger withdraws a still-pending challenge (refund).
-- ---------------------------------------------------------------------------
create or replace function public.cancel_duel(p_challenger text, p_pin text, p_duel_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare d duels%rowtype;
begin
  perform _verify_pin(p_challenger, p_pin);
  select * into d from duels where id = p_duel_id for update;
  if d.id is null then raise exception 'No such duel'; end if;
  if d.challenger <> p_challenger then raise exception 'Not your challenge'; end if;
  if d.status <> 'pending' then raise exception 'Cannot cancel a % duel', d.status; end if;
  perform _adj(d.challenger, d.stake, -d.stake);
  update duels set status='cancelled' where id=d.id;
end $$;

-- ---------------------------------------------------------------------------
-- _apply_duel / _reverse_duel: move escrowed stakes at settlement.
-- On accept, BOTH stakes sit in `locked`. Apply releases them per outcome.
-- ---------------------------------------------------------------------------
create or replace function public._apply_duel(d duels, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome = 'push' then
    perform _adj(d.challenger, d.stake, -d.stake);
    perform _adj(d.opponent,   d.stake, -d.stake);
  elsif p_outcome = 'challenger' then
    perform _adj(d.challenger, 2*d.stake, -d.stake);  -- own stake back + winnings
    perform _adj(d.opponent,   0,         -d.stake);  -- forfeit escrow
    insert into ledger(manager,delta,reason,duel_id) values
      (d.challenger,  d.stake, 'duel_win',  d.id),
      (d.opponent,   -d.stake, 'duel_loss', d.id);
  elsif p_outcome = 'opponent' then
    perform _adj(d.opponent,   2*d.stake, -d.stake);
    perform _adj(d.challenger, 0,         -d.stake);
    insert into ledger(manager,delta,reason,duel_id) values
      (d.opponent,    d.stake, 'duel_win',  d.id),
      (d.challenger, -d.stake, 'duel_loss', d.id);
  end if;
end $$;

create or replace function public._reverse_duel(d duels, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin  -- exact inverse of _apply_duel, restoring both stakes to `locked`
  if p_outcome = 'push' then
    perform _adj(d.challenger, -d.stake, d.stake);
    perform _adj(d.opponent,   -d.stake, d.stake);
  elsif p_outcome = 'challenger' then
    perform _adj(d.challenger, -2*d.stake, d.stake);
    perform _adj(d.opponent,    0,         d.stake);
    insert into ledger(manager,delta,reason,duel_id) values
      (d.challenger, -d.stake, 'reverse', d.id),
      (d.opponent,    d.stake, 'reverse', d.id);
  elsif p_outcome = 'opponent' then
    perform _adj(d.opponent,   -2*d.stake, d.stake);
    perform _adj(d.challenger,  0,         d.stake);
    insert into ledger(manager,delta,reason,duel_id) values
      (d.opponent,   -d.stake, 'reverse', d.id),
      (d.challenger,  d.stake, 'reverse', d.id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- settle_fixture: settle every accepted duel on a fixture from the stored
-- result. Fully re-runnable — if the result was corrected, it reverses the
-- previous outcome and re-applies the new one (the admin backstop).
-- ---------------------------------------------------------------------------
create or replace function public.settle_fixture(p_fixture text)
returns void language plpgsql security definer set search_path = public as $$
declare r results%rowtype; d duels%rowtype; v_winside text; v_target text;
begin
  select * into r from results where fixture_id = p_fixture;
  if r.fixture_id is null then return; end if;     -- no result yet → nothing to do
  v_winside := case when r.home_score > r.away_score then 'home'
                    when r.away_score > r.home_score then 'away' else null end;

  for d in select * from duels
            where fixture_id = p_fixture and status in ('accepted','settled') for update loop
    v_target := case when v_winside is null then 'push'
                     when v_winside = d.challenger_side then 'challenger'
                     else 'opponent' end;
    if d.status = 'settled' then
      if d.outcome = v_target then continue; end if; -- already correct
      perform _reverse_duel(d, d.outcome);           -- undo prior, restore escrow
    end if;
    perform _apply_duel(d, v_target);
    update duels set status='settled', outcome=v_target, settled_at=now() where id=d.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- report_result: the in-browser live feed reports a final score.
-- First write wins (no overwrite); then auto-settles.
-- ---------------------------------------------------------------------------
create or replace function public.report_result(p_fixture text, p_home integer, p_away integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into results(fixture_id, home_score, away_score, source)
    values (p_fixture, p_home, p_away, 'feed')
    on conflict (fixture_id) do nothing;   -- never overwrite an existing result here
  perform settle_fixture(p_fixture);
end $$;

-- ---------------------------------------------------------------------------
-- admin_set_result: Tom (admin) overrides a wrong score and re-settles.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_result(
  p_pin text, p_fixture text, p_home integer, p_away integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _verify_pin('Tom', p_pin);
  insert into results(fixture_id, home_score, away_score, source)
    values (p_fixture, p_home, p_away, 'admin')
    on conflict (fixture_id)
      do update set home_score=excluded.home_score, away_score=excluded.away_score,
                    source='admin', reported_at=now();
  perform settle_fixture(p_fixture);
end $$;

-- Expose the RPCs to the anon role (they self-authorise via PIN where needed).
grant execute on function public.claim_manager(text,text)               to anon;
grant execute on function public.create_duel(text,text,text,text,timestamptz,text,integer) to anon;
grant execute on function public.respond_duel(text,text,bigint,boolean)  to anon;
grant execute on function public.cancel_duel(text,text,bigint)           to anon;
grant execute on function public.report_result(text,integer,integer)     to anon;
grant execute on function public.admin_set_result(text,text,integer,integer) to anon;
-- (internal helpers _verify_pin/_adj/_apply_duel/_reverse_duel/settle_fixture
--  are NOT granted to anon — they're only callable from inside the above.)
revoke execute on function public.settle_fixture(text) from anon;
