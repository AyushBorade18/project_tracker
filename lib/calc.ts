import { Deliverable, Profile, Status, Subject } from "./types";

const DAY = 86_400_000;

export function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toDayStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Whole days from today to the given YYYY-MM-DD (negative = in the past). */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((parseDay(dateStr).getTime() - todayStart().getTime()) / DAY);
}

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = dateStr.length === 10 ? parseDay(dateStr) : new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return fmtDate(iso);
}

export function deadlineLabel(days: number | null): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (days === null) return { text: "No deadline", tone: "muted" };
  if (days < 0) return { text: `Overdue by ${-days} d`, tone: "bad" };
  if (days === 0) return { text: "Due today", tone: "bad" };
  if (days <= 3) return { text: `${days} d left`, tone: "warn" };
  return { text: `${days} d left`, tone: "ok" };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function effectiveDue(d: Deliverable, s?: Subject): string | null {
  return d.due_date || s?.deadline || null;
}

export function isOverdue(d: Deliverable, s?: Subject): boolean {
  if (d.status === "approved") return false;
  const days = daysUntil(effectiveDue(d, s));
  return days !== null && days < 0;
}

// ---------------------------------------------------------------------------

export type Pace = "none" | "done" | "overdue" | "behind" | "on_track";

export interface SubjectStat {
  subject: Subject;
  items: Deliverable[];
  count: number;
  doneCount: number;
  weightSum: number;
  /** percentages are normalised against the weight total, so they are right even if weights do not add to 100 */
  confirmedPct: number;
  pendingPct: number;
  inProgressPct: number;
  todoPct: number;
  configured: boolean;
  days: number | null;
  pace: Pace;
  expectedPct: number | null;
}

export function subjectStats(subject: Subject, all: Deliverable[]): SubjectStat {
  const items = all.filter((d) => d.subject_id === subject.id).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const w = (st: Status) => items.filter((d) => d.status === st).reduce((a, d) => a + (d.weight || 0), 0);
  const weightSum = items.reduce((a, d) => a + (d.weight || 0), 0);
  const norm = (x: number) => (weightSum > 0 ? (x / weightSum) * 100 : 0);
  const confirmedPct = norm(w("approved"));
  const pendingPct = norm(w("pending"));
  const inProgressPct = norm(w("in_progress"));
  const todoPct = norm(w("todo"));
  const days = daysUntil(subject.deadline);

  let pace: Pace = "none";
  let expectedPct: number | null = null;
  if (items.length > 0) {
    if (confirmedPct >= 99.5) pace = "done";
    else if (days !== null && days < 0) pace = "overdue";
    else if (subject.deadline) {
      const start = Math.min(...items.map((d) => new Date(d.created_at).getTime()));
      const end = parseDay(subject.deadline).getTime();
      const span = Math.max(end - start, DAY);
      const frac = Math.min(1, Math.max(0, (Date.now() - start) / span));
      expectedPct = frac * 100;
      pace = confirmedPct + pendingPct >= expectedPct - 5 ? "on_track" : "behind";
    }
  }

  return {
    subject,
    items,
    count: items.length,
    doneCount: items.filter((d) => d.status === "approved").length,
    weightSum,
    confirmedPct,
    pendingPct,
    inProgressPct,
    todoPct,
    configured: items.length > 0,
    days,
    pace,
    expectedPct,
  };
}

export interface OverallStat {
  subjectStats: SubjectStat[];
  confirmedPct: number;
  pendingPct: number;
  configuredCount: number;
  totalDeliverables: number;
  approvedCount: number;
  pendingCount: number;
  inProgressCount: number;
  todoCount: number;
  unassignedCount: number;
  overdueCount: number;
  nextDeadline: { subject: Subject; days: number } | null;
}

