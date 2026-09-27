-- Ehsaan Khata schema: groups, members, ehsaan entries and approval votes.

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Groups --------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  -- An entry is approved when approvals / eligible voters is strictly greater than this.
  approval_threshold numeric(3, 2) not null default 0.50 check (approval_threshold >= 0 and approval_threshold < 1),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Security definer so RLS policies can call it without recursing into group_members' own policy.
create function public.is_member(gid uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid);
$$;

-- Entries and votes ---------------------------------------------------------

create table public.ehsaan_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  doer_id uuid not null references public.profiles (id),
  receiver_id uuid not null references public.profiles (id),
  points int not null check (points between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (doer_id <> receiver_id)
);

create index on public.ehsaan_entries (group_id, created_at desc);

create table public.votes (
  entry_id uuid not null references public.ehsaan_entries (id) on delete cascade,
  voter_id uuid not null references public.profiles (id),
  approve boolean not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, voter_id)
);

-- Re-evaluates an entry after every vote.
-- Eligible voters: every current group member except the person who logged the entry.
create function public.evaluate_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e public.ehsaan_entries;
  threshold numeric;
  eligible int;
  approvals int;
  rejections int;
begin
  select * into e from public.ehsaan_entries where id = new.entry_id for update;
  if e.status <> 'pending' then
    return new;
  end if;

  select approval_threshold into threshold from public.groups where id = e.group_id;
  select count(*) into eligible from public.group_members
    where group_id = e.group_id and user_id <> e.doer_id;
  select count(*) filter (where approve), count(*) filter (where not approve)
    into approvals, rejections
    from public.votes where entry_id = e.id;

  if eligible = 0 then
    return new;
  end if;

  if approvals::numeric / eligible > threshold then
    update public.ehsaan_entries set status = 'approved', decided_at = now() where id = e.id;
  elsif (eligible - rejections)::numeric / eligible <= threshold then
    -- Even if everyone left votes yes, approval can no longer pass.
    update public.ehsaan_entries set status = 'rejected', decided_at = now() where id = e.id;
  end if;
  return new;
end;
$$;

create trigger votes_evaluate
  after insert or update on public.votes
  for each row execute function public.evaluate_entry();

-- RPCs ----------------------------------------------------------------------

create function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.groups (name, created_by) values (trim(group_name), auth.uid()) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, auth.uid(), 'admin');
  return gid;
end;
$$;

create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into gid from public.groups where invite_code = upper(trim(code));
  if gid is null then
    raise exception 'No group found with that invite code';
  end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid())
    on conflict do nothing;
  return gid;
end;
$$;

-- Row Level Security --------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.ehsaan_entries enable row level security;
alter table public.votes enable row level security;

create policy "see self and group mates" on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy "update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "members see group" on public.groups for select using (public.is_member(id));
create policy "admins update group" on public.groups for update using (
  exists (select 1 from public.group_members
          where group_id = groups.id and user_id = auth.uid() and role = 'admin')
);

create policy "members see members" on public.group_members for select using (public.is_member(group_id));
create policy "leave group" on public.group_members for delete using (user_id = auth.uid());

create policy "members see entries" on public.ehsaan_entries for select using (public.is_member(group_id));
create policy "log own favour" on public.ehsaan_entries for insert with check (
  doer_id = auth.uid()
  and status = 'pending'
  and public.is_member(group_id)
  and public.is_member(group_id, receiver_id)
);
create policy "withdraw own pending entry" on public.ehsaan_entries for delete using (
  doer_id = auth.uid() and status = 'pending'
);

create policy "members see votes" on public.votes for select using (
  exists (select 1 from public.ehsaan_entries e where e.id = entry_id and public.is_member(e.group_id))
);
create policy "cast vote" on public.votes for insert with check (
  voter_id = auth.uid()
  and exists (
    select 1 from public.ehsaan_entries e
    where e.id = entry_id and e.status = 'pending' and e.doer_id <> auth.uid() and public.is_member(e.group_id)
  )
);
create policy "change vote while pending" on public.votes for update using (
  voter_id = auth.uid()
  and exists (select 1 from public.ehsaan_entries e where e.id = entry_id and e.status = 'pending')
) with check (voter_id = auth.uid());

-- Realtime ------------------------------------------------------------------

alter publication supabase_realtime add table public.ehsaan_entries, public.votes, public.group_members;
