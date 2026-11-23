import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/authApi.ts';
import { messengerApi, type ServerChapter } from '../src/messengerApi.ts';
import { MessengerStore } from '../src/messengerStore.ts';
import { chapterBoundaries, chapterWindow, completedChapterMinutes, placeChapterBoundaries, recordsInChapter } from '../src/chapterTimeline.ts';
import type { Chat, Message } from '../src/domain.ts';

const created = '2026-11-01T12:00:00Z';
const proposed = '2026-11-02T12:00:00Z';
const accepted = '2026-11-04T12:00:00Z';
const chapter: ServerChapter = { id: 10, chat_id: 7, author_id: 8, title: 'Чуть ближе', status: 'pending', created_at: proposed, started_at: null };
const acceptedChapter: ServerChapter = { ...chapter, status: 'accepted', started_at: accepted };
const chat = { id: 7, created_at: created, partner: { id: 8, name: 'Мира', username: '@mira' }, unread_count: 0 };
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(overrides: Partial<typeof messengerApi> = {}) {
  const socket = { readyState: 1, onmessage: null as null | ((event: { data: string }) => void), onclose: null, onerror: null, close() {}, send() {} };
  const store = new MessengerStore(3, {
    api: { ...messengerApi, archive: async () => ({ chat_ids: [], moment_ids: [], question_ids: [] }), chats: async () => [chat], messages: async () => [], pins: async () => [], chapters: async () => [chapter], ...overrides },
    connect: () => socket as unknown as WebSocket,
    onExpired() {}, onIncoming() {},
  });
  return { store, event: (event: unknown) => socket.onmessage?.({ data: JSON.stringify(event) }) };
}

test('chapter API uses the implemented GET/POST/PATCH contract and rejects foreign or inconsistent cards', async t => {
  const calls: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'include');
    calls.push([url, options.method, options.body ? JSON.parse(String(options.body)) : undefined]);
    return Response.json(options.method === 'GET' ? [chapter] : options.method === 'POST' ? chapter : acceptedChapter);
  });
  await messengerApi.chapters(7);
  await messengerApi.createChapter(7, chapter.title);
  await messengerApi.decideChapter(7, 10, 'accepted');
  assert.deepEqual(calls, [
    ['/api/chats/7/chapters', 'GET', undefined],
    ['/api/chats/7/chapters', 'POST', { title: chapter.title }],
    ['/api/chats/7/chapters/10', 'PATCH', { status: 'accepted' }],
  ]);
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ ...chapter, chat_id: 9 }]));
  await assert.rejects(messengerApi.chapters(7), ApiError);
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ ...acceptedChapter, started_at: null }]));
  await assert.rejects(messengerApi.chapters(7), ApiError);
});

test('a delayed list or creation reply cannot revert a chapter decision or duplicate the card', async t => {
  let resolveList!: (cards: ServerChapter[]) => void;
  const h = harness({
    chapters: () => new Promise(resolve => { resolveList = resolve; }),
    decideChapter: async () => acceptedChapter,
    createChapter: async () => chapter,
  });
  t.after(() => h.store.stop());
  h.store.start(); await tick();
  const loading = h.store.loadChapters('server-7');
  assert.equal(await h.store.decideChapter('server-7', 10, 'accepted'), true);
  resolveList([chapter]); await loading;
  assert.equal(await h.store.createChapter('server-7', chapter.title), true);
  assert.deepEqual(h.store.getSnapshot().chapters['server-7']?.cards, [acceptedChapter]);
});

test('chapter WS events queue a new GET during an in-flight list, while stopped stores ignore late responses', async t => {
  const pending: ((cards: ServerChapter[]) => void)[] = [];
  const h = harness({ chapters: () => new Promise(resolve => pending.push(resolve)) });
  t.after(() => h.store.stop());
  h.store.start(); await tick();
  const loading = h.store.loadChapters('server-7');
  h.event({ type: 'chapter.updated', chat_id: 7, chapter_id: 10 });
  pending.shift()!([chapter]); await loading;
  assert.equal(pending.length, 1);
  pending.shift()!([acceptedChapter]); await tick();
  assert.deepEqual(h.store.getSnapshot().chapters['server-7']?.cards, [acceptedChapter]);
  const late = h.store.loadChapters('server-7');
  h.store.stop();
  const previous = h.store.getSnapshot();
  pending.shift()!([{ ...chapter, id: 11 }]); await late;
  assert.equal(h.store.getSnapshot(), previous);
});

test('failed chapter decisions preserve the pending state and are never automatically retried', async t => {
  let decisions = 0;
  const h = harness({ decideChapter: async () => { decisions++; throw new ApiError(409, 'По этой главе уже принято решение'); } });
  t.after(() => h.store.stop());
  h.store.start(); await tick(); await h.store.loadChapters('server-7');
  await assert.rejects(h.store.decideChapter('server-7', 10, 'accepted'), { status: 409 });
  await tick();
  assert.equal(decisions, 1);
  assert.equal(h.store.getSnapshot().chapters['server-7']?.cards[0].status, 'pending');
});

