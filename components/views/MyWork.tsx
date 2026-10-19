import React, { useMemo } from "react";
import { useApp } from "../../lib/store";
import { daysUntil, deadlineLabel, effectiveDue, fmtDate, isOverdue } from "../../lib/calc";
import { Deliverable } from "../../lib/types";
import { Chip, EmptyState, PageTitle, Panel, StatusBadge, SubjectTag } from "../ui";

export function MyWork() {
  const { deliverables, subjects, profile, openTask, subjectIndex } = useApp();
  const mine = useMemo(() => deliverables.filter((d) => d.assignee_id === profile?.id), [deliverables, profile]);
  const subjectOf = (d: Deliverable) => subjects.find((s) => s.id === d.subject_id);

  const sections = useMemo(() => {
    const fix = mine.filter((d) => d.status === "in_progress" && d.feedback);
    const fixIds = new Set(fix.map((d) => d.id));
    const late = mine.filter((d) => !fixIds.has(d.id) && isOverdue(d, subjectOf(d)));
    const lateIds = new Set(late.map((d) => d.id));
    const rest = mine.filter((d) => !fixIds.has(d.id) && !lateIds.has(d.id));
    const byDue = (a: Deliverable, b: Deliverable) => (effectiveDue(a, subjectOf(a)) || "9999").localeCompare(effectiveDue(b, subjectOf(b)) || "9999");
    return [
      { title: "Changes requested", items: fix },
      { title: "Overdue", items: late.sort(byDue) },
      { title: "To do and in progress", items: rest.filter((d) => d.status === "todo" || d.status === "in_progress").sort(byDue) },
      { title: "Waiting for the leader", items: rest.filter((d) => d.status === "pending") },
      { title: "Confirmed", items: rest.filter((d) => d.status === "approved") },
    ].filter((s) => s.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, subjects]);

  const done = mine.filter((d) => d.status === "approved").length;

  return (
    <div>
      <PageTitle title="My work" sub={mine.length ? `${done} of ${mine.length} of your deliverables are confirmed.` : undefined} />
      {mine.length === 0 ? (
        <EmptyState title="Nothing is assigned to you yet" body="When the group leader assigns you a deliverable it shows up here, sorted by what needs you first." />
      ) : (
        <div className="space-y-6">
          {sections.map((sec) => (
            <section key={sec.title}>
              <h2 className="mb-2 font-display text-xl font-semibold tracking-wide">{sec.title} <span className="text-muted">({sec.items.length})</span></h2>
              <Panel className="divide-y divide-line">
                {sec.items.map((d) => {
                  const s = subjectOf(d);
                  const due = effectiveDue(d, s);
                  const dl = deadlineLabel(d.status === "approved" ? null : daysUntil(due));
                  return (
                    <button key={d.id} type="button" onClick={() => openTask(d.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-surface2/70">
                      {s && <SubjectTag code={s.code} index={subjectIndex(s.id)} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        {d.feedback && d.status === "in_progress" && <span className="block truncate text-xs text-bad">{d.feedback}</span>}
                      </span>
                      <span className="text-xs text-muted">{d.weight}%</span>
                      {d.status !== "approved" && due && <Chip tone={dl.tone}>{fmtDate(due)}: {dl.text}</Chip>}
                      <StatusBadge status={d.status} />
                    </button>
                  );
                })}
              </Panel>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
