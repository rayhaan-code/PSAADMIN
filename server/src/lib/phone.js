// Phone normalization. Sheets contain "971551997096", "971 50 122 7574",
// " 56 136 9333", "91 78990 50906", etc. We keep digits only and best-effort
// normalize UAE numbers to a canonical form for deduplication.

export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // Drop leading zeros
  digits = digits.replace(/^0+/, '');

  // UAE numbers: country code 971 + 9-digit national number (5x/050 etc.)
  // If it already starts with 971 and is long enough, keep as-is.
  if (digits.startsWith('971')) {
    return digits;
  }

  // National UAE mobile typically 9 digits starting 5 (e.g. 501227574).
  // Prepend 971 so "50 122 7574" and "971 50 122 7574" dedupe to the same key.
  if (digits.length === 9 && digits.startsWith('5')) {
    return '971' + digits;
  }

  // Other international numbers (e.g. India "91...") — keep raw digits.
  return digits;
}

// Human-friendly display of a normalized UAE number.
export function displayPhone(normalized) {
  if (!normalized) return '';
  if (normalized.startsWith('971') && normalized.length === 12) {
    const n = normalized.slice(3);
    return `+971 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  return '+' + normalized;
}
