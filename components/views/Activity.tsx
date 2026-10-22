import React, { useMemo, useState } from "react";
import { useApp } from "../../lib/store";
import { fmtDateTime } from "../../lib/calc";
import { Avatar, EmptyState, PageTitle, Panel, SubjectTag, cx, inputCls } from "../ui";

const DOT: Record<string, string> = { approved: "bg-ok", submitted: "bg-warn", rejected: "bg-bad", revoked: "bg-bad", assigned: "bg-info", created: "bg-info", progress: "bg-faint", deleted: "bg-bad", task: "bg-info" };

export function Activity() {
  const { activity, subjects, members, nameOf, memberIndex, subjectIndex, openTask, deliverables } = useApp();
  const [subjectId, setSubjectId] = useState("ALL");
  const [actorId, setActorId] = useState("ALL");

  const groups = useMemo(() => {
    const filtered = activity.filter((a) => (subjectId === "ALL" || a.subject_id === subjectId) && (actorId === "ALL" || a.actor_id === actorId));
    const map = new Map<string, typeof filtered>();
    filtered.forEach((a) => {
      const key = new Date(a.created_at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
      map.set(key, [...(map.get(key) || []), a]);
    });
    return Array.from(map.entries());
  }, [activity, subjectId, actorId]);

  return (
    <div>
      <PageTitle title="Activity" sub="Every submission, confirmation and change, recorded by the database so it cannot be edited after the fact." />
      <div className="mb-5 flex flex-wrap gap-2">
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cx(inputCls, "w-auto")} aria-label="Filter by subject">
          <option value="ALL">All subjects</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select value={actorId} onChange={(e) => setActorId(e.target.value)} className={cx(inputCls, "w-auto")} aria-label="Filter by person">
          <option value="ALL">Everyone</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No activity yet" body="Plans, submissions and confirmations will appear here as they happen." />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 font-display text-xl font-semibold tracking-wide">{day}</h2>
              <Panel className="divide-y divide-line">
                {items.map((a) => {
                  const s = subjects.find((x) => x.id === a.subject_id);
                  const canOpen = a.deliverable_id && deliverables.some((d) => d.id === a.deliverable_id);
                  const body = (
                    <>
                      <span className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", DOT[a.action] || "bg-faint")} />
                      <Avatar name={nameOf(a.actor_id)} index={memberIndex(a.actor_id)} size={26} />
                      <span className="min-w-0 flex-1 text-sm"><strong className="font-medium">{nameOf(a.actor_id)}</strong> {a.message}</span>
                      {s && <SubjectTag code={s.code} index={subjectIndex(s.id)} />}
                      <span className="w-28 text-right text-xs text-muted">{fmtDateTime(a.created_at)}</span>
                    </>
                  );
                  return canOpen ? (
                    <button key={a.id} type="button" onClick={() => openTask(a.deliverable_id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface2/70">{body}</button>
                  ) : (
                    <div key={a.id} className="flex items-start gap-3 px-4 py-3">{body}</div>
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
