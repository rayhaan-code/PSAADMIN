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

function Shell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isManager = user?.role === 'MANAGER';
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <h1>Taawun CRM</h1>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/customers">Customers</NavLink>
        <NavLink to="/add-lead">Add Lead</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
        {isManager && <NavLink to="/import">Import Excel</NavLink>}
        {isManager && <NavLink to="/users">Users</NavLink>}
        <div className="spacer" />
        <div className="who">
          {user?.name} · {user?.role}
          {user?.location ? <><br />{user.location}</> : null}
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
