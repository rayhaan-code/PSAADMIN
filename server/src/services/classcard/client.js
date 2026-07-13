// ClassCard public API client.
//
// Read-only integration. Configuration comes from environment variables so the
// API key is never stored in the repo:
//   CLASSCARD_API_URL  (optional) default https://api.classcardapp.com/api/v2/public
//   CLASSCARD_API_KEY  (required)  generated on ClassCard's Integrations page
//
// Auth: every request sends the `api-key: <key>` header.
// Note: ClassCard's GET endpoints accept a JSON body (per their docs), so we
// send one where their examples do.

const BASE_URL = (process.env.CLASSCARD_API_URL || 'https://api.classcardapp.com/api/v2/public').replace(/\/+$/, '');
const API_KEY = process.env.CLASSCARD_API_KEY || '';

export function isConfigured() {
  return Boolean(API_KEY);
}

// Low-level request helper. Returns parsed JSON or throws a readable error.
async function ccRequest(method, pathAndQuery, body) {
  if (!isConfigured()) {
    const err = new Error('ClassCard is not configured. Add CLASSCARD_API_KEY in your environment.');
    err.code = 'CLASSCARD_NOT_CONFIGURED';
    throw err;
  }
  const url = `${BASE_URL}/${pathAndQuery.replace(/^\/+/, '')}`;
  const headers = { 'api-key': API_KEY };
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

// GET /invoices?detailed=true — all invoices (used for pending/overdue analysis).
export function getInvoices({ detailed = true } = {}) {
  return ccRequest('GET', `invoices?detailed=${detailed ? 'true' : 'false'}`);
}

// GET /payments?detailed=true — all payments.
export function getPayments({ detailed = true } = {}) {
  return ccRequest('GET', `payments?detailed=${detailed ? 'true' : 'false'}`);
}

// GET /students/list/ — look up a student, optionally by email.
export function getStudentList({ email } = {}) {
  return ccRequest('GET', 'students/list/', email ? { email } : {});
}

// GET /students/events/ — a student's events/sessions in a date range (attendance source).
export function getStudentEvents({ student, start, end }) {
  return ccRequest('GET', 'students/events/', { student, start, end });
}

// GET /students/invoices/{studentId} — invoices for a single student.
export function getStudentInvoices(studentId, { timezone = 'Asia/Dubai' } = {}) {
  return ccRequest('GET', `students/invoices/${studentId}?timezone=${encodeURIComponent(timezone)}`);
}

// GET /staff/events/ — staff (agent) events; used for capacity/scheduling context.
export function getStaffEvents({ staff_id, start, end } = {}) {
  return ccRequest('GET', 'staff/events/', { staff_id, start, end });
}

// GET /staff/services?staff_id= — services a staff member offers.
export function getStaffServices({ staff_id } = {}) {
  return ccRequest('GET', `staff/services?staff_id=${encodeURIComponent(staff_id)}`);
}
