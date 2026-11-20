import { useRef, useState, type ReactNode } from 'react';
import { friendlyError } from './authApi';
import type { ChapterDecision, ServerChapter } from './messengerApi';

export default function ChapterProposalNotice({ chapter, own, children, onDecide }: {
  chapter: ServerChapter;
  own: boolean;
  children: ReactNode;
  onDecide: (status: ChapterDecision) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<ChapterDecision | null>(null);
  const [error, setError] = useState('');
  const request = useRef(false);

  async function decide(status: ChapterDecision) {
    if (request.current) return;
    request.current = true;
    setPending(status);
    setError('');
    try {
      if (!await onDecide(status)) setError('Не удалось сохранить решение. Попробуй ещё раз.');
    } catch (problem) {
      setError(friendlyError(problem));
    } finally {
      request.current = false;
      setPending(null);
    }
  }

  return <aside className="chapter-proposal-notice" aria-label="Предложение новой главы">
    <div className="chapter-proposal-star" aria-hidden="true">{children}</div>
    <span>{own ? 'Вы предложили новую главу' : 'Собеседник предлагает новую главу'}</span>
    <h3>{chapter.title}</h3>
    {own ? <p className="muted">Ждём решения собеседника.</p> : <div className="chapter-decisions">
      <button type="button" className="secondary glass" disabled={pending !== null} onClick={() => void decide('rejected')}>{pending === 'rejected' ? 'Отклоняем…' : 'Отклонить'}</button>
      <button type="button" className="primary" disabled={pending !== null} onClick={() => void decide('accepted')}>{pending === 'accepted' ? 'Принимаем…' : 'Принять'}</button>
    </div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </aside>;
}
