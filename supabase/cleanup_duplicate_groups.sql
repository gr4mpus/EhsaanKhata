-- One-off cleanup for groups created twice by accident. Run step 1, check the list, then run step 2.

-- STEP 1: preview. Lists every extra copy that would be deleted.
-- A copy is only deleted if it is an exact duplicate (same creator, same name), not the oldest copy,
-- and completely unused: no Ehsaan entries, no join requests, and nobody in it except the creator.
with ranked as (
  select g.id, g.name, g.created_by, g.created_at,
         row_number() over (partition by g.created_by, lower(g.name) order by g.created_at) as copy_number
  from public.groups g
)
select r.name, r.created_at, r.id
from ranked r
where r.copy_number > 1
  and not exists (select 1 from public.ehsaan_entries e where e.group_id = r.id)
  and not exists (select 1 from public.join_requests j where j.group_id = r.id)
  and not exists (select 1 from public.group_members m where m.group_id = r.id and m.user_id <> r.created_by)
order by r.name, r.created_at;

-- STEP 2: delete exactly the rows listed above. Uncomment the lines below, then Run.
-- with ranked as (
--   select g.id, g.created_by,
--          row_number() over (partition by g.created_by, lower(g.name) order by g.created_at) as copy_number
--   from public.groups g
-- )
-- delete from public.groups
-- where id in (
--   select r.id from ranked r
--   where r.copy_number > 1
--     and not exists (select 1 from public.ehsaan_entries e where e.group_id = r.id)
--     and not exists (select 1 from public.join_requests j where j.group_id = r.id)
--     and not exists (select 1 from public.group_members m where m.group_id = r.id and m.user_id <> r.created_by)
-- );
