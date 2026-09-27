-- Only the person who received the favour approves or rejects it.
-- Their single vote decides the entry; other members can see it but can't vote.
-- (groups.approval_threshold is no longer used.)

create or replace function public.evaluate_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e public.ehsaan_entries;
begin
  select * into e from public.ehsaan_entries where id = new.entry_id for update;
  if e.status <> 'pending' or new.voter_id <> e.receiver_id then
    return new;
  end if;
  update public.ehsaan_entries
    set status = case when new.approve then 'approved' else 'rejected' end, decided_at = now()
    where id = e.id;
  return new;
end;
$$;

drop policy "cast vote" on public.votes;
create policy "receiver votes" on public.votes for insert with check (
  voter_id = auth.uid()
  and exists (
    select 1 from public.ehsaan_entries e
    where e.id = entry_id and e.status = 'pending' and e.receiver_id = auth.uid()
  )
);
