import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authApi, friendlyError } from './authApi';

export default function PasswordRecoveryForm({ email: fixedEmail }: { email?: string }) {
  const [email, setEmail] = useState(fixedEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (request.current || remaining || !email.trim()) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      await authApi.requestPasswordReset(email, controller.signal);
      if (controller.signal.aborted) return;
      setSent(true); setNow(Date.now()); setRetryAt(Date.now() + 60_000);
    } catch (caught) {
      if (!controller.signal.aborted) setError(friendlyError(caught));
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }
  return <form className="password-recovery-form stack-form" aria-label="Запрос ссылки для смены пароля" aria-busy={busy} onSubmit={event => { void submit(event); }}>
    <p className="auth-description">Введи подтверждённую почту аккаунта. Мы отправим ссылку для создания нового пароля.</p>
    <label>Почта<input aria-label="Почта для смены пароля" name="email" type="email" autoComplete="email" required maxLength={320} readOnly={fixedEmail !== undefined} disabled={busy} value={email} onChange={event => { setEmail(event.target.value); setError(''); setSent(false); }} /></label>
    {sent && <p className="auth-success" role="status">Если для этой почты доступно восстановление, мы отправим письмо со ссылкой. Она действует 15 минут. Проверь также папку «Спам».</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="primary full" type="submit" disabled={busy || remaining > 0 || !email.trim()}>{busy ? 'Отправляем запрос…' : remaining ? `Повторить через ${remaining} с` : sent ? 'Отправить ссылку ещё раз' : 'Отправить ссылку'}</button>
  </form>;
}
