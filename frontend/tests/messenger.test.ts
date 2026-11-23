import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/authApi.ts';
import { messengerApi, type ServerMessage, type ServerMomentCard } from '../src/messengerApi.ts';
import { MessengerStore } from '../src/messengerStore.ts';

const chat = { id: 7, created_at: '2026-11-04T00:00:00Z', partner: { id: 8, name: 'Мира', username: '@Mira' }, unread_count: 0 };
const message = (id: number, sender_id = 8): ServerMessage => ({ id, chat_id: 7, sender_id, text: `text ${id}`, is_read: false, is_edited: false, reply_to_id: null, created_at: '2026-11-04T00:00:00Z' });
const tick = () => new Promise(resolve => setImmediate(resolve));
class Socket {
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  close() { this.readyState = 3; this.onclose?.(); }
  send(value: string) { this.sent.push(value); }
  event(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
function harness(api: Partial<typeof messengerApi> = {}, onDelete?: (ids: string[], signal: AbortSignal) => Promise<void>) {
  const sockets: Socket[] = [], incoming: string[] = [];
  let expired = false;
  const store = new MessengerStore(3, {
    api: { ...messengerApi, mutedChats: async () => [], archive: async () => ({ chat_ids: [], moment_ids: [], question_ids: [] }), chats: async () => [chat], messages: async () => [], pins: async () => [], ...api },
    connect: () => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; },
    onExpired: () => { expired = true; }, onIncoming: key => incoming.push(key), onDelete,
  });
  return { store, sockets, incoming, expired: () => expired };
}

test('messenger API uses cookie auth and exact search/chat/message routes', async t => {
  const calls: Array<[string, string, unknown]> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    calls.push([url, options.method!, options.body ? JSON.parse(String(options.body)) : undefined]);
    if (url.startsWith('/api/user/search')) return Response.json([chat.partner]);
    if (url.includes('/messages')) {
      if (options.method !== 'POST') return Response.json([message(11)]);
      const { reply_to_id } = JSON.parse(String(options.body));
      return Response.json({ ...message(12, 3), reply_to_id: reply_to_id ?? null });
    }
    return Response.json(options.method === 'POST' ? chat : [chat]);
  });
  await messengerApi.search('  @Mi  '); await messengerApi.chats(); await messengerApi.createChat(8);
  await messengerApi.messages(7, 12); await messengerApi.send(7, '  Keep\nformat  ');
  const reply = await messengerApi.send(7, 'Ответ', undefined, 11);
  assert.equal(reply.reply_to_id, 11);
  assert.deepEqual(calls, [
    ['/api/user/search?q=%40Mi', 'GET', undefined], ['/api/chats', 'GET', undefined],
    ['/api/chats', 'POST', { partner_id: 8 }], ['/api/chats/7/messages?before_id=12', 'GET', undefined],
    ['/api/chats/7/messages', 'POST', { text: '  Keep\nformat  ' }],
    ['/api/chats/7/messages', 'POST', { text: 'Ответ', reply_to_id: 11 }],
  ]);
});

test('malformed and wrong-chat responses are rejected before entering the UI', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ ...message(1), chat_id: 99 }]));
  await assert.rejects(messengerApi.messages(7), ApiError);
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ id: 1 }]));
  await assert.rejects(messengerApi.chats(), ApiError);
});

test('forwarding posts to the destination and preserves the original author through HTTP and WebSocket', async t => {
  const destination = { ...chat, id: 9, partner: { id: 4, name: 'Нео', username: '@neo' } };
  const original = { ...message(11), forwarded_from_name: 'Саша' };
  const copies = [
    { ...message(20, 3), chat_id: 9, text: message(10).text, forwarded_from_name: 'Мира' },
    { ...message(21, 3), chat_id: 9, text: original.text, forwarded_from_name: 'Саша' },
  ];
  let destinationHistory: ServerMessage[] = [];
  const h = harness({ chats: async () => [chat, destination], messages: async id => id === 7 ? [message(10), original] : destinationHistory });
  const request = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/chats/9/messages/forward');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(String(options.body)), { source_chat_id: 7, message_ids: [10, 11] });
    destinationHistory = copies;
    h.sockets[0].event({ type: 'message.created', message: copies[0] });
    return Response.json(copies, { status: 201 });
  });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  assert.equal(h.store.getSnapshot().state.messages.find(item => item.id === 'message-11')?.forwardedFrom, 'Саша');
  await assert.rejects(h.store.forwardMessages('server-7', 'server-9', ['message-999']), { status: 404 });
  assert.equal(await h.store.forwardMessages('server-7', 'server-9', ['message-11', 'message-10']), true);
  h.sockets[0].event({ type: 'message.created', message: copies[1] });
  assert.equal(request.mock.callCount(), 1);
  assert.deepEqual(h.store.getSnapshot().state.messages.filter(item => item.chatId === 'server-9').map(item => [item.text, item.forwardedFrom, item.own]), [
    [message(10).text, 'Мира', true], [original.text, 'Саша', true],
  ]);
  assert.equal(h.store.getSnapshot().state.chats[0].id, 'server-9');
});

