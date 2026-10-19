import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BurnPoint, MemberStat, SubjectStat } from "../lib/calc";
import { Deliverable } from "../lib/types";
import { MEMBER_COLORS, STATUS_COLOR, SUBJECT_COLORS } from "../lib/theme";
import { useApp } from "../lib/store";

function useChartColors() {
  const { theme } = useApp();
  return theme === "dark"
    ? { text: "#A0ACC7", grid: "#2A3656", ink: "#E8EDF7" }
    : { text: "#4A5672", grid: "#D5DBE7", ink: "#101B38" };
}

const tooltipStyle: React.CSSProperties = {
  background: "rgb(var(--surface))",
  border: "1px solid rgb(var(--line))",
  borderRadius: 8,
  color: "rgb(var(--ink))",
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgba(0,0,0,.35)",
};

const pctFmt = (v: unknown) => `${Math.round(Number(v) * 10) / 10}%`;

// ---------------------------------------------------------------------------

export function SubjectProgressChart({ stats }: { stats: SubjectStat[] }) {
  const c = useChartColors();
  const data = stats.map((s) => ({
    code: s.subject.code,
    Confirmed: round1(s.confirmedPct),
    "Awaiting confirmation": round1(s.pendingPct),
    "In progress": round1(s.inProgressPct),
    "Not started": s.configured ? round1(s.todoPct) : 0,
  }));
  return (
    <div role="img" aria-label="Stacked bar chart of progress by subject">
      <ResponsiveContainer width="100%" height={Math.max(220, stats.length * 46 + 50)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 0 }} barSize={20}>
          <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: c.text, fontSize: 11 }} stroke={c.grid} />
          <YAxis type="category" dataKey="code" width={52} tick={{ fill: c.ink, fontSize: 13, fontWeight: 600 }} stroke={c.grid} />
          <Tooltip contentStyle={tooltipStyle} formatter={pctFmt} cursor={{ fill: "rgba(120,130,160,.12)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: c.text }} />
          <Bar dataKey="Confirmed" stackId="a" fill={STATUS_COLOR.approved} />
          <Bar dataKey="Awaiting confirmation" stackId="a" fill={STATUS_COLOR.pending} />
          <Bar dataKey="In progress" stackId="a" fill={STATUS_COLOR.in_progress} />
          <Bar dataKey="Not started" stackId="a" fill={STATUS_COLOR.todo} fillOpacity={0.45} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function StatusDonut({ deliverables }: { deliverables: Deliverable[] }) {
  const c = useChartColors();
  const count = (s: Deliverable["status"]) => deliverables.filter((d) => d.status === s).length;
  const data = [
    { name: "Confirmed", value: count("approved"), color: STATUS_COLOR.approved },
    { name: "Awaiting confirmation", value: count("pending"), color: STATUS_COLOR.pending },
    { name: "In progress", value: count("in_progress"), color: STATUS_COLOR.in_progress },
    { name: "Not started", value: count("todo"), color: STATUS_COLOR.todo },
  ];
  const total = deliverables.length;
  return (
    <div className="relative" role="img" aria-label="Donut chart of deliverables by status">
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={total ? data : [{ name: "None", value: 1, color: c.grid }]} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={total ? 2 : 0} stroke="none">
            {(total ? data : [{ name: "None", value: 1, color: c.grid }]).map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          {total > 0 && <Tooltip contentStyle={tooltipStyle} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-semibold leading-none">{total}</span>
        <span className="text-xs text-muted mt-1">deliverables</span>
      </div>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-medium text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BurnUpChart({ points }: { points: BurnPoint[] }) {
  const c = useChartColors();
  if (points.length < 2) {
    return <p className="px-4 pb-6 text-sm text-muted">The line starts once a deliverable is planned and grows as work is confirmed.</p>;
  }
  return (
    <div role="img" aria-label="Line chart of overall confirmed percentage over time against a pace target">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={points} margin={{ left: -8, right: 16, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="doneFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STATUS_COLOR.approved} stopOpacity={0.45} />
              <stop offset="100%" stopColor={STATUS_COLOR.approved} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.text, fontSize: 11 }} stroke={c.grid} minTickGap={28} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: c.text, fontSize: 11 }} stroke={c.grid} width={44} />
          <Tooltip contentStyle={tooltipStyle} formatter={pctFmt} />
          <Legend wrapperStyle={{ fontSize: 12, color: c.text }} />
          <Line name="Pace target" type="linear" dataKey="ideal" stroke={c.text} strokeDasharray="5 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Area name="Confirmed" type="monotone" dataKey="done" stroke={STATUS_COLOR.approved} strokeWidth={2.5} fill="url(#doneFill)" connectNulls={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function MemberLoadChart({ stats }: { stats: MemberStat[] }) {
  const c = useChartColors();
  const data = stats.map((m) => ({
    name: m.member.full_name.split(" ")[0],
    Confirmed: m.approved,
    "Awaiting confirmation": m.pending,
    "In progress": m.inProgress,
    "Not started": m.todo,
  }));
  return (
    <div role="img" aria-label="Stacked bar chart of each member's assigned deliverables by status">
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 52 + 50)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 0 }} barSize={22}>
          <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={{ fill: c.text, fontSize: 11 }} stroke={c.grid} />
          <YAxis type="category" dataKey="name" width={70} tick={{ fill: c.ink, fontSize: 13, fontWeight: 600 }} stroke={c.grid} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(120,130,160,.12)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: c.text }} />
          <Bar dataKey="Confirmed" stackId="a" fill={STATUS_COLOR.approved} />
          <Bar dataKey="Awaiting confirmation" stackId="a" fill={STATUS_COLOR.pending} />
          <Bar dataKey="In progress" stackId="a" fill={STATUS_COLOR.in_progress} />
          <Bar dataKey="Not started" stackId="a" fill={STATUS_COLOR.todo} fillOpacity={0.45} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ContributionDonut({ stats, memberIds }: { stats: MemberStat[]; memberIds: string[] }) {
  const data = stats
    .map((m) => ({ id: m.member.id, name: m.member.full_name, value: m.points, color: MEMBER_COLORS[Math.max(0, memberIds.indexOf(m.member.id)) % MEMBER_COLORS.length] }))
    .filter((d) => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) {
    return <p className="px-4 pb-6 text-sm text-muted">Contribution appears here after the first confirmed deliverable.</p>;
  }
  return (
    <div className="relative" role="img" aria-label="Donut chart of confirmed points by member">
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={2} stroke="none">
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} pts`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex h-[210px] flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold leading-none">{total}</span>
        <span className="text-xs text-muted mt-1">points confirmed</span>
      </div>
      <ul className="mt-1 space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="font-medium text-ink">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TypeMixChart({ deliverables }: { deliverables: Deliverable[] }) {
  const c = useChartColors();
  const map = new Map<string, number>();
  deliverables.forEach((d) => map.set(d.type, (map.get(d.type) || 0) + 1));
  const data = Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  if (data.length === 0) return <p className="px-4 pb-6 text-sm text-muted">Plan some deliverables to see the mix.</p>;
  return (
    <div role="img" aria-label="Bar chart of deliverables by type">
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38 + 30)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 0 }} barSize={16}>
          <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={{ fill: c.text, fontSize: 11 }} stroke={c.grid} />
          <YAxis type="category" dataKey="type" width={110} tick={{ fill: c.ink, fontSize: 12 }} stroke={c.grid} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(120,130,160,.12)" }} />
          <Bar dataKey="count" name="Deliverables" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={d.type} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
