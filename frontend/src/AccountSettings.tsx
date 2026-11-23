import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, CircleAlert, KeyRound, Mail, Phone } from 'lucide-react';
import { ApiError, authApi, friendlyError, type Account } from './authApi';
import PasswordRecoveryForm from './PasswordRecoveryForm';
import EmailChangeForm from './EmailChangeForm';

type Props = { user: Account; onUpdate: (user: Account) => void; onExpired: () => void };

export default function AccountSettings({ user, onUpdate, onExpired }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<'email' | 'password' | 'phone' | null>(null);
  const [emailChanged, setEmailChanged] = useState(false);
  const mounted = useRef(true);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const verified = !!user.email_verified_at;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setSent(false); setError(''); setRetryAt(0); }, [user.email]);

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
      <summary><Mail /><span>Почта<small className="account-email"><span>{user.email}</span>{!verified && <span className="email-unverified-mark" role="img" aria-label="Почта не подтверждена" title="Почта не подтверждена"><CircleAlert aria-hidden="true" /></span>}</small></span><ChevronRight /></summary>
      <div className="account-security-actions">
        <button className="security-action" disabled={busy} aria-expanded={notice === 'email'} onClick={() => { setNotice(value => value === 'email' ? null : 'email'); setEmailChanged(false); }}><span>Сменить почту</span><ChevronRight /></button>
        {notice === 'email' && <EmailChangeForm key={`${user.id}:${user.email}`} user={user} onExpired={onExpired} onUpdate={updated => { onUpdate(updated); setNotice(null); setEmailChanged(true); }} />}
        {emailChanged && <p className="auth-success" role="status">Почта изменена. Подтверди новый адрес по ссылке из письма — нажми «Подтвердить почту».</p>}
        <button className="security-action" disabled={busy || verified || remaining > 0 || notice === 'email'} onClick={() => { void request(); }}>
          <span>{verified ? 'Почта подтверждена' : 'Подтвердить почту'}{!verified && <small>{busy ? 'Отправляем письмо…' : remaining ? `Повторная отправка через ${remaining} с` : sent ? 'Отправить письмо ещё раз' : 'Отправить ссылку на почту'}</small>}</span>{verified ? <Check /> : <ChevronRight />}
        </button>
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
