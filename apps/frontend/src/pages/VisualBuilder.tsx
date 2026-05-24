import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useAuthStore } from '../store/authStore';
import { 
  Globe, ArrowLeft, Trash2, 
  Terminal, Check, Info, RefreshCw, Sparkles
} from 'lucide-react';

interface ElementCoord {
  selector: string;
  tagName: string;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface SelectorField {
  name: string;
  selector: string;
  type: string;
}

export default function VisualBuilder() {
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();

  // State controls
  const [targetUrl, setTargetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [elements, setElements] = useState<ElementCoord[]>([]);
  const [hoveredElement, setHoveredElement] = useState<ElementCoord | null>(null);

  // Scraper config state
  const [taskName, setTaskName] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');
  const [containerSelector, setContainerSelector] = useState('');
  const [maxPages, setMaxPages] = useState(1);
  const [nextSelector, setNextSelector] = useState('');
  const [fields, setFields] = useState<SelectorField[]>([]);
  
  // Field modal/prompt state
  const [selectedElement, setSelectedElement] = useState<ElementCoord | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  const [suggestingSchema, setSuggestingSchema] = useState(false);

  const handleAISuggest = async () => {
    if (fields.length === 0) return;
    setSuggestingSchema(true);
    try {
      const res = await fetch('http://localhost:3000/api/ai/enrich-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ columns: fields.map(f => f.name) })
      });
      const data = await res.json();
      if (res.ok) {
        const updatedFields = fields.map(f => ({
          ...f,
          name: data[f.name] || f.name
        }));
        setFields(updatedFields);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSuggestingSchema(false);
    }
  };

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl) return;

    setLoading(true);
    setScreenshot(null);
    setElements([]);
    setLoadingStatus('Launching Chromium sandbox...');

    try {
      // Simulate progressive socket-like status updates in UI loader
      setTimeout(() => setLoadingStatus('Navigating target server pipeline...'), 1000);
      setTimeout(() => setLoadingStatus('Compiling CSS styles and DOM tag tree...'), 2500);

      const res = await fetch('http://localhost:3000/api/screenshot-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url: targetUrl })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Capture request failed');
      }

      setScreenshot(data.screenshot);
      setElements(data.elements);
    } catch (err: any) {
      alert(`Capture failed: ${err.message || 'Unknown network error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleElementClick = (el: ElementCoord) => {
    setSelectedElement(el);
    // Suggest a default field name based on tag or selector
    const cleanName = el.tagName.toLowerCase() + '_' + Math.floor(Math.random() * 100);
    setNewFieldName(cleanName);
  };

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedElement || !newFieldName) return;

    const newField: SelectorField = {
      name: newFieldName.replace(/[^a-zA-Z0-9_]/g, ''),
      selector: selectedElement.selector,
      type: newFieldType
    };

    setFields([...fields, newField]);
    setSelectedElement(null);
  };

  const handleRemoveField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
  };

  const handleSaveConfig = async () => {
    if (!taskName) {
      alert('Please provide a Scraper Identifier Name.');
      return;
    }
    if (fields.length === 0) {
      alert('Configure at least one field selector mapping before saving.');
      return;
    }

    try {
      const payload = {
        name: taskName,
        config: {
          startUrl: targetUrl,
          containerSelector: containerSelector || null,
          fields,
          pagination: {
            maxPages: Number(maxPages) || 1,
            nextSelector: nextSelector || null
          }
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
        navigate('/tasks');
      } else {
        const errData = await res.json();
        alert(`Failed to save task: ${errData.detail || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={styles.layout}>
      <Sidebar />
      <div style={styles.main}>
        <Header title="Visual Scraper Builder" />

        <div style={styles.content}>
          <div style={styles.topBar}>
            <button onClick={() => navigate('/tasks')} style={styles.backBtn} className="btn btn-secondary">
              <ArrowLeft size={16} />
              <span>Back to Library</span>
            </button>
          </div>

          <div style={styles.builderSplit}>
            {/* Left sidebar: Configuration controls */}
            <div className="glass-panel" style={styles.controlsPanel}>
              <h3 style={styles.panelTitle}>Configuration Panel</h3>

              <div className="form-group">
                <label className="form-label">Task Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. HN Products"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Target Url</label>
                <form onSubmit={handleCapture} style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="url" 
                    required 
                    className="form-input" 
                    placeholder="https://news.ycombinator.com"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '0 16px' }} disabled={loading}>
                    Capture
                  </button>
                </form>
              </div>

              <div className="form-group">
                <label className="form-label">Schedule Cron (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. */10 * * * *"
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Container Block CSS Selector (Recommended)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. div.quote or article.product_pod"
                  value={containerSelector}
                  onChange={(e) => setContainerSelector(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Max Pages</label>
                  <input 
                    type="number" 
                    min="1"
                    max="100"
                    className="form-input" 
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Next Page CSS Selector</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. li.next a"
                    value={nextSelector}
                    onChange={(e) => setNextSelector(e.target.value)}
                  />
                </div>
              </div>

              <div style={styles.fieldsContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ ...styles.fieldsTitle, margin: 0 }}>Mapped Fields ({fields.length})</h4>
                  {fields.length > 0 && (
                    <button 
                      onClick={handleAISuggest} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      disabled={suggestingSchema}
                    >
                      <Sparkles size={12} color="#8b5cf6" />
                      <span>{suggestingSchema ? 'Renaming...' : 'AI Clean Names'}</span>
                    </button>
                  )}
                </div>
                {fields.length === 0 ? (
                  <div style={styles.emptyFields}>
                    <Info size={16} color="#6b7280" />
                    <span>Point and click elements on the screenshot overlay to map columns.</span>
                  </div>
                ) : (
                  <div style={styles.fieldsList}>
                    {fields.map((f, idx) => (
                      <div key={idx} style={styles.fieldItem}>
                        <div style={{ minWidth: 0 }}>
                          <div style={styles.fieldName}>{f.name}</div>
                          <div style={styles.fieldSelector} title={f.selector}>{f.selector}</div>
                        </div>
                        <button onClick={() => handleRemoveField(idx)} style={styles.fieldRemoveBtn}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleSaveConfig} className="btn btn-primary" style={styles.saveBtn}>
                <Check size={16} />
                <span>Save Scraper Config</span>
              </button>
            </div>

            {/* Right container: Screenshot canvas viewport overlay */}
            <div className="glass-panel" style={styles.canvasPanel}>
              {loading ? (
                <div style={styles.loaderArea}>
                  <RefreshCw size={36} color="#8b5cf6" className="spin-anim" style={{ marginBottom: '16px' }} />
                  <h4>{loadingStatus}</h4>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>Launching remote headless browsers inside secure sandbox containers.</p>
                </div>
              ) : screenshot ? (
                <div style={styles.browserWindow}>
                  <div style={styles.browserHeader}>
                    <div style={styles.dotContainer}>
                      <span style={{ ...styles.dot, backgroundColor: '#f43f5e' }}></span>
                      <span style={{ ...styles.dot, backgroundColor: '#eab308' }}></span>
                      <span style={{ ...styles.dot, backgroundColor: '#10b981' }}></span>
                    </div>
                    <div style={styles.addressBar}>
                      <Globe size={12} color="#6b7280" />
                      <span style={styles.addressText}>{targetUrl}</span>
                    </div>
                  </div>

                  <div style={styles.viewportScroll}>
                    <div style={styles.viewportWrapper}>
                      <img 
                        src={screenshot} 
                        alt="Captured page viewport" 
                        style={styles.screenshotImage}
                      />
                      
                      {/* Transparent Absolute Overlay for click capture */}
                      <div style={styles.absoluteOverlay}>
                        {elements.map((el, index) => (
                          <div
                            key={index}
                            style={{
                              position: 'absolute',
                              left: `${el.box.x}px`,
                              top: `${el.box.y}px`,
                              width: `${el.box.width}px`,
                              height: `${el.box.height}px`,
                              cursor: 'pointer',
                              zIndex: 10,
                              border: hoveredElement === el ? '1px dashed #a78bfa' : 'none',
                              backgroundColor: hoveredElement === el ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                            }}
                            onMouseEnter={() => setHoveredElement(el)}
                            onMouseLeave={() => setHoveredElement(null)}
                            onClick={() => handleElementClick(el)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer floating tooltip showing current hovered selector */}
                  {hoveredElement && (
                    <div style={styles.selectorTooltip}>
                      <Terminal size={12} color="#10b981" />
                      <code style={styles.tooltipCode}>{hoveredElement.selector}</code>
                    </div>
                  )}
                </div>
              ) : (
                <div style={styles.emptyCanvas}>
                  <Globe size={48} color="#1f2937" style={{ marginBottom: '16px' }} />
                  <h4>Visual DOM Inspect Engine</h4>
                  <p>Enter a target URL and hit capture to start pointing and mapping fields visually.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- MODAL: FIELD MAPPER CONFIG --- */}
        {selectedElement && (
          <div style={styles.modalOverlay}>
            <div className="glass-panel" style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h3>Map Field Column</h3>
                <button onClick={() => setSelectedElement(null)} style={styles.closeBtn}><X size={18} /></button>
              </div>

              <form onSubmit={handleAddField}>
                <div className="form-group">
                  <label className="form-label">Column Name</label>
                  <input 
                    type="text" 
                    required 
                    className="form-input" 
                    placeholder="e.g. price"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Auto-detected CSS Selector Path</label>
                  <textarea 
                    readOnly
                    className="form-input" 
                    style={{ height: '80px', fontFamily: 'Courier New, Courier, monospace', fontSize: '12px' }}
                    value={selectedElement.selector}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Selector Extract Type</label>
                  <select 
                    className="form-input" 
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                  >
                    <option value="text">Text (Extracted element innerText)</option>
                    <option value="html">HTML (Extracted raw innerHTML content)</option>
                  </select>
                </div>

                <div style={styles.modalFooter}>
                  <button type="button" onClick={() => setSelectedElement(null)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" className="btn btn-primary">Map Field</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// Reuse modal close icon
const X = ({ size }: { size: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

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
    height: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  topBar: {
    marginBottom: '20px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  builderSplit: {
    display: 'flex',
    gap: '24px',
    flex: 1,
    minHeight: 0,
  },
  controlsPanel: {
    width: '320px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    flexShrink: 0,
  },
  panelTitle: {
    margin: '0 0 20px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },
  fieldsContainer: {
    flex: 1,
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  fieldsTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#9ca3af',
    margin: '0 0 12px 0',
  },
  emptyFields: {
    padding: '20px',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px dashed rgba(255,255,255,0.07)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '10px',
    color: '#6b7280',
    fontSize: '12px',
  },
  fieldsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    flex: 1,
  },
  fieldItem: {
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.03)',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  fieldName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e5e7eb',
  },
  fieldSelector: {
    fontSize: '11px',
    color: '#8b5cf6',
    fontFamily: 'Courier New, Courier, monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '2px',
  },
  fieldRemoveBtn: {
    background: 'none',
    border: 'none',
    color: '#f43f5e',
    cursor: 'pointer',
    padding: '4px',
  },
  saveBtn: {
    width: '100%',
    marginTop: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
  },
  canvasPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  emptyCanvas: {
    textAlign: 'center',
    color: '#9ca3af',
    maxWidth: '400px',
  },
  loaderArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#e5e7eb',
    textAlign: 'center',
  },
  browserWindow: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    backgroundColor: '#0a0b10',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.07)',
    overflow: 'hidden',
    position: 'relative',
  },
  browserHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '12px 20px',
    backgroundColor: '#0d0f17',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  dotContainer: {
    display: 'flex',
    gap: '6px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  addressBar: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '6px',
    fontSize: '12px',
  },
  addressText: {
    color: '#9ca3af',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  viewportScroll: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
    backgroundColor: '#fff',
  },
  viewportWrapper: {
    position: 'relative',
    width: '1280px', // Matches viewport dimensions configured in Playwright
    height: '800px',
  },
  screenshotImage: {
    width: '1280px',
    height: '800px',
    display: 'block',
    userSelect: 'none',
  },
  absoluteOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  },
  selectorTooltip: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    backgroundColor: 'rgba(13,15,23,0.95)',
    border: '1px solid rgba(139,92,246,0.3)',
    borderRadius: '6px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    pointerEvents: 'none',
  },
  tooltipCode: {
    fontSize: '12px',
    color: '#a78bfa',
    fontFamily: 'Courier New, Courier, monospace',
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
    maxWidth: '500px',
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
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '32px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '20px',
  },
};
