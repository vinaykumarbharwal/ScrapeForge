import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ListTodo, LogOut, Terminal, Award, Settings } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Sidebar() {
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/tasks', label: 'Scrape Tasks', icon: ListTodo },
    { to: '/settings', label: 'Developer APIs', icon: Terminal },
  ];

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logoContainer}>
        <div style={styles.logoIcon}>SF</div>
        <span style={styles.logoText}>ScrapeForge</span>
      </div>

      <nav style={styles.nav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div style={styles.footer}>
        <div style={styles.userInfo}>
          <Award size={16} color="#8b5cf6" />
          <div style={styles.userTextContainer}>
            <div style={styles.userEmail} title={user?.email || ''}>
              {user?.email || 'User'}
            </div>
            <div style={styles.userPlan}>Free Plan</div>
          </div>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary" style={styles.logoutBtn}>
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '260px',
    backgroundColor: '#0d0f1c',
    borderRight: '1px solid rgba(255, 255, 255, 0.07)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    boxSizing: 'border-box',
    zIndex: 100,
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  logoIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#fff',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.4)',
  },
  logoText: {
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '-0.5px',
    background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  nav: {
    flex: 1,
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '8px',
    color: '#9ca3af',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  },
  navLinkActive: {
    color: '#fff',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },
  footer: {
    padding: '20px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.03)',
  },
  userTextContainer: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  userEmail: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#f3f4f6',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userPlan: {
    fontSize: '11px',
    color: '#8b5cf6',
    fontWeight: 600,
  },
  logoutBtn: {
    width: '100%',
  },
};
