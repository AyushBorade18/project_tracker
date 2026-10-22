import React, { useMemo } from "react";
import { useApp } from "../../lib/store";
import { burnUp, deadlineLabel, fmtDate, memberStats, overallStats } from "../../lib/calc";
import { Chip, PageTitle, Panel, PanelHeader, SubjectTag } from "../ui";
import { BurnUpChart, ContributionDonut, MemberLoadChart, StatusDonut, SubjectProgressChart, TypeMixChart } from "../charts";

export function Analytics() {
  const { subjects, deliverables, members, subjectIndex } = useApp();
  const overall = useMemo(() => overallStats(subjects, deliverables), [subjects, deliverables]);
  const mStats = useMemo(() => memberStats(members, subjects, deliverables), [members, subjects, deliverables]);
  const series = useMemo(() => burnUp(subjects, deliverables), [subjects, deliverables]);
  const upcoming = overall.subjectStats.filter((s) => s.subject.deadline).sort((a, b) => (a.subject.deadline as string).localeCompare(b.subject.deadline as string));

  return (
    <div>
      <PageTitle title="Analytics" sub="Where the team stands, who is carrying what, and whether the pace will hit the deadlines." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Progress by subject" hint="Share of each subject's weight by stage." />
          <div className="px-2 pb-3"><SubjectProgressChart stats={overall.subjectStats} /></div>
        </Panel>
        <Panel>
          <PanelHeader title="Stage of every deliverable" />
          <div className="px-4 pb-4"><StatusDonut deliverables={deliverables} /></div>
        </Panel>

        <Panel className="lg:col-span-3">
          <PanelHeader title="Confirmed over time" hint="Built from the day each deliverable was confirmed, against a straight path to the last deadline." />
          <div className="px-2 pb-3"><BurnUpChart points={series} /></div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Workload by member" hint="Assigned deliverables and where each one is." />
          <div className="px-2 pb-3">
            {mStats.length ? <MemberLoadChart stats={mStats} /> : <p className="px-2 pb-4 text-sm text-muted">No active members yet.</p>}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Who has delivered" hint="Share of confirmed points." />
          <div className="px-4 pb-4"><ContributionDonut stats={mStats} memberIds={members.map((m) => m.id)} /></div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Deadline horizon" hint="Subjects by due date, with how far along they should be." />
          {upcoming.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-muted">Set deadlines in Plan to see them here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((s) => {
                const dl = deadlineLabel(s.days);
                return (
                  <li key={s.subject.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <SubjectTag code={s.subject.code} index={subjectIndex(s.subject.id)} />
                    <span className="min-w-0 flex-1 truncate">{s.subject.name}</span>
                    <span className="text-xs text-muted">{fmtDate(s.subject.deadline)}</span>
                    <Chip tone={s.pace === "done" ? "ok" : dl.tone}>{s.pace === "done" ? "Finished" : dl.text}</Chip>
                    <span className="w-24 text-right text-xs text-muted">
                      {Math.round(s.confirmedPct)}%{s.expectedPct !== null && s.pace !== "done" ? ` of ${Math.round(s.expectedPct)}% due` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Deliverable mix" hint="How many of each type are planned." />
          <div className="px-2 pb-3"><TypeMixChart deliverables={deliverables} /></div>
        </Panel>
      </div>
    </div>
  );
}
