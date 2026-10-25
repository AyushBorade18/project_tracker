import React, { useMemo, useState } from "react";
import { useApp } from "../../lib/store";
import { daysUntil, deadlineLabel, effectiveDue, fmtDate, isOverdue } from "../../lib/calc";
import { Deliverable } from "../../lib/types";
import { Chip, EmptyState, PageTitle, Panel, StatusBadge, SubjectTag } from "../ui";
import { TaskRow } from "../TaskList";
import { UpdateDialog } from "../ProgressUpdates";
import { Play } from "lucide-react";
import { Button } from "../ui";

export function MyWork() {
  const { deliverables, subjects, profile, openTask, subjectIndex, tasks, patchDeliverable, readOnly } = useApp();
  const [posting, setPosting] = useState(false);
  const myTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === profile?.id).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due_date || "9999").localeCompare(b.due_date || "9999")),
    [tasks, profile]
  );
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
      <PageTitle
        title="My work"
        sub={mine.length ? `${done} of ${mine.length} of your deliverables are confirmed.` : undefined}
        action={mine.some((d) => d.status !== "approved") && !readOnly ? <Button variant="primary" onClick={() => setPosting(true)}>Post a progress update</Button> : undefined}
      />
      {posting && <UpdateDialog onClose={() => setPosting(false)} />}
      {myTasks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-display text-xl font-semibold tracking-wide">Tasks from your leader <span className="text-muted">({myTasks.filter((t) => t.status === "open").length} open)</span></h2>
          <Panel><ul className="divide-y divide-line">{myTasks.map((t) => <TaskRow key={t.id} task={t} showSubject />)}</ul></Panel>
        </section>
      )}
      {mine.length === 0 && myTasks.length === 0 ? (
        <EmptyState title="Nothing is assigned to you yet" body="When the group leader assigns you a deliverable or a task it shows up here, sorted by what needs you first." />
      ) : mine.length === 0 ? null : (
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
                    <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface2/70">
                    <button type="button" onClick={() => openTask(d.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left">
                      {s && <SubjectTag code={s.code} index={subjectIndex(s.id)} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        {d.feedback && d.status === "in_progress" && <span className="block truncate text-xs text-bad">{d.feedback}</span>}
                      </span>
                      <span className="text-xs text-muted">{d.weight}%</span>
                      {d.status !== "approved" && due && <Chip tone={dl.tone}>{fmtDate(due)}: {dl.text}</Chip>}
                      <StatusBadge status={d.status} />
                    </button>
                    {d.status === "todo" && !readOnly && !(dl.tone === "bad" && due && daysUntil(due) !== null && (daysUntil(due) as number) < 0) && (
                      <Button size="sm" variant="ok" onClick={() => patchDeliverable(d.id, { status: "in_progress" }, "Started. Your leader can see when you began.")}><Play className="h-3.5 w-3.5" /> Start</Button>
                    )}
                    {d.status !== "approved" && due && (daysUntil(due) as number) < 0 && <p className="basis-full text-xs text-bad">Deadline is over. Open it to ask your leader for more time.</p>}
                    </div>
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
