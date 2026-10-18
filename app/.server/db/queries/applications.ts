import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../index";
import { atomic } from "../atomic";
import { applicationDocuments, applicationMessages, applications, events } from "../schema";
import {
  APPLICATION_STATUS_LABELS,
  OPEN_STATUSES,
  applicationRef,
  type ApplicationStatus,
  type ApplicationView,
} from "~/lib/applications";
import { EVENT_TYPE_LABELS, formatTimeRange, type EventType } from "~/lib/events";

type ApplicationRow = typeof applications.$inferSelect;
export type NewApplication = Omit<typeof applications.$inferInsert, "id" | "number" | "status">;
export type NewDocument = Omit<typeof applicationDocuments.$inferInsert, "id" | "uploadedAt">;

export type Result = { ok: true } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): Result => ({ ok: false, status, error });

// Ids arrive from URLs. Postgres rejects a malformed uuid with an error, which
// would surface as a 500; a malformed id is simply not found.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmtSubmitted = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Every application with its documents and trail, newest first. */
export async function listApplications(): Promise<ApplicationView[]> {
  const db = await getDb();
  const apps = await db.select().from(applications).orderBy(desc(applications.submittedAt));
  if (apps.length === 0) return [];
  const ids = apps.map((a) => a.id);
  const [docs, messages] = await Promise.all([
    db
      .select()
      .from(applicationDocuments)
      .where(inArray(applicationDocuments.applicationId, ids))
      .orderBy(asc(applicationDocuments.uploadedAt)),
    db
      .select()
      .from(applicationMessages)
      .where(inArray(applicationMessages.applicationId, ids))
      .orderBy(asc(applicationMessages.createdAt)),
  ]);

  return apps.map((a) => ({
    id: a.id,
    ref: applicationRef(a.number),
    title: a.title,
    institute: a.institute,
    type: EVENT_TYPE_LABELS[a.type],
    date: a.date,
    startTime: a.startTime.slice(0, 5),
    endTime: a.endTime.slice(0, 5),
    time: formatTimeRange(a.startTime, a.endTime),
    purpose: a.purpose,
    equipment: [a.equipment, a.requirements].filter(Boolean).join("\n"),
    attendees: a.expectedAttendees ?? 0,
    livestreamRequested: a.livestreamRequested,
    applicant: a.organizer,
    contact: a.contactName,
    email: a.contactEmail,
    status: a.status,
    statusLabel: APPLICATION_STATUS_LABELS[a.status],
    submitted: fmtSubmitted(a.submittedAt),
    docs: docs
      .filter((d) => d.applicationId === a.id)
      .map((d) => ({
        id: d.id,
        name: d.fileName,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
        url: `/documents/${d.id}`,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    trail: messages
      .filter((m) => m.applicationId === a.id)
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        authorRole: m.authorRole,
        authorName: m.authorName,
        body: m.body,
        toStatus: m.toStatus,
        at: m.createdAt.toISOString(),
      })),
  }));
}

export async function getApplication(id: string): Promise<ApplicationRow | null> {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(applications).where(eq(applications.id, id));
  return row ?? null;
}

export async function createApplication(input: NewApplication): Promise<{ id: string; ref: string }> {
  const db = await getDb();
  const [row] = await db
    .insert(applications)
    .values(input)
    .returning({ id: applications.id, number: applications.number });
  return { id: row.id, ref: applicationRef(row.number) };
}

export async function countDocuments(applicationId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(applicationDocuments)
    .where(eq(applicationDocuments.applicationId, applicationId));
  return row.n;
}

export async function addDocument(doc: NewDocument): Promise<string> {
  const db = await getDb();
  const [row] = await db.insert(applicationDocuments).values(doc).returning({ id: applicationDocuments.id });
  return row.id;
}

export async function getDocument(id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(applicationDocuments).where(eq(applicationDocuments.id, id));
  return row ?? null;
}

export type ReviewIntent = "request_documents" | "decline" | "approve";

/**
 * An approver's decision or request, recorded on the trail with its message.
 * Approval also puts the event on the calendar, in the same transaction, so an
 * application is never approved without its event or the other way round.
 */
export async function review(
  id: string,
  intent: ReviewIntent,
  message: string,
  authorName: string,
): Promise<Result> {
  const app = await getApplication(id);
  if (!app) return fail(404, "Application not found.");
  if (!OPEN_STATUSES.includes(app.status)) {
    return fail(409, `This application is already ${APPLICATION_STATUS_LABELS[app.status].toLowerCase()}.`);
  }

  const next: Record<ReviewIntent, ApplicationStatus> = {
    request_documents: "changes_requested",
    decline: "declined",
    approve: "approved",
  };
  const toStatus = next[intent];
  const decided = toStatus === "approved" || toStatus === "declined";
  const db = await getDb();

  try {
    await atomic(db, (tx) => [
      tx
        .update(applications)
        .set({ status: toStatus, decidedAt: decided ? sql`now()` : null, updatedAt: sql`now()` })
        .where(eq(applications.id, id)),
      tx.insert(applicationMessages).values({
        applicationId: id,
        kind: intent === "request_documents" ? "documents_requested" : "status_change",
        authorRole: "approver",
        authorName,
        body: message || (intent === "approve" ? "Approved. The event is on the calendar." : ""),
        toStatus,
      }),
      ...(intent === "approve"
        ? [
            tx.insert(events).values({
              date: app.date,
              startTime: app.startTime,
              endTime: app.endTime,
              title: app.title,
              institute: app.institute,
              type: app.type,
              organizer: app.organizer,
              description: app.purpose,
              equipment: [app.equipment, app.requirements].filter(Boolean).join("\n"),
              expectedAttendees: app.expectedAttendees,
              livestreamRequested: app.livestreamRequested,
              applicationId: app.id,
            }),
          ]
        : []),
    ]);
  } catch (err) {
    if (pgCode(err) === "23P01") {
      return fail(409, "This slot overlaps a confirmed booking. Ask the applicant to choose another time.");
    }
    throw err;
  }
  return { ok: true };
}

/**
 * The applier answering on the trail. If documents had been requested, the
 * reply sends the application back for review: the back-and-forth loop.
 */
export async function reply(id: string, message: string, authorName: string): Promise<Result> {
  const app = await getApplication(id);
  if (!app) return fail(404, "Application not found.");
  if (!OPEN_STATUSES.includes(app.status)) {
    return fail(409, `This application is already ${APPLICATION_STATUS_LABELS[app.status].toLowerCase()}.`);
  }
  const reopens = app.status === "changes_requested";
  const db = await getDb();

  await atomic(db, (tx) => [
    tx.insert(applicationMessages).values({
      applicationId: id,
      kind: "comment",
      authorRole: "applier",
      authorName,
      body: message,
      toStatus: reopens ? "under_review" : null,
    }),
    ...(reopens
      ? [tx.update(applications).set({ status: "under_review", updatedAt: sql`now()` }).where(eq(applications.id, id))]
      : []),
  ]);
  return { ok: true };
}

/** The Postgres error code, through Drizzle's wrapping. */
function pgCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.code === "string") return e.code;
  }
  return undefined;
}

export function isEventType(v: string): v is EventType {
  return v in EVENT_TYPE_LABELS;
}
