export type Role = "admin" | "member";
export type Status = "todo" | "in_progress" | "pending" | "approved";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Subject {
  id: string;
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
  subject_id: string;
  type: string;
  title: string;
  weight: number;
  assignee_id: string | null;
  status: Status;
  work_made: string;
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
  deliverable_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface ActivityItem {
  id: number;
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
