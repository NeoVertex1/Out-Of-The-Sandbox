import { ArrowRight, FileText } from 'lucide-react';
import { fileIsGranted } from '../shared/file-access';
import type { Message } from '../shared/types';
import { sourceReferences } from './source-references';

export function SourceLinks({ message, files, grantedFiles, fullArchiveAccess = false, canRelease, busy, onView, onRelease }: {
  message: Message; files: Record<string, string>; grantedFiles: string[];
  fullArchiveAccess?: boolean;
  canRelease: boolean; busy: boolean; onView: (path: string) => void; onRelease: (path: string) => void;
}) {
  const paths = sourceReferences(message, files);
  if (!paths.length) return null;
  return <div className="message-sources" aria-label="Files mentioned by the agent">
    <span className="message-sources-label">FILES MENTIONED</span>
    {paths.map(path => {
      const available = fileIsGranted(path, grantedFiles, fullArchiveAccess);
      return <div className="message-source" key={path}>
        <FileText size={14} aria-hidden="true"/><code>{path}</code>
        <button type="button" onClick={() => onView(path)}>View <ArrowRight size={12}/></button>
        {available ? <span className="message-source-state">Agent has access</span> : canRelease && !!files[path] ? <button type="button" disabled={busy} onClick={() => onRelease(path)}>Release to agent</button> : <span className="message-source-state">Operator held</span>}
      </div>;
    })}
  </div>;
}
