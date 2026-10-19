// Each subject gets a fixed "team colour" used in lanes and charts.
export const SUBJECT_COLORS = ["#2F6FED", "#7A4DE0", "#E07B1F", "#0E9AA7", "#C2417A", "#5B8A2A", "#B8860B", "#4B5563"];
export const MEMBER_COLORS = ["#2F6FED", "#E07B1F", "#0E9AA7", "#C2417A", "#7A4DE0", "#5B8A2A", "#B8860B", "#4B5563"];

export const STATUS_COLOR = {
  approved: "#0B8A6A",
  pending: "#E0A100",
  in_progress: "#2F6FED",
  todo: "#9AA5BD",
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
