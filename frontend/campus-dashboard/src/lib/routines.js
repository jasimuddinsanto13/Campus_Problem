import { jsPDF } from 'jspdf';

/* ---------------- constants ---------------- */

export const DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'EEE', name: 'Electrical & Electronic Engineering' },
  { code: 'TE', name: 'Textile Engineering' },
  { code: 'IPE', name: 'Industrial & Production Engineering' },
  { code: 'FDAE', name: 'Fashion Design & Apparel Engineering' },
];

// Grid days, Sunday to Thursday plus Saturday (the day sequence in the wizard).
export const DAYS = [
  { code: 'SUN', label: 'Sunday', short: 'Sun' },
  { code: 'MON', label: 'Monday', short: 'Mon' },
  { code: 'TUE', label: 'Tuesday', short: 'Tue' },
  { code: 'WED', label: 'Wednesday', short: 'Wed' },
  { code: 'THU', label: 'Thursday', short: 'Thu' },
  { code: 'SAT', label: 'Saturday', short: 'Sat' },
];

// Order used when "+ Add Slot" auto-increments the next row's day.
export const DAY_SEQUENCE = DAYS.map((d) => d.code);

export const BATCHES = Array.from({ length: 17 }, (_, i) => String(i)); // 0..16

// Sections offered per department — the wizard shows exactly these.
export const DEPT_SECTIONS = {
  CSE: ['A', 'B'],
  EEE: ['A'],
  TE: ['A', 'B', 'C', 'D'],
  IPE: ['A', 'B'],
  FDAE: ['A'],
};

/* ---------------- time helpers ---------------- */

