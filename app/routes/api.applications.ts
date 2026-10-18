import type { Route } from "./+types/api.applications";
import { createApplication } from "~/.server/db/queries/applications";
import { firstError, formObject, newApplicationSchema } from "~/.server/validation";

// POST /api/applications: submit a booking application. Documents follow, one
// request per file, to /api/applications/:id/documents.
//
// TODO(auth): require a signed-in applier and record them as the owner.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const parsed = newApplicationSchema.safeParse(formObject(await request.formData()));
  if (!parsed.success) return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  const v = parsed.data;

  const created = await createApplication({
    title: v.title,
    institute: v.institute,
    type: v.type,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    purpose: v.purpose,
    equipment: v.equipment || null,
    expectedAttendees: v.attendees ?? null,
    livestreamRequested: v.livestream,
    organizer: v.organizer || v.contactName,
    contactName: v.contactName,
    contactEmail: v.contactEmail,
  });
  return Response.json(created, { status: 201 });
}
