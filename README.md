# ProjectTrack

Team project tracker: subjects, deliverables, submissions with proof, leader approval, live charts.
Next.js (pages router) + Tailwind + Supabase (Auth, Postgres, Storage, Realtime) + Recharts.

## Setup
1. Create a Supabase project and run `supabase/migrations/001_init.sql` in the SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key
   (Project Settings, API Keys).
3. In Supabase, Authentication, Providers, Email: turn off "Confirm email" if you want instant sign-up
   (optional), and add your deployed URL under Authentication, URL Configuration.
4. `npm install` then `npm run dev`.
5. **Sign up yourself first.** The first account becomes the group leader (admin). Everyone after that
   signs up and waits for approval in Team.
6. On Vercel add the same two environment variables and redeploy.

## How saving works now
Everything is stored in Postgres, so progress is identical on every device and login. Files go to a private
Storage bucket. Permissions are enforced by the database (row level security and triggers), not the UI:
members can only edit their own assigned work, only the leader can confirm, approved work is locked, and every
change is written to the activity log.

## Installable app (PWA)
ProjectTrack can be installed on phones and laptops. It is HTTPS-only, so it works on your Vercel URL
(not on plain http except localhost). The service worker only runs in production builds.
- Android / Chrome / Edge: use the "Install app" button in the sidebar, or the browser's install icon.
- iPhone / iPad: open the site in Safari, tap Share, then Add to Home Screen.
Only the app shell is cached. Team data always comes live from Supabase, so offline you see a friendly
"You are offline" page instead of stale data. After a deploy, the new version loads on the next visit.
