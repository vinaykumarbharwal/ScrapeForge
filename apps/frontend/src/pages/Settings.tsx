import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useAuthStore } from '../store/authStore';
import { Key, Copy, Check, ShieldCheck, Terminal, HelpCircle } from 'lucide-react';

export default function Settings() {
  const token = useAuthStore((state) => state.token);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerateApiKey = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/auth/api-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setApiKey(data.api_key);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={styles.layout}>
      <Sidebar />
      <div style={styles.main}>
        <Header title="Developer APIs" />
        
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Developer Integration Keys</h2>
            <p style={styles.sectionSub}>Connect your external scripts and sync data via rest connections</p>
          </div>

          <div className="glass-panel" style={styles.panel}>
            <div style={styles.panelIconRow}>
              <ShieldCheck size={28} color="#8b5cf6" />
              <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>REST Authentication Keys</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#9ca3af' }}>
                  Use this secret key to authorize calls from external scrapers or backend programs.
                </p>
              </div>
            </div>

            <div style={styles.keyActionArea}>
              {apiKey ? (
                <div style={styles.keyDisplay}>
                  <code style={styles.keyText}>{apiKey}</code>
                  <button onClick={handleCopy} className="btn btn-secondary" style={styles.copyBtn}>
                    {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              ) : (
                <button onClick={handleGenerateApiKey} className="btn btn-primary" style={styles.generateBtn} disabled={loading}>
                  <Key size={16} />
                  <span>{loading ? 'Generating...' : 'Generate New API Key'}</span>
                </button>
              )}
            </div>

            <div style={styles.warningBox}>
              <HelpCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#d97706' }}>
                Keep this key secret. If compromised, generate a new one to immediately revoke access for the old token. We only show the key once upon generation.
              </span>
            </div>
          </div>

          <div style={{ marginTop: '40px' }} style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>API Usage Guidelines</h2>
            <p style={styles.sectionSub}>Triggering tasks and fetching dynamic datasets programmatically</p>
          </div>

          <div className="glass-panel" style={styles.codePanel}>
            <div style={styles.codeHeader}>
              <Terminal size={16} color="#9ca3af" />
              <span>cURL trigger scraper execution</span>
            </div>
            <pre style={styles.preCode}>
{`curl -X POST \\
  http://localhost:3000/api/tasks/YOUR_TASK_UUID/run \\
  -H "X-API-Key: sf_live_your_secret_key_here"`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#06070c',
  },
  main: {
    flex: 1,
    marginLeft: '260px',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  content: {
    padding: '40px',
    maxWidth: '800px',
  },
  sectionHeader: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    color: '#fff',
  },
  sectionSub: {
    fontSize: '13px',
    color: '#9ca3af',
    margin: '4px 0 0 0',
  },
  panel: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  panelIconRow: {
    display: 'flex',
    alignItems: 'start',
    gap: '16px',
  },
  keyActionArea: {
    padding: '16px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'center',
  },
  keyDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  keyText: {
    flex: 1,
    fontSize: '14px',
    color: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    border: '1px solid rgba(139, 92, 246, 0.1)',
    padding: '12px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  copyBtn: {
    padding: '12px 16px',
  },
  generateBtn: {
    padding: '12px 24px',
  },
  warningBox: {
    display: 'flex',
    gap: '10px',
    alignItems: 'start',
    padding: '14px',
    backgroundColor: 'rgba(245, 158, 11, 0.07)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    borderRadius: '8px',
  },
  codePanel: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: '#090a12',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  codeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: '12px',
    color: '#9ca3af',
  },
  preCode: {
    margin: 0,
    padding: '20px',
    fontSize: '13px',
    color: '#a78bfa',
    fontFamily: 'Courier New, Courier, monospace',
    overflowX: 'auto',
  },
};
