import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, ExternalLink, Paperclip, Trash2, Undo2, Upload } from "lucide-react";
import { useApp } from "../lib/store";
import { daysUntil, deadlineLabel, effectiveDue, fmtDate, fmtDateTime, formatBytes } from "../lib/calc";
import { Status, STATUS_LABEL } from "../lib/types";
import { Avatar, Button, Chip, CommitInput, Drawer, Field, StatusBadge, SubjectTag, cx, inputCls } from "./ui";

const STEPS: Status[] = ["todo", "in_progress", "pending", "approved"];

export function TaskDrawer() {
  const {
    openTaskId, openTask, deliverables, subjects, attachments, activity, members, profile, isAdmin, nameOf, memberIndex, subjectIndex,
    patchDeliverable, deleteDeliverable, uploadAttachment, deleteAttachment, openAttachment, askConfirm, notify,
  } = useApp();

  const d = deliverables.find((x) => x.id === openTaskId) || null;
  const subject = d ? subjects.find((s) => s.id === d.subject_id) : undefined;
  const files = useMemo(() => attachments.filter((a) => a.deliverable_id === d?.id), [attachments, d?.id]);
  const history = useMemo(() => activity.filter((a) => a.deliverable_id === d?.id).slice(0, 8), [activity, d?.id]);

  const [work, setWork] = useState("");
  const [proof, setProof] = useState("");
  const [dirty, setDirty] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDirty(false);
    setWork(d?.work_made || "");
    setProof(d?.proof_url || "");
    setRejecting(false);
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id]);

  useEffect(() => {
    if (!dirty && d) {
      setWork(d.work_made);
      setProof(d.proof_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.work_made, d?.proof_url]);

  const close = () => openTask(null);
  if (!d || !profile) return <Drawer open={false} onClose={close} label="Task details">{null}</Drawer>;

  const isOwner = d.assignee_id === profile.id;
  const canWork = (isAdmin || isOwner) && (isAdmin || d.status !== "approved");
  const due = effectiveDue(d, subject);
  const dl = deadlineLabel(d.status === "approved" ? null : daysUntil(due));
  const stepIndex = STEPS.indexOf(d.status);

  const saveProgress = async () => {
    const ok = await patchDeliverable(d.id, { work_made: work.trim(), proof_url: proof.trim() }, "Progress saved");
    if (ok) setDirty(false);
  };

  const submit = async () => {
    if (!work.trim() && !proof.trim() && files.length === 0) {
      notify("Describe what you made, add a link, or attach a file before submitting.", "bad");
      return;
    }
    const ok = await patchDeliverable(
      d.id,
      { work_made: work.trim(), proof_url: proof.trim(), status: "pending" },
      isAdmin ? "Submitted. You can confirm it now." : "Submitted. The group leader will confirm it."
    );
    if (ok) setDirty(false);
  };

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    for (const f of Array.from(list)) await uploadAttachment(d.id, f);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const approve = () => patchDeliverable(d.id, { status: "approved" }, "Confirmed. Percentage unlocked.");
  const requestChanges = async () => {
    if (!reason.trim()) {
      notify("Tell them what to change so they know what to fix.", "bad");
      return;
    }
    const ok = await patchDeliverable(d.id, { status: "in_progress", feedback: reason.trim() }, "Sent back for changes");
    if (ok) {
      setRejecting(false);
      setReason("");
    }
  };
  const revoke = async () => {
    if (await askConfirm({ title: "Revoke confirmation?", body: "The deliverable goes back to In progress and its percentage is removed from the subject.", confirmLabel: "Revoke", danger: true }))
      patchDeliverable(d.id, { status: "in_progress" }, "Confirmation revoked");
  };
  const remove = async () => {
    if (await askConfirm({ title: `Delete "${d.title}"?`, body: "Its files and history link are removed. Other weights are re-split evenly.", confirmLabel: "Delete", danger: true }))
      deleteDeliverable(d.id);
  };

  return (
    <Drawer open onClose={close} label={`Task: ${d.title}`}>
      <div className="p-6 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          {subject && <SubjectTag code={subject.code} index={subjectIndex(subject.id)} />}
          <Chip>{d.type}</Chip>
          <StatusBadge status={d.status} />
        </div>
        {isAdmin ? (
          <CommitInput
            value={d.title}
            onCommit={(v) => v.trim() && patchDeliverable(d.id, { title: v.trim() })}
            className="mt-3 font-display text-2xl font-semibold tracking-wide"
          />
        ) : (
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-wide">{d.title}</h2>
        )}
        {subject?.topic && <p className="mt-1 text-sm text-muted">{subject.name}: {subject.topic}</p>}

        {/* Progress steps: a real sequence */}
        <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={cx("h-1.5 rounded-full", i <= stepIndex ? (s === "pending" ? "hatch" : s === "approved" ? "bg-ok" : "bg-info") : "bg-line")} />
              <p className={cx("mt-1.5 text-[11px] leading-tight", i === stepIndex ? "font-semibold text-ink" : "text-faint")}>{STATUS_LABEL[s]}</p>
            </li>
          ))}
        </ol>

        {d.feedback && d.status === "in_progress" && (
          <div role="alert" className="mt-5 rounded-md border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm">
            <p className="font-semibold text-bad">Changes requested</p>
            <p className="mt-1 text-ink">{d.feedback}</p>
          </div>
        )}

        {/* Facts */}
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Assigned to</dt>
            <dd className="mt-1">
              {isAdmin ? (
                <select
                  className={inputCls}
                  value={d.assignee_id || ""}
                  onChange={(e) => patchDeliverable(d.id, { assignee_id: e.target.value || null }, "Assignment updated")}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {d.assignee_id && <Avatar name={nameOf(d.assignee_id)} index={memberIndex(d.assignee_id)} size={22} />}
                  {nameOf(d.assignee_id)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Weight in {subject?.code}</dt>
            <dd className="mt-1">
              {isAdmin ? (
                <CommitInput
                  type="number"
                  value={String(d.weight)}
                  onCommit={(v) => patchDeliverable(d.id, { weight: Math.max(0, Math.min(100, Number(v) || 0)) })}
                />
              ) : (
                <span className="font-display text-2xl font-semibold">{d.weight}%</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Due</dt>
            <dd className="mt-1">
              {isAdmin ? (
                <input
                  type="date"
                  className={inputCls}
                  value={d.due_date || ""}
                  onChange={(e) => patchDeliverable(d.id, { due_date: e.target.value || null })}
                />
              ) : (
                <span>{due ? fmtDate(due) : "No date set"}</span>
              )}
              {isAdmin && !d.due_date && subject?.deadline && <span className="mt-1 block text-[11px] text-faint">Using the subject deadline, {fmtDate(subject.deadline)}.</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Time</dt>
            <dd className="mt-1.5">{d.status === "approved" ? <Chip tone="ok">Confirmed {d.approved_at ? fmtDate(d.approved_at) : ""}</Chip> : <Chip tone={dl.tone}>{dl.text}</Chip>}</dd>
          </div>
        </dl>

        {/* Work */}
        <section className="mt-6 space-y-3">
          <h3 className="font-display text-xl font-semibold tracking-wide">Work so far</h3>
          <Field label="What have you made?">
            <textarea
              rows={4}
              disabled={!canWork}
              value={work}
              onChange={(e) => { setWork(e.target.value); setDirty(true); }}
              placeholder="Modules built, circuits drawn, report sections written, slides finished…"
              className={inputCls}
            />
          </Field>
          <Field label="Link (Drive, GitHub, Overleaf)">
            <div className="flex gap-2">
              <input
                disabled={!canWork}
                value={proof}
                onChange={(e) => { setProof(e.target.value); setDirty(true); }}
                placeholder="https://"
                className={inputCls}
              />
              {proof.trim() && /^https?:\/\//i.test(proof.trim()) && (
                <a href={proof.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-line px-2.5 text-muted hover:text-ink" aria-label="Open link">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </Field>

          {/* Files */}
          <div>
            <span className="block text-xs font-medium text-muted mb-1">Files</span>
            {files.length > 0 && (
              <ul className="mb-2 divide-y divide-line rounded-md border border-line">
                {files.map((f) => {
                  const canDelete = isAdmin || (f.uploaded_by === profile.id && d.status !== "approved");
                  return (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Paperclip className="h-4 w-4 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{f.file_name}</p>
                        <p className="text-[11px] text-muted">{formatBytes(f.size_bytes)} by {nameOf(f.uploaded_by)}, {fmtDate(f.created_at)}</p>
                      </div>
                      <button type="button" onClick={() => openAttachment(f)} className="rounded p-1.5 text-muted hover:bg-line/40 hover:text-ink" aria-label={`Download ${f.file_name}`}>
                        <Download className="h-4 w-4" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={async () => (await askConfirm({ title: "Remove this file?", body: f.file_name, confirmLabel: "Remove", danger: true })) && deleteAttachment(f)}
                          className="rounded p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
                          aria-label={`Remove ${f.file_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canWork && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
                className={cx("rounded-md border border-dashed px-3 py-4 text-center text-sm", dragOver ? "border-info bg-info/10" : "border-line bg-surface2")}
              >
                <input ref={fileRef} type="file" multiple className="sr-only" id="task-files" onChange={(e) => onFiles(e.target.files)} />
                <label htmlFor="task-files" className="inline-flex cursor-pointer items-center gap-2 font-medium text-info hover:underline">
                  <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Choose files or drop them here"}
                </label>
                <p className="mt-1 text-[11px] text-muted">Up to 25 MB each. .circ, .pdf, .pptx, .docx, .zip all work.</p>
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <section className="mt-6 space-y-3 border-t border-line pt-5">
          {canWork && d.status !== "approved" && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveProgress} disabled={!dirty}>Save progress</Button>
              {d.status !== "pending" ? (
                <Button variant="primary" onClick={submit}><Check className="h-4 w-4" /> Submit for confirmation</Button>
              ) : (
                !isAdmin && (
                  <Button onClick={() => patchDeliverable(d.id, { status: "in_progress" }, "Submission withdrawn")}>
                    <Undo2 className="h-4 w-4" /> Withdraw submission
                  </Button>
                )
              )}
            </div>
          )}
          {!canWork && !isAdmin && (
            <p className="text-sm text-muted">
              {d.status === "approved" ? "This deliverable is confirmed and locked. Ask the group leader if it needs to reopen." : `Only ${nameOf(d.assignee_id)} can update this. You can follow its progress here.`}
            </p>
          )}
          {d.status === "pending" && isOwner && !isAdmin && <p className="text-sm text-muted">Submitted. Waiting for the group leader to confirm.</p>}

          {isAdmin && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {d.status !== "approved" && (
                  <Button variant="ok" onClick={approve}><Check className="h-4 w-4" /> Confirm as done (+{d.weight}%)</Button>
                )}
                {d.status === "pending" && !rejecting && <Button onClick={() => setRejecting(true)}>Request changes</Button>}
                {d.status === "approved" && <Button onClick={revoke}>Revoke confirmation</Button>}
                <Button variant="danger" onClick={remove} className="ml-auto"><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
              {rejecting && (
                <div className="rounded-md border border-line bg-surface2 p-3">
                  <Field label="What needs to change?">
                    <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="Be specific so it takes one revision, not three." autoFocus />
                  </Field>
                  <div className="mt-2 flex gap-2">
                    <Button variant="primary" size="sm" onClick={requestChanges}>Send back</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-6 border-t border-line pt-5">
            <h3 className="font-display text-xl font-semibold tracking-wide">History</h3>
            <ul className="mt-3 space-y-2.5">
              {history.map((h) => (
                <li key={h.id} className="flex gap-2.5 text-sm">
                  <Avatar name={nameOf(h.actor_id)} index={memberIndex(h.actor_id)} size={22} />
                  <div>
                    <p><strong className="font-medium">{nameOf(h.actor_id)}</strong> {h.message}</p>
                    <p className="text-[11px] text-faint">{fmtDateTime(h.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}
