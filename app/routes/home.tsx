import type { Route } from "./+types/home";
import VAuditorium, { type EventItem } from "../vauditorium/VAuditorium";
import { listApplications } from "~/.server/db/queries/applications";
import { listCalendarEvents } from "~/.server/db/queries/events";
import { EVENT_TYPE_LABELS, addMonths, formatTimeRange, istDate } from "~/lib/events";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "VAuditorium — VDT Portal" },
    { name: "description", content: "Shared auditorium booking and event calendar for the VDT community of institutes." },
  ];
}

// How far either side of today the calendar loads. One auditorium holds a
// handful of events a day at most, so a year each way is a few thousand small
// rows, and the month view, the past-events archive and outcomes can all read
// from one list.
const WINDOW_MONTHS = 12;

export async function loader({}: Route.LoaderArgs) {
  const today = istDate();
  // TODO(auth): applications carry contact details. Load them only for a
  // signed-in applier (their own) or approver (all), never for viewers.
  const [rows, applications] = await Promise.all([
    listCalendarEvents(addMonths(today, -WINDOW_MONTHS), addMonths(today, WINDOW_MONTHS)),
    listApplications(),
  ]);

  const events: EventItem[] = rows.map((e) => ({
    id: e.id,
    date: e.date,
    title: e.title,
    institute: e.institute,
    type: EVENT_TYPE_LABELS[e.type],
    time: formatTimeRange(e.startTime, e.endTime),
    startTime: e.startTime.slice(0, 5),
    endTime: e.endTime.slice(0, 5),
    owner: e.organizer,
    attendees: e.expectedAttendees ?? 0,
    status: e.date < today ? "Past event" : "Booked",
    description: e.description,
    equipment: e.equipment,
    stream: e.livestreamRequested || e.livestreamUrl !== null,
    result: e.outcome ?? undefined,
    streamUrl: e.livestreamUrl ?? undefined,
  }));

  return { events, applications, today };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <VAuditorium events={loaderData.events} applications={loaderData.applications} today={loaderData.today} />;
}
