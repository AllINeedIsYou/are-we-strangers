import { useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, BookOpen, Check, Clock3, Plus, Search, X } from 'lucide-react';
import { friendlyError } from './authApi';
import type { ChapterDecision, ServerChapter } from './messengerApi';
import { completedChapterMinutes, type ChapterBoundary } from './chapterTimeline';
import DateSortButton, { sortByCreated, type DateOrder } from './DateSortButton';

const formatDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ChaptersPanel({ cards, boundaries, ownId, loading, error, onReload, onCreate, onDecide, onJump, onHistory }: {
  cards: ServerChapter[];
  boundaries: ChapterBoundary[];
  ownId: number;
  loading: boolean;
  error?: string;
  onReload: () => void;
  onCreate: (title: string) => Promise<boolean>;
  onDecide: (id: number, status: ChapterDecision) => Promise<boolean>;
  onJump: (boundary: ChapterBoundary) => Promise<boolean>;
  onHistory: (boundary: ChapterBoundary, trigger: HTMLButtonElement) => void;
}) {
  const [title, setTitle] = useState('');
  const [expanded, setExpanded] = useState(false);
  const formId = useId();
  const createToggle = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [order, setOrder] = useState<DateOrder>('asc');
  const [pending, setPending] = useState<number | 'create' | 'initial' | null>(null);
  const [failure, setFailure] = useState<{ at: number | 'create' | 'initial'; text: string } | null>(null);
  const request = useRef(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const term = (query ?? '').trim().toLocaleLowerCase('ru');
  const matches = (title: string) => title.toLocaleLowerCase('ru').includes(term);
  const visible = sortByCreated(cards.filter(card => matches(card.title)), card => card.created_at, order);
  const initial = boundaries.find(boundary => boundary.id.startsWith('initial-'));
  const durations = completedChapterMinutes(boundaries);
  const initialDuration = initial ? durations.get(initial.id) : undefined;
  const showInitial = initial && !loading && !error && matches(initial.title);

  async function perform(at: number | 'create' | 'initial', action: () => Promise<boolean>) {
    if (request.current) return false;
    request.current = true;
    setPending(at);
    setFailure(null);
    try {
      const saved = await action();
      if (!saved) setFailure({ at, text: 'Не удалось выполнить действие. Попробуй ещё раз.' });
      return saved;
    } catch (problem) {
      setFailure({ at, text: friendlyError(problem) });
      return false;
    } finally {
      request.current = false;
      setPending(null);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    if (await perform('create', () => onCreate(value))) {
      setTitle('');
      createToggle.current?.focus({ preventScroll: true });
      setExpanded(false);
    }
  }

  function closeSearch() {
    setQuery(null);
    searchButton.current?.focus();
  }

  const initialCard = showInitial && <article className="history-card chapter-card" aria-label={initial.title}>
    <span className={`chapter-status ${initialDuration === undefined ? 'accepted' : 'completed'}`}><Check size={13} />{initialDuration === undefined ? 'Начало истории' : 'Глава закончена'}</span>
    <h3>{initial.title}</h3>
    <div className="chapter-timing">
      <time className="eyebrow" dateTime={initial.startedAt}>{formatDate.format(new Date(initial.startedAt))}</time>
      {initialDuration !== undefined && <strong className="chapter-duration">{initialDuration} минут вместе</strong>}
    </div>
    <div className="chapter-card-actions">
      <button type="button" className="chapter-jump" disabled={pending !== null} onClick={() => void perform('initial', () => onJump(initial))}>{pending === 'initial' ? 'Загружаем начало…' : 'Перейти к началу главы'}<ArrowUpRight size={16} /></button>
      <button type="button" className="chapter-jump" disabled={pending !== null} onClick={event => onHistory(initial, event.currentTarget)}>История главы<BookOpen size={16} /></button>
    </div>
    {failure?.at === 'initial' && <p className="inline-error" role="alert">{failure.text}</p>}
  </article>;

  return <>
    <div className="chapters-heading">
      <h3>Главы вашей истории</h3>
      <div className="history-toolbar">
      <DateSortButton order={order} onChange={setOrder} />
      <button ref={searchButton} type="button" className="icon-button glass round" aria-label="Поиск глав по названию" aria-expanded={query !== null} onClick={() => {
        if (query === null) setExpanded(false);
        setQuery(value => value === null ? '' : null);
      }}><Search size={20} /></button>
      <button ref={createToggle} type="button" className="icon-button glass round chapter-create-toggle" aria-label={expanded ? 'Свернуть форму главы' : 'Добавить главу'} aria-expanded={expanded} aria-controls={formId} onClick={() => {
        if (expanded) createToggle.current?.focus({ preventScroll: true });
        setQuery(null);
        setExpanded(value => !value);
      }}><Plus aria-hidden="true" /></button>
      </div>
    </div>
    {query !== null && <div className="chapters-search glass">
      <Search size={17} aria-hidden="true" />
      <input aria-label="Название главы для поиска" placeholder="Найти главу" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSearch(); }
      }} autoFocus />
      <button className="icon-button" type="button" aria-label="Закрыть поиск глав" onClick={closeSearch}><X size={18} /></button>
    </div>}
    <div id={formId} className={`chapter-create-disclosure ${expanded ? 'is-expanded' : ''}`} inert={!expanded} aria-hidden={!expanded}>
      <div>
        <form className="stack-form chapter-create" onSubmit={event => void create(event)}>
          <label>Название главы<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Чуть ближе" maxLength={70} required disabled={pending === 'create'} /></label>
          <button className="primary" disabled={pending !== null || !title.trim()}>{pending === 'create' ? 'Предлагаем…' : 'Предложить новую главу'}</button>
          {failure?.at === 'create' && <p className="inline-error" role="alert">{failure.text}</p>}
        </form>
      </div>
    </div>
    {error && <p className="history-error" role="alert">{error} <button className="text-button" type="button" onClick={onReload}>Повторить</button></p>}
    {loading && !cards.length && <p className="muted" role="status">Загружаем главы…</p>}
    {order === 'asc' && initialCard}
    {visible.map(card => {
      const duration = durations.get(`chapter-${card.id}`);
      return <article className="history-card chapter-card" aria-label={card.title} key={card.id}>
        <span className={`chapter-status ${duration === undefined ? card.status : 'completed'}`}>{card.status === 'accepted' ? <Check size={13} /> : card.status === 'pending' ? <Clock3 size={13} /> : <X size={13} />}{duration !== undefined ? 'Глава закончена' : card.status === 'accepted' ? 'Глава началась' : card.status === 'pending' ? 'Предложение главы' : 'Предложение отклонено'}</span>
        <h3>{card.title}</h3>
        <div className="chapter-timing">
          <time className="eyebrow" dateTime={card.created_at}>{formatDate.format(new Date(card.created_at))}</time>
          {duration !== undefined && <strong className="chapter-duration">{duration} минут вместе</strong>}
        </div>
        {card.status === 'pending' && (card.author_id === ownId ? <p className="muted">Ждём решения собеседника.</p> : <>
          <p className="muted">Собеседник предлагает начать новую главу.</p>
          <div className="chapter-decisions">
            <button type="button" className="secondary glass" disabled={pending !== null} onClick={() => void perform(card.id, () => onDecide(card.id, 'rejected'))}>Отклонить</button>
            <button type="button" className="primary" disabled={pending !== null} onClick={() => void perform(card.id, () => onDecide(card.id, 'accepted'))}>Принять</button>
          </div>
          {pending === card.id && <p className="muted" role="status">Сохраняем решение…</p>}
        </>)}
        {card.status === 'accepted' && card.started_at && <div className="chapter-card-actions">
          <button type="button" className="chapter-jump" disabled={pending !== null} onClick={() => void perform(card.id, () => onJump({ id: `chapter-${card.id}`, title: card.title, startedAt: card.started_at! }))}>{pending === card.id ? 'Загружаем начало…' : 'Перейти к началу главы'}<ArrowUpRight size={16} /></button>
          <button type="button" className="chapter-jump" disabled={pending !== null} onClick={event => onHistory({ id: `chapter-${card.id}`, title: card.title, startedAt: card.started_at! }, event.currentTarget)}>История главы<BookOpen size={16} /></button>
        </div>}
        {failure?.at === card.id && <p className="inline-error" role="alert">{failure.text}</p>}
      </article>;
    })}
    {order === 'desc' && initialCard}
    {!loading && !error && !visible.length && !showInitial && <p className="muted" role="status">{term ? 'Главы с таким названием не найдены.' : 'Пока нет глав.'}</p>}
  </>;
}
