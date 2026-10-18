import React, { useMemo, useState } from 'react';
import { useRevalidator } from 'react-router';
import { APPLICATION_STATUS_LABELS, OPEN_STATUSES, type ApplicationView, type TrailEntry } from '~/lib/applications';
import { AUDITORIUM_CLOSES, AUDITORIUM_OPENS, isWithinHours, slotsOverlap } from '~/lib/events';
import {
  CalendarDays, LayoutDashboard, ClipboardList,
  Lightbulb, Moon, Sun, Menu, X, ChevronLeft, ChevronRight, Plus, Search, Bell,
  ArrowUpRight, Clock3, MapPin, Users, FileText, Upload, Check, AlertCircle,
  Video, Trophy, CalendarCheck, MoreHorizontal, Send, Filter, ExternalLink,
  Building2, ShieldCheck, CircleHelp, Download,
  MessageSquareText, CheckCircle2, XCircle, Eye, Paperclip, Sparkles,
} from 'lucide-react';
import './vauditorium.css';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const INSTITUTES = ['VIT','VSIT','VP','VIIE','VMMS'];

export interface EventItem {
  id: number | string;
  date: string;
  title: string;
  institute: string;
  type: string;
  time: string;
  startTime?: string;
  endTime?: string;
  owner: string;
  attendees: number;
  status: string;
  description: string;
  equipment: string;
  stream: boolean;
  result?: string;
  streamUrl?: string;
}

// Applications come from the server (app/lib/applications.ts).
type RequestItem = ApplicationView;

/** POST a form to an API route; resolves to its JSON, or throws its error. */
async function post<T = unknown>(url: string, body: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Upload files one per request; returns the names of any that failed, with why. */
async function uploadAll(applicationId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    const body = new FormData();
    body.set('file', file);
    try { await post(`/api/applications/${applicationId}/documents`, body); }
    catch (err) { failed.push(err instanceof Error ? err.message : file.name); }
  }
  return failed;
}

const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', opts);