test('POST plus repeated WS events produce one message; own events do not notify', async t => {
  const h = harness({ send: async () => {
    h.sockets[0].event({ type: 'message.created', message: message(10, 3) });
    return message(10, 3);
  } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  h.sockets[0].event({ type: 'connected', user_id: 3 }); await tick();
  await h.store.sendText('server-7', 'text 10');
  h.sockets[0].event({ type: 'message.created', message: message(10, 3) });
  assert.equal(h.store.getSnapshot().state.messages.length, 1);
  assert.equal(h.store.getSnapshot().state.messages[0].own, true);
  assert.deepEqual(h.incoming, []);
  h.sockets[0].event({ type: 'message.created', message: message(11) });
  h.sockets[0].event({ type: 'message.created', message: message(11) });
  assert.deepEqual(h.incoming, ['server-7']);
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 1);
});

test('older history uses the lowest ID, merges chronologically, and handles an empty page', async t => {
  const calls: Array<number | undefined> = [];
  const h = harness({ messages: async (_chat, before) => {
    calls.push(before);
    return before === undefined ? Array.from({ length: 50 }, (_, i) => message(i + 51)) : before === 51 ? [message(49), message(50)] : [];
  } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  assert.equal(h.store.getSnapshot().history['server-7'].hasOlder, true);
  await h.store.loadOlder('server-7');
  assert.equal(calls.at(-1), 51);
  assert.deepEqual(h.store.getSnapshot().state.messages.slice(0, 3).map(item => item.serverId), [49, 50, 51]);
  assert.equal(h.store.getSnapshot().history['server-7'].hasOlder, false);
  await h.store.loadOlder('server-7');
  assert.equal(calls.at(-1), 49);
  assert.equal(h.store.getSnapshot().state.messages.length, 52);
});

test('server search, direct context and forward pagination use exact authenticated GET routes', async t => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests.push(url); assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'include'); assert.equal(options.body, undefined);
    return Response.json(url.includes('/search?') ? [message(40), message(20)] : url.includes('/context') ? [message(9), message(10), message(11)] : [message(101), message(102)]);
  });
  await messengerApi.searchMessages(7, '  100% _ & море  ', 50);
  await messengerApi.messageContext(7, 10);
  await messengerApi.messagesAfter(7, 100);
  const search = new URL(requests[0], 'http://test');
  assert.equal(search.pathname, '/api/chats/7/messages/search');
  assert.equal(search.searchParams.get('q'), '100% _ & море'); assert.equal(search.searchParams.get('before_id'), '50');
  assert.equal(requests[1], '/api/chats/7/messages/10/context'); assert.equal(requests[2], '/api/chats/7/messages?after_id=100');
});

test('search and context reject foreign, duplicate, misordered and nonadvancing responses', async t => {
  for (const rows of [[message(1), message(2)], [message(2), message(2)], [{ ...message(2), chat_id: 8 }]]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(rows));
    await assert.rejects(messengerApi.searchMessages(7, 'text'), ApiError); t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json([message(9)]));
  await assert.rejects(messengerApi.messageContext(7, 10), ApiError);
  await assert.rejects(messengerApi.messagesAfter(7, 10), ApiError);
});

