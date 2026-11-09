import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAccountSwitch } from '../dev/accountSwitch.ts';

const original = 'original_session_token_for_test';
const neo = 'neo_session_token_for_test';
const owner = { id: 10, name: 'Алекс', username: '@AllINeedIsYou' };
const partner = { id: 3, name: 'Нео', username: '@neo' };
async function fixture(t: Parameters<Parameters<typeof test>[1]>[0], target = 'http://127.0.0.1:8000') {
  let logins = 0;
  const switching = createAccountSwitch({ target, username: '@neo', primaryUsername: '@AllINeedIsYou', password: 'fixture-password', fetcher: async (url, init) => {
    if (String(url).endsWith('/login')) {
      logins++;
      assert.deepEqual(JSON.parse(String(init?.body)), { login: '@neo', password: 'fixture-password' });
      return Response.json(partner, { headers: { 'Set-Cookie': `session_token=${neo}; HttpOnly; Path=/; SameSite=Lax` } });
    }
    const value = (init?.headers as Record<string, string>).Cookie;
    return value === `session_token=${original}` ? Response.json(owner) : value === `session_token=${neo}` ? Response.json(partner) : Response.json({}, { status: 401 });
  } });
  const server = createServer((req, res) => { void switching.middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => { switching.clear(); server.closeAllConnections(); server.close(); });
  const request = (token: string, nonce = '', method = 'POST', crossOrigin = false) => fetch(`${origin}/__dev__/account-switch`, {
    method, headers: { Origin: crossOrigin ? 'http://another.example' : origin, 'X-AWS-Dev-Switch': '1', Cookie: `session_token=${token}${nonce ? `; aws_dev_switch=${nonce}` : ''}` },
  });
  return { request, logins: () => logins };
}

test('one-button switching preserves the original session and reuses the Neo session', async t => {
  const h = await fixture(t);
  const concurrent = await Promise.all([h.request(original, '', 'GET'), h.request(original, '', 'GET')]);
  assert.ok(concurrent.every(response => response.status === 200));
  let response = await h.request(original, '', 'GET');
  assert.deepEqual(await response.json(), { enabled: true, target: '@neo' });
  response = await h.request(original);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { user: partner });
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.every(value => value.includes('HttpOnly')));
  assert.ok(cookies.some(value => value.startsWith(`session_token=${neo};`)));
  const nonce = cookies.find(value => value.startsWith('aws_dev_switch='))!.split(';')[0].split('=')[1];
  response = await h.request(neo, nonce, 'GET');
  assert.deepEqual(await response.json(), { enabled: true, target: '@AllINeedIsYou' });
  response = await h.request(neo, nonce);
  assert.deepEqual(await response.json(), { user: owner });
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith(`session_token=${original};`)));
  response = await h.request(original, nonce);
  assert.deepEqual(await response.json(), { user: partner });
  assert.equal(h.logins(), 1);
});

test('cross-origin switching and invalid sessions are rejected', async t => {
  const h = await fixture(t);
  assert.equal((await h.request(original, '', 'POST', true)).status, 403);
  assert.equal((await h.request('invalid_session_token_for_test')).status, 401);
  assert.equal(h.logins(), 0);
});

test('a lost pairing cannot be used to access someone else’s original session', async t => {
  const h = await fixture(t);
  assert.equal((await h.request(neo, 'unknown-nonce')).status, 409);
  assert.equal(h.logins(), 0);
});

test('the temporary helper is disabled for nonlocal API targets', async t => {
  const h = await fixture(t, 'https://api.example.com');
  assert.equal((await h.request(original)).status, 404);
  assert.equal(h.logins(), 0);
});
