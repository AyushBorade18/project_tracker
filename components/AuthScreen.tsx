import React, { useState } from "react";
import { KeyRound, Mail, ShieldCheck, Users } from "lucide-react";
import { ORIGINAL_SUBJECTS } from "../lib/types";
import { useApp } from "../lib/store";
import { Button, Field, inputCls } from "./ui";

type Mode = "signin" | "signup" | "forgot";

function friendly(msg: string): string {
  if (/invalid login/i.test(msg)) return "That email and password don't match. Check both and try again.";
  if (/not confirmed/i.test(msg)) return "Confirm your email first using the link we sent, then sign in.";
  if (/already registered/i.test(msg)) return "An account with this email already exists. Sign in instead.";
  if (/at least/i.test(msg) || /weak/i.test(msg)) return "Use a password with at least 8 characters.";
  if (/rate limit/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  return msg;
}

const SAMPLE = [
  { code: "EDI", color: "#2F6FED", done: 62, wait: 14 },
  { code: "DBMS", color: "#5B8A2A", done: 35, wait: 25 },
  { code: "DM", color: "#0E9AA7", done: 88, wait: 0 },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white font-display text-lg font-bold tracking-wide text-rail">PT</div>
      <span className="font-display text-2xl font-semibold tracking-wide text-white">ProjectTrack</span>
    </div>
  );
}

