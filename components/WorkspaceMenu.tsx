import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Plus, PlusCircle } from "lucide-react";
import { useApp } from "../lib/store";
import { cx, inputCls } from "./ui";

/**
 * One slim button that shows "Group / Semester". Everything else (switching, renaming, new semester,
 * joining another group) lives in the dropdown, so it takes a single line of space instead of a whole card.
 */
export function WorkspaceMenu({ variant }: { variant: "rail" | "bar" }) {
  const { groups, group, switchGroup, semesters, semester, setSemesterId, isLeader, renameSemester, setShowOnboarding, setView, readOnly } = useApp();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setRenaming(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setRenaming(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => { setOpen(false); setRenaming(false); };
  const ordered = [...semesters].reverse();
  const initial = (group?.name || "?").trim().charAt(0).toUpperCase();
  const rail = variant === "rail";

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch group or semester"
        className={cx(
          "flex w-full items-center gap-2.5 rounded-md text-left text-white transition",
          rail ? "bg-white/10 px-2.5 py-2 hover:bg-white/15" : "py-0.5 hover:opacity-90"
        )}
      >
        {rail && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/90 font-display text-lg font-bold text-rail">{initial}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{group?.name}</span>
          <span className="block truncate text-[11px] leading-tight text-white/65">
            {semester?.name}{readOnly ? " (archived)" : ""}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/60" />
      </button>

      {open && (
        <div
          role="menu"
          className={cx(
            "z-50 rounded-lg border border-line bg-surface text-ink shadow-lift",
            rail ? "absolute left-0 top-full mt-2 w-[17.5rem]" : "fixed inset-x-3 mt-2"
          )}
          style={rail ? undefined : { top: "calc(env(safe-area-inset-top) + 3.4rem)" }}
        >
          {groups.length > 1 && (
            <div className="border-b border-line p-1.5">
              <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Group</p>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={g.id === group?.id}
                  onClick={() => { if (g.id !== group?.id) switchGroup(g.id); close(); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface2"
                >
                  <span className="flex-1 truncate">{g.name}</span>
                  {g.id === group?.id && <Check className="h-4 w-4 text-ok" />}
                </button>
              ))}
            </div>
          )}

          <div className="border-b border-line p-1.5">
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Semester</p>
            {ordered.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={s.id === semester?.id}
                onClick={() => { setSemesterId(s.id); close(); }}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface2"
              >
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className={cx("shrink-0 rounded px-1.5 text-[10px] font-semibold", s.status === "current" ? "bg-ok/15 text-ok" : "bg-line/60 text-muted")}>
                  {s.status === "current" ? "Current" : "Archived"}
                </span>
                {s.id === semester?.id && <Check className="h-4 w-4 shrink-0 text-ok" />}
              </button>
            ))}
          </div>

          <div className="p-1.5">
            {isLeader && semester && !renaming && (
              <button type="button" role="menuitem" onClick={() => { setDraft(semester.name); setRenaming(true); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface2">
                <Pencil className="h-4 w-4 text-muted" /> Rename this semester
              </button>
            )}
            {isLeader && semester && renaming && (
              <form
                className="flex gap-1.5 px-1 py-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (draft.trim() && (await renameSemester(draft))) setRenaming(false);
                }}
              >
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} aria-label="Semester name" className={cx(inputCls, "min-w-0 flex-1 py-1.5 text-sm")} />
                <button type="submit" className="rounded-md bg-ok px-3 text-xs font-semibold text-white">Save</button>
              </form>
            )}
            {isLeader && (
              <button type="button" role="menuitem" onClick={() => { close(); setView("plan"); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface2">
                <PlusCircle className="h-4 w-4 text-muted" /> Start a new semester
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => { close(); setShowOnboarding(true); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface2">
              <Plus className="h-4 w-4 text-muted" /> Join or create another group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