export function overallStats(subjects: Subject[], deliverables: Deliverable[]): OverallStat {
  const ss = subjects.map((s) => subjectStats(s, deliverables));
  const configured = ss.filter((s) => s.configured);
  const avg = (f: (s: SubjectStat) => number) => (configured.length ? configured.reduce((a, s) => a + f(s), 0) / configured.length : 0);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const upcoming = ss
    .filter((s) => s.subject.deadline && s.days !== null && s.days >= 0 && s.pace !== "done")
    .sort((a, b) => (a.days as number) - (b.days as number))[0];

  return {
    subjectStats: ss,
    confirmedPct: avg((s) => s.confirmedPct),
    pendingPct: avg((s) => s.pendingPct),
    configuredCount: configured.length,
    totalDeliverables: deliverables.length,
    approvedCount: deliverables.filter((d) => d.status === "approved").length,
    pendingCount: deliverables.filter((d) => d.status === "pending").length,
    inProgressCount: deliverables.filter((d) => d.status === "in_progress").length,
    todoCount: deliverables.filter((d) => d.status === "todo").length,
    unassignedCount: deliverables.filter((d) => !d.assignee_id).length,
    overdueCount: deliverables.filter((d) => isOverdue(d, subjectById.get(d.subject_id))).length,
    nextDeadline: upcoming ? { subject: upcoming.subject, days: upcoming.days as number } : null,
  };
}

export interface MemberStat {
  member: Profile;
  assigned: number;
  approved: number;
  pending: number;
  inProgress: number;
  todo: number;
  overdue: number;
  points: number;
  leads: string[];
}

export function memberStats(members: Profile[], subjects: Subject[], deliverables: Deliverable[]): MemberStat[] {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  return members
    .map((m) => {
      const mine = deliverables.filter((d) => d.assignee_id === m.id);
      return {
        member: m,
        assigned: mine.length,
        approved: mine.filter((d) => d.status === "approved").length,
        pending: mine.filter((d) => d.status === "pending").length,
        inProgress: mine.filter((d) => d.status === "in_progress").length,
        todo: mine.filter((d) => d.status === "todo").length,
        overdue: mine.filter((d) => isOverdue(d, subjectById.get(d.subject_id))).length,
        points: mine.filter((d) => d.status === "approved").reduce((a, d) => a + (d.weight || 0), 0),
        leads: subjects.filter((s) => s.lead_id === m.id).map((s) => s.code),
      };
    })
    .sort((a, b) => b.points - a.points || b.approved - a.approved || a.member.full_name.localeCompare(b.member.full_name));
}

export interface BurnPoint {
  date: string;
  label: string;
  done: number | null;
  ideal: number | null;
}

/** Overall confirmed % per day, built from each deliverable's confirmation timestamp, with a straight-line pace target. */
export function burnUp(subjects: Subject[], deliverables: Deliverable[]): BurnPoint[] {
  if (deliverables.length === 0) return [];
  const bySubject = new Map<string, Deliverable[]>();
  deliverables.forEach((d) => bySubject.set(d.subject_id, [...(bySubject.get(d.subject_id) || []), d]));
  const configured = subjects.filter((s) => (bySubject.get(s.id) || []).length > 0);
  if (configured.length === 0) return [];

  const today = todayStart();
  const startMs = Math.min(...deliverables.map((d) => new Date(d.created_at).getTime()));
  let start = new Date(startMs);
  start = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  const deadlines = configured.filter((s) => s.deadline).map((s) => parseDay(s.deadline as string).getTime());
  const lastDeadline = deadlines.length ? new Date(Math.max(...deadlines)) : null;
  let end = today;
  if (lastDeadline && lastDeadline > end) end = lastDeadline;

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY));
  const step = Math.max(1, Math.ceil(totalDays / 90));

  const points: BurnPoint[] = [];
  for (let i = 0; i <= totalDays; i += step) {
    const day = new Date(start.getTime() + i * DAY);
    points.push(makePoint(day));
  }
  const last = points[points.length - 1];
  if (last.date !== toDayStr(end)) points.push(makePoint(end));
  return points;

  function makePoint(day: Date): BurnPoint {
    const dayEnd = day.getTime() + DAY - 1;
    let done: number | null = null;
    if (day <= today) {
      let sum = 0;
      configured.forEach((s) => {
        const items = bySubject.get(s.id) || [];
        const total = items.reduce((a, d) => a + (d.weight || 0), 0);
        if (total <= 0) return;
        const ok = items
          .filter((d) => d.approved_at && new Date(d.approved_at).getTime() <= dayEnd)
          .reduce((a, d) => a + (d.weight || 0), 0);
        sum += (ok / total) * 100;
      });
      done = Math.round((sum / configured.length) * 10) / 10;
    }
    let ideal: number | null = null;
    if (lastDeadline) {
      const span = Math.max(lastDeadline.getTime() - start.getTime(), DAY);
      ideal = Math.round(Math.min(1, Math.max(0, (day.getTime() - start.getTime()) / span)) * 1000) / 10;
    }
    return { date: toDayStr(day), label: fmtDate(toDayStr(day)), done, ideal };
  }
}

