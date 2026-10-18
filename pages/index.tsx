import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Lock,
  Users,
  Check,
  X,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  Code2,
  Globe,
  Cpu,
  FileText,
  Presentation,
  BookOpen,
  Copy,
  Download,
  Upload,
  RotateCcw,
  Sun,
  Moon,
  Paperclip,
  HardDrive,
  Edit3,
  Layers,
  KeyRound,
  Eye,
  LogOut,
  LogIn,
  HelpCircle,
  UserCheck
} from 'lucide-react';

type DeliverableType =
  | 'App'
  | 'Website'
  | 'Logisim Project'
  | 'Report'
  | 'PPT'
  | 'Research Paper'
  | 'Custom';

type TaskStatus = 'in_progress' | 'pending' | 'approved';

interface TeamMember {
  id: string;
  name: string;
  loginId: string;
  passkey: string;
  role: string;
}

interface AttachedFileMeta {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  uploadedAt: string;
}

interface Deliverable {
  id: string;
  type: DeliverableType;
  title: string;
  weight: number;
  assignee: string; // '' = Unassigned, or 'm1' | 'm2' | 'm3' | 'm4'
  status: TaskStatus;
  workMade: string;
  proof: string;
  attachedFile?: AttachedFileMeta | null;
  feedback: string;
  updatedAt: string;
}

interface SubjectProject {
  code: string;
  name: string;
  topic: string;
  deadline: string;
  leadId: string;
  deliverables: Deliverable[];
}

interface AppState {
  appName: string;
  theme: 'dark' | 'light';
  adminLoginId: string;
  adminPasskey: string;
  members: TeamMember[];
  projects: SubjectProject[];
}

const STORAGE_KEY = 'college_team_tracker_v5_auth';

const STANDARD_DELIVERABLES: { type: DeliverableType; defaultTitle: string }[] = [
  { type: 'App', defaultTitle: 'Application Build' },
  { type: 'Website', defaultTitle: 'Website Build' },
  { type: 'Logisim Project', defaultTitle: 'Logisim Circuit (.circ)' },
  { type: 'Report', defaultTitle: 'Project Report' },
  { type: 'PPT', defaultTitle: 'Presentation (PPT)' },
  { type: 'Research Paper', defaultTitle: 'Research Paper' }
];

function rebalanceDeliverableWeights(deliverables: Deliverable[]): Deliverable[] {
  const count = deliverables.length;
  if (count === 0) return [];
  const base = Math.floor(100 / count);
  const rem = 100 - base * count;
  return deliverables.map((d, idx) => ({
    ...d,
    weight: idx === 0 ? base + rem : base
  }));
}

function createInitialState(): AppState {
  return {
    appName: 'ProjectTrack',
    theme: 'light',
    adminLoginId: 'admin.ayush',
    adminPasskey: 'ADMIN-2026',
    members: [
      {
        id: 'm1',
        name: 'Ayush Borade',
        loginId: 'ayush',
        passkey: 'AYUSH-101',
        role: 'Group Leader & Member'
      },
      {
        id: 'm2',
        name: 'Shriman Boralkar',
        loginId: 'shriman',
        passkey: 'SHRIMAN-202',
        role: 'Team Member'
      },
      {
        id: 'm3',
        name: 'Unnati Borate',
        loginId: 'unnati',
        passkey: 'UNNATI-303',
        role: 'Team Member'
      },
      {
        id: 'm4',
        name: 'Kunal Chatla',
        loginId: 'kunal',
        passkey: 'KUNAL-404',
        role: 'Team Member'
      }
    ],
    projects: [
      {
        code: 'EDI',
        name: 'Engineering Design & Innovation',
        topic: '',
        deadline: '',
        leadId: '',
        deliverables: []
      },
      {
        code: 'FODS',
        name: 'Foundations of Data Science',
        topic: '',
        deadline: '',
        leadId: '',
        deliverables: []
      },
      {
        code: 'DSAM',
        name: 'Digital Systems & Microprocessors',
        topic: '',
        deadline: '',
        leadId: '',
        deliverables: []
      },
      {
        code: 'DM',
        name: 'Discrete Mathematics',
        topic: '',
        deadline: '',
        leadId: '',
        deliverables: []
      },
      {
        code: 'OOPS',
        name: 'Object-Oriented Programming',
        topic: '',
        deadline: '',
        leadId: '',
        deliverables: []
      },
      {
        code: 'DBMS',
        name: 'Database Management Systems',
        topic: '',
        deadline: '',
        leadId: '',
        deliverables: []
      }
    ]
  };
}

