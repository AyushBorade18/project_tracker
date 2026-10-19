import React, { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useApp } from "../../lib/store";
import { memberStats } from "../../lib/calc";
import { Avatar, Button, Chip, CommitInput, Field, PageTitle, Panel, PanelHeader, inputCls } from "../ui";

export function Team() {
  const { profiles, subjects, deliverables, profile, isAdmin, updateProfile, changeOwnPassword, askConfirm, memberIndex, notify } = useApp();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const m = new Map(memberStats(profiles.filter((p) => p.active), subjects, deliverables).map((s) => [s.member.id, s]));
    return m;
  }, [profiles, subjects, deliverables]);

  const link = typeof window !== "undefined" ? window.location.origin : "";
  const waiting = profiles.filter((p) => !p.active);
  const people = [...profiles].sort((a, b) => Number(b.active) - Number(a.active) || a.created_at.localeCompare(b.created_at));

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return notify("Use a password with at least 8 characters.", "bad");
    setBusy(true);
    if (await changeOwnPassword(pw)) setPw("");
    setBusy(false);
  };

  return (
    <div>
      <PageTitle title="Team" sub={isAdmin ? "Approve teammates, set roles and keep the roster current." : "Everyone working on these six subjects."} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title={`Roster (${profiles.filter((p) => p.active).length} active)`} />
          <ul className="divide-y divide-line">
            {people.map((p) => {
              const st = stats.get(p.id);
              const me = p.id === profile?.id;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={p.full_name} index={memberIndex(p.id)} size={36} />
                  <div className="min-w-0 flex-1">
                    {isAdmin || me ? (
                      <CommitInput value={p.full_name} onCommit={(v) => v.trim() && updateProfile(p.id, { full_name: v.trim() })} className="max-w-xs py-1 font-medium" aria-label="Name" />
                    ) : (
                      <p className="truncate text-sm font-medium">{p.full_name}</p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-muted">{p.email}{st && ` · ${st.approved}/${st.assigned} confirmed`}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.role === "admin" && <Chip tone="info">Group leader</Chip>}
                    {!p.active && <Chip tone="warn">Waiting for approval</Chip>}
                    {me && <Chip>You</Chip>}
                    {isAdmin && !p.active && <Button size="sm" variant="ok" onClick={() => updateProfile(p.id, { active: true })}>Approve</Button>}
                    {isAdmin && p.active && !me && (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => (await askConfirm({ title: p.role === "admin" ? `Make ${p.full_name} a member?` : `Make ${p.full_name} a group leader?`, body: p.role === "admin" ? "They lose admin controls." : "They get full admin controls: plan, assign, confirm and manage the team.", confirmLabel: "Change role" })) && updateProfile(p.id, { role: p.role === "admin" ? "member" : "admin" })}
                        >
                          {p.role === "admin" ? "Make member" : "Make leader"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => (await askConfirm({ title: `Deactivate ${p.full_name}?`, body: "They can no longer open the app. Their assigned work stays so you can reassign it.", confirmLabel: "Deactivate", danger: true })) && updateProfile(p.id, { active: false })}
                        >
                          Deactivate
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-6">
          {isAdmin && (
            <Panel className="p-4">
              <h3 className="font-display text-xl font-semibold tracking-wide">Invite teammates</h3>
              <p className="mt-1.5 text-sm text-muted">Send this link. They create an account, confirm their email, and appear here as waiting for approval{waiting.length ? ` (${waiting.length} right now)` : ""}.</p>
              <div className="mt-3 flex gap-2">
                <input readOnly value={link} className={inputCls} aria-label="App link" onFocus={(e) => e.target.select()} />
                <Button onClick={async () => { try { await navigator.clipboard.writeText(link); notify("Link copied"); } catch { notify("Copy blocked. Select the link and copy it manually.", "bad"); } }} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
              </div>
            </Panel>
          )}
          <Panel className="p-4">
            <h3 className="font-display text-xl font-semibold tracking-wide">Change your password</h3>
            <form onSubmit={savePw} className="mt-3 space-y-3">
              <Field label="New password" hint="At least 8 characters."><input type="password" autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <Button type="submit" variant="primary" disabled={busy || !pw}>Update password</Button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
