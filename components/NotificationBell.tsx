import React, { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CalendarClock, CheckCheck, ClipboardCheck, ListTodo, MessageSquareText, Play, Undo2 } from "lucide-react";
import { useApp } from "../lib/store";
import { relTime } from "../lib/calc";
import { AppNotification } from "../lib/types";
import { cx } from "./ui";

function iconFor(kind: string) {
  if (kind.endsWith("approved")) return <ClipboardCheck className="h-4 w-4 text-ok" />;
  if (kind.endsWith("reverted") || kind.endsWith("changes")) return <Undo2 className="h-4 w-4 text-bad" />;
  if (kind.endsWith("submitted") || kind === "extension_requested") return <BellRing className="h-4 w-4 text-warn" />;
  if (kind === "deliverable_update") return <MessageSquareText className="h-4 w-4 text-info" />;
  if (kind === "deliverable_started") return <Play className="h-4 w-4 text-ok" />;
  if (kind === "deadline_changed") return <CalendarClock className="h-4 w-4 text-info" />;
  return <ListTodo className="h-4 w-4 text-info" />;
}

/** Bell with an unread count. New items also pop up as a toast the moment they arrive. */
export function NotificationBell({ variant }: { variant: "float" | "bar" }) {
  const { notifications, unreadCount, markRead, markAllRead, alertsPermission, enableAlerts, setView, openTask, isAdmin } = useApp();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read_at);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    if (n.task_id) {
      setView(isAdmin && n.kind === "task_submitted" ? "approvals" : isAdmin && n.kind === "extension_requested" ? "plan" : "mine");
    } else if (n.deliverable_id) {
      setView(isAdmin && n.kind === "deliverable_submitted" ? "approvals" : "board");
      setTimeout(() => openTask(n.deliverable_id), 50);
    }
  };

  const float = variant === "float";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className={cx(
          "relative transition",
          float
            ? "rounded-full border border-line bg-surface p-2.5 text-ink shadow-lift hover:bg-surface2"
            : "rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
        )}
      >
        {unreadCount > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-warn px-1 text-center text-[10px] font-bold leading-[18px] text-rail">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cx(
            "z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-lift",
            float ? "absolute right-0 top-full mt-2 w-[24rem] max-w-[calc(100vw-2rem)]" : "fixed inset-x-3 mt-2"
          )}
          style={float ? undefined : { top: "calc(env(safe-area-inset-top) + 3.4rem)" }}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-semibold tracking-wide">Notifications</h2>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 text-xs text-info hover:underline"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>
            )}
          </div>
          <div className="overflow-y-auto">
            {unread.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">You are all caught up. Anything new shows up here, and disappears once you have seen it.</p>
            ) : (
              <ul className="divide-y divide-line">
                {unread.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => go(n)} className={cx("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface2", !n.read_at && "bg-info/5")}>
                      <span className="mt-0.5 shrink-0">{iconFor(n.kind)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{n.title}</span>
                          {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-info" aria-label="Unread" />}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-faint">{relTime(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {alertsPermission === "default" && (
            <div className="border-t border-line bg-surface2 px-4 py-2.5 text-xs">
              <button type="button" onClick={enableAlerts} className="font-medium text-info hover:underline">Turn on phone and desktop alerts</button>
              <span className="text-muted"> for when the app is open in the background.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
