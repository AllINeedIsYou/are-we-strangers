import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ApiError, authApi, friendlyError, telegramLink, type Account, type EmailChangeChallenge } from './authApi';

type Props = { user: Account; onUpdate: (user: Account) => void; onExpired: () => void };

export default function EmailChangeForm({ user, onUpdate, onExpired }: Props) {
  const [email, setEmail] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [challenge, setChallenge] = useState<EmailChangeChallenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const secondsLeft = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.verification_expires_at) - now) / 1000)) : 0;
  const expired = !!challenge && secondsLeft === 0;
  const botUrl = challenge ? telegramLink(challenge.telegram_url) : null;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!challenge && !retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, retryAt]);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
    else emailInput.current?.focus();
  }, [challenge]);

  function report(caught: unknown) {
    if (caught instanceof ApiError && caught.status === 401) onExpired();
    else setError(friendlyError(caught));
  }

  async function createChallenge(event?: FormEvent) {
    event?.preventDefault();
    const newEmail = email.trim();
    if (request.current || remaining || !newEmail || !user.phone_verified_at) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const next = await authApi.requestEmailChange(newEmail, controller.signal);
      if (controller.signal.aborted) return;
      setChallenge(next); setTargetEmail(newEmail); setCode('');
      setNow(Date.now()); setRetryAt(Date.now() + 60_000);
    } catch (caught) {
      if (controller.signal.aborted) return;
      report(caught);
      if (caught instanceof ApiError && caught.status === 429) {
        setNow(Date.now()); setRetryAt(Date.now() + 60_000);
      }
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (request.current || !challenge || expired || !/^[0-9]{6}$/.test(code)) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const updated = await authApi.confirmEmailChange(user.id, challenge.verification_token, code, controller.signal);
      if (!controller.signal.aborted) onUpdate(updated);
    } catch (caught) {
      if (!controller.signal.aborted) report(caught);
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }

  return <div className="email-change-form" aria-busy={busy}>
    {!challenge ? <form className="stack-form" aria-label="Смена почты" onSubmit={event => { void createChallenge(event); }}>
      <p className="auth-description">Для смены почты понадобится код из Telegram-бота. Используй свой подтверждённый номер телефона.</p>
      <label>Новая почта<input ref={emailInput} name="new_email" type="email" autoComplete="email" maxLength={320} required disabled={busy} value={email} onChange={event => { setEmail(event.target.value); setError(''); }} /></label>
      {!user.phone_verified_at && <p className="auth-error" role="alert">Сначала подтверди номер телефона.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary full" type="submit" disabled={busy || remaining > 0 || !email.trim() || !user.phone_verified_at}>{busy ? 'Создаём заявку…' : remaining ? `Повторить через ${remaining} с` : 'Получить код в Telegram'}</button>
    </form> : <form className="stack-form" aria-label="Подтверждение смены почты" onSubmit={event => { void confirm(event); }}>
      <p className="email-change-target">Новая почта<strong>{targetEmail}</strong></p>
      <p className="auth-description">Открой бота и поделись своим контактом кнопкой в чате. Введи полученный код здесь.</p>
      {botUrl && !expired && <a className="secondary glass email-change-telegram" href={botUrl} target="_blank" rel="noopener noreferrer">Открыть Telegram <ArrowUpRight size={18} /></a>}
      <label>Код из Telegram<input ref={codeInput} name="code" className="verification-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="000000" disabled={busy || expired} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} /></label>
      <p className="auth-description" role={expired ? 'status' : undefined}>{expired ? 'Срок заявки истёк. Создай новую ссылку.' : `Заявка действует ещё ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary full" type="submit" disabled={busy || expired || code.length !== 6}>{busy ? 'Проверяем код…' : 'Сменить почту'}</button>
      <div className="email-change-options">
        <button type="button" disabled={busy || remaining > 0} onClick={() => { void createChallenge(); }}>{remaining ? `Новая ссылка через ${remaining} с` : 'Создать новую ссылку'}</button>
        <button type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setError(''); }}>Изменить адрес</button>
      </div>
    </form>}
  </div>;
}
