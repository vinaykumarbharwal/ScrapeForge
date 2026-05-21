import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { useAuthStore } from '../store/authStore';
import { 
  Copy, Check, ExternalLink 
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  url: string;
  fields: Array<{ name: string; selector: string; type: string }>;
  tags: string[];
}

const TEMPLATES: Template[] = [
  {
    id: 'hn_posts',
    name: 'Hacker News Crawler',
    description: 'Scrape front page threads including titles, URLs, score counters, and author names.',
    url: 'https://news.ycombinator.com',
    fields: [
      { name: 'title', selector: '.titleline > a', type: 'text' },
      { name: 'link', selector: '.titleline > a', type: 'html' },
      { name: 'score', selector: '.score', type: 'text' },
      { name: 'author', selector: '.hnuser', type: 'text' }
    ],
    tags: ['Tech', 'News', 'Web Dev']
  },
  {
    id: 'books_catalog',
    name: 'Books to Scrape Catalog',
    description: 'Retrieve book titles, stock availability statuses, and pricing details from the catalog sandbox.',
    url: 'http://books.toscrape.com',
    fields: [
      { name: 'title', selector: 'h3 a', type: 'text' },
      { name: 'price', selector: '.price_color', type: 'text' },
      { name: 'status', selector: '.instock', type: 'text' }
    ],
    tags: ['E-Commerce', 'Catalog', 'Testing']
  },
  {
    id: 'wikipedia_gdp',
    name: 'Wikipedia GDP list Table',
    description: 'Extract international financial data table metrics (Country names, Nominal GDP values, Regions).',
    url: 'https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)',
    fields: [
      { name: 'country', selector: 'td:nth-child(1) a', type: 'text' },
      { name: 'gdp_millions', selector: 'td:nth-child(2)', type: 'text' },
      { name: 'region', selector: 'td:nth-child(3)', type: 'text' }
    ],
    tags: ['Reference', 'Finance', 'Tables']
  }
];

export default function Templates() {
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);

  const handleImport = async (tpl: Template) => {
    setImportingId(tpl.id);
    try {
      const payload = {
        name: tpl.name,
        config: {
          startUrl: tpl.url,
          fields: tpl.fields
        },
        schedule_cron: null
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
        // Short delay to showcase dynamic import success micro-animation
        setTimeout(() => {
          setImportingId(null);
          navigate('/tasks');
        }, 1200);
      } else {
        const errData = await res.json();
        alert(`Import failed: ${errData.detail || 'Server error'}`);
        setImportingId(null);
      }
    } catch (err) {
      console.error(err);
      setImportingId(null);
    }
  };

  return (
    <div style={styles.layout}>
      <Sidebar />
      <div style={styles.main}>
        <Header title="Templates Gallery" />

        <div style={styles.content}>
          <div style={styles.headerArea}>
            <div>
              <h2 style={styles.pageTitle}>Scraper Templates Catalog</h2>
              <p style={styles.pageSub}>Quickly deploy pre-configured scraping architectures for popular structures.</p>
            </div>
          </div>

          <div style={styles.grid}>
            {TEMPLATES.map((tpl) => (
              <div key={tpl.id} className="glass-panel" style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    {tpl.tags.map((tag) => (
                      <span key={tag} style={styles.tagBadge}>{tag}</span>
                    ))}
                  </div>
                  <h3 style={styles.cardName}>{tpl.name}</h3>
                  <p style={styles.cardDesc}>{tpl.description}</p>
                </div>

                <div style={styles.cardBody}>
                  <div style={styles.targetUrlRow}>
                    <ExternalLink size={14} color="#6b7280" />
                    <span style={styles.urlText} title={tpl.url}>{tpl.url}</span>
                  </div>

                  <div style={styles.fieldsSection}>
                    <div style={styles.fieldsTitle}>Configured Selectors ({tpl.fields.length})</div>
                    <div style={styles.fieldsList}>
                      {tpl.fields.map((f, i) => (
                        <div key={i} style={styles.fieldBadge}>
                          <span style={styles.fieldName}>{f.name}</span>
                          <span style={styles.fieldSelector}>{f.selector}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  <button 
                    onClick={() => handleImport(tpl)} 
                    className="btn btn-primary" 
                    style={styles.importBtn}
                    disabled={importingId !== null}
                  >
                    {importingId === tpl.id ? (
                      <>
                        <Check size={14} />
                        <span>Deploying to Library...</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Deploy Template</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
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
  },
  headerArea: {
    marginBottom: '36px',
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '320px',
  },
  cardHeader: {
    marginBottom: '16px',
  },
  tagBadge: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#a78bfa',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  cardName: {
    fontSize: '17px',
    fontWeight: 600,
    margin: '8px 0 6px 0',
    color: '#fff',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#9ca3af',
    lineHeight: 1.5,
    margin: 0,
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '20px',
  },
  targetUrlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#6b7280',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.02)',
  },
  urlText: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fieldsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldsTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  fieldsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  fieldBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  fieldName: {
    color: '#e5e7eb',
    fontWeight: 500,
  },
  fieldSelector: {
    color: '#8b5cf6',
    fontFamily: 'Courier New, Courier, monospace',
  },
  cardFooter: {
    borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '16px',
  },
  importBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '13px',
  },
};
