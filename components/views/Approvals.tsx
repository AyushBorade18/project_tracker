import React, { useState } from "react";
import { Check, ExternalLink, Paperclip } from "lucide-react";
import { useApp } from "../../lib/store";
import { fmtDate, fmtDateTime } from "../../lib/calc";
import { Undo2 } from "lucide-react";
import { TaskRow } from "../TaskList";
import { Avatar, Button, EmptyState, PageTitle, Panel, SubjectTag, inputCls } from "../ui";

export function Approvals() {
  const { deliverables, tasks, subjects, attachments, nameOf, memberIndex, subjectIndex, openTask, patchDeliverable, openAttachment, notify, askConfirm } = useApp();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const queue = deliverables.filter((d) => d.status === "pending").sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));
  const recent = deliverables.filter((d) => d.status === "approved").sort((a, b) => (b.approved_at || "").localeCompare(a.approved_at || "")).slice(0, 10);

  const reviewTasks = tasks.filter((t) => t.status === "review").sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));
  const doneTasks = tasks.filter((t) => t.status === "done").sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")).slice(0, 8);

  const approve = async (d: (typeof queue)[number]) => {
    const s = subjects.find((x) => x.id === d.subject_id);
    const sure = await askConfirm({
      title: `Approve "${d.title}"?`,
      body: `${d.weight}% is added to ${s?.code || "the subject"} and the work is locked for ${nameOf(d.assignee_id)}. You can revert the approval later.`,
      confirmLabel: "Approve",
    });
    if (sure) patchDeliverable(d.id, { status: "approved" }, "Approved");
  };

  const revert = async (d: (typeof recent)[number]) => {
    const sure = await askConfirm({
      title: `Revert the approval of "${d.title}"?`,
      body: "It goes back to the assignee as reassigned and its percentage is removed from the subject. It has to be submitted and approved again.",
      confirmLabel: "Revert approval",
      danger: true,
    });
    if (sure) patchDeliverable(d.id, { status: "in_progress", feedback: "Approval reverted. Please check it and submit again." }, "Approval reverted. It is reassigned to " + nameOf(d.assignee_id));
  };

  return (
    <div>
      <PageTitle title="Approvals" sub="Oldest submission first. Approving a deliverable adds its weight to the subject percentage. You can revert an approval any time." />
      {queue.length === 0 && reviewTasks.length === 0 ? (
        <EmptyState title="Queue is clear" body="Nothing is waiting for you. New submissions show up here instantly." />
      ) : queue.length === 0 ? null : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {queue.map((d) => {
            const s = subjects.find((x) => x.id === d.subject_id);
            const files = attachments.filter((a) => a.deliverable_id === d.id);
            return (
              <Panel key={d.id} className="flex flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">{s && <SubjectTag code={s.code} index={subjectIndex(s.id)} />}<span className="text-xs text-muted">{d.type}</span></div>
                  <span className="font-display text-2xl font-semibold text-warn">+{d.weight}%</span>
                </div>
                <button type="button" onClick={() => openTask(d.id)} className="mt-2 text-left font-display text-2xl font-semibold tracking-wide hover:text-info">{d.title}</button>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <Avatar name={nameOf(d.assignee_id)} index={memberIndex(d.assignee_id)} size={20} />
                  {nameOf(d.assignee_id)}{d.submitted_at && `, submitted ${fmtDateTime(d.submitted_at)}`}
                </p>
                <div className="mt-3 flex-1 rounded-md border border-line bg-surface2 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{d.work_made || "No notes. Check the files and links below."}</p>
                  {[["Deployed app", d.live_url], ["GitHub repo", d.repo_url], ["Link", d.proof_url]].map(([label, url]) =>
                    url && /^https?:\/\//i.test(url) ? (
                      <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 break-all text-xs text-info hover:underline"><ExternalLink className="h-3 w-3 shrink-0" /> {label}: {url}</a>
                    ) : null
                  )}
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {files.map((f) => (
                        <li key={f.id}><button type="button" onClick={() => openAttachment(f)} className="inline-flex items-center gap-1 text-xs text-info hover:underline"><Paperclip className="h-3 w-3" /> {f.file_name}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
                {rejectId === d.id ? (
                  <div className="mt-3">
                    <textarea rows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change?" className={inputCls} />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="primary" onClick={async () => {
                        if (!reason.trim()) return notify("Add a reason so they know what to fix.", "bad");
                        if (await patchDeliverable(d.id, { status: "in_progress", feedback: reason.trim() }, "Sent back for changes")) { setRejectId(null); setReason(""); }
                      }}>Send back</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Button variant="ok" className="flex-1" onClick={() => approve(d)}><Check className="h-4 w-4" /> Approve (+{d.weight}%)</Button>
                    <Button onClick={() => { setRejectId(d.id); setReason(""); }}>Request changes</Button>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {reviewTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl font-semibold tracking-wide">Tasks awaiting review <span className="text-muted">({reviewTasks.length})</span></h2>
          <Panel><ul className="divide-y divide-line">{reviewTasks.map((t) => <TaskRow key={t.id} task={t} showSubject defaultOpen />)}</ul></Panel>
        </section>
      )}

      {doneTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl font-semibold tracking-wide">Recently approved tasks</h2>
          <Panel><ul className="divide-y divide-line">{doneTasks.map((t) => <TaskRow key={t.id} task={t} showSubject />)}</ul></Panel>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-xl font-semibold tracking-wide">Recently approved</h2>
          <Panel className="divide-y divide-line">
            {recent.map((d) => {
              const s = subjects.find((x) => x.id === d.subject_id);
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {s && <SubjectTag code={s.code} index={subjectIndex(s.id)} />}
                  <button type="button" onClick={() => openTask(d.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium hover:text-info">{d.title}</span>
                    <span className="block text-xs text-muted">{nameOf(d.assignee_id)}{d.approved_at && `, approved ${fmtDate(d.approved_at)}`}</span>
                  </button>
                  <span className="text-xs text-muted">{d.weight}%</span>
                  <Button size="sm" onClick={() => revert(d)}><Undo2 className="h-3.5 w-3.5" /> Revert approval</Button>
                </div>
              );
            })}
          </Panel>
        </section>
      )}
    </div>
  );
}
