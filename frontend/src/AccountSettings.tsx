import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, KeyRound, Mail, Phone } from 'lucide-react';
import { ApiError, authApi, friendlyError, type Account } from './authApi';
import PasswordRecoveryForm from './PasswordRecoveryForm';

type Props = { user: Account; onUpdate: (user: Account) => void; onExpired: () => void };

export default function AccountSettings({ user, onUpdate, onExpired }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<'email' | 'password' | 'phone' | null>(null);
  const mounted = useRef(true);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const verified = !!user.email_verified_at;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!retryAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryAt]);
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
    <details className="account-security-group">
      <summary><Mail /><span>Почта<small>{user.email}</small></span><ChevronRight /></summary>
      <div className="account-security-actions">
        <button className="security-action" onClick={() => setNotice('email')}><span>Сменить почту</span><ChevronRight /></button>
        <button className="security-action" disabled={busy || verified || remaining > 0} onClick={() => { void request(); }}>
          <span>{verified ? 'Почта подтверждена' : 'Подтвердить почту'}{!verified && <small>{busy ? 'Отправляем письмо…' : remaining ? `Повторная отправка через ${remaining} с` : sent ? 'Отправить письмо ещё раз' : 'Отправить ссылку на почту'}</small>}</span>{verified ? <Check /> : <ChevronRight />}
        </button>
        {notice === 'email' && <p className="security-notice" role="status">Смена почты через код Telegram-бота появится позже.</p>}
        {sent && !verified && <p className="auth-description" role="status">Письмо отправлено. Перейди по ссылке в течение 15 минут. Если письма нет, проверь «Спам».</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </details>
    <details className="account-security-group">
      <summary><KeyRound /><span>Пароль</span><ChevronRight /></summary>
      <div className="account-security-actions">
        <button className="security-action" aria-expanded={notice === 'password'} onClick={() => setNotice(value => value === 'password' ? null : 'password')}><span>Сменить пароль</span><ChevronRight /></button>
        {notice === 'password' && (verified ? <PasswordRecoveryForm email={user.email} /> : <p className="security-notice" role="status">Сначала подтверди почту в разделе «Почта», затем запроси ссылку для смены пароля.</p>)}
      </div>
    </details>
    <details className="account-security-group">
      <summary><Phone /><span>Телефон<small>{user.phone.replace(/^tel:/, '')}</small></span><ChevronRight /></summary>
      <div className="account-security-actions">
        <button className="security-action" onClick={() => setNotice('phone')}><span>Сменить телефон</span><ChevronRight /></button>
        {notice === 'phone' && <p className="security-notice" role="status">Смена номера телефона пока недоступна.</p>}
      </div>
    </details>
  </section>;
}
