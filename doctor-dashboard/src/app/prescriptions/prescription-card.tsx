import Link from 'next/link';
import { computeAge, formatDate, formatDateTime, formatDayShort, formatSlotTime } from '@/lib/format';

export type PrescriptionItem = {
  id: string;
  medicine: string;
  dose: string;
  frequency: string;
  duration: string | null;
  notes: string | null;
  position: number;
  /** Added by migration 0055; absent or null on older prescriptions. */
  brand?: string | null;
  strength?: string | null;
  route?: string | null;
  timing?: string | null;
};

export type PrescriptionCardData = {
  id: string;
  issued_at: string;
  notes: string | null;
  appointment_id: string | null;
  doctor_name: string | null;
  qualifications: string | null;
  registration_number: string | null;
  prescription_items: PrescriptionItem[];
  /** Clinical note, advice and follow-up (migration 0055); null on older prescriptions. */
  chief_complaints?: string | null;
  examination?: string | null;
  diagnosis?: string | null;
  advice?: string | null;
  follow_up_date?: string | null;
  follow_up_text?: string | null;
  /** The linked visit's slot, when the query joined it. */
  appointments?: { date: string; time: string } | null;
};

/** Columns for the medicines table (wide cards only). */
const MED_COLS = '@xl:grid-cols-[1.6fr_1fr_1.2fr_0.9fr_1.6fr]';

/**
 * One issued prescription as a bordered card: who it is for and when, who
 * issued it (the snapshot taken at issue time), the medicines, the general
 * note and the linked visit. Used on the prescriptions list, the
 * child-specific list and the consultation page. It is a container-query
 * card: the medicines are a table when the card is wide and a stacked list
 * when it is narrow (phone, or the consultation page's side column).
 */
