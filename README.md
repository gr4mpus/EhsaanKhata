# Ehsaan Khata

Splitwise for favours. Group members log the favours they did for each other as **Ehsaan Points (EP)**. An entry only counts after more than the group's approval threshold (50% by default) of the *other* members approve it.

Stack: Next.js (installable PWA) + Supabase (Postgres, Auth, Realtime).

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor**, paste and run `supabase/migrations/20260927000000_init.sql`.
3. Set up email verification (see below).
4. `cp .env.local.example .env.local` and fill in the URL and anon key from **Project Settings → API**.
5. `npm install && npm run dev`, then open http://localhost:3000.

## Email verification (accounts on hold)

New accounts stay **on hold** until the person clicks the link in the verification email, then signs in.
Unverified accounts are tracked in `public.pending_signups` (migration `20260927010000_pending_signups.sql`):

- A row is kept while the link is valid (24 hours, the most Supabase allows).
- Every 15 minutes a `pg_cron` job finds expired links and emails a fresh one. The row is replaced with the new expiry.
- After 3 unanswered links, the unverified account is deleted so the email can sign up again.
- Signing in before verifying shows an "Account on hold" screen with a button to resend the link.

Setup:
1. **Authentication → Sign In / Providers → Email**: turn **Confirm email** ON, and set **Email OTP Expiration** to `86400` (24 hours).
2. **Authentication → URL Configuration**: set the Site URL, and add `http://localhost:3000/**` (plus your live URL) to Redirect URLs.
3. **Authentication → Emails → Templates → Confirm signup**: use a link, `<a href="{{ .ConfirmationURL }}">Verify my email</a>`.
   **Reset Password**: `{{ .Token }}` (password reset still uses a code).
4. Run `supabase/migrations/20260927010000_pending_signups.sql`, then `supabase/setup_email_resend.sql`, in the SQL Editor. The second file isn't in git because it holds your project URL and key; copy `.env.local` values into it if you need to recreate it.
5. Add your own SMTP provider (for example Resend) under **Authentication → Emails → SMTP Settings**. The built-in sender only sends a few emails an hour.

## Approval rule

The trigger `evaluate_entry` in the migration runs after every vote:

- Eligible voters: all current members except the person who logged the entry.
- **Approved** when `approvals / eligible > threshold`.
- **Rejected** as soon as approval becomes impossible, when `(eligible - rejections) / eligible <= threshold`.

Voters can change their vote while an entry is pending. The logger can withdraw a pending entry. Group admins can change the threshold.

## Deploy

Push to GitHub, import into [Vercel](https://vercel.com) (free), and add the two `NEXT_PUBLIC_SUPABASE_*` env vars. On a phone, open the site and use **Add to Home Screen** to install it like an app.
