import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import DateRangeFilter from '../components/DateRangeFilter.jsx';
import { thisMonthRange } from '../lib/dates.js';

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function pct(v) { return v == null ? '—' : `${v}%`; }

function ClassCardPanel({ locationId }) {
  const [status, setStatus] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [capacity, setCapacity] = useState(null);

  useEffect(() => {
    // Reset when the branch changes so we never show another branch's numbers.
    setStatus(null); setInvoices(null); setCapacity(null);
    const q = locationId ? `?locationId=${locationId}` : '';
    api.get(`/classcard/status${q}`).then(setStatus).catch(() => setStatus({ configured: false }));
    api.get(`/classcard/invoices/summary${q}`).then(setInvoices).catch(() => {});
    api.get(`/classcard/capacity${q}`).then(setCapacity).catch(() => {});
  }, [locationId]);

  if (status && status.configured === false) {
    return (
      <div className="card" style={{ borderColor: '#fde68a' }}>
        <h3 style={{ marginTop: 0 }}>ClassCard integration</h3>
        <p className="muted">
          {status.branch ? <>Not connected for <b>{status.branch}</b> yet. </> : 'Not connected yet. '}
          Add this branch's ClassCard API key as <b>CLASSCARD_API_KEY_&lt;BRANCH&gt;</b> in the server
          environment (e.g. <code>CLASSCARD_API_KEY_AL_MAJAZ</code>) to see its invoices, attendance, and capacity here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>ClassCard — invoices</h3>
        {invoices?.configured ? (
          <div className="grid stats">
            <Stat label="Pending" value={invoices.pending} tone="warn" />
            <Stat label="Overdue" value={invoices.overdue} tone="bad" />
            <Stat label="Paid" value={invoices.paid} tone="good" />
            <Stat label="Pending amount" value={invoices.pendingAmount} />
            <Stat label="Overdue amount" value={invoices.overdueAmount} />
            <Stat label="Total invoices" value={invoices.total} />
          </div>
        ) : <p className="muted">Loading invoice data…</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>ClassCard — capacity</h3>
        {capacity?.configured ? (
          <>
            <div className="grid stats">
              <Stat label="Classes" value={capacity.classes} />
              <Stat label="Full classes" value={capacity.full} tone={capacity.full > 0 ? 'warn' : 'good'} />
              <Stat label="Avg utilization" value={pct(capacity.avgUtilization)} />
            </div>
            {capacity.rows?.length > 0 && (
              <table>
                <thead><tr><th>Class</th><th>Enrolled</th><th>Capacity</th><th>Utilization</th></tr></thead>
                <tbody>
                  {capacity.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.enrolled}</td>
                      <td>{r.capacity || '—'}</td>
                      <td>{pct(r.utilization)}{r.full ? ' · FULL' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : <p className="muted">Loading capacity data…</p>}
      </div>
    </>
  );
}

function StudentsPanel({ locationId }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    setData(null); setQ('');
    const query = locationId ? `?locationId=${locationId}` : '';
    api.get(`/classcard/students${query}`).then(setData).catch(() => setData({ configured: false }));
  }, [locationId]);

  if (data && data.configured === false) return null; // ClassCardPanel already shows the "not connected" note.

  const students = data?.students || [];
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? students.filter((s) => `${s.name || ''} ${s.phone || ''} ${s.email || ''}`.toLowerCase().includes(needle))
    : students;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>ClassCard — students {data ? `(${data.count ?? students.length})` : ''}</h3>
      {!data ? (
        <p className="muted">Loading students…</p>
      ) : (
        <>
          <div style={{ marginBottom: 8, maxWidth: 260 }}>
            <input placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead>
            <tbody>
              {rows.slice(0, 100).map((s) => (
                <tr key={s.studentId}><td>{s.name || '—'}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td></tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="muted">No students match.</td></tr>}
            </tbody>
          </table>
          {rows.length > 100 && <p className="muted">Showing first 100 of {rows.length}. Refine your search to narrow down.</p>}
        </>
      )}
    </div>
  );
}

function SummaryCards({ s }) {
  if (!s) return null;
  return (
    <div className="grid stats">
      <Stat label="Retention rate" value={pct(s.retentionRate)} tone="good" />
      <Stat label="Total customers" value={s.total} />
      <Stat label="Renewals" value={s.renewals} />
      <Stat label="Leads" value={s.leads} />
      <Stat label="Won / Enrolled" value={s.won} tone="good" />
      <Stat label="Needs review" value={s.review} tone="warn" />
    </div>
  );
}

function RenewalHealth({ s }) {
  if (!s) return null;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Renewal health</h3>
      <div className="row">
        <div><b>Renewed:</b> {s.renewed}</div>
        <div><b>Not renewing:</b> {s.notRenewing}</div>
        <div><b>Pending:</b> {s.pending}</div>
        <div><b>Overdue:</b> {s.overdue}</div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';

  const [tab, setTab] = useState(isManager ? 'branch' : 'user');
  const [locations, setLocations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [userId, setUserId] = useState('');
  const [branch, setBranch] = useState(null);
  const [userView, setUserView] = useState(null);
  const [branchesOverview, setBranchesOverview] = useState([]);
  const [range, setRange] = useState(thisMonthRange());
  const [toast, setToast] = useState(null);

  // `?start=&end=` suffix for analytics calls (KPIs scoped to the created-in-period range).
  const rangeQs = `start=${range.start || ''}&end=${range.end || ''}`;

  function showToast(message, type = 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (isManager) {
      api.get('/locations').then((ls) => {
        setLocations(ls);
        if (ls.length && !locationId) setLocationId(String(ls[0].id));
      }).catch(() => {});
      api.get('/users').then((u) => setAgents(u.filter((x) => x.role === 'AGENT'))).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Branches overview reloads with the date range (manager overview tab).
  useEffect(() => {
    if (!isManager) return;
    api.get(`/analytics/branches?${rangeQs}`).then(setBranchesOverview).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  // Agents: load own user view immediately, and refresh on range change.
  useEffect(() => {
    if (isManager) return;
    api.get(`/analytics/user?${rangeQs}`).then(setUserView).catch((e) => showToast(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  // Load branch view when a location or range is chosen
  useEffect(() => {
    if (!isManager || !locationId) return;
    api.get(`/analytics/branch?locationId=${locationId}&${rangeQs}`).then(setBranch).catch((e) => showToast(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, range.start, range.end]);

  // Load user view when a user or range is chosen (manager)
  useEffect(() => {
    if (!isManager) return;
    if (tab === 'user' && userId) {
      api.get(`/analytics/user?userId=${userId}&${rangeQs}`).then(setUserView).catch((e) => showToast(e.message));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab, range.start, range.end]);

  return (
    <>
      {toast && <div className="toast-wrap"><div className={`toast ${toast.type}`}>{toast.message}</div></div>}

      <div className="topbar"><h2>Analytics</h2></div>

      <div className="filters">
        {isManager && (
          <div>
            <label>View</label>
            <select value={tab} onChange={(e) => setTab(e.target.value)}>
              <option value="branch">Branch view</option>
              <option value="user">User view</option>
              <option value="overview">All branches</option>
            </select>
          </div>
        )}
        <DateRangeFilter
          start={range.start}
          end={range.end}
          onChange={(k, v) => setRange((r) => ({ ...r, [k]: v }))}
        />
      </div>

      {/* BRANCH VIEW */}
      {isManager && tab === 'branch' && (
        <>
          <div className="filters">
            <div>
              <label>Branch</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          {branch && (
            <>
              <SummaryCards s={branch.summary} />
              <RenewalHealth s={branch.summary} />
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Agent leaderboard — {branch.location.name}</h3>
                <table>
                  <thead><tr><th>Agent</th><th>Customers</th></tr></thead>
                  <tbody>
                    {branch.leaderboard.map((a) => (
                      <tr key={a.agentId ?? 'unassigned'}><td>{a.name}</td><td>{a.customers}</td></tr>
                    ))}
                    {branch.leaderboard.length === 0 && <tr><td colSpan={2} className="muted">No data.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {/* ClassCard metrics for the selected branch */}
          {locationId && <ClassCardPanel locationId={locationId} />}
          {locationId && <StudentsPanel locationId={locationId} />}
        </>
      )}

      {/* USER VIEW */}
      {tab === 'user' && (
        <>
          {isManager && (
            <div className="filters">
              <div>
                <label>Agent</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">— select an agent —</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
          )}
          {userView && (
            <>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>
                  {userView.user.name} · {userView.user.role}
                  {userView.user.location ? ` · ${userView.user.location}` : ''}
                </h3>
              </div>
              <SummaryCards s={userView.summary} />
              <RenewalHealth s={userView.summary} />
              <div className="card">
                <div className="row">
                  <div><b>Follow-ups due / overdue:</b> {userView.dueToday}</div>
                  <div><b>Total activities logged:</b> {userView.activityCount}</div>
                </div>
              </div>
            </>
          )}
          {/* Agents: ClassCard metrics for their own branch (server-locked). */}
          {!isManager && (
            <>
              <ClassCardPanel locationId="" />
              <StudentsPanel locationId="" />
            </>
          )}
          {isManager && !userId && <p className="muted">Select an agent to see their KPIs.</p>}
        </>
      )}

      {/* ALL BRANCHES OVERVIEW */}
      {isManager && tab === 'overview' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>All branches</h3>
          <table>
            <thead>
              <tr><th>Branch</th><th>Total</th><th>Renewals</th><th>Leads</th><th>Retention</th><th>Won</th><th>Review</th></tr>
            </thead>
            <tbody>
              {branchesOverview.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.total}</td>
                  <td>{b.renewals}</td>
                  <td>{b.leads}</td>
                  <td>{pct(b.retentionRate)}</td>
                  <td>{b.won}</td>
                  <td>{b.review}</td>
                </tr>
              ))}
              {branchesOverview.length === 0 && <tr><td colSpan={7} className="muted">No data.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
