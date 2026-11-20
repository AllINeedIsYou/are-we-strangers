import type { Account, ProfileUpdate } from './authApi.ts';

export type ProfileDraft = { name: string; username: string; bio: string; birthday: string };
export function profileDraft(user: Account): ProfileDraft {
  return { name: user.name, username: user.username.replace(/^@/, ''), bio: user.bio ?? '', birthday: user.birthday ?? '' };
}
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function profileUpdate(user: Account, draft: ProfileDraft): ProfileUpdate {
  const previous = profileDraft(user);
  const next = { ...draft, name: draft.name.trim(), username: draft.username.trim(), bio: draft.bio.trim() };
  const patch: ProfileUpdate = {};
  if (next.name !== previous.name) patch.name = next.name;
  if (next.username !== previous.username) patch.username = next.username;
  if (draft.bio !== previous.bio) patch.bio = next.bio || null;
  if (next.birthday !== previous.birthday) patch.birthday = next.birthday || null;
  return patch;
}
export function profileError(draft: ProfileDraft): string {
  if (!draft.name.trim() || draft.name.trim().length > 40) return 'Имя должно содержать от 1 до 40 символов';
  const username = draft.username.trim();
  if (!username || username.length > 31 || username.includes('@')) return 'Введи юзернейм без @, от 1 до 31 символа';
  if (draft.bio.trim().length > 500) return 'Описание должно содержать не больше 500 символов';
  if (draft.birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.birthday) || draft.birthday > localToday())) return 'Дата рождения не может быть в будущем';
  return '';
}
export function profileBirthday(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}
