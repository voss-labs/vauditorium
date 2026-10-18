import type { Route } from "./+types/api.applications.$id.review";
import { review } from "~/.server/db/queries/applications";
import { firstError, formObject, reviewSchema } from "~/.server/validation";

// POST /api/applications/:id/review: an approver requests documents, declines
// or approves, always with the message that goes on the trail.
//
// TODO(auth): require a VDT approver. Until auth lands the role switcher in the
// UI is the only gate, which is why this must not ship to production yet.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const parsed = reviewSchema.safeParse(formObject(await request.formData()));
  if (!parsed.success) return Response.json({ error: firstError(parsed.error) }, { status: 400 });

  const result = await review(params.id, parsed.data.intent, parsed.data.message, "VDT approver");
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
