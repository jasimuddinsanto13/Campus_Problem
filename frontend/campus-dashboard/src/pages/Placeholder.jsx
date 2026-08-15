export default function Placeholder({ icon: Icon, title, blurb, action }) {
  return (
    <div className="animate-[fadeIn_.35s_ease]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        {title}
      </p>

      <div className="mt-8 grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/60 p-8">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
            <Icon className="h-8 w-8" />
          </span>
          <h2 className="mt-5 text-xl font-bold tracking-tight text-charcoal">
            {title} section
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">{blurb}</p>
          {action && (
            <button
              type="button"
              onClick={() => {
                window.location.href = action.href;
              }}
              className="mt-6 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
