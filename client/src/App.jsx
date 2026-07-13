import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CustomerList from './pages/CustomerList.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import AddLead from './pages/AddLead.jsx';
import ImportPage from './pages/ImportPage.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import Analytics from './pages/Analytics.jsx';

const Icon = {
  dashboard: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
  ),
  customers: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  addLead: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
  ),
  analytics: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
  ),
  import: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
  ),
  users: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
};

function Shell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isManager = user?.role === 'MANAGER';
  const initials = (user?.name || 'P').trim().charAt(0).toUpperCase();
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          <div className="logo">{initials}</div>
          <div>
            <h1>PSA Admin</h1>
            <div className="sub">Sports CRM</div>
          </div>
        </div>

        <div className="nav-label">Main</div>
        <NavLink to="/" end>{Icon.dashboard}<span>Dashboard</span></NavLink>
        <NavLink to="/customers">{Icon.customers}<span>Customers</span></NavLink>
        <NavLink to="/add-lead">{Icon.addLead}<span>Add Lead</span></NavLink>
        <NavLink to="/analytics">{Icon.analytics}<span>Analytics</span></NavLink>

        {isManager && (
          <>
            <div className="nav-label">Manage</div>
            <NavLink to="/import">{Icon.import}<span>Import Excel</span></NavLink>
            <NavLink to="/users">{Icon.users}<span>Users</span></NavLink>
          </>
        )}

        <div className="spacer" />
        <div className="who">
          <div className="who-avatar">{initials}</div>
          <div className="who-meta">
            <div className="who-name">{user?.name}</div>
            <div className="who-sub">{user?.role}{user?.location ? ` · ${user.location}` : ''}</div>
          </div>
        </div>
        <button className="btn secondary small" onClick={() => { logout(); nav('/login'); }}>Log out</button>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

function Protected({ children, managerOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (managerOnly && user.role !== 'MANAGER') return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/customers" element={<Protected><CustomerList /></Protected>} />
      <Route path="/customers/:id" element={<Protected><CustomerDetail /></Protected>} />
      <Route path="/add-lead" element={<Protected><AddLead /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/import" element={<Protected managerOnly><ImportPage /></Protected>} />
      <Route path="/users" element={<Protected managerOnly><UsersAdmin /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
