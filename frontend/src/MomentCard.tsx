import { useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { friendlyError } from './authApi';
import type { Moment } from './domain';
import MediaView from './MediaView';

export default function MomentCard({ moment, name, partner, ownId, demo, onReply }: {
  moment: Moment;
  name: string;
  partner: string;
  ownId: number;
  demo: boolean;
  onReply: (text: string) => void | Promise<boolean>;
}) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ownMoment = demo || moment.authorId === ownId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = String(new FormData(event.currentTarget).get('response') ?? '').trim();
    if (!response || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await onReply(response); }
    catch (failure) { setError(friendlyError(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <article className="history-card">
    {moment.createdAt && <p className="eyebrow"><time dateTime={moment.createdAt}>{new Date(moment.createdAt).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</time></p>}
    <div className="moment-entries">
      {moment.messages?.length ? moment.messages.map(entry => <div className="moment-entry" key={entry.id}>
        <span className="eyebrow">{entry.authorName ?? entry.forwardedFrom ?? (entry.own ? name : partner)} · {entry.time}</span>
        {entry.text && <p>{entry.text}</p>}
        {entry.attachment && <p>{entry.attachment}</p>}
        {entry.media?.map(asset => <MediaView key={asset.id} asset={asset} />)}
      </div>) : <blockquote>{moment.message}</blockquote>}
    </div>
    <div className="moment-note">
      <span className="eyebrow">{ownMoment ? 'ПОЧЕМУ Я ЭТО СОХРАНИЛ' : `ПОЧЕМУ СОХРАНЕНО · ${partner.toLocaleUpperCase('ru')}`}</span>
      <p>{moment.reason}</p>
    </div>
    {moment.response ? <div className="moment-note">
      <span className="eyebrow">ОТВЕТ · {(ownMoment ? partner : name).toLocaleUpperCase('ru')}</span><p>{moment.response}</p>
    </div> : (demo || !ownMoment) && <form className="moment-reply" onSubmit={submit} aria-busy={busy}>
      <div className="moment-reply-field">
        <input className="simple-input" name="response" aria-label="Ответ на момент" placeholder={demo ? `Тестовый ответ: ${partner}` : 'Ответить на момент'} required maxLength={500} disabled={busy} />
        <button type="submit" className="moment-reply-send" aria-label="Отправить ответ" disabled={busy}><Send size={19} aria-hidden="true" /></button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>}
  </article>;
}