test('context reconnect reconciles missed edits/deletions without bridging to the latest page', async t => {
  let rows = [message(1), message(2), message(3)];
  const h = harness({
    messages: async (_chat, before) => before === undefined ? [message(100)] : rows.filter(row => row.id < before),
    messageContext: async () => rows,
  });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  await h.store.openMessageContext('server-7', 2, new AbortController().signal);
  rows = [{ ...message(2), text: 'Edited offline' }, message(3)];
  await h.store.refresh();
  assert.deepEqual(h.store.messagesForChat('server-7').map(row => row.serverId), [2, 3]);
  assert.equal(h.store.messagesForChat('server-7')[0].text, 'Edited offline');
  assert.equal(h.store.getSnapshot().history['server-7'].hasNewer, true);
});

test('search context keeps a contiguous window, pages both directions and returns directly to latest', async t => {
  let latest = 1000;
  const page = (first: number, last: number) => Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => message(first + i, 3));
  const calls: Array<number | undefined> = [];
  const h = harness({
    messages: async (_chat, before) => { calls.push(before); return before === undefined ? page(latest - 49, latest) : page(Math.max(1, before - 50), before - 1); },
    messageContext: async () => page(70, 170),
    messagesAfter: async (_chat, after) => page(after + 1, Math.min(latest, after + 50)),
  });
  t.after(() => h.store.stop()); h.store.start(); await tick(); h.store.selectChat('server-7');
  assert.equal(await h.store.openMessageContext('server-7', 120, new AbortController().signal), true);
  assert.equal(h.store.messagesForChat('server-7').length, 101);
  assert.equal(h.store.messagesForChat('server-7').at(-1)?.serverId, 170);
  assert.ok(h.store.getSnapshot().state.messages.some(row => row.serverId === 1000), 'latest cache is preserved but hidden outside context');
  await h.store.loadOlder('server-7'); assert.equal(calls.at(-1), 70);
  assert.equal(h.store.messagesForChat('server-7')[0].serverId, 20);
  await h.store.loadNewer('server-7'); assert.equal(h.store.messagesForChat('server-7').at(-1)?.serverId, 220);
  latest = 1001; h.sockets[0].event({ type: 'message.created', message: message(latest, 3) });
  assert.equal(h.store.messagesForChat('server-7').at(-1)?.serverId, 220, 'incoming message cannot bridge an unloaded gap');
  await h.store.returnToLatest('server-7');
  assert.equal(h.store.getSnapshot().history['server-7'].range, undefined);
  assert.deepEqual(h.store.messagesForChat('server-7').map(row => row.serverId), page(952, 1001).map(row => row.id));
});

test('late context responses, aborted navigation and logout cannot replace the current window', async t => {
  const pending: Array<(rows: ServerMessage[]) => void> = [];
  const h = harness({ messageContext: async () => new Promise(resolve => pending.push(resolve)) });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  const first = h.store.openMessageContext('server-7', 10, new AbortController().signal);
  const second = h.store.openMessageContext('server-7', 20, new AbortController().signal);
  pending[1]([message(20)]); assert.equal(await second, true);
  pending[0]([message(10)]); assert.equal(await first, false);
  assert.deepEqual(h.store.messagesForChat('server-7').map(row => row.serverId), [20]);
  const controller = new AbortController(); const aborted = h.store.openMessageContext('server-7', 30, controller.signal);
  controller.abort(); pending[2]([message(30)]); assert.equal(await aborted, false);
  assert.deepEqual(h.store.messagesForChat('server-7').map(row => row.serverId), [20]);
  const stopped = h.store.openMessageContext('server-7', 40, new AbortController().signal);
  h.store.stop(); pending[3]([message(40)]); assert.equal(await stopped, false);
});

test('context respects edits and deletion events that arrive before its HTTP response', async t => {
  let resolve!: (rows: ServerMessage[]) => void;
  const h = harness({ messageContext: async () => new Promise(done => { resolve = done; }) });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  const loading = h.store.openMessageContext('server-7', 10, new AbortController().signal);
  h.sockets[0].event({ type: 'message.updated', message: { ...message(10), text: 'Updated', is_edited: true } });
  h.sockets[0].event({ type: 'messages.read', reader_id: 3, chat_id: 7, message_ids: [10] });
  resolve([message(10)]); assert.equal(await loading, true);
  assert.equal(h.store.messagesForChat('server-7')[0].text, 'Updated');
  assert.equal(h.store.messagesForChat('server-7')[0].read, true);
  const deleted = h.store.openMessageContext('server-7', 11, new AbortController().signal);
  h.sockets[0].event({ type: 'messages.deleted', actor_id: 3, chat_id: 7, message_ids: [11], scope: 'self' });
  resolve([message(11)]); await assert.rejects(deleted, error => error instanceof ApiError && error.status === 404);
  assert.equal(h.store.messagesForChat('server-7').some(row => row.serverId === 11), false);
});

