// Small date helpers for the date-range filters.

// ISO YYYY-MM-DD for a Date, using local calendar day.
export function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// { start, end } for the current calendar month (1st -> today).
export function thisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: isoDay(start), end: isoDay(now) };
}
