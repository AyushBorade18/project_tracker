import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MEMBER_COLORS, SUBJECT_COLORS, initials } from "../lib/theme";
import { Status, STATUS_LABEL } from "../lib/types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- Buttons ----------
type BtnVariant = "primary" | "ghost" | "soft" | "danger" | "ok";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-ink text-canvas hover:opacity-90",
  ok: "bg-ok text-white hover:opacity-90",
  soft: "bg-surface2 text-ink border border-line hover:bg-line/40",
  ghost: "text-muted hover:text-ink hover:bg-line/40",
  danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad hover:text-white",
};

export function Button({
  variant = "soft",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        BTN[variant],
        className
      )}
    />
  );
}

// ---------- Surfaces ----------
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("bg-surface border border-line rounded-lg", className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
      <div>
        <h3 className="font-display text-xl font-semibold tracking-wide leading-none">{title}</h3>
        {hint && <p className="text-xs text-muted mt-1.5 max-w-prose">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-wide leading-none">{title}</h1>
        {sub && <p className="text-sm text-muted mt-2 max-w-2xl">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-line rounded-lg p-8 text-center bg-surface">
      <p className="font-display text-xl font-semibold tracking-wide">{title}</p>
      {body && <p className="text-sm text-muted mt-1.5 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ---------- Badges ----------
const STATUS_STYLE: Record<Status, string> = {
  approved: "bg-ok/12 text-ok border-ok/30",
  pending: "bg-warn/15 text-warn border-warn/35",
  in_progress: "bg-info/12 text-info border-info/30",
  todo: "bg-line/50 text-muted border-line",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({ children, tone = "muted", className }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "muted" | "info"; className?: string }) {
  const t = {
    ok: "bg-ok/12 text-ok border-ok/30",
    warn: "bg-warn/15 text-warn border-warn/35",
    bad: "bg-bad/12 text-bad border-bad/30",
    info: "bg-info/12 text-info border-info/30",
    muted: "bg-surface2 text-muted border-line",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", t, className)}>{children}</span>;
}

export function SubjectTag({ code, index }: { code: string; index: number }) {
  const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 font-display text-sm font-semibold tracking-wider text-white leading-none"
      style={{ background: color }}
    >
      {code}
    </span>
  );
}

export function Avatar({ name, index, size = 28 }: { name: string; index: number; size?: number }) {
  const color = MEMBER_COLORS[index % MEMBER_COLORS.length];
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initials(name)}
    </span>
  );
}

// ---------- Progress ----------
export function StackBar({
  confirmed,
  pending,
  inProgress = 0,
  height = 8,
  animate = false,
}: {
  confirmed: number;
  pending: number;
  inProgress?: number;
  height?: number;
  animate?: boolean;
}) {
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-line/60" style={{ height }} role="img" aria-label={`${Math.round(confirmed)}% confirmed, ${Math.round(pending)}% awaiting confirmation`}>
      <div className={cx("bg-ok", animate && "lane-grow")} style={{ width: `${confirmed}%` }} />
      <div className={cx("hatch", animate && "lane-grow")} style={{ width: `${pending}%` }} />
      <div className={cx("bg-info/45", animate && "lane-grow")} style={{ width: `${inProgress}%` }} />
    </div>
  );
}

// ---------- Form controls ----------
export const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-info focus:outline-none disabled:opacity-60 disabled:bg-surface2";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-faint mt-1">{hint}</span>}
    </label>
  );
}

/** Text input that keeps local edits and saves only on blur / Enter, so typing never fires a request per keystroke. */
export function CommitInput({
  value,
  onCommit,
  className,
  disabled,
  placeholder,
  type = "text",
  multiline,
  rows = 3,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  const commit = () => {
    focused.current = false;
    if (local !== value) onCommit(local);
  };
  const common = {
    value: local,
    disabled,
    placeholder,
    onFocus: () => (focused.current = true),
    onBlur: commit,
    className: cx(inputCls, className),
  };
  if (multiline) {
    return <textarea rows={rows} {...common} onChange={(e) => setLocal(e.target.value)} />;
  }
  return (
    <input
      type={type}
      {...common}
      onChange={(e) => setLocal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// ---------- Overlays ----------
export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close panel" className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] cursor-default" onClick={onClose} />
      <div className="drawer-in absolute right-0 top-0 h-full w-full max-w-xl bg-surface border-l border-line shadow-lift overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-muted hover:text-ink hover:bg-line/40" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onClose,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: (ok: boolean) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Cancel" className="absolute inset-0 bg-ink/50 cursor-default" onClick={() => onClose(false)} />
      <div className="relative w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lift">
        <h2 className="font-display text-2xl font-semibold tracking-wide">{title}</h2>
        {body && <p className="text-sm text-muted mt-2">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => onClose(true)} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Toasts({ toasts }: { toasts: { id: number; msg: string; tone: "ok" | "bad" | "info" }[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 items-end" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "max-w-sm rounded-md border px-3.5 py-2.5 text-sm shadow-lift bg-surface",
            t.tone === "bad" ? "border-bad/50 text-bad" : "border-line text-ink"
          )}
        >
          <span className={cx("mr-2 inline-block h-2 w-2 rounded-full align-middle", t.tone === "bad" ? "bg-bad" : "bg-ok")} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}
