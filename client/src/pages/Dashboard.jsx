import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import DateRangeFilter from '../components/DateRangeFilter.jsx';
import { thisMonthRange } from '../lib/dates.js';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 10);
}

function CustomerRow({ c, onAction }) {
  return (
    <tr>
      <td><Link to={`/customers/${c.id}`}>{c.name || '(no name)'}</Link></td>
      <td>{c.phone}</td>
      <td>{c.program || '—'}</td>
      <td><span className="badge blue">{c.listType}</span></td>
      <td>{c.location?.name || '—'}</td>
      <td>{c.assignedAgent?.name || '—'}</td>
      <td>{c.status || '—'}</td>
      <td>{fmtDate(c.nextFollowUpDate || c.renewalDate)}</td>
      <td>
        <button className="btn small" onClick={() => onAction(c)}>Log follow-up</button>
      </td>
    </tr>
  );
}

function List({ title, rows, onAction }) {
  return (
    <>
      <h4 style={{ margin: '12px 0 6px' }}>{title} ({rows.length})</h4>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing here right now.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Program</th><th>List</th><th>Location</th><th>Agent</th><th>Status</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => <CustomerRow key={c.id} c={c} onAction={onAction} />)}
          </tbody>
        </table>
      )}
    </>
  );
}

const EMPTY = {
  today: { followUps: [], renewals: [] },
  tomorrow: { followUps: [], renewals: [] },
  next7: { followUpCount: 0, renewalCount: 0 },
  total: { followUpCount: 0, renewalCount: 0 },
  reviewFlagged: [],
  callsToday: 0,
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [retention, setRetention] = useState(null);
  const [data, setData] = useState(EMPTY);
  const [payments, setPayments] = useState(null);
  const [locations, setLocations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ locationId: '', agentId: '', ...thisMonthRange() });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const isManager = user?.role === 'MANAGER';

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.locationId) qs.set('locationId', filters.locationId);
    if (filters.agentId) qs.set('agentId', filters.agentId);
    // Date range applies to the KPI stats + retention (created-in-period).
    const dqs = new URLSearchParams(qs);
    if (filters.start) dqs.set('start', filters.start);
    if (filters.end) dqs.set('end', filters.end);
    // Payments (ClassCard invoices) only accept a branch locationId.
    const pqs = filters.locationId ? `?locationId=${filters.locationId}` : '';
    try {
      const [s, t, r] = await Promise.all([
        api.get(`/dashboard/stats?${dqs.toString()}`),
        api.get(`/dashboard/today?${qs.toString()}`),
        api.get(`/analytics/retention?${dqs.toString()}`),
      ]);
      setStats(s);
      setData(t);
      setRetention(r);
      // Best-effort: hide the payments block if ClassCard isn't connected.
      api.get(`/classcard/invoices/summary${pqs}`)
        .then((p) => setPayments(p && p.configured ? p : null))
        .catch(() => setPayments(null));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (isManager) {
      api.get('/locations').then(setLocations).catch(() => {});
      api.get('/users').then((u) => setAgents(u.filter((x) => x.role === 'AGENT'))).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.locationId, filters.agentId, filters.start, filters.end]);

  async function logFollowUp(c) {
    try {
      await api.post(`/customers/${c.id}/follow-up`, {});
      showToast(`Follow-up logged for ${c.name || c.phone}.`);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  return (
    <>
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <div className="topbar">
        <h2>My day</h2>
      </div>

      {loading && !stats ? (
        <div className="grid stats">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="stat"><div className="skeleton row" /></div>)}
        </div>
      ) : stats && (
        <div className="grid stats">
          <div className="stat good"><div className="n">{data.callsToday}</div><div className="l">Calls logged today</div></div>
          <div className="stat bad"><div className="n">{stats.dueToday}</div><div className="l">Due today / overdue</div></div>
          <div className="stat warn"><div className="n">{stats.review}</div><div className="l">Needs manager review</div></div>
          <div className="stat"><div className="n">{stats.renewals}</div><div className="l">Renewals</div></div>
          <div className="stat"><div className="n">{stats.leads}</div><div className="l">Leads</div></div>
          <div className="stat"><div className="n">{stats.total}</div><div className="l">Total customers</div></div>
        </div>
      )}

      <div className="filters">
        {isManager && (
          <>
            <div>
              <label>Location</label>
              <select value={filters.locationId} onChange={(e) => setFilters((f) => ({ ...f, locationId: e.target.value }))}>
                <option value="">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label>Agent</label>
              <select value={filters.agentId} onChange={(e) => setFilters((f) => ({ ...f, agentId: e.target.value }))}>
                <option value="">All agents</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </>
        )}
        <DateRangeFilter
          start={filters.start}
          end={filters.end}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        />
      </div>
      <p className="muted" style={{ marginTop: -4, fontSize: 12 }}>
        Location/agent filters scope the day lists. The date range scopes the KPI stats and retention above.
      </p>

      {/* TODAY */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Today</h3>
        <div className="row" style={{ marginBottom: 4 }}>
          <div><b>Calls logged today:</b> {data.callsToday}</div>
          {payments && (
            <>
              <div><b>Pending invoices:</b> {payments.pending} (AED {payments.pendingAmount})</div>
              <div><b>Overdue invoices:</b> {payments.overdue} (AED {payments.overdueAmount})</div>
            </>
          )}
        </div>
        {payments && payments.branch && (
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Payments from ClassCard · {payments.branch}</p>
        )}
        <List title="Follow-ups due today / overdue" rows={data.today.followUps} onAction={logFollowUp} />
        <List title="Renewals due today / overdue" rows={data.today.renewals} onAction={logFollowUp} />
      </div>

      {/* TOMORROW */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tomorrow</h3>
        <List title="Follow-ups" rows={data.tomorrow.followUps} onAction={logFollowUp} />
        <List title="Renewals" rows={data.tomorrow.renewals} onAction={logFollowUp} />
      </div>

      {/* NEXT 7 DAYS + TOTAL */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Upcoming workload</h3>
        <div className="grid stats">
          <div className="stat"><div className="n">{data.next7.followUpCount}</div><div className="l">Follow-ups · next 7 days</div></div>
          <div className="stat"><div className="n">{data.next7.renewalCount}</div><div className="l">Renewals · next 7 days</div></div>
          <div className="stat"><div className="n">{data.total.followUpCount}</div><div className="l">Follow-ups · total outstanding</div></div>
          <div className="stat"><div className="n">{data.total.renewalCount}</div><div className="l">Renewals · total outstanding</div></div>
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>
          Next 7 days = tomorrow through a week out. Use the Customers page to work the full list.
        </p>
      </div>

      {retention && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Renewal health</h3>
          <div className="row">
            <div><b>Renewed:</b> {retention.renewed}</div>
            <div><b>Not renewing:</b> {retention.notRenewing}</div>
            <div><b>Pending:</b> {retention.pending}</div>
            <div><b>Overdue:</b> {retention.overdue}</div>
            <div><b>Retention rate:</b> {retention.retentionRate != null ? `${retention.retentionRate}%` : '—'}</div>
          </div>
        </div>
      )}

      {isManager && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Flagged for manager review ({data.reviewFlagged.length})</h3>
          {data.reviewFlagged.length === 0 ? (
            <p className="muted">Nothing here right now.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Phone</th><th>Program</th><th>List</th><th>Location</th><th>Agent</th><th>Status</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {data.reviewFlagged.map((c) => <CustomerRow key={c.id} c={c} onAction={logFollowUp} />)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
