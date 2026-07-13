import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'AGENT', locationId: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [resetText, setResetText] = useState('');
  const [wiping, setWiping] = useState(false);

  function load() {
    api.get('/users').then(setUsers).catch(() => {});
    api.get('/locations').then(setLocations).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await api.post('/users', form);
      setForm({ name: '', email: '', password: '', role: 'AGENT', locationId: '' });
      setMsg('User created.');
      load();
    } catch (err) { setError(err.message); }
  }

  async function update(id, data) {
    try { await api.patch(`/users/${id}`, data); load(); setMsg('Updated.'); }
    catch (err) { setError(err.message); }
  }

  async function resetPassword(u) {
    const np = prompt(`New password for ${u.name}:`);
    if (np) update(u.id, { newPassword: np });
  }

  async function editName(u) {
    const nn = prompt(`New name for ${u.name}:`, u.name);
    if (nn && nn.trim() && nn !== u.name) update(u.id, { name: nn.trim() });
  }

  async function removeUser(u) {
    if (!window.confirm(`Delete ${u.name}? Their customers stay but become unassigned. This cannot be undone.`)) return;
    setError(''); setMsg('');
    try { await api.del(`/users/${u.id}`); setMsg(`Deleted ${u.name}.`); load(); }
    catch (err) { setError(err.message); }
  }

  async function resetData() {
    setError(''); setMsg('');
    setWiping(true);
    try {
      const r = await api.post('/users/reset/customers', { confirm: resetText });
      setMsg(`Data cleared: ${r.deletedCustomers} customers and ${r.deletedBatches} import batches removed. You can now import fresh sheets.`);
      setResetText('');
      load();
    } catch (err) { setError(err.message); }
    finally { setWiping(false); }
  }

  return (
    <>
      <div className="topbar"><h2>Users & Locations</h2></div>
      {msg && <div className="card" style={{ background: '#ecfdf5' }}>{msg}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add user (admin/agent)</h3>
        <form onSubmit={create}>
          <div className="row">
            <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div><label>Password</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          </div>
          <div className="row">
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="AGENT">Agent (location-scoped)</option>
                <option value="MANAGER">Manager (sees everything)</option>
              </select>
            </div>
            <div>
              <label>Location</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }}>Create user</button>
          {error && <div className="error">{error}</div>}
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>All users</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Customers</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}>
                    <option value="AGENT">AGENT</option>
                    <option value="MANAGER">MANAGER</option>
                  </select>
                </td>
                <td>
                  <select value={u.locationId || ''} onChange={(e) => update(u.id, { locationId: e.target.value || null })}>
                    <option value="">—</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </td>
                <td>{u.customerCount}</td>
                <td>
                  <input type="checkbox" checked={u.active} onChange={(e) => update(u.id, { active: e.target.checked })} style={{ width: 'auto' }} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small secondary" onClick={() => editName(u)}>Edit name</button>{' '}
                  <button className="btn small secondary" onClick={() => resetPassword(u)}>Reset password</button>{' '}
                  {u.id !== me?.id && (
                    <button className="btn small danger" onClick={() => removeUser(u)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Locations</h3>
        <p className="muted">{locations.map((l) => `${l.name} (${l.customerCount})`).join('  ·  ')}</p>
      </div>

      <div className="card" style={{ borderColor: '#fecaca' }}>
        <h3 style={{ marginTop: 0, color: '#b91c1c' }}>Danger zone — reset customer data</h3>
        <p className="muted">
          Permanently deletes <b>all customers, their call/note history, and import records</b> so you can import
          fresh sheets. Users and locations are kept. This <b>cannot be undone</b> and there is no automatic backup.
        </p>
        <p className="muted">To confirm, type <b>CONFIRM</b> below, then click the button.</p>
        <div className="row">
          <div>
            <label>Confirmation</label>
            <input value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="Type CONFIRM" />
          </div>
        </div>
        <button
          className="btn danger"
          style={{ marginTop: 12 }}
          disabled={wiping || resetText !== 'CONFIRM'}
          onClick={resetData}
        >
          {wiping ? 'Clearing…' : 'Delete all customer data'}
        </button>
      </div>
    </>
  );
}
