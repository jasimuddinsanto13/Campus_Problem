import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BackArrowIcon,
  ChevronRightIcon,
  DownloadIcon,
  GraduationIcon,
  PencilIcon,
  RoutinesIcon,
} from '../components/Icons';
import { BATCHES, DEPARTMENTS, DEPT_SECTIONS } from '../lib/routines';

export default function Routines() {
  // ---- Wizard state ----
  const [step, setStep] = useState('departments'); // departments | batches | sections | choice
  const [department, setDepartment] = useState(null);
  const [batch, setBatch] = useState(null);
  const [section, setSection] = useState(null);
  const navigate = useNavigate();

  const deptName = useMemo(
    () => (department ? (DEPARTMENTS.find((d) => d.code === department) || {}).name || department : ''),
    [department],
  );

  // Sections available for the selected department.
  const deptSections = useMemo(() => DEPT_SECTIONS[department] || [], [department]);

  const query = () => `?dept=${department}&batch=${batch}&sec=${section}`;

  const goDepartments = () => setStep('departments');
  const goBatches = () => setStep('batches');
  const goSections = () => setStep('sections');

  const crumb = (() => {
    const parts = ['Admin portal', 'Routines'];
    if (department) parts.push(department);
    if (batch != null) parts.push(`Batch ${batch}`);
    if (section) parts.push(`Section ${section}`);
    return parts;
  })();

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Routines management
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[32px]">
            {step === 'departments' && 'Select Department'}
            {step === 'batches' && 'Select Batch Number'}
            {step === 'sections' && 'Select Section'}
            {step === 'choice' && 'What would you like to do?'}
          </h1>
          <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-gray-500">
            {step === 'departments' && 'Pick the department you want to build a weekly class routine for.'}
            {step === 'batches' && `Choose the batch number for ${department} (${deptName}).`}
            {step === 'sections' &&
              `Which section of ${department} batch ${batch} is this routine for? ${deptName} offers ${deptSections.length} section${deptSections.length > 1 ? 's' : ''} (${deptSections.join(', ')}).`}
            {step === 'choice' &&
              'Create or edit the schedule, or jump straight to the read-only timetable and PDF export.'}
          </p>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
        {crumb.map((part, i) => (
          <span key={part} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRightIcon className="h-3 w-3 text-gray-300" />}
            <span className={i === crumb.length - 1 ? 'font-bold text-charcoal' : 'text-gray-400'}>{part}</span>
          </span>
        ))}
      </nav>

      {/* ============ STEP 1 — Departments ============ */}
      {step === 'departments' && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept.code}
              type="button"
              onClick={() => {
                setDepartment(dept.code);
                setBatch(null);
                setSection(null);
                goBatches();
              }}
              className="group flex items-center gap-4 rounded-2xl border border-black/[0.05] bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-lime-deep/30 hover:shadow-lg"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep transition group-hover:bg-lime">
                <GraduationIcon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold tracking-tight text-charcoal">{dept.code}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{dept.name}</span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
            </button>
          ))}
          <div className="hidden items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white/40 p-5 xl:flex">
            <p className="max-w-[220px] text-center text-[12px] leading-relaxed text-gray-400">
              One click opens the batch picker for that department.
            </p>
          </div>
        </div>
      )}

      {/* ============ STEP 2 — Batches ============ */}
      {step === 'batches' && (
        <div className="mt-6">
          <button
            type="button"
            onClick={goDepartments}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
          >
            <BackArrowIcon className="h-4 w-4" />
            Back to Departments
          </button>

          <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
                <RoutinesIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-charcoal">{department}</p>
                <p className="text-[11.5px] text-gray-400">{deptName}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
              {BATCHES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setBatch(b);
                    setSection(null);
                    goSections();
                  }}
                  className="rounded-xl border border-black/[0.06] bg-canvas/70 px-3 py-3 text-[13px] font-bold text-charcoal transition duration-150 hover:-translate-y-0.5 hover:border-lime-deep/40 hover:bg-lime hover:shadow-md"
                >
                  Batch {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 3 — Sections ============ */}
      {step === 'sections' && (
        <div className="mt-6">
          <button
            type="button"
            onClick={goBatches}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
          >
            <BackArrowIcon className="h-4 w-4" />
            Back to Batches
          </button>

          <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
                <RoutinesIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-charcoal">
                  {department} · Batch {batch}
                </p>
                <p className="text-[11.5px] text-gray-400">{deptName}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {deptSections.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSection(s);
                    setStep('choice');
                  }}
                  className="group flex items-center justify-between rounded-2xl border border-black/[0.06] bg-canvas/70 px-5 py-5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-lime-deep/40 hover:bg-lime hover:shadow-md"
                >
                  <span>
                    <span className="block text-[16px] font-extrabold tracking-tight text-charcoal">
                      Section {s}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-gray-400">
                      {deptSections.length > 1
                        ? `${department} intake group ${s}`
                        : `The only ${department} section`}
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 4 — Navigation choice ============ */}
      {step === 'choice' && (
        <div className="mt-6">
          <button
            type="button"
            onClick={goSections}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
          >
            <BackArrowIcon className="h-4 w-4" />
            Back to Sections
          </button>

          <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {[`${department}`, `Batch ${batch}`, `Section ${section}`].map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] font-bold text-white shadow-md shadow-black/15"
                >
                  <RoutinesIcon className="h-4 w-4 text-lime" />
                  {chip}
                </span>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => navigate(`/routines/edit${query()}`)}
                className="group rounded-2xl border border-black/[0.06] bg-canvas/70 p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-lime-deep/40 hover:bg-lime hover:shadow-lg"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-lime-deep shadow-sm transition group-hover:bg-ink group-hover:text-lime">
                  <PencilIcon className="h-6 w-6" />
                </span>
                <span className="mt-4 block text-[16px] font-extrabold tracking-tight text-charcoal">
                  Create / Edit Routine
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-gray-500">
                  Open the editable schedule — time slots from 08:00 AM, add classes and save to the database.
                </span>
              </button>

              <button
                type="button"
                onClick={() => navigate(`/routines/download${query()}`)}
                className="group rounded-2xl border border-black/[0.06] bg-canvas/70 p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-lime-deep/40 hover:bg-lime hover:shadow-lg"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-lime-deep shadow-sm transition group-hover:bg-ink group-hover:text-lime">
                  <DownloadIcon className="h-6 w-6" />
                </span>
                <span className="mt-4 block text-[16px] font-extrabold tracking-tight text-charcoal">
                  View &amp; Download Routine
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-gray-500">
                  See the saved weekly timetable and download a printable PDF of this section's routine.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
