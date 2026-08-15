import { useEffect, useRef, useState } from 'react';
import {
  CameraIcon,
  EyeIcon,
  EyeOffIcon,
  CircleCheckIcon,
  TrashIcon,
  XIcon,
} from '../components/Icons';
import { useUser } from '../context/UserContext';
import Avatar from '../components/Avatar';
import { getCsrfToken } from '../lib/csrf';

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = [
  'bg-gray-200',
  'bg-red-400',
  'bg-amber-400',
  'bg-lime',
  'bg-emerald-500',
];
const STRENGTH_TEXT = [
  'text-gray-400',
  'text-red-500',
  'text-amber-600',
  'text-lime-deep',
  'text-emerald-600',
];

function passwordScore(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13.5px] text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

export default function Settings() {
  const { fullName, email: savedEmail, profilePicture, updateProfile, loading } = useUser();

  // ---- Profile state (hydrated from the persisted profile) ----
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photoFile, setPhotoFile] = useState(null); // File picked for upload
  const [photoPreview, setPhotoPreview] = useState(null); // data URL for preview
  const [saving, setSaving] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileRef = useRef(null);
  const hydrated = useRef(false);

  // Once the persisted profile has loaded, prefill the form. Gated on the
  // loading flag (not just fullName) because the context starts with a
  // 'santo' fallback before GET /api/profile/ resolves — hydrating early
  // would freeze the form on the placeholder name. Runs once, so typing in
  // the fields is never overwritten.
  useEffect(() => {
    if (!hydrated.current && !loading && fullName) {
      hydrated.current = true;
      setName(fullName);
      setEmail(savedEmail || '');
    }
  }, [loading, fullName, savedEmail]);

  // ---- Password state ----
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  // Saved photo from the server, hidden once the user picks a new one —
  // otherwise the initials circle shows.
  const avatarSrc = photoPreview || profilePicture;

  const onPickPhoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Photo is too large — maximum size is 2MB.', true);
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file (JPG, PNG or GIF).', true);
      e.target.value = '';
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  // Remove is a two-step, confirmed action: clicking it opens a modal instead
  // of deleting immediately. If the user only picked a new (unsaved) photo,
  // there is nothing on the server yet — just discard the preview.
  const onRemovePhoto = () => {
    if (photoPreview) {
      setPhotoFile(null);
      setPhotoPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setShowRemoveModal(true);
  };

  // "Yes, Remove" in the confirmation modal → DELETE the saved picture file
  // on the server, then push the cleared state everywhere at once.
  const confirmRemovePhoto = async () => {
    setRemoving(true);
    try {
      const res = await fetch('/api/profile/picture/', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove your profile picture.');
      // Global state → sidebar avatar falls back to the initials circle.
      updateProfile({ profilePicture: null });
      setPhotoFile(null);
      setPhotoPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      setShowRemoveModal(false);
      showToast('Profile picture removed successfully.');
    } catch (err) {
      showToast(err.message || 'Could not remove your profile picture.', true);
    } finally {
      setRemoving(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Full name is required.', true);
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.append('full_name', name.trim());
    form.append('email', email.trim());
    if (photoFile) form.append('profile_picture', photoFile);

    try {
      const res = await fetch('/api/profile/', {
        method: 'PUT',
        body: form,
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save your profile.');
      // Update global state so the sidebar + header avatars refresh instantly.
      updateProfile({
        id: data.profile.id,
        fullName: data.profile.full_name,
        username: data.profile.username,
        email: data.profile.email,
        profilePicture: data.profile.profile_picture,
      });
      setPhotoFile(null);
      setPhotoPreview(null);
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(err.message || 'Could not save your profile.', true);
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      showToast('Passwords do not match.', true);
      return;
    }
    if (passwordScore(newPw) < 2) {
      showToast('Choose a stronger password.', true);
      return;
    }
    showToast('Password updated successfully');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
  };

  const score = passwordScore(newPw);
  const pwMatches = confirmPw.length > 0 && newPw === confirmPw;
  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw;

  const PasswordInput = ({
    id,
    value,
    onChange,
    placeholder,
    autoComplete,
    show,
    onToggleShow,
  }) => (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={onToggleShow}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-gray-400 transition hover:bg-canvas hover:text-charcoal"
      >
        {show ? <EyeOffIcon className="h-[18px] w-[18px]" /> : <EyeIcon className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Toast */}
      {toast && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-4 py-3 shadow-xl shadow-black/[0.08] animate-[fadeIn_.3s_ease]">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              toast.error ? 'bg-rose-50 text-rose-500' : 'bg-lime text-charcoal'
            }`}
          >
            <CircleCheckIcon className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-semibold text-charcoal">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-1 grid h-6 w-6 place-items-center rounded-md text-gray-400 transition hover:bg-canvas hover:text-charcoal"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Account settings
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[32px]">
            Account Settings
          </h1>
          <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-gray-500">
            Manage your profile information, picture, and security settings.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Profile Information */}
        <form
          onSubmit={saveProfile}
          className="rounded-xl border border-black/[0.05] bg-white p-6 shadow-sm"
        >
          <h2 className="text-[15px] font-bold tracking-tight text-charcoal">
            Profile Information
          </h2>
          <p className="mt-1 text-[12px] text-gray-400">
            Update your name and the email address on your account.
          </p>

          {/* Avatar + upload */}
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <div className="relative">
              <Avatar
                name={name || fullName}
                src={avatarSrc}
                className="h-24 w-24 text-[26px] ring-4 ring-lime/30"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <CameraIcon className="h-4 w-4" />
                  Upload New Photo
                </button>
                <button
                  type="button"
                  onClick={onRemovePhoto}
                  disabled={!profilePicture && !photoPreview}
                  className="rounded-xl border border-black/[0.07] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              <p className="mt-2.5 text-[11px] text-gray-400">
                JPG, PNG or GIF. Max size 2MB.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickPhoto}
            />
          </div>

          {/* Remove-picture confirmation modal */}
          {showRemoveModal && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 backdrop-blur-sm animate-[fadeIn_.2s_ease]"
              onClick={() => !removing && setShowRemoveModal(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-photo-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl border border-black/[0.05] bg-white p-6 shadow-2xl shadow-black/20 animate-[popIn_.22s_ease]"
              >
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50">
                  <TrashIcon className="h-5 w-5 text-rose-500" />
                </div>
                <h3
                  id="remove-photo-title"
                  className="mt-4 text-center text-[16px] font-bold tracking-tight text-charcoal"
                >
                  Remove Profile Picture
                </h3>
                <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-500">
                  Are you sure you want to remove your profile picture? This
                  action will restore your default avatar.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRemoveModal(false)}
                    disabled={removing}
                    className="rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-600 transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmRemovePhoto}
                    disabled={removing}
                    className="rounded-xl bg-rose-600 px-4 py-2.5 text-[12.5px] font-bold text-white shadow-md shadow-rose-600/30 transition hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {removing ? 'Removing…' : 'Yes, Remove'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className={inputClass}
              />
            </Field>
            <Field label="Email Address">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campus.edu"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-ink px-6 py-2.5 text-[13px] font-bold text-white shadow-md shadow-black/15 transition hover:-translate-y-0.5 hover:bg-black hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Change Password */}
        <form
          onSubmit={updatePassword}
          className="rounded-xl border border-black/[0.05] bg-white p-6 shadow-sm"
        >
          <h2 className="text-[15px] font-bold tracking-tight text-charcoal">
            Change Password
          </h2>
          <p className="mt-1 text-[12px] text-gray-400">
            Choose a strong password you don't use elsewhere.
          </p>

          <div className="mt-6 grid gap-4">
            <Field label="Current Password">
              <PasswordInput
                id="current-password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                show={showCurrent}
                onToggleShow={() => setShowCurrent((v) => !v)}
              />
            </Field>

            <Field
              label="New Password"
              hint={
                newPw && (
                  <span className={`inline-flex items-center gap-2 ${STRENGTH_TEXT[score]}`}>
                    <span className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-6 rounded-full transition ${
                            i <= score ? STRENGTH_COLORS[score] : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </span>
                    {STRENGTH_LABELS[score]} password
                  </span>
                )
              }
            >
              <PasswordInput
                id="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
              />
            </Field>

            <Field
              label="Confirm New Password"
              hint={
                pwMismatch ? (
                  <span className="text-rose-500">Passwords do not match.</span>
                ) : pwMatches ? (
                  <span className="text-emerald-600">Passwords match.</span>
                ) : null
              }
            >
              <PasswordInput
                id="confirm-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                show={showConfirm}
                onToggleShow={() => setShowConfirm((v) => !v)}
              />
            </Field>
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-lime px-6 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
            >
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
