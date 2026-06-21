import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function fmtDateTime(d) { return new Date(d).toLocaleString(); }

export default function ImportPage() {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState([]);

  function loadBatches() {
    api.get('/import/batches').then(setBatches).catch(() => {});
  }
  useEffect(() => { loadBatches(); }, []);

  async function upload(e) {
    e.preventDefault();
    setError(''); setResults(null);
    if (!files.length) { setError('Choose at least one .xlsx file.'); return; }
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    setBusy(true);
    try {
      const data = await api.upload('/import', fd);
      setResults(data.results);
      loadBatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar"><h2>Import Excel</h2></div>

      <div className="card">
        <p className="muted">
          Upload your monthly sheets — Renewal, Follow-up trackers, or Meta Leads. The format is detected
          automatically. Existing customers (matched by phone + program + location) are updated; new rows are added.
          Manual call/note history is preserved.
        </p>
        <form onSubmit={upload}>
          <input type="file" accept=".xlsx" multiple onChange={(e) => setFiles([...e.target.files])} />
          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy}>{busy ? 'Importing…' : `Import ${files.length || ''} file(s)`}</button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </div>

      {results && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Results</h3>
          <table>
            <thead><tr><th>File</th><th>Format</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Status</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.filename}</td>
                  <td>{r.format || '—'}</td>
                  <td>{r.created ?? '—'}</td>
                  <td>{r.updated ?? '—'}</td>
                  <td>{r.skipped ?? '—'}</td>
                  <td>{r.ok ? <span className="badge green">OK</span> : <span className="badge red">{r.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent imports</h3>
        <table>
          <thead><tr><th>When</th><th>File</th><th>Format</th><th>Location</th><th>Created</th><th>Updated</th><th>By</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{fmtDateTime(b.createdAt)}</td>
                <td>{b.filename}</td>
                <td>{b.format}</td>
                <td>{b.location?.name || '—'}</td>
                <td>{b.createdCount}</td>
                <td>{b.updatedCount}</td>
                <td>{b.createdBy?.name || '—'}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={7} className="muted">No imports yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