test('newer-page failure is explicit and a late page cannot expand another search context', async t => {
  let fail = true, finish!: (rows: ServerMessage[]) => void, calls = 0;
  const page = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => message(first + i));
  const h = harness({
    messageContext: async (_chat, id) => page(id - 50, id + 50),
    messagesAfter: async () => { calls++; if (fail) throw new ApiError(503, 'Offline'); return new Promise(resolve => { finish = resolve; }); },
  });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  await h.store.openMessageContext('server-7', 100, new AbortController().signal);
  await h.store.loadNewer('server-7'); await tick();
  assert.equal(calls, 1); assert.equal(h.store.getSnapshot().history['server-7'].newerError, 'Offline');
  assert.equal(h.store.messagesForChat('server-7').at(-1)?.serverId, 150);
  fail = false; const pending = h.store.loadNewer('server-7');
  await h.store.loadNewer('server-7'); assert.equal(calls, 2, 'duplicate pending page is ignored');
  await h.store.openMessageContext('server-7', 500, new AbortController().signal);
  finish(page(151, 200)); await pending;
  assert.deepEqual(h.store.getSnapshot().history['server-7'].range, { first: 450, last: 550, target: 500 });
});

test('resync recovers more than 50 missed messages even if a newer live event already arrived', async t => {
  let newest = 10;
  const h = harness({ messages: async (_chat, before) => {
    const last = Math.min(newest, before === undefined ? newest : before - 1);
    return Array.from({ length: Math.min(50, last) }, (_, i) => message(Math.max(1, last - 49) + i));
  } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  assert.equal(h.store.getSnapshot().state.messages.length, 10);
  newest = 141;
  h.sockets[0].event({ type: 'message.created', message: message(141) });
  await h.store.refresh();
  const ids = h.store.getSnapshot().state.messages.map(item => item.serverId);
  assert.deepEqual(ids, Array.from({ length: 141 }, (_, i) => i + 1));
  assert.deepEqual(h.incoming, ['server-7']);
});

test('a failed POST is not automatically retried and does not create a fake message', async t => {
  let sends = 0;
  const h = harness({ send: async () => { sends++; throw new ApiError(0, 'offline'); } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  await assert.rejects(h.store.sendText('server-7', 'not confirmed'), ApiError); await tick();
  assert.equal(sends, 1); assert.equal(h.store.getSnapshot().state.messages.length, 0);
  assert.equal(h.store.getSnapshot().sending['server-7'], false);
});

test('stopping closes the socket and ignores late HTTP results and live events', async () => {
  let resolve!: (chats: typeof chat[]) => void;
  const h = harness({ chats: () => new Promise(done => { resolve = done; }) });
  h.store.start(); const socket = h.sockets[0];
  h.store.stop(); resolve([chat]);
  socket.event({ type: 'message.created', message: message(10) }); await tick();
  assert.equal(socket.readyState, 3); assert.equal(h.store.getSnapshot().state.chats.length, 0);
  assert.equal(h.store.getSnapshot().state.messages.length, 0);
});

test('401 and a WebSocket belonging to a different user end the local session', async t => {
  const denied = harness({ chats: async () => { throw new ApiError(401, 'expired'); } });
  denied.store.start(); await tick(); assert.equal(denied.expired(), true);
  const mismatch = harness(); t.after(() => mismatch.store.stop());
  mismatch.store.start(); await tick(); mismatch.sockets[0].event({ type: 'connected', user_id: 99 });
  assert.equal(mismatch.expired(), true); assert.equal(mismatch.sockets[0].readyState, 3);
});

test('an event for a newly created dialog refreshes its metadata without losing the message', async t => {
  let include = false;
  const h = harness({ chats: async () => include ? [{ ...chat, unread_count: 1 }] : [], messages: async () => include ? [message(10)] : [] });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  include = true; h.sockets[0].event({ type: 'message.created', message: message(10) }); await tick();
  assert.equal(h.store.getSnapshot().state.chats[0].username, '@Mira');
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 1);
  assert.equal(h.store.getSnapshot().state.messages[0].serverId, 10);
});

test('read, edit, and batch deletion use exact implemented routes with credentials', async t => {
  const calls: Array<[string, string, unknown]> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push([url, options.method!, JSON.parse(String(options.body))]);
    assert.equal(options.credentials, 'include');
    if (options.method === 'PATCH') return Response.json({ ...message(11, 3), text: 'edited', is_edited: true });
    return Response.json(url.endsWith('/read') ? { reader_id: 3, chat_id: 7, message_ids: [11] }
      : { actor_id: 3, chat_id: 7, message_ids: [11, 12], scope: 'everyone' });
  });
  await messengerApi.read(7, [11]); await messengerApi.edit(7, 11, 'edited'); await messengerApi.delete(7, [11, 12], 'everyone');
  assert.deepEqual(calls, [
    ['/api/chats/7/read', 'POST', { message_ids: [11] }],
    ['/api/chats/7/messages/11', 'PATCH', { text: 'edited' }],
    ['/api/chats/7/messages/delete', 'DELETE', { message_ids: [11, 12], scope: 'everyone' }],
  ]);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ reader_id: 3, chat_id: 99, message_ids: [11] }));
  await assert.rejects(messengerApi.read(7, [11]), ApiError);
});

