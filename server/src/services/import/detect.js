// Detect which of the 3 formats a workbook is, by inspecting headers.
import XLSX from 'xlsx';

// Returns 'renewal' | 'followup' | 'meta' | 'unknown'
export function detectFormat(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Scan first ~6 rows for a header row.
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      const header = rows[i].map((c) => String(c).trim().toLowerCase());
      const has = (substr) => header.some((h) => h.includes(substr));

      // META: has "inquiry date" + "lead stage" (very distinctive)
      if (has('lead stage') || (has('inquiry date') && has('source'))) return 'meta';

      // RENEWAL: has "invoicee" + "validity" + sessions columns
      if (has('invoicee') && has('validity')) return 'renewal';
      if (has('invoiced for') && has('payment status') && has('phone number')) return 'renewal';

      // FOLLOWUP tracker: Name/Phone/Activity/Admin Name/Follow Up Date/Status
      if (has('admin name') && has('follow up date') && has('activity')) return 'followup';
    }
  }
  return 'unknown';
}

// Find the header row index in a sheet given a set of required header substrings.
export function findHeaderRow(rows, requiredSubstrings) {
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const header = rows[i].map((c) => String(c).trim().toLowerCase());
    const ok = requiredSubstrings.every((req) => header.some((h) => h.includes(req)));
    if (ok) return i;
  }
  return -1;
}

// Build a column-name -> index map from a header row.
export function columnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const key = String(cell).trim().toLowerCase();
    if (key && !(key in map)) map[key] = idx;
  });
  return map;
}

// Find a column index by trying multiple header substrings.
export function col(map, ...candidates) {
  for (const c of candidates) {
    const want = c.toLowerCase();
    for (const key of Object.keys(map)) {
      if (key === want || key.includes(want)) return map[key];
    }
  }
  return -1;
}
