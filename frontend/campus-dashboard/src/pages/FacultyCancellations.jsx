import { useCallback, useEffect, useState } from 'react';
import CancelClassForm from '../components/CancelClassForm';
import ConfirmDialog from '../components/ConfirmDialog';
import { useUser } from '../context/UserContext';
import { getCsrfToken } from '../lib/csrf';
import { fmtCancellationDate } from '../lib/cancellations';
import { BanIcon, CalendarXIcon, RefreshIcon, TrashIcon } from '../components/Icons';

export default function FacultyCancellations() {
  const { department } = useUser();
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // row being deleted
  const [deleting, setDeleting] = useState(false);
  const [formKey, setFormKey] = useState(0); // remounts the form after a success

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/teacher/cancellations/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load cancellations.');
      setRows(data.cancellations || []);
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/teacher/cancellations/${pendingDelete.id}/`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not restore the class.');
      setFlash(data.message || 'Class restored.');
      setPendingDelete(null);
      await load();
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setError(err.message);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Class cancellations
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
            Cancel a class & notify students
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Pick the class, choose a reason, and every matching student gets an
            urgent notice, a dashboard alert and a push notification — instantly.
          </p>
        </div>
      </div>

      {/* Inline "Cancel a Class" form */}
      <div className="mt-6 rounded-2xl border border-black/[0.05] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep">
            <CalendarXIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[15px] font-extrabold tracking-tight text-charcoal">Cancel a Class</h2>
            <p className="text-[12px] text-gray-400">One cancellation reaches the whole batch & section.</p>
          </div>
        </div>
        <CancelClassForm
          key={formKey}
          defaultDepartment={department}
          onSuccess={(data) => {
            setFlash(data.message || 'Class cancelled and students notified.');
            setFormKey((k) => k + 1); // clear the form for the next cancellation
            load();
            setTimeout(() => setFlash(null), 5000);
          }}
        />
      </div>

      {/* Cancellation history log */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <BanIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold tracking-tight text-charcoal">
                Cancellation History Log
              </h2>
              <p className="text-[12px] text-gray-400">
                {rows == null ? 'Loading…' : `${rows.length} cancellation${rows.length === 1 ? '' : 's'} by you`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-gray-500 shadow-sm transition hover:text-charcoal hover:shadow-md"
          >
            <RefreshIcon className="h-3.5 w-3.5 transition group-hover:rotate-180" />
            Refresh
          </button>
        </div>

        {flash && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] font-bold text-emerald-700">
            ✓ {flash}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] font-semibold text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
          {rows == null ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-black/[0.04]" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-400">
                  <CalendarXIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">No cancellations yet</h3>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  Classes you cancel will appear here so you can restore them later.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr>
                    {['Date & Time', 'Course & Batch', 'Department & Section', 'Reason', 'Status', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="border-b border-black/[0.06] bg-panel px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-black/[0.04] last:border-0 hover:bg-canvas/40">
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-[12.5px] font-bold text-charcoal">{fmtCancellationDate(c.date)}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">{c.start_label} – {c.end_label}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-[12.5px] font-bold text-charcoal">{c.course_code}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">Batch {c.batch}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-[12.5px] font-semibold text-charcoal">{c.department}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">Section {c.section}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="max-w-[220px] text-[12px] leading-snug text-gray-600">{c.reason_label}</p>
                        {c.reason_note && <p className="mt-0.5 max-w-[220px] text-[11px] text-gray-400">“{c.reason_note}”</p>}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10.5px] font-bold text-rose-600 ring-1 ring-rose-600/15">
                          🔴 Cancelled
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white px-3 py-1.5 text-[11.5px] font-bold text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                          Delete / Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Restore confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        tone="danger"
        title="Restore this class?"
        message="The cancellation will be removed and the urgent notice retracted — students will see the class as scheduled again."
        highlight={
          pendingDelete
            ? `${pendingDelete.course_code} · ${fmtCancellationDate(pendingDelete.date)} ${pendingDelete.start_label} – ${pendingDelete.end_label}`
            : ''
        }
        confirmLabel="Delete cancellation"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  );
}
