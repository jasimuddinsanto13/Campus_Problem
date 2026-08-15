(function () {
  'use strict';

  var ROLE_NOTES = {
    student: 'Report issues & follow them through to done.',
    teacher: 'Book classrooms for classes and exams.',
    admin: 'Approve registrations and moderate the platform.'
  };

  /* ---------------- Password visibility toggles ---------------- */
  document.querySelectorAll('[data-peek]').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = button.closest('.relative').querySelector('input');
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
    });
  });

  /* ---------------- Live password-match check (register) ---------------- */
  var passwordInput = document.querySelector('input[name="password"]');
  var confirmInput = document.getElementById('confirm-password');
  var confirmNote = document.getElementById('confirm-note');
  if (passwordInput && confirmInput && confirmNote) {
    var checkMatch = function () {
      var value = confirmInput.value;
      if (!value) {
        confirmInput.style.borderColor = '';
        confirmNote.textContent = '';
        return;
      }
      var matches = value === passwordInput.value;
      confirmInput.style.borderColor = matches ? 'rgba(5, 150, 105, .55)' : 'rgba(225, 29, 72, .55)';
      confirmNote.textContent = matches ? 'Passwords match.' : 'Passwords do not match yet.';
      confirmNote.className = 'mt-2 block min-h-4 text-xs ' + (matches ? 'text-emerald-600' : 'text-rose-600');
    };
    passwordInput.addEventListener('input', checkMatch);
    confirmInput.addEventListener('input', checkMatch);
  }

  /* ---------------- Role-aware ID / Key field (register) ----------------
   * One field renders per selected role:
   *   Student -> STUDENT ID / ROLL NO.  (student_id,   text input)
   *   Faculty -> FACULTY ID             (faculty_id,   text input)
   *   Admin   -> ADMIN SECURITY KEY     (admin_key,    password input —
   *              replaces the campus ID field entirely for admins). */
  var ID_FIELD = {
    student: {
      label: 'Student ID / Roll No.',
      placeholder: 'e.g. CSE-23014',
      name: 'student_id',
      type: 'text',
      icon: '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h3M7 13h5M7 17h4M15 9h2"/></svg>'
    },
    teacher: {
      label: 'Faculty ID',
      placeholder: 'e.g. FAC-2024-01',
      name: 'faculty_id',
      type: 'text',
      icon: '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="10" r="3"/><path d="M4.5 20.5v-1.2a4 4 0 0 1 4-4h7a4 4 0 0 1 4 4v1.2"/><path d="m8.5 10 2.2 2.2L15 8.5"/></svg>'
    },
    admin: {
      label: 'Admin Security Key',
      placeholder: 'Enter admin secret registration key',
      name: 'admin_key',
      type: 'password',
      icon: '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 8.5-8.5M16 6.5l2 2M13.5 9l2 2"/></svg>'
    }
  };

  var idLabel = document.getElementById('id-label');
  var idIcon = document.getElementById('id-icon');
  var idInput = document.getElementById('campus-id-input');
  var idNote = document.getElementById('id-note');
  // Permissive campus-ID pattern: letters/numbers/dashes/dots/underscores,
  // 3-30 chars, no spaces (applies to student & faculty IDs only).
  var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/;
  var MIN_KEY_LENGTH = 4; // admin security keys are at least 4 chars

  function checkId() {
    if (!idInput || !idNote) return;
    var value = idInput.value.trim();
    if (!value) {
      idInput.style.borderColor = '';
      idNote.textContent = '';
      return;
    }
    var role = idInput.dataset.role;
    var cfg = ID_FIELD[role] || {};
    var ok;
    var hint;
    if (role === 'admin') {
      ok = value.length >= MIN_KEY_LENGTH;
      hint = ok ? 'Looks good.' : 'The admin security key looks too short (min 4 characters).';
    } else {
      ok = ID_PATTERN.test(value);
      hint = ok
        ? 'Looks good.'
        : 'Enter a valid ' + (cfg.label || 'ID') + ' (letters, numbers and dashes, 3-30 characters).';
    }
    idInput.style.borderColor = ok ? 'rgba(5, 150, 105, .55)' : 'rgba(225, 29, 72, .55)';
    idNote.textContent = hint;
    idNote.className = 'mt-2 block min-h-4 text-xs ' + (ok ? 'text-emerald-600' : 'text-rose-600');
  }

  function updateIdField(role) {
    var cfg = ID_FIELD[role];
    if (!cfg || !idInput) return;
    if (idLabel) idLabel.textContent = cfg.label;
    if (idIcon) idIcon.innerHTML = cfg.icon;
    idInput.placeholder = cfg.placeholder;
    idInput.name = cfg.name;
    idInput.type = cfg.type;
    idInput.autocomplete = cfg.type === 'password' ? 'off' : 'on';
    idInput.dataset.role = role;
    checkId();
  }

  if (idInput) idInput.addEventListener('input', checkId);

  /* ---------------- Student academics (department / batch / section) ----
   * The "academics" block is student-only: it slides in for the Student
   * role and the section dropdown repopulates from the selected department
   * (CSE -> A,B · EEE -> A · TE -> A,B,C,D · IPE -> A,B · FDAE -> A). */
  var SECTIONS_BY_DEPT = {
    CSE: ['A', 'B'],
    EEE: ['A'],
    TE: ['A', 'B', 'C', 'D'],
    IPE: ['A', 'B'],
    FDAE: ['A']
  };

  var academicsBlock = document.getElementById('academics-block');
  var deptSelect = document.getElementById('department-select');
  var sectionSelect = document.getElementById('section-select');
  var sectionNote = document.getElementById('section-note');

  function populateSections() {
    if (!sectionSelect) return;
    var previous = sectionSelect.value || (sectionSelect.dataset.preserved || '');
    var dept = deptSelect ? deptSelect.value : '';
    var options = SECTIONS_BY_DEPT[dept] || [];
    sectionSelect.innerHTML = '<option value="">Select section…</option>' +
      options.map(function (s) {
        return '<option value="' + s + '">' + s + '</option>';
      }).join('');
    // Keep the previous pick when it is still valid for this department.
    sectionSelect.value = options.indexOf(previous) !== -1 ? previous : '';
    checkSection();
  }

  function checkSection() {
    if (!sectionSelect || !sectionNote) return;
    var value = sectionSelect.value.trim();
    if (!value) {
      sectionNote.textContent = '';
      sectionNote.className = 'mt-2 block min-h-4 text-xs';
      return;
    }
    sectionNote.textContent = 'Section ' + value;
    sectionNote.className = 'mt-2 block min-h-4 text-xs text-emerald-600';
  }

  function syncAcademics(role) {
    if (!academicsBlock) return;
    var isStudent = role === 'student';
    academicsBlock.classList.toggle('hidden', !isStudent);
    if (isStudent) populateSections();
  }

  if (deptSelect) deptSelect.addEventListener('change', populateSections);
  if (sectionSelect) sectionSelect.addEventListener('change', checkSection);

  /* ---------------- Live email format check (register) ---------------- */
  var emailInput = document.querySelector('input[name="email"]');
  var emailNote = document.getElementById('email-note');
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function checkEmail() {
    if (!emailInput || !emailNote) return;
    var value = emailInput.value.trim();
    if (!value) {
      emailInput.style.borderColor = '';
      emailNote.textContent = '';
      return;
    }
    var ok = EMAIL_PATTERN.test(value);
    emailInput.style.borderColor = ok ? 'rgba(5, 150, 105, .55)' : 'rgba(225, 29, 72, .55)';
    emailNote.textContent = ok
      ? 'Use your campus email (e.g. you@campus.edu).'
      : 'Enter a valid email address.';
    emailNote.className = 'mt-2 block min-h-4 text-xs ' + (ok ? 'text-emerald-600' : 'text-rose-600');
  }

  if (emailInput) emailInput.addEventListener('input', checkEmail);

  /* ---------------- Role pills ---------------- */
  var radios = document.querySelectorAll('input[name="role"]');
  var roleNote = document.getElementById('role-note');
  var badge = document.getElementById('approval-badge');

  var BADGE_STATES = {
    student: { label: 'Requires Manual Approval', cls: 'border-amber-300 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    teacher: { label: 'Requires Manual Approval', cls: 'border-amber-300 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    admin:   { label: 'Instant Verification',     cls: 'border-emerald-500/40 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
  };

  function setBadge(role) {
    if (!badge) return;
    var state = BADGE_STATES[role];
    if (!state) {
      badge.className = 'inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-500 transition-all duration-300';
      badge.innerHTML = '<span class="h-1.5 w-1.5 rounded-full bg-neutral-400"></span>Select a role to continue';
      return;
    }
    badge.className = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-300 ' + state.cls;
    badge.innerHTML = '<span class="h-1.5 w-1.5 rounded-full ' + state.dot + '"></span>' + state.label;
  }

  function refreshRole() {
    var checked = null;
    radios.forEach(function (r) { if (r.checked) checked = r.value; });
    if (!checked) return;

    if (roleNote) roleNote.textContent = ROLE_NOTES[checked];
    setBadge(checked);
    updateIdField(checked);
    syncAcademics(checked);
  }

  radios.forEach(function (radio) {
    radio.addEventListener('change', refreshRole);
  });

  // Preserve state on validation re-render (server re-renders with checked radio)
  refreshRole();
})();
