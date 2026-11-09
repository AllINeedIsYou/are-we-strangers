import test from 'node:test';
import assert from 'node:assert/strict';
import { canRequestUsers, findOwnChats, searchKind, usesGlobalSearch } from '../src/userSearch.ts';
import type { Chat } from '../src/domain.ts';

const chats: Chat[] = [
  { id: '1', partnerId: 2, name: 'Александр Парус', username: '@AllINeedIsYou', initial: 'А', online: false, unread: 0 },
  { id: '2', partnerId: 3, name: 'Нео · тест', username: '@neo', initial: 'Н', online: false, unread: 0 },
];
test('names search only existing dialogs, ignoring name case and repeated spaces', () => {
  assert.deepEqual(findOwnChats(chats, '  александр   парус ').map(chat => chat.id), ['1']);
  assert.equal(usesGlobalSearch('Александр Парус'), false);
  assert.equal(canRequestUsers('Александр'), false);
  assert.deepEqual(findOwnChats(chats, 'Неизвестный человек'), []);
  assert.deepEqual(findOwnChats(chats, 'neo'), []);
});
test('username queries enable global search and match existing usernames by case-sensitive prefix', () => {
  assert.equal(usesGlobalSearch('@ne'), true);
  assert.equal(canRequestUsers('@ne'), true);
  assert.deepEqual(findOwnChats(chats, '@ne').map(chat => chat.id), ['2']);
  assert.deepEqual(findOwnChats(chats, '@Neo'), []);
  assert.equal(canRequestUsers('@'), false);
  assert.equal(usesGlobalSearch('@'), true);
});
test('phone results identify existing chats by partner ID even when public profiles omit phone', () => {
  assert.equal(searchKind('+7 (999) 000-00-01'), 'phone');
  assert.equal(usesGlobalSearch('+79990000001'), true);
  assert.deepEqual(findOwnChats(chats, '+79990000001', [{ id: 3 }]).map(chat => chat.id), ['2']);
  assert.deepEqual(findOwnChats(chats, '+79990000001', [{ id: 99 }]), []);
  const local = [{ ...chats[1], phone: 'tel:+7-999-000-00-01' }];
  assert.deepEqual(findOwnChats(local, '+7 (999) 000-00-01').map(chat => chat.id), ['2']);
});
test('empty input lists own chats and email does not trigger global search', () => {
  assert.deepEqual(findOwnChats(chats, '   '), chats);
  assert.equal(usesGlobalSearch('alex@example.com'), false);
  assert.equal(canRequestUsers(''), false);
});
