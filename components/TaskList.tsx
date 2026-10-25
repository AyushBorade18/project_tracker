import React, { useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Circle, Clock, Plus, Trash2, Undo2 } from "lucide-react";
import { useApp } from "../lib/store";
import { DEADLINE_MESSAGE, daysUntil, deadlineLabel, extendDate, fmtDate } from "../lib/calc";
import { Task } from "../lib/types";
import { Avatar, Button, Chip, cx, inputCls } from "./ui";

const REVERT_NOTE = "Approval reverted. Please redo it and submit again.";

export function taskLabel(t: Task): { text: string; tone: "info" | "warn" | "ok" | "bad" } {
  if (t.status === "done") return { text: "Done", tone: "ok" };
  if (t.status === "review") return { text: "Awaiting review", tone: "warn" };
  if (t.feedback) return { text: t.feedback.startsWith("Approval reverted") ? "Reassigned" : "Changes requested", tone: "bad" };
  return { text: "Assigned", tone: "info" };
}

/**
 * One task. Click to open it.
 *  member: write what you did and submit it for review (it then waits for the leader)
 *  leader: approve it, send it back with a reason, or revert an approval (it returns to the member as reassigned)
 */
export function TaskRow({ task, showSubject = false, defaultOpen = false }: { task: Task; showSubject?: boolean; defaultOpen?: boolean }) {
  const { profile, isAdmin, readOnly, patchTask, deleteTask, askConfirm, notify, nameOf, memberIndex, subjects, requestMoreTime } = useApp();
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState(task.note || "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [moreNote, setMoreNote] = useState("");
  const [requested, setRequested] = useState(false);

  const mine = task.assignee_id === profile?.id;
  const subject = subjects.find((s) => s.id === task.subject_id);
  const label = taskLabel(task);
  const dl = deadlineLabel(task.status === "done" ? null : daysUntil(task.due_date));
  const overdue = task.status !== "done" && !!task.due_date && (daysUntil(task.due_date) ?? 0) < 0;
  const locked = overdue && !isAdmin;
  const canWork = !readOnly && (isAdmin || mine) && task.status !== "done" && !locked;
  const Icon = task.status === "done" ? CheckCircle2 : task.status === "review" ? Clock : Circle;
  const iconTone = task.status === "done" ? "text-ok" : task.status === "review" ? "text-warn" : label.tone === "bad" ? "text-bad" : "text-muted";

  const submit = async () => {
    const sure = await askConfirm({
      title: "Submit this task for review?",
      body: `"${task.title}" goes to your group leader. You can't change it while it waits, but you can withdraw it.`,
      confirmLabel: "Submit",
    });
    if (sure) patchTask(task.id, { status: "review", note: note.trim() }, "Submitted for review");
  };
  const withdraw = async () => {
    if (await askConfirm({ title: "Withdraw this task?", body: "It leaves the review queue and you can edit it again.", confirmLabel: "Withdraw" }))
      patchTask(task.id, { status: "open" }, "Withdrawn");
  };
  const approve = async () => {
    const sure = await askConfirm({
      title: `Approve "${task.title}"?`,
      body: `It is marked done and locked for ${nameOf(task.assignee_id)}. You can revert the approval later.`,
      confirmLabel: "Approve",
    });
    if (sure) patchTask(task.id, { status: "done" }, "Task approved");
  };
  const requestChanges = async () => {
    if (!reason.trim()) return notify("Tell them what to change.", "bad");
    if (await patchTask(task.id, { status: "open", feedback: reason.trim() }, "Sent back for changes")) { setRejecting(false); setReason(""); }
  };
  const revert = async () => {
    const sure = await askConfirm({
      title: `Revert the approval of "${task.title}"?`,
      body: `It goes back to ${nameOf(task.assignee_id)} as reassigned and has to be submitted and approved again.`,
      confirmLabel: "Revert approval",
      danger: true,
    });
    if (sure) patchTask(task.id, { status: "open", feedback: REVERT_NOTE }, "Approval reverted. The task is reassigned.");
  };

  return (
    <li className={cx(open && "bg-surface2/50")}>
      <div className="flex items-start gap-1 pr-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left">
          <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", iconTone)} />
          <span className="min-w-0 flex-1">
            <span className={cx("block text-sm font-medium leading-snug", task.status === "done" && "text-muted line-through")}>{task.title}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip tone={label.tone}>{label.text}</Chip>
              {showSubject && subject && <Chip>{subject.code}</Chip>}
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Avatar name={nameOf(task.assignee_id)} index={memberIndex(task.assignee_id)} size={18} />
                {task.assignee_id ? nameOf(task.assignee_id).split(" ")[0] : "Unassigned"}
              </span>
              {task.status === "done"
                ? task.done_at && <span className="text-xs text-muted">Approved {fmtDate(task.done_at)}</span>
                : task.due_date && <Chip tone={dl.tone}>{fmtDate(task.due_date)}: {dl.text}</Chip>}
            </span>
          </span>
          <ChevronDown className={cx("mt-1 h-4 w-4 shrink-0 text-faint transition", open && "rotate-180")} />
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={async () => (await askConfirm({ title: "Remove this task?", body: task.title, confirmLabel: "Remove", danger: true })) && deleteTask(task.id)}
            className="mt-2 shrink-0 rounded p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
            aria-label={`Remove task: ${task.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 px-4 pb-4 pl-11 text-sm">
          {task.details && <p className="whitespace-pre-wrap text-muted">{task.details}</p>}

          {locked && mine && !readOnly && (
            <div role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2.5">
              <p className="text-xs font-semibold text-bad">The deadline is over</p>
              <p className="mt-0.5">{DEADLINE_MESSAGE}</p>
              {requested ? (
                <p className="mt-2 text-ok">Request sent. You will be notified when your leader answers.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  <textarea rows={2} value={moreNote} onChange={(e) => setMoreNote(e.target.value)} placeholder="Why do you need more time, and how much? (optional)" aria-label="Reason for more time" className={inputCls} />
                  <Button size="sm" onClick={async () => { if (await requestMoreTime({ task_id: task.id }, moreNote)) setRequested(true); }}>Ask for more time</Button>
                </div>
              )}
            </div>
          )}

          {isAdmin && !readOnly && task.status !== "done" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Deadline</span>
              <input
                type="date"
                value={task.due_date || ""}
                onChange={(e) => patchTask(task.id, { due_date: e.target.value || null }, "Deadline updated")}
                aria-label="Task deadline"
                className={cx(inputCls, "w-auto py-1 text-xs")}
              />
              {[1, 3, 7].map((n) => (
                <button key={n} type="button" onClick={() => patchTask(task.id, { due_date: extendDate(task.due_date, n) }, `Deadline moved to ${fmtDate(extendDate(task.due_date, n))}`)} className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-[11px] font-medium hover:border-faint">
                  +{n === 7 ? "1 week" : `${n} day${n > 1 ? "s" : ""}`}
                </button>
              ))}
              {overdue && <span className="text-xs text-warn">Past the deadline: {nameOf(task.assignee_id)} is locked out until you extend it.</span>}
            </div>
          )}

          {task.feedback && task.status === "open" && (
            <div role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2">
              <p className="text-xs font-semibold text-bad">{task.feedback.startsWith("Approval reverted") ? "Reassigned to you" : "Changes requested"}</p>
              <p className="mt-0.5">{task.feedback}</p>
            </div>
          )}

          {(task.status === "review" || task.status === "done") && task.note && (
            <div className="rounded-md border border-line bg-surface px-3 py-2">
              <p className="text-xs font-medium text-muted">What was done</p>
              <p className="mt-0.5 whitespace-pre-wrap">{task.note}</p>
            </div>
          )}

          {/* Member (or leader on their own task): do the work, then submit */}
          {canWork && task.status === "open" && (
            <div className="space-y-2">
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you do? (optional, but it helps the reviewer)"
                aria-label="What did you do"
                className={inputCls}
              />
              <Button variant="primary" size="sm" onClick={submit}><Check className="h-3.5 w-3.5" /> Submit for review</Button>
            </div>
          )}
          {canWork && task.status === "review" && mine && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted">Waiting for your group leader to review it.</p>
              <Button size="sm" onClick={withdraw}><Undo2 className="h-3.5 w-3.5" /> Withdraw</Button>
            </div>
          )}
          {!canWork && !isAdmin && task.status === "review" && <p className="text-muted">Submitted. Waiting for the group leader to review it.</p>}
          {!isAdmin && task.status === "done" && <p className="text-muted">Approved and locked. Ask the group leader if it needs to reopen.</p>}
          {!isAdmin && !mine && task.status === "open" && <p className="text-muted">Assigned to {nameOf(task.assignee_id)}.</p>}

          {/* Leader */}
          {isAdmin && task.status === "review" && !rejecting && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ok" size="sm" onClick={approve}><Check className="h-3.5 w-3.5" /> Approve</Button>
              <Button size="sm" onClick={() => setRejecting(true)}>Request changes</Button>
            </div>
          )}
          {isAdmin && task.status === "review" && rejecting && (
            <div className="space-y-2 rounded-md border border-line bg-surface p-3">
              <textarea rows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change?" aria-label="What needs to change" className={inputCls} />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={requestChanges}>Send back</Button>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          )}
          {isAdmin && task.status === "done" && (
            <Button size="sm" onClick={revert}><Undo2 className="h-3.5 w-3.5" /> Revert approval</Button>
          )}
          {isAdmin && task.status === "open" && !canWork && <p className="text-muted">Waiting for {nameOf(task.assignee_id)} to do it and submit.</p>}
        </div>
      )}
    </li>
  );
}

/** Tasks for a whole project (subject), or for one deliverable inside it. */
export function TaskList({
  subjectId,
  deliverableId,
  defaultAssignee = null,
  startOpen = false,
  emptyText,
}: {
  subjectId: string;
  deliverableId?: string;
  defaultAssignee?: string | null;
  startOpen?: boolean;
  emptyText?: string;
}) {
  const { tasks, members, isAdmin, addTask, notify } = useApp();
  const [adding, setAdding] = useState(startOpen);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>(defaultAssignee || "");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const rank = { review: 0, open: 1, done: 2 } as const;
    return tasks
      .filter((t) => t.subject_id === subjectId && (!deliverableId || t.deliverable_id === deliverableId))
      .sort((a, b) => rank[a.status] - rank[b.status] || (a.due_date || "9999").localeCompare(b.due_date || "9999") || a.created_at.localeCompare(b.created_at));
  }, [tasks, subjectId, deliverableId]);
  const counts = { open: items.filter((t) => t.status === "open").length, review: items.filter((t) => t.status === "review").length, done: items.filter((t) => t.status === "done").length };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return notify("Describe the task first.", "bad");
    if (!assignee) return notify("Choose who this task is for.", "bad");
    setBusy(true);
    const ok = await addTask({ subject_id: subjectId, deliverable_id: deliverableId || null, title, assignee_id: assignee, due_date: due || null });
    setBusy(false);
    if (ok) {
      setTitle("");
      setDue("");
      if (!startOpen) setAdding(false);
    }
  };

  return (
    <div>
      {items.length > 0 ? (
        <>
          <p className="mb-1.5 text-xs text-muted">{counts.open} assigned, {counts.review} awaiting review, {counts.done} done</p>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {items.map((t) => <TaskRow key={t.id} task={t} />)}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">{emptyText || (isAdmin ? "No tasks yet. Assign what you need from the team." : "No tasks have been assigned here.")}</p>
      )}

      {isAdmin && (
        <div className="mt-3">
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Assign a task</Button>
          ) : (
            <form onSubmit={submit} className="space-y-2 rounded-md border border-line bg-surface2 p-3">
              <input
                autoFocus={!startOpen}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you need? e.g. Add the ER diagram to the report"
                aria-label="Task"
                maxLength={200}
                className={inputCls}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls} aria-label="Assign to">
                  <option value="">Assign to…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} aria-label="Due date (optional)" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={busy}>{busy ? "Assigning…" : "Assign task"}</Button>
                {!startOpen && <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
