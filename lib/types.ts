export type Role = "admin" | "member";
export type Status = "todo" | "in_progress" | "pending" | "approved";

/** A person as seen inside the group you are currently viewing (name from the profile, role/approval from the membership). */
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
}

export interface Membership {
  group_id: string;
  user_id: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Semester {
  id: string;
  group_id: string;
  name: string;
  status: "current" | "archived";
  started_at: string;
  ended_at: string | null;
}

export interface Subject {
  id: string;
  group_id: string;
  semester_id: string;
  code: string;
  name: string;
  topic: string;
  deadline: string | null; // YYYY-MM-DD
  lead_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface Deliverable {
  id: string;
  group_id: string;
  semester_id: string;
  subject_id: string;
  type: string;
  title: string;
  weight: number;
  assignee_id: string | null;
  status: Status;
  work_made: string;
  started_at: string | null;
  live_url: string;
  repo_url: string;
  proof_url: string;
  feedback: string;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  update_id: string | null;
  group_id: string;
  semester_id: string;
  deliverable_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  group_id: string;
  semester_id: string;
  subject_id: string;
  deliverable_id: string | null;
  title: string;
  details: string;
  assignee_id: string | null;
  /** open = assigned, review = submitted and waiting for the leader, done = approved */
  status: "open" | "review" | "done";
  note: string;
  feedback: string;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  submitted_at: string | null;
  done_at: string | null;
}

export type ProgressMood = "on_track" | "almost_done" | "need_help" | "blocked";

export const MOOD_LABEL: Record<ProgressMood, string> = {
  on_track: "On track",
  almost_done: "Almost done",
  need_help: "Need help",
  blocked: "Blocked",
};

export interface ProgressUpdate {
  id: string;
  group_id: string;
  semester_id: string;
  deliverable_id: string;
  author_id: string | null;
  mood: ProgressMood;
  percent: number | null;
  body: string;
  github_url: string;
  link_url: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  group_id: string;
  semester_id: string | null;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  deliverable_id: string | null;
  task_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ActivityItem {
  id: number;
  group_id: string;
  semester_id: string | null;
  actor_id: string | null;
  subject_id: string | null;
  deliverable_id: string | null;
  action: string;
  message: string;
  created_at: string;
}

export type ViewId =
  | "scoreboard"
  | "board"
  | "mine"
  | "approvals"
  | "analytics"
  | "plan"
  | "team"
  | "activity";

export const STANDARD_DELIVERABLES: { type: string; defaultTitle: string }[] = [
  { type: "App", defaultTitle: "Application build" },
  { type: "Website", defaultTitle: "Website build" },
  { type: "Logisim Project", defaultTitle: "Logisim circuit (.circ)" },
  { type: "Report", defaultTitle: "Project report" },
  { type: "PPT", defaultTitle: "Presentation (PPT)" },
  { type: "Research Paper", defaultTitle: "Research paper" },
];

export const STATUS_LABEL: Record<Status, string> = {
  todo: "Not started",
  in_progress: "In progress",
  pending: "Awaiting confirmation",
  approved: "Confirmed",
};

/**
 * How each deliverable type is proven. This mirrors private.submission_mode() in the database,
 * which enforces it even if someone bypasses the screen.
 *  link: a deployed app link or a GitHub repository (App, Website)
 *  file: an uploaded file only (PPT, Report, Research Paper, Logisim Project)
 *  any:  a link or a file (anything custom)
 */
export type SubmissionKind = "link" | "file" | "any";

export function submissionKind(type: string): SubmissionKind {
  switch (type.trim().toLowerCase()) {
    case "app":
    case "website":
      return "link";
    case "ppt":
    case "report":
    case "research paper":
    case "logisim project":
      return "file";
    default:
      return "any";
  }
}

export function isHttpUrl(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v.trim());
}

/** The subjects the original ProjectTrack group used, offered as a one-click starting list. */
export const ORIGINAL_SUBJECTS = [
  { code: "EDI", name: "Engineering Design & Innovation" },
  { code: "FODS", name: "Foundations of Data Science" },
  { code: "DSAM", name: "Digital Systems & Microprocessors" },
  { code: "DM", name: "Discrete Mathematics" },
  { code: "OOPS", name: "Object-Oriented Programming" },
  { code: "DBMS", name: "Database Management Systems" },
];
