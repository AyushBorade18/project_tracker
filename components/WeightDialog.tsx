import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { distributeWeights } from "../lib/calc";
import { Button, Chip, cx } from "./ui";

/**
 * Shown whenever a leader changes one deliverable's weight.
 * Raising one means the others give up the difference; lowering one frees points for the others.
 * The leader picks which ones, and the difference is split evenly among them.
 */
export function WeightDialog() {
  const { weightChange, closeWeightChange, applyWeights, deliverables, subjects } = useApp();
  const d = weightChange ? deliverables.find((x) => x.id === weightChange.id) : undefined;
  const subject = d ? subjects.find((s) => s.id === d.subject_id) : undefined;
  const others = useMemo(() => (d ? deliverables.filter((x) => x.subject_id === d.subject_id && x.id !== d.id) : []), [deliverables, d]);

  const newW = weightChange ? Math.max(0, Math.min(100, Math.round(weightChange.newWeight))) : 0;
  const delta = d ? newW - d.weight : 0;
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Default: everyone who can actually give (or take) some of the difference
  useEffect(() => {
    if (!d) return;
    setChosen(others.filter((o) => (delta > 0 ? o.weight > 0 : o.weight < 100)).map((o) => o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightChange?.id, weightChange?.newWeight]);

  useEffect(() => {
    if (!weightChange) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeWeightChange();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [weightChange, closeWeightChange]);

  // Nothing to decide: no change, or nobody else in the project
  useEffect(() => {
    if (!weightChange || !d) return;
    if (delta === 0) closeWeightChange();
    else if (others.length === 0) applyWeights([{ id: d.id, weight: newW }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightChange?.id, weightChange?.newWeight, others.length]);

  if (!weightChange || !d || delta === 0 || others.length === 0) return null;

  const shares = distributeWeights(others.map((o) => ({ id: o.id, weight: o.weight })), chosen, delta);
  const after = new Map(others.map((o) => [o.id, o.weight]));
  shares.forEach((s) => after.set(s.id, s.weight));
  const total = newW + Array.from(after.values()).reduce((a, b) => a + b, 0);
  const rising = delta > 0;

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const run = async (withOthers: boolean) => {
    setBusy(true);
    await applyWeights([{ id: d.id, weight: newW }, ...(withOthers ? shares : [])]);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Rebalance weights">
      <button type="button" aria-label="Cancel" className="absolute inset-0 cursor-default bg-ink/50" onClick={closeWeightChange} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-lift">
        <h2 className="font-display text-2xl font-semibold tracking-wide">
          {d.title}: {d.weight}% to {newW}%
        </h2>
        <p className="mt-1 text-sm text-muted">
          {rising
            ? `That adds ${delta} points to ${subject?.code}. Choose who gives them up, and they are taken evenly so the total stays at 100%.`
            : `That frees ${-delta} points in ${subject?.code}. Choose who gets them, and they are shared evenly so the total stays at 100%.`}
        </p>

        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {others.map((o) => {
            const on = chosen.includes(o.id);
            const next = after.get(o.id) ?? o.weight;
            const blocked = rising ? o.weight === 0 : o.weight === 100;
            return (
              <li key={o.id}>
                <label className={cx("flex cursor-pointer items-center gap-3 px-3 py-2.5", blocked && "cursor-not-allowed opacity-50")}>
                  <input type="checkbox" className="h-4 w-4" checked={on} disabled={blocked} onChange={() => toggle(o.id)} />
                  <span className="min-w-0 flex-1 truncate text-sm">{o.title}</span>
                  <span className="text-sm tabular-nums text-muted">{o.weight}%</span>
                  <span className="text-xs text-faint">to</span>
                  <span className={cx("w-10 text-right text-sm font-semibold tabular-nums", next !== o.weight && (rising ? "text-bad" : "text-ok"))}>{on ? next : o.weight}%</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">Total after this change</span>
          <Chip tone={total === 100 ? "ok" : "warn"}>{total}%</Chip>
        </div>
        {total !== 100 && chosen.length > 0 && <p className="mt-1 text-xs text-muted">Some of the chosen items cannot give or take the full amount. Add more items to balance it fully.</p>}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="primary" onClick={() => run(true)} disabled={busy || chosen.length === 0}>Apply and rebalance</Button>
          <Button onClick={() => run(false)} disabled={busy}>Change only this one</Button>
          <Button variant="ghost" onClick={closeWeightChange} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
