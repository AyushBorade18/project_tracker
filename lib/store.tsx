import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BUCKET, getSupabase } from "./supabase";
import { ActivityItem, AppNotification, Attachment, ProgressMood, ProgressUpdate, Deliverable, Group, Membership, Profile, Semester, Status, Subject, Task, ViewId } from "./types";
import { LegacyBackup, dataUrlToFile, mapProof, mapStatus, matchMember, normalizeType } from "./legacy";

type Tone = "ok" | "bad" | "info";
interface Toast { id: number; msg: string; tone: Tone }
interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; danger?: boolean }
interface Me { id: string; email: string; full_name: string }

export interface DeliverablePatch {
  title?: string;
  type?: string;
  weight?: number;
  assignee_id?: string | null;
  due_date?: string | null;
  work_made?: string;
  live_url?: string;
  repo_url?: string;
  proof_url?: string;
  status?: Status;
  feedback?: string;
}

export interface ImportResult { subjects: number; deliverables: number; files: number; unmatched: string[] }

interface AppContextValue {
  // auth
  authReady: boolean;
  session: Session | null;
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;

  // who I am in the group I am looking at
  me: Me | null;
  profile: Profile | null; // null = not a member of any group yet
  profileLoaded: boolean;
  isLeader: boolean; // group leader (any semester)
  isAdmin: boolean; // leader AND the viewed semester is the current one (can edit)

  // groups and semesters
  groups: Group[];
  group: Group | null;
  switchGroup: (id: string) => void;
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
  semesters: Semester[];
  semester: Semester | null; // the one being viewed
  currentSemester: Semester | null;
  setSemesterId: (id: string) => void;
  readOnly: boolean; // viewing an archived semester

  // data
  loading: boolean;
  profiles: Profile[]; // everyone in the group (incl. waiting)
  members: Profile[]; // active people
  subjects: Subject[];
  deliverables: Deliverable[];
  attachments: Attachment[];
  activity: ActivityItem[];
  tasks: Task[];
  progressUpdates: ProgressUpdate[];
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
  themePref: "light" | "system" | "dark";
  setThemePref: (p: "light" | "system" | "dark") => void;
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  alertsPermission: "default" | "granted" | "denied" | "unsupported";
  enableAlerts: () => Promise<void>;
  weightChange: { id: string; newWeight: number } | null;
  requestWeightChange: (id: string, newWeight: number) => void;
  closeWeightChange: () => void;
  applyWeights: (changes: { id: string; weight: number }[]) => Promise<boolean>;
  toasts: Toast[];
  notify: (msg: string, tone?: Tone) => void;
  confirmState: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  askConfirm: (o: ConfirmOptions) => Promise<boolean>;
  closeConfirm: (ok: boolean) => void;

  // mutations (all return true on success and toast their own errors)
  createGroup: (name: string, semesterName: string, subjects: { code: string; name: string }[]) => Promise<boolean>;
  joinGroup: (code: string) => Promise<boolean>;
  startSemester: (name: string, copySubjects: boolean) => Promise<boolean>;
  rotateJoinCode: () => Promise<boolean>;
  renameGroup: (name: string) => Promise<boolean>;
  renameSemester: (name: string) => Promise<boolean>;
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
  importLegacy: (backup: LegacyBackup) => Promise<ImportResult | null>;
  addTask: (t: { subject_id: string; title: string; assignee_id?: string | null; due_date?: string | null; deliverable_id?: string | null; details?: string }) => Promise<boolean>;
  patchTask: (id: string, patch: Partial<Pick<Task, "title" | "details" | "assignee_id" | "due_date" | "status" | "deliverable_id" | "note" | "feedback">>, okMsg?: string) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  addUpdate: (u: { deliverable_id: string; mood: ProgressMood; percent: number | null; body: string; github_url: string; link_url: string }, files: File[]) => Promise<boolean>;
  deleteUpdate: (id: string) => Promise<boolean>;
  requestMoreTime: (target: { deliverable_id?: string; task_id?: string }, note: string) => Promise<boolean>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

const VIEWS: ViewId[] = ["scoreboard", "board", "mine", "approvals", "analytics", "plan", "team", "activity"];
const MAX_FILE = 25 * 1024 * 1024;
const GROUP_KEY = "projecttrack-group";

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

