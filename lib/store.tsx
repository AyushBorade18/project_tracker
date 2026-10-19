import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BUCKET, getSupabase } from "./supabase";
import { ActivityItem, Attachment, Deliverable, Profile, Status, Subject, ViewId } from "./types";

type Tone = "ok" | "bad" | "info";
interface Toast { id: number; msg: string; tone: Tone }
interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; danger?: boolean }

export interface DeliverablePatch {
  title?: string;
  type?: string;
  weight?: number;
  assignee_id?: string | null;
  due_date?: string | null;
  work_made?: string;
  proof_url?: string;
  status?: Status;
  feedback?: string;
}

interface AppContextValue {
  // auth
  authReady: boolean;
  session: Session | null;
  profile: Profile | null;
  profileLoaded: boolean;
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;
  isAdmin: boolean;

  // data
  loading: boolean;
  profiles: Profile[];
  members: Profile[]; // active people
  subjects: Subject[];
  deliverables: Deliverable[];
  attachments: Attachment[];
  activity: ActivityItem[];
  nameOf: (id: string | null | undefined) => string;
  memberIndex: (id: string | null | undefined) => number;
  subjectIndex: (id: string | null | undefined) => number;
  refreshAll: () => Promise<void>;

  // ui
  view: ViewId;
  setView: (v: ViewId) => void;
  openTaskId: string | null;
  openTask: (id: string | null) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  toasts: Toast[];
  notify: (msg: string, tone?: Tone) => void;
  confirmState: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  askConfirm: (o: ConfirmOptions) => Promise<boolean>;
  closeConfirm: (ok: boolean) => void;

  // mutations (all return true on success and toast their own errors)
  updateProfile: (id: string, patch: Partial<Pick<Profile, "full_name" | "role" | "active">>) => Promise<boolean>;
  changeOwnPassword: (password: string) => Promise<boolean>;
  saveSubject: (id: string, patch: Partial<Pick<Subject, "name" | "topic" | "deadline" | "lead_id" | "code">>) => Promise<boolean>;
  addSubject: (code: string, name: string) => Promise<boolean>;
  deleteSubject: (id: string) => Promise<boolean>;
  addDeliverable: (subjectId: string, type: string, title: string) => Promise<boolean>;
  patchDeliverable: (id: string, patch: DeliverablePatch, okMsg?: string) => Promise<boolean>;
  deleteDeliverable: (id: string) => Promise<boolean>;
  rebalance: (subjectId: string) => Promise<boolean>;
  bulkAssign: (subjectId: string, memberId: string | null) => Promise<boolean>;
  uploadAttachment: (deliverableId: string, file: File) => Promise<boolean>;
  deleteAttachment: (att: Attachment) => Promise<boolean>;
  openAttachment: (att: Attachment) => Promise<void>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

const VIEWS: ViewId[] = ["scoreboard", "board", "mine", "approvals", "analytics", "plan", "team", "activity"];
const MAX_FILE = 25 * 1024 * 1024;

function viewFromHash(): ViewId {
  if (typeof window === "undefined") return "scoreboard";
  const h = window.location.hash.replace(/^#\/?/, "") as ViewId;
  return VIEWS.includes(h) ? h : "scoreboard";
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const sb = useMemo(() => getSupabase(), []);

  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [view, setViewState] = useState<ViewId>("scoreboard");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<AppContextValue["confirmState"]>(null);
  const toastId = useRef(0);

  // ---------- UI helpers ----------
  useEffect(() => {
    setViewState(viewFromHash());
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHash);
    const t = document.documentElement.getAttribute("data-theme");
    setTheme(t === "dark" ? "dark" : "light");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setView = useCallback((v: ViewId) => {
    window.location.hash = `/${v}`;
    setViewState(v);
    setOpenTaskId(null);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("projecttrack-theme", next); } catch { /* preference only */ }
      return next;
    });
  }, []);

