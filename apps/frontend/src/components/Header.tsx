import React from 'react';
import { Sparkles } from 'lucide-react';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
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
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    backdropFilter: 'blur(8px)',
    position: 'sticky',
    top: 0,
    zIndex: 90,
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
    color: 'var(--text-main)',
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
    background: 'var(--primary-glow)',
    border: '1px solid var(--border-glow)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--primary)',
  },
  apiStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--success)',
    boxShadow: '0 0 8px var(--success)',
  },
};