/** '09:00' (24h) -> '9:00 AM' */
export function to12h(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  if (!m) return String(t || '').trim();
  let h = parseInt(m[1], 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${suffix}`;
}

/** '9:00 AM' -> '09:00' (24h, zero-padded for <input type=time>). */
export function from12h(t) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t || '').trim());
  if (!m) return String(t || '').trim();
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** '08:00' + '09:00' -> '8:00 AM - 9:00 AM' */
export function slotLabel(start, end) {
  return `${to12h(start)} - ${to12h(end)}`;
}

/** Next day in the sequence after `day` (wraps SAT -> SUN). */
export function nextDay(day) {
  const i = DAY_SEQUENCE.indexOf(day);
  return DAY_SEQUENCE[(i + 1) % DAY_SEQUENCE.length];
}

/* ---------------- row / table builders ---------------- */

/**
 * Strict "+ Add Slot" logic. Given the current rows (in form order), build the
 * next row to append:
 *   - Day:    advances to the next day in the sequence after the last row's
 *             day (Sunday ➔ Monday ➔ Tuesday ➔ Wednesday ➔ Thursday ➔ Saturday,
 *             wrapping back to Sunday). Empty table -> Sunday.
 *   - Time:   continues contiguously from the last row's end time
 *             (08:00-09:00 ➔ 09:00-10:00 ➔ ...), capped at 22:00 so the new
 *             slot never rolls past midnight into an end-before-start pair.
 *             Empty or non-HH:MM end time -> starts at 08:00 AM.
 * Returns a fresh row object (no `id` — the consumer assigns one).
 */
export function nextSlot(rows) {
  const last = rows[rows.length - 1];
  let start = '08:00';
  let end = '09:00';
  if (last && /^\d{2}:\d{2}$/.test(last.end_time)) {
    const [h, m] = last.end_time.split(':').map(Number);
    // Continue from where the last slot ends (h = end hour), never past 22:00.
    const next = Math.min(h, 22);
    start = `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    end = `${String(next + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const day = last && DAY_SEQUENCE.includes(last.day) ? nextDay(last.day) : 'SUN';
  return { day, start_time: start, end_time: end, subject: '', faculty: '', room: '' };
}

/**
 * A single fresh blank row — the initial Create Routine form state: Row 1
 * defaults to Sunday, 08:00 AM - 09:00 AM (subject/faculty/room empty).
 * The strict "+ Add Slot" logic (nextSlot) appends further rows from here.
 * No `id` — the consumer's rowCounter assigns one.
 */
export function defaultRow() {
  return { day: 'SUN', start_time: '08:00', end_time: '09:00', subject: '', faculty: '', room: '' };
}

/**
 * Derive the weekly timetable from the row list: time periods as rows, days
 * as columns. Blank rows (no subject/faculty/room) are skipped so the live
 * preview matches what Save actually persists.
 */
export function buildPeriods(rows) {
  const map = new Map(); // `${start}|${end}` -> { start, end, cells: {SUN: [], ...} }
  const emptyCells = Object.fromEntries(DAYS.map((d) => [d.code, []]));
  for (const r of rows) {
    if (!r.subject.trim() && !r.faculty.trim() && !r.room.trim()) continue;
    const key = `${r.start_time}|${r.end_time}`;
    if (!map.has(key)) {
      map.set(key, { start: r.start_time, end: r.end_time, cells: { ...emptyCells } });
    }
    const period = map.get(key);
    if (period.cells[r.day]) period.cells[r.day].push(r);
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------------- jsPDF export ---------------- */

/**
 * Export the weekly timetable to a printable PDF. Draws a structured grid
 * directly with jsPDF (no html2canvas / DOM capture), headed:
 *   Campus Problem - Routine
 *   Department: CSE | Batch: 10 | Section: A
 * `title` / `subtitle` / `filename` are optional overrides — the My Routine
 * view passes a personal-schedule title instead of a department section.
 */
export function exportRoutinePdf(
  periods,
  { department, batch, section, title = 'Routine', subtitle, filename } = {},
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const cols = ['Time', ...DAYS.map((d) => d.short)];
  const colW = (pageW - M * 2) / cols.length;
  const headerH = 24;

  let y = 0;

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(26, 26, 26);
    cols.forEach((c, i) => {
      doc.rect(M + i * colW, y, colW, headerH, 'F');
      doc.text(c, M + i * colW + 8, y + headerH - 9);
    });
    y += headerH;
  };

  const drawRow = (period) => {
    // drawHeader() switches to white text for the dark header row —
    // reset to dark ink before drawing any body text on the white page.
    doc.setTextColor(26, 26, 26);
    const timeLines = doc.splitTextToSize(slotLabel(period.start, period.end), colW - 16);
    const dayLines = DAYS.map((d) => {
      const cells = period.cells[d.code] || [];
      if (!cells.length) return [];
      return cells.flatMap((s) => {
        const lines = [s.subject];
        if (s.room) lines.push(`Room: ${s.room}`);
        if (s.faculty) lines.push(s.faculty);
        return lines.flatMap((t) => doc.splitTextToSize(t, colW - 16));
      });
    });
    const rowH = Math.max(44, Math.max(timeLines.length, ...dayLines.map((l) => l.length)) * 11 + 14);

    if (y + rowH > pageH - M) {
      doc.addPage();
      y = M;
      drawHeader();
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.rect(M, y, colW, rowH, 'S');
    timeLines.forEach((l, i) => doc.text(l, M + 8, y + 14 + i * 11));

    DAYS.forEach((d, di) => {
      const x = M + (di + 1) * colW;
      doc.rect(x, y, colW, rowH, 'S');
      const cells = period.cells[d.code] || [];
      if (!cells.length) return;
      let ty = y + 14;
      const lines = cells.flatMap((s) => {
        const out = [];
        s.subject.split('\n').forEach((seg) => out.push(...doc.splitTextToSize(seg, colW - 16)));
        if (s.room) out.push(...doc.splitTextToSize(`Room: ${s.room}`, colW - 16));
        if (s.faculty) out.push(...doc.splitTextToSize(s.faculty, colW - 16));
        return out;
      });
      lines.forEach((l, li) => {
        doc.setFont('helvetica', li === 0 ? 'bold' : 'normal');
        doc.text(l, x + 8, ty);
        ty += 11;
      });
    });
    y += rowH;
  };

  // Page header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 26);
  doc.text(`Campus Problem - ${title}`, M, 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(77, 124, 15);
  doc.text(
    subtitle || `Department: ${department} | Batch: ${batch} | Section: ${section}`,
    M,
    74,
  );
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(`Generated: ${new Date().toLocaleString()}`, M, 90);

  y = 106;
  drawHeader();
  periods.forEach(drawRow);

  doc.save(filename || `${department}_Batch${batch}_Sec${section}_Routine.pdf`);
}