function TypeIcon({ type }: { type: DeliverableType }) {
  switch (type) {
    case 'App':
      return <Code2 className="w-3.5 h-3.5 opacity-75" />;
    case 'Website':
      return <Globe className="w-3.5 h-3.5 opacity-75" />;
    case 'Logisim Project':
      return <Cpu className="w-3.5 h-3.5 opacity-75" />;
    case 'Report':
      return <FileText className="w-3.5 h-3.5 opacity-75" />;
    case 'PPT':
      return <Presentation className="w-3.5 h-3.5 opacity-75" />;
    case 'Research Paper':
      return <BookOpen className="w-3.5 h-3.5 opacity-75" />;
    default:
      return <Layers className="w-3.5 h-3.5 opacity-75" />;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.members)) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return createInitialState();
  });

  // Two Separate Portals:
  // 'admin' = Ayush Borade (Admin Authority)
  // 'member' = Logged-in Member Session (can only edit their own assigned tasks; spectator for all others)
  const [portalMode, setPortalMode] = useState<'admin' | 'member'>('admin');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(true);
  const [loggedInMemberId, setLoggedInMemberId] = useState<string | null>('m1'); // Default Ayush when switching from Admin

  // Full-Page Login Screen state (opens as the First Page on launch)
  const [loginModal, setLoginModal] = useState<{
    open: boolean;
    targetPortal: 'admin' | 'member';
    loginId: string;
    passkey: string;
    error: string;
  }>({
    open: true,
    targetPortal: 'member',
    loginId: 'ayush',
    passkey: '',
    error: ''
  });

  const [activeTab, setActiveTab] = useState<
    'projects' | 'assign' | 'parameters' | 'approvals' | 'team' | 'guide' | 'storage'
  >('projects');
  const [activeSubject, setActiveSubject] = useState<string>('ALL');
  const [activeMemberView, setActiveMemberView] = useState<string>('ALL');
  const [editingAppName, setEditingAppName] = useState<boolean>(false);

  // Work & File Upload Modal
  const [workModal, setWorkModal] = useState<{
    open: boolean;
    projectCode: string;
    taskId: string;
    workMade: string;
    proof: string;
    attachedFile: AttachedFileMeta | null;
    markFinished: boolean;
    error: string;
  }>({
    open: false,
    projectCode: '',
    taskId: '',
    workMade: '',
    proof: '',
    attachedFile: null,
    markFinished: false,
    error: ''
  });

  const [customTitleBySubject, setCustomTitleBySubject] = useState<Record<string, string>>({});
  const [paramSubject, setParamSubject] = useState<string>('EDI');
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupJson, setBackupJson] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const isDark = state.theme === 'dark';
  const isAdmin = portalMode === 'admin' && isAdminAuthenticated;
  const activeMemberObj = state.members.find((m) => m.id === loggedInMemberId) || null;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const toggleTheme = () => {
    setState((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark'
    }));
  };

  const getMemberName = (id: string) => {
    if (!id) return 'Unassigned';
    const m = state.members.find((x) => x.id === id);
    return m ? m.name : 'Unassigned';
  };

  // Handle Login Submission (Separate Admin vs. Member Credentials)
  const handlePortalLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredId = loginModal.loginId.trim().toLowerCase();
    const enteredPass = loginModal.passkey.trim();

    if (loginModal.targetPortal === 'admin') {
      if (
        enteredId === state.adminLoginId.trim().toLowerCase() &&
        enteredPass === state.adminPasskey.trim()
      ) {
        setIsAdminAuthenticated(true);
        setPortalMode('admin');
        setLoggedInMemberId('m1'); // Ayush is also Member 1
        setLoginModal((prev) => ({ ...prev, open: false, error: '' }));
        notify('Logged into Admin Portal (Ayush Borade — Full Controls)');
      } else {
        setLoginModal((prev) => ({
          ...prev,
          error: 'Invalid Admin Login ID or Passkey.'
        }));
      }
    } else {
      const matchedMember = state.members.find(
        (m) =>
          m.loginId.trim().toLowerCase() === enteredId &&
          m.passkey.trim() === enteredPass
      );
      if (matchedMember) {
        setLoggedInMemberId(matchedMember.id);
        setPortalMode('member');
        if (['assign', 'parameters', 'approvals'].includes(activeTab)) {
          setActiveTab('projects');
        }
        setLoginModal((prev) => ({ ...prev, open: false, error: '' }));
        notify(`Logged in as ${matchedMember.name} (Member Portal)`);
      } else {
        setLoginModal((prev) => ({
          ...prev,
          error: 'Invalid Member Login ID or Passkey.'
        }));
      }
    }
  };

  // Check if current user is allowed to upload/mark a specific deliverable
  const canEditDeliverable = (project: SubjectProject, task: Deliverable): boolean => {
    if (isAdmin) return true;
    if (portalMode === 'member' && loggedInMemberId) {
      // Member can edit ONLY if this deliverable is assigned to them (or if they are Project Lead and task is assigned to them)
      return task.assignee === loggedInMemberId;
    }
    return false;
  };

  // Toggle standard deliverable ON/OFF for a subject (Admin only)
  const handleToggleSubjectDeliverable = (
    projectCode: string,
    type: DeliverableType,
    defaultTitle: string
  ) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.code !== projectCode) return p;
        const exists = p.deliverables.some((d) => d.type === type);
        let nextList: Deliverable[];
        if (exists) {
          nextList = p.deliverables.filter((d) => d.type !== type);
        } else {
          nextList = [
            ...p.deliverables,
            {
              id: `${projectCode.toLowerCase()}_${type.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
              type,
              title: `${projectCode} ${defaultTitle}`,
              weight: 0,
              assignee: '',
              status: 'in_progress',
              workMade: '',
              proof: '',
              attachedFile: null,
              feedback: '',
              updatedAt: ''
            }
          ];
        }
        return {
          ...p,
          deliverables: rebalanceDeliverableWeights(nextList)
        };
      })
    }));
  };

  const handleAddCustomDeliverableToSubject = (projectCode: string) => {
    if (!isAdmin) return;
    const rawTitle = (customTitleBySubject[projectCode] || '').trim();
    if (!rawTitle) {
      notify('Type a custom deliverable name first');
      return;
    }
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.code !== projectCode) return p;
        const nextList: Deliverable[] = [
          ...p.deliverables,
          {
            id: `${projectCode.toLowerCase()}_custom_${Date.now()}`,
            type: 'Custom',
            title: rawTitle,
            weight: 0,
            assignee: '',
            status: 'in_progress',
            workMade: '',
            proof: '',
            attachedFile: null,
            feedback: '',
            updatedAt: ''
          }
        ];
        return {
          ...p,
          deliverables: rebalanceDeliverableWeights(nextList)
        };
      })
    }));
    setCustomTitleBySubject((prev) => ({ ...prev, [projectCode]: '' }));
    notify(`Added "${rawTitle}" to ${projectCode}`);
  };

  const handleDeleteDeliverableFromSubject = (projectCode: string, taskId: string) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.code !== projectCode) return p;
        const nextList = p.deliverables.filter((d) => d.id !== taskId);
        return {
          ...p,
          deliverables: rebalanceDeliverableWeights(nextList)
        };
      })
    }));
    notify(`Removed deliverable from ${projectCode}`);
  };

  const handleAssignLead = (projectCode: string, memberId: string) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.code === projectCode ? { ...p, leadId: memberId } : p
      )
    }));
    notify(
      memberId
        ? `Assigned ${getMemberName(memberId)} as Project Lead for ${projectCode}`
        : `Cleared Project Lead for ${projectCode}`
    );
  };

  const handleAssignTask = (projectCode: string, taskId: string, memberId: string) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.code === projectCode
          ? {
              ...p,
              deliverables: p.deliverables.map((d) =>
                d.id === taskId ? { ...d, assignee: memberId } : d
              )
            }
          : p
      )
    }));
    notify(
      memberId
        ? `Assigned deliverable to ${getMemberName(memberId)}`
        : 'Deliverable set to Unassigned'
    );
  };

  const handleBulkAssignProjectToMember = (projectCode: string, memberId: string) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.code === projectCode
          ? {
              ...p,
              leadId: memberId,
              deliverables: p.deliverables.map((d) => ({
                ...d,
                assignee: memberId
              }))
            }
          : p
      )
    }));
    if (memberId) {
      notify(`Assigned all ${projectCode} tasks to ${getMemberName(memberId)}`);
    }
  };

  const handleUpdateWeight = (projectCode: string, taskId: string, newWeight: number) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.code === projectCode
          ? {
              ...p,
              deliverables: p.deliverables.map((d) =>
                d.id === taskId ? { ...d, weight: Math.max(0, Math.min(100, newWeight)) } : d
              )
            }
          : p
      )
    }));
  };

  const handleUpdateProjectMeta = (
    projectCode: string,
    field: 'topic' | 'deadline' | 'name',
    value: string
  ) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.code === projectCode ? { ...p, [field]: value } : p
      )
    }));
  };

  const handleVerifyTask = (
    projectCode: string,
    taskId: string,
    decision: 'approve' | 'reject' | 'revoke'
  ) => {
    if (!isAdmin) return;
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.code === projectCode
          ? {
              ...p,
              deliverables: p.deliverables.map((d) => {
                if (d.id !== taskId) return d;
                if (decision === 'approve') {
                  return { ...d, status: 'approved', feedback: '' };
                }
                if (decision === 'reject') {
                  return {
                    ...d,
                    status: 'in_progress',
                    feedback: 'Admin (Ayush) requested changes or proof before confirming.'
                  };
                }
                return { ...d, status: 'in_progress' };
              })
            }
          : p
      )
    }));
    if (decision === 'approve') notify(`Confirmed ${projectCode} work — percentage unlocked`);
    if (decision === 'reject') notify(`Returned ${projectCode} task to member for revision`);
    if (decision === 'revoke') notify(`Revoked confirmation for ${projectCode} task`);
  };

  const openWorkModal = (project: SubjectProject, task: Deliverable) => {
    if (!canEditDeliverable(project, task)) {
      notify('Spectator Mode: You can only upload or mark tasks assigned to you.');
      return;
    }
    setWorkModal({
      open: true,
      projectCode: project.code,
      taskId: task.id,
      workMade: task.workMade || '',
      proof: task.proof || '',
      attachedFile: task.attachedFile || null,
      markFinished: task.status === 'pending' || task.status === 'approved',
      error: ''
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setWorkModal((prev) => ({
        ...prev,
        error: 'File exceeds 2.5 MB browser limit. Paste a Google Drive or GitHub link below for larger files.'
      }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setWorkModal((prev) => ({
        ...prev,
        attachedFile: {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl: result,
          uploadedAt: new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short'
          })
        },
        error: ''
      }));
    };
    reader.readAsDataURL(file);
  };

  const saveWorkModal = () => {
    if (workModal.markFinished && !workModal.workMade.trim() && !workModal.attachedFile) {
      setWorkModal((prev) => ({
        ...prev,
        error: 'Write what you have made till now or attach a file before marking finished.'
      }));
      return;
    }

    const nowStr = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    });

    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.code !== workModal.projectCode) return p;
        return {
          ...p,
          deliverables: p.deliverables.map((d) => {
            if (d.id !== workModal.taskId) return d;
            let nextStatus: TaskStatus = 'in_progress';
            if (workModal.markFinished) {
              // In Member Portal, marking finished ALWAYS goes to 'pending' so Admin must confirm it!
              nextStatus = isAdmin
                ? 'approved'
                : d.status === 'approved'
                ? 'approved'
                : 'pending';
            }
            return {
              ...d,
              workMade: workModal.workMade.trim(),
              proof: workModal.proof.trim(),
              attachedFile: workModal.attachedFile,
              status: nextStatus,
              feedback: workModal.markFinished ? '' : d.feedback,
              updatedAt: nowStr
            };
          })
        };
      })
    }));

    setWorkModal((prev) => ({ ...prev, open: false }));
    notify(
      workModal.markFinished
        ? isAdmin
          ? 'Work saved & confirmed by Admin'
          : 'Submitted! Waiting for Admin (Ayush Borade) to confirm work is done.'
        : 'Work progress saved'
    );
  };

  // Telemetry & Stats
  const stats = useMemo(() => {
    let totalVerifiedPct = 0;
    let totalPendingPct = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let totalDeliverables = 0;
    let unassignedCount = 0;
    let attachedFilesCount = 0;

    const pendingItems: { project: SubjectProject; task: Deliverable }[] = [];
    const allAttachedFiles: {
      projectCode: string;
      taskTitle: string;
      assigneeName: string;
      file: AttachedFileMeta;
      proofUrl: string;
    }[] = [];

    const memberMap: Record<
      string,
      {
        assignedCount: number;
        verifiedCount: number;
        pendingCount: number;
        leadSubjects: string[];
      }
    > = {};

    state.members.forEach((m) => {
      memberMap[m.id] = {
        assignedCount: 0,
        verifiedCount: 0,
        pendingCount: 0,
        leadSubjects: []
      };
    });

    state.projects.forEach((p) => {
      if (p.leadId && memberMap[p.leadId]) {
        memberMap[p.leadId].leadSubjects.push(p.code);
      }
      let pVerified = 0;
      let pPending = 0;
      p.deliverables.forEach((d) => {
        totalDeliverables++;
        if (d.attachedFile) {
          attachedFilesCount++;
          allAttachedFiles.push({
            projectCode: p.code,
            taskTitle: d.title,
            assigneeName: getMemberName(d.assignee),
            file: d.attachedFile,
            proofUrl: d.proof
          });
        }
        if (!d.assignee) {
          unassignedCount++;
        } else if (memberMap[d.assignee]) {
          memberMap[d.assignee].assignedCount++;
          if (d.status === 'approved') memberMap[d.assignee].verifiedCount++;
          if (d.status === 'pending') memberMap[d.assignee].pendingCount++;
        }

        if (d.status === 'approved') {
          pVerified += Number(d.weight) || 0;
          approvedCount++;
        } else if (d.status === 'pending') {
          pPending += Number(d.weight) || 0;
          pendingCount++;
          pendingItems.push({ project: p, task: d });
        }
      });
      totalVerifiedPct += pVerified;
      totalPendingPct += pPending;
    });

    const overallVerified = state.projects.length
      ? Math.round(totalVerifiedPct / state.projects.length)
      : 0;
    const overallPending = state.projects.length
      ? Math.round(totalPendingPct / state.projects.length)
      : 0;

    return {
      overallVerified,
      overallPending,
      pendingCount,
      approvedCount,
      totalDeliverables,
      unassignedCount,
      attachedFilesCount,
      allAttachedFiles,
      pendingItems,
      memberMap
    };
  }, [state]);

  const copySummaryReport = () => {
    const lines: string[] = [];
    lines.push(`${state.appName.toUpperCase()} — TEAM STATUS REPORT`);
    lines.push('----------------------------------------');
    state.projects.forEach((p) => {
      const verified = p.deliverables
        .filter((d) => d.status === 'approved')
        .reduce((a, b) => a + Number(b.weight), 0);
      const pending = p.deliverables
        .filter((d) => d.status === 'pending')
        .reduce((a, b) => a + Number(b.weight), 0);
      const lead = p.leadId ? getMemberName(p.leadId) : 'Unassigned';
      lines.push(
        `[${p.code}] ${p.name} — Confirmed: ${verified}% | Pending Admin: +${pending}% | Lead: ${lead}`
      );
    });
    lines.push('----------------------------------------');
    lines.push(`Overall Confirmed Completion: ${stats.overallVerified}%`);
    try {
      navigator.clipboard.writeText(lines.join('\n'));
      notify('Copied status report to clipboard');
    } catch {
      notify('Report ready');
    }
  };

  // Theme Classes
  const bgMain = isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-[#F8FAFC] text-slate-900';
  const bgHeader = isDark
    ? 'bg-[#09090B]/95 border-zinc-800'
    : 'bg-white/95 border-slate-200';
  const bgCard = isDark
    ? 'bg-[#0E0E12] border-zinc-800/90'
    : 'bg-white border-slate-200 shadow-2xs';
  const bgSubtle = isDark
    ? 'bg-[#141419] border-zinc-800'
    : 'bg-slate-50 border-slate-200';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';
  const textFaint = isDark ? 'text-zinc-500' : 'text-slate-400';
  const inputCls = isDark
    ? 'bg-[#141419] border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400';

  const visibleProjects = state.projects.filter(
    (p) => activeSubject === 'ALL' || p.code === activeSubject
  );

  const currentParamProject =
    state.projects.find((p) => p.code === paramSubject) || state.projects[0];
  const currentParamWeightSum = currentParamProject.deliverables.reduce(
    (acc, d) => acc + (Number(d.weight) || 0),
    0
  );

  return (
    <div className={`min-h-screen flex flex-col font-sans antialiased transition-colors duration-200 ${bgMain}`}>
      {/* TOP NAVIGATION BAR */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${bgHeader}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* App Brand + Active Session Badge */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs tracking-tight ${
                  isDark ? 'bg-zinc-100 text-zinc-950' : 'bg-slate-900 text-white'
                }`}
              >
                PT
              </div>
              {editingAppName && isAdmin ? (
                <input
                  type="text"
                  autoFocus
                  value={state.appName}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, appName: e.target.value }))
                  }
                  onBlur={() => setEditingAppName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingAppName(false);
                  }}
                  className={`px-2 py-0.5 text-sm font-semibold rounded border focus:outline-none w-40 ${inputCls}`}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => isAdmin && setEditingAppName(true)}
                  className="flex items-center gap-1.5 font-semibold text-sm tracking-tight hover:opacity-80"
                  title={isAdmin ? 'Click to rename app' : ''}
                >
                  <span>{state.appName || 'ProjectTrack'}</span>
                  {isAdmin && <Edit3 className="w-3 h-3 opacity-50" />}
                </button>
              )}
            </div>

            {/* Primary Navigation Links */}
            <nav className="hidden xl:flex items-center gap-1">
              {[
                { id: 'projects', label: 'Projects (6)', adminOnly: false },
                { id: 'assign', label: 'Assign Matrix', adminOnly: true },
                { id: 'parameters', label: 'Weights', adminOnly: true },
                {
                  id: 'approvals',
                  label: `Confirm Queue (${stats.pendingCount})`,
                  adminOnly: true
                },
                { id: 'team', label: 'Team & Passkeys (4)', adminOnly: false },
                { id: 'guide', label: 'How to Use', adminOnly: false },
                {
                  id: 'storage',
                  label: `Files (${stats.attachedFilesCount})`,
                  adminOnly: false
                }
              ]
                .filter((t) => !t.adminOnly || isAdmin)
                .map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                        active
                          ? isDark
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'bg-slate-200/80 text-slate-900 font-semibold'
                          : `${textMuted} hover:opacity-100`
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
            </nav>
          </div>

          {/* TWO SEPARATE PORTAL CONTROLS: ADMIN PORTAL vs. MEMBER PORTAL */}
          <div className="flex items-center gap-2">
            {/* Active Identity Indicator */}
            <div className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${bgSubtle}`}>
              {isAdmin ? (
                <>
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-semibold">
                    Admin: Ayush Borade
                  </span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-sky-500" />
                  <span className="font-semibold">
                    User: {activeMemberObj ? activeMemberObj.name : 'Not Logged In'}
                  </span>
                </>
              )}
            </div>

            {/* Dual Portal Switcher */}
            <div className={`inline-flex rounded-md p-0.5 border ${bgSubtle}`}>
              <button
                type="button"
                onClick={() => {
                  setLoginModal({
                    open: true,
                    targetPortal: 'member',
                    loginId: activeMemberObj?.loginId || 'ayush',
                    passkey: '',
                    error: ''
                  });
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 ${
                  portalMode === 'member'
                    ? isDark
                      ? 'bg-zinc-800 text-white'
                      : 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : textMuted
                }`}
              >
                <Lock className="w-3 h-3" />
                <span>Member Login</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isAdmin) return;
                  setLoginModal({
                    open: true,
                    targetPortal: 'admin',
                    loginId: state.adminLoginId,
                    passkey: '',
                    error: ''
                  });
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 ${
                  isAdmin
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : textMuted
                }`}
              >
                <Shield className="w-3 h-3" />
                <span>Admin Portal</span>
              </button>
            </div>


            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`p-1.5 rounded-md border transition ${bgSubtle} hover:opacity-80`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>
        </div>

        {/* Secondary Tab Bar for smaller screens */}
        <div className={`flex xl:hidden items-center gap-1 px-4 py-2 border-t overflow-x-auto ${isDark ? 'border-zinc-900' : 'border-slate-200'}`}>
          {[
            { id: 'projects', label: 'Projects (6)', adminOnly: false },
            { id: 'assign', label: 'Assign Matrix', adminOnly: true },
            { id: 'parameters', label: 'Weights', adminOnly: true },
            { id: 'approvals', label: `Confirm (${stats.pendingCount})`, adminOnly: true },
            { id: 'team', label: 'Team & Passkeys', adminOnly: false },
            { id: 'guide', label: 'How to Use', adminOnly: false },
            { id: 'storage', label: `Files (${stats.attachedFilesCount})`, adminOnly: false }
          ]
            .filter((t) => !t.adminOnly || isAdmin)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 ${
                  activeTab === tab.id
                    ? isDark
                      ? 'bg-zinc-800 text-white'
                      : 'bg-slate-900 text-white'
                    : textMuted
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-7 space-y-7">
        {/* ACTIVE ROLE STATUS BANNER */}
        <div className={`border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 ${bgCard}`}>
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                isAdmin
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                  : 'bg-sky-500/15 text-sky-500 border border-sky-500/30'
              }`}
            >
              {isAdmin ? 'ADM' : 'USR'}
            </div>
            <div>
              {isAdmin ? (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      Admin Portal Active — Ayush Borade (Group Leader)
                    </h2>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold">
                      FULL AUTHORITY
                    </span>
                  </div>
                  <p className={`text-xs ${textMuted}`}>
                    You can configure deliverables for each subject, assign tasks to Ayush, Shriman, Unnati, and Kunal, update their Login IDs &amp; Passkeys, and confirm completed work.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      Member Portal — Logged in as {activeMemberObj?.name} (ID: {activeMemberObj?.loginId})
                    </h2>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-500 font-semibold">
                      OWNER EDIT / SPECTATOR FOR OTHERS
                    </span>
                  </div>
                  <p className={`text-xs ${textMuted}`}>
                    You can upload work and mark tasks finished <strong>only for deliverables assigned to {activeMemberObj?.name}</strong>. For all other tasks, you are in read-only Spectator Mode.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAdmin && (
              <button
                type="button"
                onClick={() =>
                  setLoginModal({
                    open: true,
                    targetPortal: 'member',
                    loginId: '',
                    passkey: '',
                    error: ''
                  })
                }
                className={`px-3 py-1.5 rounded-md text-xs font-medium border ${bgSubtle}`}
              >
                Switch Member Account
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${bgSubtle}`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>How to Use</span>
            </button>
          </div>
        </div>

        {/* TELEMETRY METRICS STRIP */}
        <section className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border rounded-xl divide-y sm:divide-y-0 sm:divide-x overflow-hidden ${bgCard} ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
          <div className="p-5 flex flex-col justify-between">
            <div className={`flex items-center justify-between text-xs font-mono ${textFaint}`}>
              <span>[01] CONFIRMED COMPLETION</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight font-mono">
                {stats.overallVerified}%
              </span>
              <span className={`text-xs font-mono ${textMuted}`}>
                {stats.approvedCount}/{stats.totalDeliverables} confirmed
              </span>
            </div>
            <div className={`w-full h-1.5 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-zinc-900' : 'bg-slate-100'}`}>
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${stats.overallVerified}%` }}
              />
            </div>
          </div>

          <div className="p-5 flex flex-col justify-between">
            <div className={`flex items-center justify-between text-xs font-mono ${textFaint}`}>
              <span>[02] WAITING ADMIN CONFIRMATION</span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight font-mono">
                {stats.pendingCount}
              </span>
              <span className="text-xs font-mono text-amber-500 font-medium">
                +{stats.overallPending}% pending
              </span>
            </div>
            <p className={`text-[11px] mt-3 ${textMuted}`}>
              Requires Admin (Ayush) confirmation to unlock %
            </p>
          </div>

          <div className="p-5 flex flex-col justify-between">
            <div className={`flex items-center justify-between text-xs font-mono ${textFaint}`}>
              <span>[03] DELIVERABLES CONFIGURED</span>
              <Layers className="w-3.5 h-3.5 opacity-60" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight font-mono">
                {stats.totalDeliverables}
              </span>
              <span className={`text-xs font-mono ${textMuted}`}>
                {stats.unassignedCount} unassigned
              </span>
            </div>
            <p className={`text-[11px] mt-3 ${textMuted}`}>
              Across EDI, FODS, DSAM, DM, OOPS, DBMS
            </p>
          </div>

          <div className="p-5 flex flex-col justify-between">
            <div className={`flex items-center justify-between text-xs font-mono ${textFaint}`}>
              <span>[04] TEAM PROGRESS</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('team')}
                  className="text-[11px] text-emerald-500 hover:underline font-sans font-medium"
                >
                  IDs &amp; Passkeys
                </button>
              )}
            </div>
            <div className="mt-2.5 space-y-1">
              {state.members.map((m) => {
                const mStat = stats.memberMap[m.id];
                return (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="truncate pr-2 font-medium">{m.name}</span>
                    <span className={`font-mono text-[11px] shrink-0 ${textMuted}`}>
                      {mStat.verifiedCount}/{mStat.assignedCount} done
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* TAB 1: 6 PROJECTS & DELIVERABLE SETUP */}
        {activeTab === 'projects' && (
          <section className="space-y-6">
            {/* Subject Filter Bar */}
            <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-4 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                {['ALL', 'EDI', 'FODS', 'DSAM', 'DM', 'OOPS', 'DBMS'].map((code) => {
                  const active = activeSubject === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setActiveSubject(code)}
                      className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition border ${
                        active
                          ? isDark
                            ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold'
                            : 'bg-slate-900 text-white border-slate-900 font-semibold'
                          : `${bgCard} ${textMuted} hover:opacity-100`
                      }`}
                    >
                      {code === 'ALL' ? 'ALL 6 SUBJECTS' : code}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={activeMemberView}
                  onChange={(e) => setActiveMemberView(e.target.value)}
                  className={`border rounded-md px-3 py-1.5 text-xs focus:outline-none ${inputCls}`}
                >
                  <option value="ALL">Show Tasks: All 4 Members</option>
                  {!isAdmin && activeMemberObj && (
                    <option value={activeMemberObj.id}>
                      Only My Assigned Tasks ({activeMemberObj.name})
                    </option>
                  )}
                  <option value="UNASSIGNED">Unassigned Only</option>
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      Assigned to: {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6 Subject Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {visibleProjects.map((project) => {
                const verifiedPct = project.deliverables
                  .filter((d) => d.status === 'approved')
                  .reduce((a, b) => a + (Number(b.weight) || 0), 0);
                const pendingPct = project.deliverables
                  .filter((d) => d.status === 'pending')
                  .reduce((a, b) => a + (Number(b.weight) || 0), 0);
                const weightSum = project.deliverables.reduce(
                  (a, b) => a + (Number(b.weight) || 0),
                  0
                );

                const filteredDeliverables = project.deliverables.filter((d) => {
                  if (activeMemberView === 'ALL') return true;
                  if (activeMemberView === 'UNASSIGNED') return !d.assignee;
                  return d.assignee === activeMemberView;
                });

                return (
                  <div
                    key={project.code}
                    className={`border rounded-xl flex flex-col justify-between overflow-hidden transition ${bgCard}`}
                  >
                    {/* Card Header */}
                    <div className={`p-5 border-b space-y-4 ${isDark ? 'border-zinc-800/80' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                                isDark
                                  ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                                  : 'bg-slate-100 text-slate-900 border-slate-300'
                              }`}
                            >
                              {project.code}
                            </span>
                            <h3 className="text-base font-semibold tracking-tight">
                              {project.name}
                            </h3>
                          </div>

                          {/* Topic & Deadline */}
                          {isAdmin ? (
                            <div className="pt-2 grid grid-cols-1 sm:grid-cols-12 gap-2">
                              <input
                                type="text"
                                value={project.topic}
                                onChange={(e) =>
                                  handleUpdateProjectMeta(
                                    project.code,
                                    'topic',
                                    e.target.value
                                  )
                                }
                                placeholder={`Enter ${project.code} project topic...`}
                                className={`sm:col-span-8 border rounded-md px-2.5 py-1.5 text-xs focus:outline-none ${inputCls}`}
                              />
                              <input
                                type="date"
                                value={project.deadline}
                                onChange={(e) =>
                                  handleUpdateProjectMeta(
                                    project.code,
                                    'deadline',
                                    e.target.value
                                  )
                                }
                                className={`sm:col-span-4 border rounded-md px-2.5 py-1.5 text-xs font-mono focus:outline-none ${inputCls}`}
                              />
                            </div>
                          ) : (
                            <div className={`pt-1 flex flex-wrap items-center gap-3 text-xs ${textMuted}`}>
                              <span>
                                Topic:{' '}
                                <strong className={isDark ? 'text-zinc-200' : 'text-slate-800'}>
                                  {project.topic || 'Not set by Admin yet'}
                                </strong>
                              </span>
                              {project.deadline && (
                                <span className="font-mono text-[11px]">
                                  Due: {project.deadline}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Official Confirmed % */}
                        <div className="text-right shrink-0">
                          <div className="font-mono text-2xl font-bold text-emerald-500">
                            {verifiedPct}%
                          </div>
                          <span className={`font-mono text-[10px] uppercase tracking-wider ${textFaint}`}>
                            CONFIRMED
                          </span>
                        </div>
                      </div>

                      {/* Project Lead + 1-Click Assign Entire Project */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-mono text-[11px] ${textFaint}`}>
                            PROJECT LEAD:
                          </span>
                          {isAdmin ? (
                            <select
                              value={project.leadId}
                              onChange={(e) =>
                                handleAssignLead(project.code, e.target.value)
                              }
                              className={`border rounded-md px-2.5 py-1 text-xs font-medium focus:outline-none ${inputCls}`}
                            >
                              <option value="">— Assign Lead —</option>
                              {state.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-medium">
                              {getMemberName(project.leadId)}
                            </span>
                          )}
                        </div>

                        {isAdmin && project.deliverables.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleBulkAssignProjectToMember(
                                    project.code,
                                    e.target.value
                                  );
                                }
                              }}
                              className={`border rounded-md px-2 py-1 text-[11px] focus:outline-none ${inputCls}`}
                            >
                              <option value="">Assign all {project.code} tasks to...</option>
                              {state.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* ADMIN DELIVERABLE SELECTOR BAR */}
                      {isAdmin && (
                        <div className={`p-3 rounded-lg border space-y-2 ${bgSubtle}`}>
                          <div className="flex items-center justify-between">
                            <span className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>
                              Toggle what {project.code} requires (App, Website, Logisim, Report, PPT, Paper):
                            </span>
                            {project.deliverables.length > 0 && weightSum !== 100 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setState((prev) => ({
                                    ...prev,
                                    projects: prev.projects.map((p) =>
                                      p.code === project.code
                                        ? {
                                            ...p,
                                            deliverables: rebalanceDeliverableWeights(
                                              p.deliverables
                                            )
                                          }
                                        : p
                                    )
                                  }))
                                }
                                className="text-[10px] font-mono text-amber-500 underline"
                              >
                                Sum={weightSum}% (Reset to 100%)
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {STANDARD_DELIVERABLES.map((item) => {
                              const active = project.deliverables.some(
                                (d) => d.type === item.type
                              );
                              return (
                                <button
                                  key={item.type}
                                  type="button"
                                  onClick={() =>
                                    handleToggleSubjectDeliverable(
                                      project.code,
                                      item.type,
                                      item.defaultTitle
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition flex items-center gap-1 ${
                                    active
                                      ? 'bg-emerald-500 text-zinc-950 border-emerald-500 font-semibold'
                                      : `${bgCard} ${textMuted} hover:opacity-100`
                                  }`}
                                >
                                  {active ? (
                                    <Check className="w-3 h-3 stroke-[2.5]" />
                                  ) : (
                                    <Plus className="w-3 h-3" />
                                  )}
                                  <span>{item.type}</span>
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="text"
                              value={customTitleBySubject[project.code] || ''}
                              onChange={(e) =>
                                setCustomTitleBySubject((prev) => ({
                                  ...prev,
                                  [project.code]: e.target.value
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddCustomDeliverableToSubject(project.code);
                                }
                              }}
                              placeholder="Or add custom deliverable (e.g. Microprocessor Lab, Synopsis)..."
                              className={`flex-1 border rounded px-2.5 py-1 text-xs focus:outline-none ${inputCls}`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleAddCustomDeliverableToSubject(project.code)
                              }
                              className={`px-2.5 py-1 rounded text-xs font-medium border ${bgCard} hover:opacity-90`}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className={`w-full h-1.5 rounded-full overflow-hidden flex ${isDark ? 'bg-zinc-900' : 'bg-slate-100'}`}>
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${verifiedPct}%` }}
                          />
                          <div
                            className="h-full bg-amber-400 transition-all duration-300"
                            style={{ width: `${pendingPct}%` }}
                          />
                        </div>
                        <div className={`flex items-center justify-between font-mono text-[10px] ${textFaint}`}>
                          <span>CONFIRMED: {verifiedPct}%</span>
                          <span>WAITING ADMIN CONFIRMATION: +{pendingPct}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Deliverables List Body */}
                    <div className={`divide-y flex-1 ${isDark ? 'divide-zinc-800/60' : 'divide-slate-100'}`}>
                      {project.deliverables.length === 0 ? (
                        <div className={`p-6 text-center text-xs ${textMuted}`}>
                          {isAdmin
                            ? `Click the deliverable buttons above (App, Website, Logisim Project, Report, PPT, Research Paper) to choose what ${project.code} requires.`
                            : `Admin (Ayush Borade) has not configured deliverables for ${project.code} yet.`}
                        </div>
                      ) : filteredDeliverables.length === 0 ? (
                        <div className={`p-6 text-center text-xs ${textMuted}`}>
                          No tasks match the selected member filter.
                        </div>
                      ) : (
                        filteredDeliverables.map((task) => {
                          const editableByCurrentUser = canEditDeliverable(
                            project,
                            task
                          );
                          return (
                            <div
                              key={task.id}
                              className="p-4 space-y-2.5 transition"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <TypeIcon type={task.type} />
                                  <span
                                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${bgSubtle}`}
                                  >
                                    {task.type}
                                  </span>
                                  <span className="text-xs sm:text-sm font-medium">
                                    {task.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isAdmin && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={5}
                                        max={100}
                                        step={5}
                                        value={task.weight}
                                        onChange={(e) =>
                                          handleUpdateWeight(
                                            project.code,
                                            task.id,
                                            Number(e.target.value)
                                          )
                                        }
                                        className={`w-14 border rounded px-1.5 py-0.5 text-xs font-mono text-right focus:outline-none ${inputCls}`}
                                        title="Deliverable Weight %"
                                      />
                                      <span className={`font-mono text-xs ${textFaint}`}>
                                        %
                                      </span>
                                    </div>
                                  )}

                                  {task.status === 'approved' ? (
                                    <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-semibold">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Confirmed (+{task.weight}%)</span>
                                    </span>
                                  ) : task.status === 'pending' ? (
                                    <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold">
                                      <Clock className="w-3 h-3" />
                                      <span>Pending Admin (+{task.weight}%)</span>
                                    </span>
                                  ) : (
                                    !isAdmin && (
                                      <span className={`font-mono text-[11px] px-2 py-0.5 rounded border ${bgSubtle}`}>
                                        {task.weight}% Weight
                                      </span>
                                    )
                                  )}

                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteDeliverableFromSubject(
                                          project.code,
                                          task.id
                                        )
                                      }
                                      className="p-1 text-zinc-500 hover:text-rose-500 transition"
                                      title="Remove this deliverable"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Work Made & Attached File Display */}
                              {(task.workMade ||
                                task.proof ||
                                task.attachedFile ||
                                task.feedback) && (
                                <div className={`border rounded-lg p-2.5 text-xs space-y-1.5 ${bgSubtle}`}>
                                  {task.workMade && (
                                    <p className="leading-relaxed">
                                      <span className={`font-mono text-[10px] uppercase mr-1.5 ${textFaint}`}>
                                        Work Made:
                                      </span>
                                      {task.workMade}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-3">
                                    {task.attachedFile && (
                                      <a
                                        href={task.attachedFile.dataUrl}
                                        download={task.attachedFile.name}
                                        className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-500 hover:underline font-medium"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span>
                                          {task.attachedFile.name} (
                                          {formatBytes(task.attachedFile.size)})
                                        </span>
                                      </a>
                                    )}
                                    {task.proof && (
                                      <span className={`font-mono text-[11px] truncate ${textMuted}`}>
                                        Link/Ref: {task.proof}
                                      </span>
                                    )}
                                  </div>
                                  {task.feedback && (
                                    <p className="text-[11px] text-rose-500 font-medium">
                                      {task.feedback}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Assignee & Actions Row */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                {isAdmin ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-mono text-[10px] ${textFaint}`}>
                                      ASSIGN TO:
                                    </span>
                                    <select
                                      value={task.assignee}
                                      onChange={(e) =>
                                        handleAssignTask(
                                          project.code,
                                          task.id,
                                          e.target.value
                                        )
                                      }
                                      className={`border rounded px-2 py-1 text-xs focus:outline-none ${inputCls}`}
                                    >
                                      <option value="">— Assign Member —</option>
                                      {state.members.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-xs font-mono ${
                                        editableByCurrentUser
                                          ? 'text-emerald-500 font-semibold'
                                          : textMuted
                                      }`}
                                    >
                                      Assigned to: {getMemberName(task.assignee)}
                                    </span>
                                  </div>
                                )}

                                {/* Controls: Either Editable (Owner / Admin) OR Spectator Badge */}
                                <div className="flex items-center gap-1.5">
                                  {editableByCurrentUser ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openWorkModal(project, task)
                                      }
                                      className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500 hover:text-zinc-950 transition"
                                    >
                                      {task.workMade || task.attachedFile
                                        ? 'Update Work / File'
                                        : 'Upload Work / Mark Done'}
                                    </button>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border ${bgSubtle} ${textFaint}`}
                                      title="Spectator Mode: Only the assigned member or Admin can upload or mark this task."
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Spectator Only</span>
                                    </span>
                                  )}

                                  {isAdmin && (
                                    <>
                                      {task.status !== 'approved' ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleVerifyTask(
                                              project.code,
                                              task.id,
                                              'approve'
                                            )
                                          }
                                          className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition"
                                        >
                                          Confirm Done +{task.weight}%
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleVerifyTask(
                                              project.code,
                                              task.id,
                                              'revoke'
                                            )
                                          }
                                          className={`px-2 py-1 rounded text-xs font-medium border transition ${bgSubtle} hover:text-rose-500`}
                                        >
                                          Revoke
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 2: ASSIGN MATRIX (Admin Only) */}
        {activeTab === 'assign' && isAdmin && (
          <section className="space-y-6">
            <div className={`border-b pb-4 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <h2 className="text-lg font-semibold">
                Assign Projects &amp; Deliverables to Ayush, Shriman, Unnati &amp; Kunal
              </h2>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                Toggle what each subject requires (App, Website, Logisim Project, Report, PPT, Research Paper) and assign who owns each part.
              </p>
            </div>

            <div className="space-y-4">
              {state.projects.map((p) => (
                <div key={p.code} className={`border rounded-xl p-5 space-y-4 ${bgCard}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${bgSubtle}`}>
                        {p.code}
                      </span>
                      <span className="font-semibold text-sm">{p.name}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {STANDARD_DELIVERABLES.map((item) => {
                        const active = p.deliverables.some(
                          (d) => d.type === item.type
                        );
                        return (
                          <button
                            key={item.type}
                            type="button"
                            onClick={() =>
                              handleToggleSubjectDeliverable(
                                p.code,
                                item.type,
                                item.defaultTitle
                              )
                            }
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition flex items-center gap-1 ${
                              active
                                ? 'bg-emerald-500 text-zinc-950 border-emerald-500 font-semibold'
                                : `${bgSubtle} ${textMuted}`
                            }`}
                          >
                            {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            <span>{item.type}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {p.deliverables.length === 0 ? (
                    <p className={`text-xs italic ${textMuted}`}>
                      Click the deliverable buttons above to add what {p.code} requires.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                      {p.deliverables.map((d) => (
                        <div
                          key={d.id}
                          className={`p-3 rounded-lg border space-y-2 flex flex-col justify-between ${bgSubtle}`}
                        >
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-semibold">{d.type}</span>
                            <span className="text-emerald-500 font-bold">
                              {d.weight}%
                            </span>
                          </div>
                          <select
                            value={d.assignee}
                            onChange={(e) =>
                              handleAssignTask(p.code, d.id, e.target.value)
                            }
                            className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none ${inputCls}`}
                          >
                            <option value="">— Assign Member —</option>
                            {state.members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: WEIGHTS CONFIG (Admin Only) */}
        {activeTab === 'parameters' && isAdmin && (
          <section className="max-w-3xl space-y-6">
            <div className={`border-b pb-4 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <h2 className="text-lg font-semibold">
                Subject Deliverable Weights &amp; Parameters
              </h2>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                Customize percentage weights per subject. Members cannot increase percentages by themselves.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {state.projects.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setParamSubject(p.code)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium border ${
                      paramSubject === p.code
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-500 font-bold'
                        : `${bgCard} ${textMuted}`
                    }`}
                  >
                    {p.code}
                  </button>
                ))}
              </div>

              {currentParamProject.deliverables.length > 0 && (
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs px-2.5 py-1 rounded border ${
                      currentParamWeightSum === 100
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                    }`}
                  >
                    Total: {currentParamWeightSum}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        projects: prev.projects.map((p) =>
                          p.code === paramSubject
                            ? {
                                ...p,
                                deliverables: rebalanceDeliverableWeights(
                                  p.deliverables
                                )
                              }
                            : p
                        )
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-xs font-mono border ${bgSubtle}`}
                  >
                    Auto-Split 100%
                  </button>
                </div>
              )}
            </div>

            <div className={`border rounded-xl p-5 space-y-4 ${bgCard}`}>
              <div>
                <label className={`block font-mono text-[10px] uppercase mb-1 ${textFaint}`}>
                  Subject Name ({currentParamProject.code})
                </label>
                <input
                  type="text"
                  value={currentParamProject.name}
                  onChange={(e) =>
                    handleUpdateProjectMeta(
                      currentParamProject.code,
                      'name',
                      e.target.value
                    )
                  }
                  className={`w-full border rounded-md px-3 py-1.5 text-xs focus:outline-none ${inputCls}`}
                />
              </div>

              <div className="space-y-2">
                <span className={`block font-mono text-[10px] uppercase ${textFaint}`}>
                  Toggle Deliverables for {currentParamProject.code}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_DELIVERABLES.map((item) => {
                    const active = currentParamProject.deliverables.some(
                      (d) => d.type === item.type
                    );
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() =>
                          handleToggleSubjectDeliverable(
                            currentParamProject.code,
                            item.type,
                            item.defaultTitle
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1 ${
                          active
                            ? 'bg-emerald-500 text-zinc-950 border-emerald-500 font-semibold'
                            : `${bgSubtle} ${textMuted}`
                        }`}
                      >
                        {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        <span>{item.type}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {currentParamProject.deliverables.length > 0 && (
                <div className="space-y-2 pt-2">
                  {currentParamProject.deliverables.map((d) => (
                    <div
                      key={d.id}
                      className={`p-3 rounded-lg border grid grid-cols-1 sm:grid-cols-12 gap-2 items-center ${bgSubtle}`}
                    >
                      <div className="sm:col-span-3 font-mono text-xs font-semibold">
                        {d.type}
                      </div>
                      <div className="sm:col-span-6">
                        <input
                          type="text"
                          value={d.title}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              projects: prev.projects.map((p) =>
                                p.code === paramSubject
                                  ? {
                                      ...p,
                                      deliverables: p.deliverables.map((x) =>
                                        x.id === d.id
                                          ? { ...x, title: e.target.value }
                                          : x
                                      )
                                    }
                                  : p
                              )
                            }))
                          }
                          className={`w-full border rounded px-2.5 py-1 text-xs ${inputCls}`}
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-1">
                        <input
                          type="number"
                          min={5}
                          max={100}
                          step={5}
                          value={d.weight}
                          onChange={(e) =>
                            handleUpdateWeight(
                              paramSubject,
                              d.id,
                              Number(e.target.value)
                            )
                          }
                          className={`w-full border rounded px-2 py-1 text-xs font-mono ${inputCls}`}
                        />
                        <span className="text-xs font-mono">%</span>
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteDeliverableFromSubject(
                              paramSubject,
                              d.id
                            )
                          }
                          className="text-zinc-500 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: ADMIN CONFIRMATION QUEUE */}
        {activeTab === 'approvals' && isAdmin && (
          <section className="space-y-6">
            <div className={`border-b pb-4 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <h2 className="text-lg font-semibold">
                Admin Confirmation Queue ({stats.pendingItems.length})
              </h2>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                Confirm whether member-submitted work is done to unlock their project percentage.
              </p>
            </div>

            {stats.pendingItems.length === 0 ? (
              <div className={`border rounded-xl p-8 text-center space-y-2 ${bgCard}`}>
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="text-sm font-medium">No submissions waiting for confirmation</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.pendingItems.map(({ project, task }) => (
                  <div
                    key={task.id}
                    className={`border border-amber-500/40 rounded-xl p-5 space-y-4 flex flex-col justify-between ${bgCard}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">
                          [{project.code}] +{task.weight}%
                        </span>
                        <span className={`text-xs ${textMuted}`}>
                          Submitted by <strong>{getMemberName(task.assignee)}</strong>
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold">
                        {task.title} ({task.type})
                      </h3>
                      <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${bgSubtle}`}>
                        <p>{task.workMade || 'File attached below'}</p>
                        {task.attachedFile && (
                          <a
                            href={task.attachedFile.dataUrl}
                            download={task.attachedFile.name}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-500 underline"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>Download {task.attachedFile.name}</span>
                          </a>
                        )}
                        {task.proof && (
                          <p className="font-mono text-[11px] opacity-80">
                            Ref: {task.proof}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleVerifyTask(project.code, task.id, 'approve')
                        }
                        className="flex-1 py-2 px-3 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                      >
                        Confirm Work Done (+{task.weight}%)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleVerifyTask(project.code, task.id, 'reject')
                        }
                        className={`py-2 px-3 rounded-md text-xs font-medium border ${bgSubtle} hover:text-rose-500`}
                      >
                        Reject / Revise
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 5: TEAM MEMBERS, LOGIN IDs & PASSKEYS */}
        {activeTab === 'team' && (
          <section className="max-w-4xl space-y-6">
            <div className={`border-b pb-4 flex flex-wrap items-center justify-between gap-3 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <div>
                <h2 className="text-lg font-semibold">
                  Team Roster, Login IDs &amp; Passkeys
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {isAdmin
                    ? 'As Admin (Ayush Borade), you can edit member names, Login IDs, and Passkeys anytime.'
                    : 'View team roster. Only Admin (Ayush Borade) can view or update member passkeys.'}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setState(createInitialState());
                    notify('Reset workspace to clean initial state');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${bgSubtle} hover:text-rose-500`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Workspace</span>
                </button>
              )}
            </div>

            {/* Separate Admin Credentials Card (Visible only to Admin) */}
            {isAdmin && (
              <div className={`border border-emerald-500/30 rounded-xl p-5 space-y-3 ${bgCard}`}>
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-500 font-semibold">
                  <Shield className="w-4 h-4" />
                  <span>[SEPARATE ADMIN CREDENTIALS — AYUSH BORADE (LEADER)]</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block font-mono text-[10px] uppercase mb-1 ${textFaint}`}>
                      Admin Login ID
                    </label>
                    <input
                      type="text"
                      value={state.adminLoginId}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          adminLoginId: e.target.value
                        }))
                      }
                      className={`w-full border rounded-md px-3 py-1.5 text-xs font-mono focus:outline-none ${inputCls}`}
                    />
                  </div>
                  <div>
                    <label className={`block font-mono text-[10px] uppercase mb-1 ${textFaint}`}>
                      Admin Passkey
                    </label>
                    <input
                      type="text"
                      value={state.adminPasskey}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          adminPasskey: e.target.value
                        }))
                      }
                      className={`w-full border rounded-md px-3 py-1.5 text-xs font-mono text-emerald-500 font-bold focus:outline-none ${inputCls}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4 Members Table (Name, Login ID, Passkey, Role) */}
            <div className={`border rounded-xl divide-y overflow-hidden ${bgCard} ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
              <div className={`p-3.5 grid grid-cols-12 gap-2 font-mono text-[10px] uppercase ${textFaint} ${bgSubtle}`}>
                <div className="col-span-4">Member Name</div>
                <div className="col-span-3">Member Login ID</div>
                <div className="col-span-3">Passkey</div>
                <div className="col-span-2 text-right">Confirmed</div>
              </div>

              {state.members.map((m, idx) => {
                const mStat = stats.memberMap[m.id];
                return (
                  <div
                    key={m.id}
                    className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={m.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setState((prev) => ({
                            ...prev,
                            members: prev.members.map((x) =>
                              x.id === m.id ? { ...x, name: val } : x
                            )
                          }));
                        }}
                        placeholder={`Member ${idx + 1} Name`}
                        className={`w-full border rounded-md px-2.5 py-1.5 text-xs font-medium focus:outline-none disabled:opacity-70 ${inputCls}`}
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={m.loginId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setState((prev) => ({
                            ...prev,
                            members: prev.members.map((x) =>
                              x.id === m.id ? { ...x, loginId: val } : x
                            )
                          }));
                        }}
                        placeholder="Login ID"
                        className={`w-full border rounded-md px-2.5 py-1.5 text-xs font-mono focus:outline-none disabled:opacity-70 ${inputCls}`}
                      />
                    </div>

                    <div className="sm:col-span-3">
                      {isAdmin ? (
                        <input
                          type="text"
                          value={m.passkey}
                          onChange={(e) => {
                            const val = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              members: prev.members.map((x) =>
                                x.id === m.id ? { ...x, passkey: val } : x
                              )
                            }));
                          }}
                          placeholder="Passkey"
                          className={`w-full border rounded-md px-2.5 py-1.5 text-xs font-mono text-emerald-500 font-semibold focus:outline-none ${inputCls}`}
                        />
                      ) : (
                        <span className={`font-mono text-xs ${textFaint}`}>
                          •••••••• (Admin Only)
                        </span>
                      )}
                    </div>

                    <div className="sm:col-span-2 text-right font-mono text-xs">
                      {mStat.verifiedCount}/{mStat.assignedCount} done
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 6: HOW TO USE THIS APP AS A USER (Essential Guide Only) */}
        {activeTab === 'guide' && (
          <section className="max-w-3xl space-y-6">
            <div className={`border-b pb-4 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <h2 className="text-lg font-semibold">How to Use This App</h2>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                Essential instructions for Team Members (Users) and the Group Leader (Admin).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* For Team Members (Users) */}
              <div className={`border rounded-xl p-5 space-y-3 ${bgCard}`}>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-500">
                  <Lock className="w-4 h-4" />
                  <span>FOR TEAM MEMBERS (USER MODE)</span>
                </div>
                <ol className="space-y-2.5 text-xs leading-relaxed list-decimal list-inside">
                  <li>
                    <strong>Log In to Your Profile:</strong> Click{' '}
                    <strong>Member Login</strong> in the top-right bar and enter the{' '}
                    <strong>Login ID</strong> and <strong>Passkey</strong> given to you by Ayush Borade.
                  </li>
                  <li>
                    <strong>Check Your Assigned Tasks:</strong> Open{' '}
                    <strong>Projects (6)</strong> and filter by your name. Tasks assigned to you show an active{' '}
                    <strong>Upload Work / Mark Done</strong> button.
                  </li>
                  <li>
                    <strong>Spectator Mode for Other Tasks:</strong> For projects or tasks assigned to other teammates, you are a{' '}
                    <strong>Spectator Only</strong>—you can view their progress, but you cannot edit or upload on their tasks.
                  </li>
                  <li>
                    <strong>Submit Your Work:</strong> Click{' '}
                    <strong>Upload Work / Mark Done</strong> on your task, write what you have made till now, attach your file (<code className="font-mono">.circ</code>, <code className="font-mono">.pdf</code>, <code className="font-mono">.pptx</code>) or Drive/GitHub link, and check{' '}
                    <strong>Have you finished this task?</strong>.
                  </li>
                  <li>
                    <strong>Wait for Admin Confirmation:</strong> Submitting a task marks it as{' '}
                    <em>Pending Admin</em>. The completion percentage increases only after Admin confirms your work.
                  </li>
                </ol>
              </div>

              {/* For Group Leader (Admin — Ayush Borade) */}
              <div className={`border rounded-xl p-5 space-y-3 ${bgCard}`}>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-500">
                  <Shield className="w-4 h-4" />
                  <span>FOR GROUP LEADER (ADMIN — AYUSH BORADE)</span>
                </div>
                <ol className="space-y-2.5 text-xs leading-relaxed list-decimal list-inside">
                  <li>
                    <strong>Manage IDs &amp; Passkeys:</strong> Open{' '}
                    <strong>Team &amp; Passkeys (4)</strong> to update member names, Login IDs, or Passkeys anytime.
                  </li>
                  <li>
                    <strong>Select What Each Subject Has:</strong> On each subject card in{' '}
                    <strong>Projects (6)</strong>, click the deliverable buttons (<code className="font-mono">App</code>, <code className="font-mono">Website</code>, <code className="font-mono">Logisim Project</code>, <code className="font-mono">Report</code>, <code className="font-mono">PPT</code>, <code className="font-mono">Research Paper</code>) to turn ON only what that subject requires.
                  </li>
                  <li>
                    <strong>Assign Projects &amp; Tasks:</strong> Use the{' '}
                    <strong>Assign To</strong> dropdown on each task (or open{' '}
                    <strong>Assign Matrix</strong>) to assign work to Ayush, Shriman, Unnati, or Kunal.
                  </li>
                  <li>
                    <strong>Confirm Work Done:</strong> Open{' '}
                    <strong>Confirm Queue</strong> (or click{' '}
                    <strong>Confirm Done +%</strong> on any task) after checking a member&apos;s work to officially unlock their completion percentage.
                  </li>
                  <li>
                    <strong>Switch Between Admin &amp; Member View:</strong> Since you are both Admin and Member 1, click{' '}
                    <strong>View as Ayush (Member)</strong> in the top bar anytime.
                  </li>
                </ol>
              </div>
            </div>
          </section>
        )}

        {/* TAB 7: FILES & STORAGE */}
        {activeTab === 'storage' && (
          <section className="space-y-6">
            <div className={`border-b pb-4 flex flex-wrap items-center justify-between gap-3 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <div>
                <h2 className="text-lg font-semibold">
                  Project Files &amp; Backup Storage
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  All data and uploaded files save in your browser&apos;s local storage and can be exported as a .json backup file.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(state, null, 2)], {
                      type: 'application/json'
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'project_tracker_backup.json';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    notify('Downloaded JSON backup');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-zinc-950"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Backup (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBackupJson(JSON.stringify(state, null, 2));
                    setBackupModalOpen(true);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${bgSubtle}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore JSON</span>
                </button>
              </div>
            </div>

            <div className={`border rounded-xl overflow-hidden ${bgCard}`}>
              <div className={`px-5 py-3.5 border-b font-semibold text-xs ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                Uploaded Deliverable Files ({stats.allAttachedFiles.length})
              </div>
              {stats.allAttachedFiles.length === 0 ? (
                <div className={`p-6 text-center text-xs ${textMuted}`}>
                  No files uploaded yet.
                </div>
              ) : (
                <div className={`divide-y ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
                  {stats.allAttachedFiles.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-500">
                            [{item.projectCode}]
                          </span>
                          <span className="font-semibold">{item.file.name}</span>
                          <span className={`font-mono text-[11px] ${textFaint}`}>
                            ({formatBytes(item.file.size)})
                          </span>
                        </div>
                        <p className={textMuted}>
                          Task: {item.taskTitle} • Uploaded by {item.assigneeName}
                        </p>
                      </div>
                      <a
                        href={item.file.dataUrl}
                        download={item.file.name}
                        className="px-3 py-1.5 rounded-md font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* FULL-PAGE LOGIN SCREEN (FIRST PAGE ON LAUNCH) */}
      {loginModal.open && (
        <div className={`fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto ${bgMain}`}>
          {/* Login Page Top Header */}
          <div className={`border-b px-6 py-4 flex items-center justify-between ${bgHeader}`}>
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs tracking-tight ${
                  isDark ? 'bg-zinc-100 text-zinc-950' : 'bg-slate-900 text-white'
                }`}
              >
                PT
              </div>
              <div>
                <span className="font-semibold text-sm tracking-tight block">
                  {state.appName || 'ProjectTrack'}
                </span>
                <span className={`font-mono text-[10px] ${textMuted}`}>
                  EDI · FODS · DSAM · DM · OOPS · DBMS
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1.5 transition ${bgSubtle}`}
              >
                {isDark ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-700" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Centered Login Container */}
          <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
            <div className="max-w-md w-full space-y-5">
              <div className="text-center space-y-1.5">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>COLLEGE PROJECT GOVERNANCE PORTAL</span>
                </span>
                <h1 className="text-2xl font-bold tracking-tight">
                  Sign in to {state.appName || 'ProjectTrack'}
                </h1>
                <p className={`text-xs ${textMuted}`}>
                  Choose <strong>Member Login</strong> to upload work for your assigned subjects or <strong>Admin Login</strong> for Group Leader controls.
                </p>
              </div>

              <div className={`border rounded-2xl p-6 space-y-5 shadow-xl ${bgCard}`}>
                {/* Portal Selector Tabs */}
                <div className={`grid grid-cols-2 p-1 rounded-xl border ${bgSubtle}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setLoginModal((prev) => ({
                        ...prev,
                        targetPortal: 'member',
                        loginId: 'ayush',
                        passkey: '',
                        error: ''
                      }))
                    }
                    className={`py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      loginModal.targetPortal === 'member'
                        ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                        : textMuted
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Member Login (User)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLoginModal((prev) => ({
                        ...prev,
                        targetPortal: 'admin',
                        loginId: state.adminLoginId,
                        passkey: '',
                        error: ''
                      }))
                    }
                    className={`py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      loginModal.targetPortal === 'admin'
                        ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                        : textMuted
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin Login (Leader)</span>
                  </button>
                </div>

                {/* Quick Member Selector Pills when in Member Login */}
                {loginModal.targetPortal === 'member' && (
                  <div className="space-y-1.5">
                    <label className={`block text-[11px] font-mono uppercase ${textMuted}`}>
                      Select Your Team Profile
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {state.members.map((m) => {
                        const selected =
                          loginModal.loginId.trim().toLowerCase() ===
                          m.loginId.trim().toLowerCase();
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              setLoginModal((prev) => ({
                                ...prev,
                                loginId: m.loginId,
                                error: ''
                              }))
                            }
                            className={`px-2.5 py-2 rounded-lg border text-left text-xs transition ${
                              selected
                                ? 'border-emerald-500 bg-emerald-500/10 font-semibold'
                                : `${bgSubtle} hover:opacity-90`
                            }`}
                          >
                            <span className="block truncate">{m.name}</span>
                            <span className={`font-mono text-[10px] ${textMuted}`}>
                              ID: {m.loginId}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <form onSubmit={handlePortalLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      {loginModal.targetPortal === 'admin'
                        ? 'Admin Login ID (Group Leader)'
                        : 'Member Login ID'}
                    </label>
                    <input
                      type="text"
                      required
                      value={loginModal.loginId}
                      onChange={(e) =>
                        setLoginModal((prev) => ({
                          ...prev,
                          loginId: e.target.value,
                          error: ''
                        }))
                      }
                      placeholder={
                        loginModal.targetPortal === 'admin'
                          ? 'admin.ayush'
                          : 'ayush / shriman / unnati / kunal'
                      }
                      className={`w-full border rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none ${inputCls}`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Passkey
                    </label>
                    <input
                      type="password"
                      required
                      value={loginModal.passkey}
                      onChange={(e) =>
                        setLoginModal((prev) => ({
                          ...prev,
                          passkey: e.target.value,
                          error: ''
                        }))
                      }
                      placeholder={
                        loginModal.targetPortal === 'admin'
                          ? 'Enter Admin Passkey (ADMIN-2026)'
                          : 'Enter Member Passkey (e.g. AYUSH-101)'
                      }
                      className={`w-full border rounded-lg px-3.5 py-2.5 text-xs font-mono focus:outline-none ${inputCls}`}
                    />
                  </div>

                  {loginModal.error && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
                      {loginModal.error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition shadow-sm"
                  >
                    {loginModal.targetPortal === 'admin'
                      ? 'Sign In to Admin Portal (Ayush Borade)'
                      : 'Sign In to Member Profile'}
                  </button>
                </form>

                {/* Quick Demo / Default Credentials Reference Box */}
                <div className={`pt-3 border-t space-y-2 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[10px] uppercase font-semibold ${textMuted}`}>
                    </span>
                    <span className={`font-mono text-[10px] ${textFaint}`}>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Login Page Footer */}
          <div className={`border-t px-6 py-3 text-center text-[11px] ${textMuted} ${bgHeader}`}>
            Group Leader: <strong>Ayush Borade</strong> • Team: Shriman Boralkar, Unnati Borate, Kunal Chatla
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD WORK & MARK FINISHED */}
      {workModal.open && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`border rounded-xl max-w-lg w-full p-6 space-y-4 ${bgCard}`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-emerald-500 font-semibold">
                [{workModal.projectCode} // UPLOAD WORK &amp; STATUS]
              </span>
              <button
                type="button"
                onClick={() =>
                  setWorkModal((prev) => ({ ...prev, open: false }))
                }
                className={textMuted}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  What have you made till now? *
                </label>
                <textarea
                  rows={3}
                  value={workModal.workMade}
                  onChange={(e) =>
                    setWorkModal((prev) => ({
                      ...prev,
                      workMade: e.target.value,
                      error: ''
                    }))
                  }
                  placeholder="Describe the modules, Logisim circuits, report sections, or slides completed..."
                  className={`w-full border rounded-md px-3 py-2 text-xs focus:outline-none ${inputCls}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Upload File (.circ, .pdf, .pptx, .docx, .zip)
                </label>
                <div className={`p-3 rounded-lg border border-dashed ${bgSubtle} space-y-2`}>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="block w-full text-xs file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-zinc-950 cursor-pointer"
                  />
                  {workModal.attachedFile && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="font-mono text-emerald-500 truncate">
                        Attached: {workModal.attachedFile.name} (
                        {formatBytes(workModal.attachedFile.size)})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setWorkModal((prev) => ({
                            ...prev,
                            attachedFile: null
                          }))
                        }
                        className="text-rose-500 text-[11px] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Or Paste Cloud Link (Google Drive / GitHub / Overleaf)
                </label>
                <input
                  type="text"
                  value={workModal.proof}
                  onChange={(e) =>
                    setWorkModal((prev) => ({ ...prev, proof: e.target.value }))
                  }
                  placeholder="https://drive.google.com/... or github.com/..."
                  className={`w-full border rounded-md px-3 py-2 text-xs font-mono focus:outline-none ${inputCls}`}
                />
              </div>

              <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer ${bgSubtle}`}>
                <input
                  type="checkbox"
                  checked={workModal.markFinished}
                  onChange={(e) =>
                    setWorkModal((prev) => ({
                      ...prev,
                      markFinished: e.target.checked
                    }))
                  }
                  className="mt-0.5 rounded accent-emerald-500"
                />
                <span className="text-xs leading-relaxed">
                  <strong className="block">
                    Have you finished this task?
                  </strong>
                  Sends this task to Admin (Ayush Borade) to confirm work is done. Percentage increases only after Admin confirmation.
                </span>
              </label>

              {workModal.error && (
                <p className="text-xs text-rose-500">{workModal.error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setWorkModal((prev) => ({ ...prev, open: false }))
                }
                className={`px-3.5 py-1.5 rounded-md text-xs ${textMuted}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveWorkModal}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-zinc-950"
              >
                Save &amp; Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: JSON RESTORE */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`border rounded-xl max-w-lg w-full p-6 space-y-4 ${bgCard}`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">
                RESTORE OR COPY WORKSPACE JSON
              </span>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className={textMuted}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={8}
              value={backupJson}
              onChange={(e) => setBackupJson(e.target.value)}
              className={`w-full border rounded-md p-3 text-xs font-mono focus:outline-none ${inputCls}`}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(backupJson);
                    if (parsed && Array.isArray(parsed.projects)) {
                      setState(parsed);
                      setBackupModalOpen(false);
                      notify('Restored workspace from JSON');
                    }
                  } catch {
                    notify('Invalid JSON');
                  }
                }}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-zinc-950"
              >
                Restore JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 border border-slate-700 text-white text-xs font-medium px-3.5 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}