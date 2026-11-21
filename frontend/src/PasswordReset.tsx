import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { authApi, friendlyError } from './authApi';
import PasswordRecoveryForm from './PasswordRecoveryForm';

export default function PasswordReset({ brand, onReset, onDone }: { brand: ReactNode; onReset: () => void; onDone: () => void }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useLayoutEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || request.current || success) return;
    if (!password) { setError('Введи новый пароль'); return; }
    if (password.includes(' ')) { setError('Пароль не должен содержать пробелы'); return; }
    if (password !== repeat) { setError('Пароли не совпадают'); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      await authApi.resetPassword(token, password, controller.signal);
      if (controller.signal.aborted) return;
      setPassword(''); setRepeat(''); setToken(''); setVisible(false); setSuccess(true); onReset();
    } catch (caught) {
      if (!controller.signal.aborted) setError(friendlyError(caught));
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }
  return <main className="email-confirmation-screen password-reset-screen">
    <div className="email-confirmation-brand">{brand}</div>
    <section className="email-confirmation-card password-reset-card glass" aria-busy={busy}>
      <div className="confirmation-symbol">{success ? <Check /> : <KeyRound />}</div>
      <h1>{success ? 'Пароль изменён' : 'Новый пароль'}</h1>
      {success ? <>
        <p className="auth-description" role="status">Старые сеансы завершены. Войди с новым паролем.</p>
        <button className="primary full" onClick={onDone}>Войти</button>
      </> : <>
        {token ? <form className="password-reset-form stack-form" aria-label="Смена пароля" onSubmit={event => { void submit(event); }}>
          <p className="auth-description">Придумай новый пароль для своего аккаунта.</p>
          <fieldset className="auth-fields" disabled={busy}>
            <label>Новый пароль<span className="reset-password-input"><input aria-label="Новый пароль" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={event => { setPassword(event.target.value); setError(''); }} /><button className="icon-button" type="button" aria-label={visible ? 'Скрыть новый пароль' : 'Показать новый пароль'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff /> : <Eye />}</button></span></label>
            <label>Повтори пароль<input aria-label="Повтори пароль" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={repeat} onChange={event => { setRepeat(event.target.value); setError(''); }} /></label>
          </fieldset>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="primary full" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить пароль'}</button>
        </form> : <p className="auth-error" role="alert">В ссылке нет токена для смены пароля. Запроси новое письмо.</p>}
        <details className="reset-request-new" open={!token}>
          <summary>Запросить новую ссылку</summary>
          <PasswordRecoveryForm />
        </details>
        <button className="text-button confirmation-back" disabled={busy} onClick={onDone}>Вернуться в приложение</button>
      </>}
    </section>
  </main>;
}
