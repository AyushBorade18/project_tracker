import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Clipboard, Download, Flag } from "lucide-react";
import { useApp } from "../../lib/store";
import {
  Pace,
  SubjectStat,
  burnUp,
  deadlineLabel,
  deliverablesCsv,
  effectiveDue,
  fmtDate,
  isOverdue,
  memberStats,
  overallStats,
  statusReportText,
} from "../../lib/calc";
import { SUBJECT_COLORS } from "../../lib/theme";
import { Avatar, Button, Chip, EmptyState, PageTitle, Panel, PanelHeader, StackBar, StatusBadge, SubjectTag, cx } from "../ui";
import { BurnUpChart } from "../charts";

const PACE_CHIP: Record<Pace, { text: string; tone: "ok" | "warn" | "bad" | "muted" } | null> = {
  none: null,
  done: { text: "Finished", tone: "ok" },
  overdue: { text: "Past deadline", tone: "bad" },
  behind: { text: "Behind pace", tone: "warn" },
  on_track: { text: "On pace", tone: "ok" },
};

function Lane({ stat, index, open, onToggle }: { stat: SubjectStat; index: number; open: boolean; onToggle: () => void }) {
  const { nameOf, memberIndex, openTask, isAdmin, setView } = useApp();
  const { subject } = stat;
  const dl = deadlineLabel(stat.days);
  const pace = PACE_CHIP[stat.pace];
  const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length];

  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left hover:bg-surface2/70 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
        <div className="row-span-2 sm:row-span-1"><SubjectTag code={subject.code} index={index} /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{subject.name}</p>
          <p className="truncate text-xs text-muted">{subject.topic || "Topic not set yet"}</p>
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <span className="font-display text-3xl font-semibold leading-none tabular-nums">{Math.round(stat.confirmedPct)}%</span>
          <ChevronDown className={cx("h-4 w-4 text-faint transition", open && "rotate-180")} />
        </div>

        <div className="col-span-2 sm:col-span-1 sm:col-start-2">
          {stat.configured ? (
            <div className="relative">
              <StackBar confirmed={stat.confirmedPct} pending={stat.pendingPct} inProgress={stat.inProgressPct} height={14} animate />
              {stat.expectedPct !== null && (
                <span
                  className="absolute -top-1 h-[22px] w-0.5 rounded bg-ink/70"
                  style={{ left: `${Math.min(99.5, stat.expectedPct)}%` }}
                  title={`Where this subject should be today: ${Math.round(stat.expectedPct)}%`}
                />
              )}
              <Flag className="absolute -right-0.5 -top-4 h-3 w-3 text-faint" aria-hidden="true" />
            </div>
          ) : (
            <div className="h-3.5 rounded-full border border-dashed border-line" aria-label="Not planned yet" />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone={dl.tone}>{subject.deadline ? `${fmtDate(subject.deadline)}: ${dl.text}` : dl.text}</Chip>
            {pace && <Chip tone={pace.tone}>{pace.text}</Chip>}
            {stat.pendingPct > 0 && <Chip tone="warn">+{Math.round(stat.pendingPct)}% awaiting</Chip>}
            {stat.configured && <span className="text-[11px] text-muted">{stat.doneCount} of {stat.count} confirmed</span>}
            {subject.lead_id && <span className="text-[11px] text-muted">Lead: {nameOf(subject.lead_id)}</span>}
          </div>
        </div>
        <span className="sr-only" style={{ color }}>{subject.code}</span>
      </button>

      {open && (
        <div className="bg-surface2/60 px-4 pb-4 pt-1">
          {stat.items.length === 0 ? (
            <p className="py-3 text-sm text-muted">
              Nothing planned for {subject.code} yet.{" "}
              {isAdmin ? <button type="button" className="text-info hover:underline" onClick={() => setView("plan")}>Plan its deliverables</button> : "The group leader will set it up."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {stat.items.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => openTask(d.id)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:text-info">
                    <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                    <span className="hidden text-xs text-muted sm:inline">{d.weight}%</span>
                    <Avatar name={nameOf(d.assignee_id)} index={memberIndex(d.assignee_id)} size={22} />
                    <StatusBadge status={d.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Scoreboard() {
  const { subjects, deliverables, members, profile, isAdmin, nameOf, memberIndex, subjectIndex, openTask, notify, setView } = useApp();
  const [openLane, setOpenLane] = useState<string | null>(null);

  const overall = useMemo(() => overallStats(subjects, deliverables), [subjects, deliverables]);
  const mStats = useMemo(() => memberStats(members, subjects, deliverables), [members, subjects, deliverables]);
  const series = useMemo(() => burnUp(subjects, deliverables), [subjects, deliverables]);
  const maxPoints = Math.max(1, ...mStats.map((m) => m.points));

  const attention = useMemo(() => {
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const items: { id: string; title: string; why: string; tone: "bad" | "warn" | "info" }[] = [];
    deliverables.forEach((d) => {
      const s = subjectById.get(d.subject_id);
      const code = s?.code || "";
      if (isAdmin && d.status === "pending") items.push({ id: d.id, title: `${code} ${d.title}`, why: `Submitted by ${nameOf(d.assignee_id)}, needs your confirmation`, tone: "warn" });
      if (d.assignee_id === profile?.id && d.status === "in_progress" && d.feedback) items.push({ id: d.id, title: `${code} ${d.title}`, why: "Changes requested. Open it to see what to fix", tone: "bad" });
      if (isOverdue(d, s) && (isAdmin || d.assignee_id === profile?.id)) items.push({ id: d.id, title: `${code} ${d.title}`, why: `Overdue since ${fmtDate(effectiveDue(d, s))}, ${nameOf(d.assignee_id)}`, tone: "bad" });
    });
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(i.id + i.why) ? false : (seen.add(i.id + i.why), true))).slice(0, 7);
  }, [deliverables, subjects, isAdmin, profile, nameOf]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(statusReportText(subjects, deliverables, members));
      notify("Status report copied");
    } catch {
      notify("Your browser blocked copying. Use Download CSV instead.", "bad");
    }
  };
  const downloadCsv = () => {
    const blob = new Blob([deliverablesCsv(subjects, deliverables, members)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projecttrack-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const nd = overall.nextDeadline;

  return (
    <div>
      <PageTitle
        title="Scoreboard"
        sub={`Hello ${profile?.full_name.split(" ")[0]}. Confirmed percentages count only work the group leader has signed off.`}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={copyReport}><Clipboard className="h-3.5 w-3.5" /> Copy report</Button>
            <Button size="sm" onClick={downloadCsv}><Download className="h-3.5 w-3.5" /> Download CSV</Button>
          </div>
        }
      />

      {/* Score bug */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <Panel className="p-5">
          <p className="text-sm text-muted">Overall confirmed</p>
          <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="font-display text-7xl font-semibold leading-[0.85] tabular-nums sm:text-8xl">{Math.round(overall.confirmedPct)}</span>
            <span className="pb-1 font-display text-3xl text-muted sm:pb-2 sm:text-4xl">%</span>
            {overall.pendingPct > 0 && <Chip tone="warn" className="mb-3">+{Math.round(overall.pendingPct)}% awaiting</Chip>}
          </div>
          <div className="mt-4"><StackBar confirmed={overall.confirmedPct} pending={overall.pendingPct} height={10} animate /></div>
          <p className="mt-3 text-xs text-muted">
            Across {overall.configuredCount} of {subjects.length} subjects that have planned deliverables. {overall.approvedCount} of {overall.totalDeliverables} deliverables confirmed.
          </p>
        </Panel>

        <Panel className="divide-y divide-line">
          <Row label="Awaiting confirmation" value={overall.pendingCount} tone={overall.pendingCount ? "warn" : "muted"} onClick={isAdmin ? () => setView("approvals") : undefined} />
          <Row label="Overdue" value={overall.overdueCount} tone={overall.overdueCount ? "bad" : "muted"} />
          <Row label="Not assigned to anyone" value={overall.unassignedCount} tone={overall.unassignedCount ? "warn" : "muted"} onClick={isAdmin && overall.unassignedCount ? () => setView("plan") : undefined} />
          <Row
            label={nd ? `Next deadline: ${nd.subject.code}` : "Next deadline"}
            value={nd ? (nd.days === 0 ? "Today" : `${nd.days} d`) : "None set"}
            tone={nd && nd.days <= 3 ? "bad" : "muted"}
          />
        </Panel>
      </div>

      {/* Season lanes: the memorable element */}
      <Panel className="mt-6 overflow-hidden">
        <PanelHeader title="Season lanes" hint="Green is confirmed, hatched amber is submitted and waiting, blue is in progress. The dark tick is where each subject should be today to hit its deadline." />
        {subjects.length === 0 ? (
          <div className="p-4"><EmptyState title="No subjects yet" body={isAdmin ? "Add your subjects in Plan." : "The group leader will add subjects."} /></div>
        ) : (
          <div className="mt-2 border-t border-line">
            {overall.subjectStats.map((s) => (
              <Lane key={s.subject.id} stat={s} index={subjectIndex(s.subject.id)} open={openLane === s.subject.id} onToggle={() => setOpenLane(openLane === s.subject.id ? null : s.subject.id)} />
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Team table" hint="Ranked by confirmed points: the weight of every deliverable the leader has signed off." />
          {mStats.length === 0 ? (
            <div className="p-4"><EmptyState title="No active members" /></div>
          ) : (
            <ul className="divide-y divide-line">
              {mStats.map((m, i) => (
                <li key={m.member.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-center font-display text-xl font-semibold text-faint">{i + 1}</span>
                  <Avatar name={m.member.full_name} index={memberIndex(m.member.id)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.member.full_name}
                      {m.leads.length > 0 && <span className="ml-2 text-[11px] font-normal text-muted">leads {m.leads.join(", ")}</span>}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/60">
                      <div className="lane-grow h-full rounded-full bg-ok" style={{ width: `${(m.points / maxPoints) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {m.approved}/{m.assigned} confirmed
                      {m.pending > 0 && `, ${m.pending} awaiting`}
                      {m.overdue > 0 && <span className="text-bad">, {m.overdue} overdue</span>}
                    </p>
                  </div>
                  <span className="font-display text-3xl font-semibold tabular-nums">{m.points}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Needs attention" hint={isAdmin ? "Submissions to confirm and work running late." : "Changes requested on your work and anything overdue."} />
          {attention.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-muted">Nothing is blocked right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a, i) => (
                <li key={a.id + i}>
                  <button type="button" onClick={() => openTask(a.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface2/70">
                    <AlertTriangle className={cx("mt-0.5 h-4 w-4 shrink-0", a.tone === "bad" ? "text-bad" : "text-warn")} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block text-xs text-muted">{a.why}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader title="Confirmed over time" hint="The solid line is overall confirmed work. The dashed line is the straight path to 100% by the last deadline." />
        <div className="px-2 pb-3"><BurnUpChart points={series} /></div>
      </Panel>
    </div>
  );
}

function Row({ label, value, tone, onClick }: { label: string; value: React.ReactNode; tone: "warn" | "bad" | "muted"; onClick?: () => void }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  const inner = (
    <>
      <span className="text-sm text-muted">{label}</span>
      <span className={cx("font-display text-4xl font-semibold leading-none tabular-nums", color)}>{value}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surface2/70">{inner}</button>
  ) : (
    <div className="flex items-center justify-between px-5 py-4">{inner}</div>
  );
}
