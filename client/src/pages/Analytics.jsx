import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function pct(v) { return v == null ? '—' : `${v}%`; }

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
  const [toast, setToast] = useState(null);

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
      api.get('/analytics/branches').then(setBranchesOverview).catch(() => {});
    }
    // agents: load own user view immediately
    if (!isManager) {
      api.get('/analytics/user').then(setUserView).catch((e) => showToast(e.message));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load branch view when a location is chosen
  useEffect(() => {
    if (!isManager || !locationId) return;
    api.get(`/analytics/branch?locationId=${locationId}`).then(setBranch).catch((e) => showToast(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // Load user view when a user is chosen (manager)
  useEffect(() => {
    if (!isManager) return;
    const q = userId ? `?userId=${userId}` : '';
    if (tab === 'user' && userId) {
      api.get(`/analytics/user${q}`).then(setUserView).catch((e) => showToast(e.message));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab]);

  return (
    <>
      {toast && <div className="toast-wrap"><div className={`toast ${toast.type}`}>{toast.message}</div></div>}

      <div className="topbar"><h2>Analytics</h2></div>

      {isManager && (
        <div className="filters">
          <div>
            <label>View</label>
            <select value={tab} onChange={(e) => setTab(e.target.value)}>
              <option value="branch">Branch view</option>
              <option value="user">User view</option>
              <option value="overview">All branches</option>
            </select>
          </div>
        </div>
      )}

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
