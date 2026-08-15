import { useEffect, useRef } from 'react';
import { BanIcon, CheckIcon, CircleCheckIcon, TrashIcon, XIcon } from './Icons';

const TONES = {
  success: {
    icon: CircleCheckIcon,
    iconWrap: 'bg-lime/20 text-lime-deep',
    confirm:
      'bg-lime text-charcoal shadow-md shadow-lime/40 hover:-translate-y-0.5 hover:bg-lime/90 hover:shadow-lg',
  },
  danger: {
    icon: TrashIcon,
    iconWrap: 'bg-rose-50 text-rose-500',
    confirm:
      'bg-rose-500 text-white shadow-md shadow-rose-500/30 hover:-translate-y-0.5 hover:bg-rose-600 hover:shadow-lg',
  },
  warning: {
    icon: BanIcon,
    iconWrap: 'bg-amber-50 text-amber-600',
    confirm:
      'bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-lg',
  },
  neutral: {
    icon: CheckIcon,
    iconWrap: 'bg-ink/5 text-charcoal',
    confirm:
      'bg-ink text-white shadow-md shadow-black/20 hover:-translate-y-0.5 hover:bg-black hover:shadow-lg',
  },
  trash: {
    icon: TrashIcon,
    iconWrap: 'bg-ink/5 text-charcoal',
    confirm:
      'bg-ink text-white shadow-md shadow-black/20 hover:-translate-y-0.5 hover:bg-black hover:shadow-lg',
  },
};

/**
 * Reusable "Are you sure?" popup used before approve / reject / cancel /
 * trash / delete actions across the room-booking pages.
 *
 * Props: open, title, message, confirmLabel, tone, busy, onConfirm, onCancel.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  highlight,
  confirmLabel = 'Confirm',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancelRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!open) return null;

  const t = TONES[tone] || TONES.neutral;
  const Icon = t.icon;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !busy && onCancel?.()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-5 pt-6 text-center">
          <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${t.iconWrap}`}>
            <Icon className="h-6 w-6" />
          </span>
          <h3 id="confirm-dialog-title" className="mt-4 text-[17px] font-extrabold tracking-tight text-charcoal">
            {title}
          </h3>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-gray-500">
            {message}
          </p>
          {highlight && (
            <p className="mx-auto mt-3 inline-block max-w-sm rounded-xl bg-canvas px-3.5 py-2 text-[12px] font-bold text-charcoal">
              {highlight}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-black/[0.05] bg-canvas/60 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal disabled:opacity-50"
          >
            <XIcon className="h-3.5 w-3.5" />
            {busy ? 'Please wait…' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${t.confirm}`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
