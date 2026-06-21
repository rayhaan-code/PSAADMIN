// Normalization maps for agents, locations, programs, and statuses.

// --- Agent name normalization (fixes typos seen across files) ---
// Maps any raw spelling -> canonical display name.
const AGENT_ALIASES = {
  haider: 'Haider',
  haidar: 'Haider',
  sangeetha: 'Sangeetha',
  gianne: 'Gianne',
  ryan: 'Ryan',
  justin: 'Justin',
  ayshea: 'Ayshea',
  aysha: 'Ayshea',
  maariya: 'Maariya',
  mariya: 'Maariya',
  maaria: 'Maariya',
  yousif: 'Yousif',
  yousuf: 'Yousif',
  rida: 'Rida',
  rica: 'Rica',
};

export function normalizeAgentName(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  if (AGENT_ALIASES[key]) return AGENT_ALIASES[key];
  // Title-case fallback for unknown agents
  return String(raw).trim().replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

// --- Location canonical names ---
export const LOCATIONS = ['Taawun', 'Tilal City', 'Al Majaz', 'Ajman Academy', 'Nasma', 'Karama'];

// Detect a location from a filename or sheet hint.
export function detectLocation(hint) {
  if (!hint) return null;
  const h = String(hint).toLowerCase();
  if (h.includes('taawun') || h.includes('tawuun') || h.includes('ta'.concat('wuun'))) return 'Taawun';
  if (h.includes('tilal')) return 'Tilal City';
  if (h.includes('majaz')) return 'Al Majaz';
  if (h.includes('ajman')) return 'Ajman Academy';
  if (h.includes('nasma')) return 'Nasma';
  if (h.includes('karama')) return 'Karama';
  return null;
}

// --- Program normalization (from sheet name or "Invoiced for"/Activity text) ---
export function normalizeProgram(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('gymnas')) return 'Gymnastics';
  if (s.includes('football')) return 'Football';
  if (s.includes('basket')) return 'Basketball';
  if (s.includes('swim')) return 'Swimming';
  if (s.includes('tennis')) return 'Tennis';
  if (s.includes('camp')) return 'Summer Camp';
  return null;
}

// --- Status normalization: messy free-text -> clean label. Raw text preserved separately. ---
export const STATUS_OPTIONS = [
  'Pending',
  'Contacted',
  'Interested',
  'Trial Booked',
  'Won/Enrolled',
  'Ongoing',
  'No Response',
  'Traveling',
  'Not Interested',
  "Lost/Won't Join",
];

export const PAYMENT_STATUS_OPTIONS = ['Paid', 'Pending', 'Overdue', 'Not Renewing'];

export const LEAD_STAGE_OPTIONS = ['Not Booked Yet', 'Shared Quotation', 'Trial Booked', 'Enrolled'];

export function normalizeStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();

  if (s.includes('enrolled') || s.includes('attend') || s.includes('won ') || s === 'won') return 'Won/Enrolled';
  if (s.includes('trial') && s.includes('book')) return 'Trial Booked';
  if (s.includes("won't join") || s.includes('will not join') || s.includes('will no join') || s.includes('wont join') || s.includes('not willing')) return "Lost/Won't Join";
  if (s.includes('not interested') || s.includes('wrong number') || s.includes('not a valid')) return 'Not Interested';
  if (s.includes('travel') || s.includes('vacation') || s.includes('back in')) return 'Traveling';
  if (s.includes('no response') || s.includes('no answer') || s.includes('not connecting') || s.includes('not connect') || s.includes('vm') || s.includes('voicemail')) return 'No Response';
  if (s.includes('interested') || s.includes('want more discount') || s.includes('requested trial')) return 'Interested';
  if (s.includes('ongoing') || s.includes('active')) return 'Ongoing';
  if (s.includes('call') || s.includes('wa sent') || s.includes('wa done') || s.includes('details') || s.includes('shared') || s.includes('sent')) return 'Contacted';
  if (s.includes('pending')) return 'Pending';

  return 'Pending';
}

export function normalizePaymentStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s.includes('paid')) return 'Paid';
  if (s.includes('overdue')) return 'Overdue';
  if (s.includes('not renew')) return 'Not Renewing';
  if (s.includes('pending')) return 'Pending';
  return null;
}

export function normalizeLeadStage(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('enrol')) return 'Enrolled';
  if (s.includes('trial') && s.includes('book')) return 'Trial Booked';
  if (s.includes('quotation') || s.includes('quote')) return 'Shared Quotation';
  if (s.includes('not booked')) return 'Not Booked Yet';
  return String(raw).trim();
}
