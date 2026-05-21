import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useAuthStore } from '../store/authStore';
import { 
  Play, Plus, Database, Calendar, Trash2, 
  X, AlertTriangle, Layers, Terminal, Download, 
  RefreshCw 
} from 'lucide-react';

interface Task {
  id: string;
  name: string;
  config: {
    startUrl: string;
    containerSelector?: string;
    fields: Array<{
      name: string;
      selector: string;
      type: string;
    }>;
  };
  schedule_cron: string | null;
  status: string;
  last_run_at: string | null;
}

export default function Tasks() {
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [activeData, setActiveData] = useState<{
    columns: Array<{ name: string; type: string }>;
    rows: Array<Record<string, any>>;
    total: number;
    taskId: string;
    taskName: string;
  } | null>(null);

  // Console Modal state
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [consoleTaskName, setConsoleTaskName] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [containerSelector, setContainerSelector] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');
  const [fields, setFields] = useState<Array<{ name: string; selector: string; type: string }>>([
    { name: 'title', selector: 'h1', type: 'text' }
  ]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token]);

  // Scroll console to bottom when new logs stream in
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  const handleAddField = () => {
    setFields([...fields, { name: '', selector: '', type: 'text' }]);
  };

  const handleFieldChange = (index: number, key: string, value: string) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    setFields(updated);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        config: {
          startUrl,
          containerSelector: containerSelector || undefined,
          fields
        },
        schedule_cron: scheduleCron || null
      };

      const res = await fetch('http://localhost:3000/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsCreateOpen(false);
        // Reset form
        setName('');
        setStartUrl('');
        setContainerSelector('');
        setScheduleCron('');
        setFields([{ name: 'title', selector: 'h1', type: 'text' }]);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this scraper config?')) return;
    try {
      await fetch(`http://localhost:3000/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunTask = async (taskId: string, taskName: string) => {
    try {
      // Open console modal first to connect before run launches
      setConsoleTaskName(taskName);
      setConsoleLogs(['[Console] Initializing job request handshake...']);
      setIsConsoleOpen(true);

      const res = await fetch(`http://localhost:3000/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.ok && data.run_id) {
        setConsoleLogs((prev) => [...prev, `[Console] Enqueued Job Run: ${data.run_id}`, `[Console] Opening WebSocket stream connection...`]);
        
        // Connect to WebSocket stream
        if (wsRef.current) {
          wsRef.current.close();
        }

        const ws = new WebSocket(`ws://localhost:3000/ws/runs/${data.run_id}`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const timeStr = new Date(payload.timestamp).toLocaleTimeString();
            const logLine = `[${timeStr}] [${payload.status.toUpperCase()}] ${payload.message}`;
            setConsoleLogs((prev) => [...prev, logLine]);
            
            if (payload.status === 'success' || payload.status === 'failed') {
              ws.close();
              fetchTasks();
            }
          } catch {
            setConsoleLogs((prev) => [...prev, `[Raw] ${event.data}`]);
          }
        };

        ws.onerror = () => {
          setConsoleLogs((prev) => [...prev, '[Error] WebSocket socket error. reconnecting...']);
        };

        ws.onclose = () => {
          setConsoleLogs((prev) => [...prev, '[Console] Connection closed. Run finalized.']);
        };
      } else {
        setConsoleLogs((prev) => [...prev, `[Error] Failed to queue run: ${data.detail || 'Server error'}`]);
      }
    } catch (err) {
      console.error(err);
      setConsoleLogs((prev) => [...prev, '[Error] Failed to connect to gateway task orchestrator.']);
    }
  };

  const handleCloseConsole = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsConsoleOpen(false);
  };

  const handleViewData = async (taskId: string, taskName: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/tasks/${taskId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setActiveData({
        columns: data.columns,
        rows: data.rows,
        total: data.total,
        taskId,
        taskName
      });
      setIsDataOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportData = async (format: 'csv' | 'json') => {
    if (!activeData || activeData.rows.length === 0) return;
    
    // Find latest run_id from table rows
    const runId = activeData.rows[0]?.run_id;
    if (!runId) {
      alert("No active runs found to extract files.");
      return;
    }

    setExportingFormat(format);
    try {
      // Trigger background export job
      const triggerRes = await fetch(`http://localhost:3000/api/runs/${runId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ format })
      });
      const triggerData = await triggerRes.json();

      if (!triggerRes.ok) {
        throw new Error(triggerData.detail || "Export trigger failed");
      }

      const exportId = triggerData.export_id;

      // Poll export status
      const checkStatus = async () => {
        const checkRes = await fetch(`http://localhost:3000/api/exports/${exportId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const checkData = await checkRes.json();
        
        if (checkData.status === 'completed' && checkData.file_url) {
          setExportingFormat(null);
          // Open or download file
          window.open(checkData.file_url, '_blank');
        } else if (checkData.status === 'failed') {
          setExportingFormat(null);
          alert("Data compilation export failed on background worker.");
        } else {
          // Poll again in 1s
          setTimeout(checkStatus, 1000);
        }
      };

      setTimeout(checkStatus, 1000);
    } catch (err: any) {
      console.error(err);
      alert(`Export failed: ${err.message || 'Unknown error'}`);
      setExportingFormat(null);
    }
  };

  return (
    <div style={styles.layout}>
      <Sidebar />
      <div style={styles.main}>
        <Header title="Scrape Tasks" />
        
        <div style={styles.content}>
          <div style={styles.actionBar}>
            <div>
              <h2 style={styles.pageTitle}>Scraper Library</h2>
              <p style={styles.pageSub}>Configure target layouts and execute background schedules</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => navigate('/tasks/build')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} />
                <span>Visual Canvas Builder</span>
              </button>
              <button onClick={() => setIsCreateOpen(true)} className="btn btn-secondary">
                <Plus size={16} />
                <span>Create Manual Scraper</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div style={styles.loadingState}>Loading scraper definitions...</div>
          ) : tasks.length > 0 ? (
            <div style={styles.grid}>
              {tasks.map((task) => (
                <div key={task.id} className="glass-panel" style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div>
                      <h3 style={styles.cardName}>{task.name}</h3>
                      <span className="badge badge-active">{task.status}</span>
                    </div>
                    <button onClick={() => handleDeleteTask(task.id)} style={styles.deleteBtn} title="Delete Task">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={styles.cardBody}>
                    <div style={styles.metaRow}>
                      <Calendar size={14} color="#6b7280" />
                      <span>Cron: {task.schedule_cron || 'Manual Trigger Only'}</span>
                    </div>
                    <div style={styles.metaRow}>
                      <Layers size={14} color="#6b7280" />
                      <span style={styles.urlPreview} title={task.config.startUrl}>
                        URL: {task.config.startUrl}
                      </span>
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    <button onClick={() => handleRunTask(task.id, task.name)} className="btn btn-primary" style={styles.actionBtn}>
                      <Play size={14} />
                      <span>Run Scraper</span>
                    </button>
                    <button onClick={() => handleViewData(task.id, task.name)} className="btn btn-secondary" style={styles.actionBtn}>
                      <Database size={14} />
                      <span>View Data</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.emptyState}>
              <AlertTriangle size={32} color="#f59e0b" style={{ marginBottom: '16px' }} />
              <h3>No scrapers found</h3>
              <p>Create your first visual selector parser configurations to collect structured data.</p>
            </div>
          )}
        </div>

        {/* --- MODAL: CREATE TASK --- */}
        {isCreateOpen && (
          <div style={styles.modalOverlay}>
            <div className="glass-panel" style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h3>Build Visual Scraper Layout</h3>
                <button onClick={() => setIsCreateOpen(false)} style={styles.closeBtn}><X size={18} /></button>
              </div>

              <form onSubmit={handleCreateTask}>
                <div className="form-group">
                  <label className="form-label">Task Identifier Name</label>
                  <input 
                    type="text" 
                    required 
                    className="form-input" 
                    placeholder="e.g. Amazon Books" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Target Scrape URL</label>
                  <input 
                    type="url" 
                    required 
                    className="form-input" 
                    placeholder="https://example.com/products" 
                    value={startUrl} 
                    onChange={(e) => setStartUrl(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Container Block CSS Selector (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. .product-card, tr.item" 
                    value={containerSelector} 
                    onChange={(e) => setContainerSelector(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Repeated Schedule Cron (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. */15 * * * * (Every 15 minutes)" 
                    value={scheduleCron} 
                    onChange={(e) => setScheduleCron(e.target.value)}
                  />
                  <small style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                    Standard cron syntax. Timezone calculated based on your account settings.
                  </small>
                </div>

                <div style={styles.fieldsSection}>
                  <div style={styles.fieldsHeader}>
                    <span>Selectors / Fields Mapping</span>
                    <button type="button" onClick={handleAddField} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }}>
                      Add Field
                    </button>
                  </div>

                  <div style={styles.fieldsList}>
                    {fields.map((field, idx) => (
                      <div key={idx} style={styles.fieldRow}>
                        <input 
                          type="text" 
                          required 
                          placeholder="field_name" 
                          className="form-input" 
                          style={{ flex: 1 }}
                          value={field.name}
                          onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                        />
                        <input 
                          type="text" 
                          required 
                          placeholder="css selector" 
                          className="form-input" 
                          style={{ flex: 2 }}
                          value={field.selector}
                          onChange={(e) => handleFieldChange(idx, 'selector', e.target.value)}
                        />
                        <select 
                          className="form-input" 
                          style={{ width: '100px' }}
                          value={field.type}
                          onChange={(e) => handleFieldChange(idx, 'type', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="html">HTML</option>
                        </select>
                        <button type="button" onClick={() => handleRemoveField(idx)} style={styles.removeFieldBtn}>
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Config</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- MODAL: VIEW DATA --- */}
        {isDataOpen && activeData && (
          <div style={styles.modalOverlay}>
            <div className="glass-panel" style={styles.dataModalContent}>
              <div style={styles.modalHeader}>
                <div>
                  <h3 style={{ margin: 0 }}>Dynamic Target Database: {activeData.taskName}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#9ca3af' }}>
                    Showing records in dynamic table (Total: {activeData.total} rows)
                  </p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {activeData.rows.length > 0 && (
                    <>
                      <button 
                        onClick={() => handleExportData('csv')} 
                        className="btn btn-secondary" 
                        disabled={exportingFormat !== null}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '13px' }}
                      >
                        {exportingFormat === 'csv' ? <RefreshCw size={14} className="spin-anim" /> : <Download size={14} />}
                        <span>{exportingFormat === 'csv' ? 'Compiling CSV...' : 'Export CSV'}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleExportData('json')} 
                        className="btn btn-secondary" 
                        disabled={exportingFormat !== null}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '13px' }}
                      >
                        {exportingFormat === 'json' ? <RefreshCw size={14} className="spin-anim" /> : <Download size={14} />}
                        <span>{exportingFormat === 'json' ? 'Compiling JSON...' : 'Export JSON'}</span>
                      </button>
                    </>
                  )}
                  <button onClick={() => setIsDataOpen(false)} style={styles.closeBtn}><X size={18} /></button>
                </div>
              </div>

              <div style={styles.tableWrapper}>
                {activeData.rows.length > 0 ? (
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          {activeData.columns.map((col) => (
                            <th key={col.name}>{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeData.rows.map((row, rIdx) => (
                          <tr key={row.id || rIdx}>
                            {activeData.columns.map((col) => (
                              <td key={col.name} style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {row[col.name] !== null ? String(row[col.name]) : <span style={{ color: '#4b5563' }}>NULL</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={styles.emptyTable}>No data has been scraped for this task yet. Trigger a run first.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- MODAL: REAL-TIME CONSOLE --- */}
        {isConsoleOpen && (
          <div style={styles.modalOverlay}>
            <div className="glass-panel" style={styles.consoleModalContent}>
              <div style={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Terminal size={20} color="#8b5cf6" />
                  <h3 style={{ margin: 0 }}>Scraper Log Console: {consoleTaskName}</h3>
                </div>
                <button onClick={handleCloseConsole} style={styles.closeBtn}><X size={18} /></button>
              </div>

              <div style={styles.consoleBody}>
                {consoleLogs.map((log, idx) => (
                  <div key={idx} style={styles.consoleLine}>
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

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
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: 600,
    margin: 0,
    color: '#fff',
  },
  pageSub: {
    fontSize: '13px',
    color: '#9ca3af',
    margin: '4px 0 0 0',
  },
  loadingState: {
    color: '#9ca3af',
    fontSize: '14px',
    textAlign: 'center',
    padding: '40px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '220px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'start',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  cardName: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 6px 0',
    color: '#fff',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px',
    transition: 'color 0.2s',
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '20px',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#9ca3af',
  },
  urlPreview: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '220px',
  },
  cardFooter: {
    display: 'flex',
    gap: '12px',
  },
  actionBtn: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 40px',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: '#9ca3af',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    width: '100%',
    maxWidth: '600px',
    maxHeight: '85vh',
    overflowY: 'auto',
    position: 'relative',
    padding: '32px',
  },
  dataModalContent: {
    width: '90%',
    maxWidth: '1000px',
    maxHeight: '80vh',
    overflowY: 'auto',
    position: 'relative',
    padding: '32px',
  },
  consoleModalContent: {
    width: '100%',
    maxWidth: '700px',
    position: 'relative',
    padding: '24px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    paddingBottom: '16px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  fieldsSection: {
    margin: '24px 0',
  },
  fieldsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    color: '#9ca3af',
    fontWeight: 500,
    marginBottom: '12px',
  },
  fieldsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  fieldRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  removeFieldBtn: {
    background: 'none',
    border: 'none',
    color: '#f43f5e',
    cursor: 'pointer',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '32px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '20px',
  },
  tableWrapper: {
    marginTop: '20px',
  },
  emptyTable: {
    color: '#6b7280',
    fontSize: '14px',
    textAlign: 'center',
    padding: '40px',
  },
  consoleBody: {
    height: '350px',
    backgroundColor: '#05070a',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '8px',
    padding: '16px',
    overflowY: 'auto',
    fontFamily: 'Courier New, Courier, monospace',
    fontSize: '13px',
    color: '#34d399',
    lineHeight: 1.6,
  },
  consoleLine: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    marginBottom: '4px',
  },
};
