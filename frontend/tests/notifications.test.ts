import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/authApi.ts';
import { messengerApi, type ChatNotifications } from '../src/messengerApi.ts';
import { NotificationStore } from '../src/notificationStore.ts';
import { MessengerStore } from '../src/messengerStore.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('notification API uses cookie-authenticated GET/PATCH and validates response identity', async t => {
  const calls: Array<{ url: string; body: unknown }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    calls.push({ url, body: options.body ? JSON.parse(String(options.body)) : undefined });
    if (options.method === 'GET') return Response.json({ chat_ids: [12, 7, 7] });
    assert.equal(options.method, 'PATCH'); return Response.json({ chat_id: 7, muted: true });
  });
  assert.deepEqual(await messengerApi.mutedChats(), [7, 12]);
  assert.deepEqual(await messengerApi.setChatNotifications(7, true), { chat_id: 7, muted: true });
  assert.deepEqual(calls, [
    { url: '/api/user/me/muted-chats', body: undefined },
    { url: '/api/chats/7/notifications', body: { muted: true } },
  ]);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ chat_id: 8, muted: true }));
  await assert.rejects(messengerApi.setChatNotifications(7, true), ApiError);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ chat_ids: [0] }));
  await assert.rejects(messengerApi.mutedChats(), ApiError);
});

test('unknown settings suppress alerts until loaded; muted and unmuted chats stay distinct', async t => {
  const read = deferred<number[]>();
  const store = new NotificationStore({ mutedChats: async () => read.promise, setChatNotifications: async (chat_id, muted) => ({ chat_id, muted }) }, () => {});
  t.after(() => store.stop()); store.start();
  assert.equal(store.canNotify(7), false);
  assert.equal(await store.set(7, true), false);
  read.resolve([7]); await tick();
  assert.equal(store.canNotify(7), false); assert.equal(store.canNotify(12), true);
});

test('an event beats an earlier list response and queues a fresh server read', async t => {
  const first = deferred<number[]>(); let reads = 0;
  const store = new NotificationStore({ mutedChats: async () => ++reads === 1 ? first.promise : [7], setChatNotifications: async (chat_id, muted) => ({ chat_id, muted }) }, () => {});
  t.after(() => store.stop()); store.start();
  store.receive({ chat_id: 7, muted: true }); first.resolve([]); await tick();
  assert.deepEqual(store.getSnapshot().chatIds, [7]); assert.equal(reads, 2);
});

test('a late PATCH cannot undo a newer event, and pending writes are not duplicated', async t => {
  let server: number[] = [], writes = 0;
  const pending = deferred<ChatNotifications>();
  const store = new NotificationStore({ mutedChats: async () => server, setChatNotifications: async () => { writes++; return pending.promise; } }, () => {});
  t.after(() => store.stop()); store.start(); await tick();
  const write = store.set(7, true); assert.equal(await store.set(7, true), false); assert.equal(writes, 1);
  server = [7]; store.receive({ chat_id: 7, muted: true }); await tick();
  server = []; store.receive({ chat_id: 7, muted: false }); await tick();
  pending.resolve({ chat_id: 7, muted: true }); assert.equal(await write, true); await tick();
  assert.deepEqual(store.getSnapshot().chatIds, []); assert.equal(store.getSnapshot().busy[7], false);
});

test('failed writes keep the previous setting, expose an error and never automatically retry PATCH', async t => {
  let writes = 0;
  const store = new NotificationStore({ mutedChats: async () => [], setChatNotifications: async () => { writes++; throw new ApiError(503, 'Ошибка сохранения'); } }, () => {});
  t.after(() => store.stop()); store.start(); await tick();
  assert.equal(await store.set(7, true), false); await tick();
  assert.deepEqual(store.getSnapshot().chatIds, []);
  assert.equal(store.getSnapshot().errors[7], 'Ошибка сохранения'); assert.equal(writes, 1);
  await store.retry(); assert.equal(store.getSnapshot().errors[7], undefined);
});

test('loading errors are not interpreted as enabled notifications; 401 expires the account', async t => {
  let expired = 0;
  const store = new NotificationStore({ mutedChats: async () => { throw new ApiError(503, 'Offline'); }, setChatNotifications: async () => { throw new ApiError(401, 'Expired'); } }, () => expired++);
  t.after(() => store.stop()); store.start(); await tick();
  assert.equal(store.getSnapshot().chatIds, null); assert.equal(store.canNotify(7), false);
  assert.equal(store.getSnapshot().error, 'Offline');
  const authenticated = new NotificationStore({ mutedChats: async () => [], setChatNotifications: async () => { throw new ApiError(401, 'Expired'); } }, () => expired++);
  t.after(() => authenticated.stop()); authenticated.start(); await tick();
  await authenticated.set(7, true); assert.equal(expired, 1);
});

test('logout ignores late results and a new account does not inherit mute state', async t => {
  const pending = deferred<ChatNotifications>();
  const old = new NotificationStore({ mutedChats: async () => [7], setChatNotifications: async () => pending.promise }, () => {});
  old.start(); await tick(); const write = old.set(7, false); old.stop();
  pending.resolve({ chat_id: 7, muted: false }); assert.equal(await write, false);
  old.receive({ chat_id: 12, muted: true }); assert.deepEqual(old.getSnapshot().chatIds, [7]);
  const current = new NotificationStore({ mutedChats: async () => [], setChatNotifications: async (chat_id, muted) => ({ chat_id, muted }) }, () => {});
  t.after(() => current.stop()); current.start(); await tick(); assert.deepEqual(current.getSnapshot().chatIds, []);
});

test('messenger refreshes notification settings and still receives messages in muted chats', async t => {
  let reads = 0, incoming = 0;
  const socket = { readyState: 1, onmessage: null as null | ((event: { data: string }) => void), onclose: null, onerror: null, close() {}, send() {} };
  const store = new MessengerStore(1, {
    api: { ...messengerApi, mutedChats: async () => { reads++; return [7]; }, archive: async () => ({ chat_ids: [], moment_ids: [], question_ids: [] }), chats: async () => [{ id: 7, created_at: '2026-11-01T00:00:00Z', unread_count: 0, partner: { id: 2, name: 'Мира', username: '@mira' } }], messages: async () => [], pins: async () => [] },
    connect: () => socket as unknown as WebSocket, onExpired() {}, onIncoming() { incoming++; },
  });
  t.after(() => store.stop()); store.start(); await tick();
  socket.onmessage?.({ data: JSON.stringify({ type: 'connected', user_id: 1 }) }); await tick();
  socket.onmessage?.({ data: JSON.stringify({ type: 'chat.notifications_changed', chat_id: 7, muted: true }) }); await tick();
  assert.equal(store.notifications.canNotify(7), false);
  socket.onmessage?.({ data: JSON.stringify({ type: 'message.created', message: { id: 10, chat_id: 7, sender_id: 2, text: 'Still delivered', is_read: false, is_edited: false, reply_to_id: null, created_at: '2026-11-01T00:01:00Z' } }) });
  assert.equal(store.messagesForChat('server-7')[0].text, 'Still delivered'); assert.equal(store.getSnapshot().state.chats[0].unread, 1); assert.equal(incoming, 1);
  const before = reads; store.reconnect(); await tick(); assert.ok(reads > before);
});