  const [me, setMe] = useState<Me | null>(null);
  const [myMemberships, setMyMemberships] = useState<Membership[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterId, setSemesterIdState] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Membership[]>([]);
  const [people, setPeople] = useState<{ id: string; email: string; full_name: string; created_at: string }[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);

  const [view, setViewState] = useState<ViewId>("scoreboard");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themePref, setThemePrefState] = useState<"light" | "system" | "dark">("light");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [alertsPermission, setAlertsPermission] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [weightChange, setWeightChange] = useState<{ id: string; newWeight: number } | null>(null);
  const seenNotif = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<AppContextValue["confirmState"]>(null);
  const toastId = useRef(0);

  // Latest ids for the fetchers (so realtime callbacks never use stale values)
  const gRef = useRef<string | null>(null);
  const sRef = useRef<string | null>(null);
  gRef.current = groupId;
  sRef.current = semesterId;

  // ---------- UI helpers ----------
  useEffect(() => {
    setViewState(viewFromHash());
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHash);
    let pref: "light" | "system" | "dark" = "light";
    try {
      const saved = localStorage.getItem("projecttrack-theme-pref");
      if (saved === "light" || saved === "dark" || saved === "system") pref = saved;
    } catch { /* ignore */ }
    setThemePrefState(pref);
    if (typeof Notification === "undefined") setAlertsPermission("unsupported");
    else setAlertsPermission(Notification.permission as "default" | "granted" | "denied");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setView = useCallback((v: ViewId) => {
    window.location.hash = `/${v}`;
    setViewState(v);
    setOpenTaskId(null);
  }, []);

  // Light by default. "system" follows the device and updates live if the device switches.
  useEffect(() => {
    const apply = () => {
      const eff = themePref === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : themePref;
      document.documentElement.setAttribute("data-theme", eff);
      setTheme(eff);
    };
    apply();
    if (themePref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themePref]);

  const setThemePref = useCallback((p: "light" | "system" | "dark") => {
    setThemePrefState(p);
    try { localStorage.setItem("projecttrack-theme-pref", p); } catch { /* preference only */ }
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
        setMe(null);
        setMyMemberships([]);
        setGroups([]);
        setProfileLoaded(false);
        setGroupId(null);
        setSemesterIdState(null);
        setSemesters([]);
        setGroupMembers([]);
        setPeople([]);
        setSubjects([]);
        setDeliverables([]);
        setAttachments([]);
        setActivity([]);
        setTasks([]);
        setProgressUpdates([]);
        setShowOnboarding(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const userId = session?.user?.id ?? null;

  /** My own profile, my memberships and the groups they point to. */
  const loadMe = useCallback(async () => {
    if (!userId) return;
    let prof: Me | null = null;
    for (let attempt = 0; attempt < 3 && !prof; attempt++) {
      const { data } = await sb.from("profiles").select("id,email,full_name").eq("id", userId).maybeSingle();
      if (data) prof = data as Me;
      else await new Promise((r) => setTimeout(r, 400)); // profile row is created by a trigger; give it a moment
    }
    const { data: ms } = await sb.from("memberships").select("*").eq("user_id", userId);
    const memberships = (ms || []) as Membership[];
    let gs: Group[] = [];
    if (memberships.length) {
      const { data } = await sb.from("groups").select("*").in("id", memberships.map((m) => m.group_id));
      gs = (data || []) as Group[];
    }
    setMe(prof);
    setMyMemberships(memberships);
    setGroups(gs);
    setGroupId((cur) => {
      if (cur && memberships.some((m) => m.group_id === cur)) return cur;
      let saved: string | null = null;
      try { saved = localStorage.getItem(GROUP_KEY); } catch { /* ignore */ }
      if (saved && memberships.some((m) => m.group_id === saved)) return saved;
      return (memberships.find((m) => m.active) || memberships[0])?.group_id ?? null;
    });
    setProfileLoaded(true);
  }, [sb, userId]);

  useEffect(() => {
    if (userId) loadMe();
  }, [userId, loadMe]);

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

  // ---------- Current group / semester ----------
  const myMembership = myMemberships.find((m) => m.group_id === groupId) || null;
  const active = Boolean(myMembership?.active);
  const group = groups.find((g) => g.id === groupId) || null;

  const switchGroup = useCallback((id: string) => {
    try { localStorage.setItem(GROUP_KEY, id); } catch { /* ignore */ }
    setSemesterIdState(null);
    setSemesters([]);
    setGroupMembers([]);
    setPeople([]);
    setSubjects([]);
    setDeliverables([]);
    setAttachments([]);
    setActivity([]);
    setTasks([]);
    setProgressUpdates([]);
    setOpenTaskId(null);
    setGroupId(id);
    setShowOnboarding(false);
  }, []);

  const setSemesterId = useCallback((id: string) => {
    setOpenTaskId(null);
    setSemesterIdState(id);
  }, []);

  const currentSemester = semesters.find((s) => s.status === "current") || null;
  const semester = semesters.find((s) => s.id === semesterId) || currentSemester;
  const readOnly = semester?.status === "archived";
  const isLeader = myMembership?.role === "admin" && active;
  const isAdmin = isLeader && !readOnly;

  // ---------- Data loading ----------
  const fetchers = useMemo(
    () => ({
      members: async () => {
        const g = gRef.current;
        if (!g) return;
        const { data: ms } = await sb.from("memberships").select("*").eq("group_id", g).order("created_at");
        const list = (ms || []) as Membership[];
        setGroupMembers(list);
        if (list.length) {
          const { data: ps } = await sb.from("profiles").select("id,email,full_name,created_at").in("id", list.map((m) => m.user_id));
          setPeople((ps || []) as { id: string; email: string; full_name: string; created_at: string }[]);
        }
      },
      semesters: async () => {
        const g = gRef.current;
        if (!g) return [] as Semester[];
        const { data } = await sb.from("semesters").select("*").eq("group_id", g).order("started_at");
        const list = (data || []) as Semester[];
        setSemesters(list);
        return list;
      },
      subjects: async () => {
        const g = gRef.current, s = sRef.current;
        if (!g || !s) return;
        const { data, error } = await sb.from("subjects").select("*").eq("group_id", g).eq("semester_id", s).order("sort_order").order("created_at");
        if (!error && data) setSubjects(data as Subject[]);
      },
      deliverables: async () => {
        const g = gRef.current, s = sRef.current;
        if (!g || !s) return;
        const { data, error } = await sb.from("deliverables").select("*").eq("group_id", g).eq("semester_id", s).order("sort_order").order("created_at");
        if (!error && data) setDeliverables(data as Deliverable[]);
      },
      attachments: async () => {
        const g = gRef.current, s = sRef.current;
        if (!g || !s) return;
        const { data, error } = await sb.from("attachments").select("*").eq("group_id", g).eq("semester_id", s).order("created_at");
        if (!error && data) setAttachments(data as Attachment[]);
      },
      updates: async () => {
        const g = gRef.current, s = sRef.current;
        if (!g || !s) return;
        const { data, error } = await sb.from("progress_updates").select("*").eq("group_id", g).eq("semester_id", s).order("created_at", { ascending: false }).limit(500);
        if (!error && data) setProgressUpdates(data as ProgressUpdate[]);
      },
      tasks: async () => {
        const g = gRef.current, s = sRef.current;
        if (!g || !s) return;
        const { data, error } = await sb.from("tasks").select("*").eq("group_id", g).eq("semester_id", s).order("created_at");
        if (!error && data) setTasks(data as Task[]);
      },
      activity: async () => {
        const g = gRef.current, s = sRef.current;
        if (!g || !s) return;
        const { data, error } = await sb.from("activity").select("*").eq("group_id", g).eq("semester_id", s).order("created_at", { ascending: false }).limit(300);
        if (!error && data) setActivity(data as ActivityItem[]);
      },
    }),
    [sb]
  );

  const refreshAll = useCallback(async () => {
    await loadMe();
    await Promise.all([fetchers.members(), fetchers.semesters()]);
    await Promise.all([fetchers.subjects(), fetchers.deliverables(), fetchers.attachments(), fetchers.activity(), fetchers.tasks(), fetchers.updates()]);
  }, [fetchers, loadMe]);

  // Load the group when it becomes active
  useEffect(() => {
    if (!active || !groupId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [, sems] = await Promise.all([fetchers.members(), fetchers.semesters()]);
      if (cancelled) return;
      const cur = (sems as Semester[]).find((s) => s.status === "current") || (sems as Semester[])[sems.length - 1];
      setSemesterIdState((prev) => (prev && (sems as Semester[]).some((s) => s.id === prev) ? prev : cur?.id ?? null));
    })().finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [active, groupId, fetchers]);

  // Load the semester data whenever the viewed semester changes
  useEffect(() => {
    if (!active || !groupId || !semesterId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchers.subjects(), fetchers.deliverables(), fetchers.attachments(), fetchers.activity(), fetchers.tasks(), fetchers.updates()]).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [active, groupId, semesterId, fetchers]);

  // Realtime for the group being viewed
  useEffect(() => {
    if (!active || !groupId) return;
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const queue = (key: string, fn: () => void) => {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(fn, 150);
    };
    const channel = sb.channel(`projecttrack-${groupId}`);
    const filter = `group_id=eq.${groupId}`;
    const on = (table: string, fn: () => void) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => queue(table, fn));
    on("deliverables", () => { fetchers.deliverables(); fetchers.activity(); });
    on("subjects", () => fetchers.subjects());
    on("attachments", () => fetchers.attachments());
    on("progress_updates", () => { fetchers.updates(); fetchers.activity(); });
    on("tasks", () => { fetchers.tasks(); fetchers.activity(); });
    on("activity", () => fetchers.activity());
    on("semesters", () => fetchers.semesters());
    on("memberships", () => { fetchers.members(); loadMe(); });
    channel.subscribe();

    // Safety net if the realtime socket sleeps (laptop lid, phone background)
    const onVisible = () => document.visibilityState === "visible" && refreshAll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      Object.values(timers).forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [active, groupId, sb, fetchers, refreshAll, loadMe]);

  // A person waiting for approval watches their own membership rows, with a light poll as backup.
  useEffect(() => {
    if (!userId || !profileLoaded || active) return;
    const ch = sb
      .channel(`projecttrack-me-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "memberships", filter: `user_id=eq.${userId}` }, () => loadMe())
      .subscribe();
    const t = setInterval(loadMe, 8000);
    return () => {
      clearInterval(t);
      sb.removeChannel(ch);
    };
  }, [userId, profileLoaded, active, loadMe, sb]);

  // ---------- Derived helpers ----------
  const profiles: Profile[] = useMemo(
    () =>
      groupMembers
        .map((m) => {
          const p = people.find((x) => x.id === m.user_id);
          return p ? { id: p.id, email: p.email, full_name: p.full_name, created_at: m.created_at, role: m.role, active: m.active } : null;
        })
        .filter((p): p is Profile => p !== null),
    [groupMembers, people]
  );
  const members = useMemo(() => profiles.filter((p) => p.active), [profiles]);

  const profile: Profile | null = useMemo(() => {
    if (!me || !myMembership) return null;
    return { id: me.id, email: me.email, full_name: me.full_name, created_at: myMembership.created_at, role: myMembership.role, active: myMembership.active };
  }, [me, myMembership]);

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

  const createGroup: AppContextValue["createGroup"] = useCallback(
    async (name, semesterName, subs) => {
      try {
        const { data, error } = await sb.rpc("create_group", { p_name: name, p_semester: semesterName, p_subjects: subs });
        if (error) { notify(error.message, "bad"); return false; }
        await loadMe();
        if (data) switchGroup(data as string);
        notify("Group created. You are its leader.");
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not create the group.", "bad");
        return false;
      }
    },
    [sb, notify, loadMe, switchGroup]
  );

  const joinGroup: AppContextValue["joinGroup"] = useCallback(
    async (code) => {
      try {
        const { data, error } = await sb.rpc("join_group", { p_code: code });
        if (error) { notify(error.message, "bad"); return false; }
        await loadMe();
        if (data) switchGroup(data as string);
        notify("Request sent. The group leader needs to approve you.");
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not join the group.", "bad");
        return false;
      }
    },
    [sb, notify, loadMe, switchGroup]
  );

  const startSemester: AppContextValue["startSemester"] = useCallback(
    async (name, copy) => {
      if (!groupId) return false;
      try {
        const { data, error } = await sb.rpc("start_new_semester", { p_group: groupId, p_name: name, p_copy_subjects: copy });
        if (error) { notify(error.message, "bad"); return false; }
        const sems = await fetchers.semesters();
        setSemesterIdState((data as string) || sems.find((s) => s.status === "current")?.id || null);
        notify(`${name} started. The previous semester is saved under the semester switcher.`);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not start the semester.", "bad");
        return false;
      }
    },
    [sb, groupId, notify, fetchers]
  );

  const rotateJoinCode: AppContextValue["rotateJoinCode"] = useCallback(async () => {
    if (!groupId) return false;
    const ok = await run(() => sb.rpc("rotate_join_code", { p_group: groupId }), "New join code created. The old one no longer works.");
    if (ok) await loadMe();
    return ok;
  }, [run, sb, groupId, loadMe]);

  const renameGroup: AppContextValue["renameGroup"] = useCallback(
    async (name) => {
      if (!groupId) return false;
      const ok = await run(() => sb.from("groups").update({ name: name.trim() }).eq("id", groupId), "Group renamed");
      if (ok) await loadMe();
      return ok;
    },
    [run, sb, groupId, loadMe]
  );

  const renameSemester: AppContextValue["renameSemester"] = useCallback(
    async (name) => {
      if (!semesterId || !name.trim()) return false;
      const ok = await run(() => sb.from("semesters").update({ name: name.trim() }).eq("id", semesterId), "Semester renamed");
      if (ok) await fetchers.semesters();
      return ok;
    },
    [run, sb, semesterId, fetchers]
  );

  const updateProfile: AppContextValue["updateProfile"] = useCallback(
    async (id, patch) => {
      let ok = true;
      if (patch.full_name !== undefined) {
        ok = await run(() => sb.from("profiles").update({ full_name: patch.full_name }).eq("id", id), "Saved");
      }
      if (ok && (patch.role !== undefined || patch.active !== undefined) && groupId) {
        const m: { role?: string; active?: boolean } = {};
        if (patch.role !== undefined) m.role = patch.role;
        if (patch.active !== undefined) m.active = patch.active;
        ok = await run(() => sb.from("memberships").update(m).eq("group_id", groupId).eq("user_id", id), "Saved");
      }
      if (ok) {
        await Promise.all([fetchers.members(), loadMe()]);
      }
      return ok;
    },
    [run, sb, groupId, fetchers, loadMe]
  );

  const changeOwnPassword: AppContextValue["changeOwnPassword"] = useCallback(
    async (password) => run(() => sb.auth.updateUser({ password }), "Password changed"),
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
      if (!semesterId) return false;
      const sort = (subjects[subjects.length - 1]?.sort_order ?? 0) + 1;
      const ok = await run(
        () => sb.from("subjects").insert({ semester_id: semesterId, code: code.trim().toUpperCase(), name: name.trim(), sort_order: sort }),
        `Added ${code.toUpperCase()}`
      );
      if (ok) await fetchers.subjects();
      return ok;
    },
    [run, sb, fetchers, subjects, semesterId]
  );

  const deleteSubject: AppContextValue["deleteSubject"] = useCallback(
    async (id) => {
      const ok = await run(() => sb.from("subjects").delete().eq("id", id), "Subject deleted");
      if (ok) await Promise.all([fetchers.subjects(), fetchers.deliverables(), fetchers.attachments(), fetchers.activity()]);
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
      const ok = await run(() => sb.from("deliverables").insert({ subject_id: subjectId, type, title: title.trim(), sort_order: sort }));
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

  const uploadRaw = useCallback(
    async (deliverableId: string, file: File, quiet = false, updateId?: string): Promise<boolean> => {
      if (file.size > MAX_FILE) {
        notify(`${file.name} is larger than 25 MB. Compress it and try again.`, "bad");
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
          update_id: updateId ?? null,
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
        if (!quiet) {
          await fetchers.attachments();
          notify(`Uploaded ${file.name}`);
        }
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Upload failed", "bad");
        return false;
      }
    },
    [sb, notify, userId, fetchers]
  );

  const uploadAttachment: AppContextValue["uploadAttachment"] = useCallback((id, file) => uploadRaw(id, file), [uploadRaw]);

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

  const addTask: AppContextValue["addTask"] = useCallback(
    async (t) => {
      const ok = await run(() =>
        sb.from("tasks").insert({
          subject_id: t.subject_id,
          title: t.title.trim(),
          assignee_id: t.assignee_id || null,
          due_date: t.due_date || null,
          deliverable_id: t.deliverable_id || null,
          details: t.details?.trim() || "",
        }),
        "Task assigned"
      );
      if (ok) await Promise.all([fetchers.tasks(), fetchers.activity()]);
      return ok;
    },
    [run, sb, fetchers]
  );

  const patchTask: AppContextValue["patchTask"] = useCallback(
    async (id, patch, okMsg) => {
      const ok = await run(() => sb.from("tasks").update(patch).eq("id", id), okMsg);
      if (ok) await Promise.all([fetchers.tasks(), fetchers.activity()]);
      return ok;
    },
    [run, sb, fetchers]
  );

  const deleteTask: AppContextValue["deleteTask"] = useCallback(
    async (id) => {
      const ok = await run(() => sb.from("tasks").delete().eq("id", id), "Task removed");
      if (ok) await fetchers.tasks();
      return ok;
    },
    [run, sb, fetchers]
  );

  const addUpdate: AppContextValue["addUpdate"] = useCallback(
    async (u, files) => {
      try {
        const { data, error } = await sb
          .from("progress_updates")
          .insert({ deliverable_id: u.deliverable_id, mood: u.mood, percent: u.percent, body: u.body.trim(), github_url: u.github_url.trim(), link_url: u.link_url.trim() })
          .select("id")
          .single();
        if (error || !data) {
          notify(error?.message || "Could not post the update.", "bad");
          return false;
        }
        const id = (data as { id: string }).id;
        let failed = 0;
        for (const f of files) if (!(await uploadRaw(u.deliverable_id, f, true, id))) failed++;
        await Promise.all([fetchers.updates(), fetchers.attachments(), fetchers.deliverables(), fetchers.activity()]);
        notify(failed ? `Update posted, but ${failed} file${failed > 1 ? "s" : ""} did not upload.` : "Update posted. Your leader has been notified.", failed ? "bad" : "ok");
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not post the update.", "bad");
        return false;
      }
    },
    [sb, notify, uploadRaw, fetchers]
  );

  const deleteUpdate: AppContextValue["deleteUpdate"] = useCallback(
    async (id) => {
      const paths = attachments.filter((a) => a.update_id === id).map((a) => a.storage_path);
      const ok = await run(() => sb.from("progress_updates").delete().eq("id", id), "Update removed");
      if (ok) {
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        await Promise.all([fetchers.updates(), fetchers.attachments()]);
      }
      return ok;
    },
    [run, sb, fetchers, attachments]
  );

  const requestMoreTime: AppContextValue["requestMoreTime"] = useCallback(
    async (target, note) =>
      run(
        () => sb.rpc("request_more_time", { p_deliverable: target.deliverable_id ?? null, p_task: target.task_id ?? null, p_note: note }),
        "Request sent. Your leader has been notified."
      ),
    [run, sb]
  );

  /** Brings the original app's JSON backup into the semester being viewed (leader only). */
  const importLegacy: AppContextValue["importLegacy"] = useCallback(
    async (backup) => {
      if (!semesterId || !isAdmin) {
        notify("Switch to the current semester as a group leader to import.", "bad");
        return null;
      }
      const result: ImportResult = { subjects: 0, deliverables: 0, files: 0, unmatched: [] };
      const idMap = new Map<string, string | null>();
      backup.members.forEach((m) => {
        const pid = matchMember(m.name, members);
        idMap.set(m.id, pid);
        if (!pid) result.unmatched.push(m.name);
      });

      try {
        let sortBase = subjects.length;
        for (const p of backup.projects) {
          let subj = subjects.find((s) => s.code.toUpperCase() === p.code);
          if (!subj) {
            const { data, error } = await sb
              .from("subjects")
              .insert({ semester_id: semesterId, code: p.code, name: p.name, topic: p.topic, deadline: p.deadline || null, lead_id: idMap.get(p.leadId) ?? null, sort_order: ++sortBase })
              .select("*")
              .single();
            if (error || !data) { notify(`${p.code}: ${error?.message || "could not create subject"}`, "bad"); continue; }
            subj = data as Subject;
            result.subjects++;
          } else {
            const patch: Record<string, unknown> = {};
            if (!subj.topic && p.topic) patch.topic = p.topic;
            if (!subj.deadline && p.deadline) patch.deadline = p.deadline;
            if (!subj.lead_id && idMap.get(p.leadId)) patch.lead_id = idMap.get(p.leadId);
            if (Object.keys(patch).length) await sb.from("subjects").update(patch).eq("id", subj.id);
          }

          const existing = deliverables.filter((d) => d.subject_id === subj!.id);
          let order = existing.length;
          for (const d of p.deliverables) {
            const type = normalizeType(d.type);
            if (existing.some((e) => e.type === type && e.title.toLowerCase() === d.title.toLowerCase())) continue;
            const proof = mapProof(type, d.proof, d.workMade);
            const hasWork = Boolean(d.workMade || d.proof || d.attachedFile);
            const status = mapStatus(d.status, hasWork);
            const when = d.updatedAt && !isNaN(Date.parse(d.updatedAt)) ? new Date(d.updatedAt).toISOString() : undefined;
            const row: Record<string, unknown> = {
              subject_id: subj.id,
              type,
              title: d.title,
              weight: d.weight,
              assignee_id: idMap.get(d.assignee) ?? null,
              status,
              feedback: d.feedback,
              sort_order: ++order,
              ...proof,
            };
            if (when) {
              row.created_at = when;
              if (status === "approved") row.approved_at = when;
              if (status === "approved" || status === "pending") row.submitted_at = when;
            }
            const { data: ins, error } = await sb.from("deliverables").insert(row).select("id").single();
            if (error || !ins) { notify(`${p.code} ${d.title}: ${error?.message || "skipped"}`, "bad"); continue; }
            result.deliverables++;
            if (d.attachedFile) {
              const f = dataUrlToFile(d.attachedFile.dataUrl, d.attachedFile.name, d.attachedFile.type);
              if (f && (await uploadRaw((ins as { id: string }).id, f, true))) result.files++;
            }
          }
        }
        await Promise.all([fetchers.subjects(), fetchers.deliverables(), fetchers.attachments(), fetchers.activity()]);
        return result;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Import stopped unexpectedly.", "bad");
        await Promise.all([fetchers.subjects(), fetchers.deliverables(), fetchers.attachments()]);
        return result;
      }
    },
    [semesterId, isAdmin, members, subjects, deliverables, sb, notify, uploadRaw, fetchers]
  );

  // ---------- Notifications (bell) ----------
  const loadNotifications = useCallback(async () => {
    if (!userId || !groupId) return;
    const { data, error } = await sb
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error && data) {
      (data as AppNotification[]).forEach((n) => seenNotif.current.add(n.id));
      setNotifications(data as AppNotification[]);
    }
  }, [sb, userId, groupId]);

  useEffect(() => {
    if (!active || !userId || !groupId) return;
    seenNotif.current = new Set();
    setNotifications([]);
    loadNotifications();
    const ch = sb
      .channel(`projecttrack-notif-${userId}-${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as AppNotification;
        if (n.group_id !== groupId || seenNotif.current.has(n.id)) return;
        seenNotif.current.add(n.id);
        setNotifications((prev) => [n, ...prev].slice(0, 60));
        notify(`${n.title}: ${n.body}`, "info");
        // Phone/desktop alert when the app is open but in the background (needs permission, see enableAlerts)
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
          try { new Notification(n.title, { body: n.body, icon: "/icons/icon-192.png", tag: n.id }); } catch { /* some browsers need a service worker for this */ }
        }
      })
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && loadNotifications();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(ch);
    };
  }, [active, userId, groupId, sb, loadNotifications, notify]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications]);

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
      await sb.from("notifications").update({ read_at: now }).eq("id", id);
    },
    [sb]
  );

  const markAllRead = useCallback(async () => {
    if (!userId || !groupId) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await sb.from("notifications").update({ read_at: now }).eq("user_id", userId).eq("group_id", groupId).is("read_at", null);
  }, [sb, userId, groupId]);

  const enableAlerts = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setAlertsPermission(p as "default" | "granted" | "denied");
  }, []);

  // ---------- Weight rebalancing ----------
  const requestWeightChange = useCallback((id: string, newWeight: number) => setWeightChange({ id, newWeight }), []);
  const closeWeightChange = useCallback(() => setWeightChange(null), []);
  const applyWeights = useCallback(
    async (changes: { id: string; weight: number }[]) => {
      const ok = await run(() => sb.rpc("set_weights", { p_changes: changes }), "Weights updated");
      if (ok) await fetchers.deliverables();
      setWeightChange(null);
      return ok;
    },
    [run, sb, fetchers]
  );

  const value: AppContextValue = {
    authReady, session, recovery, signIn, signUp, signOut, sendReset, setNewPassword,
    me, profile, profileLoaded, isLeader, isAdmin,
    groups, group, switchGroup, showOnboarding, setShowOnboarding,
    semesters, semester, currentSemester, setSemesterId, readOnly,
    loading, profiles, members, subjects, deliverables, attachments, activity, tasks, progressUpdates,
    nameOf, memberIndex, subjectIndex, refreshAll,
    view, setView, openTaskId, openTask: setOpenTaskId, theme, themePref, setThemePref,
    toasts, notify, confirmState, askConfirm, closeConfirm,
    createGroup, joinGroup, startSemester, rotateJoinCode, renameGroup, renameSemester,
    updateProfile, changeOwnPassword, saveSubject, addSubject, deleteSubject,
    addDeliverable, patchDeliverable, deleteDeliverable, rebalance, bulkAssign,
    uploadAttachment, deleteAttachment, openAttachment, importLegacy,
    addTask, patchTask, deleteTask, addUpdate, deleteUpdate, requestMoreTime,
    notifications, unreadCount, markRead, markAllRead, alertsPermission, enableAlerts,
    weightChange, requestWeightChange, closeWeightChange, applyWeights,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
