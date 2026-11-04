import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { ApiError, authApi, friendlyError, telegramLink, type Account, type PhoneChallenge } from './authApi';

type Props = {
  active: boolean;
  checking: boolean;
  onAuthenticated: (user: Account) => void;
  onRegisterMode: (register: boolean) => void;
  onBusy: (busy: boolean) => void;
  onRecovery: () => void;
};

export default function AuthForm({ active, checking, onAuthenticated, onRegisterMode, onBusy, onRecovery }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'phone'>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registration, setRegistration] = useState({ phone: '', email: '', name: '', username: '' });
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [now, setNow] = useState(Date.now());
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const botUrl = challenge ? telegramLink(challenge.telegram_url) : null;
  const remaining = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.verification_expires_at) - now) / 1000)) : 0;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onRegisterMode(mode === 'register'); }, [mode, onRegisterMode]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => form.current?.querySelector<HTMLInputElement>('input:not([type=password])')?.focus({ preventScroll: true }), 1050);
    return () => clearTimeout(timer);
  }, [active, mode, challenge]);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  function switchMode(next: typeof mode) {
    if (submitting.current) return;
    setMode(next); setPassword(''); setCode(''); setShowPassword(false); setError(''); setNotice(''); setNeedsPhone(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || checking) return;
    submitting.current = true; setBusy(true); onBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') {
        const user = await authApi.login(login, password);
        if (mounted.current) { setPassword(''); onAuthenticated(user); }
      } else if (mode === 'register') {
        const result = await authApi.register({
          ...registration, phone: registration.phone.trim(), name: registration.name.trim(),
          username: registration.username.trim(), password,
        });
        if (mounted.current) {
          setPhone(result.user.phone.replace(/^tel:/, '')); setLogin(result.user.username);
          setChallenge(result); setNow(Date.now()); setMode('phone'); setCode(''); setPassword(''); setShowPassword(false);
        }
      } else if (challenge) {
        const user = await authApi.verifyPhone(challenge.verification_token, code);
        if (mounted.current) {
          setLogin(user.username); setChallenge(null); setMode('login'); setPassword(''); setCode(''); setNeedsPhone(false);
          setNotice('Номер подтверждён. Теперь войди с паролем.');
        }
      } else {
        const result = await authApi.resendPhone(phone.trim(), password);
        if (mounted.current) { setChallenge(result); setNow(Date.now()); setPassword(''); setCode(''); setShowPassword(false); }
      }
    } catch (caught) {
      if (mounted.current) {
        setError(friendlyError(caught));
        if (mode === 'login' && caught instanceof ApiError && caught.status === 403) setNeedsPhone(true);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  }

  return <form ref={form} className={`auth-form ${mode === 'phone' ? 'phone-verification-form' : ''}`} aria-hidden={!active} inert={!active ? true : undefined} onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy || checking} className="auth-fields">
      {mode === 'phone' ? <>
        <h1 className="verification-title">Подтвердим номер</h1>
        {challenge ? <>
          <p className="auth-description">Открой бота в Telegram и отправь свой контакт кнопкой в чате. Бот выдаст код для этого номера{phone ? `: ${phone}` : '.'}</p>
          {botUrl ? <a className="secondary glass telegram-link" href={botUrl} target="_blank" rel="noopener noreferrer">Открыть Telegram <ArrowUpRight size={18} /></a> : <p className="auth-error" role="alert">Не удалось получить ссылку на бота. Запроси новую.</p>}
          <label className="auth-field"><span>Код из Telegram</span><input aria-label="Код из Telegram" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="000000" className="verification-code" /></label>
          <p className="auth-description challenge-expiry" aria-live="off">{remaining ? `Ссылка действует ещё ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Срок ссылки истёк. Запроси новую ниже.'}</p>
        </> : <>
          <p className="auth-description">Если регистрация уже была, получи новую ссылку на бота. Нужны номер аккаунта и его пароль.</p>
          <label className="auth-field"><span>Номер телефона</span><input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+7" required maxLength={64} /></label>
        </>}
      </> : mode === 'register' ? <div className="registration-fields">
        <label className="auth-field"><span>Номер телефона</span><input type="tel" autoComplete="tel" value={registration.phone} onChange={event => setRegistration(value => ({ ...value, phone: event.target.value }))} placeholder="+7" required maxLength={64} /></label>
        <label className="auth-field"><span>Почта</span><input type="email" autoComplete="email" value={registration.email} onChange={event => setRegistration(value => ({ ...value, email: event.target.value }))} placeholder="you@example.com" required maxLength={320} /></label>
        <label className="auth-field"><span>Имя</span><input autoComplete="given-name" value={registration.name} onChange={event => setRegistration(value => ({ ...value, name: event.target.value }))} placeholder="Как тебя зовут" required maxLength={40} /></label>
        <label className="auth-field"><span>Юзернейм</span><span className="username-input"><span aria-hidden="true">@</span><input aria-label="Юзернейм без @" autoComplete="username" value={registration.username} onChange={event => setRegistration(value => ({ ...value, username: event.target.value.replace(/^@/, '') }))} placeholder="username" required maxLength={31} /></span></label>
      </div> : <label className="auth-field"><span>Логин</span><input value={login} onChange={event => { setLogin(event.target.value); setNeedsPhone(false); }} autoComplete="username" placeholder="@username, почта или телефон" required maxLength={320} /></label>}

      {!(mode === 'phone' && challenge) && <label className="auth-field"><span>Пароль</span><span className="password-input"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="••••••••••" required /><button type="button" className="icon-button" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></span></label>}
      {mode === 'login' && <button type="button" className="text-button forgot" onClick={onRecovery}>Забыли пароль?</button>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      <button className="primary auth-submit" type="submit" disabled={busy || checking || (mode === 'phone' && !!challenge && (!remaining || code.length !== 6))}>{busy ? 'Подожди…' : mode === 'register' ? 'Создать аккаунт' : mode === 'phone' ? challenge ? 'Подтвердить номер' : 'Получить ссылку на бота' : 'Войти'}</button>
      {mode === 'phone' && challenge && <button type="button" className="text-button auth-switch" onClick={() => { setChallenge(null); setCode(''); setError(''); }}>Получить новую ссылку</button>}
      {mode === 'login' && <button type="button" className={`text-button auth-switch ${needsPhone ? 'verification-needed' : ''}`} onClick={() => switchMode('phone')}>Продолжить подтверждение номера</button>}
      <button type="button" className="text-button auth-switch" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}</button>
    </fieldset>
  </form>;
}
