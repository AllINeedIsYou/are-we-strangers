import { useEffect, useState, type ReactNode } from 'react';
import { Check, Mail } from 'lucide-react';
import { authApi, friendlyError, type Account } from './authApi';

export default function EmailConfirmation({ brand, onDone, onVerified }: {
  brand: ReactNode;
  onDone: () => void;
  onVerified: (user: Account) => void;
}) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [status, setStatus] = useState<'ready' | 'pending' | 'success' | 'error'>(token ? 'ready' : 'error');
  const [error, setError] = useState(token ? '' : 'В ссылке нет токена подтверждения. Запроси новое письмо в настройках аккаунта.');
  useEffect(() => {
    // Keep the bearer token out of the address bar after reading it into memory.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function confirm() {
    if (!token || status === 'pending' || status === 'success') return;
    setStatus('pending'); setError('');
    try {
      const user = await authApi.verifyEmail(token);
      onVerified(user); setStatus('success');
    } catch (caught) { setStatus('error'); setError(friendlyError(caught)); }
  }

  return <main className="email-confirmation-screen">
    <div className="email-confirmation-brand">{brand}</div>
    <section className="email-confirmation-card glass" aria-busy={status === 'pending'}>
      <div className="confirmation-symbol">{status === 'success' ? <Check /> : <Mail />}</div>
      <h1>{status === 'success' ? 'Почта подтверждена' : 'Подтверждение почты'}</h1>
      {status === 'success' ? <p className="auth-description" role="status">Теперь этот адрес подтверждён в твоём аккаунте.</p> : <p className="auth-description">Нажми кнопку, чтобы подтвердить почту для Are we strangers?. Ссылка действует 15 минут.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {status !== 'success' && token && <button className="primary full" disabled={status === 'pending'} onClick={() => { void confirm(); }}>{status === 'pending' ? 'Подтверждаем…' : 'Подтвердить почту'}</button>}
      <button className={status === 'success' ? 'primary full' : 'text-button confirmation-back'} disabled={status === 'pending'} onClick={onDone}>Вернуться в приложение</button>
    </section>
  </main>;
}
