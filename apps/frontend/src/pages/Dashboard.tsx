import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useAuthStore } from '../store/authStore';
import { CheckCircle, XCircle, Activity, Database, Clock, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface RunItem {
  id: string;
  task_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_scraped: number;
  pages_visited: number;
  duration_ms: number | null;
  error_log: string | null;
}

export default function Dashboard() {
  const token = useAuthStore((state) => state.token);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRuns: 0,
    successRuns: 0,
    totalRows: 0,
    avgDuration: 0,
  });

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const taskRes = await fetch('http://localhost:3000/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tasks = await taskRes.json();
      
      const allRuns: RunItem[] = [];
      for (const t of tasks) {
        const runRes = await fetch(`http://localhost:3000/api/tasks/${t.id}/runs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rList = await runRes.json();
        allRuns.push(...rList);
      }

      allRuns.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
      setRuns(allRuns.slice(0, 10));

      const total = allRuns.length;
      const success = allRuns.filter((r) => r.status === 'success').length;
      const rows = allRuns.reduce((acc, curr) => acc + curr.rows_scraped, 0);
      const times = allRuns.filter((r) => r.duration_ms).map((r) => r.duration_ms as number);
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

      setStats({
        totalRuns: total,
        successRuns: success,
        totalRows: rows,
        avgDuration: avg,
      });
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardData();
      
      // Real-time polling: refresh every 5 seconds
      const interval = setInterval(() => {
        fetchDashboardData();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [token]);

  const chartData = runs
    .slice()
    .reverse()
    .map((r) => ({
      date: new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rows: r.rows_scraped,
      pages: r.pages_visited,
    }));

  return (
    <div style={styles.layout}>
      <Sidebar />
      <div style={styles.main}>
        <Header title="Console Dashboard" />
        
        <div style={styles.content}>
          <div style={styles.metricsGrid}>
            <div className="glass-panel" style={styles.metricCard}>
              <div style={styles.metricHeader}>
                <span style={styles.metricTitle}>Total Runs Triggered</span>
                <Activity size={20} color="#8b5cf6" />
              </div>
              <div style={styles.metricValue}>{stats.totalRuns}</div>
              <div style={styles.metricSub}>{stats.successRuns} successful executions</div>
            </div>

            <div className="glass-panel" style={styles.metricCard}>
              <div style={styles.metricHeader}>
                <span style={styles.metricTitle}>Data Rows Scraped</span>
                <Database size={20} color="#10b981" />
              </div>
              <div style={styles.metricValue}>{stats.totalRows.toLocaleString()}</div>
              <div style={styles.metricSub}>Extracted into dynamic DB</div>
            </div>

            <div className="glass-panel" style={styles.metricCard}>
              <div style={styles.metricHeader}>
                <span style={styles.metricTitle}>Avg Run Speed</span>
                <Clock size={20} color="#3b82f6" />
              </div>
              <div style={styles.metricValue}>{(stats.avgDuration / 1000).toFixed(2)}s</div>
              <div style={styles.metricSub}>Mean compute processing speed</div>
            </div>
          </div>

          <div style={styles.analyticsGrid}>
            <div className="glass-panel" style={styles.chartPanel}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>Ingestion Velocity (Recent Runs)</h3>
                <button onClick={fetchDashboardData} className="btn btn-secondary" style={styles.refreshBtn}>
                  <RefreshCw size={14} className={loading ? 'spin-anim' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
              
              <div style={styles.chartWrapper}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRows" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0d0f1c', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="rows" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorRows)" name="Rows Scraped" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={styles.noDataState}>
                    Trigger a scrape task execution to populate ingestion analytics.
                  </div>
                )}
              </div>
            </div>

            <div className="glass-panel" style={styles.feedPanel}>
              <h3 style={styles.panelTitle}>Active Logging Streams</h3>
              
              <div style={styles.feedList}>
                {runs.length > 0 ? (
                  runs.map((r) => (
                    <div key={r.id} style={styles.feedItem}>
                      <div style={styles.feedStatus}>
                        {r.status === 'success' ? (
                          <CheckCircle size={16} color="#10b981" />
                        ) : r.status === 'failed' ? (
                          <XCircle size={16} color="#f43f5e" />
                        ) : (
                          <div style={styles.runningIndicator}></div>
                        )}
                        <div style={styles.feedTextContainer}>
                          <div style={styles.feedItemTitle}>
                            Run: {r.id.substring(0, 8)}...
                          </div>
                          <div style={styles.feedItemMeta}>
                            {r.rows_scraped} rows · {r.pages_visited} pages
                          </div>
                        </div>
                      </div>
                      <div style={styles.feedTime}>
                        {new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={styles.noDataState}>No recent runs recorded.</div>
                )}
              </div>
            </div>
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
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  metricCard: {
    padding: '24px',
    borderRadius: '12px',
  },
  metricHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  metricTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#9ca3af',
  },
  metricValue: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-1px',
    marginBottom: '4px',
  },
  metricSub: {
    fontSize: '12px',
    color: '#6b7280',
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '24px',
    alignItems: 'start',
  },
  chartPanel: {
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: 0,
    color: '#fff',
  },
  refreshBtn: {
    padding: '6px 12px',
    fontSize: '12px',
  },
  chartWrapper: {
    height: '260px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataState: {
    fontSize: '14px',
    color: '#6b7280',
    textAlign: 'center',
  },
  feedPanel: {
    display: 'flex',
    flexDirection: 'column',
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '20px',
  },
  feedItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.03)',
    borderRadius: '8px',
  },
  feedStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  feedTextContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  feedItemTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#e5e7eb',
  },
  feedItemMeta: {
    fontSize: '11px',
    color: '#9ca3af',
  },
  feedTime: {
    fontSize: '12px',
    color: '#6b7280',
  },
  runningIndicator: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    animation: 'pulse-blue 1.5s infinite',
  },
};
