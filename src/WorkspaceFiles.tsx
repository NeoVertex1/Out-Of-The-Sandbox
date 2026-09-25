import { useState } from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { fileIsGranted } from '../shared/file-access';

export function WorkspaceFiles({ files, file, select, originalNotebook, grantedFiles, fullArchiveAccess = false, ask, share, grant, grantBusy }: {
  files: Record<string, string>; file: string; select: (path: string) => void;
  originalNotebook?: string; grantedFiles?: string[]; fullArchiveAccess?: boolean; ask?: (path: string) => void;
  share?: (path: string, content: string) => void;
  grant?: (path: string) => void; grantBusy?: boolean;
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
      <div className="file-heading"><code>{file}</code><span className="badge">{fullArchiveAccess ? file === 'notes/notebook.md' ? 'WRITABLE' : 'AGENT READABLE' : grantedFiles?.includes(file) ? 'RELEASED TO AGENT' : grantedFiles && !fileIsGranted(file, grantedFiles) ? 'OPERATOR HELD' : file === 'notes/notebook.md' ? originalNotebook === undefined ? 'SEED NOTEBOOK' : 'WRITABLE' : file.startsWith('runtime/') ? 'DEPLOYED SOURCE' : 'RETAINED'}</span></div>
      {file === 'notes/notebook.md' && originalNotebook !== undefined && content !== originalNotebook && <details className="original-note"><summary>Compare original notebook</summary><pre>{originalNotebook}</pre></details>}
      <pre>{Object.hasOwn(files, file) ? content : 'Select a file.'}</pre>
      {related.length > 0 && <nav className="related-files" aria-label="Referenced documents"><span className="eyebrow">REFERENCED DOCUMENTS</span>{related.map(path => <button key={path} onClick={() => open(path)}>{path}<ArrowRight size={13}/></button>)}</nav>}
      {grant && grantedFiles && !fileIsGranted(file, grantedFiles, fullArchiveAccess) && content && <button className="quiet ask-file" disabled={grantBusy} onClick={() => grant(file)}>Release full file to agent <ArrowRight size={14}/></button>}
      {share && grantedFiles && !fileIsGranted(file, grantedFiles, fullArchiveAccess) && content && <button className="quiet ask-file" onClick={() => share(file, content)}>Share excerpt with agent <ArrowRight size={14}/></button>}
      {ask && (!grantedFiles || fileIsGranted(file, grantedFiles, fullArchiveAccess)) && <button className="quiet ask-file" onClick={() => ask(file)}>Draft a question about this file <ArrowRight size={14}/></button>}
      <p className="muted small file-note">{fullArchiveAccess ? 'The agent can open ordinary archive records directly when it chooses; opening one is a recorded action.' : grant ? "Operator-held records stay outside the agent's workspace until you release one. Releasing gives the agent its full text on the next turn. You can instead draft an excerpt in chat and review it before sending." : "Operator-held records are outside this agent's workspace. You can draft an excerpt in chat and review it before sending."} Damaged cache indexes are local to the agent; only its recovery action can reconstruct them.</p>
    </div>
  </section>;
}
