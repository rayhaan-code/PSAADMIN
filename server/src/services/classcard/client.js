// ClassCard public API client.
//
// Read-only integration. Configuration comes from environment variables so the
// API key is never stored in the repo or database. Keys are PER BRANCH:
//
//   CLASSCARD_API_KEY_<BRANCH_SLUG>   the branch's key (e.g. CLASSCARD_API_KEY_AL_MAJAZ)
//   CLASSCARD_API_URL_<BRANCH_SLUG>   (optional) per-branch base URL override
//   CLASSCARD_API_KEY                 (optional) global fallback key
//   CLASSCARD_API_URL                 (optional) global base URL override
//
// The branch slug is the Location name uppercased with non-alphanumerics turned
// into underscores (e.g. "Al Majaz" -> "AL_MAJAZ", "Tilal City" -> "TILAL_CITY").
//
// Auth: every request sends the `api-key: <key>` header.
// Note: ClassCard's GET endpoints accept a JSON body (per their docs), so we
// send one where their examples do.

const DEFAULT_BASE_URL = 'https://api.classcardapp.com/api/v2/public';

// Turn a Location name into an env-var-safe slug: "Al Majaz" -> "AL_MAJAZ".
export function branchSlug(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Resolve the ClassCard config (key + base URL) for a given Location (or null).
// Falls back to the global CLASSCARD_API_KEY / CLASSCARD_API_URL when a branch
// key isn't set, so a single global key still works if you prefer.
export function resolveBranchConfig(location) {
  const slug = branchSlug(location && location.name);
  const apiKey =
    (slug && process.env[`CLASSCARD_API_KEY_${slug}`]) ||
    process.env.CLASSCARD_API_KEY ||
    '';
  const baseUrl = (
    (slug && process.env[`CLASSCARD_API_URL_${slug}`]) ||
    process.env.CLASSCARD_API_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
  return { apiKey, baseUrl, slug, branch: location ? location.name : null, configured: Boolean(apiKey) };
}

// True if this specific config has a usable key.
export function isConfigured(cfg) {
  return Boolean(cfg && cfg.apiKey);
}

// True if ANY ClassCard key is configured (global or any per-branch var).
// Used by /status to distinguish "not set up at all" from "this branch has no key".
export function hasAnyKey() {
  if (process.env.CLASSCARD_API_KEY) return true;
  return Object.keys(process.env).some((k) => k.startsWith('CLASSCARD_API_KEY_'));
}

// Low-level request helper. Returns parsed JSON or throws a readable error.
// `cfg` is the resolved branch config ({ apiKey, baseUrl }).
async function ccRequest(cfg, method, pathAndQuery, body) {
  if (!isConfigured(cfg)) {
    const err = new Error('ClassCard is not configured for this branch. Add its CLASSCARD_API_KEY_<BRANCH> in the environment.');
    err.code = 'CLASSCARD_NOT_CONFIGURED';
    throw err;
  }
  const url = `${cfg.baseUrl}/${pathAndQuery.replace(/^\/+/, '')}`;
  const headers = { 'api-key': cfg.apiKey };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) || (data && data.error) || `ClassCard request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- Endpoint wrappers (confirmed from ClassCard docs) ---
// Each takes the resolved branch `cfg` as its first argument.

// GET /invoices?detailed=true — all invoices (used for pending/overdue analysis).
export function getInvoices(cfg, { detailed = true } = {}) {
  return ccRequest(cfg, 'GET', `invoices?detailed=${detailed ? 'true' : 'false'}`);
}

// GET /payments?detailed=true — all payments.
export function getPayments(cfg, { detailed = true } = {}) {
  return ccRequest(cfg, 'GET', `payments?detailed=${detailed ? 'true' : 'false'}`);
}

// GET /students/list/ — look up a student, optionally by email.
export function getStudentList(cfg, { email } = {}) {
  return ccRequest(cfg, 'GET', 'students/list/', email ? { email } : {});
}

// GET /students/events/ — a student's events/sessions in a date range (attendance source).
export function getStudentEvents(cfg, { student, start, end }) {
  return ccRequest(cfg, 'GET', 'students/events/', { student, start, end });
}

// GET /students/invoices/{studentId} — invoices for a single student.
export function getStudentInvoices(cfg, studentId, { timezone = 'Asia/Dubai' } = {}) {
  return ccRequest(cfg, 'GET', `students/invoices/${studentId}?timezone=${encodeURIComponent(timezone)}`);
}

// GET /staff/events/ — staff (agent) events; used for capacity/scheduling context.
export function getStaffEvents(cfg, { staff_id, start, end } = {}) {
  return ccRequest(cfg, 'GET', 'staff/events/', { staff_id, start, end });
}

// GET /staff/services?staff_id= — services a staff member offers.
export function getStaffServices(cfg, { staff_id } = {}) {
  return ccRequest(cfg, 'GET', `staff/services?staff_id=${encodeURIComponent(staff_id)}`);
}
