import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Mail } from 'lucide-react';
import { ApiError, authApi, friendlyError, type Account } from './authApi';

type Props = { user: Account; onUpdate: (user: Account) => void; onExpired: () => void };

export default function AccountSettings({ user, onUpdate, onExpired }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const verified = !!user.email_verified_at;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!retryAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryAt]);
  useEffect(() => {
    async function update() {
      if (document.visibilityState !== 'visible') return;
      try {
        const current = await authApi.me();
        if (!mounted.current) return;
        if (current.id === user.id) onUpdate(current);
        else onExpired();
      } catch (caught) {
        if (mounted.current && caught instanceof ApiError && caught.status === 401) onExpired();
      }
    }
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [user.id, onUpdate, onExpired]);

  async function request() {
    if (busy || verified || remaining) return;
    setBusy(true); setError('');
    try {
      await authApi.requestEmail();
      if (!mounted.current) return;
      setSent(true); setNow(Date.now()); setRetryAt(Date.now() + 60_000);
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof ApiError && caught.status === 401) { onExpired(); return; }
      if (caught instanceof ApiError && caught.status === 409) {
        try { const current = await authApi.me(); if (!mounted.current) return; if (current.id === user.id) onUpdate(current); else onExpired(); }
        catch (refreshError) { if (mounted.current) setError(friendlyError(refreshError)); }
      } else {
        setError(friendlyError(caught));
        if (caught instanceof ApiError && (caught.status === 429 || caught.status === 502)) {
          setNow(Date.now()); setRetryAt(Date.now() + 60_000);
        }
      }
    } finally { if (mounted.current) setBusy(false); }
  }

  return <section className="account-settings" aria-label="Аккаунт">
    <div className="account-identity"><strong>{user.name}</strong><span>{user.username}</span></div>
    <button className="setting-row email-setting" disabled={busy || verified || remaining > 0} onClick={() => { void request(); }}>
      {verified ? <Check /> : <Mail />}<span>{user.email}<small>{verified ? 'Почта подтверждена' : busy ? 'Отправляем письмо…' : remaining ? `Повторная отправка через ${remaining} с` : sent ? 'Отправить письмо ещё раз' : 'Не подтверждена · отправить письмо'}</small></span>{!verified && <ChevronRight />}
    </button>
    {sent && !verified && <p className="auth-description" role="status">Письмо отправлено. Перейди по ссылке в письме в течение 15 минут. Если письма нет, проверь «Спам».</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}
