import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Columns3,
  Download as DownloadIcon,
  History,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  SlidersHorizontal,
  Stamp,
  Sun,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../lib/store";
import { ViewId } from "../lib/types";
import { Avatar, Button, ConfirmDialog, Toasts, cx, inputCls } from "./ui";
import { Scoreboard } from "./views/Scoreboard";
import { Board } from "./views/Board";
import { MyWork } from "./views/MyWork";
import { Approvals } from "./views/Approvals";
import { Analytics } from "./views/Analytics";
import { Plan } from "./views/Plan";
import { Team } from "./views/Team";
import { Activity } from "./views/Activity";
import { TaskDrawer } from "./TaskDrawer";
import { WorkspaceMenu } from "./WorkspaceMenu";

type Icon = React.ComponentType<{ className?: string }>;
const NAV: { id: ViewId; label: string; icon: Icon; admin?: boolean }[] = [
  { id: "scoreboard", label: "Scoreboard", icon: Trophy },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "mine", label: "My work", icon: ListChecks },
  { id: "approvals", label: "Approvals", icon: Stamp, admin: true },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "plan", label: "Plan", icon: SlidersHorizontal, admin: true },
  { id: "team", label: "Team", icon: Users },
  { id: "activity", label: "Activity", icon: History },
];

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Chrome/Edge/Android fire this when the app is installable; iOS has no event (use Share, Add to Home Screen). */
function useInstall() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return evt ? async () => { await evt.prompt(); await evt.userChoice; setEvt(null); } : null;
}

