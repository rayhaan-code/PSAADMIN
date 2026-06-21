import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'AGENT', locationId: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

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
                <td><button className="btn small secondary" onClick={() => resetPassword(u)}>Reset password</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Locations</h3>
        <p className="muted">{locations.map((l) => `${l.name} (${l.customerCount})`).join('  ·  ')}</p>
      </div>
    </>
  );
}
