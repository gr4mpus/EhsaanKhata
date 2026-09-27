-- Avatar chosen from the preset list in src/lib/avatars.ts, stored as "<style>:<seed>".
alter table public.profiles
  add column avatar text check (avatar ~ '^[a-z-]+:[A-Za-z0-9]+$');

alter table public.profiles
  add constraint display_name_length check (length(trim(display_name)) between 1 and 40) not valid;