export function Shell() {
  const install = useInstall();
  const {
    view, setView, isAdmin, isLeader, profile, profiles, deliverables, theme, toggleTheme, signOut, toasts, confirmState, closeConfirm,
    loading, memberIndex, askConfirm, readOnly, semester, currentSemester, setSemesterId, setShowOnboarding, group,
  } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);

  const pendingCount = useMemo(() => deliverables.filter((d) => d.status === "pending").length, [deliverables]);
  const mineOpen = useMemo(
    () => deliverables.filter((d) => d.assignee_id === profile?.id && d.status !== "approved" && d.status !== "pending").length,
    [deliverables, profile]
  );
  const waiting = profiles.filter((p) => !p.active).length;

  const items = NAV.filter((n) => !n.admin || isAdmin);
  const badge = (id: ViewId): number => (id === "approvals" ? pendingCount : id === "mine" ? mineOpen : id === "team" && isLeader ? waiting : 0);
  const current = !isAdmin && (view === "approvals" || view === "plan") ? "scoreboard" : view;

  const go = (id: ViewId) => { setMoreOpen(false); setView(id); };
  const confirmSignOut = async () => {
    if (await askConfirm({ title: "Sign out?", body: "Your work is already saved in the database.", confirmLabel: "Sign out" })) signOut();
  };

  // Bottom bar: four main places plus More. Leaders get Approvals, members get Analytics.
  const tabIds: ViewId[] = ["scoreboard", "board", "mine", isAdmin ? "approvals" : "analytics"];
  const tabs = tabIds.map((id) => NAV.find((n) => n.id === id) as (typeof NAV)[number]);
  const moreItems = items.filter((n) => !tabIds.includes(n.id));
  const moreActive = moreItems.some((n) => n.id === current);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop rail */}
      <aside className="hidden bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="px-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white font-display text-base font-bold tracking-wide text-rail">PT</div>
            <span className="font-display text-xl font-semibold tracking-wide">ProjectTrack</span>
          </div>
          <div className="mt-5"><WorkspaceMenu variant="rail" /></div>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {items.map((n) => {
            const Ico = n.icon;
            const active = current === n.id;
            const count = badge(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => go(n.id)}
                aria-current={active ? "page" : undefined}
                className={cx("flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition", active ? "bg-white text-rail" : "text-white/70 hover:bg-white/10 hover:text-white")}
              >
                <Ico className="h-4 w-4" />
                <span className="flex-1 text-left">{n.label}</span>
                {count > 0 && <span className={cx("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-rail text-white" : "bg-warn text-rail")}>{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.full_name || "?"} index={memberIndex(profile?.id)} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="text-xs text-white/55">{isLeader ? "Group leader" : "Team member"}</p>
            </div>
          </div>
          {install && (
            <button type="button" onClick={install} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-white py-1.5 text-xs font-semibold text-rail hover:opacity-90">
              <DownloadIcon className="h-3.5 w-3.5" /> Install app
            </button>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={toggleTheme} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 py-1.5 text-xs hover:bg-white/20">
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" onClick={confirmSignOut} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 py-1.5 text-xs hover:bg-white/20">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-rail text-white lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white font-display text-sm font-bold text-rail">PT</div>
          <div className="min-w-0 flex-1"><WorkspaceMenu variant="bar" /></div>
          {install && (
            <button type="button" onClick={install} className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-rail">Install</button>
          )}
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-8 lg:pb-8 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          {readOnly && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2.5 text-sm">
              <span>You are viewing <strong>{semester?.name}</strong>, an archived semester. It is read-only.</span>
              {currentSemester && <Button size="sm" onClick={() => setSemesterId(currentSemester.id)}>Go to {currentSemester.name}</Button>}
            </div>
          )}
          {isLeader && waiting > 0 && current !== "team" && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm">
              <span><strong>{waiting}</strong> {waiting === 1 ? "person is" : "people are"} waiting for approval to join.</span>
              <Button size="sm" onClick={() => go("team")}>Review in Team</Button>
            </div>
          )}
          {loading && <p className="mb-3 text-xs text-muted">Syncing latest data…</p>}
          {current === "scoreboard" && <Scoreboard />}
          {current === "board" && <Board />}
          {current === "mine" && <MyWork />}
          {current === "approvals" && <Approvals />}
          {current === "analytics" && <Analytics />}
          {current === "plan" && <Plan />}
          {current === "team" && <Team />}
          {current === "activity" && <Activity />}
        </div>
      </main>

      {/* Mobile bottom tab bar, like a native app */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-rail text-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Main">
        <div className="grid grid-cols-5">
          {tabs.map((n) => {
            const Ico = n.icon;
            const active = current === n.id;
            const count = badge(n.id);
            return (
              <button key={n.id} type="button" onClick={() => go(n.id)} aria-current={active ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-white" : "text-white/55")}>
                <span className="relative">
                  <Ico className="h-5 w-5" />
                  {count > 0 && <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-warn px-1 text-center text-[10px] font-bold leading-4 text-rail">{count}</span>}
                </span>
                {n.label}
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-white" />}
              </button>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", moreActive ? "text-white" : "text-white/55")}>
            <span className="relative">
              <MoreHorizontal className="h-5 w-5" />
              {isLeader && waiting > 0 && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-warn" />}
            </span>
            More
            {moreActive && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-white" />}
          </button>
        </div>
      </nav>

      {/* More sheet (mobile) */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/50" onClick={() => setMoreOpen(false)} />
          <div className="drawer-in absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-2xl font-semibold tracking-wide">More</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-md p-2 text-muted hover:bg-line/40" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {moreItems.map((n) => {
                const Ico = n.icon;
                const count = badge(n.id);
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => go(n.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium">
                      <Ico className="h-5 w-5 text-muted" />
                      <span className="flex-1">{n.label}</span>
                      {count > 0 && <span className="rounded-full bg-warn px-2 text-xs font-semibold text-rail">{count}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center gap-3">
              <Avatar name={profile?.full_name || "?"} index={memberIndex(profile?.id)} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile?.full_name}</p>
                <p className="text-xs text-muted">{isLeader ? "Group leader" : "Team member"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={toggleTheme}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {theme === "dark" ? "Light mode" : "Dark mode"}</Button>
              <Button onClick={() => { setMoreOpen(false); confirmSignOut(); }}><LogOut className="h-4 w-4" /> Sign out</Button>
            </div>
          </div>
        </div>
      )}

      <TaskDrawer />
      {confirmState && (
        <ConfirmDialog title={confirmState.title} body={confirmState.body} confirmLabel={confirmState.confirmLabel} danger={confirmState.danger} onClose={closeConfirm} />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}
