-- Admins can delete a group. Everything in it goes too (members, Ehsaan entries, votes and
-- join requests all cascade from groups).
create function public.delete_group(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(gid) then
    raise exception 'Only group admins can delete the group';
  end if;
  delete from public.groups where id = gid;
end;
$$;
