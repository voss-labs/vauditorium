// Checks an uploaded file before anything is stored.
//
// The type is decided from the file's first bytes, never from its name or the
// Content-Type the browser sent: both are whatever the uploader says they are.

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_APPLICATION = 15;

interface Kind {
  contentType: string;
  ext: string;
  // Whether a browser may render it inside the tab. Images and PDFs are safe
  // to show; Word files only ever download.
  inline: boolean;
}

const PDF: Kind = { contentType: "application/pdf", ext: "pdf", inline: true };
const PNG: Kind = { contentType: "image/png", ext: "png", inline: true };
const JPEG: Kind = { contentType: "image/jpeg", ext: "jpg", inline: true };
const DOC: Kind = { contentType: "application/msword", ext: "doc", inline: false };
const DOCX: Kind = {
  contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ext: "docx",
  inline: false,
};

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** The file's real type from its signature, or null if it is not one we accept. */
export function sniff(bytes: Uint8Array, fileName: string): Kind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return PDF; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return DOC; // OLE2
  // DOCX is a ZIP. So is any other zip, so also require the .docx name; a
  // renamed zip still only ever downloads, never renders.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && /\.docx$/i.test(fileName)) return DOCX;
  return null;
}

export function isInline(contentType: string): boolean {
  return [PDF, PNG, JPEG].some((k) => k.contentType === contentType);
}

/** A display name: no directories, no control characters, bounded length. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 150);
  return cleaned || "document";
}
