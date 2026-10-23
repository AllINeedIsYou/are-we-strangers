import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptChapter, canPulse, editMessage, forwardMessages, initialState, nextShimmerDelay, removeMessages, restoreMessages, restoreState, saveMoment } from '../src/domain.ts';
import { chooseRecordingMime, formatDuration, recordingError, stopMediaTracks } from '../src/recording.ts';
import { fileKind } from '../src/mediaStore.ts';

test('starting a chapter preserves every previous message, adds one divider, and requires pending consent', () => {
  const state = initialState();
  state.chapters.push({ id: 'test', chatId: 'mira', title: 'Чуть ближе', status: 'pending' });
  const next = acceptChapter(state, 'test');
  assert.deepEqual(next.messages.slice(0, state.messages.length), state.messages);
  assert.equal(next.messages.length, state.messages.length + 1);
  assert.equal(next.chapters[0].status, 'accepted');
  assert.equal(next.messages.at(-1)?.kind, 'chapter');
  assert.equal(acceptChapter(next, 'test'), next);
});
test('notification burst is coalesced without extending the cooldown', () => {
  assert.equal(canPulse(0, null), true);
  assert.equal(canPulse(100, 0), false);
  assert.equal(canPulse(2_499, 0), false);
  assert.equal(canPulse(2_500, 0), true);
});
test('corrupt browser data cannot break the demo', () => {
  for (const raw of ['invalid', '{}', 'null', '{"messages":[]}']) assert.deepEqual(restoreState(raw), initialState());
  const bad = initialState();
  (bad.chats[0] as unknown as {name: number}).name = 4;
  assert.deepEqual(restoreState(JSON.stringify(bad)), initialState());
  const valid = initialState();
  assert.deepEqual(restoreState(JSON.stringify(valid)), valid);
});
test('only own messages can be edited and edits preserve reply, pin and original time', () => {
  const state = initialState();
  const own = state.messages[0];
  own.pinned = true;
  own.replyTo = { id: 'old', text: 'Привет', author: 'Мира' };
  assert.equal(editMessage(state, state.messages[1].id, 'changed'), state);
  assert.equal(editMessage(state, own.id, '   '), state);
  const edited = editMessage(state, own.id, '  Новый текст  ').messages[0];
  assert.equal(edited.text, 'Новый текст');
  assert.equal(edited.edited, true);
  assert.equal(edited.time, own.time);
  assert.deepEqual(edited.replyTo, own.replyTo);
  assert.equal(edited.pinned, true);
});
test('forwarding keeps authorship and chronological selection order, without copying pins or reply links', () => {
  const state = initialState();
  state.messages[0].pinned = true;
  state.messages[0].replyTo = { id: 'old', text: 'Привет', author: 'Мира' };
  const forwarded = forwardMessages(state, [state.messages[1].id, state.messages[0].id], 'danya', 'Алекс');
  const items = forwarded.messages.slice(state.messages.length);
  assert.equal(items.length, 2);
  assert.equal(items[0].text, state.messages[0].text);
  assert.equal(items[0].forwardedFrom, 'Алекс');
  assert.equal(items[1].forwardedFrom, 'Мира');
  assert.ok(items.every(item => item.own && item.chatId === 'danya' && !item.pinned && !item.replyTo));
  const twice = forwardMessages(forwarded, [items[1].id], 'sasha', 'Алекс');
  assert.equal(twice.messages.at(-1)?.forwardedFrom, 'Мира');
  assert.equal(forwardMessages(state, [state.messages[0].id], 'nonexistent', 'Алекс'), state);
});
test('deletion can be undone in original order, including after a new message arrives', () => {
  const original = initialState();
  const result = removeMessages(original, [original.messages[0].id, original.messages[4].id]);
  assert.equal(result.state.messages.length, original.messages.length - 2);
  const appended = { id: 'new', chatId: 'mira', text: 'Ещё сообщение', own: true, time: '23:00' };
  result.state.messages.push(appended);
  const restored = restoreMessages(result.state, result.removed);
  assert.deepEqual(restored.messages, [...original.messages, appended]);
  assert.deepEqual(restoreMessages(restored, result.removed).messages, restored.messages);
});
test('a moment keeps several media messages in conversation order and survives source deletion', () => {
  const state = initialState();
  state.messages[0].media = [{ id: 'photo', kind: 'photo', name: 'photo.png', mime: 'image/png', size: 25 }];
  state.messages[1].media = [{ id: 'voice', kind: 'voice', name: 'voice.webm', mime: 'audio/webm', size: 60, duration: 3 }];
  const next = saveMoment(state, 'mira', [state.messages[1].id, state.messages[0].id, state.messages[1].id], 'Момент знакомства');
  assert.equal(next.moments.length, 1);
  assert.equal(next.moments[0].messages?.length, 2);
  assert.equal(next.moments[0].messages?.[0].id, state.messages[0].id);
  state.messages[0].media[0].name = 'changed';
  assert.equal(next.moments[0].messages?.[0].media?.[0].name, 'photo.png');
  const deleted = removeMessages(next, next.moments[0].messages!.map(item => item.id), 'everyone');
  assert.equal(deleted.state.moments[0].messages?.[1].media?.[0].id, 'voice');
  assert.equal(deleted.state.deletions?.at(-1)?.scope, 'everyone');
  assert.equal(restoreMessages(deleted.state, deleted.removed).deletions?.length, 0);
  assert.equal(saveMoment(state, 'danya', [state.messages[0].id], 'why'), state);
});
test('forwarded media retains the local asset reference but not the source metadata object', () => {
  const state = initialState();
  state.messages[0].media = [{ id: 'circle', kind: 'circle', name: 'circle.mp4', mime: 'video/mp4', size: 50, duration: 10 }];
  const forwarded = forwardMessages(state, [state.messages[0].id], 'sasha', 'Алекс').messages.at(-1)!;
  assert.equal(forwarded.media?.[0].id, 'circle');
  assert.notEqual(forwarded.media?.[0], state.messages[0].media[0]);
});
test('star breathing cycle stays at three seconds', () => {
  assert.equal(nextShimmerDelay(0), 3000);
  assert.equal(nextShimmerDelay(.5), 3000);
  assert.equal(nextShimmerDelay(1), 3000);
});
test('recording negotiates browser formats and releases every device track', () => {
  assert.equal(chooseRecordingMime('circle', mime => mime === 'video/mp4'), 'video/mp4');
  assert.equal(chooseRecordingMime('voice', mime => mime === 'audio/webm'), 'audio/webm');
  assert.equal(chooseRecordingMime('voice', () => false), undefined);
  let stopped = 0;
  stopMediaTracks({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] as MediaStreamTrack[] });
  assert.equal(stopped, 2);
  stopMediaTracks(null);
  const denied = new Error('denied'); denied.name = 'NotAllowedError';
  assert.match(recordingError(denied), /Нет доступа/);
  assert.equal(formatDuration(61), '1:01');
  assert.equal(fileKind('image/png'), 'photo');
  assert.equal(fileKind('audio/mp4'), 'voice');
  assert.equal(fileKind('image/svg+xml'), 'file');
});
