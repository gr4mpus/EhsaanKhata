-- Tracks accounts that signed up but haven't clicked the confirmation link yet.
-- A row lives while the link is valid. When the link expires, a job sends a fresh link
-- (the row is replaced with the new expiry). After max_confirmation_links unanswered
-- links, the unverified account is deleted so the email can sign up again.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Must match Authentication → Sign In / Providers → Email → "Email OTP Expiration" (seconds / 3600).
create function public.confirmation_link_hours() returns int language sql immutable as $$ select 24 $$;
create function public.max_confirmation_links() returns int language sql immutable as $$ select 3 $$;

create table public.pending_signups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  link_sent_at timestamptz not null,
  link_expires_at timestamptz not null,
  links_sent int not null default 1,
  created_at timestamptz not null default now()
);

-- No policies: the app's users can't read or change this table; only the database itself does.
alter table public.pending_signups enable row level security;

create function public.sync_pending_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null then
    delete from public.pending_signups where user_id = new.id;
  elsif new.confirmation_sent_at is not null then
    insert into public.pending_signups (user_id, email, link_sent_at, link_expires_at)
    values (new.id, new.email, new.confirmation_sent_at,
            new.confirmation_sent_at + make_interval(hours => public.confirmation_link_hours()))
    on conflict (user_id) do update set
      link_sent_at = excluded.link_sent_at,
      link_expires_at = excluded.link_expires_at,
      links_sent = pending_signups.links_sent
        + case when pending_signups.link_sent_at <> excluded.link_sent_at then 1 else 0 end;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_pending
  after insert on auth.users
  for each row execute function public.sync_pending_signup();

create trigger on_auth_user_confirmation_changed
  after update of email_confirmed_at, confirmation_sent_at on auth.users
  for each row execute function public.sync_pending_signup();

-- Backfill accounts that are already waiting.
insert into public.pending_signups (user_id, email, link_sent_at, link_expires_at)
select id, email, confirmation_sent_at, confirmation_sent_at + make_interval(hours => public.confirmation_link_hours())
from auth.users
where email_confirmed_at is null and confirmation_sent_at is not null
on conflict do nothing;

-- Runs every 15 minutes. Needs the vault secrets project_url, anon_key and site_url
-- (see supabase/setup_email_resend.sql).
create function public.process_expired_signups() returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.pending_signups;
  project_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  anon_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  site_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url');
begin
  for r in select * from public.pending_signups where link_expires_at < now() loop
    if r.links_sent >= public.max_confirmation_links() or project_url is null then
      -- Cascades to profiles and pending_signups.
      delete from auth.users where id = r.user_id and email_confirmed_at is null;
    else
      perform net.http_post(
        url := project_url || '/auth/v1/resend?redirect_to='
          || replace(replace(site_url || '/login?verified=1', '?', '%3F'), '=', '%3D'),
        headers := jsonb_build_object('apikey', anon_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('type', 'signup', 'email', r.email)
      );
      -- Hold off retrying for another full period; when Supabase records the new link,
      -- sync_pending_signup replaces these values and counts the link.
      update public.pending_signups
        set link_expires_at = now() + make_interval(hours => public.confirmation_link_hours())
        where user_id = r.user_id;
    end if;
  end loop;
end;
$$;

select cron.schedule('process-expired-signups', '*/15 * * * *', 'select public.process_expired_signups()');