  const notify = useCallback((msg: string, tone: Tone = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 6000 : 3200);
  }, []);

  const askConfirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })),
    []
  );
  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmState((c) => {
      c?.resolve(ok);
      return null;
    });
  }, []);

  // ---------- Auth ----------
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setProfileLoaded(false);
        setProfiles([]);
        setSubjects([]);
        setDeliverables([]);
        setAttachments([]);
        setActivity([]);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const userId = session?.user?.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setProfileLoaded(true);
        return;
      }
      await new Promise((r) => setTimeout(r, 400)); // profile row is created by a trigger; give it a moment
    }
    setProfileLoaded(true);
  }, [sb, userId]);

  useEffect(() => {
    if (userId) loadProfile();
  }, [userId, loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      return error ? error.message : null;
    },
    [sb]
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
      });
      if (error) return error.message;
      if (!data.session) return "CONFIRM_EMAIL";
      return null;
    },
    [sb]
  );

  const signOut = useCallback(async () => {
    await sb.auth.signOut();
  }, [sb]);

  const sendReset = useCallback(
    async (email: string) => {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      return error ? error.message : null;
    },
    [sb]
  );

  const setNewPassword = useCallback(
    async (password: string) => {
      const { error } = await sb.auth.updateUser({ password });
      if (!error) setRecovery(false);
      return error ? error.message : null;
    },
    [sb]
  );

  // ---------- Data loading ----------
  const active = Boolean(profile?.active);

  const fetchers = useMemo(
    () => ({
      profiles: async () => {
        const { data, error } = await sb.from("profiles").select("*").order("created_at");
        if (!error && data) setProfiles(data as Profile[]);
      },
      subjects: async () => {
        const { data, error } = await sb.from("subjects").select("*").order("sort_order").order("created_at");
        if (!error && data) setSubjects(data as Subject[]);
      },
      deliverables: async () => {
        const { data, error } = await sb.from("deliverables").select("*").order("sort_order").order("created_at");
        if (!error && data) setDeliverables(data as Deliverable[]);
      },
      attachments: async () => {
        const { data, error } = await sb.from("attachments").select("*").order("created_at");
        if (!error && data) setAttachments(data as Attachment[]);
      },
      activity: async () => {
        const { data, error } = await sb.from("activity").select("*").order("created_at", { ascending: false }).limit(300);
        if (!error && data) setActivity(data as ActivityItem[]);
      },
    }),
    [sb]
  );

  const refreshAll = useCallback(async () => {
    await Promise.all(Object.values(fetchers).map((f) => f()));
  }, [fetchers]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    refreshAll().finally(() => !cancelled && setLoading(false));

    // Realtime: any change by anyone refreshes just that table (debounced).
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const queue = (table: keyof typeof fetchers) => {
      clearTimeout(timers[table]);
      timers[table] = setTimeout(() => {
        fetchers[table]();
        if (table === "deliverables") fetchers.activity();
      }, 150);
    };
    const channel = sb.channel("projecttrack-sync");
    (["profiles", "subjects", "deliverables", "attachments", "activity"] as const).forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queue(table);
        if (table === "profiles") loadProfile();
      });
    });
    channel.subscribe();

    // Safety net if the realtime socket sleeps (laptop lid, phone background)
    const onVisible = () => document.visibilityState === "visible" && refreshAll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      Object.values(timers).forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [active, sb, fetchers, refreshAll, loadProfile]);

  // A pending member waits on their own profile row; poll lightly in addition to realtime.
  useEffect(() => {
    if (!userId || !profileLoaded || active) return;
    const t = setInterval(loadProfile, 8000);
    return () => clearInterval(t);
  }, [userId, profileLoaded, active, loadProfile]);

  // ---------- Derived helpers ----------
  const members = useMemo(() => profiles.filter((p) => p.active), [profiles]);
  const nameOf = useCallback(
    (id: string | null | undefined) => (id ? profiles.find((p) => p.id === id)?.full_name || "Former member" : "Unassigned"),
    [profiles]
  );
  const memberIndex = useCallback((id: string | null | undefined) => (id ? Math.max(0, members.findIndex((m) => m.id === id)) : 0), [members]);
  const subjectIndex = useCallback((id: string | null | undefined) => (id ? Math.max(0, subjects.findIndex((s) => s.id === id)) : 0), [subjects]);

  // ---------- Mutations ----------
  const run = useCallback(
    async (op: () => PromiseLike<{ error: { message: string } | null }>, okMsg?: string): Promise<boolean> => {
      try {
        const { error } = await op();
        if (error) {
          notify(error.message, "bad");
          return false;
        }
        if (okMsg) notify(okMsg);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Something went wrong. Check your connection and try again.", "bad");
        return false;
      }
    },
    [notify]
  );

  const updateProfile: AppContextValue["updateProfile"] = useCallback(
    async (id, patch) => {
      const ok = await run(() => sb.from("profiles").update(patch).eq("id", id), "Saved");
      if (ok) {
        await fetchers.profiles();
        if (id === userId) await loadProfile();
      }
      return ok;
    },
    [run, sb, fetchers, userId, loadProfile]
  );

  const changeOwnPassword: AppContextValue["changeOwnPassword"] = useCallback(
    async (password) => {
      const ok = await run(() => sb.auth.updateUser({ password }), "Password changed");
      return ok;
    },
    [run, sb]
  );

  const saveSubject: AppContextValue["saveSubject"] = useCallback(
    async (id, patch) => {
      const ok = await run(() => sb.from("subjects").update(patch).eq("id", id));
      if (ok) await fetchers.subjects();
      return ok;
    },
    [run, sb, fetchers]
  );

  const addSubject: AppContextValue["addSubject"] = useCallback(
    async (code, name) => {
      const sort = (subjects[subjects.length - 1]?.sort_order ?? 0) + 1;
      const ok = await run(() => sb.from("subjects").insert({ code: code.trim().toUpperCase(), name: name.trim(), sort_order: sort }), `Added ${code.toUpperCase()}`);
      if (ok) await fetchers.subjects();
      return ok;
    },
    [run, sb, fetchers, subjects]
  );

  const deleteSubject: AppContextValue["deleteSubject"] = useCallback(
    async (id) => {
      const ok = await run(() => sb.from("subjects").delete().eq("id", id), "Subject deleted");
      if (ok) await Promise.all([fetchers.subjects(), fetchers.deliverables(), fetchers.activity()]);
      return ok;
    },
    [run, sb, fetchers]
  );

  const rebalance: AppContextValue["rebalance"] = useCallback(
    async (subjectId) => {
      const ok = await run(() => sb.rpc("rebalance_subject_weights", { p_subject: subjectId }), "Weights split evenly to 100%");
      if (ok) await fetchers.deliverables();
      return ok;
    },
    [run, sb, fetchers]
  );

  const addDeliverable: AppContextValue["addDeliverable"] = useCallback(
    async (subjectId, type, title) => {
      const sort = deliverables.filter((d) => d.subject_id === subjectId).length + 1;
      const ok = await run(() =>
        sb.from("deliverables").insert({ subject_id: subjectId, type, title: title.trim(), sort_order: sort })
      );
      if (ok) {
        await sb.rpc("rebalance_subject_weights", { p_subject: subjectId });
        await Promise.all([fetchers.deliverables(), fetchers.activity()]);
      }
      return ok;
    },
    [run, sb, fetchers, deliverables]
  );

  const patchDeliverable: AppContextValue["patchDeliverable"] = useCallback(
    async (id, patch, okMsg) => {
      const ok = await run(() => sb.from("deliverables").update(patch).eq("id", id), okMsg);
      if (ok) await Promise.all([fetchers.deliverables(), fetchers.activity()]);
      return ok;
    },
    [run, sb, fetchers]
  );

  const deleteDeliverable: AppContextValue["deleteDeliverable"] = useCallback(
    async (id) => {
      const d = deliverables.find((x) => x.id === id);
      const paths = attachments.filter((a) => a.deliverable_id === id).map((a) => a.storage_path);
      const ok = await run(() => sb.from("deliverables").delete().eq("id", id), "Deliverable removed");
      if (ok) {
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        if (d) await sb.rpc("rebalance_subject_weights", { p_subject: d.subject_id });
        setOpenTaskId((cur) => (cur === id ? null : cur));
        await Promise.all([fetchers.deliverables(), fetchers.attachments(), fetchers.activity()]);
      }
      return ok;
    },
    [run, sb, fetchers, deliverables, attachments]
  );

  const bulkAssign: AppContextValue["bulkAssign"] = useCallback(
    async (subjectId, memberId) => {
      const ok = await run(() => sb.from("deliverables").update({ assignee_id: memberId }).eq("subject_id", subjectId), "Assigned all tasks");
      if (ok) await Promise.all([fetchers.deliverables(), fetchers.activity()]);
      return ok;
    },
    [run, sb, fetchers]
  );

  const uploadAttachment: AppContextValue["uploadAttachment"] = useCallback(
    async (deliverableId, file) => {
      if (file.size > MAX_FILE) {
        notify(`${file.name} is larger than 25 MB. Paste a Drive or GitHub link instead.`, "bad");
        return false;
      }
      const path = `${deliverableId}/${Date.now()}-${safeName(file.name)}`;
      try {
        const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (up.error) {
          notify(up.error.message, "bad");
          return false;
        }
        const ins = await sb.from("attachments").insert({
          deliverable_id: deliverableId,
          storage_path: path,
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || "application/octet-stream",
          uploaded_by: userId,
        });
        if (ins.error) {
          await sb.storage.from(BUCKET).remove([path]);
          notify(ins.error.message, "bad");
          return false;
        }
        await fetchers.attachments();
        notify(`Uploaded ${file.name}`);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Upload failed", "bad");
        return false;
      }
    },
    [sb, notify, userId, fetchers]
  );

  const deleteAttachment: AppContextValue["deleteAttachment"] = useCallback(
    async (att) => {
      const ok = await run(() => sb.from("attachments").delete().eq("id", att.id), "File removed");
      if (ok) {
        await sb.storage.from(BUCKET).remove([att.storage_path]);
        await fetchers.attachments();
      }
      return ok;
    },
    [run, sb, fetchers]
  );

  const openAttachment: AppContextValue["openAttachment"] = useCallback(
    async (att) => {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(att.storage_path, 90, { download: att.file_name });
      if (error || !data) {
        notify(error?.message || "Could not open the file", "bad");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    },
    [sb, notify]
  );

  const value: AppContextValue = {
    authReady, session, profile, profileLoaded, recovery,
    signIn, signUp, signOut, sendReset, setNewPassword,
    isAdmin: profile?.role === "admin" && Boolean(profile?.active),
    loading, profiles, members, subjects, deliverables, attachments, activity,
    nameOf, memberIndex, subjectIndex, refreshAll,
    view, setView, openTaskId, openTask: setOpenTaskId, theme, toggleTheme,
    toasts, notify, confirmState, askConfirm, closeConfirm,
    updateProfile, changeOwnPassword, saveSubject, addSubject, deleteSubject,
    addDeliverable, patchDeliverable, deleteDeliverable, rebalance, bulkAssign,
    uploadAttachment, deleteAttachment, openAttachment,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
