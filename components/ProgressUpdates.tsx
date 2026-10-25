import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, Github, Paperclip, Trash2, X } from "lucide-react";
import { useApp } from "../lib/store";
import { effectiveDue, formatBytes, isOverdue, relTime } from "../lib/calc";
import { MOOD_LABEL, ProgressMood, isHttpUrl } from "../lib/types";
import { Avatar, Button, Chip, Field, SubjectTag, cx, inputCls } from "./ui";

const MOODS: { id: ProgressMood; hint: string; tone: "ok" | "info" | "warn" | "bad" }[] = [
  { id: "on_track", hint: "Going as planned", tone: "ok" },
  { id: "almost_done", hint: "Nearly ready to submit", tone: "info" },
  { id: "need_help", hint: "I would like a hand", tone: "warn" },
  { id: "blocked", hint: "I cannot continue", tone: "bad" },
];

export function MoodChip({ mood }: { mood: ProgressMood }) {
  const tone = MOODS.find((m) => m.id === mood)?.tone || "muted";
  return <Chip tone={tone}>{MOOD_LABEL[mood]}</Chip>;
}

/**
 * Write a status update on one of your assigned deliverables: how it is going, what you did,
 * and optionally a GitHub link, another link and files. Your group leader is notified.
 */
export function UpdateComposer({ deliverableId, onDone, onCancel }: { deliverableId?: string; onDone?: () => void; onCancel?: () => void }) {
  const { deliverables, subjects, profile, readOnly, addUpdate, progressUpdates, notify, subjectIndex } = useApp();

  const options = useMemo(
    () =>
      deliverables.filter((d) => {
        if (d.assignee_id !== profile?.id || d.status === "approved") return false;
        if (isOverdue(d, subjects.find((s) => s.id === d.subject_id))) return false;
        return true;
      }),
    [deliverables, subjects, profile]
  );

  const [pick, setPick] = useState<string>(deliverableId || "");
  const [mood, setMood] = useState<ProgressMood>("on_track");
  const [percent, setPercent] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [github, setGithub] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (deliverableId) setPick(deliverableId);
    else if (!pick && options.length === 1) setPick(options[0].id);
  }, [deliverableId, options, pick]);

  // start the slider from the last estimate for this deliverable
  const lastPercent = useMemo(() => progressUpdates.find((u) => u.deliverable_id === pick && u.percent !== null)?.percent ?? 0, [progressUpdates, pick]);

  const chosen = deliverables.find((d) => d.id === pick);
  const chosenSubject = chosen ? subjects.find((s) => s.id === chosen.subject_id) : undefined;

  const bad = (v: string) => v.trim() !== "" && !isHttpUrl(v);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pick) return notify("Choose which project this update is about.", "bad");
    if (!body.trim()) return notify("Write a few lines about where things stand.", "bad");
    if (bad(github) || bad(link)) return notify("Links must start with http:// or https://", "bad");
    setBusy(true);
    const ok = await addUpdate({ deliverable_id: pick, mood, percent, body, github_url: github, link_url: link }, files);
    setBusy(false);
    if (ok) {
      setBody(""); setGithub(""); setLink(""); setFiles([]); setPercent(null); setMood("on_track");
      if (fileRef.current) fileRef.current.value = "";
      onDone?.();
    }
  };

  if (readOnly) return <p className="text-sm text-muted">This semester is archived, so updates are closed.</p>;
  if (!deliverableId && options.length === 0)
    return <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-muted">Nothing to update right now. Updates are for work assigned to you that is not approved and not past its deadline.</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {!deliverableId && (
        <Field label="Which project is this about?">
          <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Project">
            <option value="">Choose one of your assigned projects…</option>
            {options.map((d) => {
              const s = subjects.find((x) => x.id === d.subject_id);
              return <option key={d.id} value={d.id}>{s?.code}: {d.title}</option>;
            })}
          </select>
        </Field>
      )}
      {deliverableId && chosen && (
        <p className="flex items-center gap-2 text-sm">
          {chosenSubject && <SubjectTag code={chosenSubject.code} index={subjectIndex(chosenSubject.id)} />}
          <span className="font-medium">{chosen.title}</span>
          {effectiveDue(chosen, chosenSubject) && <span className="text-xs text-muted">due {effectiveDue(chosen, chosenSubject)}</span>}
        </p>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">How is it going?</span>
        <div role="radiogroup" aria-label="Status" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mood === m.id}
              onClick={() => setMood(m.id)}
              className={cx(
                "rounded-md border px-2.5 py-2 text-left transition",
                mood === m.id ? "border-ink bg-ink text-canvas" : "border-line bg-surface hover:border-faint"
              )}
            >
              <span className="block text-sm font-semibold leading-tight">{MOOD_LABEL[m.id]}</span>
              <span className={cx("block text-[11px] leading-tight", mood === m.id ? "text-canvas/70" : "text-muted")}>{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
          <label htmlFor="update-percent">About how much is done?</label>
          <span className="tabular-nums text-ink">{percent === null ? "skip" : `${percent}%`}</span>
        </div>
        <input
          id="update-percent"
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent ?? lastPercent}
          onChange={(e) => setPercent(Number(e.target.value))}
          className="w-full accent-[rgb(var(--ok))]"
          aria-label="Percent done"
        />
        {percent !== null && <button type="button" onClick={() => setPercent(null)} className="text-[11px] text-info hover:underline">Don't include an estimate</button>}
      </div>

      <Field label="What have you done so far?" hint="What works, what is next, and anything you are unsure about.">
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} className={inputCls} placeholder="Login and dashboard pages are done. Working on the database queries next." />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="GitHub link (optional)">
          <div className="relative">
            <Github className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
            <input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/you/project" inputMode="url" autoCapitalize="none" className={cx(inputCls, "pl-9", bad(github) && "border-bad")} />
          </div>
        </Field>
        <Field label="Another link (optional)">
          <div className="relative">
            <ExternalLink className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Drive, Figma, demo…" inputMode="url" autoCapitalize="none" className={cx(inputCls, "pl-9", bad(link) && "border-bad")} />
          </div>
        </Field>
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Files (optional)</span>
        {files.length > 0 && (
          <ul className="mb-2 divide-y divide-line rounded-md border border-line">
            {files.map((f, i) => (
              <li key={f.name + i} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:text-bad" aria-label={`Remove ${f.name}`}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileRef} id="update-files" type="file" multiple className="sr-only" onChange={(e) => {
          // copy the files first: the browser empties the live FileList as soon as the input is reset
          const picked = Array.from(e.target.files || []);
          setFiles((x) => [...x, ...picked]);
          if (fileRef.current) fileRef.current.value = "";
        }} />
        <label htmlFor="update-files" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line bg-surface2 px-3 py-2 text-sm font-medium text-info hover:underline">
          <Paperclip className="h-4 w-4" /> Add screenshots, a draft or a build
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Posting…" : "Post update"}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

/** The timeline of updates on one deliverable, newest first. */
export function UpdateList({ deliverableId, limit }: { deliverableId: string; limit?: number }) {
  const { progressUpdates, attachments, nameOf, memberIndex, profile, isLeader, readOnly, deleteUpdate, openAttachment, askConfirm } = useApp();
  const items = progressUpdates.filter((u) => u.deliverable_id === deliverableId).slice(0, limit);
  if (items.length === 0) return <p className="text-sm text-muted">No updates yet.</p>;
  return (
    <ol className="space-y-3">
      {items.map((u) => {
        const files = attachments.filter((a) => a.update_id === u.id);
        const canDelete = !readOnly && (u.author_id === profile?.id || isLeader);
        return (
          <li key={u.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Avatar name={nameOf(u.author_id)} index={memberIndex(u.author_id)} size={22} />
              <span className="text-sm font-medium">{nameOf(u.author_id)}</span>
              <MoodChip mood={u.mood} />
              {u.percent !== null && <Chip>{u.percent}% done</Chip>}
              <span className="ml-auto text-[11px] text-faint">{relTime(u.created_at)}</span>
              {canDelete && (
                <button
                  type="button"
                  onClick={async () => (await askConfirm({ title: "Delete this update?", body: "Its files are removed too.", confirmLabel: "Delete", danger: true })) && deleteUpdate(u.id)}
                  className="rounded p-1 text-muted hover:bg-bad/10 hover:text-bad"
                  aria-label="Delete update"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {u.percent !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/60" aria-hidden="true">
                <div className="h-full rounded-full bg-ok" style={{ width: `${u.percent}%` }} />
              </div>
            )}
            <p className="mt-2 whitespace-pre-wrap text-sm">{u.body}</p>
            {(u.github_url || u.link_url || files.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {u.github_url && isHttpUrl(u.github_url) && (
                  <a href={u.github_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface2 px-2 py-1 text-xs hover:text-info"><Github className="h-3.5 w-3.5" /> GitHub</a>
                )}
                {u.link_url && isHttpUrl(u.link_url) && (
                  <a href={u.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface2 px-2 py-1 text-xs hover:text-info"><ExternalLink className="h-3.5 w-3.5" /> Link</a>
                )}
                {files.map((f) => (
                  <button key={f.id} type="button" onClick={() => openAttachment(f)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface2 px-2 py-1 text-xs hover:text-info">
                    <Download className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{f.file_name}</span>
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Modal wrapper so the composer can be opened from My work. */
export function UpdateDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered into <body> so no page wrapper can ever clip or offset it
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Post a progress update">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-ink/50" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-lift sm:rounded-2xl sm:p-6" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-wide">Post a progress update</h2>
            <p className="text-sm text-muted">Tell your group leader where a project stands. It is saved with a time so there is a record.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-line/40" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <UpdateComposer onDone={onClose} onCancel={onClose} />
      </div>
    </div>,
    document.body
  );
}
