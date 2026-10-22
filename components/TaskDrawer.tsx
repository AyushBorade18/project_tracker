import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, ExternalLink, Github, Globe, Paperclip, Trash2, Undo2, Upload } from "lucide-react";
import { useApp } from "../lib/store";
import { daysUntil, deadlineLabel, effectiveDue, fmtDate, fmtDateTime, formatBytes } from "../lib/calc";
import { Status, STATUS_LABEL, isHttpUrl, submissionKind } from "../lib/types";
import { Avatar, Button, Chip, CommitInput, Drawer, Field, StatusBadge, SubjectTag, cx, inputCls } from "./ui";

const STEPS: Status[] = ["todo", "in_progress", "pending", "approved"];

export function TaskDrawer() {
  const {
    openTaskId, openTask, deliverables, subjects, attachments, activity, members, profile, isAdmin, readOnly, nameOf, memberIndex, subjectIndex,
    patchDeliverable, deleteDeliverable, uploadAttachment, deleteAttachment, openAttachment, askConfirm, notify,
  } = useApp();

  const d = deliverables.find((x) => x.id === openTaskId) || null;
  const subject = d ? subjects.find((s) => s.id === d.subject_id) : undefined;
  const files = useMemo(() => attachments.filter((a) => a.deliverable_id === d?.id), [attachments, d?.id]);
  const history = useMemo(() => activity.filter((a) => a.deliverable_id === d?.id).slice(0, 8), [activity, d?.id]);

  const [work, setWork] = useState("");
  const [live, setLive] = useState("");
  const [repo, setRepo] = useState("");
  const [proof, setProof] = useState("");
  const [dirty, setDirty] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setWork(d?.work_made || "");
    setLive(d?.live_url || "");
    setRepo(d?.repo_url || "");
    setProof(d?.proof_url || "");
  };

  useEffect(() => {
    setDirty(false);
    load();
    setRejecting(false);
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id]);

  useEffect(() => {
    if (!dirty && d) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.work_made, d?.live_url, d?.repo_url, d?.proof_url]);

  const close = () => openTask(null);
  if (!d || !profile) return <Drawer open={false} onClose={close} label="Task details">{null}</Drawer>;

  const kind = submissionKind(d.type);
  const isOwner = d.assignee_id === profile.id;
  // Members edit their own unapproved work; the leader can edit anything in the current semester. Archived semesters are read-only.
  const canWork = !readOnly && (isAdmin || (isOwner && d.status !== "approved"));
  const editable = canWork && d.status !== "pending";
  const due = effectiveDue(d, subject);
  const dl = deadlineLabel(d.status === "approved" ? null : daysUntil(due));
  const stepIndex = STEPS.indexOf(d.status);

  const bad = (v: string) => v.trim() !== "" && !isHttpUrl(v);
  const checkUrls = (): string | null => {
    if (bad(live)) return "The deployed link must start with http:// or https://";
    if (bad(repo)) return "The GitHub link must start with http:// or https://";
    if (bad(proof)) return "The link must start with http:// or https://";
    return null;
  };

  const savePatch = () => ({ work_made: work.trim(), live_url: live.trim(), repo_url: repo.trim(), proof_url: proof.trim() });

  const saveProgress = async () => {
    const err = checkUrls();
    if (err) return notify(err, "bad");
    if (await patchDeliverable(d.id, savePatch(), "Progress saved")) setDirty(false);
  };

  const submit = async () => {
    const err = checkUrls();
    if (err) return notify(err, "bad");
    if (kind === "link" && !live.trim() && !repo.trim()) return notify("Add the deployed link or the GitHub repository before submitting.", "bad");
    if (kind === "file" && files.length === 0) return notify("Upload the file before submitting.", "bad");
    if (kind === "any" && files.length === 0 && !proof.trim()) return notify("Add a link or upload a file before submitting.", "bad");
    const ok = await patchDeliverable(d.id, { ...savePatch(), status: "pending" }, "Submitted for review. The group leader will check it.");
    if (ok) setDirty(false);
  };

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    for (const f of Array.from(list)) await uploadAttachment(d.id, f);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const approve = () => patchDeliverable(d.id, { status: "approved" }, "Confirmed. The percentage is unlocked.");
  const requestChanges = async () => {
    if (!reason.trim()) return notify("Tell them what to change so they know what to fix.", "bad");
    const ok = await patchDeliverable(d.id, { status: "in_progress", feedback: reason.trim() }, "Sent back for changes");
    if (ok) {
      setRejecting(false);
      setReason("");
    }
  };
  const revoke = async () => {
    if (await askConfirm({ title: "Revoke confirmation?", body: "It goes back to In progress and its percentage is removed from the subject. It must be submitted and confirmed again.", confirmLabel: "Revoke", danger: true }))
      patchDeliverable(d.id, { status: "in_progress" }, "Confirmation revoked");
  };
  const remove = async () => {
    if (await askConfirm({ title: `Delete "${d.title}"?`, body: "Its files are removed. Other weights are re-split evenly.", confirmLabel: "Delete", danger: true }))
      deleteDeliverable(d.id);
  };

  const linkField = (label: string, value: string, set: (v: string) => void, placeholder: string, icon: React.ReactNode) => (
    <Field label={label}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-2.5 text-faint">{icon}</span>
          <input
            disabled={!editable}
            value={value}
            onChange={(e) => { set(e.target.value); setDirty(true); }}
            placeholder={placeholder}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            className={cx(inputCls, "pl-9", bad(value) && "border-bad")}
          />
        </div>
        {value.trim() && isHttpUrl(value) && (
          <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-line px-2.5 text-muted hover:text-ink" aria-label={`Open ${label}`}>
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      {bad(value) && <span className="mt-1 block text-[11px] text-bad">Start with http:// or https://</span>}
    </Field>
  );

  return (
    <Drawer open onClose={close} label={`Task: ${d.title}`}>
      <div className="p-5 pr-12 sm:p-6 sm:pr-12">
        <div className="flex flex-wrap items-center gap-2">
          {subject && <SubjectTag code={subject.code} index={subjectIndex(subject.id)} />}
          <Chip>{d.type}</Chip>
          <StatusBadge status={d.status} />
        </div>
        {isAdmin ? (
          <CommitInput value={d.title} onCommit={(v) => v.trim() && patchDeliverable(d.id, { title: v.trim() })} className="mt-3 font-display text-2xl font-semibold tracking-wide" />
        ) : (
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-wide">{d.title}</h2>
        )}
        {subject?.topic && <p className="mt-1 text-sm text-muted">{subject.name}: {subject.topic}</p>}

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

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Assigned to</dt>
            <dd className="mt-1">
              {isAdmin ? (
                <select className={inputCls} value={d.assignee_id || ""} onChange={(e) => patchDeliverable(d.id, { assignee_id: e.target.value || null }, "Assignment updated")}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
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
                <CommitInput type="number" value={String(d.weight)} onCommit={(v) => patchDeliverable(d.id, { weight: Math.max(0, Math.min(100, Number(v) || 0)) })} />
              ) : (
                <span className="font-display text-2xl font-semibold">{d.weight}%</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Due</dt>
            <dd className="mt-1">
              {isAdmin ? (
                <input type="date" className={inputCls} value={d.due_date || ""} onChange={(e) => patchDeliverable(d.id, { due_date: e.target.value || null })} />
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

        {/* What to hand in depends on the type */}
        <section className="mt-6 space-y-3">
          <h3 className="font-display text-xl font-semibold tracking-wide">Your submission</h3>
          <p className="rounded-md bg-surface2 px-3 py-2 text-xs text-muted">
            {kind === "link" && "For this type, share the deployed app link, the GitHub repository, or both. At least one is needed to submit."}
            {kind === "file" && "For this type, upload the file. That is what the group leader reviews."}
            {kind === "any" && "Share a link, upload a file, or both. At least one is needed to submit."}
          </p>

          {kind === "link" && (
            <>
              {linkField("Deployed app link", live, setLive, "https://your-app.vercel.app", <Globe className="h-4 w-4" />)}
              {linkField("GitHub repository", repo, setRepo, "https://github.com/you/project", <Github className="h-4 w-4" />)}
            </>
          )}
          {kind === "any" && linkField("Link (Drive, GitHub, Overleaf)", proof, setProof, "https://", <ExternalLink className="h-4 w-4" />)}

          {kind !== "link" && (
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">{kind === "file" ? "File" : "Files"}</span>
              {files.length > 0 && (
                <ul className="mb-2 divide-y divide-line rounded-md border border-line">
                  {files.map((f) => {
                    const canDelete = !readOnly && d.status !== "pending" && (isAdmin || (f.uploaded_by === profile.id && d.status !== "approved"));
                    return (
                      <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <Paperclip className="h-4 w-4 shrink-0 text-faint" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{f.file_name}</p>
                          <p className="text-[11px] text-muted">{formatBytes(f.size_bytes)} by {nameOf(f.uploaded_by)}, {fmtDate(f.created_at)}</p>
                        </div>
                        <button type="button" onClick={() => openAttachment(f)} className="rounded p-2 text-muted hover:bg-line/40 hover:text-ink" aria-label={`Download ${f.file_name}`}><Download className="h-4 w-4" /></button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={async () => (await askConfirm({ title: "Remove this file?", body: f.file_name, confirmLabel: "Remove", danger: true })) && deleteAttachment(f)}
                            className="rounded p-2 text-muted hover:bg-bad/10 hover:text-bad"
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
              {editable && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
                  className={cx("rounded-md border border-dashed px-3 py-4 text-center text-sm", dragOver ? "border-info bg-info/10" : "border-line bg-surface2")}
                >
                  <input ref={fileRef} type="file" multiple={kind !== "file"} className="sr-only" id="task-files" onChange={(e) => onFiles(e.target.files)} />
                  <label htmlFor="task-files" className="inline-flex cursor-pointer items-center gap-2 py-1 font-medium text-info hover:underline">
                    <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Choose a file"}
                  </label>
                  <p className="mt-1 text-[11px] text-muted">Up to 25 MB each. .circ, .pdf, .pptx, .docx and .zip all work.</p>
                </div>
              )}
              {!editable && files.length === 0 && <p className="text-sm text-muted">No file uploaded yet.</p>}
            </div>
          )}

          <Field label={kind === "file" ? "Notes for the reviewer (optional)" : "What have you made?"}>
            <textarea
              rows={3}
              disabled={!editable}
              value={work}
              onChange={(e) => { setWork(e.target.value); setDirty(true); }}
              placeholder={kind === "file" ? "Anything the reviewer should know…" : "Modules built, pages finished, what still needs doing…"}
              className={inputCls}
            />
          </Field>
        </section>

        <section className="mt-6 space-y-3 border-t border-line pt-5">
          {canWork && d.status !== "approved" && d.status !== "pending" && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveProgress} disabled={!dirty}>Save progress</Button>
              <Button variant="primary" onClick={submit}><Check className="h-4 w-4" /> Submit for review</Button>
            </div>
          )}
          {canWork && d.status === "pending" && isOwner && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Submitted. Waiting for the group leader to review it. Withdraw it if you need to change something.</p>
              <Button onClick={() => patchDeliverable(d.id, { status: "in_progress" }, "Submission withdrawn")}><Undo2 className="h-4 w-4" /> Withdraw submission</Button>
            </div>
          )}
          {readOnly && <p className="text-sm text-muted">This belongs to an archived semester, so it is read-only.</p>}
          {!readOnly && !canWork && !isAdmin && (
            <p className="text-sm text-muted">
              {d.status === "approved" ? "This deliverable is confirmed and locked. Ask the group leader if it needs to reopen." : `Only ${nameOf(d.assignee_id)} can update this. You can follow its progress here.`}
            </p>
          )}

          {isAdmin && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {d.status === "pending" && !rejecting && (
                  <>
                    <Button variant="ok" onClick={approve}><Check className="h-4 w-4" /> Confirm (+{d.weight}%)</Button>
                    <Button onClick={() => setRejecting(true)}>Request changes</Button>
                  </>
                )}
                {d.status === "approved" && <Button onClick={revoke}>Revoke confirmation</Button>}
                <Button variant="danger" onClick={remove} className="ml-auto"><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
              {d.status !== "pending" && d.status !== "approved" && <p className="text-xs text-muted">Work is confirmed after it is submitted for review, so nothing counts until it has been checked.</p>}
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
