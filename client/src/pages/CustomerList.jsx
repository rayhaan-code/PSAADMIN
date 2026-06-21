import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : '—'; }

export default function CustomerList() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [locations, setLocations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ q: '', listType: '', status: '', locationId: '', agentId: '', review: '' });
  const [options, setOptions] = useState({ status: [], listType: [] });

  async function load() {
    const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const data = await api.get(`/customers?${qs.toString()}`);
    setItems(data.items);
    setTotal(data.total);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, filters]);
  useEffect(() => {
    api.get('/customers/options').then(setOptions).catch(() => {});
    if (isManager) {
      api.get('/locations').then(setLocations).catch(() => {});
      api.get('/users').then((u) => setAgents(u.filter((x) => x.role === 'AGENT'))).catch(() => {});
    }
  // eslint-disable-next-line
  }, []);

  function setF(k, v) { setPage(1); setFilters((f) => ({ ...f, [k]: v })); }

  const pages = Math.ceil(total / 50) || 1;

  return (
    <>
      <div className="topbar"><h2>Customers ({total})</h2></div>

      <div className="filters">
        <div style={{ minWidth: 220 }}>
          <label>Search</label>
          <input placeholder="Name, phone, email" value={filters.q} onChange={(e) => setF('q', e.target.value)} />
        </div>
        <div>
          <label>List</label>
          <select value={filters.listType} onChange={(e) => setF('listType', e.target.value)}>
            <option value="">All</option>
            {options.listType.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={filters.status} onChange={(e) => setF('status', e.target.value)}>
            <option value="">All</option>
            {options.status.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isManager && (
          <div>
            <label>Location</label>
            <select value={filters.locationId} onChange={(e) => setF('locationId', e.target.value)}>
              <option value="">All</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {isManager && (
          <div>
            <label>Agent</label>
            <select value={filters.agentId} onChange={(e) => setF('agentId', e.target.value)}>
              <option value="">All</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label>Review</label>
          <select value={filters.review} onChange={(e) => setF('review', e.target.value)}>
            <option value="">All</option>
            <option value="true">Flagged only</option>
          </select>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Program</th><th>List</th><th>Location</th><th>Agent</th><th>Status</th><th>Next / Renewal</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/customers/${c.id}`}>{c.name || '(no name)'}</Link></td>
                <td>{c.phone}</td>
                <td>{c.program || '—'}</td>
                <td><span className="badge blue">{c.listType}</span></td>
                <td>{c.location?.name || '—'}</td>
                <td>{c.assignedAgent?.name || '—'}</td>
                <td>{c.status || '—'}{c.needsManagerReview && <span className="badge amber" style={{ marginLeft: 6 }}>review</span>}</td>
                <td>{fmtDate(c.nextFollowUpDate || c.renewalDate)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="muted">No customers match.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn secondary small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <span className="muted" style={{ flex: 0 }}>Page {page} / {pages}</span>
        <button className="btn secondary small" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </>
  );
}
