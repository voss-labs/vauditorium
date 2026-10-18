import { z } from "zod";
import { isWithinHours } from "~/lib/events";

const time = z.string({ error: "Choose a start and end time" }).regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const text = (max: number) => z.string().trim().max(max);
// A field the form must fill. Empty fields are dropped by formObject, so a
// missing one arrives as undefined; give that the same message as blank.
const required = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max);

export const newApplicationSchema = z
  .object({
    title: required(120, "Event name is required"),
    institute: z.enum(["VIT", "VSIT", "VP", "VIIE", "VMMS"]),
    type: z.enum(["academic", "talk", "ceremony", "workshop", "competition", "induction", "other"]),
    date: z.iso.date({ error: "Choose a date" }),
    startTime: time,
    endTime: time,
    purpose: required(1200, "Purpose is required"),
    equipment: text(1000).optional().default(""),
    attendees: z.coerce.number().int().min(1).max(5000).optional(),
    livestream: z.stringbool().optional().default(false),
    organizer: text(120).optional(),
    contactName: required(100, "Contact name is required"),
    contactEmail: z.email({ error: "Enter a valid email address" }).max(200),
  })
  .refine((v) => isWithinHours(v.startTime, v.endTime), {
    message: "Choose a time between 07:00 and 19:00, ending after it starts",
    path: ["endTime"],
  });

export const reviewSchema = z.discriminatedUnion("intent", [
  // Saying which documents are needed is the point of the request.
  z.object({ intent: z.literal("request_documents"), message: required(2000, "Say which documents the applicant should upload") }),
  z.object({ intent: z.literal("decline"), message: required(2000, "Give the applicant a reason for declining") }),
  z.object({ intent: z.literal("approve"), message: text(2000).optional().default("") }),
]);

export const replySchema = z.object({
  message: required(2000, "Write a reply"),
});

/** FormData to a plain object, dropping empty fields so optionals apply. */
export function formObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === "string" && v !== "") out[k] = v;
  return out;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