test('chapter markers follow acceptance time and partial history, with one first chapter for old and new chats', () => {
  const localChat: Chat = { id: 'server-7', createdAt: created, name: 'Мира', initial: 'М', online: false, unread: 0 };
  const rejected = { ...chapter, id: 12, status: 'rejected' as const };
  const starts = chapterBoundaries(localChat, [chapter, rejected, acceptedChapter]);
  assert.deepEqual(starts.map(boundary => boundary.title), ['Первое знакомство', 'Чуть ближе']);
  const before: Message = { id: 'before', chatId: localChat.id, text: 'до', own: false, time: '', createdAt: '2026-11-03T12:00:00Z' };
  const after: Message = { ...before, id: 'after', text: 'после', createdAt: '2026-11-05T12:00:00Z' };
  const markers = placeChapterBoundaries(starts, [before, after], false);
  assert.equal(markers.get('after')?.[0].id, 'chapter-10');
  assert.equal(markers.get('before')?.[0].id, 'initial-server-7');
  assert.equal(placeChapterBoundaries(starts, [after], true).size, 0);
  const first = { ...acceptedChapter, id: 1, title: 'Первое знакомство', started_at: created, created_at: created };
  assert.equal(chapterBoundaries(localChat, [first, acceptedChapter]).length, 2);
});

test('jumping to a chapter walks backward through server history and stops at the chapter start', async t => {
  const page = Array.from({ length: 50 }, (_, i) => ({
    id: i + 51, chat_id: 7, sender_id: 3, text: String(i), created_at: '2026-11-06T12:00:00Z',
    is_read: true, is_edited: false, reply_to_id: null,
  }));
  const cursors: (number | undefined)[] = [];
  const h = harness({ messages: async (_id, before) => {
    cursors.push(before);
    return before ? [{ ...page[0], id: 1, created_at: '2026-11-03T12:00:00Z' }] : page;
  } });
  t.after(() => h.store.stop());
  h.store.start(); await tick(); h.store.selectChat('server-7');
  assert.equal(await h.store.loadChapterStart('server-7', accepted, new AbortController().signal), true);
  assert.deepEqual(cursors, [undefined, 51]);
  assert.equal(h.store.getSnapshot().state.messages.length, 51);
});

test('a chapter ends at the next accepted start, excluding proposals and rejections and retaining zero full minutes', () => {
  const localChat: Chat = { id: 'server-7', createdAt: created, name: 'Мира', initial: 'М', online: false, unread: 0 };
  const next = { ...acceptedChapter, id: 11, created_at: created, started_at: '2026-11-04T12:00:59Z' };
  const rejected = { ...chapter, id: 12, status: 'rejected' as const };
  const boundaries = chapterBoundaries(localChat, [chapter, next, rejected, acceptedChapter]);
  const durations = completedChapterMinutes(boundaries);
  assert.equal(durations.get('initial-server-7'), 4320);
  assert.equal(durations.get('chapter-10'), 0);
  assert.equal(durations.has('chapter-11'), false);
  assert.equal(durations.has('chapter-12'), false);
  assert.equal(durations.size, 2);
});

test('chapter history includes its start and excludes the next chapter start for both initial and ongoing chapters', () => {
  const chat: Chat = { id: 'server-7', createdAt: created, name: 'Мира', initial: 'М', online: false, unread: 0 };
  const starts = chapterBoundaries(chat, [chapter, { ...chapter, id: 12, status: 'rejected' }, acceptedChapter]);
  const rows = [
    { id: 'before-chat', created: '2026-10-31T23:59:59Z' },
    { id: 'initial-start', created },
    { id: 'initial-last', created: '2026-11-04T11:59:59Z' },
    { id: 'next-start', created: accepted },
    { id: 'latest', created: '2026-11-20T00:00:00Z' },
    { id: 'unknown-date', created: undefined },
  ];
  assert.deepEqual(recordsInChapter(rows, row => row.created, chapterWindow(starts, 'initial-server-7')).map(row => row.id), ['initial-start', 'initial-last']);
  assert.deepEqual(recordsInChapter(rows, row => row.created, chapterWindow(starts, 'chapter-10')).map(row => row.id), ['next-start', 'latest']);
  assert.deepEqual(recordsInChapter(rows, row => row.created, chapterWindow(starts, 'chapter-12')), []);
});

test('chapter history uses record creation time, independent of future opening, archived state and source message time', () => {
  const starts = [
    { id: 'first', title: 'Первая', startedAt: '2026-11-01T00:00:00Z' },
    { id: 'second', title: 'Вторая', startedAt: '2026-11-05T00:00:00Z' },
  ];
  const question = { created_at: '2026-11-02T00:00:00Z', opens_at: '2026-12-01T00:00:00Z', archived: true };
  assert.deepEqual(recordsInChapter([question], row => row.created_at, chapterWindow(starts, 'first')), [question]);
  assert.deepEqual(recordsInChapter([question], row => row.created_at, chapterWindow(starts, 'second')), []);
  const moment = { createdAt: '2026-11-06T00:00:00Z', messageCreatedAt: '2026-11-02T00:00:00Z' };
  assert.deepEqual(recordsInChapter([moment], row => row.createdAt, chapterWindow(starts, 'second')), [moment]);
  assert.equal(chapterWindow([{ id: 'bad', title: 'Ошибка', startedAt: 'invalid' }], 'bad'), null);
  const simultaneous = [{ ...starts[0], startedAt: starts[1].startedAt }, starts[1]];
  assert.deepEqual(recordsInChapter([moment], row => row.createdAt, chapterWindow(simultaneous, 'first')), []);
});
