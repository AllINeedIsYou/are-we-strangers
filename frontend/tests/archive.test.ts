import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveStore, emptyArchive } from '../src/archiveStore.ts';
import { ApiError } from '../src/authApi.ts';
import { messengerApi, type ArchiveChange, type ServerArchive } from '../src/messengerApi.ts';
import { MessengerStore } from '../src/messengerStore.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const change = (archived: boolean): ArchiveChange => ({ chat_id: 7, item_type: 'moment', item_id: 19, archived });

test('archive API uses exact authenticated routes and rejects mismatched success payloads', async t => {
  const calls: [string, string, unknown][] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    calls.push([url, options.method!, body]);
    if (options.method === 'GET') return Response.json({ chat_ids: [7], moment_ids: [19], question_ids: [4] });
    const kind = url.includes('/moments/') ? 'moment' : url.includes('/future-questions/') ? 'question' : 'chat';
    return Response.json({ chat_id: 7, item_type: kind, item_id: kind === 'chat' ? 7 : kind === 'moment' ? 19 : 4, archived: body.archived });
  });
  await messengerApi.archive();
  await messengerApi.setArchived(7, 'chat', 7, true);
  await messengerApi.setArchived(7, 'moment', 19, false);
  await messengerApi.setArchived(7, 'question', 4, true);
  assert.deepEqual(calls, [
    ['/api/archive', 'GET', undefined], ['/api/chats/7/archive', 'PATCH', { archived: true }],
    ['/api/chats/7/moments/19/archive', 'PATCH', { archived: false }],
    ['/api/chats/7/future-questions/4/archive', 'PATCH', { archived: true }],
  ]);
  for (const bad of [{ ...change(true), chat_id: 8 }, { ...change(true), item_id: 20 }, { ...change(true), item_type: 'question' }, change(false)]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(bad));
    await assert.rejects(messengerApi.setArchived(7, 'moment', 19, true), ApiError);
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ chat_ids: [0], moment_ids: [], question_ids: [] }));
  await assert.rejects(messengerApi.archive(), ApiError);
});

test('an archive event beats an earlier GET; a queued refresh recovers missed records', async t => {
  const first = deferred<ServerArchive>(), next = deferred<ServerArchive>();
  let calls = 0;
  const store = new ArchiveStore({ archive: () => ++calls === 1 ? first.promise : next.promise, setArchived: async () => change(true) }, () => assert.fail('expired'));
  t.after(() => store.stop()); store.start();
  store.receive({ type: 'archive.changed', ...change(true) });
  first.resolve(emptyArchive()); await tick();
  assert.deepEqual(store.getSnapshot().data?.moment_ids, [19]);
  assert.equal(calls, 2);
  next.resolve({ chat_ids: [9], moment_ids: [19], question_ids: [4] }); await tick();
  assert.deepEqual(store.getSnapshot().data, { chat_ids: [9], moment_ids: [19], question_ids: [4] });
});

test('a late PATCH cannot undo a newer archive event from another device', async t => {
  const pending = deferred<ArchiveChange>();
  const store = new ArchiveStore({ archive: async () => emptyArchive(), setArchived: () => pending.promise }, () => assert.fail('expired'));
  t.after(() => store.stop()); store.start(); await tick();
  const write = store.set(7, 'moment', 19, true);
  store.receive(change(false)); await tick();
  pending.resolve(change(true)); await write; await tick();
  assert.deepEqual(store.getSnapshot().data?.moment_ids, []);
  assert.equal(store.getSnapshot().busy['moment-19'], false);
});

test('failed archive writes preserve records and are never automatically retried', async t => {
  let writes = 0;
  const store = new ArchiveStore({ archive: async () => ({ chat_ids: [], moment_ids: [19], question_ids: [] }), setArchived: async () => { writes++; throw new ApiError(500, 'failure'); } }, () => assert.fail('expired'));
  t.after(() => store.stop()); store.start(); await tick();
  await assert.rejects(store.set(7, 'moment', 19, false), ApiError); await tick();
  assert.deepEqual(store.getSnapshot().data?.moment_ids, [19]);
  assert.equal(store.getSnapshot().busy['moment-19'], false);
  assert.equal(writes, 1);
});

