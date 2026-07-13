import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : '—'; }
function fmtDateTime(d) { return new Date(d).toLocaleString(); }

export default function CustomerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [c, setC] = useState(null);
  const [options, setOptions] = useState({ status: [], paymentStatus: [], leadStage: [], listType: [] });
  const [agents, setAgents] = useState([]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [classcard, setClasscard] = useState(null);

  async function load() {
    const data = await api.get(`/customers/${id}`);
    setC(data);
  }
  useEffect(() => {
    load();
    api.get('/customers/options').then(setOptions).catch(() => {});
    if (isManager) api.get('/users').then((u) => setAgents(u.filter((x) => x.role === 'AGENT'))).catch(() => {});
  // eslint-disable-next-line
  }, [id]);

  // ClassCard student summary. Available to agents too — the server scopes the
  // customer to the caller and locks agents to their own branch.
  useEffect(() => {
    setClasscard(null);
    api.get(`/classcard/student/summary?customerId=${id}`).then(setClasscard).catch(() => setClasscard(null));
  }, [id]);

  if (!c) return <div>Loading…</div>;

  async function patch(data) {
    setMsg('');
    try { await api.patch(`/customers/${id}`, data); await load(); setMsg('Saved.'); }
    catch (e) { setMsg(e.message); }
  }
  async function logFollowUp() {
    await api.post(`/customers/${id}/follow-up`, { note });
    setNote(''); await load(); setMsg('Follow-up logged.');
  }
  async function logActivity(type) {
    if (!note.trim()) return;
    await api.post(`/customers/${id}/activity`, { type, detail: note });
    setNote(''); await load(); setMsg(`${type === 'CALL' ? 'Call' : 'Note'} logged.`);
  }

  return (
    <>
      <div className="topbar">
        <h2>{c.name || '(no name)'} <span className="badge blue">{c.listType}</span></h2>
        <Link to="/customers" className="btn secondary small">← Back</Link>
      </div>

      {msg && <div className="card" style={{ background: '#ecfdf5' }}>{msg}</div>}

      <div className="row">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Details</h3>
          <p><b>Phone:</b> {c.phone} {c.whatsapp && <span className="muted">· WA {c.whatsapp}</span>}</p>
          <p><b>Email:</b> {c.email || '—'}</p>
          <p><b>Program:</b> {c.program || '—'} · {c.activity || ''}</p>
          <p><b>Location:</b> {c.location?.name || '—'}</p>
          <p><b>Renewal date:</b> {fmtDate(c.renewalDate)}</p>
          <p><b>Next follow-up:</b> {fmtDate(c.nextFollowUpDate)} (stage {c.followUpStage})</p>
          {c.needsManagerReview && <p><span className="badge amber">Flagged for manager review</span></p>}
          {c.sessions && (
            <p className="muted">Sessions — invoiced {c.sessions.invoiced || 0}, consumed {c.sessions.consumed || 0}, scheduled {c.sessions.scheduled || 0}, yet {c.sessions.yetToSchedule || 0}</p>
          )}
          {c.notes && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</p>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Update</h3>
          <label>Status</label>
          <select value={c.status || ''} onChange={(e) => patch({ status: e.target.value })}>
            <option value="">—</option>
            {options.status.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label>Payment status</label>
          <select value={c.paymentStatus || ''} onChange={(e) => patch({ paymentStatus: e.target.value })}>
            <option value="">—</option>
            {options.paymentStatus.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label>List</label>
          <select value={c.listType} onChange={(e) => patch({ listType: e.target.value })}>
            {options.listType.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {isManager && (
            <>
              <label>Assigned agent</label>
              <select value={c.assignedAgentId || ''} onChange={(e) => patch({ assignedAgentId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </>
          )}

          <label>Next follow-up date</label>
          <input type="date" value={c.nextFollowUpDate ? new Date(c.nextFollowUpDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => patch({ nextFollowUpDate: e.target.value })} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Log activity</h3>
        <textarea rows={3} placeholder="Call notes / remarks…" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => logActivity('CALL')}>Log call</button>
          <button className="btn secondary" onClick={() => logActivity('NOTE')}>Add note</button>
          <button className="btn" style={{ background: '#0d9488' }} onClick={logFollowUp}>
            Log follow-up (advances +2 / +5 / review)
          </button>
        </div>
      </div>

      {classcard && classcard.configured !== false && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>ClassCard {classcard.branch ? <span className="muted">· {classcard.branch}</span> : null}</h3>
          {!classcard.matched ? (
            <p className="muted">{classcard.message || 'No ClassCard student matched this customer.'}</p>
          ) : (
            <>
              <p>
                <b>Matched student:</b> {classcard.studentName || `#${classcard.studentId}`}
              </p>
              {classcard.attendance && (
                <p className="muted">
                  Attendance ({classcard.window?.start} → {classcard.window?.end}):
                  {' '}marked {classcard.attendance.marked},
                  {' '}<b>unmarked {classcard.attendance.unmarked}</b>,
                  {' '}upcoming {classcard.attendance.upcoming} (of {classcard.attendance.total})
                </p>
              )}
              {classcard.invoices && (
                <p className="muted">
                  Invoices: paid {classcard.invoices.paid},
                  {' '}pending {classcard.invoices.pending} (AED {classcard.invoices.pendingAmount}),
                  {' '}<b>overdue {classcard.invoices.overdue} (AED {classcard.invoices.overdueAmount})</b>
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>History</h3>
        <ul className="timeline">
          {c.activities.map((a) => (
            <li key={a.id}>
              <b>{a.type}</b> {a.detail}
              <div className="when">{fmtDateTime(a.createdAt)} · {a.user?.name || 'system'}</div>
            </li>
          ))}
          {c.activities.length === 0 && <li className="muted">No activity yet.</li>}
        </ul>
      </div>
    </>
  );
}
