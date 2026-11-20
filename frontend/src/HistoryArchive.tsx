import { useState, type ReactNode } from 'react';
import { Clock3 } from 'lucide-react';
import type { Moment } from './domain';
import type { ServerFutureQuestion } from './messengerApi';
import { FutureQuestionContent } from './FutureQuestionsPanel';
import DateSortButton, { sortByCreated, type DateOrder } from './DateSortButton';
import ArchiveEmpty from './ArchiveEmpty';

export default function HistoryArchive({ moments, questions, now, loading, error, onReload, renderMoment, renderAction, onAnswer }: {
  moments: Moment[]; questions: ServerFutureQuestion[]; now: number; loading: boolean; error: string;
  onReload: () => void; renderMoment: (moment: Moment) => ReactNode;
  renderAction: (question: ServerFutureQuestion) => ReactNode; onAnswer: (id: number, text: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<'moments' | 'questions'>('moments');
  const [order, setOrder] = useState<DateOrder>('desc');
  const any = moments.length + questions.length > 0;
  if (error) return <p className="history-error" role="alert">{error} <button type="button" className="text-button" onClick={onReload}>Повторить</button></p>;
  if (loading) return <p className="muted" role="status">Загружаем архив…</p>;
  if (!any) return <ArchiveEmpty />;
  return <>
    <div className="history-archive-heading">
      <div className="archive-tabs" role="tablist" aria-label="Записи в архиве">
        <button type="button" role="tab" aria-selected={tab === 'moments'} onClick={() => setTab('moments')}>Моменты</button>
        <button type="button" role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}>Вопросы</button>
      </div>
      <DateSortButton order={order} onChange={setOrder} />
    </div>
    <section aria-label={tab === 'moments' ? 'Архив моментов' : 'Архив вопросов'}>
      {tab === 'moments' ? moments.length ? sortByCreated(moments, row => row.createdAt, order).map(renderMoment) : <ArchiveEmpty />
        : questions.length ? sortByCreated(questions, row => row.created_at, order).map(card => <article className="history-card" key={card.id}>
          <time className="eyebrow" dateTime={card.opens_at}>{new Date(card.opens_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
          <h3>{card.text}</h3>
          {Date.parse(card.opens_at) > now ? <p className="muted"><Clock3 size={16} /> Встретимся с этим вопросом позже.</p> : <FutureQuestionContent card={card} onAnswer={text => onAnswer(card.id, text)} />}
          {renderAction(card)}
        </article>) : <ArchiveEmpty />}
    </section>
  </>;
}
