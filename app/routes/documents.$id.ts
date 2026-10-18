import type { Route } from "./+types/documents.$id";
import { getDocument } from "~/.server/db/queries/applications";
import { isInline } from "~/.server/documents";
import { getStorage } from "~/.server/storage";

// GET /documents/:id: open an application document.
//
// Images and PDFs open in the tab; Word files download. Either way the
// response is sandboxed with no scripts, so a crafted file cannot run inside
// the portal's origin.
//
// TODO(auth): only the application's applier and approvers may read it.
export async function loader({ params }: Route.LoaderArgs) {
  const doc = await getDocument(params.id);
  if (!doc) return new Response("Not found", { status: 404 });

  const disposition = isInline(doc.contentType) ? "inline" : "attachment";
  const headers = new Headers({
    "content-type": doc.contentType,
    "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    "cache-control": "private, no-store",
  });
  return getStorage().serve(doc.storageKey, headers);
}
