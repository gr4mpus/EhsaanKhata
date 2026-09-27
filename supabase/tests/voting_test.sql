-- Self-checking test for the approval rule and privacy rules.
-- Paste into Supabase SQL Editor and Run. It always ends with an error message so that
-- everything it created is rolled back: "ALL TESTS PASSED" means success, "FAIL: ..." names the broken rule.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();  -- outsider, not in the group
  gid uuid;
  e1 uuid;
  e2 uuid;
  e3 uuid;
  s text;
  code text;
  n int;
  blocked boolean;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (a, a || '@test.local', 'authenticated', 'authenticated', '{"display_name":"Asha"}'),
    (b, b || '@test.local', 'authenticated', 'authenticated', '{"display_name":"Bilal"}'),
    (c, c || '@test.local', 'authenticated', 'authenticated', '{"display_name":"Chetan"}'),
    (d, d || '@test.local', 'authenticated', 'authenticated', '{"display_name":"Divya"}');

  select count(*) into n from public.profiles where id in (a, b, c, d);
  if n <> 4 then raise exception 'FAIL: profiles were not created on sign-up (got %)', n; end if;

  -- Act as Asha: create the group. Bilal and Chetan ask to join by invite code; Asha (admin) approves.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  gid := public.create_group('Test flat');
  code := public.get_invite_code(gid);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select j.status into s from public.join_group(code) j;
  if s <> 'pending' then raise exception 'FAIL: joining by invite should wait for an admin, got %', s; end if;
  if public.is_member(gid, b) then raise exception 'FAIL: a join request made the person a member before approval'; end if;

  -- Bilal isn't an admin, so he can't read the invite code or approve anyone.
  blocked := false;
  begin
    perform public.get_invite_code(gid);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a non-admin could read the invite code'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.join_group(code);
  blocked := false;
  begin
    perform public.decide_join_request(gid, b, true);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a non-admin approved a join request'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.decide_join_request(gid, b, true);
  perform public.decide_join_request(gid, c, true);
  if not (public.is_member(gid, b) and public.is_member(gid, c)) then
    raise exception 'FAIL: approved join requests did not add the members';
  end if;

  -- Asha makes Bilal an admin; Bilal can now read the invite code. The last admin can't be demoted.
  perform public.set_member_role(gid, b, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.get_invite_code(gid);
  perform public.set_member_role(gid, a, 'member');
  blocked := false;
  begin
    perform public.set_member_role(gid, b, 'member');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: the last admin was able to remove their own admin role'; end if;

  -- Asha logs two favours.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.ehsaan_entries (group_id, doer_id, receiver_id, points, description)
    values (gid, a, b, 5, 'Airport pickup') returning id into e1;
  insert into public.ehsaan_entries (group_id, doer_id, receiver_id, points, description)
    values (gid, a, c, 3, 'Lent notes') returning id into e2;

  -- Asha cannot vote on her own entry.
  blocked := false;
  begin
    insert into public.votes (entry_id, voter_id, approve) values (e1, a, true);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: the person who logged an entry was allowed to vote on it'; end if;

  -- e1 is Asha -> Bilal. Chetan (not the person helped) can't vote on it.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  blocked := false;
  begin
    insert into public.votes (entry_id, voter_id, approve) values (e1, c, true);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: someone other than the person helped voted on an entry'; end if;

  -- Bilal cannot log a favour pretending to be Asha.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  blocked := false;
  begin
    insert into public.ehsaan_entries (group_id, doer_id, receiver_id, points, description)
      values (gid, a, c, 50, 'Fake');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a member logged a favour on someone else''s behalf'; end if;

  -- Bilal (the person helped) approves e1 -> approved straight away.
  insert into public.votes (entry_id, voter_id, approve) values (e1, b, true);
  select status into s from public.ehsaan_entries where id = e1;
  if s <> 'approved' then raise exception 'FAIL: receiver approval should approve the entry, got %', s; end if;

  -- e2 is Asha -> Chetan. Chetan rejects -> rejected.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into public.votes (entry_id, voter_id, approve) values (e2, c, false);
  select status into s from public.ehsaan_entries where id = e2;
  if s <> 'rejected' then raise exception 'FAIL: receiver rejection should reject the entry, got %', s; end if;

  -- Votes can't be added to a decided entry.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  blocked := false;
  begin
    insert into public.votes (entry_id, voter_id, approve) values (e1, b, false);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: a vote was accepted on an already-decided entry'; end if;

  -- Divya (outsider) can't see anything from the group, or add to it.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  select count(*) into n from public.groups where id = gid;
  if n <> 0 then raise exception 'FAIL: outsider can see the group'; end if;
  select count(*) into n from public.ehsaan_entries where group_id = gid;
  if n <> 0 then raise exception 'FAIL: outsider can see the group''s entries'; end if;
  select count(*) into n from public.profiles where id in (a, b, c);
  if n <> 0 then raise exception 'FAIL: outsider can see members'' profiles'; end if;
  blocked := false;
  begin
    insert into public.ehsaan_entries (group_id, doer_id, receiver_id, points, description)
      values (gid, d, a, 1, 'Sneaky');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: outsider could log a favour in the group'; end if;

  -- "Select all": Bilal logs one favour for everyone -> one entry each, each approved only by its receiver.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  perform public.join_group(code);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.decide_join_request(gid, d, true);
  insert into public.ehsaan_entries (group_id, doer_id, receiver_id, points, description)
    values (gid, b, a, 2, 'Cooked dinner'), (gid, b, c, 2, 'Cooked dinner'), (gid, b, d, 2, 'Cooked dinner');
  select id into e3 from public.ehsaan_entries where group_id = gid and doer_id = b and receiver_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.votes (entry_id, voter_id, approve) values (e3, a, true);
  select count(*) into n from public.ehsaan_entries
    where group_id = gid and doer_id = b and description = 'Cooked dinner' and status = 'pending';
  if n <> 2 then raise exception 'FAIL: Asha approving her entry should leave the other 2 pending, got %', n; end if;

  raise exception 'ALL TESTS PASSED (all test data has been rolled back)';
end;
$$;
