import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { useApp } from "../lib/store";
import { daysUntil, deadlineLabel, fmtDate } from "../lib/calc";
import { Task } from "../lib/types";
import { Avatar, Button, Chip, cx, inputCls } from "./ui";

/** One action item. The leader can tick/delete anything; the assigned person can tick their own. */
export function TaskRow({ task, showSubject = false }: { task: Task; showSubject?: boolean }) {
  const { profile, isAdmin, readOnly, patchTask, deleteTask, askConfirm, nameOf, memberIndex, subjects } = useApp();
  const mine = task.assignee_id === profile?.id;
  const canToggle = !readOnly && (isAdmin || mine);
  const done = task.status === "done";
  const dl = deadlineLabel(done ? null : daysUntil(task.due_date));
  const subject = subjects.find((s) => s.id === task.subject_id);

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <button
        type="button"
        disabled={!canToggle}
        onClick={() => patchTask(task.id, { status: done ? "open" : "done" }, done ? "Task reopened" : "Marked as done")}
        aria-label={done ? `Reopen task: ${task.title}` : `Mark done: ${task.title}`}
        aria-pressed={done}
        className={cx("mt-0.5 shrink-0 rounded-full", canToggle ? "text-muted hover:text-ok" : "cursor-default text-faint")}
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm font-medium leading-snug", done && "text-muted line-through")}>{task.title}</p>
        {task.details && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{task.details}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {showSubject && subject && <Chip>{subject.code}</Chip>}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Avatar name={nameOf(task.assignee_id)} index={memberIndex(task.assignee_id)} size={18} />
            {task.assignee_id ? nameOf(task.assignee_id).split(" ")[0] : "Unassigned"}
          </span>
          {done ? (
            task.done_at && <Chip tone="ok">Done {fmtDate(task.done_at)}</Chip>
          ) : (
            task.due_date && <Chip tone={dl.tone}>{fmtDate(task.due_date)}: {dl.text}</Chip>
          )}
        </div>
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={async () => (await askConfirm({ title: "Remove this task?", body: task.title, confirmLabel: "Remove", danger: true })) && deleteTask(task.id)}
          className="shrink-0 rounded p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
          aria-label={`Remove task: ${task.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
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

  const items = useMemo(
    () =>
      tasks
        .filter((t) => t.subject_id === subjectId && (!deliverableId || t.deliverable_id === deliverableId))
        .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due_date || "9999").localeCompare(b.due_date || "9999") || a.created_at.localeCompare(b.created_at)),
    [tasks, subjectId, deliverableId]
  );
  const open = items.filter((t) => t.status === "open").length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return notify("Describe the task first.", "bad");
    setBusy(true);
    const ok = await addTask({ subject_id: subjectId, deliverable_id: deliverableId || null, title, assignee_id: assignee || null, due_date: due || null });
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
          <p className="mb-1.5 text-xs text-muted">{open} open, {items.length - open} done</p>
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
