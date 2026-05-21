import React from 'react';
import { Sparkles, Terminal } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const user = useAuthStore((state) => state.user);

  return (
    <header style={styles.header}>
      <div>
        <h1 style={styles.title}>{title}</h1>
      </div>
      <div style={styles.meta}>
        <div style={styles.proPill}>
          <Sparkles size={14} color="#8b5cf6" />
          <span>ScrapeForge SaaS</span>
        </div>
        <div style={styles.apiStatus}>
          <div style={styles.statusDot}></div>
          <span>Cloud Cluster Connected</span>
        </div>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 40px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    backgroundColor: 'rgba(6, 7, 12, 0.4)',
    backdropFilter: 'blur(8px)',
    position: 'sticky',
    top: 0,
    zIndex: 90,
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  proPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '100px',
    background: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    fontSize: '12px',
    fontWeight: 600,
    color: '#a78bfa',
  },
  apiStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: 500,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 8px #10b981',
  },
};
