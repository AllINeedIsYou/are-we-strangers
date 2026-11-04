import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, authApi, telegramLink } from '../src/authApi.ts';

const account = {
  id: 42, name: 'Алекс', username: '@Alex', email: 'alex@example.com', phone: 'tel:+7-999-123-45-67',
  created_at: '2026-11-01T00:00:00Z', phone_verified_at: '2026-11-01T00:00:00Z', email_verified_at: null,
};

test('login uses the cookie session, preserves username case and password, and trims only login', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/auth/login');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'include');
    assert.deepEqual(JSON.parse(String(options.body)), { login: '@Alex', password: 'KeepMyCase!' });
    assert.equal((options.headers as Record<string, string>)['Content-Type'], 'application/json');
    return Response.json(account);
  });
  assert.deepEqual(await authApi.login('  @Alex  ', 'KeepMyCase!'), account);
});

test('registration and phone confirmation use the existing FastAPI contract', async t => {
  const challenge = { verification_token: 'test-token', verification_expires_at: '2026-11-01T01:00:00Z', telegram_url: 'https://t.me/test_bot?start=test-token' };
  const requests: Array<{ url: string; body: unknown }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(options.body)) });
    assert.equal(options.credentials, 'include');
    return Response.json(url.endsWith('/register') ? { ...challenge, user: account } : url.endsWith('/verify-phone') ? account : challenge);
  });
  const input = { phone: '+79991234567', email: 'alex@example.com', name: 'Алекс', username: 'Alex', password: 'secret' };
  await authApi.register(input);
  await authApi.verifyPhone('test-token', '123456');
  await authApi.resendPhone(input.phone, input.password);
  assert.deepEqual(requests, [
    { url: '/api/auth/register', body: input },
    { url: '/api/auth/verify-phone', body: { verification_token: 'test-token', code: '123456' } },
    { url: '/api/auth/resend-phone-verification', body: { phone: input.phone, password: input.password } },
  ]);
});

test('session restoration does not send a JSON body and logout accepts an empty 204 response', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.body, undefined);
    assert.equal(options.credentials, 'include');
    if (url.endsWith('/logout')) { assert.equal(options.method, 'POST'); return new Response(null, { status: 204 }); }
    assert.equal(options.method, 'GET');
    return Response.json(account);
  });
  assert.deepEqual(await authApi.me(), account);
  assert.equal(await authApi.logout(), undefined);
});

test('API errors retain status so invalid credentials and an unavailable server remain distinct', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Неверный логин или пароль' }, { status: 401 }));
  await assert.rejects(authApi.login('@Alex', 'incorrect'), error => error instanceof ApiError && error.status === 401 && error.message === 'Неверный логин или пароль');
});

test('validation errors become field messages without reflecting submitted secrets', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: [
    { loc: ['body', 'password'], type: 'value_error', msg: 'Value error, Пароль не должен содержать пробелы', input: 'PRIVATE PASSWORD' },
    { loc: ['body', 'email'], type: 'value_error', msg: 'value is not a valid email address', input: 'PRIVATE EMAIL' },
  ] }, { status: 422 }));
  await assert.rejects(authApi.login('@Alex', 'secret'), error => {
    assert.ok(error instanceof ApiError);
    assert.match(error.message, /Пароль не должен содержать пробелы/);
    assert.match(error.message, /Проверь адрес почты/);
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
});

test('email requests require the existing cookie and confirmation sends only the link token', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    assert.equal(options.method, 'POST');
    if (url.endsWith('/request-email-verification')) {
      assert.equal(options.body, undefined);
      return Response.json({ expires_at: '2026-11-01T01:00:00Z' });
    }
    assert.equal(url, '/api/auth/verify-email');
    assert.deepEqual(JSON.parse(String(options.body)), { token: 'email-token' });
    return Response.json({ ...account, email_verified_at: '2026-11-01T00:10:00Z' });
  });
  await authApi.requestEmail();
  assert.ok((await authApi.verifyEmail('email-token')).email_verified_at);
});

test('a malformed successful response cannot authenticate a user', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  await assert.rejects(authApi.login('@Alex', 'secret'), error => error instanceof ApiError);
});

test('network failures are reported separately and abort signals remain usable for session cleanup', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network unavailable'); });
  await assert.rejects(authApi.me(), error => error instanceof ApiError && error.status === 0);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(authApi.me(abort.signal), error => error instanceof TypeError);
});

test('only HTTPS links on the actual Telegram host can open the verification bot', () => {
  assert.equal(telegramLink('https://t.me/test_bot?start=abc'), 'https://t.me/test_bot?start=abc');
  for (const value of ['javascript:alert(1)', 'https://t.me.evil.example/bot', 'http://t.me/bot', 'https://me@t.me/bot', 'not a URL']) assert.equal(telegramLink(value), null);
});
