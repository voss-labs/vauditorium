# Application documents

Permission letters and supporting documents carry signatures, letterheads and
contact details. This is how they are stored, so that only the people with a
reason to read one can.

## Where the bytes live

A **private Cloudflare R2 bucket**, the same storage verp's bug-report worker
uses, so VOSS already runs it. The bucket has no public access and no `r2.dev`
URL. Nothing in it is reachable without a signature the app issues.

The database holds only the pointer (`application_documents.storage_key`) and
what the approver sees in a list: name, type, size, upload time.

In development, with no `R2_*` variables set, files go to `./.uploads` instead.
A production build with R2 unset refuses uploads rather than writing to a
serverless function's throwaway disk.

## Upload: `POST /api/applications/:id/documents`

One file per request, through the app (`app/routes/api.applications.$id.documents.ts`):

1. Bodies over 4 MB are refused from `Content-Length` before being read.
2. The application must exist, still be open (not approved, declined or
   withdrawn), and hold fewer than 15 documents.
3. The type is decided from the file's **first bytes**, never from its name or
   the browser's `Content-Type`: PDF, PNG, JPEG, DOC, or DOCX. A text file
   renamed `.png` is refused.
4. The server generates the key, `applications/<application id>/<uuid>.<ext>`.
   The uploader's file name is kept only as a display label, stripped of
   directories and control characters.
5. Only then is the file stored and its row written.

Why through the app rather than presigned uploads straight to R2: the server
sees every byte before anything is stored, the bucket needs no CORS rule, and
there are no orphaned objects from uploads nobody confirmed. The cost is the
4 MB limit per file, set by Vercel's 4.5 MB request body cap, which is plenty
for letters and photos. If larger files are ever needed, presigned uploads can
replace step 5 without changing anything else.

## Download: `GET /documents/:id`

- PDF, PNG and JPEG open in the tab, so an approver can read a letter or see a
  photo without downloading it. Word files always download.
- Every response is `X-Content-Type-Options: nosniff` and carries
  `Content-Security-Policy: default-src 'none'; sandbox`, so a crafted file
  cannot run script in the portal's origin.
- `Cache-Control: private, no-store`.
- With R2, the app answers with a redirect to a presigned URL valid for
  **5 minutes**. There are no permanent links.

## Before production

Until auth lands (see the `TODO(auth)` markers), anyone who can reach the app
can call these routes. Auth must add two checks:

- upload and reply: only the application's own applier;
- download: that applier, or a VDT approver.

## Configuration

Server-side only, never exposed to the browser:

| Variable               | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare account                        |
| `R2_ACCESS_KEY_ID`     | R2 API token scoped to this bucket only   |
| `R2_SECRET_ACCESS_KEY` | its secret                                |
| `R2_BUCKET`            | bucket name, e.g. `vauditorium-documents` |

The R2 token should have object read and write on this one bucket and nothing
else, so a leaked key cannot touch any other VOSS storage.
