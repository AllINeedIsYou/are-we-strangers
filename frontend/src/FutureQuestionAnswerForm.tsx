import { useRef, useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { friendlyError } from './authApi';

export default function FutureQuestionAnswerForm({ onAnswer, onCancel }: {
  onAnswer: (text: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const text = input.current?.value.trim();
    if (!text) {
      setError('Напиши ответ.');
      return;
    }
    request.current = true;
    setPending(true);
    setError('');
    try {
      if (!await onAnswer(text)) setError('Не удалось сохранить ответ. Попробуй ещё раз.');
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      request.current = false;
      setPending(false);
    }
  }

  return <form className="moment-reply" onSubmit={event => void submit(event)} onKeyDown={event => {
    if (event.key === 'Escape' && onCancel && !pending) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }}>
    <div className="moment-reply-field">
      <input ref={input} className="simple-input" name="text" aria-label="Твой ответ" placeholder="Твой ответ" required maxLength={500} readOnly={pending} autoFocus={!!onCancel} />
      <button type="submit" className="moment-reply-send" aria-label="Отправить ответ" disabled={pending}><Send size={19} aria-hidden="true" /></button>
    </div>
    {pending && <p className="muted" role="status">Отправляем…</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {onCancel && !pending && <button type="button" className="future-question-cancel" onClick={onCancel}><X size={14} aria-hidden="true" /> Отмена</button>}
  </form>;
}