const isoDate = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function Brand() {
  return (
    <div className="brand">
      <span className="brand-word">VOSS</span>
      <span className="brand-square" />
      <span className="brand-divider" />
      <span className="product-name">VAuditorium</span>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  const s = String(children).toLowerCase();
  let cls = 'status';
  if (s.includes('approved') || s.includes('booked') || s.includes('completed')) cls += ' status-good';
  else if (s.includes('requested') || s.includes('review')) cls += ' status-warn';
  else if (s.includes('declined') || s.includes('rejected')) cls += ' status-danger';
  return <span className={cls}><span className="status-dot" />{children}</span>;
}

function PageTitle({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-square" /> {eyebrow}</div>
        <h1>{title}<span className="heading-period">.</span></h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note: string }) {
  return (
    <div className="panel metric-card">
      <div className="metric-top">
        <span className="metric-icon"><Icon size={17} /></span>
        <span className="metric-label">{label}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="panel empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required && <i>*</i>}</span>
      {children}
      {hint && <span className="field-help">{hint}</span>}
    </label>
  );
}

function DetailInfo({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="detail-info">
      <span className="detail-info-icon"><Icon size={15} /></span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

interface BookingState {
  title: string;
  institute: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  equipment: string;
  contact: string;
  email: string;
  attendees: string;
  type: string;
  stream: boolean;
}

const EMPTY_BOOKING: BookingState = { title: '', institute: 'VIT', date: '', startTime: '', endTime: '', purpose: '', equipment: '', contact: '', email: '', attendees: '', type: 'Academic', stream: false };

const ACCEPTED_FILES = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Why a booking cannot be submitted as it stands, or '' if it can. */
function slotProblem(b: BookingState, bookedOn: (date: string) => EventItem[]): string {
  if (!b.date || !b.startTime || !b.endTime) return '';
  if (!isWithinHours(b.startTime, b.endTime)) return `Choose a time between ${AUDITORIUM_OPENS} and ${AUDITORIUM_CLOSES}, ending after it starts.`;
  const clash = bookedOn(b.date).find(e => e.startTime && e.endTime && slotsOverlap({ start: b.startTime, end: b.endTime }, { start: e.startTime, end: e.endTime }));
  return clash ? `Overlaps "${clash.title}" (${clash.time}).` : '';
}

function FilePicker({ files, setFiles, hint }: { files: File[]; setFiles: (f: File[]) => void; hint?: string }) {
  const tooBig = files.filter(f => f.size > MAX_FILE_BYTES);
  return (
    <>
      <label className="upload-zone">
        <input type="file" multiple accept={ACCEPTED_FILES} onChange={e => setFiles(Array.from(e.target.files || []))} />
        <span className="upload-icon"><Upload size={18} /></span>
        <strong>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose files to upload'}</strong>
        <span>{files.length ? files.map(f => f.name).join(', ') : hint || 'PDF, DOC, DOCX, PNG or JPEG · up to 4 MB per file'}</span>
        <span className="upload-browse">Browse files</span>
      </label>
      {tooBig.length > 0 && <div className="field-help upload-note"><span className="inline-error"><AlertCircle size={13} /> Over 4 MB: {tooBig.map(f => f.name).join(', ')}</span></div>}
    </>
  );
}

function BookingForm({
  booking, setBooking, onSubmit, onCancel, error, bookedOn, minDate, busy, compact = false,
}: {
  booking: BookingState;
  setBooking: React.Dispatch<React.SetStateAction<BookingState>>;
  onSubmit: (e: React.FormEvent, files: File[]) => void;
  onCancel: () => void;
  error: string;
  bookedOn: (date: string) => EventItem[];
  minDate: string;
  busy: boolean;
  compact?: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const update = (key: keyof BookingState, value: string | boolean) =>
    setBooking(prev => ({ ...prev, [key]: value }));
  const booked = booking.date ? bookedOn(booking.date) : [];
  const problem = slotProblem(booking, bookedOn);
  return (
    <form className={`booking-form ${compact ? 'booking-form-compact' : ''}`} onSubmit={e => onSubmit(e, files)}>
      <div className="form-section-heading">
        <span className="form-step">01</span>
        <div><strong>Event information</strong><p>Tell us what you are planning.</p></div>
      </div>
      <div className="form-grid">
        <Field label="Event name" required>
          <input value={booking.title} onChange={e => update('title', e.target.value)} placeholder="e.g. Annual research symposium" required maxLength={120} />
        </Field>
        <Field label="Institute / organisation" required>
          <select value={booking.institute} onChange={e => update('institute', e.target.value)} required>
            {INSTITUTES.map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Event date" required>
          <input type="date" value={booking.date} min={minDate} onChange={e => update('date', e.target.value)} required />
          <span className="field-help">
            {booked.length
              ? <>Already booked: {booked.map(e => e.time).join(', ')}</>
              : booking.date ? 'No confirmed bookings on this date yet.' : 'Several events can share a day if their times do not overlap.'}
          </span>
        </Field>
        <Field label="Event type" required>
          <select value={booking.type} onChange={e => update('type', e.target.value)}>
            {['Academic','Talk','Ceremony','Workshop','Competition','Induction','Other'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Start time" required>
          <input type="time" value={booking.startTime} min={AUDITORIUM_OPENS} max={AUDITORIUM_CLOSES} step={300} onChange={e => update('startTime', e.target.value)} required />
        </Field>
        <Field label="End time" required>
          <input type="time" value={booking.endTime} min={AUDITORIUM_OPENS} max={AUDITORIUM_CLOSES} step={300} onChange={e => update('endTime', e.target.value)} required />
          <span className="field-help">
            {problem ? <span className="inline-error"><AlertCircle size={13} /> {problem}</span> : `The auditorium is bookable ${AUDITORIUM_OPENS}–${AUDITORIUM_CLOSES}.`}
          </span>
        </Field>
        <Field label="Purpose and event description" required>
          <textarea value={booking.purpose} onChange={e => update('purpose', e.target.value)} placeholder="Describe the event, audience and objectives..." rows={3} required maxLength={1200} />
        </Field>
        <Field label="Expected attendees">
          <input type="number" min="1" max="5000" value={booking.attendees} onChange={e => update('attendees', e.target.value)} placeholder="e.g. 250" />
        </Field>
        <Field label="Equipment &amp; other requirements">
          <textarea value={booking.equipment} onChange={e => update('equipment', e.target.value)} rows={2} placeholder="Projector, microphones, livestream..." maxLength={1000} />
        </Field>
      </div>
      <div className="form-section-heading">
        <span className="form-step">02</span>
        <div><strong>Responsible person</strong><p>Who should the approval team contact?</p></div>
      </div>
      <div className="form-grid form-grid-two">
        <Field label="Full name" required>
          <input value={booking.contact} onChange={e => update('contact', e.target.value)} placeholder="Person responsible" required maxLength={100} />
        </Field>
        <Field label="Email address" required>
          <input type="email" value={booking.email} onChange={e => update('email', e.target.value)} placeholder="name@institute.edu" required />
        </Field>
      </div>
      <div className="form-section-heading">
        <span className="form-step">03</span>
        <div><strong>Supporting documents</strong><p>Attach the institute permission letter and event documents.</p></div>
      </div>
      <FilePicker files={files} setFiles={setFiles} />
      <label className="checkbox-field">
        <input type="checkbox" checked={booking.stream} onChange={e => update('stream', e.target.checked)} />
        <span className="fake-checkbox"><Check size={12} /></span>
        <span><strong>Request livestream / recording support</strong><small>Let the auditorium team know that online streaming is needed.</small></span>
      </label>
      <div className="approval-info">
        <ShieldCheck size={17} />
        <p><strong>What happens next?</strong> Your application will be reviewed by a VDT-level approver. They may approve it or request more documents. The slot is confirmed only after approval.</p>
      </div>
      {error && <div className="form-error" role="alert"><AlertCircle size={15} />{error}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={busy || !!problem}><Send size={15} /> {busy ? 'Submitting…' : 'Submit application'}</button>
      </div>
    </form>
  );
}

// Documents an approver commonly asks for, to drop into the request message.
const COMMON_DOCUMENTS = [
  'Signed permission letter from the principal / head of institute',
  'Event proposal with schedule',
  'Guest speaker details and consent',
  'Budget or sponsorship letter',
  'Safety and crowd management plan',
];

const TRAIL_TITLES: Record<TrailEntry['kind'], string> = {
  documents_requested: 'Documents requested',
  status_change: 'Status changed',
  query: 'Query',
  comment: 'Reply',
};

function RequestDetail({ request, role, onClose, onReview, onReply }: {
  request: RequestItem;
  role: string;
  onClose: () => void;
  onReview: (id: string, intent: 'request_documents' | 'decline' | 'approve', message: string) => Promise<void>;
  onReply: (id: string, message: string, files: File[]) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = OPEN_STATUSES.includes(request.status);
  const lastRequest = [...request.trail].reverse().find(t => t.kind === 'documents_requested');

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true); setError('');
    try { await fn(); setMessage(''); setFiles([]); after?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };
  const review = (intent: 'request_documents' | 'decline' | 'approve') => {
    if (intent === 'request_documents' && !message.trim()) { setError('Say which documents the applicant should upload.'); return; }
    if (intent === 'decline' && !message.trim()) { setError('Give the applicant a reason for declining.'); return; }
    run(() => onReview(request.id, intent, message.trim()), intent === 'request_documents' ? undefined : onClose);
  };
  const addDocument = (doc: string) =>
    setMessage(m => m.includes(doc) ? m : (m.trim() ? `${m.trim()}\n- ${doc}` : `Please upload:\n- ${doc}`));

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal request-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <div className="modal-header">
          <div><div className="eyebrow">{role === 'Approver' ? 'APPLICATION REVIEW' : 'MY APPLICATION'} <span className="eyebrow-separator">/</span> {request.ref}</div><h2 id="request-detail-title">{request.title}</h2><p>Submitted {request.submitted} by {request.applicant}</p></div>
          <button className="icon-btn" aria-label="Close application" onClick={onClose} disabled={busy}><X size={19} /></button>
        </div>
        <div className="detail-status-row"><Status>{request.statusLabel}</Status><span className="institute-tag">{request.institute}</span><span className="event-type">{request.type}</span></div>
        <div className="request-summary">
          <div><span>Requested slot</span><strong>{fmtDate(request.date)} · {request.time}</strong></div>
          <div><span>Expected attendees</span><strong>{request.attendees || '—'}</strong></div>
          <div><span>Contact person</span><strong>{request.contact}</strong><span>{request.email}</span></div>
        </div>
        <div className="detail-docs"><strong>Event purpose</strong><p>{request.purpose}</p></div>
        <div className="detail-docs"><strong>Equipment &amp; requirements</strong><p>{request.equipment || 'No additional requirements listed.'}{request.livestreamRequested ? ' Livestream / recording requested.' : ''}</p></div>

        <div className="documents-block">
          <div className="documents-heading"><strong>Supporting documents</strong><span>{request.docs.length} file{request.docs.length === 1 ? '' : 's'}</span></div>
          {request.docs.length ? request.docs.map(doc => (
            <div className="document-row" key={doc.id}>
              {doc.contentType.startsWith('image/')
                ? <a href={doc.url} target="_blank" rel="noopener noreferrer" className="doc-thumb"><img src={doc.url} alt={doc.name} loading="lazy" /></a>
                : <span className="document-icon"><FileText size={16} /></span>}
              <span className="doc-name"><span>{doc.name}</span><small>{fmtBytes(doc.sizeBytes)} · uploaded {fmtWhen(doc.uploadedAt)}</small></span>
              <a className="icon-btn" href={doc.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${doc.name}`}><Eye size={15} /></a>
            </div>
          )) : <div className="no-documents"><AlertCircle size={15} /> No supporting documents attached yet.</div>}
        </div>

        {request.trail.length > 0 && (
          <div className="trail">
            <strong className="trail-heading">Approval trail</strong>
            {request.trail.map(t => (
              <div className={`trail-entry trail-${t.authorRole}`} key={t.id}>
                <div className="trail-meta"><MessageSquareText size={13} /><strong>{t.kind === 'status_change' && t.toStatus ? APPLICATION_STATUS_LABELS[t.toStatus] : TRAIL_TITLES[t.kind]}</strong><span>{t.authorName} · {fmtWhen(t.at)}</span></div>
                {t.body && <p>{t.body}</p>}
              </div>
            ))}
          </div>
        )}

        {role === 'Approver' && open && (
          <div className="review-panel">
            <Field label="Message to the applicant" hint="Required to request documents or decline. Shown on the approval trail.">
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder="e.g. Please upload the signed permission letter from your principal." disabled={busy} />
            </Field>
            <div className="chip-row" aria-label="Request a specific document">
              <span>Request:</span>
              {COMMON_DOCUMENTS.map(d => <button type="button" className="chip" key={d} onClick={() => addDocument(d)} disabled={busy}><Plus size={12} />{d}</button>)}
            </div>
            {error && <div className="form-error" role="alert"><AlertCircle size={15} />{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => review('request_documents')} disabled={busy}><MessageSquareText size={14} /> Request documents</button>
              <button className="btn btn-danger-outline" onClick={() => review('decline')} disabled={busy}><XCircle size={14} /> Decline</button>
              <button className="btn btn-primary" onClick={() => review('approve')} disabled={busy}><Check size={15} /> Approve booking</button>
            </div>
          </div>
        )}

        {role === 'Applier' && open && (
          <div className="review-panel">
            {request.status === 'changes_requested' && lastRequest && (
              <div className="query-note">
                <MessageSquareText size={16} />
                <div><strong>The approver asked for</strong><p className="pre-line">{lastRequest.body}</p></div>
              </div>
            )}
            <Field label={request.status === 'changes_requested' ? 'Your reply' : 'Message to the approver'}>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder="Add a note, or describe the documents you are attaching." disabled={busy} />
            </Field>
            <FilePicker files={files} setFiles={setFiles} hint="Attach the requested documents · PDF, DOC, DOCX, PNG or JPEG · up to 4 MB each" />
            {error && <div className="form-error" role="alert"><AlertCircle size={15} />{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={onClose} disabled={busy}>Close</button>
              <button className="btn btn-primary" disabled={busy || (!message.trim() && files.length === 0) || files.some(f => f.size > MAX_FILE_BYTES)} onClick={() => run(() => onReply(request.id, message.trim(), files))}><Send size={14} /> {busy ? 'Sending…' : 'Send to approver'}</button>
            </div>
          </div>
        )}

        {!open && (
          <div className="approval-note"><ShieldCheck size={16} /><p>This application is {request.statusLabel.toLowerCase()}. {request.status === 'approved' ? 'The event is on the shared calendar.' : 'No further changes can be made.'}</p></div>
        )}
        {role === 'Viewer' && open && (
          <div className="approval-note"><ShieldCheck size={16} /><p>Applications are handled by the applier and VDT approvers.</p></div>
        )}
      </div>
    </div>
  );
}

export default function VAuditorium({ events, applications: requests, today }: { events: EventItem[]; applications: RequestItem[]; today: string }) {
  const now = new Date(`${today}T12:00:00`);
  const revalidator = useRevalidator();
  const [active, setActive] = useState('Calendar');
  const [role, setRole] = useState('Viewer');
  const [theme, setTheme] = useState('light');
  const [mobileNav, setMobileNav] = useState(false);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  // Kept as an id so the open application refreshes when the server data does.
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const selectedRequest = requests.find(r => r.id === selectedRequestId) ?? null;
  const setSelectedRequest = (r: RequestItem | null) => setSelectedRequestId(r ? r.id : null);
  const [query, setQuery] = useState('');
  const [instituteFilter, setInstituteFilter] = useState('All institutes');
  const [showBooking, setShowBooking] = useState(false);
  const [toast, setToast] = useState('');
  const [suggestions, setSuggestions] = useState([{ id: 1, text: 'Add a dedicated student club showcase day', category: 'Events', date: '12 Oct 2026', status: 'Under consideration' }]);
  const [suggestion, setSuggestion] = useState('');
  const [booking, setBooking] = useState<BookingState>(EMPTY_BOOKING);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const navItems: { name: string; icon: React.ElementType; group: string }[] =
    role === 'Viewer' ? [
      { name: 'Calendar', icon: CalendarDays, group: 'Explore' },
      { name: 'Past events', icon: Video, group: 'Explore' },
      { name: 'Outcomes', icon: Trophy, group: 'Explore' },
      { name: 'Suggestions', icon: Lightbulb, group: 'Community' },
    ] : role === 'Applier' ? [
      { name: 'Calendar', icon: CalendarDays, group: 'Workspace' },
      { name: 'My applications', icon: ClipboardList, group: 'Workspace' },
      { name: 'New booking', icon: Plus, group: 'Workspace' },
      { name: 'Suggestions', icon: Lightbulb, group: 'Community' },
    ] : [
      { name: 'Overview', icon: LayoutDashboard, group: 'Administration' },
      { name: 'Calendar', icon: CalendarDays, group: 'Administration' },
      { name: 'Applications', icon: ClipboardList, group: 'Administration' },
      { name: 'Suggestions', icon: Lightbulb, group: 'Community' },
    ];

  const allEvents = events.filter(e => e.status === 'Booked' || e.status === 'Past event');
  const visibleEvents = allEvents.filter(e =>
    (instituteFilter === 'All institutes' || e.institute === instituteFilter) &&
    `${e.title} ${e.institute} ${e.type}`.toLowerCase().includes(query.toLowerCase())
  );
  const selectedEvents = visibleEvents.filter(e => e.date === selectedDate);
  const isOpen = (r: RequestItem) => OPEN_STATUSES.includes(r.status);
  const pendingCount = requests.filter(isOpen).length;
  const monthDays = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const nullPad: (null)[] = Array.from({ length: firstDay }, () => null);
  const dayNums: number[] = Array.from({ length: monthDays }, (_, i) => i + 1);
  const days: (number | null)[] = (nullPad as (number | null)[]).concat(dayNums);
  // eventDates used for calendar markers
  const eventDates = useMemo(() => new Set(allEvents.map(e => e.date)), [events]);
  const changeMonth = (dir: number) => { const d = new Date(year, month + dir, 1); setMonth(d.getMonth()); setYear(d.getFullYear()); };
  const notify = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 4200); };
  const go = (name: string) => { setActive(name); setMobileNav(false); setSelectedEvent(null); setSelectedRequest(null); if (name === 'New booking') setShowBooking(true); };
  const bookedOn = (date: string) => events.filter(e => e.date === date && e.status === 'Booked');

  const submitBooking = async (e: React.FormEvent, files: File[]) => {
    e.preventDefault();
    if (!booking.title.trim() || !booking.date || !booking.startTime || !booking.endTime || !booking.purpose.trim() || !booking.contact.trim() || !booking.email.trim()) {
      setFormError('Complete all required fields before submitting.'); return;
    }
    const problem = slotProblem(booking, bookedOn);
    if (problem) { setFormError(problem); return; }
    if (files.some(f => f.size > MAX_FILE_BYTES)) { setFormError('Remove files over 4 MB before submitting.'); return; }

    const body = new FormData();
    body.set('title', booking.title.trim());
    body.set('institute', booking.institute);
    body.set('type', booking.type.toLowerCase());
    body.set('date', booking.date);
    body.set('startTime', booking.startTime);
    body.set('endTime', booking.endTime);
    body.set('purpose', booking.purpose.trim());
    body.set('equipment', booking.equipment.trim());
    body.set('attendees', booking.attendees);
    body.set('livestream', String(booking.stream));
    body.set('contactName', booking.contact.trim());
    body.set('contactEmail', booking.email.trim());

    setBusy(true); setFormError('');
    try {
      const created = await post<{ id: string; ref: string }>('/api/applications', body);
      const failed = await uploadAll(created.id, files);
      revalidator.revalidate();
      setBooking(EMPTY_BOOKING); setShowBooking(false); setActive('My applications');
      notify(failed.length
        ? `${created.ref} submitted, but ${failed.length} file${failed.length === 1 ? '' : 's'} failed: ${failed.join(' ')} Open the application to try again.`
        : `${created.ref} submitted for review${files.length ? ` with ${files.length} document${files.length === 1 ? '' : 's'}` : ''}.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit the application.');
    } finally {
      setBusy(false);
    }
  };

  // An approver's request, decline or approval, with the message for the trail.
  const reviewApplication = async (id: string, intent: 'request_documents' | 'decline' | 'approve', message: string) => {
    const body = new FormData();
    body.set('intent', intent);
    body.set('message', message);
    await post(`/api/applications/${id}/review`, body);
    revalidator.revalidate();
    notify(intent === 'approve' ? 'Application approved. The event is now on the calendar.'
      : intent === 'decline' ? 'Application declined. The applicant can see your reason.'
      : 'Document request sent to the applicant.');
  };

  // The applier's answer: a message, plus any documents that were asked for.
  const replyToApplication = async (id: string, message: string, files: File[]) => {
    const failed = await uploadAll(id, files);
    const body = new FormData();
    body.set('message', message || `Uploaded ${files.length} document${files.length === 1 ? '' : 's'}.`);
    await post(`/api/applications/${id}/reply`, body);
    revalidator.revalidate();
    if (failed.length) throw new Error(`Reply sent, but some files failed: ${failed.join(' ')}`);
    notify('Reply sent. The application is back with the approver.');
  };

  const submitSuggestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestion.trim()) return;
    setSuggestions(prev => [{ id: Date.now(), text: suggestion.trim(), category: 'General', date: fmtDate(today), status: 'Under consideration' }, ...prev]);
    setSuggestion('');
    notify('Suggestion submitted. Thank you.');
  };

  return (
    <div className={`app theme-${theme}`} data-theme={theme}>
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Brand />
          <button className="icon-btn mobile-close" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={19} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="role-picker">
          <span className="role-avatar"><ShieldCheck size={16} /></span>
          <div className="role-picker-copy">
            <span className="role-picker-title">VDT Portal</span>
            <span className="role-picker-sub">Preview environment</span>
          </div>
          <select aria-label="Preview role" value={role} onChange={e => { setRole(e.target.value); setActive(e.target.value === 'Approver' ? 'Overview' : 'Calendar'); }}>
            <option>Viewer</option><option>Applier</option><option>Approver</option>
          </select>
        </div>
        {(['Explore','Workspace','Administration','Community'] as const).filter(g => navItems.some(n => n.group === g)).map(group => (
          <div className="nav-group" key={group}>
            <div className="nav-label">{group}</div>
            {navItems.filter(n => n.group === group).map(item => (
              <button key={item.name} className={`nav-item ${active === item.name ? 'active' : ''}`} onClick={() => go(item.name)}>
                <item.icon size={17} strokeWidth={1.8} />
                <span>{item.name}</span>
                {item.name === 'Applications' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
                {item.name === 'My applications' && <span className="nav-count">{requests.length}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><CircleHelp size={17} /></span>
            <div>
              <strong>Need help?</strong>
              <p>Learn how auditorium bookings work.</p>
              <button onClick={() => notify('Contact the VDT portal administrator for booking support.')}>View help <ArrowUpRight size={13} /></button>
            </div>
          </div>
          <div className="user-row">
            <div className="user-avatar">{role === 'Viewer' ? 'GU' : role === 'Applier' ? 'AP' : 'VD'}</div>
            <div className="user-copy">
              <strong>{role === 'Viewer' ? 'Guest viewer' : role === 'Applier' ? 'Applicant preview' : 'VDT approver'}</strong>
              <span>{role} access</span>
            </div>
            <button className="icon-btn" aria-label="Account information" onClick={() => notify('Demo environment — account management is not connected.')}><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
            <span className="breadcrumb-muted">VDT Portal</span>
            <span className="crumb-slash">/</span>
            <span className="breadcrumb-current">{active}</span>
          </div>
          <div className="topbar-actions">
            <span className="environment-pill"><span />Demo environment</span>
            <button className="icon-btn theme-toggle" aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="icon-btn notification-btn" aria-label="Notifications" onClick={() => notify('You are all caught up.')}><Bell size={17} /><i /></button>
            <div className="topbar-avatar">{role === 'Viewer' ? 'G' : role === 'Applier' ? 'A' : 'V'}</div>
          </div>
        </header>
        <div className="page-wrap">
          {active === 'Calendar' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-square" /> SHARED FACILITY <span className="eyebrow-separator">/</span> V-AUDITORIUM</div>
                  <h1>Auditorium calendar<span className="heading-period">.</span></h1>
                  <p className="page-subtitle">One shared space. Five institutes. Everything in sync.</p>
                </div>
                <div className="heading-actions">
                  {role === 'Applier' && <button className="btn btn-primary" onClick={() => setShowBooking(true)}><Plus size={16} /> New booking request</button>}
                </div>
              </div>
              <div className="notice-strip">
                <span className="notice-icon"><CalendarCheck size={17} /></span>
                <div><strong>Check availability before you apply.</strong><span>Only VDT-approved bookings appear on the public calendar.</span></div>
                <button className="text-action" onClick={() => { setRole('Applier'); setActive('New booking'); setShowBooking(true); }}>Request a date <ArrowUpRight size={14} /></button>
              </div>
              <div className="calendar-layout">
                <section className="panel calendar-panel">
                  <div className="panel-header calendar-header">
                    <div><h2>Schedule</h2><p>View auditorium availability by date</p></div>
                    <div className="calendar-controls">
                      <button className="icon-btn bordered" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button>
                      <button className="month-label" onClick={() => { setMonth(9); setYear(2026); }}>{MONTHS[month]} {year}</button>
                      <button className="icon-btn bordered" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={17} /></button>
                      <button className="today-btn" onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); setSelectedDate(isoDate(now.getFullYear(), now.getMonth(), now.getDate())); }}>Today</button>
                    </div>
                  </div>
                  <div className="calendar-legend">
                    <span><i className="legend-dot booked" />Booked</span>
                    <span><i className="legend-dot selected" />Selected date</span>
                    <span><i className="legend-dot available" />Available</span>
                  </div>
                  <div className="calendar-grid">
                    <div className="weekday-row">{['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => <span key={d}>{d}</span>)}</div>
                    <div className="days-grid">
                      {days.map((d, i) => {
                        if (d === null) return <div className="day-empty" key={`empty-${i}`} />;
                        const date = isoDate(year, month, d);
                        const items = allEvents.filter(e => e.date === date);
                        const isSelected = selectedDate === date;
                        const isToday = date === isoDate(now.getFullYear(), now.getMonth(), now.getDate());
                        return (
                          <button key={date} className={`day-cell ${isSelected ? 'day-selected' : ''} ${isToday ? 'day-today' : ''} ${items.length ? 'has-events' : ''}`} onClick={() => setSelectedDate(date)} aria-label={`${fmtDate(date)}, ${items.length ? String(items.length) + ' event(s)' : 'no events'}`}>
                            <span className="day-number">{d}</span>
                            {items.length > 0 && <span className="day-event-markers">{items.slice(0, 2).map((e, j) => <i key={String(e.id)} className={`event-marker marker-${j}`} />)}</span>}
                            {items.length > 0 && <span className="day-event-count">{items.length} {items.length === 1 ? 'event' : 'events'}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="calendar-footer">
                    <span><span className="footer-live-dot" /> Schedule updates when an application is approved</span>
                    <button className="text-action" onClick={() => notify('Calendar export will be available after backend integration.')}><Download size={14} /> Export calendar</button>
                  </div>
                </section>
                <section className="panel selected-day-panel">
                  <div className="panel-header selected-day-head">
                    <div>
                      <div className="eyebrow">SELECTED DATE</div>
                      <h2>{fmtDate(selectedDate, { weekday: 'short', day: 'numeric', month: 'long' })}</h2>
                      <p>{selectedEvents.length ? `${selectedEvents.length} scheduled ${selectedEvents.length === 1 ? 'event' : 'events'}` : 'No confirmed events'}</p>
                    </div>
                    <span className={`date-status ${selectedEvents.length ? 'date-status-booked' : 'date-status-free'}`}><i />{selectedEvents.length ? 'Booked' : 'Available'}</span>
                  </div>
                  <div className="selected-events">
                    {selectedEvents.length ? selectedEvents.map(ev => (
                      <button className="event-card" key={String(ev.id)} onClick={() => setSelectedEvent(ev)}>
                        <div className="event-card-top"><span className="event-type">{ev.type}</span><span className="event-card-arrow"><ArrowUpRight size={15} /></span></div>
                        <h3>{ev.title}</h3>
                        <div className="event-card-meta">
                          <span><Clock3 size={13} />{ev.time}</span>
                          <span><Building2 size={13} />{ev.institute}</span>
                        </div>
                        <p>{ev.description}</p>
                        <div className="event-card-bottom">
                          <span><Users size={14} />{ev.attendees || '—'} attendees</span>
                          <Status>{ev.status}</Status>
                        </div>
                      </button>
                    )) : (
                      <div className="empty-date">
                        <div className="empty-icon"><CalendarDays size={22} /></div>
                        <strong>This date is open</strong>
                        <p>No confirmed booking on this date yet. Applications are subject to VDT approval.</p>
                        {role === 'Applier' && <button className="btn btn-primary btn-small" onClick={() => { setBooking(p => ({ ...p, date: selectedDate })); setShowBooking(true); }}><Plus size={14} /> Apply for this date</button>}
                        {role !== 'Applier' && <button className="btn btn-outline btn-small" onClick={() => notify('Switch to Applier in the role selector to preview the booking flow.')}>How to book <ArrowUpRight size={13} /></button>}
                      </div>
                    )}
                  </div>
                  <div className="day-panel-bottom">
                    <div className="mini-stat"><span className="mini-stat-icon"><CalendarDays size={15} /></span><div><strong>{monthDays}</strong><span>Days this month</span></div></div>
                    <div className="mini-stat"><span className="mini-stat-icon"><Building2 size={15} /></span><div><strong>05</strong><span>VDT institutes</span></div></div>
                  </div>
                </section>
              </div>
              <section className="below-calendar">
                <div className="section-heading">
                  <div><h2>Upcoming events</h2><p>Confirmed events across all VDT institutes</p></div>
                  <button className="text-action" onClick={() => setActive('Past events')}>View event archive <ArrowUpRight size={14} /></button>
                </div>
                <div className="toolbar">
                  <div className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events, institutes..." aria-label="Search events" /><kbd>⌘ K</kbd></div>
                  <div className="filter-field"><Filter size={15} /><select value={instituteFilter} onChange={e => setInstituteFilter(e.target.value)} aria-label="Filter by institute"><option>All institutes</option>{INSTITUTES.map(i => <option key={i}>{i}</option>)}</select></div>
                  <span className="results-count">{visibleEvents.length} events</span>
                </div>
                <div className="event-list">
                  {visibleEvents.filter(e => e.date >= isoDate(year, month, 1)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4).map(ev => (
                    <button className="event-row" key={String(ev.id)} onClick={() => setSelectedEvent(ev)}>
                      <div className="event-date-block">
                        <span>{fmtDate(ev.date, { month: 'short' }).toUpperCase()}</span>
                        <strong>{new Date(`${ev.date}T12:00:00`).getDate()}</strong>
                      </div>
                      <div className="event-row-content">
                        <div className="event-row-title"><h3>{ev.title}</h3><span className="event-type">{ev.type}</span></div>
                        <p>{ev.institute} <span>·</span> {ev.owner}</p>
                      </div>
                      <div className="event-row-time"><Clock3 size={14} />{ev.time}</div>
                      <ArrowUpRight className="row-arrow" size={17} />
                    </button>
                  ))}
                  {visibleEvents.filter(e => e.date >= isoDate(year, month, 1)).length === 0 && <div className="no-results">No events match these filters. Try another institute or search term.</div>}
                </div>
              </section>
            </>
          )}

          {active === 'Past events' && (
            <>
              <PageTitle eyebrow="EVENT ARCHIVE" title="Past events" subtitle="Revisit moments, talks and gatherings from V-Auditorium." />
              <div className="toolbar archive-toolbar">
                <div className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search past events..." /></div>
                <div className="filter-field"><Filter size={15} /><select value={instituteFilter} onChange={e => setInstituteFilter(e.target.value)}><option>All institutes</option>{INSTITUTES.map(i => <option key={i}>{i}</option>)}</select></div>
              </div>
              <div className="archive-grid">
                {visibleEvents.filter(e => e.status === 'Past event').map(e => (
                  <div className="panel archive-card" key={String(e.id)}>
                    <div className="archive-art"><Video size={27} /><span>V-AUDITORIUM / ARCHIVE</span><span className="archive-art-date">{fmtDate(e.date, { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
                    <div className="archive-card-body">
                      <div className="event-card-top"><span className="event-type">{e.type}</span><span className="institute-tag">{e.institute}</span></div>
                      <h3>{e.title}</h3>
                      <p>{e.description}</p>
                      <div className="archive-card-footer">
                        {e.stream ? <span className="stream-label"><Video size={14} /> Stream available</span> : <span className="muted-inline">No stream linked</span>}
                        <button className="text-action" onClick={() => setSelectedEvent(e)}>View details <ArrowUpRight size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {visibleEvents.filter(e => e.status === 'Past event').length === 0 && <EmptyState icon={Video} title="No past events found" body="Try changing your search or institute filter." />}
            </>
          )}

          {active === 'Outcomes' && (
            <>
              <PageTitle eyebrow="RESULTS &amp; RECOGNITION" title="Event outcomes" subtitle="Highlights, achievements and results from events hosted at V-Auditorium." />
              <div className="metric-grid">
                <Metric icon={Trophy} label="Published outcomes" value="01" note="Across VDT institutes" />
                <Metric icon={Users} label="Institutes represented" value="05" note="One shared community" />
                <Metric icon={Video} label="Recorded events" value="01" note="Streams available where linked" />
              </div>
              <div className="panel outcomes-panel">
                <div className="panel-header"><div><h2>Published results</h2><p>Official event outcomes shared by organisers</p></div><span className="subtle-count">01 RESULT</span></div>
                <div className="outcome-row">
                  <div className="outcome-icon"><Trophy size={20} /></div>
                  <div className="outcome-content">
                    <span className="eyebrow">17 OCT 2026 <span className="eyebrow-separator">/</span> VIT</span>
                    <h3>Welcome to VDT</h3>
                    <p>Event completed successfully. The archive entry is available for viewers.</p>
                    <span className="result-chip"><CheckCircle2 size={13} /> Published outcome</span>
                  </div>
                  <button className="btn btn-outline btn-small" onClick={() => { const ev = events.find(e => e.result); if (ev) setSelectedEvent(ev); }}>View event <ArrowUpRight size={14} /></button>
                </div>
                <div className="empty-inline"><Sparkles size={16} /><span>More results will appear here as organisers publish outcomes.</span></div>
              </div>
            </>
          )}

          {active === 'Suggestions' && (
            <>
              <PageTitle eyebrow="COMMUNITY INPUT" title="Suggestion box" subtitle="Help improve how V-Auditorium serves the VDT community." />
              <div className="suggestion-layout">
                <section className="panel suggestion-form-panel">
                  <div className="panel-header"><div><h2>Share an idea</h2><p>Suggestions are reviewed by the portal team.</p></div><span className="suggestion-spark"><Lightbulb size={19} /></span></div>
                  <form onSubmit={submitSuggestion} className="form-stack">
                    <Field label="Your suggestion" required>
                      <textarea value={suggestion} onChange={e => setSuggestion(e.target.value)} required minLength={8} placeholder="What would make the auditorium or booking experience better?" rows={5} />
                    </Field>
                    <p className="field-help">Avoid including personal or confidential information.</p>
                    <button className="btn btn-primary" type="submit"><Send size={15} /> Submit suggestion</button>
                  </form>
                </section>
                <section className="suggestions-list-section">
                  <div className="section-heading"><div><h2>Community ideas</h2><p>{suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'} in this demo</p></div></div>
                  {suggestions.map(s => (
                    <div className="panel suggestion-item" key={s.id}>
                      <div className="suggestion-item-top"><span className="event-type">{s.category}</span><Status>{s.status}</Status></div>
                      <p>{s.text}</p>
                      <span className="suggestion-date">Submitted {s.date}</span>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}

          {active === 'New booking' && (
            <>
              <PageTitle eyebrow="BOOKING WORKSPACE" title="New booking request" subtitle="Submit an auditorium booking application for VDT-level approval." />
              <BookingForm booking={booking} setBooking={setBooking} onSubmit={submitBooking} onCancel={() => setActive('Calendar')} error={formError} bookedOn={bookedOn} minDate={today} busy={busy} />
            </>
          )}

          {active === 'My applications' && (
            <>
              <PageTitle eyebrow="BOOKING WORKSPACE" title="My applications" subtitle="Track booking requests and respond to requests for more information." actions={<button className="btn btn-primary" onClick={() => setShowBooking(true)}><Plus size={15} /> New application</button>} />
              <div className="metric-grid">
                <Metric icon={ClipboardList} label="Applications" value={String(requests.length).padStart(2, '0')} note="Submitted in this demo" />
                <Metric icon={Clock3} label="In review" value={String(requests.filter(isOpen).length).padStart(2, '0')} note="Awaiting a decision" />
                <Metric icon={CheckCircle2} label="Approved" value={String(requests.filter(r => r.status === 'approved').length).padStart(2, '0')} note="Confirmed bookings" />
              </div>
              <div className="panel table-panel">
                <div className="panel-header"><div><h2>Application history</h2><p>Updates from the VDT approval process</p></div><span className="subtle-count">{requests.length} RECORDS</span></div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>APPLICATION</th><th>REQUESTED DATE</th><th>SUBMITTED</th><th>STATUS</th><th /></tr></thead>
                    <tbody>
                      {requests.map(r => (
                        <tr key={r.id}>
                          <td><div className="table-title">{r.title}</div><span className="table-sub">{r.ref} · {r.institute}</span></td>
                          <td>{fmtDate(r.date)}</td>
                          <td>{r.submitted}</td>
                          <td><Status>{r.statusLabel}</Status></td>
                          <td><button className="icon-btn" aria-label={`View ${r.title}`} onClick={() => setSelectedRequest(r)}><ArrowUpRight size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {active === 'Overview' && (
            <>
              <PageTitle eyebrow="VDT ADMINISTRATION" title="Approval overview" subtitle="A clear view of auditorium requests and the shared schedule." actions={<button className="btn btn-primary" onClick={() => setActive('Applications')}>Review applications <ArrowUpRight size={15} /></button>} />
              <div className="metric-grid">
                <Metric icon={ClipboardList} label="Awaiting review" value={String(pendingCount).padStart(2, '0')} note="Applications need attention" />
                <Metric icon={CalendarCheck} label="Confirmed events" value={String(allEvents.filter(e => e.status === 'Booked').length).padStart(2, '0')} note="On the shared calendar" />
                <Metric icon={Building2} label="Institutes" value="05" note="Sharing one auditorium" />
                <Metric icon={Clock3} label="Next event" value="20 OCT" note="Annual Research Symposium" />
              </div>
              <div className="overview-columns">
                <div className="panel table-panel">
                  <div className="panel-header"><div><h2>Needs your review</h2><p>Applications awaiting an approval decision</p></div><button className="text-action" onClick={() => setActive('Applications')}>View all <ArrowUpRight size={14} /></button></div>
                  {requests.filter(isOpen).slice(0, 3).map(r => (
                    <button className="review-row" key={r.id} onClick={() => setSelectedRequest(r)}>
                      <span className="review-doc-icon"><FileText size={17} /></span>
                      <span className="review-copy"><strong>{r.title}</strong><span>{r.ref} · {r.institute} · {fmtDate(r.date, { day: 'numeric', month: 'short' })}</span></span>
                      <Status>{r.statusLabel}</Status>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
                <div className="panel overview-note">
                  <div className="overview-note-icon"><ShieldCheck size={20} /></div>
                  <h3>One approval trail</h3>
                  <p>Keep queries, supporting documents and decisions together with each application.</p>
                  <button className="text-action" onClick={() => setActive('Applications')}>Open approval queue <ArrowUpRight size={14} /></button>
                </div>
              </div>
            </>
          )}

          {active === 'Applications' && (
            <>
              <PageTitle eyebrow="VDT ADMINISTRATION" title="Booking applications" subtitle="Review event details, verify documents and make approval decisions." />
              <div className="toolbar applications-toolbar">
                <div className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search applications..." /></div>
                <div className="filter-field"><Filter size={15} /><select value={instituteFilter} onChange={e => setInstituteFilter(e.target.value)}><option>All institutes</option>{INSTITUTES.map(i => <option key={i}>{i}</option>)}</select></div>
                <span className="results-count">{requests.filter(r => (instituteFilter === 'All institutes' || r.institute === instituteFilter) && `${r.title} ${r.ref} ${r.applicant}`.toLowerCase().includes(query.toLowerCase())).length} applications</span>
              </div>
              <div className="application-list">
                {requests.filter(r => (instituteFilter === 'All institutes' || r.institute === instituteFilter) && `${r.title} ${r.ref} ${r.applicant}`.toLowerCase().includes(query.toLowerCase())).map(r => (
                  <button className="panel application-row" key={r.id} onClick={() => setSelectedRequest(r)}>
                    <span className="application-file-icon"><FileText size={20} /></span>
                    <span className="application-row-copy">
                      <span className="application-id">{r.ref} <i /> {r.institute}</span>
                      <strong>{r.title}</strong>
                      <span className="application-meta">
                        <span><CalendarDays size={13} />{fmtDate(r.date)}</span>
                        <span><Users size={13} />{r.attendees || '—'} attendees</span>
                        <span><Paperclip size={13} />{r.docs?.length || 0} documents</span>
                      </span>
                    </span>
                    <span className="application-row-end"><Status>{r.statusLabel}</Status><ChevronRight size={17} /></span>
                  </button>
                ))}
              </div>
              {requests.every(r => (instituteFilter !== 'All institutes' && r.institute !== instituteFilter) || !`${r.title} ${r.ref} ${r.applicant}`.toLowerCase().includes(query.toLowerCase())) && <EmptyState icon={ClipboardList} title="No applications found" body="Try a different search or institute filter." />}
            </>
          )}

          <footer className="app-footer">
            <div className="footer-brand"><span className="footer-square" />VAUDITORIUM <span className="footer-divider">/</span> VOSS LABS</div>
            <span>Built for the VDT community</span>
            <span>Preview · 2026</span>
          </footer>
        </div>
      </main>

      {showBooking && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) { setShowBooking(false); setFormError(''); } }}>
          <div className="modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
            <div className="modal-header">
              <div><div className="eyebrow">NEW APPLICATION <span className="eyebrow-separator">/</span> PHASE 02</div><h2 id="booking-title">Book V-Auditorium</h2><p>Provide the event details and supporting documents.</p></div>
              <button className="icon-btn" aria-label="Close booking form" onClick={() => { setShowBooking(false); setFormError(''); }}><X size={19} /></button>
            </div>
            <BookingForm booking={booking} setBooking={setBooking} onSubmit={submitBooking} onCancel={() => { setShowBooking(false); setFormError(''); }} error={formError} bookedOn={bookedOn} minDate={today} busy={busy} compact />
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedEvent(null); }}>
          <div className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
            <div className="modal-header">
              <div><div className="eyebrow">EVENT DETAILS <span className="eyebrow-separator">/</span> {selectedEvent.institute}</div><h2 id="event-detail-title">{selectedEvent.title}</h2><p>{fmtDate(selectedEvent.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
              <button className="icon-btn" aria-label="Close event details" onClick={() => setSelectedEvent(null)}><X size={19} /></button>
            </div>
            <div className="detail-status-row"><Status>{selectedEvent.status}</Status><span className="event-type">{selectedEvent.type}</span></div>
            <p className="detail-description">{selectedEvent.description}</p>
            <div className="detail-info-grid">
              <DetailInfo icon={Clock3} label="Schedule" value={selectedEvent.time} />
              <DetailInfo icon={Building2} label="Institute" value={selectedEvent.institute} />
              <DetailInfo icon={Users} label="Expected attendees" value={selectedEvent.attendees || 'Not specified'} />
              <DetailInfo icon={MapPin} label="Venue" value="V-Auditorium" />
            </div>
            <div className="detail-docs"><strong>Requirements</strong><p>{selectedEvent.equipment || 'No additional requirements listed.'}</p></div>
            {selectedEvent.stream && (
              <div className="stream-banner">
                <span><Video size={17} /></span>
                <div><strong>Livestream / recording</strong><p>A stream is listed for this event. Link availability depends on the organiser.</p></div>
                <button className="icon-btn" aria-label="Livestream information" onClick={() => notify('The YouTube URL must be added by the event organiser.')}><ExternalLink size={16} /></button>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSelectedEvent(null)}>Close</button>
              {role === 'Applier' && selectedEvent.status !== 'Past event' && <button className="btn btn-primary" onClick={() => { setBooking(p => ({ ...p, date: selectedEvent.date })); setSelectedEvent(null); setShowBooking(true); }}>Apply for a date <ArrowUpRight size={14} /></button>}
            </div>
          </div>
        </div>
      )}

      {selectedRequest && (
        <RequestDetail
          request={selectedRequest}
          role={role}
          onClose={() => setSelectedRequest(null)}
          onReview={reviewApplication}
          onReply={replyToApplication}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button className="icon-btn" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
