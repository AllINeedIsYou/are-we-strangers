import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, authApi, friendlyError, type Account } from './authApi';
import { localToday, profileDraft, profileError, profileUpdate, type ProfileDraft } from './profile';

export default function ProfileEditor({ user, onUpdate, onExpired }: { user: Account; onUpdate: (user: Account) => void; onExpired: () => void }) {
  const [saved, setSaved] = useState(user);
  const [draft, setDraft] = useState(() => profileDraft(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const changed = Object.keys(profileUpdate(saved, draft)).length > 0;
  function change(field: keyof ProfileDraft, value: string) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setError(''); setSuccess(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (request.current || !changed) return;
    const validation = profileError(draft);
    if (validation) { setError(validation); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setSuccess(false);
    try {
      const updated = await authApi.updateProfile(user.id, profileUpdate(saved, draft), controller.signal);
      if (controller.signal.aborted) return;
      setSaved(updated); setDraft(profileDraft(updated)); setSuccess(true); onUpdate(updated);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) onExpired();
      else setError(friendlyError(caught));
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }
  return <form className="profile-editor stack-form" onSubmit={event => { void submit(event); }} aria-label="Редактирование профиля" aria-busy={busy}>
    <fieldset disabled={busy} className="auth-fields">
      <label>Имя<input aria-label="Имя" name="name" autoComplete="name" required maxLength={40} value={draft.name} onChange={event => change('name', event.target.value)} /></label>
      <label>Юзернейм<span className="profile-username-input"><span aria-hidden="true">@</span><input aria-label="Юзернейм" name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={31} value={draft.username} onChange={event => change('username', event.target.value)} /></span></label>
      <label>О себе<textarea aria-label="О себе" name="bio" maxLength={500} rows={3} value={draft.bio} onChange={event => change('bio', event.target.value)} placeholder="Расскажи немного о себе" /></label>
      <label>Дата рождения<span className="profile-birthday-input"><input aria-label="Дата рождения" name="birthday" type="date" max={localToday()} value={draft.birthday} onChange={event => change('birthday', event.target.value)} />{draft.birthday && <button type="button" className="text-button" onClick={() => change('birthday', '')}>Очистить</button>}</span></label>
    </fieldset>
    {error && <p id="profile-save-error" className="auth-error" role="alert">{error}</p>}
    {success && <p className="auth-success" role="status">Профиль сохранён</p>}
    <button className="primary" type="submit" disabled={busy || !changed} aria-describedby={error ? 'profile-save-error' : undefined}>{busy ? 'Сохраняем…' : 'Сохранить изменения'}</button>
  </form>;
}
