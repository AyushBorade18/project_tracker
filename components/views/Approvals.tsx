import React, { useState } from "react";
import { Check, ExternalLink, Paperclip } from "lucide-react";
import { useApp } from "../../lib/store";
import { fmtDateTime } from "../../lib/calc";
import { Avatar, Button, EmptyState, PageTitle, Panel, SubjectTag, inputCls } from "../ui";

export function Approvals() {
  const { deliverables, subjects, attachments, nameOf, memberIndex, subjectIndex, openTask, patchDeliverable, openAttachment, notify } = useApp();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const queue = deliverables.filter((d) => d.status === "pending").sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));

  return (
    <div>
      <PageTitle title="Approvals" sub="Oldest submission first. Confirming a deliverable adds its weight to the subject percentage." />
      {queue.length === 0 ? (
        <EmptyState title="Queue is clear" body="Nothing is waiting for you. New submissions show up here instantly." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
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
                  <p className="whitespace-pre-wrap">{d.work_made || "No description. Check the files and link."}</p>
                  {d.proof_url && /^https?:\/\//i.test(d.proof_url) && (
                    <a href={d.proof_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-xs text-info hover:underline"><ExternalLink className="h-3 w-3 shrink-0" /> {d.proof_url}</a>
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
                    <Button variant="ok" className="flex-1" onClick={() => patchDeliverable(d.id, { status: "approved" }, "Confirmed")}><Check className="h-4 w-4" /> Confirm (+{d.weight}%)</Button>
                    <Button onClick={() => { setRejectId(d.id); setReason(""); }}>Request changes</Button>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
