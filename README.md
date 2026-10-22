# ProjectTrack

Team project tracker for any college group: subjects, deliverables, submissions with proof, leader review,
live charts. Next.js (pages router) + Tailwind + Supabase (Auth, Postgres, Storage, Realtime) + Recharts.
Installable as a phone/desktop app (PWA).

## How it works
- **Groups.** Anyone can create a group (they become its leader) or join one with an 8-character join code.
  Every group's data is private to its members, enforced by the database (row level security).
- **Semesters.** A group has one current semester. "Start a new semester" (Plan page) archives the old one as
  read-only history and starts a fresh one, optionally copying the subject list. Switch between semesters in the sidebar.
- **Submissions.** App and Website take a deployed link and/or a GitHub repo. PPT, Report, Research Paper and
  Logisim Project take a file upload only. Anything custom takes a link or a file.
- **Tasks.** The leader can assign small tasks inside any project, before work starts or later when something needs changing. People see theirs under My work and tick them off. Tasks do not change the percentage.
- **Review first.** Every submission goes to the group leader's Approvals queue. Work only counts once the leader
  confirms it, and the database refuses to confirm anything that was not submitted.

## Setup
**Database files, in order:**
- Fresh project: run `001_init.sql`, then `003_tasks.sql`.
- Data from the first version: run `002_upgrade_from_v1.sql` (not 001), then `003_tasks.sql`.
- Already on groups and semesters: run only `003_tasks.sql`.

**Already have data from the first version?** Do not run 001. Run `supabase/migrations/002_upgrade_from_v1.sql` instead.
It keeps every row and puts it all in one group ("My group") and one semester ("Semester 1"), which you can rename in the app.

**Fresh project?**
1. Create a Supabase project and run `supabase/migrations/001_init.sql` in the SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key (Project Settings, API Keys).
3. In Supabase, Authentication, Providers, Email: switch off "Confirm email" if you want instant sign-up (optional).
   Under URL Configuration add your deployed address as Site URL and Redirect URL.
4. `npm install` then `npm run dev`.
5. Sign up, then choose "Create a group". Share the join code from the Team page with your teammates and approve
   them there.
6. On Vercel add the same two environment variables and redeploy.

## Bringing data over from the original (browser-only) version
In the old app press Backup JSON. In the new app, as group leader, open Plan and use "Bring over data from the
original ProjectTrack". Subjects, deliverables, statuses, links and uploaded files are imported; people are matched by
name, so have teammates join first. Nothing is deleted, and existing subjects are only filled in.

## Safe rollout when people already use the old version
Do not push this to the branch your live site deploys from until the new backend is ready. Push it to a new branch
(for example `v2`); Vercel gives that branch its own preview URL. Add the two environment variables for Preview,
test with your group, import the backup, and only then merge to `main`.

## Installable app (PWA)
Works on HTTPS (your Vercel URL). Android/Chrome/Edge: use "Install app". iPhone: Safari, Share, Add to Home Screen.
Only the app shell is cached; team data always comes live, so offline you see an "offline" page instead of stale data.
Pinch zoom is disabled to feel like a native app.
