import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, authApi, type Account } from '../src/authApi.ts';
import { profileDraft, profileUpdate, profileError, profileBirthday } from '../src/profile.ts';
import { toChat } from '../src/messengerApi.ts';

const account: Account = { id: 1, name: 'Алекс', username: '@Alex', bio: 'Описание', birthday: '2000-05-12',
  email: 'alex@example.com', phone: '+79991234567', created_at: '2026-11-01T00:00:00Z', phone_verified_at: null, email_verified_at: null };

test('profile patches preserve untouched fields and distinguish clearing from omission', () => {
  const draft = profileDraft(account);
  assert.deepEqual(profileUpdate(account, draft), {});
  assert.deepEqual(profileUpdate(account, { ...draft, name: '  Саша  ' }), { name: 'Саша' });
  assert.deepEqual(profileUpdate(account, { ...draft, bio: '  ', birthday: '' }), { bio: null, birthday: null });
  assert.deepEqual(profileUpdate(account, { ...draft, username: '  NewName  ' }), { username: 'NewName' });
  const spaced = { ...account, bio: '  Старое описание  ' };
  assert.deepEqual(profileUpdate(spaced, { ...profileDraft(spaced), name: 'Саша' }), { name: 'Саша' });
  assert.equal(profileError({ ...draft, name: '  ' }), 'Имя должно содержать от 1 до 40 символов');
  assert.ok(profileError({ ...draft, birthday: '2999-01-01' }));
});

test('profile update uses PATCH with cookie auth and preserves null values', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/user/me'); assert.equal(options.method, 'PATCH'); assert.equal(options.credentials, 'include');
    assert.deepEqual(JSON.parse(String(options.body)), { bio: null, birthday: null });
    return Response.json({ ...account, bio: null, birthday: null });
  });
  assert.equal((await authApi.updateProfile(1, { bio: null, birthday: null })).bio, null);
});

test('profile conflicts remain actionable and responses for another account are rejected', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'username уже занят' }, { status: 409 }));
  await assert.rejects(authApi.updateProfile(1, { username: 'Other' }), error => error instanceof ApiError && error.status === 409);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...account, id: 2 }));
  await assert.rejects(authApi.updateProfile(1, { name: 'New' }), /другого аккаунта/);
});

test('public profile fields reach the contact card without timezone shifts or private email', () => {
  const chat = toChat({ id: 7, created_at: account.created_at, unread_count: 0, partner: account });
  assert.equal(chat.bio, 'Описание'); assert.equal(chat.birthday, '2000-05-12');
  assert.equal(profileBirthday(chat.birthday), '12.05.2000');
  assert.equal('email' in chat, false);
  const cleared = toChat({ id: 7, created_at: account.created_at, unread_count: 0, partner: { ...account, bio: null, birthday: null } });
  assert.equal(cleared.bio, undefined); assert.equal(cleared.birthday, undefined);
});
