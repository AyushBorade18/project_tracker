import React, { useState } from "react";
import { Check, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useApp } from "../../lib/store";
import { STANDARD_DELIVERABLES, Subject } from "../../lib/types";
import { Button, Chip, CommitInput, EmptyState, Field, PageTitle, Panel, SubjectTag, cx, inputCls } from "../ui";

function SubjectPlan({ subject }: { subject: Subject }) {
  const {
    deliverables, members, subjectIndex, saveSubject, deleteSubject, addDeliverable, patchDeliverable, deleteDeliverable,
    rebalance, bulkAssign, openTask, askConfirm, attachments, notify,
  } = useApp();
  const items = deliverables.filter((d) => d.subject_id === subject.id).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const sum = items.reduce((a, d) => a + (d.weight || 0), 0);
  const [custom, setCustom] = useState("");

  const toggleStandard = async (type: string, title: string) => {
    const existing = items.find((d) => d.type === type);
    if (!existing) return void addDeliverable(subject.id, type, `${subject.code} ${title}`);
    const hasWork = existing.status !== "todo" || existing.work_made || attachments.some((a) => a.deliverable_id === existing.id);
    if (hasWork && !(await askConfirm({ title: `Remove ${type} from ${subject.code}?`, body: "It already has progress. Its work, files and status will be deleted.", confirmLabel: "Remove", danger: true }))) return;
    deleteDeliverable(existing.id);
  };

  const addCustom = async () => {
    if (!custom.trim()) return notify("Type a name for the deliverable first.", "bad");
    if (await addDeliverable(subject.id, "Custom", custom)) setCustom("");
  };

  return (
    <Panel className="overflow-hidden">
      <div className="space-y-4 border-b border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <SubjectTag code={subject.code} index={subjectIndex(subject.id)} />
            <CommitInput value={subject.name} onCommit={(v) => v.trim() && saveSubject(subject.id, { name: v.trim() })} className="font-display text-xl font-semibold tracking-wide" />
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={async () => (await askConfirm({ title: `Delete ${subject.code}?`, body: "All of its deliverables, files and history go with it. This cannot be undone.", confirmLabel: "Delete subject", danger: true })) && deleteSubject(subject.id)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete subject
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6"><Field label="Project topic"><CommitInput value={subject.topic} onCommit={(v) => saveSubject(subject.id, { topic: v.trim() })} placeholder={`What is ${subject.code} building?`} /></Field></div>
          <div className="sm:col-span-3"><Field label="Deadline"><input type="date" className={inputCls} value={subject.deadline || ""} onChange={(e) => saveSubject(subject.id, { deadline: e.target.value || null })} /></Field></div>
          <div className="sm:col-span-3">
            <Field label="Project lead">
              <select className={inputCls} value={subject.lead_id || ""} onChange={(e) => saveSubject(subject.id, { lead_id: e.target.value || null })}>
                <option value="">No lead</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">What {subject.code} requires</p>
          <div className="flex flex-wrap gap-1.5">
            {STANDARD_DELIVERABLES.map((t) => {
              const on = items.some((d) => d.type === t.type);
              return (
                <button
                  key={t.type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStandard(t.type, t.defaultTitle)}
                  className={cx("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition", on ? "border-ok bg-ok text-white" : "border-line bg-surface2 text-muted hover:text-ink")}
                >
                  {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {t.type}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} placeholder="Or add your own, such as Synopsis or Microprocessor lab" className={inputCls} aria-label="Custom deliverable name" />
            <Button onClick={addCustom}>Add</Button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="p-5 text-center text-sm text-muted">Switch on at least one deliverable above to start tracking {subject.code}.</p>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-surface2 px-4 py-2">
            <div className="flex items-center gap-2">
              <Chip tone={sum === 100 ? "ok" : "bad"}>Weights total {sum}%</Chip>
              {sum !== 100 && <span className="text-xs text-muted">They should add up to 100%. Percentages are scaled until you fix this.</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => rebalance(subject.id)}>Split evenly to 100%</Button>
              <select
                value=""
                onChange={(e) => e.target.value && bulkAssign(subject.id, e.target.value === "NONE" ? null : e.target.value)}
                className={cx(inputCls, "w-auto py-1 text-xs")}
                aria-label={`Assign every ${subject.code} deliverable`}
              >
                <option value="">Assign all to…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                <option value="NONE">Nobody</option>
              </select>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {items.map((d) => (
              <li key={d.id} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-12">
                <div className="sm:col-span-1"><Chip>{d.type}</Chip></div>
                <div className="sm:col-span-4"><CommitInput value={d.title} onCommit={(v) => v.trim() && patchDeliverable(d.id, { title: v.trim() })} aria-label="Title" /></div>
                <div className="flex items-center gap-1 sm:col-span-1">
                  <CommitInput type="number" value={String(d.weight)} onCommit={(v) => patchDeliverable(d.id, { weight: Math.max(0, Math.min(100, Number(v) || 0)) })} className="text-right" />
                  <span className="text-xs text-muted">%</span>
                </div>
                <div className="sm:col-span-3">
                  <select className={inputCls} value={d.assignee_id || ""} onChange={(e) => patchDeliverable(d.id, { assignee_id: e.target.value || null })} aria-label="Assignee">
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2"><input type="date" className={inputCls} value={d.due_date || ""} onChange={(e) => patchDeliverable(d.id, { due_date: e.target.value || null })} aria-label="Due date" title="Leave empty to use the subject deadline" /></div>
                <div className="flex justify-end gap-1 sm:col-span-1">
                  <button type="button" onClick={() => openTask(d.id)} className="rounded p-1.5 text-muted hover:bg-line/40 hover:text-ink" aria-label="Open details"><ExternalLink className="h-4 w-4" /></button>
                  <button
                    type="button"
                    className="rounded p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
                    aria-label={`Delete ${d.title}`}
                    onClick={async () => (await askConfirm({ title: `Delete "${d.title}"?`, body: "Other weights are re-split evenly.", confirmLabel: "Delete", danger: true })) && deleteDeliverable(d.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export function Plan() {
  const { subjects, addSubject, notify } = useApp();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return notify("Enter a short code and a name.", "bad");
    if (await addSubject(code, name)) { setCode(""); setName(""); }
  };

  return (
    <div>
      <PageTitle title="Plan" sub="Decide what each subject requires, who owns each part, how much it is worth and when it is due. Changes save as you go and appear for everyone." />
      <div className="space-y-5">
        {subjects.length === 0 && <EmptyState title="No subjects yet" body="Add the first one below." />}
        {subjects.map((s) => <SubjectPlan key={s.id} subject={s} />)}
        <Panel className="p-4">
          <form onSubmit={add} className="flex flex-wrap items-end gap-3">
            <div className="w-28"><Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} placeholder="CN" /></Field></div>
            <div className="min-w-[14rem] flex-1"><Field label="New subject name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Networks" /></Field></div>
            <Button type="submit" variant="primary"><Plus className="h-4 w-4" /> Add subject</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
