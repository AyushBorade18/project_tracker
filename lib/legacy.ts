import { submissionKind } from "./types";

/** Shape of the backup file the original (browser-only) ProjectTrack exported as project_tracker_backup.json. */
export interface LegacyFile { name: string; size: number; type: string; dataUrl: string; uploadedAt?: string }
export interface LegacyDeliverable {
  type: string; title: string; weight: number; assignee: string; status: string;
  workMade: string; proof: string; attachedFile?: LegacyFile | null; feedback: string; updatedAt?: string;
}
export interface LegacyProject { code: string; name: string; topic: string; deadline: string; leadId: string; deliverables: LegacyDeliverable[] }
export interface LegacyMember { id: string; name: string }
export interface LegacyBackup { members: LegacyMember[]; projects: LegacyProject[] }

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

export function parseLegacy(text: string): { ok: true; data: LegacyBackup } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON. Pick the project_tracker_backup.json you downloaded from the old app." };
  }
  const obj = raw as { projects?: unknown; members?: unknown };
  if (!obj || !Array.isArray(obj.projects)) {
    return { ok: false, error: "This does not look like a ProjectTrack backup (no projects list found)." };
  }
  const members: LegacyMember[] = (Array.isArray(obj.members) ? obj.members : [])
    .map((m) => ({ id: str((m as LegacyMember)?.id), name: str((m as LegacyMember)?.name) }))
    .filter((m) => m.id && m.name);
  const projects: LegacyProject[] = (obj.projects as unknown[])
    .map((p) => {
      const q = p as Partial<LegacyProject>;
      const dels = Array.isArray(q.deliverables) ? q.deliverables : [];
      return {
        code: str(q.code).trim().toUpperCase(),
        name: str(q.name).trim(),
        topic: str(q.topic),
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(str(q.deadline)) ? str(q.deadline) : "",
        leadId: str(q.leadId),
        deliverables: dels.map((d) => {
          const x = d as Partial<LegacyDeliverable>;
          const f = x.attachedFile as Partial<LegacyFile> | null | undefined;
          return {
            type: str(x.type) || "Custom",
            title: str(x.title).trim() || "Untitled",
            weight: Math.max(0, Math.min(100, Math.round(num(x.weight)))),
            assignee: str(x.assignee),
            status: str(x.status),
            workMade: str(x.workMade),
            proof: str(x.proof).trim(),
            feedback: str(x.feedback),
            updatedAt: str(x.updatedAt),
            attachedFile: f && str(f.dataUrl).startsWith("data:") ? { name: str(f.name) || "file", size: num(f.size), type: str(f.type), dataUrl: str(f.dataUrl) } : null,
          };
        }),
      };
    })
    .filter((p) => p.code && p.name);
  if (projects.length === 0) return { ok: false, error: "The backup has no subjects with a code and name." };
  return { ok: true, data: { members, projects } };
}

export function legacyCounts(b: LegacyBackup) {
  const dels = b.projects.flatMap((p) => p.deliverables);
  return {
    subjects: b.projects.length,
    deliverables: dels.length,
    files: dels.filter((d) => d.attachedFile).length,
    confirmed: dels.filter((d) => d.status === "approved").length,
  };
}

const KNOWN = ["App", "Website", "Logisim Project", "Report", "PPT", "Research Paper"];
export function normalizeType(t: string): string {
  return KNOWN.find((k) => k.toLowerCase() === t.trim().toLowerCase()) || "Custom";
}

/** Turns the old single "proof" text into the right new field for the deliverable type. */
export function mapProof(type: string, proof: string, workMade: string) {
  const isUrl = /^https?:\/\/\S+$/i.test(proof);
  const kind = submissionKind(type);
  let live = "", repo = "", other = "", notes = workMade;
  if (proof && isUrl && kind === "link") {
    if (/github\.com|gitlab\.com|bitbucket\.org/i.test(proof)) repo = proof;
    else live = proof;
  } else if (proof && isUrl && kind === "any") {
    other = proof;
  } else if (proof) {
    notes = notes ? `${notes}\n\nLink: ${proof}` : `Link: ${proof}`;
  }
  return { live_url: live, repo_url: repo, proof_url: other, work_made: notes };
}

export function mapStatus(status: string, hasWork: boolean): "todo" | "in_progress" | "pending" | "approved" {
  if (status === "approved") return "approved";
  if (status === "pending") return "pending";
  return hasWork ? "in_progress" : "todo";
}

export function matchMember(oldName: string, people: { id: string; full_name: string }[]): string | null {
  const n = oldName.trim().toLowerCase();
  if (!n) return null;
  const exact = people.filter((p) => p.full_name.trim().toLowerCase() === n);
  if (exact.length === 1) return exact[0].id;
  const first = n.split(/\s+/)[0];
  const byFirst = people.filter((p) => p.full_name.trim().toLowerCase().split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

export function dataUrlToFile(dataUrl: string, name: string, type: string): File | null {
  try {
    const [head, body] = dataUrl.split(",");
    const mime = type || /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  } catch {
    return null;
  }
}
