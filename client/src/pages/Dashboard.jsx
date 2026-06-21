import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

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

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [data, setData] = useState({ followUpsDue: [], renewalsDue: [], reviewFlagged: [] });
  const [locations, setLocations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ locationId: '', agentId: '' });
  const [msg, setMsg] = useState('');

  const isManager = user?.role === 'MANAGER';

  async function load() {
    const qs = new URLSearchParams();
    if (filters.locationId) qs.set('locationId', filters.locationId);
    if (filters.agentId) qs.set('agentId', filters.agentId);
    const [s, t] = await Promise.all([
      api.get('/dashboard/stats'),
      api.get(`/dashboard/today?${qs.toString()}`),
    ]);
    setStats(s);
    setData(t);
  }

  useEffect(() => {
    load();
    if (isManager) {
      api.get('/locations').then(setLocations).catch(() => {});
      api.get('/users').then((u) => setAgents(u.filter((x) => x.role === 'AGENT'))).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.locationId, filters.agentId]);

  async function logFollowUp(c) {
    setMsg('');
    try {
      await api.post(`/customers/${c.id}/follow-up`, {});
      setMsg(`Follow-up logged for ${c.name || c.phone}.`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <>
      <div className="topbar">
        <h2>Who to call today</h2>
      </div>

      {stats && (
        <div className="grid stats">
          <div className="stat"><div className="n">{stats.dueToday}</div><div className="l">Due today / overdue</div></div>
          <div className="stat"><div className="n">{stats.review}</div><div className="l">Needs manager review</div></div>
          <div className="stat"><div className="n">{stats.renewals}</div><div className="l">Renewals</div></div>
          <div className="stat"><div className="n">{stats.leads}</div><div className="l">Leads</div></div>
          <div className="stat"><div className="n">{stats.followups}</div><div className="l">Follow-ups</div></div>
          <div className="stat"><div className="n">{stats.total}</div><div className="l">Total customers</div></div>
        </div>
      )}

      {isManager && (
        <div className="filters">
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
        </div>
      )}

      {msg && <div className="card" style={{ background: '#ecfdf5' }}>{msg}</div>}

      <Section title={`Follow-ups due / overdue (${data.followUpsDue.length})`} rows={data.followUpsDue} onAction={logFollowUp} />
      <Section title={`Renewals due soon (${data.renewalsDue.length})`} rows={data.renewalsDue} onAction={logFollowUp} />
      {isManager && <Section title={`Flagged for manager review (${data.reviewFlagged.length})`} rows={data.reviewFlagged} onAction={logFollowUp} />}
    </>
  );
}

function Section({ title, rows, onAction }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">Nothing here right now.</p>
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
    </div>
  );
}
