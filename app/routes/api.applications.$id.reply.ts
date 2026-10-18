import type { Route } from "./+types/api.applications.$id.reply";
import { getApplication, reply } from "~/.server/db/queries/applications";
import { firstError, formObject, replySchema } from "~/.server/validation";

// POST /api/applications/:id/reply: the applier answers the approver.
//
// TODO(auth): only the application's own applier, named from the session.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const parsed = replySchema.safeParse(formObject(await request.formData()));
  if (!parsed.success) return Response.json({ error: firstError(parsed.error) }, { status: 400 });

  const app = await getApplication(params.id);
  if (!app) return Response.json({ error: "Application not found." }, { status: 404 });

  const result = await reply(app.id, parsed.data.message, app.contactName);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
