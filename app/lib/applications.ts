// Shared between server and client: application statuses and the shape the UI
// receives.

export const APPLICATION_STATUS_LABELS = {
  submitted: "Pending review",
  under_review: "Under review",
  changes_requested: "Documents requested",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
} as const;

export type ApplicationStatus = keyof typeof APPLICATION_STATUS_LABELS;

/** Statuses an approver can still act on. */
export const OPEN_STATUSES: readonly ApplicationStatus[] = ["submitted", "under_review", "changes_requested"];

/** "VA-007" */
export function applicationRef(n: number): string {
  return `VA-${String(n).padStart(3, "0")}`;
}

export interface DocumentView {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  uploadedAt: string;
}

export interface TrailEntry {
  id: string;
  kind: "comment" | "query" | "documents_requested" | "status_change";
  authorRole: "applier" | "approver";
  authorName: string;
  body: string;
  toStatus: ApplicationStatus | null;
  at: string;
}

export interface ApplicationView {
  id: string;
  ref: string;
  title: string;
  institute: string;
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  time: string;
  purpose: string;
  equipment: string;
  attendees: number;
  livestreamRequested: boolean;
  applicant: string;
  contact: string;
  email: string;
  status: ApplicationStatus;
  statusLabel: string;
  submitted: string;
  docs: DocumentView[];
  trail: TrailEntry[];
}