export function PrescriptionCard({
  rx,
  child,
  parentName,
  linkConsult = true,
  className,
  style,
  preview = false,
}: {
  rx: PrescriptionCardData;
  child: { name: string; dob: string | null } | null;
  parentName?: string | null;
  /** Off on the consultation page, which is the linked visit. */
  linkConsult?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** The new-prescription page's live preview: a "Preview" tag instead of the Rx id. */
  preview?: boolean;
}) {
  const items = [...rx.prescription_items].sort((a, b) => a.position - b.position);
  const clinical = [
    { label: 'Complaints', value: rx.chief_complaints },
    { label: 'Findings', value: rx.examination },
    { label: 'Diagnosis', value: rx.diagnosis },
  ].filter((c): c is { label: string; value: string } => Boolean(c.value?.trim()));
  const followUp = [rx.follow_up_date ? formatDate(rx.follow_up_date) : null, rx.follow_up_text?.trim()].filter(Boolean).join(' · ');
  const doctorBits = [rx.qualifications?.trim(), rx.registration_number?.trim() ? `Reg. no. ${rx.registration_number.trim()}` : null].filter(Boolean);

  return (
    <article
      className={`@container overflow-hidden rounded-2xl border border-[var(--hairline-strong)] bg-[var(--card)] ${className ?? ''}`}
      style={style}
      aria-label={`Prescription ${rx.id.slice(0, 6)}`}
    >
      {/* Header: patient, issue date, short id */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-[var(--hairline)] bg-[var(--paper-soft)] px-4 py-3.5 @md:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="text-[17px] font-semibold leading-tight text-[var(--ink)]">{child?.name ?? 'Unknown'}</span>
            {child?.dob && <span className="text-[13px] text-[var(--ink-3)]">{computeAge(child.dob)}</span>}
          </div>
          {parentName ? <div className="mt-0.5 text-[13px] text-[var(--ink-3)]">Parent · {parentName}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--ink-2)]">
          <span>Issued {formatDateTime(rx.issued_at)}</span>
          {preview ? (
            <span
              style={{ borderColor: 'var(--accent)' }}
              className="rounded-md border border-dashed bg-[var(--accent-pale)] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--accent)]">
              Preview
            </span>
          ) : (
            <span
              className="rounded-md border border-[var(--hairline-strong)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-2)]"
              title={`Prescription ${rx.id}`}
            >
              Rx {rx.id.slice(0, 6)}
            </span>
          )}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 @md:px-5">
        {/* Issuing doctor, as printed on the prescription */}
        <div className="text-[13px] leading-[1.5] text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">{rx.doctor_name?.trim() || 'Doctor'}</span>
          {doctorBits.length > 0 && <span className="text-[var(--ink-3)]"> · {doctorBits.join(' · ')}</span>}
        </div>

        {/* Clinical note (0055): complaints, findings, diagnosis */}
        {clinical.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[14px] leading-[1.5] @md:grid-cols-[6.5rem_1fr]">
            {clinical.map((c) => (
              <div key={c.label} className="contents">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] @md:pt-[3px]">{c.label}</dt>
                <dd
                  className={`whitespace-pre-line break-words ${
                    c.label === 'Diagnosis' ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'
                  }`}
                >
                  {c.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Medicines */}
        {items.length === 0 ? (
          <p className="text-[14px] text-[var(--ink-3)]">No medicines on this prescription.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
            <div
              className={`hidden ${MED_COLS} gap-3 border-b border-[var(--hairline)] bg-[var(--paper)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] @xl:grid`}
              aria-hidden
            >
              <span>Medicine</span>
              <span>Dose</span>
              <span>Frequency</span>
              <span>Duration</span>
              <span>Notes</span>
            </div>
            <ol>
              {items.map((it, i) => (
                <li
                  key={it.id}
                  className={`grid grid-cols-1 gap-x-3 gap-y-1 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0 ${MED_COLS} @xl:items-baseline`}
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="font-mono text-[11px] text-[var(--accent)]">{i + 1}.</span>
                    <span className="min-w-0 break-words">
                      <span className="text-[15px] font-semibold text-[var(--ink)]">{it.medicine}</span>
                      {it.brand?.trim() && <span className="text-[13px] text-[var(--ink-3)]"> ({it.brand.trim()})</span>}
                      {it.strength?.trim() && (
                        <span className="block text-[12px] text-[var(--ink-3)]">{it.strength.trim()}</span>
                      )}
                    </span>
                  </div>
                  {/* Narrow: dose · frequency · duration on one line under the name */}
                  <div className="pl-5 text-[13px] text-[var(--ink-2)] @xl:hidden">
                    {[it.dose, it.route, it.frequency, it.timing, it.duration].filter((x) => x?.trim()).join(' · ')}
                  </div>
                  <span className="hidden break-words text-[14px] text-[var(--ink-2)] @xl:block">
                    {it.dose}
                    {it.route?.trim() && <span className="block text-[12px] text-[var(--ink-3)]">{it.route.trim()}</span>}
                  </span>
                  <span className="hidden break-words text-[14px] text-[var(--ink-2)] @xl:block">
                    {it.frequency}
                    {it.timing?.trim() && <span className="block text-[12px] text-[var(--ink-3)]">{it.timing.trim()}</span>}
                  </span>
                  <span className="hidden break-words text-[14px] text-[var(--ink-2)] @xl:block">{it.duration || '—'}</span>
                  {it.notes ? (
                    <span className="whitespace-pre-line break-words pl-5 text-[13px] leading-[1.45] text-[var(--ink-3)] @xl:pl-0">
                      {it.notes}
                    </span>
                  ) : (
                    <span className="hidden text-[13px] text-[var(--ink-4)] @xl:block">—</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Special instructions (0055) */}
        {rx.advice?.trim() && (
          <div
            className="rounded-xl border border-[var(--hairline-strong)] border-l-[3px] bg-[var(--card)] px-4 py-3"
            style={{ borderLeftColor: 'var(--accent)' }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Special instructions</div>
            <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-[1.55] text-[var(--ink)]">{rx.advice}</p>
          </div>
        )}

        {followUp && (
          <div className="flex flex-wrap items-baseline gap-x-2 text-[14px] text-[var(--ink)]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Follow-up</span>
            <span className="font-medium">{followUp}</span>
          </div>
        )}

        {/* General notes */}
        {rx.notes && (
          <div className="rounded-xl bg-[var(--paper-soft)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Notes</div>
            <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-[1.55] text-[var(--ink-2)]">{rx.notes}</p>
          </div>
        )}

        {/* Linked consult */}
        {linkConsult && (
          <div className="border-t border-[var(--hairline)] pt-3 text-[13px]">
            {rx.appointment_id ? (
              <Link href={`/consultations/${rx.appointment_id}`} className="link-underline font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">
                {rx.appointments
                  ? `Consult · ${formatDayShort(rx.appointments.date)}, ${formatSlotTime(rx.appointments.time)} →`
                  : 'Open the linked consult →'}
              </Link>
            ) : (
              <span className="text-[var(--ink-4)]">Issued from chat · no linked consult</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
