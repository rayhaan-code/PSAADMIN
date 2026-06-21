import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const PROGRAMS = ['Football', 'Gymnastics', 'Basketball', 'Swimming', 'Tennis', 'Summer Camp', 'General'];

export default function AddLead() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '', phone: '', whatsapp: '', email: '', age: '',
    program: 'General', listType: 'LEAD', locationId: '', assignedAgentId: '',
    status: 'Pending', source: 'Manual', nextFollowUpDate: '', notes: '',
  });
  const [options, setOptions] = useState({ status: [], listType: [] });
  const [locations, setLocations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/customers/options').then(setOptions).catch(() => {});
    api.get('/locations').then(setLocations).catch(() => {});
    if (isManager) api.get('/users').then((u) => setAgents(u.filter((x) => x.role === 'AGENT'))).catch(() => {});
  // eslint-disable-next-line
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const created = await api.post('/customers', form);
      nav(`/customers/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar"><h2>Add new lead</h2></div>
      <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
        <div className="row">
          <div><label>Name</label><input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div><label>Phone *</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></div>
        </div>
        <div className="row">
          <div><label>WhatsApp</label><input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></div>
          <div><label>Email</label><input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label>Age</label><input type="number" value={form.age} onChange={(e) => set('age', e.target.value)} /></div>
        </div>
        <div className="row">
          <div>
            <label>Program</label>
            <select value={form.program} onChange={(e) => set('program', e.target.value)}>
              {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label>List</label>
            <select value={form.listType} onChange={(e) => set('listType', e.target.value)}>
              {(options.listType.length ? options.listType : ['LEAD', 'RENEWAL', 'FOLLOW_UP', 'TRIAL', 'UNSCHEDULED']).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {(options.status.length ? options.status : ['Pending']).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <div>
            <label>Location</label>
            <select value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
              <option value="">{user?.location || 'Select…'}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {isManager && (
            <div>
              <label>Assign to agent</label>
              <select value={form.assignedAgentId} onChange={(e) => set('assignedAgentId', e.target.value)}>
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div><label>First follow-up date</label><input type="date" value={form.nextFollowUpDate} onChange={(e) => set('nextFollowUpDate', e.target.value)} /></div>
        </div>
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        <button className="btn" style={{ marginTop: 14 }} disabled={busy}>{busy ? 'Saving…' : 'Create lead'}</button>
        {error && <div className="error">{error}</div>}
      </form>
    </>
  );
}
