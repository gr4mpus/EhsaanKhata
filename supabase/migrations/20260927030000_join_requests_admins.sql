-- Admin-controlled membership:
--   * Only admins can see a group's invite code (and so share the invite link).
--   * Opening an invite creates a join request; only admins can approve or decline it.
--   * Admins can make other members admins, or remove admin (a group always keeps at least one).

-- Join requests ---------------------------------------------------------------

create table public.join_requests (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  primary key (group_id, user_id)
);

create function public.is_admin(gid uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid and role = 'admin');
$$;

alter table public.join_requests enable row level security;
create policy "see own requests, admins see their group's" on public.join_requests for select using (
  user_id = auth.uid() or public.is_admin(group_id)
);

-- Admins must be able to see who is asking to join.
drop policy "see self and group mates" on public.profiles;
create policy "see self, group mates and join requesters" on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
  or exists (
    select 1 from public.join_requests r
    where r.user_id = profiles.id and r.status = 'pending' and public.is_admin(r.group_id)
  )
);

-- Invite codes are admin-only --------------------------------------------------

revoke select on public.groups from anon, authenticated;
grant select (id, name, approval_threshold, created_by, created_at) on public.groups to authenticated;

create function public.get_invite_code(gid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(gid) then
    raise exception 'Only group admins can share the invite link';
  end if;
  return (select invite_code from public.groups where id = gid);
end;
$$;

-- Joining ----------------------------------------------------------------------

-- Replaces the old join_group: returns where the caller stands instead of adding them directly.
drop function public.join_group(text);

create function public.join_group(code text)
returns table (group_id uuid, group_name text, status text)
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  existing text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into g from public.groups where invite_code = upper(trim(code));
  if g.id is null then
    raise exception 'No group found with that invite code';
  end if;

  if public.is_member(g.id) then
    return query select g.id, g.name, 'member'::text;
    return;
  end if;

  select r.status into existing from public.join_requests r where r.group_id = g.id and r.user_id = auth.uid();
  if existing is null then
    insert into public.join_requests (group_id, user_id) values (g.id, auth.uid());
    existing := 'pending';
  end if;
  -- A declined request stays declined; opening the link again doesn't re-send it.
  return query select g.id, g.name, existing;
end;
$$;

-- Lets someone ask again after being declined.
create function public.retry_join_request(gid uuid) returns void
language sql security definer set search_path = public as $$
  update public.join_requests set status = 'pending', created_at = now(), decided_by = null, decided_at = null
  where group_id = gid and user_id = auth.uid() and status = 'rejected';
$$;

create function public.decide_join_request(gid uuid, requester uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(gid) then
    raise exception 'Only group admins can approve join requests';
  end if;
  update public.join_requests
    set status = case when approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
    where group_id = gid and user_id = requester and status = 'pending';
  if not found then
    raise exception 'This request was already handled';
  end if;
  if approve then
    insert into public.group_members (group_id, user_id) values (gid, requester) on conflict do nothing;
  end if;
end;
$$;

-- The pending requests the caller has made, with group names (they can't read groups they aren't in).
create function public.my_join_requests()
returns table (group_id uuid, group_name text, invite_code text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.group_id, g.name, g.invite_code, r.status, r.created_at
  from public.join_requests r join public.groups g on g.id = r.group_id
  where r.user_id = auth.uid() and r.status in ('pending', 'rejected')
  order by r.created_at desc;
$$;

-- Admin roles --------------------------------------------------------------------

create function public.set_member_role(gid uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(gid) then
    raise exception 'Only group admins can change roles';
  end if;
  if new_role not in ('admin', 'member') then
    raise exception 'Unknown role %', new_role;
  end if;
  if new_role = 'member'
     and (select count(*) from public.group_members where group_id = gid and role = 'admin') <= 1
     and public.is_admin(gid, member) then
    raise exception 'A group needs at least one admin';
  end if;
  update public.group_members set role = new_role where group_id = gid and user_id = member;
end;
$$;

-- Realtime: requesters see approval live; admins see new requests live.
alter publication supabase_realtime add table public.join_requests;
