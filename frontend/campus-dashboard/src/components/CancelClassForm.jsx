import { useEffect, useMemo, useState } from 'react';
import { useUser } from '../context/UserContext';
import { getCsrfToken } from '../lib/csrf';
import { CANCEL_REASONS, timeRangesOverlap, todayISO } from '../lib/cancellations';
import { dayFromDate } from '../lib/roomBooking';
import { BATCHES, DEPARTMENTS, DEPT_SECTIONS, from12h, to12h } from '../lib/routines';
import { BanIcon, CalendarIcon, ClockIcon } from './Icons';

const inputCls =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm outline-none transition focus:border-lime-deep/60 focus:ring-2 focus:ring-lime/30';
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400';

/**
 * The "Cancel a Class" form — department/batch/section cascade, date + time
 * slot, course picker fed by the published routine, and a reason. Shared by
 * the CancelClassModal (faculty dashboard / routine view) and the dedicated
 * Faculty Cancellations page.
 */
export default function CancelClassForm({
  defaultDepartment = '',
  defaultBatch = '',
  defaultSection = '',
  defaultDate = '',
  defaultCourseCode = '',
  defaultStartTime = '',
  defaultEndTime = '',
  submitLabel = 'Cancel Class & Send Notice to Students',
  cancelLabel = 'Discard',
  idPrefix = 'cc',
  onCancel,
  onSuccess,
}) {
  const { department: myDepartment } = useUser();

  const [form, setForm] = useState({
    department: defaultDepartment || myDepartment || '',
    batch: defaultBatch || '',
    section: defaultSection || '',
    date: defaultDate || todayISO(),
    start_time: defaultStartTime || '10:30',
    end_time: defaultEndTime || '11:45',
    course_code: defaultCourseCode || '',
    reason: 'faculty_unavailable',
    reason_note: '',
  });
  const [subjects, setSubjects] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      department: defaultDepartment || myDepartment || '',
      batch: defaultBatch || '',
      section: defaultSection || '',
      date: defaultDate || todayISO(),
      start_time: defaultStartTime || '10:30',
      end_time: defaultEndTime || '11:45',
      course_code: defaultCourseCode || '',
    }));
  }, [defaultDepartment, defaultBatch, defaultSection, defaultDate, defaultCourseCode, defaultStartTime, defaultEndTime, myDepartment]);

  // Fetch routine subjects for the course datalist once the cascade is picked.
  useEffect(() => {
    let cancelled = false;
    if (!(form.department && form.batch && form.section)) {
      setSubjects([]);
      return () => {};
    }
    fetch(
      `/api/routines/?department=${form.department}&batch=${form.batch}&section=${form.section}`,
      { credentials: 'same-origin', headers: { Accept: 'application/json' } },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // Normalize 12h API times to 24h so overlap checks + prefill work.
        setSubjects(
          (data.slots || []).map((s) => ({
            ...s,
            start_time: from12h(s.start_time),
            end_time: from12h(s.end_time),
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.department, form.batch, form.section]);

  const sections = useMemo(() => DEPT_SECTIONS[form.department] || [], [form.department]);
  const weekday = dayFromDate(form.date);
  const matchingSubject = useMemo(
    () =>
      subjects.find(
        (s) =>
          s.subject === form.course_code &&
          s.day === weekday &&
          timeRangesOverlap(s.start_time, s.end_time, form.start_time, form.end_time),
      ),
    [subjects, form.course_code, weekday, form.start_time, form.end_time],
  );
  // Show the scheduled window when the chosen course falls on the picked date.
  const scheduledFor = useMemo(() => {
    const match = subjects.find((s) => s.subject === form.course_code && s.day === weekday);
    return match
      ? `${to12h(match.start_time)} – ${to12h(match.end_time)}${match.room ? ` · Room ${match.room}` : ''}`
      : '';
  }, [subjects, form.course_code, weekday]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleCoursePick = (value) => {
    const slot = subjects.find((s) => s.subject === value && s.day === weekday);
    setForm((f) => ({
      ...f,
      course_code: value,
      ...(slot ? { start_time: slot.start_time, end_time: slot.end_time } : {}),
    }));
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/teacher/cancel-class/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not cancel the class.');
      setSuccess(data.message || 'Class cancelled and students notified.');
      onSuccess?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const audience = [form.department, form.batch && `Batch ${form.batch}`, form.section && `Sec ${form.section}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      {/* --- Selection cascade --- */}
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-lime-deep">Class details</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-dept`}>Department</label>
          <select id={`${idPrefix}-dept`} className={inputCls} value={form.department} onChange={set('department')}>
            <option value="">Select department…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-batch`}>Batch</label>
          <select id={`${idPrefix}-batch`} className={inputCls} value={form.batch} onChange={set('batch')}>
            <option value="">Select batch…</option>
            {BATCHES.map((b) => (
              <option key={b} value={b}>Batch {b}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-section`}>Section</label>
          <select
            id={`${idPrefix}-section`}
            className={inputCls}
            value={form.section}
            onChange={set('section')}
            disabled={!form.department}
          >
            <option value="">Select section…</option>
            {sections.map((s) => (
              <option key={s} value={s}>Section {s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* --- Date + time slot --- */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-date`}>
            <CalendarIcon className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
            Date
          </label>
          <input id={`${idPrefix}-date`} type="date" className={inputCls} value={form.date} onChange={set('date')} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-start`}>
            <ClockIcon className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
            Start time
          </label>
          <input id={`${idPrefix}-start`} type="time" className={inputCls} value={form.start_time} onChange={set('start_time')} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-end`}>End time</label>
          <input id={`${idPrefix}-end`} type="time" className={inputCls} value={form.end_time} onChange={set('end_time')} />
        </div>
      </div>

      {/* --- Course --- */}
      <div className="mt-5">
        <label className={labelCls} htmlFor={`${idPrefix}-course`}>Course name / code</label>
        <input
          id={`${idPrefix}-course`}
          type="text"
          list={`${idPrefix}-course-options`}
          className={inputCls}
          placeholder='e.g. "CSE-2101 Data Structures"'
          value={form.course_code}
          onChange={(e) => handleCoursePick(e.target.value)}
        />
        <datalist id={`${idPrefix}-course-options`}>
          {[...new Set(subjects.map((s) => s.subject))].map((subject) => (
            <option key={subject} value={subject} />
          ))}
        </datalist>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
          {scheduledFor ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime/20 px-2.5 py-1 font-bold text-lime-deep">
              <ClockIcon className="h-3.5 w-3.5" />
              Scheduled on {weekday || '—'}: {scheduledFor}
            </span>
          ) : (
            form.department && form.batch && form.section && subjects.length === 0 && (
              <span className="text-gray-400">No routine published for this class — type the course manually.</span>
            )
          )}
          {matchingSubject && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-700 ring-1 ring-amber-600/20">
              Matches your routine slot — students will see this slot as cancelled
            </span>
          )}
        </div>
      </div>

      {/* --- Reason --- */}
      <div className="mt-5">
        <label className={labelCls} htmlFor={`${idPrefix}-reason`}>Reason for cancellation</label>
        <select id={`${idPrefix}-reason`} className={inputCls} value={form.reason} onChange={set('reason')}>
          {CANCEL_REASONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {form.reason === 'other' && (
          <textarea
            className={`${inputCls} mt-3 min-h-[84px] resize-y`}
            placeholder="Tell students why the class is cancelled…"
            value={form.reason_note}
            onChange={set('reason_note')}
          />
        )}
      </div>

      {/* Audience preview + error / success */}
      {audience && (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-[12px]">
          <span className="font-bold text-charcoal">Sends to:</span>
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-white">
            {audience}
          </span>
          <span className="text-gray-400">students only</span>
        </div>
      )}
      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-600">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-bold text-emerald-700">
          ✓ {success}
        </p>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.05] pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !form.department || !form.batch || !form.section || !form.course_code || !form.date}
          className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <BanIcon className="h-4 w-4" />
          {submitting ? 'Cancelling…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
