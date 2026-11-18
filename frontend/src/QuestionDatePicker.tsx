import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const monthLabel = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' });
const dayLabel = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' });
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const offsetFromMonday = (date: Date) => (date.getDay() + 6) % 7;
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
export const nextLocalDay = (now: number) => addDays(new Date(now), 1);

export function dateValue(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('-');
}

function addMonths(date: Date, months: number) {
  const month = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return addDays(month, Math.min(lastDay, date.getDate()) - 1);
}

export default function QuestionDatePicker({ value, onChange, minimum, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  minimum: Date;
  disabled?: boolean;
}) {
  const labelId = useId();
  const calendarId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const activeDay = useRef<HTMLButtonElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(minimum);
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const date = cursor < minimum ? minimum : cursor;
  const first = monthStart(date);
  const leading = offsetFromMonday(first);
  const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((leading + total) / 7) * 7;
  const showCalendar = open && !disabled;

  useLayoutEffect(() => {
    if (showCalendar && focusDay.current) {
      activeDay.current?.focus({ preventScroll: true });
      focusDay.current = false;
    }
  }, [showCalendar, date.getTime()]);

  useEffect(() => {
    if (!showCalendar) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [showCalendar]);

  function move(next: Date, focus: boolean) {
    focusDay.current = focus;
    setCursor(next < minimum ? minimum : next);
  }

  function navigateDay(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
    let next: Date;
    switch (event.key) {
      case 'ArrowLeft': next = addDays(day, -1); break;
      case 'ArrowRight': next = addDays(day, 1); break;
      case 'ArrowUp': next = addDays(day, -7); break;
      case 'ArrowDown': next = addDays(day, 7); break;
      case 'Home': next = addDays(day, -offsetFromMonday(day)); break;
      case 'End': next = addDays(day, 6 - offsetFromMonday(day)); break;
      case 'PageUp': next = addMonths(day, event.shiftKey ? -12 : -1); break;
      case 'PageDown': next = addMonths(day, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    move(next, true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return <div className="question-date-field" ref={root} onKeyDown={event => {
    if (showCalendar && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }}>
    <span id={labelId} className="question-date-label">Когда открыть</span>
    <input type="hidden" name="opens" value={value} />
    <button ref={trigger} type="button" className="question-date-trigger" aria-labelledby={`${labelId} ${labelId}-value`} aria-controls={showCalendar ? calendarId : undefined} aria-expanded={showCalendar} disabled={disabled} onClick={() => {
      if (showCalendar) { close(); return; }
      move(selected ?? minimum, true);
      setOpen(true);
    }}>
      <CalendarDays size={18} aria-hidden="true" />
      <span id={`${labelId}-value`} className={selected ? undefined : 'date-placeholder'}>{selected ? dayLabel.format(selected) : 'Выбрать дату'}</span>
      <ChevronDown size={17} aria-hidden="true" />
    </button>
    {showCalendar && <div id={calendarId} className="question-calendar" role="group" aria-label="Календарь даты открытия">
      <div className="question-calendar-header">
        <button type="button" aria-label="Предыдущий месяц" disabled={first <= monthStart(minimum)} onClick={() => move(addMonths(date, -1), false)}><ChevronLeft size={18} /></button>
        <strong aria-live="polite">{monthLabel.format(first).replace(/\sг\.$/, '')}</strong>
        <button type="button" aria-label="Следующий месяц" onClick={() => move(addMonths(date, 1), false)}><ChevronRight size={18} /></button>
      </div>
      <div className="question-calendar-days">
        {weekdays.map(day => <span className="question-calendar-weekday" aria-hidden="true" key={day}>{day}</span>)}
        {Array.from({ length: cells }, (_, index) => {
          const day = addDays(first, index - leading);
          const key = dateValue(day);
          if (day.getMonth() !== first.getMonth()) return <span className="question-calendar-outside" key={key} aria-hidden="true">{day.getDate()}</span>;
          const focused = day.getTime() === date.getTime();
          return <button type="button" key={key} ref={focused ? activeDay : undefined} tabIndex={focused ? 0 : -1}
            disabled={day < minimum} aria-label={dayLabel.format(day)} aria-pressed={value === key} onKeyDown={event => navigateDay(event, day)}
            onClick={() => { onChange(key); close(); }}>{day.getDate()}</button>;
        })}
      </div>
    </div>}
  </div>;
}