export function AuthScreen() {
  const { signIn, signUp, sendReset, recovery, setNewPassword, notify } = useApp();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (recovery) {
        if (password.length < 8) return setError("Use a password with at least 8 characters.");
        const err = await setNewPassword(password);
        if (err) setError(friendly(err));
        else notify("Password updated. You are signed in.");
        return;
      }
      if (mode === "signin") {
        const err = await signIn(email, password);
        if (err) setError(friendly(err));
      } else if (mode === "signup") {
        if (!name.trim()) return setError("Enter your full name so teammates recognise you.");
        if (password.length < 8) return setError("Use a password with at least 8 characters.");
        const err = await signUp(name, email, password);
        if (err === "CONFIRM_EMAIL") {
          setInfo("Account created. Open the confirmation email we sent, then sign in to join or create your group.");
          setMode("signin");
        } else if (err) setError(friendly(err));
      } else {
        const err = await sendReset(email);
        if (err) setError(friendly(err));
        else setInfo("If that email has an account, a reset link is on its way.");
      }
    } finally {
      setBusy(false);
    }
  };

  const title = recovery ? "Choose a new password" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden lg:flex flex-col justify-between bg-rail p-10 text-white">
        <Brand />
        <div>
          <h2 className="font-display text-6xl font-semibold leading-[0.95] tracking-wide">
            Every subject.
            <br />
            Every teammate.
            <br />
            One scoreboard.
          </h2>
          <p className="mt-5 max-w-sm text-sm text-white/70">
            Start a group or join one with a code. See who owes what, submit work with proof, and watch every subject move toward its finish line once your group leader confirms it.
          </p>
          <div className="mt-8 max-w-sm space-y-3" aria-hidden="true">
            {SAMPLE.map((s) => (
              <div key={s.code} className="flex items-center gap-3">
                <span className="w-12 rounded px-1.5 py-0.5 text-center font-display text-sm font-semibold tracking-wider" style={{ background: s.color }}>{s.code}</span>
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="lane-grow bg-[#22C59A]" style={{ width: `${s.done}%` }} />
                  <div className="lane-grow hatch" style={{ width: `${s.wait}%` }} />
                </div>
                <span className="w-9 text-right font-display text-lg">{s.done}%</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/50">Progress is stored in your team database, so it is the same on every device and every login.</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><span className="font-display text-3xl font-semibold tracking-wide">ProjectTrack</span></div>
          <h1 className="font-display text-4xl font-semibold tracking-wide">{title}</h1>
          <p className="mt-2 text-sm text-muted">
            {recovery
              ? "Pick something you will remember. You will be signed in right after."
              : mode === "signup"
              ? "After this you will join your team with a code, or start a new group of your own."
              : mode === "forgot"
              ? "Enter your email and we will send you a reset link."
              : "Use the email and password you registered with."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && !recovery && (
              <Field label="Full name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </Field>
            )}
            {!recovery && (
              <Field label="Email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
                  <input className={`${inputCls} pl-9`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </div>
              </Field>
            )}
            {mode !== "forgot" && (
              <Field label={recovery ? "New password" : "Password"} hint={mode === "signup" || recovery ? "At least 8 characters." : undefined}>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
                  <input
                    className={`${inputCls} pl-9`}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" && !recovery ? "current-password" : "new-password"}
                    required
                  />
                </div>
              </Field>
            )}

            {error && <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            {info && <p role="status" className="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}

            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Working…" : recovery ? "Save password" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>

          {!recovery && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
              {mode === "signin" ? (
                <>
                  <button type="button" className="text-info hover:underline" onClick={() => { setMode("signup"); setError(""); setInfo(""); }}>Create an account</button>
                  <button type="button" className="text-muted hover:underline" onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}>Forgot password?</button>
                </>
              ) : (
                <button type="button" className="text-info hover:underline" onClick={() => { setMode("signin"); setError(""); setInfo(""); }}>Back to sign in</button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function PendingScreen() {
  const { profile, group, signOut, refreshAll, setShowOnboarding } = useApp();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-warn" />
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-wide">Waiting for approval</h1>
        <p className="mt-3 text-sm text-muted">
          You asked to join <strong className="text-ink">{group?.name || "this group"}</strong> as <strong className="text-ink">{profile?.full_name}</strong> ({profile?.email}). The group leader needs to approve you before you can see the projects. This page updates by itself once that happens.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => refreshAll()}>Check again</Button>
          <Button onClick={() => setShowOnboarding(true)}>Use a different code</Button>
          <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

function parseSubjectLines(text: string): { code: string; name: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([A-Za-z0-9_-]{1,10})\s*[-:,\u2013]?\s+(.+)$/.exec(l);
      return m ? { code: m[1].toUpperCase(), name: m[2].trim() } : null;
    })
    .filter((x): x is { code: string; name: string } => x !== null);
}

export function OnboardingScreen() {
  const { joinGroup, createGroup, signOut, groups, setShowOnboarding, me, notify } = useApp();
  const [tab, setTab] = useState<"join" | "create">("join");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sem, setSem] = useState("");
  const [subjects, setSubjects] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return notify("Enter the code your group leader shared.", "bad");
    setBusy(true);
    await joinGroup(code);
    setBusy(false);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return notify("Give your group a name.", "bad");
    const list = parseSubjectLines(subjects);
    setBusy(true);
    await createGroup(name, sem.trim() || "Semester 1", list);
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <span className="font-display text-3xl font-semibold tracking-wide">ProjectTrack</span>
          {groups.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setShowOnboarding(false)}>Back to my groups</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign out</Button>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm text-muted"><Users className="h-4 w-4" /> Hi {me?.full_name?.split(" ")[0] || "there"}, which team are you on?</div>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-surface2 p-1" role="tablist">
            {(["join", "create"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={tab === t ? "rounded bg-surface py-2 text-sm font-semibold shadow-sm" : "rounded py-2 text-sm text-muted hover:text-ink"}
              >
                {t === "join" ? "Join a group" : "Create a group"}
              </button>
            ))}
          </div>

          {tab === "join" ? (
            <form onSubmit={join} className="mt-5 space-y-4">
              <Field label="Join code" hint="Your group leader sees it in the Team page. It looks like 7F3K9A2B.">
                <input className={`${inputCls} font-display text-2xl tracking-[0.2em] uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
              </Field>
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? "Sending…" : "Ask to join"}</Button>
              <p className="text-xs text-muted">The leader approves you before you can see anything.</p>
            </form>
          ) : (
            <form onSubmit={create} className="mt-5 space-y-4">
              <Field label="Group name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team BugSlayer, SY CSE Div B…" /></Field>
              <Field label="This semester's name"><input className={inputCls} value={sem} onChange={(e) => setSem(e.target.value)} placeholder="Sem 3, 2026-27" /></Field>
              <Field label="Subjects" hint="One per line: a short code, then the name. You can change these later in Plan.">
                <textarea rows={5} className={inputCls} value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder={"DM Discrete Mathematics\nOOPS Object-Oriented Programming"} />
              </Field>
              <button type="button" className="text-xs text-info hover:underline" onClick={() => setSubjects(ORIGINAL_SUBJECTS.map((s) => `${s.code} ${s.name}`).join("\n"))}>
                Fill in the six original subjects (EDI, FODS, DSAM, DM, OOPS, DBMS)
              </button>
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create group and become its leader"}</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function SetupScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-lg">
        <h1 className="font-display text-4xl font-semibold tracking-wide">Connect your database</h1>
        <p className="mt-3 text-sm text-muted">ProjectTrack needs two environment variables before it can load. Create a file named <code className="rounded bg-surface2 px-1.5 py-0.5">.env.local</code> next to <code className="rounded bg-surface2 px-1.5 py-0.5">package.json</code>:</p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface2 p-4 text-xs leading-relaxed">{`NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-KEY`}</pre>
        <p className="mt-3 text-sm text-muted">Find both under Project Settings, then API Keys in the Supabase dashboard. Restart <code className="rounded bg-surface2 px-1.5 py-0.5">npm run dev</code> afterwards. On Vercel, add the same two variables in the project settings and redeploy.</p>
      </div>
    </div>
  );
}