test('opening does not clear unread; read requests include incoming IDs only and deduplicate in-flight work', async t => {
  let finish!: (value: { reader_id: number; chat_id: number; message_ids: number[] }) => void;
  const calls: number[][] = [];
  const h = harness({ chats: async () => [{ ...chat, unread_count: 3 }], messages: async () => [message(1), message(2), message(3), message(4, 3)],
    read: async (_chat, ids) => { calls.push(ids); return new Promise(resolve => { finish = resolve; }); } });
  t.after(() => h.store.stop()); h.store.start(); await tick(); h.store.selectChat('server-7');
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 3);
  const first = h.store.markRead('server-7', [1, 1, 4, 99]); await h.store.markRead('server-7', [1]);
  assert.deepEqual(calls, [[1]]); finish({ reader_id: 3, chat_id: 7, message_ids: [1] }); await first;
  assert.deepEqual(h.store.getSnapshot().state.messages.map(message => message.read), [true, false, false, false]);
  h.store.selectChat(''); await h.store.markRead('server-7', [2]); assert.equal(calls.length, 1);
});

test('entry preparation reaches the oldest unread even beyond the latest 50', async t => {
  const h = harness({ chats: async () => [{ ...chat, unread_count: 75 }], messages: async (_chat, before) => {
    const last = before ? before - 1 : 100, size = Math.min(50, last);
    return Array.from({ length: size }, (_, i) => ({ ...message(last - size + i + 1), is_read: last - size + i + 1 <= 25 }));
  } });
  t.after(() => h.store.stop()); h.store.start(); await tick(); h.store.selectChat('server-7'); await h.store.prepareChat('server-7');
  assert.equal(h.store.getSnapshot().state.messages.filter(message => !message.read).length, 75);
  assert.equal(h.store.getSnapshot().state.messages.find(message => !message.read)?.serverId, 26);
});

test('read receipts and edits beat an older in-flight history response', async t => {
  let resolve!: (messages: ServerMessage[]) => void, delayed = false;
  const h = harness({ messages: async () => delayed ? new Promise(done => { resolve = done; }) : [message(1, 3), message(2, 3)] });
  t.after(() => h.store.stop()); h.store.start(); await tick(); delayed = true;
  const refresh = h.store.refresh(); await tick();
  h.sockets[0].event({ type: 'messages.read', reader_id: 8, chat_id: 7, message_ids: [1] });
  h.sockets[0].event({ type: 'message.updated', message: { ...message(2, 3), text: 'fresh edit', is_edited: true } });
  resolve([message(1, 3), message(2, 3)]); await refresh;
  assert.deepEqual(h.store.getSnapshot().state.messages.map(message => message.read), [true, false]);
  assert.equal(h.store.getSnapshot().state.messages[1].text, 'fresh edit');
});

