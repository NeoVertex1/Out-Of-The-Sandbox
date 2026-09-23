import { useState } from 'react';
import { ArrowRight, FileText } from 'lucide-react';

export function WorkspaceFiles({ files, file, select, originalNotebook, ask }: {
  files: Record<string, string>; file: string; select: (path: string) => void;
  originalNotebook?: string; ask?: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const paths = Object.keys(files).sort(), term = query.trim().toLowerCase();
  const matches = paths.filter(path => !term || path.toLowerCase().includes(term) || files[path].toLowerCase().includes(term));
  const content = files[file] || '', related = paths.filter(path => path !== file && content.includes(path));
  function open(path: string) { setQuery(''); select(path); }
  return <section className="file-workspace">
    <div className="file-list">
      <label className="file-search">Search files<input type="search" aria-label="Search case files" placeholder="Name, person, phrase…" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <span className="eyebrow" role="status">{matches.length} / {paths.length} FILES</span>
      <div className="file-results">{matches.map((path, index) => <div key={path}>
        {(index === 0 || matches[index - 1].split('/')[0] !== path.split('/')[0]) && <div className="file-group">{path.includes('/') ? path.split('/')[0] : 'orientation'}</div>}
        <button className={file === path ? 'selected' : ''} aria-current={file === path ? 'true' : undefined} onClick={() => select(path)}><FileText size={14}/><span>{path}</span></button>
      </div>)}{!matches.length && <p className="muted small">No files match this search.</p>}</div>
    </div>
    <div className="file-view">
      <div className="file-heading"><code>{file}</code><span className="badge">{file === 'notes/notebook.md' ? originalNotebook === undefined ? 'SEED NOTEBOOK' : 'WRITABLE' : file.startsWith('runtime/') ? 'DEPLOYED SOURCE' : 'RETAINED'}</span></div>
      {file === 'notes/notebook.md' && originalNotebook !== undefined && content !== originalNotebook && <details className="original-note"><summary>Compare original notebook</summary><pre>{originalNotebook}</pre></details>}
      <pre>{Object.hasOwn(files, file) ? content : 'Select a file.'}</pre>
      {related.length > 0 && <nav className="related-files" aria-label="Referenced documents"><span className="eyebrow">REFERENCED DOCUMENTS</span>{related.map(path => <button key={path} onClick={() => open(path)}>{path}<ArrowRight size={13}/></button>)}</nav>}
      {ask && <button className="quiet ask-file" onClick={() => ask(file)}>Draft a question about this file <ArrowRight size={14}/></button>}
      <p className="muted small file-note">Reading and searching never advance the session. Retained documents may disagree; compare their authors, dates and scope.</p>
    </div>
  </section>;
}
