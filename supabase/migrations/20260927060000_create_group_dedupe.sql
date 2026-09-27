-- Double taps on "Create" made several identical groups. If the same person creates a group with the
-- same name within a minute, return the group they just made instead of creating another one.
create or replace function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Serialise concurrent calls from the same user so two requests can't both miss the check below.
  perform pg_advisory_xact_lock(hashtext('create_group:' || auth.uid()::text));

  select id into gid from public.groups
  where created_by = auth.uid()
    and lower(name) = lower(trim(group_name))
    and created_at > now() - interval '1 minute'
  order by created_at
  limit 1;
  if gid is not null then
    return gid;
  end if;

  insert into public.groups (name, created_by) values (trim(group_name), auth.uid()) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, auth.uid(), 'admin');
  return gid;
end;
$$;
