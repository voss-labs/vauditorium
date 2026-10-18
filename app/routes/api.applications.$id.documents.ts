import type { Route } from "./+types/api.applications.$id.documents";
import { addDocument, countDocuments, getApplication } from "~/.server/db/queries/applications";
import { MAX_DOCUMENTS_PER_APPLICATION, MAX_DOCUMENT_BYTES, cleanFileName, sniff } from "~/.server/documents";
import { getStorage } from "~/.server/storage";
import { OPEN_STATUSES } from "~/lib/applications";

// POST /api/applications/:id/documents: attach one file.
//
// One file per request keeps each body under Vercel's 4.5 MB function limit.
// The server sees every byte, so nothing is stored before it is checked.
//
// TODO(auth): only the application's own applier may attach to it.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const fail = (status: number, error: string) => Response.json({ error }, { status });

  // Refuse oversized bodies before reading them into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_DOCUMENT_BYTES + 64 * 1024) return fail(413, "Files must be 4 MB or smaller.");

  const app = await getApplication(params.id);
  if (!app) return fail(404, "Application not found.");
  if (!OPEN_STATUSES.includes(app.status)) return fail(409, "This application is closed to new documents.");
  if ((await countDocuments(app.id)) >= MAX_DOCUMENTS_PER_APPLICATION) {
    return fail(409, `An application can hold at most ${MAX_DOCUMENTS_PER_APPLICATION} documents.`);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No file received.");
  if (file.size > MAX_DOCUMENT_BYTES) return fail(413, "Files must be 4 MB or smaller.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = cleanFileName(file.name);
  const kind = sniff(bytes, fileName);
  if (!kind) return fail(415, `${fileName} is not a PDF, Word document, PNG or JPEG.`);

  // The key is ours: the user's file name never becomes part of a path.
  const storageKey = `applications/${app.id}/${crypto.randomUUID()}.${kind.ext}`;
  await getStorage().put(storageKey, bytes, kind.contentType);

  const docKind = form.get("kind");
  const id = await addDocument({
    applicationId: app.id,
    kind: docKind === "permission_letter" || docKind === "proposal" ? docKind : "other",
    fileName,
    contentType: kind.contentType,
    sizeBytes: bytes.byteLength,
    storageKey,
  });
  return Response.json({ id, name: fileName }, { status: 201 });
}