export function statusReportText(subjects: Subject[], deliverables: Deliverable[], members: Profile[]): string {
  const o = overallStats(subjects, deliverables);
  const name = (id: string | null) => members.find((m) => m.id === id)?.full_name || "Unassigned";
  const lines: string[] = [];
  lines.push("PROJECTTRACK STATUS REPORT");
  lines.push(`Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`);
  lines.push("");
  o.subjectStats.forEach((s) => {
    const due = s.subject.deadline ? `due ${fmtDate(s.subject.deadline)}` : "no deadline";
    lines.push(
      `[${s.subject.code}] ${s.subject.name}: ${Math.round(s.confirmedPct)}% confirmed, +${Math.round(s.pendingPct)}% awaiting, lead ${name(s.subject.lead_id)}, ${due}`
    );
  });
  lines.push("");
  lines.push(`Overall confirmed: ${Math.round(o.confirmedPct)}% across ${o.configuredCount} planned subject(s)`);
  lines.push(`${o.approvedCount} confirmed, ${o.pendingCount} awaiting confirmation, ${o.overdueCount} overdue, ${o.unassignedCount} unassigned`);
  return lines.join("\n");
}

export function deliverablesCsv(subjects: Subject[], deliverables: Deliverable[], members: Profile[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Subject", "Deliverable", "Type", "Weight %", "Assignee", "Status", "Due", "Submitted", "Confirmed", "Link"];
  const rows = deliverables.map((d) => {
    const s = subjects.find((x) => x.id === d.subject_id);
    return [
      s?.code,
      d.title,
      d.type,
      d.weight,
      members.find((m) => m.id === d.assignee_id)?.full_name || "Unassigned",
      d.status,
      effectiveDue(d, s) || "",
      d.submitted_at ? fmtDate(d.submitted_at) : "",
      d.approved_at ? fmtDate(d.approved_at) : "",
      [d.live_url, d.repo_url, d.proof_url].filter(Boolean).join(" "),
    ]
      .map(esc)
      .join(",");
  });
  return [head.map(esc).join(","), ...rows].join("\n");
}

/**
 * When one deliverable's weight changes, the difference is shared evenly among the chosen others so the
 * subject keeps adding up to 100. Nobody goes below 0 or above 100: if someone cannot give or take their
 * share, the rest is spread over the others who still can.
 */
export function distributeWeights(
  others: { id: string; weight: number }[],
  chosenIds: string[],
  delta: number
): { id: string; weight: number }[] {
  const pool = others.filter((o) => chosenIds.includes(o.id)).map((o) => ({ ...o }));
  if (pool.length === 0 || delta === 0) return [];
  let remaining = Math.abs(delta);
  const sign = delta > 0 ? -1 : 1; // raising one means the others go down, and vice versa
  let guard = 0;
  while (remaining > 0 && guard++ < 200) {
    const able = pool.filter((p) => (sign < 0 ? p.weight > 0 : p.weight < 100));
    if (able.length === 0) break;
    const share = Math.max(1, Math.floor(remaining / able.length));
    for (const p of able) {
      if (remaining <= 0) break;
      const room = sign < 0 ? p.weight : 100 - p.weight;
      const step = Math.min(share, room, remaining);
      p.weight += sign * step;
      remaining -= step;
    }
  }
  const original = new Map(others.map((o) => [o.id, o.weight]));
  return pool.filter((p) => p.weight !== original.get(p.id)).map((p) => ({ id: p.id, weight: p.weight }));
}

/** The deadline has passed and the work is not approved: members are locked out until the leader extends it. */
export function isLockedByDeadline(d: Deliverable, s?: Subject): boolean {
  return isOverdue(d, s);
}

export const DEADLINE_MESSAGE = "The deadline is over. Uploads and submissions are closed. Ask your group leader for more time.";

/** New date after adding days to the later of today and the current date (so extending an old deadline starts from today). */
export function extendDate(current: string | null, days: number): string {
  const base = current && parseDay(current).getTime() > todayStart().getTime() ? parseDay(current) : todayStart();
  return toDayStr(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}
