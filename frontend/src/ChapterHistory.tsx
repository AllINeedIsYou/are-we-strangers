import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Archive, Clock3 } from 'lucide-react';
import type { Moment } from './domain';
import type { ServerFutureQuestion } from './messengerApi';
import { chapterWindow, recordsInChapter, type ChapterBoundary } from './chapterTimeline';
import DateSortButton, { sortByCreated, type DateOrder } from './DateSortButton';
import { FutureQuestionContent } from './FutureQuestionsPanel';
import ArchiveEmpty from './ArchiveEmpty';

const formatDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ChapterHistory({ chapter, boundaries, moments, questions, now, momentsLoading, questionsLoading, momentsError, questionsError,
  archivedMomentIds, archivedQuestionIds, onReloadMoments, onReloadQuestions, renderMoment, onAnswer }: {
  chapter: ChapterBoundary; boundaries: ChapterBoundary[]; moments: Moment[]; questions: ServerFutureQuestion[]; now: number;
  momentsLoading: boolean; questionsLoading: boolean; momentsError?: string; questionsError?: string;
  archivedMomentIds: ReadonlySet<number>; archivedQuestionIds: ReadonlySet<number>;
  onReloadMoments: () => void; onReloadQuestions: () => void;
  renderMoment: (moment: Moment) => ReactNode; onAnswer: (id: number, text: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<'moments' | 'questions'>('moments');
  const [order, setOrder] = useState<DateOrder>('asc');
  const title = useRef<HTMLHeadingElement>(null);
  const tabId = useId();
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  const window = chapterWindow(boundaries, chapter.id);
  const chapterMoments = sortByCreated(recordsInChapter(moments, moment => moment.createdAt, window), moment => moment.createdAt, order);
  const chapterQuestions = sortByCreated(recordsInChapter(questions, question => question.created_at, window), question => question.created_at, order);
  const loading = tab === 'moments' ? momentsLoading : questionsLoading;
  const error = tab === 'moments' ? momentsError : questionsError;
  const reload = tab === 'moments' ? onReloadMoments : onReloadQuestions;
  const empty = tab === 'moments' ? chapterMoments.length === 0 : chapterQuestions.length === 0;
  return <section className="chapter-history" aria-label={`История главы «${chapter.title}»`}>
    <div className="chapter-history-heading">
      <h3 ref={title} tabIndex={-1}>{chapter.title}</h3>
      <div className="history-toolbar"><DateSortButton order={order} onChange={setOrder} /></div>
    </div>
    <p className="chapter-history-period">{formatDate.format(new Date(chapter.startedAt))}{window && Number.isFinite(window.end) ? ` — ${formatDate.format(new Date(window.end))}` : ' — по настоящее время'}</p>
    <div className="archive-tabs chapter-history-tabs" role="tablist" aria-label="Содержимое главы">
      {([['moments', 'Моменты'], ['questions', 'Вопросы']] as const).map(([value, label]) => <button type="button" key={value} id={`${tabId}-${value}`} role="tab" aria-selected={tab === value} aria-controls={`${tabId}-content`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); const next = value === 'moments' ? 'questions' : 'moments'; setTab(next); document.getElementById(`${tabId}-${next}`)?.focus();
        }
      }}>{label}</button>)}
    </div>
    <div id={`${tabId}-content`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`}>
      {error ? <p className="history-error" role="alert">{error} <button type="button" className="text-button" onClick={reload}>Повторить</button></p>
        : loading ? <p className="muted" role="status">{tab === 'moments' ? 'Загружаем моменты главы…' : 'Загружаем вопросы главы…'}</p>
        : !window ? <p className="history-error" role="alert">Не удалось определить границы главы.</p>
        : empty ? <ArchiveEmpty />
        : tab === 'moments' ? chapterMoments.map(moment => <div key={moment.id} className="chapter-history-entry">
          {moment.serverId !== undefined && archivedMomentIds.has(moment.serverId) && <span className="chapter-history-archived"><Archive size={13} />В архиве</span>}
          {renderMoment(moment)}
        </div>) : chapterQuestions.map(card => <article className="history-card" key={card.id}>
          <div className="chapter-history-record-meta"><time className="eyebrow" dateTime={card.created_at}>{formatDate.format(new Date(card.created_at))}</time>{archivedQuestionIds.has(card.id) && <span className="chapter-history-archived"><Archive size={13} />В архиве</span>}</div>
          <h3>{card.text}</h3>
          {Date.parse(card.opens_at) > now ? <p className="muted"><Clock3 size={16} />Откроется {formatDate.format(new Date(card.opens_at))}</p>
            : <FutureQuestionContent card={card} onAnswer={text => onAnswer(card.id, text)} />}
        </article>)}
    </div>
  </section>;
}
