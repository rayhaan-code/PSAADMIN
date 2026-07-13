// Date helpers: Excel serial -> JS Date, and follow-up date math.
import XLSX from 'xlsx';

// Convert an Excel serial number (e.g. 46167) OR a date string to a JS Date.
// Returns null if it can't be parsed.
export function parseExcelDate(value) {
  if (value === null || value === undefined || value === '') return null;

  // Numeric serial (Excel epoch)
  if (typeof value === 'number' && isFinite(value)) {
    const o = XLSX.SSF.parse_date_code(value);
    if (!o) return null;
    return new Date(Date.UTC(o.y, o.m - 1, o.d, o.H || 0, o.M || 0, Math.floor(o.S || 0)));
  }

  const str = String(value).trim();
  if (!str) return null;

  // Numeric string serial
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str);
    // Excel serials for these sheets are ~45000-47000 (years 2023-2028).
    if (n > 20000 && n < 80000) {
      const o = XLSX.SSF.parse_date_code(n);
      if (o) return new Date(Date.UTC(o.y, o.m - 1, o.d));
    }
  }

  // Textual formats parsed to UTC midnight to avoid timezone drift
  // (e.g. "01 Jun 2026" must NOT become 31 May in UTC+ timezones).
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // "01 Jun 2026" / "1 June 2026"
  let m = str.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mon = months[m[2].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
  }

  // ISO "2026-06-01"
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  // "01/06/2026" or "01-06-2026" — assume DD/MM/YYYY (UAE convention).
  m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

  // Fallback: native parse, then strip to UTC midnight of that calendar day.
  const d = new Date(str);
  if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

  return null;
}

// Add N calendar days to a date (defaults to today).
export function addDays(date, days) {
  const base = date ? new Date(date) : new Date();
  const d = new Date(base);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Start of today (UTC) — used for "due today / overdue" comparisons.
export function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Build a Prisma date filter from YYYY-MM-DD strings. The end date is INCLUSIVE
// (we add one day and use `lt`, so the whole end day is covered). Returns null
// when neither bound is provided, so callers can conditionally attach it.
export function dateRangeFilter(start, end) {
  const f = {};
  if (start) f.gte = new Date(start + 'T00:00:00.000Z');
  if (end) {
    const e = new Date(end + 'T00:00:00.000Z');
    e.setUTCDate(e.getUTCDate() + 1);
    f.lt = e;
  }
  return (f.gte || f.lt) ? f : null;
}

// Follow-up stage -> next interval in days. stage1 -> +2, stage2 -> +5, stage3 -> review.
export function nextFollowUp(currentStage) {
  const stage = (currentStage || 0) + 1;
  if (stage === 1) return { stage, nextDate: addDays(null, 2), needsManagerReview: false };
  if (stage === 2) return { stage, nextDate: addDays(null, 5), needsManagerReview: false };
  // stage 3 (or beyond) -> flag for manager review, no further auto date
  return { stage, nextDate: null, needsManagerReview: true };
}