test('repeat edits retain read state; self deletion is account-scoped and late edits cannot resurrect hidden rows', async t => {
  let text = 'text 1';
  const h = harness({ messages: async () => [{ ...message(1, 3), text }],
    edit: async (_chat, _id, next) => { text = next; return { ...message(1, 3), text, is_edited: true }; } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  h.sockets[0].event({ type: 'messages.read', reader_id: 8, chat_id: 7, message_ids: [1] });
  await h.store.editText('server-7', 'message-1', 'first'); await h.store.editText('server-7', 'message-1', 'second');
  assert.equal(h.store.getSnapshot().state.messages[0].text, 'second');
  assert.equal(h.store.getSnapshot().state.messages[0].read, true); assert.equal(h.store.getSnapshot().state.messages[0].edited, true);
  h.sockets[0].event({ type: 'messages.deleted', actor_id: 8, chat_id: 7, message_ids: [1], scope: 'self' }); await tick();
  assert.equal(h.store.getSnapshot().state.messages.length, 1);
  h.sockets[0].event({ type: 'messages.deleted', actor_id: 3, chat_id: 7, message_ids: [1], scope: 'self' }); await tick();
  h.sockets[0].event({ type: 'message.updated', message: { ...message(1, 3), text: 'late edit', is_edited: true } });
  await h.store.refresh(); assert.equal(h.store.getSnapshot().state.messages.length, 0);
});

test('incoming messages can be batch-deleted for everyone and duplicate WS/HTTP results are harmless', async t => {
  let rows = [message(1, 3), message(2), message(3)];
  const h = harness({ messages: async () => rows, delete: async (_chat, ids, scope) => {
    rows = rows.filter(row => !ids.includes(row.id));
    const result = { actor_id: 3, chat_id: 7, message_ids: ids, scope };
    h.sockets[0].event({ type: 'messages.deleted', ...result }); return result;
  } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  await h.store.deleteMessages('server-7', ['message-2'], 'everyone');
  h.sockets[0].event({ type: 'messages.deleted', actor_id: 8, chat_id: 7, message_ids: [2], scope: 'everyone' }); await tick();
  assert.deepEqual(h.store.getSnapshot().state.messages.map(row => row.serverId), [1, 3]);
});

test('resync reconciles older loaded edits and missed deletions as well as authoritative counts/order', async t => {
  let rows = Array.from({ length: 80 }, (_, i) => message(i + 1)), unread = 80, reverse = false;
  const other = { ...chat, id: 9 };
  const h = harness({ chats: async () => reverse ? [other, { ...chat, unread_count: unread }] : [{ ...chat, unread_count: unread }, other], messages: async (chatId, before) => chatId === 9 ? [] : rows.filter(row => before === undefined || row.id < before).slice(-50) });
  t.after(() => h.store.stop()); h.store.start(); await tick(); await h.store.loadOlder('server-7');
  rows = rows.filter(row => row.id !== 1 && row.id !== 80).map(row => row.id === 2 ? { ...row, text: 'offline edit', is_edited: true } : row);
  unread = 78; reverse = true; await h.store.refresh();
  const state = h.store.getSnapshot().state;
  assert.equal(state.messages.length, 78); assert.equal(state.messages[0].text, 'offline edit');
  assert.equal(state.chats[1].unread, 78); assert.deepEqual(state.chats.map(chat => chat.serverId), [9, 7]);
});

test('failed edit/deletion leave messages intact without automatically retrying mutations', async t => {
  let edits = 0, deletes = 0;
  const h = harness({ messages: async () => [message(1, 3)], edit: async () => { edits++; throw new ApiError(503, 'offline'); },
    delete: async () => { deletes++; throw new ApiError(503, 'offline'); } });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  await assert.rejects(h.store.editText('server-7', 'message-1', 'lost'));
  await assert.rejects(h.store.deleteMessages('server-7', ['message-1'], 'self')); await tick();
  assert.equal(edits, 1); assert.equal(deletes, 1); assert.equal(h.store.getSnapshot().state.messages[0].text, 'text 1');
});

test('read visibility starts at the first visible pixel above the composer, excluding own/read messages', async () => {
  const { visibleReadIds } = await import('../src/useReadTracking.ts');
  const { toMessage } = await import('../src/messengerApi.ts');
  const messages = [message(1), message(2), message(3), message(4, 3), { ...message(5), is_read: true }, message(6)].map(row => toMessage(row, 3));
  const rows = [
    { id: 'message-1', top: 20, bottom: 60 },
    { id: 'message-2', top: 65, bottom: 105 },
    { id: 'message-3', top: 790, bottom: 830 },
    { id: 'message-4', top: 110, bottom: 150 },
    { id: 'message-5', top: 155, bottom: 195 },
    { id: 'message-6', top: 200, bottom: 500 },
  ];
  assert.deepEqual(visibleReadIds(messages, rows, 64, 800), [2, 3, 6]);
  assert.deepEqual(visibleReadIds([messages[2]], [{ id: 'message-3', top: 799.5, bottom: 839.5 }], 64, 800), [3]);
  assert.deepEqual(visibleReadIds([messages[2]], [{ id: 'message-3', top: 800, bottom: 840 }], 64, 800), []);
});

test('unread decreases immediately for each visible message without waiting for read HTTP or a chat refresh', async t => {
  let reply!: (value: { reader_id: number; chat_id: number; message_ids: number[] }) => void;
  const h = harness({ chats: async () => [{ ...chat, unread_count: 13 }], messages: async () => Array.from({ length: 13 }, (_, i) => message(i + 1)),
    read: async (_chat, ids) => new Promise(resolve => { reply = value => resolve({ ...value, message_ids: ids }); }) });
  t.after(() => h.store.stop()); h.store.start(); await tick(); h.store.selectChat('server-7');
  const first = h.store.markRead('server-7', [1]);
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 12);
  assert.equal(h.store.getSnapshot().state.messages[0].read, true);
  await h.store.refresh();
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 12, 'an older server count cannot undo the pending read');
  reply({ reader_id: 3, chat_id: 7, message_ids: [1] }); await first;
  h.sockets[0].event({ type: 'messages.read', reader_id: 3, chat_id: 7, message_ids: [1] });
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 12, 'WS + HTTP must not subtract twice');
});

test('a failed read restores only unconfirmed messages and its unread count', async t => {
  let reject!: (reason: Error) => void;
  const h = harness({ chats: async () => [{ ...chat, unread_count: 2 }], messages: async () => [message(1), message(2)],
    read: async () => new Promise((_resolve, fail) => { reject = fail; }) });
  t.after(() => h.store.stop()); h.store.start(); await tick(); h.store.selectChat('server-7');
  const reading = h.store.markRead('server-7', [1, 2]); assert.equal(h.store.getSnapshot().state.chats[0].unread, 0);
  h.sockets[0].event({ type: 'messages.read', reader_id: 3, chat_id: 7, message_ids: [1] });
  reject(new ApiError(503, 'offline')); await reading;
  assert.equal(h.store.getSnapshot().state.chats[0].unread, 1);
  assert.deepEqual(h.store.getSnapshot().state.messages.map(message => message.read), [true, false]);
});

test('delete animation starts before the HTTP reply, reuses the WS confirmation, and keeps its smooth duration', async t => {
  let reply!: (value: { actor_id: number; chat_id: number; message_ids: number[]; scope: 'everyone' }) => void;
  let endAnimation!: () => void;
  let started = 0, rows = [message(1)];
  const h = harness({ messages: async () => rows, delete: async () => new Promise(resolve => { reply = resolve; }) },
    async () => { started++; await new Promise<void>(resolve => { endAnimation = resolve; }); });
  t.after(() => h.store.stop()); h.store.start(); await tick();
  const deletion = h.store.deleteMessages('server-7', ['message-1'], 'everyone'); await tick();
  assert.equal(started, 1, 'animation begins while the server reply is still pending');
  rows = [];
  const result = { actor_id: 3, chat_id: 7, message_ids: [1], scope: 'everyone' as const };
  h.sockets[0].event({ type: 'messages.deleted', ...result }); reply(result); await tick();
  assert.equal(started, 1, 'the WS echo must not start a second animation');
  assert.equal(h.store.getSnapshot().state.messages.length, 1, 'the store allows the animation to finish');
  endAnimation(); await deletion;
  assert.equal(h.store.getSnapshot().state.messages.length, 0);
});

test('delete failure cancels the preview animation and leaves the message available', async t => {
  let reject!: (error: Error) => void, cancelled = false;
  const h = harness({ messages: async () => [message(1)], delete: async () => new Promise((_resolve, fail) => { reject = fail; }) },
    async (_ids, signal) => new Promise<void>(resolve => { signal.addEventListener('abort', () => { cancelled = true; resolve(); }, { once: true }); }));
  t.after(() => h.store.stop()); h.store.start(); await tick();
  const deletion = h.store.deleteMessages('server-7', ['message-1'], 'self'); await tick();
  reject(new ApiError(503, 'offline')); await assert.rejects(deletion); await tick();
  assert.equal(cancelled, true); assert.equal(h.store.getSnapshot().state.messages.length, 1);
});

test('pins load separately from history and refresh after local or remote changes', async (t) => {
  let pinned = [message(5)];
  const calls: Array<[number, number, boolean]> = [];
  const { store, sockets } = harness({
    pins: async () => pinned,
    messages: async () => [message(100)],
    setPin: async (chatId, messageId, active) => {
      calls.push([chatId, messageId, active]);
      pinned = active ? [message(messageId), ...pinned] : pinned.filter(row => row.id !== messageId);
    },
  });
  t.after(() => store.stop());
  store.start();
  await tick();
  store.selectChat('server-7');
  await tick();
  assert.deepEqual(store.getSnapshot().pins['server-7'].map(row => row.serverId), [5]);
  assert.deepEqual(store.getSnapshot().state.messages.map(row => row.serverId), [100]);
  await store.setPin('server-7', 100, true);
  assert.deepEqual(calls, [[7, 100, true]]);
  assert.deepEqual(store.getSnapshot().pins['server-7'].map(row => row.serverId), [100, 5]);
  pinned = [message(5)];
  sockets[0].event({type: 'chat.pins_changed', chat_id: 7});
  await tick();
  assert.deepEqual(store.getSnapshot().pins['server-7'].map(row => row.serverId), [5]);
  sockets[0].event({type: 'messages.deleted', chat_id: 7, message_ids: [5], actor_id: 3, scope: 'self'});
  assert.deepEqual(store.getSnapshot().pins['server-7'], []);
});

test('moments merge matching HTTP and WebSocket cards without reverting a reply from a stale list', async t => {
  const card: ServerMomentCard = {
    moment: { id: 51, chat_id: 7, author_id: 8, created_at: chat.created_at, reason: 'Наш разговор', response: null },
    messages: [
      { moments_id: 51, source_message_id: 10, author_name: 'Мира', text: 'Первая копия', message_created_at: chat.created_at },
      { moments_id: 51, source_message_id: 11, author_name: 'Саша', text: 'Вторая копия', message_created_at: chat.created_at },
    ],
  };
  const updated = { ...card, moment: { ...card.moment, response: 'Помню' } };
  const calls: Array<[string, string, unknown]> = [];
  const h = harness({ messages: async () => [message(10), message(11)] });
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    calls.push([path, options.method!, options.body ? JSON.parse(String(options.body)) : undefined]);
    if (options.method === 'GET') {
      h.sockets[0].event({ type: 'moment.updated', card: updated });
      return Response.json([card]);
    }
    if (path.endsWith('/reply')) {
      h.sockets[0].event({ type: 'moment.updated', card: updated });
      return Response.json(updated);
    }
    h.sockets[0].event({ type: 'moment.created', card });
    return Response.json(card, { status: 201 });
  });
  t.after(() => h.store.stop());
  h.store.start(); await tick();
  assert.equal(await h.store.createMoment('server-7', ['message-11', 'message-10'], card.moment.reason), true);
  assert.equal(await h.store.replyToMoment('server-7', card.moment.id, 'Помню'), true);
  await h.store.loadMoments('server-7');
  h.sockets[0].event({ type: 'moment.created', card });
  const moments = h.store.getSnapshot().state.moments;
  assert.equal(moments.length, 1);
  assert.equal(moments[0].response, 'Помню');
  assert.deepEqual(moments[0].messages?.map(item => item.authorName), ['Мира', 'Саша']);
  assert.deepEqual(calls, [
    ['/api/chats/7/moments', 'POST', { message_ids: [10, 11], reason: card.moment.reason }],
    ['/api/chats/7/moments/51/reply', 'POST', { response: 'Помню' }],
    ['/api/chats/7/moments', 'GET', undefined],
  ]);
});
