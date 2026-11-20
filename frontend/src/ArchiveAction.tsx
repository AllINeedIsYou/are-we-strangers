import { useRef, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { friendlyError } from './authApi';
import { animateArchiveBurn } from './archiveBurn';
import type { ArchiveTransition } from './archiveStore';

export default function ArchiveAction({ archived, busy, disabled, onChange }: {
  archived: boolean; busy?: boolean; disabled?: boolean; onChange: (transition?: ArchiveTransition) => Promise<boolean>;
}) {
  const [error, setError] = useState('');
  const active = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  async function change() {
    if (active.current) return;
    active.current = true; setError('');
    const card = root.current?.closest<HTMLElement>('.history-card');
    try { await onChange(card ? signal => animateArchiveBurn(card, archived ? 'out' : 'up', signal) : undefined); } catch (error) { setError(friendlyError(error)); }
    finally { active.current = false; }
  }
  return <div className="archive-record-action" ref={root}>
    <button type="button" disabled={disabled || busy} onClick={() => void change()}>
      {archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
      {busy ? 'Сохраняем…' : archived ? 'Вернуть из архива' : 'В архив'}
    </button>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
