import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "../../lib/store";
import { daysUntil, deadlineLabel, effectiveDue, fmtDate } from "../../lib/calc";
import { Deliverable, Status, STATUS_LABEL } from "../../lib/types";
import { STATUS_COLOR } from "../../lib/theme";
import { Avatar, Chip, EmptyState, PageTitle, SubjectTag, cx, inputCls } from "../ui";

const COLUMNS: Status[] = ["todo", "in_progress", "pending", "approved"];

export function TaskCard({ d }: { d: Deliverable }) {
  const { subjects, openTask, nameOf, memberIndex, subjectIndex, attachments } = useApp();
  const subject = subjects.find((s) => s.id === d.subject_id);
  const due = effectiveDue(d, subject);
  const dl = deadlineLabel(d.status === "approved" ? null : daysUntil(due));
  const files = attachments.filter((a) => a.deliverable_id === d.id).length;
  return (
    <button
      type="button"
      onClick={() => openTask(d.id)}
      className="w-full rounded-md border border-line bg-surface p-3 text-left shadow-sm transition hover:border-info/60 hover:shadow-lift"
    >
      <div className="flex items-center justify-between gap-2">
        {subject && <SubjectTag code={subject.code} index={subjectIndex(subject.id)} />}
        <span className="font-display text-lg font-semibold text-muted">{d.weight}%</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug">{d.title}</p>
      {d.feedback && d.status === "in_progress" && <p className="mt-1.5 text-xs font-medium text-bad">Changes requested</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <Avatar name={nameOf(d.assignee_id)} index={memberIndex(d.assignee_id)} size={20} />
          <span className="truncate">{d.assignee_id ? nameOf(d.assignee_id).split(" ")[0] : "Unassigned"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {files > 0 && <span className="text-[11px] text-muted">{files} file{files > 1 ? "s" : ""}</span>}
          {d.status !== "approved" && due && <Chip tone={dl.tone}>{fmtDate(due)}</Chip>}
        </span>
      </div>
    </button>
  );
}

export function Board() {
  const { subjects, deliverables, members, profile, nameOf, isAdmin } = useApp();
  const [subjectId, setSubjectId] = useState("ALL");
  const [memberId, setMemberId] = useState("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deliverables.filter((d) => {
      if (subjectId !== "ALL" && d.subject_id !== subjectId) return false;
      if (memberId === "UNASSIGNED" && d.assignee_id) return false;
      if (memberId !== "ALL" && memberId !== "UNASSIGNED" && d.assignee_id !== memberId) return false;
      if (q && !`${d.title} ${d.type} ${nameOf(d.assignee_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [deliverables, subjectId, memberId, query, nameOf]);

  return (
    <div>
      <PageTitle title="Board" sub="Every deliverable by stage. Open a card to see the work, files and history." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deliverables" aria-label="Search deliverables" className={cx(inputCls, "w-56 pl-9")} />
        </div>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cx(inputCls, "w-auto")} aria-label="Filter by subject">
          <option value="ALL">All subjects</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={cx(inputCls, "w-auto")} aria-label="Filter by member">
          <option value="ALL">Everyone</option>
          {profile && <option value={profile.id}>Only mine</option>}
          <option value="UNASSIGNED">Unassigned</option>
          {members.filter((m) => m.id !== profile?.id).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>

      {deliverables.length === 0 ? (
        <EmptyState title="No deliverables planned yet" body={isAdmin ? "Open Plan and switch on what each subject requires." : "The group leader has not planned any deliverables yet."} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((st) => {
            const col = filtered.filter((d) => d.status === st);
            return (
              <section key={st} aria-label={STATUS_LABEL[st]} className="rounded-lg bg-surface2 p-2.5">
                <header className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-wide">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[st] }} />
                    {STATUS_LABEL[st]}
                  </h2>
                  <span className="text-xs font-medium text-muted">{col.length}</span>
                </header>
                <div className="space-y-2">
                  {col.length === 0 ? <p className="px-1.5 py-4 text-center text-xs text-faint">Nothing here</p> : col.map((d) => <TaskCard key={d.id} d={d} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