test('duplicate in-flight writes are ignored and logout blocks late archive results and events', async () => {
  const pending = deferred<ArchiveChange>();
  let writes = 0;
  const store = new ArchiveStore({ archive: async () => emptyArchive(), setArchived: () => { writes++; return pending.promise; } }, () => assert.fail('expired'));
  store.start(); await tick();
  const request = store.set(7, 'moment', 19, true);
  assert.equal(await store.set(7, 'moment', 19, true), false);
  assert.equal(writes, 1);
  store.stop(); pending.resolve(change(true));
  assert.equal(await request, false);
  store.receive(change(true));
  assert.deepEqual(store.getSnapshot().data?.moment_ids, []);
});

test('archive 401 expires the session; ordinary loading errors do not become a fake empty archive', async () => {
  let expired = 0;
  const store = new ArchiveStore({ archive: async () => { throw new ApiError(503, 'offline'); }, setArchived: async () => change(true) }, () => { expired++; });
  store.start(); await tick();
  assert.equal(store.getSnapshot().data, null); assert.ok(store.getSnapshot().error); assert.equal(expired, 0);
  store.stop();
  const denied = new ArchiveStore({ archive: async () => { throw new ApiError(401, 'expired'); }, setArchived: async () => change(true) }, () => { expired++; });
  denied.start(); await tick(); denied.stop(); assert.equal(expired, 1);
});

test('messenger forwards archive events to its account store and refreshes on reconnection', async t => {
  const socket = { readyState: 1, onmessage: null as null | ((event: { data: string }) => void), onclose: null, onerror: null, close() {}, send() {} };
  let data = emptyArchive(), loads = 0;
  const store = new MessengerStore(1, { api: { ...messengerApi, mutedChats: async () => [], archive: async () => { loads++; return structuredClone(data); }, chats: async () => [], messages: async () => [] }, connect: () => socket as unknown as WebSocket, onExpired() {}, onIncoming() {} });
  t.after(() => store.stop()); store.start(); await tick();
  data = { chat_ids: [], moment_ids: [19], question_ids: [] };
  socket.onmessage?.({ data: JSON.stringify({ type: 'archive.changed', ...change(true) }) }); await tick();
  assert.deepEqual(store.archives.getSnapshot().data?.moment_ids, [19]);
  const before = loads; data = emptyArchive(); store.reconnect(); await tick();
  assert.ok(loads > before); assert.deepEqual(store.archives.getSnapshot().data?.moment_ids, []);
});

test('a burning card stays visible through its own WS and GET until the transition finishes', async t => {
  const effect = deferred<void>();
  let data = emptyArchive();
  const store = new ArchiveStore({ archive: async () => structuredClone(data), setArchived: async () => { data.moment_ids = [19]; store.receive(change(true)); return change(true); } }, () => assert.fail('expired'));
  t.after(() => store.stop()); store.start(); await tick();
  const writing = store.set(7, 'moment', 19, true, () => effect.promise);
  await tick();
  assert.deepEqual(store.getSnapshot().data?.moment_ids, []);
  assert.equal(store.getSnapshot().busy['moment-19'], true);
  effect.resolve(); assert.equal(await writing, true);
  assert.deepEqual(store.getSnapshot().data?.moment_ids, [19]);
});

test('failed writes cancel the burn and preserve the source record', async t => {
  let aborted = false;
  const store = new ArchiveStore({ archive: async () => ({ chat_ids: [], moment_ids: [19], question_ids: [] }), setArchived: async () => { throw new ApiError(503, 'offline'); } }, () => assert.fail('expired'));
  t.after(() => store.stop()); store.start(); await tick();
  await assert.rejects(store.set(7, 'moment', 19, false, signal => new Promise(resolve => {
    signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
  })), ApiError);
  assert.equal(aborted, true);
  assert.deepEqual(store.getSnapshot().data?.moment_ids, [19]);
});

test('logout cancels an active burn and prevents late confirmation from affecting a new session', async () => {
  let aborted = false;
  const store = new ArchiveStore({ archive: async () => emptyArchive(), setArchived: async () => change(true) }, () => assert.fail('expired'));
  store.start(); await tick();
  const writing = store.set(7, 'moment', 19, true, signal => new Promise(resolve => {
    signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
  }));
  await tick(); store.stop();
  assert.equal(await writing, false); assert.equal(aborted, true);
});
