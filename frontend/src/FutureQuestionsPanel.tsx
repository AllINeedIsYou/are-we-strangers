import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Clock3, Plus } from 'lucide-react';
import { friendlyError } from './authApi';
import type { ServerFutureQuestion } from './messengerApi';
import QuestionDatePicker, { nextLocalDay } from './QuestionDatePicker';
import FutureQuestionAnswerForm from './FutureQuestionAnswerForm';
import DateSortButton, { sortByCreated, type DateOrder } from './DateSortButton';

const dateLabel = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' });

export default function FutureQuestionsPanel({ cards, now, loading, error, onReload, onCreate, onAnswer, hiddenIds, onShowInChat, renderArchiveAction }: {
  cards: ServerFutureQuestion[];
  now: number;
  loading: boolean;
  error?: string;
  onReload: () => void;
  onCreate: (text: string, opensAt: string) => Promise<boolean>;
  onAnswer: (id: number, text: string) => Promise<boolean>;
  hiddenIds: ReadonlySet<number>;
  onShowInChat: (id: number) => void;
  renderArchiveAction?: (card: ServerFutureQuestion) => ReactNode;
}) {
  return <FutureQuestionsLayout
    cards={cards} now={now} loading={loading} error={error} onReload={onReload}
    onCreate={(text, opening) => onCreate(text, opening.toISOString())}
    getOpening={card => card.opens_at} getCreated={card => card.created_at} hasAnswer={card => card.my_answer !== null}
    renderActions={card => <>{hiddenIds.has(card.id) && <button type="button" className="question-show-in-chat" onClick={() => onShowInChat(card.id)}>Показать в чате</button>}{renderArchiveAction?.(card)}</>}
    renderAnswer={card => <FutureQuestionContent card={card} onAnswer={text => onAnswer(card.id, text)} />}
  />;
}

export function FutureQuestionContent({ card, onAnswer }: { card: ServerFutureQuestion; onAnswer: (text: string) => Promise<boolean> }) {
  return card.my_answer === null ? <FutureQuestionAnswerForm onAnswer={onAnswer} /> : <>
      <div className="moment-note"><span className="eyebrow">ТВОЙ ОТВЕТ</span><p>{card.my_answer}</p></div>
      {card.partner_answer !== null
        ? <div className="moment-note"><span className="eyebrow">ОТВЕТ СОБЕСЕДНИКА</span><p>{card.partner_answer}</p></div>
        : <p className="muted">Ждём ответа собеседника.</p>}
    </>;
}

export function FutureQuestionsLayout<Card extends { id: number | string; text: string }>({
  cards, now, loading, error, onReload, onCreate, getOpening, getCreated, hasAnswer, renderAnswer, renderActions,
}: {
  cards: Card[];
  now: number;
  loading?: boolean;
  error?: string;
  onReload?: () => void;
  onCreate: (text: string, opening: Date) => Promise<boolean> | boolean;
  getOpening: (card: Card) => string;
  getCreated: (card: Card) => string | undefined;
  hasAnswer: (card: Card) => boolean;
  renderAnswer: (card: Card) => ReactNode;
  renderActions?: (card: Card) => ReactNode;
}) {
  const formId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [openingDate, setOpeningDate] = useState('');
  const request = useRef(false);
  const [failure, setFailure] = useState('');
  const [order, setOrder] = useState<DateOrder>('desc');
  const groups = { ready: [] as Card[], answered: [] as Card[], upcoming: [] as Card[] };
  for (const card of sortByCreated(cards, getCreated, order)) {
    if (Date.parse(getOpening(card)) > now) groups.upcoming.push(card);
    else if (hasAnswer(card)) groups.answered.push(card);
    else groups.ready.push(card);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get('text') ?? '').trim();
    if (!text) {
      setFailure('Напиши вопрос.');
      return;
    }
    const opening = new Date(`${data.get('opens') ?? ''}T00:00:00`);
    if (!Number.isFinite(opening.getTime()) || opening.getTime() <= Date.now()) {
      setFailure('Выбери дату в будущем.');
      return;
    }
    request.current = true;
    setPending(true);
    setFailure('');
    try {
      if (await onCreate(text, opening)) {
        form.reset();
        setOpeningDate('');
        if (form.contains(document.activeElement)) toggle.current?.focus({ preventScroll: true });
        setExpanded(false);
      }
    } catch (failure) {
      setFailure(friendlyError(failure));
    } finally {
      request.current = false;
      setPending(false);
    }
  }

  function renderGroup(items: Card[], title: string, upcoming = false) {
    if (!items.length) return null;
    return <section className={`future-question-group${upcoming ? ' is-upcoming' : ''}`} aria-label={title}>
      <h4>{title}</h4>
      {items.map(card => {
        const opening = getOpening(card);
        return <article className="history-card" key={card.id}>
          <time className="eyebrow" dateTime={opening}>{dateLabel.format(new Date(opening))}</time>
          <h3>{card.text}</h3>
          {upcoming ? <p className="muted"><Clock3 size={16} /> Встретимся с этим вопросом позже.</p> : renderAnswer(card)}
          {renderActions?.(card)}
        </article>;
      })}
    </section>;
  }

  return <>
    <div className="future-questions-heading">
      <h3>Вопросы в будущее</h3>
      <div className="history-toolbar">
      <DateSortButton order={order} onChange={setOrder} />
      <button ref={toggle} type="button" className="glass round icon-button" aria-label={expanded ? 'Свернуть форму вопроса' : 'Добавить вопрос'} aria-expanded={expanded} aria-controls={formId} onClick={() => {
        if (expanded) toggle.current?.focus({ preventScroll: true });
        setExpanded(!expanded);
      }}><Plus aria-hidden="true" /></button>
      </div>
    </div>
    <div id={formId} className={`future-question-disclosure ${expanded ? 'is-expanded' : ''}`} inert={!expanded} aria-hidden={!expanded}>
      <div>
        <form className="stack-form" onSubmit={event => void submit(event)}>
          <label>Наш вопрос<textarea name="text" placeholder="Какими мы будем через год?" required maxLength={500} disabled={pending} /></label>
          <QuestionDatePicker value={openingDate} onChange={setOpeningDate} minimum={nextLocalDay(now)} disabled={pending || !expanded} />
          {failure && <p className="inline-error" role="alert">{failure}</p>}
          <button className="primary" disabled={pending}>{pending ? 'Сохраняем…' : 'Оставить на будущее'}</button>
        </form>
      </div>
    </div>
    {error && <p className="history-error" role="alert">{error} {onReload && <button className="text-button" onClick={onReload}>Повторить</button>}</p>}
    {loading && !cards.length && <p className="muted" role="status">Загружаем вопросы…</p>}
    {!loading && !error && !cards.length && <p className="muted">Пока нет вопросов.</p>}
    <div className="future-question-groups">
      {renderGroup(groups.ready, 'Можно ответить')}
      {renderGroup(groups.answered, 'Вы уже ответили')}
      {renderGroup(groups.upcoming, 'Откроются позже', true)}
    </div>
  </>;
}
