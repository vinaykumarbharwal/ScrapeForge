import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useAuthStore } from '../store/authStore';
import { 
  Play, Plus, Database, Calendar, Eye, Trash2, 
  X, Check, AlertTriangle, Layers, ArrowRight 
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [activeData, setActiveData] = useState<{
    columns: Array<{ name: string; type: string }>;
    rows: Array<Record<string, any>>;
    total: number;
    taskName: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [containerSelector, setContainerSelector] = useState('');
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
        }
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

  const handleRunTask = async (taskId: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Scraping run queued successfully in background!');
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
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
        taskName
      });
      setIsDataOpen(true);
    } catch (err) {
      console.error(err);
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
            <button onClick={() => setIsCreateOpen(true)} className="btn btn-primary">
              <Plus size={16} />
              <span>Create Scraper</span>
            </button>
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
                    <button onClick={() => handleRunTask(task.id)} className="btn btn-primary" style={styles.actionBtn}>
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
                <button onClick={() => setIsDataOpen(false)} style={styles.closeBtn}><X size={18} /></button>
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
                        {activeData.rows.map((row) => (
                          <tr key={row.id}>
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
};
