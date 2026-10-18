// Fills a local database with the demo data the UI was designed against.
//
//   npm run db:seed
//
// It deletes everything first, so it refuses to run against anything that is
// not a local database. There is no flag to override that. Seeded documents are
// written to local storage (./.uploads), never to R2.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { getStorage } from "../storage";
import { sql } from "drizzle-orm";
import { driverFor } from "./driver";
import { closeDb, getDb } from "./index";
import { applicationDocuments, applicationMessages, applications, events, suggestions } from "./schema";

const url = process.env.DATABASE_URL ?? "";
if (driverFor(url) === "neon" || process.env.R2_BUCKET) {
  console.error("Refusing to seed: DATABASE_URL is not a local database, or R2 is configured.");
  process.exit(1);
}

const db = await getDb();

// RESTART IDENTITY so application numbers start again at VA-001.
await db.execute(sql`TRUNCATE events, applications, application_documents, application_messages, suggestions RESTART IDENTITY`);

await db.insert(events).values([
  { date: "2026-10-17", startTime: "10:00", endTime: "12:30", title: "Welcome to VDT", institute: "VIT", type: "induction", organizer: "Central Student Council", expectedAttendees: 400, description: "An introduction to campus life, student services and institute communities.", equipment: "Full AV setup", livestreamRequested: true, livestreamUrl: "https://www.youtube.com/@vosslabs", outcome: "Event completed successfully" },
  { date: "2026-10-20", startTime: "09:30", endTime: "16:00", title: "Annual Research Symposium", institute: "VIT", type: "academic", organizer: "Research Cell", expectedAttendees: 280, description: "A full-day showcase of student and faculty research, presentations and poster sessions.", equipment: "Projector, microphones, recording", livestreamRequested: true },
  // A second booking the same day, back to back with the symposium.
  { date: "2026-10-20", startTime: "16:00", endTime: "18:30", title: "Robotics Club Demo Evening", institute: "VSIT", type: "other", organizer: "Robotics Club", expectedAttendees: 150, description: "Student teams demonstrate this semester's robots.", equipment: "Stage, sound system" },
  { date: "2026-10-22", startTime: "14:00", endTime: "17:00", title: "Industry Connect: Future of AI", institute: "VSIT", type: "talk", organizer: "IT Forum", expectedAttendees: 180, description: "Guest talks and a panel discussion with industry professionals.", equipment: "Projector, 4 microphones", livestreamRequested: true },
  { date: "2026-10-25", startTime: "07:00", endTime: "19:00", title: "Inter-college Hackathon", institute: "VIIE", type: "competition", organizer: "Innovation Council", expectedAttendees: 350, description: "A collaborative build event bringing together teams from across institutes.", equipment: "Wi-Fi, projector, sound system" },
  { date: "2026-10-28", startTime: "10:00", endTime: "13:00", title: "Scholarship Felicitation", institute: "VMMS", type: "ceremony", organizer: "Student Affairs", expectedAttendees: 220, description: "Recognising scholarship recipients and celebrating academic achievement.", equipment: "Stage, microphones, lectern", livestreamRequested: true },
  { date: "2026-11-03", startTime: "10:00", endTime: "15:00", title: "Design Thinking Workshop", institute: "VP", type: "workshop", organizer: "Design Club", expectedAttendees: 120, description: "A practical workshop on human-centred problem solving.", equipment: "Projector, movable seating" },
]);

// Applications in flight, for the booking and approval phases.
const [leadership, alumni] = await db
  .insert(applications)
  .values([
    { title: "Leadership & Motivation Talk", institute: "VSIT", type: "talk", date: "2026-10-30", startTime: "11:00", endTime: "13:00", purpose: "An invited speaker session for students and faculty.", equipment: "Projector, 3 microphones, livestream", expectedAttendees: 240, livestreamRequested: true, organizer: "Student Council", contactName: "Riya Shah", contactEmail: "council@vsit.edu", status: "changes_requested", submittedAt: new Date("2026-10-15T10:00:00+05:30") },
    { title: "Alumni Networking Evening", institute: "VIT", type: "other", date: "2026-11-06", startTime: "17:00", endTime: "19:00", purpose: "A networking evening connecting alumni, current students and faculty.", equipment: "Stage, microphones, projector", expectedAttendees: 300, organizer: "Alumni Relations Cell", contactName: "Dev Patel", contactEmail: "alumni@vit.edu", status: "submitted", submittedAt: new Date("2026-10-16T10:00:00+05:30") },
  ])
  .returning({ id: applications.id });

// Real files behind the seeded documents, so opening one works.
const storage = getStorage();

/** A one-page PDF that says what it is. */
function samplePdf(title: string): Uint8Array<ArrayBuffer> {
  const text = `BT /F1 20 Tf 60 760 Td (${title.replace(/[()\\]/g, "")}) Tj 0 -30 Td /F1 12 Tf (Sample document seeded for local development.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** A small solid-colour PNG, standing in for a photographed letter. */
function samplePng(width = 240, height = 160): Uint8Array<ArrayBuffer> {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([0xc4, 0x42, 0x1d]))]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

async function seedDocument(applicationId: string, kind: "permission_letter" | "proposal" | "other", fileName: string) {
  const isPng = fileName.endsWith(".png");
  const bytes = isPng ? samplePng() : samplePdf(fileName.replace(/\.\w+$/, ""));
  const contentType = isPng ? "image/png" : "application/pdf";
  const storageKey = `applications/${applicationId}/${randomUUID()}.${isPng ? "png" : "pdf"}`;
  await storage.put(storageKey, bytes, contentType);
  await db.insert(applicationDocuments).values({ applicationId, kind, fileName, contentType, sizeBytes: bytes.byteLength, storageKey });
}

await seedDocument(leadership.id, "proposal", "Event outline.pdf");
await seedDocument(alumni.id, "proposal", "Alumni evening brief.pdf");
await seedDocument(alumni.id, "permission_letter", "Permission letter.pdf");
await seedDocument(alumni.id, "other", "Venue layout photo.png");

await db.insert(applicationMessages).values([
  { applicationId: leadership.id, kind: "documents_requested", authorRole: "approver", authorName: "VDT approver", body: "Please attach the signed institute permission letter.", toStatus: "changes_requested" },
]);

await db.insert(suggestions).values([
  { body: "Add a dedicated student club showcase day", category: "Events", status: "under_consideration" },
]);

await closeDb();
console.log("Seeded 7 events, 2 applications, 4 documents, 1 suggestion.");
