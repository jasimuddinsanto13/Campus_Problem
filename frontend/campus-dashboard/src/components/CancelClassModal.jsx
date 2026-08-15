import CancelClassForm from './CancelClassForm';
import { BanIcon, XIcon } from './Icons';

/**
 * "Cancel Class & Notify Students" modal — a modal shell around the shared
 * CancelClassForm, opened from the faculty dashboard and routine view.
 */
export default function CancelClassModal({
  open,
  onClose,
  onDone,
  defaultDepartment = '',
  defaultBatch = '',
  defaultSection = '',
  defaultDate = '',
  defaultCourseCode = '',
  defaultStartTime = '',
  defaultEndTime = '',
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-class-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] bg-ink px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-400">
              <BanIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-rose-400">
                Faculty action
              </p>
              <h3 id="cancel-class-title" className="mt-0.5 text-[19px] font-extrabold tracking-tight text-white">
                Cancel Class & Notify Students
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
          <CancelClassForm
            defaultDepartment={defaultDepartment}
            defaultBatch={defaultBatch}
            defaultSection={defaultSection}
            defaultDate={defaultDate}
            defaultCourseCode={defaultCourseCode}
            defaultStartTime={defaultStartTime}
            defaultEndTime={defaultEndTime}
            cancelLabel="Keep class"
            onCancel={onClose}
            onSuccess={(data) => {
              onDone?.(data);
              setTimeout(onClose, 1400);
            }}
          />
        </div>
      </div>
    </div>
  );
}
