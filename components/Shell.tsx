import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download as DownloadIcon,
  Columns3,
  History,
  ListChecks,
  LogOut,
  Moon,
  SlidersHorizontal,
  Stamp,
  Sun,
  Trophy,
  Users,
} from "lucide-react";
import { useApp } from "../lib/store";
import { ViewId } from "../lib/types";
import { Avatar, Button, ConfirmDialog, Toasts, cx } from "./ui";
import { Scoreboard } from "./views/Scoreboard";
import { Board } from "./views/Board";
import { MyWork } from "./views/MyWork";
import { Approvals } from "./views/Approvals";
import { Analytics } from "./views/Analytics";
import { Plan } from "./views/Plan";
import { Team } from "./views/Team";
import { Activity } from "./views/Activity";
import { TaskDrawer } from "./TaskDrawer";

const NAV: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }>; admin?: boolean }[] = [
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
  const { view, setView, isAdmin, profile, profiles, deliverables, theme, toggleTheme, signOut, toasts, confirmState, closeConfirm, loading, memberIndex, askConfirm } = useApp();

  const pendingCount = useMemo(() => deliverables.filter((d) => d.status === "pending").length, [deliverables]);
  const mineOpen = useMemo(
    () => deliverables.filter((d) => d.assignee_id === profile?.id && d.status !== "approved" && d.status !== "pending").length,
    [deliverables, profile]
  );
  const waiting = profiles.filter((p) => !p.active).length;

  const items = NAV.filter((n) => !n.admin || isAdmin);
  const badge = (id: ViewId): number => (id === "approvals" ? pendingCount : id === "mine" ? mineOpen : id === "team" && isAdmin ? waiting : 0);

  const current = !isAdmin && (view === "approvals" || view === "plan") ? "scoreboard" : view;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white font-display text-base font-bold tracking-wide text-rail">PT</div>
            <span className="font-display text-xl font-semibold tracking-wide">ProjectTrack</span>
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            {install && (
              <button type="button" onClick={install} className="rounded-md px-2 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10" aria-label="Install app">Install</button>
            )}
            <button type="button" onClick={toggleTheme} className="rounded-md p-2 text-white/70 hover:bg-white/10" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => signOut()} className="rounded-md p-2 text-white/70 hover:bg-white/10" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="scroll-thin flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0" aria-label="Main">
          {items.map((n) => {
            const Icon = n.icon;
            const active = current === n.id;
            const count = badge(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setView(n.id)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition lg:w-full",
                  active ? "bg-white text-rail" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{n.label}</span>
                {count > 0 && (
                  <span className={cx("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-rail text-white" : "bg-warn text-rail")}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/10 p-4 lg:block">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.full_name || "?"} index={memberIndex(profile?.id)} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="text-xs text-white/55">{isAdmin ? "Group leader (admin)" : "Team member"}</p>
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
            <button
              type="button"
              onClick={async () => {
                if (await askConfirm({ title: "Sign out?", body: "Your work is already saved in the database.", confirmLabel: "Sign out" })) signOut();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 py-1.5 text-xs hover:bg-white/20"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          {isAdmin && waiting > 0 && current !== "team" && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm">
              <span>
                <strong>{waiting}</strong> {waiting === 1 ? "person is" : "people are"} waiting for account approval.
              </span>
              <Button size="sm" onClick={() => setView("team")}>Review in Team</Button>
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

      <TaskDrawer />
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          body={confirmState.body}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onClose={closeConfirm}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}
